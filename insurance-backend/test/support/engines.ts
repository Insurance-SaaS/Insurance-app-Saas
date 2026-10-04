import { DataSource } from 'typeorm';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DatabaseEngine, getDialect } from '../../src/core/database/dialects'; // relative: Jest's global setup does not apply path aliases

/** How to reach a database server started for the tests, with an administrative login. */
export interface TestServer {
  engine: DatabaseEngine;
  host: string;
  port: number;
  adminUser: string;
  adminPassword: string;
  /** A database the admin can always connect to (Oracle: the service name). */
  adminDatabase: string;
}

/** Connection details for one database on a test server. */
export interface TestDatabase {
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

const PASSWORD = 'Test_passw0rd';

const IMAGES: Record<DatabaseEngine, string> = {
  postgres: 'postgres:16-alpine',
  mariadb: 'mariadb:11',
  mysql: 'mysql:8.4',
  mssql: 'mcr.microsoft.com/mssql/server:2022-latest',
  oracle: 'gvenzl/oracle-free:23-slim-faststart',
};

/** Starts a throwaway server of the given engine. Requires a running Docker daemon. */
export async function startServer(
  engine: DatabaseEngine,
): Promise<{ container: StartedTestContainer; server: TestServer }> {
  const dialect = getDialect(engine);
  let definition = new GenericContainer(IMAGES[engine]).withExposedPorts(dialect.defaultPort);
  let adminUser: string;
  let adminDatabase: string;

  switch (engine) {
    case 'postgres':
      adminUser = 'test';
      adminDatabase = 'postgres';
      definition = definition
        .withEnvironment({ POSTGRES_USER: adminUser, POSTGRES_PASSWORD: PASSWORD })
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2));
      break;
    case 'mariadb':
    case 'mysql':
      adminUser = 'root';
      adminDatabase = 'mysql';
      definition = definition
        .withEnvironment({ MARIADB_ROOT_PASSWORD: PASSWORD, MYSQL_ROOT_PASSWORD: PASSWORD })
        // The temporary bootstrap server reports "port: 0"; the real one reports 3306.
        .withWaitStrategy(Wait.forLogMessage(/port: 3306\s/));
      break;
    case 'mssql':
      adminUser = 'sa';
      adminDatabase = 'master';
      definition = definition
        .withEnvironment({ ACCEPT_EULA: 'Y', MSSQL_SA_PASSWORD: PASSWORD })
        .withWaitStrategy(Wait.forLogMessage(/SQL Server is now ready for client connections/));
      break;
    case 'oracle':
      adminUser = 'system';
      adminDatabase = 'FREEPDB1';
      definition = definition
        .withEnvironment({ ORACLE_PASSWORD: PASSWORD })
        .withWaitStrategy(Wait.forLogMessage(/DATABASE IS READY TO USE!/))
        .withStartupTimeout(300_000);
      break;
  }

  const container = await definition.start();
  return {
    container,
    server: {
      engine,
      host: container.getHost(),
      port: container.getMappedPort(dialect.defaultPort),
      adminUser,
      adminPassword: PASSWORD,
      adminDatabase,
    },
  };
}

async function openAdmin(server: TestServer): Promise<DataSource> {
  const options = getDialect(server.engine).connectionOptions(
    {
      host: server.host,
      port: server.port,
      username: server.adminUser,
      password: server.adminPassword,
      database: server.adminDatabase,
      options: { trustServerCertificate: true },
    },
    1,
  );
  // The server may accept connections a moment after its "ready" log line.
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      return await new DataSource(options).initialize();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

/**
 * Creates an empty database for a test (idempotent). On Oracle, where a
 * "database" for a tenant is a schema, this creates a user that owns one.
 */
export async function createDatabase(server: TestServer, name: string): Promise<TestDatabase> {
  const dialect = getDialect(server.engine);
  const admin = await openAdmin(server);
  try {
    if (server.engine === 'oracle') {
      const user = name.toUpperCase();
      const existing = await admin.query('SELECT 1 FROM all_users WHERE username = :1', [user]);
      if (existing.length === 0) {
        await admin.query(`CREATE USER ${user} IDENTIFIED BY "${PASSWORD}"`);
        await admin.query(`GRANT CONNECT, RESOURCE, UNLIMITED TABLESPACE TO ${user}`);
      }
      return {
        engine: server.engine,
        host: server.host,
        port: server.port,
        username: user,
        password: PASSWORD,
        database: server.adminDatabase,
      };
    }

    if (!(await dialect.databaseExists(admin, name))) {
      await dialect.createDatabase(admin, name);
    }
    return {
      engine: server.engine,
      host: server.host,
      port: server.port,
      username: server.adminUser,
      password: server.adminPassword,
      database: name,
    };
  } finally {
    await admin.destroy();
  }
}

/** The servers started by global-setup, as published through the environment. */
export function testServers(): Record<string, TestServer> {
  return JSON.parse(process.env.TEST_DB_SERVERS ?? '{}');
}
