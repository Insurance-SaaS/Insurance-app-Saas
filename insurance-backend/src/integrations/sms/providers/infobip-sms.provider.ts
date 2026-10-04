import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { TenantContextService } from 'src/core/tenant/tenant.context';
import { SmsProvider, SmsSendPayload } from '../sms-provider.interface';

@Injectable()
export class InfobipSmsProvider implements SmsProvider {
  private readonly logger = new Logger(InfobipSmsProvider.name);
  private readonly axiosInstance: AxiosInstance | null = null;
  private readonly senderId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {
    const apiKey = this.configService.get<string>('INFOBIP_API_KEY') || '';
    let baseUrl = this.configService.get<string>('INFOBIP_BASE_URL') || 'https://api.infobip.com';
    this.senderId = this.configService.get<string>('INFOBIP_SENDER_ID') || 'Insurance';

    // A deployment that does not use Infobip must still boot; fail on first use instead.
    if (!apiKey) {
      this.logger.warn('INFOBIP_API_KEY is not set: sending SMS through Infobip is disabled');
      return;
    }

    if (baseUrl && !baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = `https://${baseUrl}`;
    }

    this.axiosInstance = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `App ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  async send(payload: SmsSendPayload): Promise<void> {
    if (!this.axiosInstance) {
      throw new Error(
        'Infobip credentials not configured. Please set INFOBIP_API_KEY. Get it from https://portal.infobip.com',
      );
    }

    const formattedPhone = this.formatPhone(payload.to);
    const tenantSenderId = (this.tenantContext.getTenant()?.config as any)?.smsSenderId;

    try {
      const response = await this.axiosInstance.post('/sms/2/text/advanced', {
        messages: [
          {
            destinations: [{ to: formattedPhone }],
            from: tenantSenderId || this.senderId,
            text: payload.message,
          },
        ],
      });

      if (response.data?.messages?.length) {
        const messageInfo = response.data.messages[0];
        if (messageInfo.status?.groupId === 1) {
          this.logger.log(
            `SMS sent via Infobip to ${formattedPhone}, message ID: ${messageInfo.messageId || 'N/A'}`,
          );
        } else {
          this.logger.warn(
            `SMS status: ${messageInfo.status?.groupName} - ${messageInfo.status?.description}`,
          );
        }
      }
    } catch (error: any) {
      const errorMessage =
        error.response?.data?.requestError?.serviceException?.text ||
        error.response?.data?.message ||
        error.message;
      this.logger.error(`Failed to send SMS via Infobip to ${payload.to}`, error.stack);
      throw new Error(`SMS sending failed: ${errorMessage}`);
    }
  }

  private formatPhone(phone: string): string {
    let num = phone.trim();
    if (num.startsWith('+')) {
      num = num.substring(1);
    } else if (num.startsWith('00')) {
      num = num.substring(2);
    }
    return num.replace(/\D/g, '');
  }
}
