import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Defence in depth for platform controllers. Authentication is done by the
 * global guard through @PlatformAuth(); this only accepts the principal that
 * the platform JWT strategy produces. A tenant user is never accepted, whatever
 * role or email they have.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (user?.isPlatformAdmin !== true) {
      throw new ForbiddenException('Platform admin access required');
    }
    return true;
  }
}
