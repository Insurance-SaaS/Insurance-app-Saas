import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { AppLogger } from 'src/shared/logger/app-logger.service';

describe('JwtStrategy', () => {
  const configServiceMock = {
    get: jest.fn(() => 'jwt-secret'),
  };
  const usersServiceMock = {
    findById: jest.fn(),
  };
  const loggerMock = {
    debug: jest.fn(),
    warn: jest.fn(),
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      configServiceMock as unknown as ConfigService,
      usersServiceMock as any,
      loggerMock as unknown as AppLogger,
    );
  });

  it('rejects tenant token when header tenant mismatches payload', async () => {
    await expect(
      strategy.validate(
        { headers: { 'x-tenant-id': 'tenant-a' } },
        { sub: 'u1', email: 'u@test.com', tenantSlug: 'tenant-b' },
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns user for valid tenant token', async () => {
    usersServiceMock.findById.mockResolvedValue({ id: 'u1', email: 'u@test.com' });
    const result = await strategy.validate(
      { headers: { 'x-tenant-id': 'tenant-a' } },
      { sub: 'u1', email: 'u@test.com', tenantSlug: 'tenant-a' },
    );
    expect(result).toEqual({ id: 'u1', email: 'u@test.com' });
  });

  it('rejects a token that carries platform-admin claims', async () => {
    // Platform admins authenticate through their own strategy and secret; here the
    // claims are just extra fields and the tenant binding still applies.
    await expect(
      strategy.validate({ headers: {} }, {
        sub: 'pa1',
        email: 'admin@test.com',
        role: 'platform_admin',
        authType: 'platform_admin',
      } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersServiceMock.findById).not.toHaveBeenCalled();
  });
});
