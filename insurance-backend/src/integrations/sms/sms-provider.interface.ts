export interface SmsSendPayload {
  to: string;
  message: string;
}

export interface SmsProvider {
  send(payload: SmsSendPayload): Promise<void>;
}
