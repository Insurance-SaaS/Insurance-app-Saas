import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'src/modules/users/entities/user.entity';

export const ROLES_KEY = 'auth:roles';

/** Restricts a route (or controller) to tenant users holding one of the given roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
