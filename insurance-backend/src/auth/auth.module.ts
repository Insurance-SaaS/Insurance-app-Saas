import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from 'src/modules/users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { SmsService } from './services/sms.service';
import { EmailService } from './services/email.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { UsersService } from 'src/modules/users/users.service';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import { CacheStorageModule } from 'src/cache_storage/cache_storage.module';
import { SmsProviderFactory } from 'src/integrations/sms/sms-provider.factory';
import { InfobipSmsProvider } from 'src/integrations/sms/providers/infobip-sms.provider';
import { NoopSmsProvider } from 'src/integrations/sms/providers/noop-sms.provider';
import { EmailProviderFactory } from 'src/integrations/email/email-provider.factory';
import { NodemailerEmailProvider } from 'src/integrations/email/providers/nodemailer-email.provider';
import { NoopEmailProvider } from 'src/integrations/email/providers/noop-email.provider';
import { PlatformAdminModule } from 'src/core/platform-admin/platform-admin.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GlobalAuthGuard } from './guards/global-auth.guard';
import { RolesGuard } from './guards/roles.guard';
@Module({
  imports: [
    CacheStorageModule,
    UsersModule,
    PlatformAdminModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET_KEY');
        if (!secret) {
          throw new Error('JWT_SECRET_KEY environment variable is required');
        }
        return {
          secret,
          signOptions: { expiresIn: '1d' },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SmsService,
    EmailService,
    SmsProviderFactory,
    InfobipSmsProvider,
    NoopSmsProvider,
    EmailProviderFactory,
    NodemailerEmailProvider,
    NoopEmailProvider,
    JwtStrategy,
    // Optional: only registered when Google sign-in is configured.
    {
      provide: GoogleStrategy,
      inject: [ConfigService, UsersService],
      useFactory: (config: ConfigService, users: UsersService) =>
        GoogleStrategy.isConfigured(config) ? new GoogleStrategy(config, users) : null,
    },
    GoogleOAuthGuard,
    // Authentication and role checks apply to every route; see @Public(), @PlatformAuth(), @Roles().
    JwtAuthGuard,
    GlobalAuthGuard,
    RolesGuard,
    { provide: APP_GUARD, useExisting: GlobalAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AuthModule {}
