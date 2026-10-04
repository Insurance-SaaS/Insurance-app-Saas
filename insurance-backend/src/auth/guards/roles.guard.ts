import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from 'src/modules/users/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Registered globally, after authentication. Enforces @Roles(). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) {
      return true;
    }

    const user = context.switchToHttp().getRequest().user;
    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException('Action not available');
    }
    return true;
  }
}
