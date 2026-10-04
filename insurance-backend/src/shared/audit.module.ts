import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from 'src/shared/entities/audit-log.entity';
import { AuditLogService } from 'src/shared/services/audit-log.service';
import { AuditLogInterceptor } from 'src/shared/interceptors/audit-log.interceptor';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditLogService, AuditLogInterceptor],
  exports: [AuditLogService, AuditLogInterceptor],
})
export class AuditModule {}
