import { BadRequestException, Injectable } from '@nestjs/common';
import { SmsProvider, SmsSendPayload } from '../sms-provider.interface';

@Injectable()
export class NoopSmsProvider implements SmsProvider {
  async send(_payload: SmsSendPayload): Promise<void> {
    throw new BadRequestException('SMS provider is not enabled for this tenant');
  }
}
