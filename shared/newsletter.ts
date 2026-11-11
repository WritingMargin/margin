export interface SMTPSettings {
  host: string;
  port: number;
  security: "starttls" | "tls";
  username: string;
  password?: string;
  passwordConfigured: boolean;
}
export interface SenderDomain {
  name: string;
  status: string;
  records: { type: string; name: string; value: string; priority?: number }[];
}
export interface NewsletterSettings {
  enabled: boolean;
  delivery: "managed" | "smtp";
  senderEmail: string;
}
export interface NewsletterStatus extends NewsletterSettings {
  entitled: boolean;
  accountConnected: boolean;
  defaultSenderEmail: string;
  effectiveSenderEmail: string;
  ready: boolean;
  issues: string[];
  subscriberCount: number;
  smtp: SMTPSettings;
  domain: SenderDomain | null;
}
