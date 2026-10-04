import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to mark a controller method for audit logging.
 *
 * @param action  e.g. 'tenant.create', 'tenant.onboard'
 * @param resourceType  e.g. 'tenant', 'plugin', 'migration'
 */
export const AuditAction = (action: string, resourceType?: string) =>
  SetMetadata('audit', { action, resourceType });

export interface AuditMeta {
  action: string;
  resourceType?: string;
}
