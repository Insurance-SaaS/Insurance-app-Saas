import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppLogger } from 'src/shared/logger/app-logger.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly logger: AppLogger) {
    super();
  }
  canActivate(context: ExecutionContext) {
    this.logger.debug('JwtAuthGuard canActivate', 'JwtAuthGuard');
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    this.logger.debug('JwtAuthGuard handleRequest', 'JwtAuthGuard');

    if (err || !user) {
      this.logger.warn('Authentication failed', 'JwtAuthGuard');
      throw err || new UnauthorizedException(info?.message || 'Authentication failed');
    }

    this.logger.debug('JWT authentication successful', 'JwtAuthGuard');
    return user;
  }
}
