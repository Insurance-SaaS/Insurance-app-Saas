# Go-live runbook

How to bring the backend up in a new environment, deploy a new version, and take one back. Commands are given as they run inside the deployed image; from a source checkout use `npm run migrate -- ...` and `npm run platform-admin -- ...` instead.

## 1. Before the first deployment

1. **Secrets.** Generate each of these separately and store them in the platform's secret store, never in the repository:
   - `JWT_SECRET_KEY`, `JWT_SECRET_KEY_REFRESH`, `JWT_PLATFORM_SECRET`: three different values, at least 32 characters.
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `TENANT_DB_ENCRYPTION_KEY`: 64 hexadecimal characters.
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
     Back this key up. Without it the stored tenant database passwords cannot be read, and every tenant would have to be given its password again.
2. **Services.** A platform database (PostgreSQL, MySQL, MariaDB, Oracle or SQL Server), Redis, and S3-compatible object storage. Use TLS for each (`DB_SSL`, `REDIS_TLS`, `MINIO_USE_SSL`).
3. **Environment.** Set everything listed in `.env.example`. In production the application refuses to start, and lists the reasons, if the database, Redis, object storage, email or secret settings are missing or weak. Also set:
   - `NODE_ENV=production`
   - `TRUST_PROXY` to the number of reverse proxies in front of the application (1 on Fly.io). Without it rate limiting counts every client as one.
   - `CORS_ORIGINS` if a browser application calls the API. Mobile apps do not need it.
   - `DB_AUTO_MIGRATE=false`. Migrations run as a deployment step (below), not at startup.
4. **Email** must work: sign-up and password reset send their codes by email. SMS, Google sign-in, push notifications and the AI assistant are optional and are reported as switched off in the startup log when not configured.

## 2. First deployment

```bash
node dist/cli/migrate.js platform                              # creates the platform schema
node dist/cli/platform-admin.js create ops@your-company.com "Operations"
#   asks for the password, or reads PLATFORM_ADMIN_PASSWORD; at least 12 characters
```

Start the application and check:

```bash
curl https://<host>/health          # {"status":"ok",...}
curl https://<host>/health/ready    # {"status":"ok","checks":{"database":"ok","redis":"ok"}}
```

Then sign in as the platform administrator (`POST /api/v1/platform/admin-auth/login`) and onboard the first tenant (`POST /api/v1/platform/tenants/onboard`). The request body is described in [BACKEND_APP_GUIDE.md](../docs/BACKEND_APP_GUIDE.md#4-tenant-onboarding).

- Onboarding can be repeated. If it stops half-way (database unreachable, missing privileges), fix the cause and send the same request again; it continues after the last completed step. The tenant only becomes active at the end.
- A tenant on Oracle, or on any server the platform cannot create databases on, brings its own empty database: pass its connection details in the request.

## 3. Deploying a new version

Each deployment, in this order:

```bash
node dist/cli/migrate.js platform
node dist/cli/migrate.js tenants
```

On Fly.io this is the `release_command` in `fly.toml` and runs by itself; a failure aborts the deployment and the old version keeps serving.

- Both commands are safe to run again. A tenant whose migration failed is reported and the others still run; the exit code is non-zero if any database failed or still differs from the expected schema.
- `node dist/cli/migrate.js status` shows the version of every database and changes nothing. Run it before and after.
- Two deployments cannot migrate the same tenant at once: each run takes a lease on the tenant.
- Take a backup of the platform database and of each tenant database before a deployment that contains migrations. MySQL, MariaDB and Oracle cannot roll back a schema change that failed half-way; the migrations are written so that running them again completes the change.

After the new version is up:

```bash
curl https://<host>/health/ready
node dist/cli/migrate.js status     # every line "checked", no "missing:" lines
```

and, with a real account of one tenant: log in, list claims, open one claim document link.

## 4. Taking a version back

1. Redeploy the previous image. An older version keeps working against a newer schema as long as the newer migrations only added columns, tables or indexes.
2. If a migration must be undone for a tenant, as a platform administrator:
   `POST /api/v1/platform/tenants/<slug>/migrations/revert` with `{ "toVersion": "<migration name to return to>" }`.
   `GET /api/v1/platform/tenants/<slug>/schema` shows the current version and any difference from the expected schema.
3. Restore from backup only if data was damaged. Restoring a tenant database does not affect other tenants.

## 5. Routine operations

| Task | How |
|---|---|
| Add a platform administrator | `node dist/cli/platform-admin.js create <email> [name]` |
| Remove one | `node dist/cli/platform-admin.js deactivate <email>`. Takes effect immediately, including for tokens already issued |
| Forgotten platform password | `node dist/cli/platform-admin.js set-password <email>` |
| Enable or disable a module for a tenant | `PUT /api/v1/platform/tenants/<tenantId>/components` |
| Change a tenant's database connection | `PATCH /api/v1/platform/tenants/<tenantId>`. The password is stored encrypted and never returned |
| More or less logging | `LOG_LEVEL` = `error`, `warn`, `log` (default in production), `debug`, `verbose` |

## 6. What to watch

| Signal | Meaning |
|---|---|
| `/health/ready` returns 503 | The platform database or Redis is not answering. The body says which |
| Log: `Rate limiting is not being applied` | Redis is unreachable; requests are served without rate limits until it returns |
| Log: `Redis is unreachable` | Logins, OTP codes and token refresh will fail until it returns |
| Log: `Tenant mismatch` | A token of one tenant was sent with another tenant's header. A few are client bugs; many are worth a look |
| Many 401 on `/platform/admin-auth/login` | Someone is guessing platform administrator passwords |
| Log: `Geocoding unavailable` | Address checks are being skipped; claims are accepted with the address as typed |
| HTTP 503 from `/claims/declare` | Object storage is down. Nothing is saved; the user can retry |
| HTTP 429 / 503 from `/ai/*` with a `code` | The model provider is rate limiting, out of quota or down (`code` says which) |

## 7. Before the first real tenant

These are outside what the test suite can show:

- Build the image and run it with production settings against staging services, then go through one full journey with the mobile app: sign-up, email code, login, claim with a photo, admin status change, notification.
- Run the `backend-db-matrix` workflow and confirm it is green for the engine of each tenant you plan to onboard. Oracle, SQL Server and MySQL are verified there, not on developer machines.
- Confirm backups of the platform database, tenant databases and object storage, and that one restore has been tried.
