import { BadRequestException, CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlatformJwtAuthGuard } from 'src/core/platform-admin/platform-jwt-auth.guard';
import { NO_TENANT_KEY } from 'src/core/tenant/decorators/no-tenant.decorator';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { IS_PLATFORM_ROUTE_KEY } from '../decorators/platform-auth.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

/**
 * Registered globally: a tenant and authentication are the default for every route.
 *
 * Tenant
 * - @PlatformAuth() or @NoTenant()  no X-Tenant-ID needed
 * - otherwise                       the request must name an active tenant
 *
 * Authentication
 * - @Public()        none
 * - @PlatformAuth()  platform-admin token
 * - otherwise        tenant user token, bound to the X-Tenant-ID of the request
 */
@Injectable()
export class GlobalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantGuard: JwtAuthGuard,
    private readonly platformGuard: PlatformJwtAuthGuard,
    private readonly tenantContext: TenantContextService,
  ) {}

  canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const isPlatformRoute = this.reflector.getAllAndOverride<boolean>(
      IS_PLATFORM_ROUTE_KEY,
      targets,
    );

    const tenantOptional =
      isPlatformRoute || this.reflector.getAllAndOverride<boolean>(NO_TENANT_KEY, targets);
    if (!tenantOptional && !this.tenantContext.getTenant()) {
      throw new BadRequestException('X-Tenant-ID header is required');
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    return (isPlatformRoute ? this.platformGuard : this.tenantGuard).canActivate(context);
  }
}
