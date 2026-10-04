import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditLogService } from 'src/shared/services/audit-log.service';
import { AuditMeta } from 'src/shared/decorators/audit-action.decorator';

/**
 * Interceptor that automatically writes an audit log entry
 * for any handler decorated with @AuditAction().
 *
 * Extracts:
 *  - admin ID from request.user
 *  - resource ID from route params (tenantId, tenantSlug, id)
 *  - request body as payload
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const meta = this.reflector.get<AuditMeta | undefined>('audit', context.getHandler());
    if (!meta) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const method: string = request.method;
    const path: string = request.url || request.raw?.url;
    const adminId: string | undefined = request.user?.sub || request.user?.id;
    const params = request.params || {};
    const resourceId: string | undefined = params.tenantId || params.tenantSlug || params.id;
    const payload: Record<string, unknown> | undefined =
      method !== 'GET' ? request.body : undefined;
    const ipAddress: string | undefined =
      request.ip || request.headers?.['x-forwarded-for'] || request.raw?.socket?.remoteAddress;

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = context.switchToHttp().getResponse().statusCode;
          void this.auditLogService.record({
            action: meta.action,
            resourceType: meta.resourceType,
            adminId,
            resourceId,
            method,
            path,
            payload,
            statusCode,
            ipAddress,
          });
        },
        error: (err) => {
          void this.auditLogService.record({
            action: meta.action,
            resourceType: meta.resourceType,
            adminId,
            resourceId,
            method,
            path,
            payload,
            statusCode: err.status || 500,
            ipAddress,
          });
        },
      }),
    );
  }
}
