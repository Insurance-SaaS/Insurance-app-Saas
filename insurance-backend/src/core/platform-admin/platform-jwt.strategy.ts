import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PlatformAdminService } from './platform-admin.service';

export const PLATFORM_JWT_STRATEGY = 'jwt-platform';

export interface PlatformAdminPrincipal {
  id: string;
  email: string;
  username: string;
  role: 'platform_admin';
  isPlatformAdmin: true;
}

/**
 * Validates platform-admin access tokens. They are signed with
 * JWT_PLATFORM_SECRET, so no token issued to a tenant user can ever pass here,
 * whatever role that user holds inside their tenant.
 */
@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, PLATFORM_JWT_STRATEGY) {
  constructor(
    configService: ConfigService,
    private readonly platformAdminService: PlatformAdminService,
  ) {
    const secret = configService.get<string>('JWT_PLATFORM_SECRET');
    if (!secret) {
      throw new Error('JWT_PLATFORM_SECRET environment variable is required');
    }
    if (secret === configService.get<string>('JWT_SECRET_KEY')) {
      throw new Error('JWT_PLATFORM_SECRET must be different from JWT_SECRET_KEY');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    authType?: string;
    tokenUse?: string;
  }): Promise<PlatformAdminPrincipal> {
    if (payload.authType !== 'platform_admin' || payload.tokenUse !== 'access') {
      throw new UnauthorizedException('Invalid platform admin token');
    }

    const admin = await this.platformAdminService.findActiveByEmail(payload.email);
    if (!admin) {
      throw new UnauthorizedException('Platform admin not found');
    }

    return {
      id: admin.id,
      email: admin.email,
      username: admin.fullName || admin.email,
      role: 'platform_admin',
      isPlatformAdmin: true,
    };
  }
}
