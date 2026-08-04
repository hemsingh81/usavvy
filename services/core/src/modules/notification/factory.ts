import type { Logger } from "@usavvy/service-kernel";
import type { NotificationPort } from "./port.js";
import { createMockNotificationAdapter } from "./mock.js";

export type NotificationAdapterName = "mock";

/**
 * AD-1/AD-12: the one place the mock/real NotificationPort binding is selected, driven
 * by config rather than hardcoded at each call site.
 */
export function createNotificationAdapter(adapter: NotificationAdapterName, logger: Logger): NotificationPort {
  switch (adapter) {
    case "mock":
      return createMockNotificationAdapter(logger);
  }
}
