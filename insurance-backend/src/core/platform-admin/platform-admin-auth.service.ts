import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { buildPlatformCacheKey } from 'src/shared/utils/cache-key.util';
import { PlatformAdmin } from './entities/platform-admin.entity';
import { PlatformAdminService } from './platform-admin.service';

const ACCESS_TTL = '1h';
const REFRESH_TTL = '7d';
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

type AdminSummary = { id: string; email: string; fullName?: string; role: 'platform_admin' };

/**
 * Platform-admin sessions. Tokens are signed with JWT_PLATFORM_SECRET, never
 * with the tenant secret, and the refresh token is stored server-side so it can
 * be rotated and revoked.
 */
@Injectable()
export class PlatformAdminAuthService {
  constructor(
    private readonly platformAdminService: PlatformAdminService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  private get secret(): string {
    const secret = this.configService.get<string>('JWT_PLATFORM_SECRET');
    if (!secret) {
      throw new Error('JWT_PLATFORM_SECRET environment variable is required');
    }
    return secret;
  }

  private refreshKey(adminId: string): string {
    return buildPlatformCacheKey('admin-auth', 'refresh', adminId);
  }

  private summarize(admin: PlatformAdmin): AdminSummary {
    return { id: admin.id, email: admin.email, fullName: admin.fullName, role: 'platform_admin' };
  }

  private async issueTokens(
    admin: PlatformAdmin,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const claims = { sub: admin.id, email: admin.email, authType: 'platform_admin' };

    const accessToken = await this.jwtService.signAsync(
      { ...claims, tokenUse: 'access' },
      { secret: this.secret, expiresIn: ACCESS_TTL },
    );
    const refreshToken = await this.jwtService.signAsync(
      { ...claims, tokenUse: 'refresh', jti: randomUUID() },
      { secret: this.secret, expiresIn: REFRESH_TTL },
    );
    await this.redisService.set(this.refreshKey(admin.id), refreshToken, REFRESH_TTL_SECONDS);

    return { accessToken, refreshToken };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; admin: AdminSummary }> {
    const admin = await this.platformAdminService.validateCredentials(email, password);
    if (!admin) {
      throw new UnauthorizedException('Invalid platform admin credentials');
    }

    return { ...(await this.issueTokens(admin)), admin: this.summarize(admin) };
  }

  async refresh(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string; admin: AdminSummary }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: Record<string, any>;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, { secret: this.secret });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (payload.authType !== 'platform_admin' || payload.tokenUse !== 'refresh') {
      throw new UnauthorizedException('Invalid platform admin token');
    }

    const stored = await this.redisService.get(this.refreshKey(payload.sub));
    if (!stored || stored !== refreshToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const admin = await this.platformAdminService.findActiveByEmail(payload.email);
    if (!admin) {
      throw new UnauthorizedException('Platform admin not found');
    }

    // Rotated on every use: the token just presented stops working.
    return { ...(await this.issueTokens(admin)), admin: this.summarize(admin) };
  }

  async logout(adminId: string): Promise<{ message: string }> {
    await this.redisService.del(this.refreshKey(adminId));
    return { message: 'Successfully logged out' };
  }
}
