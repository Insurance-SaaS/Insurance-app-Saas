import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersService } from 'src/modules/users/users.service';
import { ConfigService } from '@nestjs/config';
import { MinioService } from 'src/cache_storage/services/minio.service';
import { AppLogger } from 'src/shared/logger/app-logger.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: MinioService, useValue: {} },
        { provide: AppLogger, useValue: { log: jest.fn(), debug: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
