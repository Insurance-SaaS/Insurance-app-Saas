import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TranslationService } from './translation.service';
import { TranslationController } from './translation.controller';
import { TranslationInterceptor } from './interceptors/translation.interceptor';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [TranslationController],
  providers: [TranslationService, TranslationInterceptor],
  exports: [TranslationService, TranslationInterceptor],
})
export class TranslationModule {}
