export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export interface SendInAppInput {
  userId: string;
  message: string;
}

export interface NotificationResult {
  success: boolean;
}

/**
 * AD-1: any code that needs to notify a user depends on this interface, never on a
 * concrete adapter. The mock binding is the default until a real email provider is
 * configured (AD-12) — swapping it in is a config change, not a call-site change.
 */
export interface NotificationPort {
  sendEmail(input: SendEmailInput): Promise<NotificationResult>;
  sendInApp(input: SendInAppInput): Promise<NotificationResult>;
}
