import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { PlatformAdmin } from './entities/platform-admin.entity';
import { PlatformAdminCredential } from './entities/platform-admin-credential.entity';
import { PlatformAdminService } from './platform-admin.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAdminAuthController } from './platform-admin-auth.controller';
import { PlatformAdminAuthService } from './platform-admin-auth.service';
import { PlatformJwtStrategy } from './platform-jwt.strategy';
import { PlatformJwtAuthGuard } from './platform-jwt-auth.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformAdmin, PlatformAdminCredential]),
    // No default secret: every sign/verify call names JWT_PLATFORM_SECRET explicitly.
    JwtModule.register({}),
    CacheStorageModule,
  ],
  controllers: [PlatformAdminAuthController],
  providers: [
    PlatformAdminService,
    PlatformAdminGuard,
    PlatformAdminAuthService,
    PlatformJwtStrategy,
    PlatformJwtAuthGuard,
  ],
  exports: [
    PlatformAdminService,
    PlatformAdminGuard,
    PlatformAdminAuthService,
    PlatformJwtAuthGuard,
  ],
})
export class PlatformAdminModule {}
