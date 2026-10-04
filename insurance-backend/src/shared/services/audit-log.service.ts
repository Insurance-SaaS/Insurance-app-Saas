import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from 'src/shared/entities/audit-log.entity';

/** Fields that must never appear in audit payloads */
const REDACTED_FIELDS = new Set([
  'password',
  'databasePassword',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'otp',
]);

function redactPayload(
  obj: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!obj || typeof obj !== 'object') return obj;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_FIELDS.has(key)) {
      safe[key] = '***REDACTED***';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      safe[key] = redactPayload(value as Record<string, unknown>);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async record(entry: Partial<AuditLog>): Promise<void> {
    try {
      const log = this.auditLogRepo.create({
        ...entry,
        payload: redactPayload(entry.payload),
      });
      await this.auditLogRepo.save(log);
    } catch (err) {
      // Audit logging must never crash the request
      this.logger.error(`Audit log write failed: ${err.message}`);
    }
  }

  async findByResource(resourceType: string, resourceId: string): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: { resourceType, resourceId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findByAdmin(adminId: string): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      where: { adminId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async findRecent(limit = 50): Promise<AuditLog[]> {
    return this.auditLogRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
