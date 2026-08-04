export type { NotificationPort, SendEmailInput, SendInAppInput, NotificationResult } from "./port.js";
export { createMockNotificationAdapter } from "./mock.js";
export { createNotificationAdapter, type NotificationAdapterName } from "./factory.js";
