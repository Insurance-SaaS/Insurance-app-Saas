import { Injectable } from '@nestjs/common';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { SmsProvider } from './sms-provider.interface';
import { InfobipSmsProvider } from './providers/infobip-sms.provider';
import { NoopSmsProvider } from './providers/noop-sms.provider';

@Injectable()
export class SmsProviderFactory {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly infobipProvider: InfobipSmsProvider,
    private readonly noopProvider: NoopSmsProvider,
  ) {}

  getProvider(): SmsProvider {
    const tenantConfig = (this.tenantContext.getTenant()?.config ?? {}) as Record<string, any>;
    const provider = String(tenantConfig.smsProvider ?? 'infobip')
      .trim()
      .toLowerCase();

    if (provider === 'none' || provider === 'noop' || provider === 'disabled') {
      return this.noopProvider;
    }

    return this.infobipProvider;
  }
}
