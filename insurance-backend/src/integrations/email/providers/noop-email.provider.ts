import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailProvider, EmailSendPayload } from '../email-provider.interface';

@Injectable()
export class NoopEmailProvider implements EmailProvider {
  async send(_payload: EmailSendPayload): Promise<void> {
    throw new BadRequestException('Email provider is not enabled for this tenant');
  }
}
