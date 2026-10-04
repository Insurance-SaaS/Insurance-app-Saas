import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppLogger } from './logger/app-logger.service';
import { LocationValidationService } from './services/location-validation.service';
import { DateValidationService } from './services/date-validation.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [AppLogger, LocationValidationService, DateValidationService],
  exports: [AppLogger, LocationValidationService, DateValidationService],
})
export class CommonModule {}
