import { Injectable } from '@nestjs/common';
import { SmsProviderFactory } from 'src/integrations/sms/sms-provider.factory';

/**
 * Auth-facing SMS service.
 * Delegates provider selection to tenant-aware SmsProviderFactory.
 */
@Injectable()
export class SmsService {
  constructor(private readonly smsProviderFactory: SmsProviderFactory) {}

  async sendSms(phone: string, otp: number): Promise<void> {
    const message = `Your OTP code is: ${otp}`;
    await this.smsProviderFactory.getProvider().send({ to: phone, message });
  }
}
