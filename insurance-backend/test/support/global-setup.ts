import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { createDatabase, startServer, TestServer } from './engines';

/**
 * Starts the database servers and Redis for the whole integration run and
 * points the application at them through environment variables.
 *
 *   TEST_PLATFORM_ENGINE  engine of the platform database and of tenant "alpha" (default postgres)
 *   TEST_SECOND_ENGINE    engine of tenant "beta" (default mariadb)
 *
 * With two different engines, every suite exercises a mixed-engine deployment:
 * the same application process serving tenants on different databases.
 * Requires a running Docker daemon.
 */
export default async function globalSetup(): Promise<void> {
  const platformEngine = (process.env.TEST_PLATFORM_ENGINE ?? 'postgres') as TestServer['engine'];
  const secondEngine = (process.env.TEST_SECOND_ENGINE ?? 'mariadb') as TestServer['engine'];

  const containers: StartedTestContainer[] = [];
  const servers: Record<string, TestServer> = {};
  for (const engine of new Set([platformEngine, secondEngine])) {
    const started = await startServer(engine);
    containers.push(started.container);
    servers[engine] = started.server;
  }

  const redis = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  containers.push(redis);
  (globalThis as any).__TEST_CONTAINERS__ = containers;

  const platform = await createDatabase(servers[platformEngine], 'platform');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    // Same as production (see src/utc.ts); inherited by the Jest workers.
    TZ: 'UTC',
    TEST_PLATFORM_ENGINE: platformEngine,
    TEST_SECOND_ENGINE: secondEngine,
    TEST_DB_SERVERS: JSON.stringify(servers),
    DB_TYPE: platform.engine,
    DB_HOST: platform.host,
    DB_PORT: String(platform.port),
    DB_USER: platform.username,
    DB_PASSWORD: platform.password,
    DB_NAME: platform.database,
    MSSQL_TRUST_CERT: 'true',
    // Brings the platform database to the current schema at startup, through SchemaManager.
    DB_AUTO_MIGRATE: 'true',
    REDIS_HOST: redis.getHost(),
    REDIS_PORT: String(redis.getMappedPort(6379)),
    JWT_SECRET_KEY: 'test-access-secret',
    JWT_SECRET_KEY_REFRESH: 'test-refresh-secret',
    JWT_PLATFORM_SECRET: 'test-platform-secret',
    TENANT_DB_ENCRYPTION_KEY: '0'.repeat(64),
    // External services are never called in tests; the clients only need to construct.
    MINIO_ENDPOINT: 'localhost',
    MINIO_PORT: '9000',
    MINIO_ACCESS_KEY: 'test-access-key',
    MINIO_SECRET_KEY: 'test-secret-key',
    OPENAI_API_KEY: 'test',
  });
}
