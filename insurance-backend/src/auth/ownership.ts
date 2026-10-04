import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from 'src/modules/users/entities/user.entity';

/** The authenticated tenant user, as attached to the request by the JWT strategy. */
export interface AuthenticatedUser {
  id: string;
  role?: UserRole | string;
}

export function isTenantAdmin(user: AuthenticatedUser | undefined): boolean {
  return user?.role === UserRole.TENANT_ADMIN;
}

/**
 * Allows the owner of a resource and tenant admins; everyone else gets the same
 * 404 as for a resource that does not exist, so ids cannot be probed.
 */
export function assertOwnerOrAdmin(
  user: AuthenticatedUser | undefined,
  ownerId: string | null | undefined,
  resourceName = 'Resource',
): void {
  if (!user?.id) {
    throw new UnauthorizedException('User not authenticated');
  }
  if (isTenantAdmin(user) || (ownerId && ownerId === user.id)) {
    return;
  }
  throw new NotFoundException(`${resourceName} not found`);
}
