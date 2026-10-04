import { Test, TestingModule } from '@nestjs/testing';
import { FcmService } from './fcm.service';
import { ConfigService } from '@nestjs/config';
import { TenantRepositoryFactory } from 'src/core/database/tenant-repository.factory';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { NotificationHistoryService } from './notification-history.service';

describe('FcmService', () => {
  let service: FcmService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        {
          provide: TenantRepositoryFactory,
          useValue: { getRepository: jest.fn(() => ({ find: jest.fn(), save: jest.fn() })) },
        },
        {
          provide: TenantContextService,
          useValue: { getTenant: jest.fn(() => ({ slug: 'test-tenant' })) },
        },
        {
          provide: NotificationHistoryService,
          useValue: { createNotification: jest.fn(), updateStatus: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<FcmService>(FcmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
