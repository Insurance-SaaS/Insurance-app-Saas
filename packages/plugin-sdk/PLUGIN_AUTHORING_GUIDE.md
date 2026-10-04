# Creating an @insurance Plugin

> ## Status: experimental, parked
>
> The platform does **not** load external plugin packages at the moment. The
> built-in modules (claims, quotes, payment, branches, notifications, AI, ERP)
> are the plugins; they can be switched on and off per tenant.
>
> Before external packages can be loaded again, these gaps must be closed:
>
> 1. **Route gating.** The SDK's `@RequiresPlugin` writes the metadata key
>    `requiredPlugin`; the platform's guard reads `plugin_name`. Routes of an
>    external plugin would never be gated. The SDK must use the platform's key.
> 2. **Entities.** An external plugin's entities never reach the tenant
>    DataSources. They have to be added to the tenant entity set, use only the
>    portable column helpers, and ship migrations written with `SchemaKit`.
> 3. **Manifests.** Discovered manifests are never registered with the plugin
>    registry, so per-tenant rows and dependency checks do not see them.
> 4. **One source for contracts.** Tokens and interfaces are copied between
>    `insurance-backend/src/contracts` and this package and have already
>    drifted (the backend removed tokens that had no provider). The backend
>    should import them from this package instead.
> 5. **Trust.** A plugin runs in the platform process with full access. Only
>    first-party packages should ever be loaded this way.
>
> The loader code is kept in
> `insurance-backend/src/core/plugin-registry/external-plugins.module.ts`.

This guide shows how to build an external plugin that can be installed via `npm install` and automatically loaded by the @insurance platform.

> **Scope note**: The npm package scope is `@cw-insurance-saas/` (for GitHub Packages distribution).  
> The internal plugin namespace is `@insurance/` (used in manifest IDs like `@insurance/my-plugin`).  
> These are two separate concepts — don't confuse them.

## Prerequisites

Configure your npm to read from the CW-Insurance-SaaS GitHub Packages registry:

```bash
# ~/.npmrc (or project .npmrc)
@cw-insurance-saas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

You need a GitHub Personal Access Token (classic) with `read:packages` scope. ([Create one here](https://github.com/settings/tokens/new))

## Quick Start

```bash
# Create plugin package
mkdir my-plugin && cd my-plugin
npm init -y --scope=@cw-insurance-saas
npm install @cw-insurance-saas/plugin-sdk
npm install -D typescript @nestjs/common @nestjs/core typeorm
```

## Plugin Structure

```
@cw-insurance-saas/my-plugin/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts              # PLUGIN_ENTRY export
    ├── my-plugin.manifest.ts # Plugin metadata
    ├── my-plugin.module.ts   # NestJS module
    ├── my-plugin.service.ts  # Business logic
    ├── my-plugin.controller.ts
    └── entities/
        └── my-entity.entity.ts
```

## Step-by-Step

### 1. package.json

```json
{
  "name": "@cw-insurance-saas/my-plugin",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "keywords": ["insurance-plugin"],
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@nestjs/common": ">=10.0.0",
    "@nestjs/core": ">=10.0.0",
    "typeorm": ">=0.3.0"
  },
  "dependencies": {
    "@cw-insurance-saas/plugin-sdk": "^1.0.0"
  },
  "publishConfig": {
    "registry": "https://npm.pkg.github.com",
    "access": "restricted"
  }
}
```

### 2. Manifest (my-plugin.manifest.ts)

```typescript
import { PluginManifest, pluginId } from '@cw-insurance-saas/plugin-sdk';

export const MY_PLUGIN_MANIFEST: PluginManifest = {
  id: pluginId('my-plugin'),       // => '@insurance/my-plugin'
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Does amazing things',
  dependencies: [],                 // e.g. ['@insurance/claims']
  defaultConfig: {
    featureFlag: true,
  },
};
```

### 3. Entity (entities/my-entity.entity.ts)

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('my_plugin_data')
export class MyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn()
  createdAt: Date;
}
```

### 4. Service (my-plugin.service.ts)

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { USERS_SERVICE, IUsersService, CACHE_SERVICE, ICacheService } from '@cw-insurance-saas/plugin-sdk';
import { TenantRepositoryFactory } from '???'; // See note below
import { MyEntity } from './entities/my-entity.entity';

@Injectable()
export class MyPluginService {
  constructor(
    @Inject(USERS_SERVICE) private readonly usersService: IUsersService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    // TenantRepositoryFactory is available via the platform's DatabaseCoreModule
  ) {}

  async doSomething(userId: string): Promise<MyEntity[]> {
    const user = await this.usersService.findById(userId);
    // ... your logic
    return [];
  }
}
```

### 5. Controller (my-plugin.controller.ts)

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequiresPlugin } from '@cw-insurance-saas/plugin-sdk';
import { MyPluginService } from './my-plugin.service';

@Controller('my-plugin')
@RequiresPlugin('@insurance/my-plugin')
export class MyPluginController {
  constructor(private readonly service: MyPluginService) {}

  @Get()
  async list() {
    return { message: 'My plugin is working!' };
  }
}
```

### 6. Module (my-plugin.module.ts)

```typescript
import { Module, OnModuleInit } from '@nestjs/common';
import { MyPluginController } from './my-plugin.controller';
import { MyPluginService } from './my-plugin.service';

@Module({
  controllers: [MyPluginController],
  providers: [MyPluginService],
  exports: [MyPluginService],
})
export class MyPluginModule {}
```

### 7. Entry Point (index.ts) — **CRITICAL**

```typescript
import { InsurancePlugin, PLUGIN_ENTRY_KEY } from '@cw-insurance-saas/plugin-sdk';
import { MY_PLUGIN_MANIFEST } from './my-plugin.manifest';
import { MyPluginModule } from './my-plugin.module';
import { MyEntity } from './entities/my-entity.entity';

export const PLUGIN_ENTRY: InsurancePlugin = {
  manifest: MY_PLUGIN_MANIFEST,
  module: MyPluginModule,
  entities: [MyEntity],   // Registered in tenant DataSources automatically
};

// Re-export for convenience
export { MY_PLUGIN_MANIFEST, MyPluginModule, MyPluginService } from './my-plugin.service';
```

## How It Works

1. You `npm install @cw-insurance-saas/my-plugin` in the platform project
2. At boot, `PluginLoaderService` scans `node_modules/@cw-insurance-saas/*`
3. It finds your package because:
   - It's in the `@cw-insurance-saas/` namespace
   - It depends on `@cw-insurance-saas/plugin-sdk` (or has `insurance-plugin` keyword)
   - It exports `PLUGIN_ENTRY`
4. The platform:
   - Imports your `MyPluginModule` into the NestJS app
   - Registers your `manifest` with the `PluginRegistryService`
   - Adds your `entities` to tenant `DataSource`s
5. Tenant admins enable/disable your plugin per-tenant via the API

## Available Platform Services (via Injection Tokens)

| Token | Interface | Description |
|-------|-----------|-------------|
| `CACHE_SERVICE` | `ICacheService` | Tenant-scoped Redis caching |
| `STORAGE_SERVICE` | `IStorageService` | Object storage (MinIO/S3) |
| `OTP_SERVICE` | `IOtpService` | OTP generation & verification |
| `USERS_SERVICE` | `IUsersService` | User CRUD |
| `CLAIMS_SERVICE` | `IClaimsService` | Claims domain |
| `QUOTES_SERVICE` | `IQuotesService` | Quotes domain |
| `NOTIFICATION_SERVICE` | `INotificationService` | Push notifications |
| `PLUGIN_REGISTRY` | `IPluginRegistryService` | Plugin enable/disable state |

## Publishing to GitHub Packages

### One-time setup: Authenticate

```bash
# Create a GitHub PAT with write:packages scope
# Then login:
npm login --scope=@cw-insurance-saas --registry=https://npm.pkg.github.com
# Username: your-github-username
# Password: your-github-pat
# Email: your-email
```

### Publish

```bash
npm run build
npm publish
```

The `publishConfig` in your `package.json` ensures it goes to GitHub Packages automatically.

### Consuming in another project

```bash
# In any insurance app repo, add to .npmrc:
@cw-insurance-saas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT

# Then install:
npm install @cw-insurance-saas/my-plugin
```

## Testing Locally

```bash
# Option 1: npm link
cd my-plugin
npm link

cd ../insurance-backend
npm link @cw-insurance-saas/my-plugin
npm run start:dev
# Check logs for: "Discovered external plugin: @insurance/my-plugin v1.0.0"

# Option 2: npm workspaces (recommended for monorepo)
# Add your plugin to packages/ and it's auto-linked
```
