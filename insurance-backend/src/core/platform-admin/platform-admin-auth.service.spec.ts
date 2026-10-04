import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PlatformAdminAuthService } from './platform-admin-auth.service';

describe('PlatformAdminAuthService', () => {
  const admin = { id: 'pa-1', email: 'admin@test.com', fullName: 'Admin' };

  const platformAdminServiceMock = {
    validateCredentials: jest.fn(),
    findActiveByEmail: jest.fn(),
  };
  const jwtServiceMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET_KEY') return 'tenant-secret';
      if (key === 'JWT_PLATFORM_SECRET') return 'platform-secret';
      return undefined;
    }),
  };
  const redisServiceMock = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  let service: PlatformAdminAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PlatformAdminAuthService(
      platformAdminServiceMock as any,
      jwtServiceMock as unknown as JwtService,
      configServiceMock as unknown as ConfigService,
      redisServiceMock as any,
    );
  });

  it('logs in platform admin and returns tokens signed with the platform secret', async () => {
    platformAdminServiceMock.validateCredentials.mockResolvedValue(admin);
    jwtServiceMock.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

    const result = await service.login('admin@test.com', 'Password123!');

    expect(result.accessToken).toBe('access');
    expect(result.refreshToken).toBe('refresh');
    expect(result.admin).toMatchObject({ id: 'pa-1', role: 'platform_admin' });
    for (const [, options] of jwtServiceMock.signAsync.mock.calls) {
      expect(options.secret).toBe('platform-secret');
    }
    expect(redisServiceMock.set).toHaveBeenCalledWith(
      expect.stringContaining('pa-1'),
      'refresh',
      expect.any(Number),
    );
  });

  it('throws for invalid login credentials', async () => {
    platformAdminServiceMock.validateCredentials.mockResolvedValue(null);
    await expect(service.login('bad@test.com', 'bad')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rotates tokens from a valid, stored refresh token', async () => {
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: 'pa-1',
      email: 'admin@test.com',
      authType: 'platform_admin',
      tokenUse: 'refresh',
    });
    redisServiceMock.get.mockResolvedValue('refresh-token');
    platformAdminServiceMock.findActiveByEmail.mockResolvedValue(admin);
    jwtServiceMock.signAsync
      .mockResolvedValueOnce('new-access')
      .mockResolvedValueOnce('new-refresh');

    const result = await service.refresh('refresh-token');

    expect(result.accessToken).toBe('new-access');
    expect(result.refreshToken).toBe('new-refresh');
    expect(result.admin).toMatchObject({ id: 'pa-1', role: 'platform_admin' });
  });

  it('rejects a refresh token that is no longer the stored one', async () => {
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: 'pa-1',
      email: 'admin@test.com',
      authType: 'platform_admin',
      tokenUse: 'refresh',
    });
    redisServiceMock.get.mockResolvedValue('a-newer-token');

    await expect(service.refresh('refresh-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an access token presented as a refresh token', async () => {
    jwtServiceMock.verifyAsync.mockResolvedValue({
      sub: 'pa-1',
      email: 'admin@test.com',
      authType: 'platform_admin',
      tokenUse: 'access',
    });

    await expect(service.refresh('access-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
