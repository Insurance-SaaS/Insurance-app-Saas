import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { EmailProvider, EmailSendPayload } from '../email-provider.interface';

@Injectable()
export class NodemailerEmailProvider implements EmailProvider {
  private readonly logger = new Logger(NodemailerEmailProvider.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port: this.configService.get<number>('EMAIL_PORT') || 587,
      secure: this.configService.get<string>('EMAIL_SECURE') === 'true',
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      },
    });
  }

  async send(payload: EmailSendPayload): Promise<void> {
    const senderName =
      (this.tenantContext.getTenant()?.config as any)?.emailSenderName ||
      this.configService.get<string>('EMAIL_SENDER_NAME') ||
      'Insurance Platform';
    const senderAddress = this.configService.get<string>('EMAIL_USER');

    try {
      await this.transporter.sendMail({
        from: `"${senderName}" <${senderAddress}>`,
        to: payload.to,
        subject: payload.subject,
        text: payload.text,
      });
      this.logger.log(`Email sent successfully to ${payload.to}`);
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${payload.to}`, error.stack);
      throw error;
    }
  }
}
