import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from 'src/modules/users/users.service';
import { RedisService } from 'src/cache_storage/services/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './services/email.service';
import { SmsService } from './services/sms.service';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { AppLogger } from 'src/shared/logger/app-logger.service';
import { OtpService } from 'src/cache_storage/services/otp.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: EmailService, useValue: {} },
        { provide: SmsService, useValue: {} },
        { provide: TenantContextService, useValue: { getTenant: jest.fn() } },
        {
          provide: OtpService,
          useValue: { generate: jest.fn(), verify: jest.fn(), invalidate: jest.fn() },
        },
        { provide: AppLogger, useValue: { debug: jest.fn(), log: jest.fn(), warn: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
