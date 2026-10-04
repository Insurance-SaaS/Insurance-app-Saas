import { TENANT_SLUG } from './tenant-slug';
import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { TenantContextService } from './tenant.context';
import { TenantService } from './tenant.service';

const TENANT_NOT_FOUND_PAYLOAD = {
  statusCode: 404,
  message: 'Tenant not found or inactive',
  error: 'Not Found',
};

/** Works with both Fastify (reply) and the raw ServerResponse that middie passes to middleware. */
function sendNotFound(res: any): void {
  const body = JSON.stringify(TENANT_NOT_FOUND_PAYLOAD);

  if (typeof res?.code === 'function' && typeof res?.send === 'function') {
    // Fastify reply object
    res.code(404).send(TENANT_NOT_FOUND_PAYLOAD);
  } else if (typeof res?.status === 'function' && typeof res?.json === 'function') {
    // Express-like response
    res.status(404).json(TENANT_NOT_FOUND_PAYLOAD);
  } else if (typeof res?.writeHead === 'function') {
    // Raw Node.js ServerResponse (what middie actually provides in Fastify middleware)
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(body);
  } else {
    // Last resort – should never happen, but avoids crashing
    throw new TypeError('Tenant not found or inactive (unsupported response object)');
  }
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly tenantContext: TenantContextService,
  ) {}

  use(req: any, res: any, next: (err?: Error) => void): void {
    this.tenantContext.runWithContext({}, async () => {
      try {
        const tenantSlug = (req.headers?.['x-tenant-id'] as string | undefined)?.trim();

        if (!tenantSlug) {
          next();
          return;
        }

        // A value that cannot be a slug is answered without looking anything up.
        const tenant = TENANT_SLUG.test(tenantSlug)
          ? await this.tenantService.findBySlug(tenantSlug)
          : null;
        if (!tenant?.isActive) {
          sendNotFound(res);
          return;
        }

        this.tenantContext.setTenant(tenant);
        req.tenant = tenant;
        next();
      } catch (error) {
        this.logger.error(
          'Tenant resolution failed',
          error instanceof Error ? error.stack : String(error),
        );
        // Avoid calling next() if the response has already started sending
        if (res?.headersSent || res?.writableEnded) {
          return;
        }
        next(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
