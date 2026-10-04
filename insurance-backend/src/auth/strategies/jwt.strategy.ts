import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from 'src/modules/users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly logger: AppLogger,
  ) {
    const secret = configService.get('JWT_SECRET_KEY');
    if (!secret) {
      throw new Error('JWT_SECRET_KEY environment variable is required');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: { sub: string; email: string; tenantSlug?: string }) {
    this.logger.debug('JWT Strategy validate called', 'JwtStrategy');

    // A tenant token is only valid against the tenant it was issued for.
    // Platform-admin tokens are signed with another secret and never reach this point.
    const headerTenant = (req?.headers?.['x-tenant-id'] as string | undefined)?.trim();
    if (!headerTenant || !payload.tenantSlug || headerTenant !== payload.tenantSlug) {
      this.logger.warn(
        `Tenant mismatch: header="${headerTenant}" vs token="${payload.tenantSlug}"`,
        'JwtStrategy',
      );
      throw new UnauthorizedException(
        'Tenant mismatch – please log in again to refresh your session',
      );
    }

    const user = await this.usersService.findById(payload.sub);
    this.logger.debug('User lookup performed', 'JwtStrategy');

    if (!user) {
      this.logger.warn('User not found in database', 'JwtStrategy');
      throw new UnauthorizedException('User not found');
    }

    this.logger.debug('JWT validation successful', 'JwtStrategy');
    return user;
  }
}
