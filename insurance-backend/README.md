# Insurance platform backend

Multi-tenant API for insurers: claims, quotes, payments, branches, notifications, an AI assistant and an ERP bridge. Each insurer (tenant) has its own database; one running backend serves all of them.

- NestJS 11 on Fastify, TypeORM, Redis, S3-compatible object storage (MinIO).
- The platform database and every tenant database can each be PostgreSQL, MySQL, MariaDB, Oracle or SQL Server. PostgreSQL and MariaDB are tested against real servers on every change; the others are covered by the `backend-db-matrix` workflow.

This page is the developer reference. For the overview of the platform, its architecture and its security model, start with the [repository README](../README.md).

Guides: [building an app on this backend](../docs/BACKEND_APP_GUIDE.md), [Flutter integration](../docs/FLUTTER_INTEGRATION_GUIDE.md), [going live](GO_LIVE_RUNBOOK.md).

## Run it locally

You need Node 20, and PostgreSQL (or another supported engine), Redis and MinIO reachable from your machine.

```bash
npm ci
cp .env.example .env        # then fill in the values; the comments explain each one
npm run migrate -- platform # creates the platform schema
npm run platform-admin -- create you@example.com "Your Name"   # asks for a password
npm run start:dev
```

The API is served under `http://localhost:3000/api/v1`, with Swagger at `http://localhost:3000/api` (not served in production).

The application checks its environment when it starts and stops with the full list of what is missing or malformed. Optional integrations (AI assistant, SMS, Google sign-in, push notifications) are switched off, with a warning, when their settings are absent.

Next step: sign in as the platform administrator and onboard a tenant. See [Tenant onboarding](../docs/BACKEND_APP_GUIDE.md#4-tenant-onboarding).

## Commands

| Command | What it does |
|---|---|
| `npm run start:dev` | Run with reload on change |
| `npm run build` then `npm run start:prod` | Run the compiled application (`node dist/main`) |
| `npm run lint:check` / `npm run typecheck` | Static checks, as CI runs them |
| `npm test` | Unit tests |
| `npm run test:e2e` | Integration tests. Starts PostgreSQL, MariaDB and Redis in Docker by itself |
| `npm run lint:sonar` | SonarSource's TypeScript rules, locally (the same analyser SonarQube runs) |
| `npm run test:cov:all` | Unit and integration tests with coverage reports under `coverage/` |
| `npm run migrate -- platform` | Set up or upgrade the platform database |
| `npm run migrate -- tenants [slug...]` | Set up or upgrade tenant databases (all active tenants by default) |
| `npm run migrate -- status` | Show the version of every database and any difference from the expected schema; changes nothing |
| `npm run platform-admin -- create <email> [name]` | Create a platform administrator. Also: `set-password`, `deactivate`, `activate`, `list` |

In a deployed image use the compiled variants: `npm run migrate:prod -- ...` and `npm run platform-admin:prod -- ...`.

To run the integration tests on other engines: `TEST_PLATFORM_ENGINE=mysql TEST_SECOND_ENGINE=oracle npm run test:e2e` (values: `postgres`, `mysql`, `mariadb`, `oracle`, `mssql`). The Oracle and SQL Server images are large; CI runs them for you.

## How it is organised

| Path | Contents |
|---|---|
| `src/core/tenant` | Tenant registry, tenant resolution from the `X-Tenant-ID` header, onboarding |
| `src/core/database` | One data source per tenant, engine dialects, schema setup and migrations |
| `src/core/plugin-registry` | Which modules are enabled for which tenant |
| `src/core/platform-admin` | Platform administrators (separate accounts, separate token secret) |
| `src/auth` | Tenant users: sign-up, OTP, login, tokens, roles |
| `src/modules/*` | Business modules: claims, quotes, payment, branches, notifications, users, ai, logging |
| `src/integrations/*` | ERP, email, SMS |
| `src/database/migrations` | Schema migrations, one set for the platform database and one for tenant databases |
| `src/cli` | The `migrate` and `platform-admin` commands |
| `test` | Integration tests and their harness |

Rules the code relies on:

- **Every route requires a token** unless it is marked `@Public()`. Platform routes use `@PlatformAuth()`; admin-only tenant routes use `@Roles(UserRole.TENANT_ADMIN)`.
- **Every tenant route requires `X-Tenant-ID`.** Code reaches tenant data only through `TenantRepositoryFactory`, which fails without a tenant instead of falling back to another database.
- **Entities use the portable column helpers** in `src/shared/decorators/portable-column.decorator.ts`, never engine-specific types. A test fails if one slips in.
- **The schema changes only through migrations** written with `SchemaKit`, which run unchanged on every engine and can be re-run after a partial failure. `synchronize` is off everywhere.

## Static analysis with SonarQube

`sonar-project.properties` describes the project. To analyse it on a SonarQube server:

```bash
npm run test:cov:all
SONAR_TOKEN=<token> npx @sonar/scan -Dsonar.host.url=<server url>
```

`npm run lint:sonar` runs the same TypeScript rules without a server; it is the quick loop while fixing findings. It is not part of CI yet: four long functions of the AI assistant (`src/modules/ai/ai-openai.service.ts`) exceed the complexity limit and are waiting for that service to be split.

SonarQube's search index needs at least 5% of the disk free. On a nearly full machine the server restarts in a loop; a temporary instance with its data in memory works regardless:

```bash
docker run -d --name sonarqube-scan -p 127.0.0.1:9100:9000 \
  --tmpfs /opt/sonarqube/data:rw,exec,size=4g,uid=1000,gid=0,mode=0770 \
  --tmpfs /opt/sonarqube/temp:rw,exec,size=1g,uid=1000,gid=0,mode=0770 \
  --tmpfs /opt/sonarqube/logs:rw,size=256m,uid=1000,gid=0,mode=0770 \
  sonarqube:community
```

Everything in it, results included, is gone when the container is removed.

## Changing the schema

1. Change the entity.
2. Add a migration under `src/database/migrations/tenant` (or `platform`) that uses `SchemaKit` to bring existing databases to the new shape, and register it in `src/database/migrations/index.ts`.
3. Run `npm run test:e2e`. The engine tests take a database back to the baseline, forward again, and require the result to match the entities exactly.

New tenant databases are created directly from the entities and stamped with the newest migration; existing ones run what is pending.

## Deployment

The `Dockerfile` builds an image that contains the compiled code and production dependencies only, and runs as an unprivileged user. `fly.toml` runs the migrations as a release step before a new version takes traffic.

- `GET /health` answers as long as the process is up.
- `GET /health/ready` answers `200` only while the platform database and Redis respond; use it for load-balancer checks.

See [GO_LIVE_RUNBOOK.md](GO_LIVE_RUNBOOK.md) for the full procedure.
