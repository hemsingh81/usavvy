import type { Logger } from "@usavvy/service-kernel";
import type { NotificationPort, SendEmailInput, SendInAppInput, NotificationResult } from "./port.js";

export function createMockNotificationAdapter(logger: Logger): NotificationPort {
  return {
    async sendEmail(input: SendEmailInput): Promise<NotificationResult> {
      // Body included (not just to/subject) so a developer can manually complete a
      // flow that emails a link/token (e.g. Story 1.1's email verification) without a
      // real email provider configured.
      logger.info("mock email sent", { to: input.to, subject: input.subject, body: input.body });
      return { success: true };
    },
    async sendInApp(input: SendInAppInput): Promise<NotificationResult> {
      logger.info("mock in-app notification sent", { userId: input.userId, notificationMessage: input.message });
      return { success: true };
    },
  };
}
