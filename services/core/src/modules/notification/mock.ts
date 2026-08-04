import type { Logger } from "@usavvy/service-kernel";
import type { NotificationPort, SendEmailInput, SendInAppInput, NotificationResult } from "./port.js";

export function createMockNotificationAdapter(logger: Logger): NotificationPort {
  return {
    async sendEmail(input: SendEmailInput): Promise<NotificationResult> {
      logger.info("mock email sent", { to: input.to, subject: input.subject });
      return { success: true };
    },
    async sendInApp(input: SendInAppInput): Promise<NotificationResult> {
      logger.info("mock in-app notification sent", { userId: input.userId, notificationMessage: input.message });
      return { success: true };
    },
  };
}
