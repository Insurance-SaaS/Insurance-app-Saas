import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LogController } from './log.controller';
import { AppLogger } from 'src/shared/logger/app-logger.service';
@Module({
  providers: [LogService, AppLogger],
  controllers: [LogController],
  exports: [LogService, AppLogger],
})
export class LoggingModule {
  // Module-level providers, controllers, and exports can be defined here
}
