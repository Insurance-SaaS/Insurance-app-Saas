# Building an Insurance App with @insurance Plugins — Complete Guide

> This guide walks you through creating a new insurance application from scratch, using the `@insurance-app-saas/plugin-sdk` and the insurance backend platform.

---

> **Status of this guide (October 2026).** Sections 3, 4 and 9 (setup, onboarding, deployment) describe the current backend. Sections 5 to 7 predate the security and reliability work; where they disagree with the "Backend API changes" table at the top of [FLUTTER_INTEGRATION_GUIDE.md](FLUTTER_INTEGRATION_GUIDE.md), that table is correct. Section 8 describes external plugins, which are **not loaded by the backend at present**: the plugin SDK is parked until there is a first real external plugin (see `packages/plugin-sdk/PLUGIN_AUTHORING_GUIDE.md`). The built-in modules and their per-tenant switches are unaffected.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Setting Up the Backend](#3-setting-up-the-backend)
4. [Tenant Onboarding](#4-tenant-onboarding)
5. [Authentication Flow](#5-authentication-flow)
6. [Using the Plugins](#6-using-the-plugins)
7. [API Reference](#7-api-reference)
8. [Creating Custom Plugins](#8-creating-custom-plugins)
9. [Production Deployment](#9-production-deployment)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Mobile / Web App                       │
│               (Flutter, React, Angular…)                 │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + x-tenant-id header
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 NestJS Backend (Fastify)                  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐ │
│  │   Auth     │ │  Claims   │ │  Quotes   │ │ Payment │ │
│  │  (core)    │ │ (plugin)  │ │ (plugin)  │ │(plugin) │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌─────────┐ │
│  │ Branches  │ │  Notifs   │ │    AI     │ │  ERP    │ │
│  │ (plugin)  │ │ (plugin)  │ │ (plugin)  │ │(plugin) │ │
│  └───────────┘ └───────────┘ └───────────┘ └─────────┘ │
│                                                          │
│  Middleware: TenantMiddleware → DataSourceMiddleware →    │
│              PluginResolutionMiddleware                   │
└──────┬──────────┬──────────┬────────────────────────────┘
       │          │          │
       ▼          ▼          ▼
   PostgreSQL   Redis     MinIO
   (per-tenant)  (cache)  (files)
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Tenant** | An insurance company (e.g. "CAAR", "SAA"). Each tenant gets its own database. |
| **Plugin** | A feature module (claims, quotes, payment…). Can be enabled/disabled per tenant. |
| **x-tenant-id** | HTTP header sent on every request to identify which tenant the call is for. |
| **Platform Admin** | Super-admin who manages tenants and their configurations. |
| **Tenant Admin** | Admin within a specific tenant (manages users, claims, etc.). |

---

## 2. Prerequisites

### Software

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 18 | Runtime |
| PostgreSQL | ≥ 14 | Platform + tenant databases |
| Redis | ≥ 6 | OTP, caching, sessions |
| MinIO | latest | File/document storage |
| Git | any | Source control |

### Install Services (Linux/Mac)

```bash
# PostgreSQL
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# Redis
sudo apt install redis-server
sudo systemctl start redis

# MinIO
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
./minio server ./data --console-address ":9001"
```

---

## 3. Setting Up the Backend

### 3.1 Clone the Repo

```bash
git clone git@github.com:Insurance-SaaS/Insurance-app-Saas.git
cd Insurance-app-Saas/insurance-backend
```

### 3.2 Install Dependencies

```bash
npm ci
```

### 3.3 Configure Environment

```bash
cp .env.example .env
```

`.env.example` lists every setting with a comment. The minimum for a local run:

```dotenv
NODE_ENV=development
PORT=3000

# Platform database: postgres, mysql, mariadb, oracle or mssql
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_user
DB_PASSWORD=your_password
DB_NAME=insurance_platform

REDIS_HOST=localhost
REDIS_PORT=6379

# Three different values
# node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET_KEY=...
JWT_SECRET_KEY_REFRESH=...
JWT_PLATFORM_SECRET=...

# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TENANT_DB_ENCRYPTION_KEY=<64 hex characters>

MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...

# Sign-up and password reset send their codes by email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

The application checks these when it starts and stops with the full list of what is missing or malformed. SMS, Google sign-in, push notifications and the AI assistant are optional; without their settings they are switched off and the startup log says so.

### 3.4 Create the Platform Database

Create an empty database, then let the backend create its schema:

```bash
psql -U postgres -c "CREATE DATABASE insurance_platform;"
npm run migrate -- platform
```

### 3.5 Start the Backend

```bash
npm run start:dev
```

The API starts at `http://localhost:3000/api/v1`. Swagger is at `http://localhost:3000/api` (not served in production).

---

## 4. Tenant Onboarding

Tenants are insurance companies that use your platform. Each gets its own isolated database.

### 4.1 Create a Platform Admin (one-time)

```bash
npm run platform-admin -- create admin@platform.com "Platform Admin"
```

The command asks for the password (at least 12 characters), or reads it from `PLATFORM_ADMIN_PASSWORD`. Platform administrators are separate accounts from tenant users and are managed only with this command (`create`, `set-password`, `deactivate`, `activate`, `list`).

### 4.2 Login as Platform Admin

```
POST /api/v1/platform/admin-auth/login
Content-Type: application/json

{
  "email": "admin@platform.com",
  "password": "<the password you chose>"
}
```

No `X-Tenant-ID` header on `/platform/*` routes. Response:
```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG..."
}
```

Platform tokens are signed with their own secret and are only accepted on `/platform/*`; a tenant user's token, whatever its role, is refused there. `POST /platform/admin-auth/refresh` exchanges the refresh token for a new pair (each refresh token works once), and `POST /platform/admin-auth/logout` ends the session.

### 4.3 Onboard a New Tenant (Full Setup)

One request registers the tenant, prepares its database, creates the tables, creates the tenant's first administrator and enables its modules.

**Managed database** (the platform creates `tenant_<slug>` on its own database server; available when the platform runs on PostgreSQL, MySQL, MariaDB or SQL Server):

```
POST /api/v1/platform/tenants/onboard
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "tenant": {
    "slug": "caar",
    "name": "CAAR Insurance"
  },
  "tenantAdmin": {
    "username": "caar_admin",
    "email": "admin@caar.dz",
    "password": "SecureP@ss1",
    "preferredLanguage": "fr"
  },
  "components": [
    { "componentName": "@insurance/claims" },
    { "componentName": "@insurance/quotes" },
    { "componentName": "@insurance/payment", "isEnabled": false }
  ]
}
```

**The tenant's own database** (any supported engine, on any server; required for Oracle). The database must exist and be empty; the connection is checked before anything is recorded:

```json
{
  "tenant": {
    "slug": "caar",
    "name": "CAAR Insurance",
    "databaseType": "oracle",
    "databaseHost": "db.caar.dz",
    "databasePort": 1521,
    "databaseName": "CAARPDB",
    "databaseUsername": "insurance_app",
    "databasePassword": "..."
  },
  "tenantAdmin": { "username": "caar_admin", "email": "admin@caar.dz", "password": "SecureP@ss1" }
}
```

Notes:
- `slug` may contain letters, digits, `-` and `_` (at most 63 characters) and is stored in lower case. It is the value clients send in `X-Tenant-ID`.
- Without `components`, every module is enabled. With a list, exactly the listed modules are enabled (those with `"isEnabled": false` are recorded as disabled).
- The database password is stored encrypted (AES-256-GCM) and is never returned by the API.
- The response reports `status: "active"`, the schema version and the enabled modules.
- If onboarding stops half-way, fix the cause and send the same request again: it resumes after the last completed step, and the tenant only becomes active at the end.

Schema maintenance for platform administrators:

```
GET  /api/v1/platform/tenants/:slug/schema              # version, and any difference from the expected schema
POST /api/v1/platform/tenants/:slug/migrations/run      # run pending migrations for one tenant
POST /api/v1/platform/tenants/migrations/run-all        # ... for every active tenant
POST /api/v1/platform/tenants/:slug/migrations/revert   # body: { "toVersion": "<migration name>" }
```

### 4.4 Manage Plugins Per Tenant

```
# List enabled plugins
GET /api/v1/platform/tenants/:tenantId/components
Authorization: Bearer <platform-admin-token>

# Enable/disable plugins
PUT /api/v1/platform/tenants/:tenantId/components
Authorization: Bearer <platform-admin-token>
Content-Type: application/json

{
  "components": [
    { "componentName": "@insurance/claims", "isEnabled": true },
    { "componentName": "@insurance/quotes", "isEnabled": true },
    { "componentName": "@insurance/payment", "isEnabled": false }
  ]
}
```

### 4.5 Get Tenant Config (from frontend)

```
GET /api/v1/tenant/config
x-tenant-id: caar
```

Response:
```json
{
  "name": "CAAR Insurance",
  "branding": {},
  "enabledComponents": ["@insurance/claims", "@insurance/quotes", "@insurance/payment"],
  "supportedLanguages": ["en", "fr", "ar"],
  "defaultLanguage": "fr",
  "customFields": {}
}
```

---

## 5. Authentication Flow

**Every API call** (except auth endpoints) requires:
1. `x-tenant-id` header (tenant slug)
2. `Authorization: Bearer <token>` (JWT)

### 5.1 Signup Flow (4 steps)

```
Step 1: Signup → sends email OTP
────────────────────────────────
POST /api/v1/auth/signup
x-tenant-id: caar
{
  "email": "user@example.com",
  "password": "SecureP@ss1",
  "phone": "+213600000000",
  "username": "ali_benali"
}
→ { "message": "Check your email for OTP" }


Step 2: Verify email OTP (required)
────────────────────────────────────
POST /api/v1/auth/verify-otp-email
x-tenant-id: caar
{
  "email": "user@example.com",
  "otpEmail": 123456
}
→ { "message": "Email OTP verified successfully" }


Step 3 (optional): Send SMS OTP
────────────────────────────────
POST /api/v1/auth/send-otp-sms
x-tenant-id: caar
{
  "email": "user@example.com",
  "phone": "+213600000000"
}
→ { "message": "Check your phone for the OTP" }


Step 4: Create account
──────────────────────
POST /api/v1/auth/verify-otp
x-tenant-id: caar
{
  "email": "user@example.com",
  "phone": "+213600000000",
  "otpSms": 654321          ← omit to skip SMS verification
}
→ {
    "user": { "id": "uuid", "username": "ali_benali", ... },
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG..."
  }
```

### 5.2 Login

```
POST /api/v1/auth/login
x-tenant-id: caar
{
  "email": "user@example.com",
  "password": "SecureP@ss1"
}
→ {
    "user": { ... },
    "accessToken": "eyJhbG...",      ← expires in 15 min
    "refreshToken": "eyJhbG..."      ← expires in 7 days
  }
```

### 5.3 Token Refresh

```
POST /api/v1/auth/refresh
x-tenant-id: caar
{
  "refreshToken": "eyJhbG..."
}
→ {
    "accessToken": "new-eyJhbG...",
    "refreshToken": "new-eyJhbG..."   ← rotated on each refresh
  }
```

### 5.4 Google OAuth (Mobile)

```
POST /api/v1/auth/google/mobile
x-tenant-id: caar
{
  "idToken": "<google-id-token-from-flutter>"
}
→ { "user": {...}, "accessToken": "...", "refreshToken": "..." }
```

### 5.5 Other Auth Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/profile` | GET | Get current user profile |
| `/auth/update-profile` | PATCH | Update profile |
| `/auth/upload-profile-picture` | PATCH | Upload avatar (multipart) |
| `/auth/change-password` | PATCH | Change password (old + new) |
| `/auth/reset-password-otp` | POST | Send password reset OTP |
| `/auth/verify-otp-reset` | POST | Verify reset OTP |
| `/auth/reset-password` | PATCH | Set new password |
| `/auth/send-otp-delete` | POST | Request account deletion OTP |
| `/auth/delete-account` | POST | Delete account with OTP |
| `/auth/logout` | POST | Logout |

---

## 6. Using the Plugins

### Important: All requests need these headers

```
x-tenant-id: <tenant-slug>
Authorization: Bearer <access-token>
Accept-Language: en|fr|ar       ← optional, defaults to "en"
```

---

### 6.1 Claims Plugin (`@insurance/claims`)

Declare, track, and manage insurance claims with file uploads.

#### Declare a Claim

```
POST /api/v1/claims/declare
x-tenant-id: caar
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form fields:
  typeIncident: "Accident"
  dateIncident: "2026-02-20"
  timeIncident: "14:30"              (optional)
  location: "123 Rue Didouche, Algiers"
  description: "Rear-end collision"  (optional)
  partsEndommagees: ["Pare-chocs", "Phares"]  (optional, JSON string)
  customFields: {"vehicle": "Toyota Yaris 2019"}  (optional)

Files:
  files: <photo1.jpg>
  files: <photo2.jpg>
  files: <damage_report.pdf>
```

Response:
```json
{
  "id": "uuid",
  "numDossier": "#CLM92847",
  "typeIncident": "Accident",
  "dateIncident": "2026-02-20",
  "location": "123 Rue Didouche, Algiers",
  "status": "SUBMITTED",
  "documents": [
    { "id": "uuid", "name": "photo1.jpg", "url": "presigned-url" }
  ],
  "createdAt": "2026-02-20T14:35:00.000Z"
}
```

#### Other Claims Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/claims` | GET | List user's claims | User |
| `/claims/:id` | GET | Get claim details | User |
| `/claims/:id/status` | PATCH | Update claim status | Admin |
| `/claims/:id/documents` | POST | Add documents | User |
| `/claims/:id/documents/:docId` | DELETE | Remove document | Admin |

#### Claim Statuses

```
SUBMITTED → IN_REVIEW → APPROVED → CLOSED
                      → REJECTED → CLOSED
```

---

### 6.2 Quotes Plugin (`@insurance/quotes`)

Browse, compare, and manage insurance quotes/plans.

#### List All Quotes

```
GET /api/v1/quotes?lang=fr
x-tenant-id: caar
Authorization: Bearer <token>
```

Response:
```json
[
  {
    "id": "uuid",
    "title": "Plan Basique Auto",
    "priceMonthly": 3500.00,
    "deductible": 15000.00,
    "termMonths": 12,
    "planType": "Basic",
    "productType": "Automobile"
  }
]
```

#### Get Recommended Quotes

```
GET /api/v1/quotes/recommended?planType=Premium&lang=en
x-tenant-id: caar
Authorization: Bearer <token>
```

#### Get Quote Details

```
GET /api/v1/quotes/:id?lang=fr
x-tenant-id: caar
Authorization: Bearer <token>
```

#### Compare Two Quotes

```
POST /api/v1/quotes/compare
x-tenant-id: caar
Authorization: Bearer <token>
{
  "devisAId": "uuid-1",
  "devisBId": "uuid-2"
}
```

#### List Products (Categories)

```
GET /api/v1/quotes/products?lang=fr
x-tenant-id: caar
Authorization: Bearer <token>
```

#### Quotes by Product Type

```
GET /api/v1/quotes/by-product/Automobile?lang=fr
x-tenant-id: caar
Authorization: Bearer <token>
```

#### Admin CRUD

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/quotes/admin` | POST | Create quote (admin) |
| `/quotes/admin/:id` | PATCH | Update quote (admin) |
| `/quotes/admin/:id` | DELETE | Delete quote (admin) |

**Create Quote Body:**
```json
{
  "titleEn": "Basic Auto Plan",
  "titleFr": "Plan Auto Basique",
  "titleAr": "خطة السيارات الأساسية",
  "planTypeEn": "Basic",
  "planTypeFr": "Basique",
  "planTypeAr": "أساسي",
  "startConditionEn": "Starts on contract signing date",
  "startConditionFr": "Début à la date de signature du contrat",
  "startConditionAr": "يبدأ في تاريخ توقيع العقد",
  "priceMonthly": 3500.00,
  "deductible": 15000.00,
  "termMonths": 12,
  "productId": "product-uuid"
}
```

---

### 6.3 Payment Plugin (`@insurance/payment`)

Create and track payment transactions.

#### Create Payment

```
POST /api/v1/payments
x-tenant-id: caar
Authorization: Bearer <token>
{
  "userId": "user-uuid",
  "quoteId": "quote-uuid",
  "amount": 42000.00,
  "currency": "DZD",
  "method": "bank_transfer",
  "description": "Annual auto insurance premium"
}
```

Response:
```json
{
  "id": "uuid",
  "referenceNumber": "PAY-A1B2C3D4",
  "userId": "user-uuid",
  "amount": 42000.00,
  "currency": "DZD",
  "status": "pending",
  "method": "bank_transfer",
  "createdAt": "2026-02-20T15:00:00.000Z"
}
```

#### Payment Endpoints

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/payments` | POST | Create payment | User |
| `/payments` | GET | List all payments | Admin |
| `/payments/:id` | GET | Get by ID | User |
| `/payments/reference/:ref` | GET | Get by reference | User |
| `/payments/user/:userId` | GET | Get user's payments | User |
| `/payments/:id/status` | PATCH | Update status | Admin |

#### Payment Statuses

```
pending → processing → completed
                     → failed
                     → refunded
                     → cancelled
```

#### Payment Methods

`bank_transfer` | `credit_card` | `cash` | `check` | `mobile`

---

### 6.4 Notifications Plugin (`@insurance/notifications`)

Push notifications via Firebase Cloud Messaging + in-app notification history.

#### Register Device Token

```
POST /api/v1/notifications/device-token
x-tenant-id: caar
Authorization: Bearer <token>
{
  "token": "fcm-device-token-from-flutter",
  "platform": "android",
  "deviceId": "device-12345",
  "appVersion": "1.0.0"
}
```

#### Notification History

```
GET /api/v1/notifications?page=1&limit=20
x-tenant-id: caar
Authorization: Bearer <token>
```

#### Other Notification Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/notifications` | GET | List notifications (paginated) |
| `/notifications/unread-count` | GET | Get unread count |
| `/notifications/:id` | GET | Get single notification |
| `/notifications/:id/read` | PATCH | Mark as read |
| `/notifications/mark-read` | PATCH | Batch mark as read |
| `/notifications/device-token` | DELETE | Unregister device |

---

### 6.5 Branches Plugin (`@insurance/branches`)

Manage physical branch locations with map coordinates.

#### List Branches

```
GET /api/v1/branches
x-tenant-id: caar
```

#### Map View (branches with coordinates)

```
GET /api/v1/branches/map
x-tenant-id: caar
```

Response:
```json
[
  {
    "id": "uuid",
    "name": "Agence Alger Centre",
    "code": "ALG-001",
    "latitude": 36.7538,
    "longitude": 3.0588,
    "address": "123 Rue Didouche Mourad"
  }
]
```

#### Admin Branch CRUD

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/branches` | POST | Create branch | Admin |
| `/branches/:id` | PUT | Update branch | Admin |
| `/branches/:id` | DELETE | Delete branch | Admin |
| `/branches/code/:code` | GET | Get by code | Any |

---

### 6.6 Users Plugin (Admin)

User management endpoints (admin-only, protected by AdminGuard).

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/users` | GET | List all users |
| `/users/:id` | GET | Get by ID |
| `/users/email/:email` | GET | Get by email |
| `/users/phone/:phone` | GET | Get by phone |
| `/users` | POST | Create user |
| `/users/:id` | PATCH | Update user |
| `/users/:id` | DELETE | Delete user |
| `/users/:id/photo` | PUT | Update photo |
| `/users/:id/role` | PATCH | Change role |
| `/users/forgot-password` | Post | Admin password reset |

---

### 6.7 AI Plugin (`@insurance/ai`)

AI-powered chat assistant for claim filing and customer support.

---

### 6.8 ERP Plugin (`@insurance/erp`)

Integration with external ERP systems.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/erp/contracts` | GET | List contracts |
| `/erp/contracts/:id` | GET | Get contract |
| `/erp/contracts` | POST | Create contract |
| `/erp/mappings` | GET/POST | Manage field mappings |

---

## 7. API Reference — Quick Summary

### Base URL

```
http://localhost:3000/api/v1
```

### Headers for All Requests

```
x-tenant-id: <tenant-slug>          ← REQUIRED (except platform admin endpoints)
Authorization: Bearer <jwt-token>   ← REQUIRED (except signup/login)
Accept-Language: en|fr|ar            ← OPTIONAL (defaults to "en")
```

### Error Responses

All errors follow this format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

### Rate Limits

| Endpoint | Limit |
|----------|-------|
| Global | 5 req/sec, 60 req/min |
| `/auth/signup` | 2 req/sec, 3 req/min |
| `/auth/login` | 5 req/min |  
| `/auth/send-otp-sms` | 3 req/min |
| `/auth/resend-otp-*` | 3 req/min |
| `/auth/verify-otp-email` | 5 req/min |

### Multilingual Support

All text fields (quotes, claims) are stored in 3 languages. Use `?lang=fr` query param or `Accept-Language` header to get responses in the preferred language.

Supported: `en` (English), `fr` (French), `ar` (Arabic)

---

## 8. Creating Custom Plugins

When you need a feature not covered by the built-in plugins (e.g. loyalty program, fraud detection, vehicle tracking), create an external plugin.

### 8.1 Scaffold

```bash
mkdir insurance-loyalty-plugin && cd insurance-loyalty-plugin
npm init -y --scope=@insurance-app-saas

# Configure npm for GitHub Packages
echo "@insurance-app-saas:registry=https://npm.pkg.github.com" > .npmrc

npm install @insurance-app-saas/plugin-sdk
npm install -D typescript @nestjs/common @nestjs/core typeorm @types/node
```

### 8.2 Create the Plugin

See the full [Plugin Authoring Guide](../packages/plugin-sdk/PLUGIN_AUTHORING_GUIDE.md) for step-by-step code.

Key files to create:
- `src/index.ts` — exports `PLUGIN_ENTRY`
- `src/loyalty.manifest.ts` — plugin metadata
- `src/loyalty.module.ts` — NestJS module
- `src/loyalty.service.ts` — business logic
- `src/loyalty.controller.ts` — API endpoints
- `src/entities/loyalty-points.entity.ts` — database entity

### 8.3 Install in the Backend

```bash
cd Insurance-app-Saas/insurance-backend
npm install @insurance-app-saas/loyalty-plugin
npm run start:dev
# Logs: "Discovered external plugin: @insurance/loyalty v1.0.0"
```

### 8.4 Enable for a Tenant

```
PUT /api/v1/platform/tenants/:tenantId/components
Authorization: Bearer <platform-admin-token>
{
  "components": [
    { "componentName": "@insurance/loyalty", "isEnabled": true }
  ]
}
```

---

## 9. Production Deployment

The step-by-step procedure, including upgrades and rollback, is in [`insurance-backend/GO_LIVE_RUNBOOK.md`](../insurance-backend/GO_LIVE_RUNBOOK.md).

### 9.1 Docker

```bash
cd insurance-backend
docker build -t insurance-backend .
docker run --env-file production.env insurance-backend node dist/cli/migrate.js platform
docker run --env-file production.env insurance-backend node dist/cli/migrate.js tenants
docker run -p 3000:3000 --env-file production.env insurance-backend
```

The image contains the compiled code and production dependencies only and runs as an unprivileged user. Run the two `migrate` commands on every deployment, before the new version takes traffic.

### 9.2 Environment Checklist

- [ ] `NODE_ENV=production`. The application then refuses to start with missing or weak settings and says which.
- [ ] Three different token secrets of at least 32 characters, and `TENANT_DB_ENCRYPTION_KEY` (64 hex characters, backed up)
- [ ] `TRUST_PROXY` set to the number of reverse proxies in front of the application, so rate limiting sees client addresses
- [ ] `CORS_ORIGINS` if a browser application calls the API
- [ ] Working SMTP settings (`EMAIL_*`): sign-up and password reset depend on them
- [ ] TLS for the database (`DB_SSL`), Redis (`REDIS_TLS`) and object storage (`MINIO_USE_SSL`)
- [ ] A reverse proxy with HTTPS in front, checking `GET /health/ready`
- [ ] `DB_AUTO_MIGRATE=false` and `DB_LOGGING=false`
- [ ] Optional: Infobip (SMS), Firebase (push), Google sign-in, an OpenAI-compatible key (AI assistant)

### 9.3 Database Per Tenant

Each tenant has its own database, on any supported engine and any server. The platform database holds:
- `tenants`: the tenant registry, with each tenant's (encrypted) database connection
- `tenant_plugins`: which modules are enabled for which tenant
- `platform_admins`, `platform_admin_credentials`: platform administrator accounts
- `custom_field_definitions`, `audit_logs`

Tenant databases hold all business data:
- `users`, `claims`, `documents`, `experts`
- `quotes`, `products`, `coverage_details`, `payments`
- `branches`, `contacts`, `notifications`, `device_tokens`
- `payment_transactions`, `contracts`, `mappings`, `logs`

### 9.4 Scaling

- **Horizontal**: run several instances behind a load balancer. Sessions, OTP codes, rate limits and AI conversations are kept in Redis, so any instance can serve any request.
- **Database**: each tenant database can be on a different server and engine.
- **Files**: any S3-compatible object storage.

---

## Quick Start Checklist

```
1. ☐ Clone the repository, npm ci
2. ☐ Start the database server, Redis and MinIO
3. ☐ Copy .env.example to .env and fill in the values
4. ☐ Create the empty platform database, then: npm run migrate -- platform
5. ☐ npm run platform-admin -- create <your email>
6. ☐ npm run start:dev
7. ☐ Log in as platform admin
8. ☐ Onboard the first tenant (database, tables, admin and modules in one request)
9. ☐ Frontend: send the X-Tenant-ID header and follow the auth flow
```
