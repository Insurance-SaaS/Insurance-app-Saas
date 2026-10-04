import { Injectable } from '@nestjs/common';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { EmailProvider } from './email-provider.interface';
import { NodemailerEmailProvider } from './providers/nodemailer-email.provider';
import { NoopEmailProvider } from './providers/noop-email.provider';

@Injectable()
export class EmailProviderFactory {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly nodemailerProvider: NodemailerEmailProvider,
    private readonly noopProvider: NoopEmailProvider,
  ) {}

  getProvider(): EmailProvider {
    const tenantConfig = (this.tenantContext.getTenant()?.config ?? {}) as Record<string, any>;
    const provider = String(tenantConfig.emailProvider ?? 'nodemailer')
      .trim()
      .toLowerCase();

    if (provider === 'none' || provider === 'noop' || provider === 'disabled') {
      return this.noopProvider;
    }

    return this.nodemailerProvider;
  }
}
