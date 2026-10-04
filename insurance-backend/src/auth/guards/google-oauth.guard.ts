import { ExecutionContext, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { GoogleStrategy } from '../strategies/google.strategy';

/**
 * The browser-based Google sign-in. Where Google sign-in is not configured the
 * routes answer 503 with a clear message instead of failing inside passport.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!GoogleStrategy.isConfigured(this.configService)) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    return super.canActivate(context);
  }
}
