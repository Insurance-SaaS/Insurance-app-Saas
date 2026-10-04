export interface EmailSendPayload {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(payload: EmailSendPayload): Promise<void>;
}
