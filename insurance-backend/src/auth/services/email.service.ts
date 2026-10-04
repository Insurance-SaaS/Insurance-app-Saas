import { Injectable, Logger } from '@nestjs/common';
import { EmailProviderFactory } from 'src/integrations/email/email-provider.factory';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  constructor(private readonly emailProviderFactory: EmailProviderFactory) {}

  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.emailProviderFactory.getProvider().send({ to, subject, text });
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error.stack);
      throw error;
    }
  }
}
