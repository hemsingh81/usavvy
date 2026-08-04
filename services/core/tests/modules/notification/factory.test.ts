import { describe, expect, it } from "vitest";
import { createNotificationAdapter } from "../../../src/modules/notification/factory.js";
import { createLogger } from "@usavvy/service-kernel";

describe("createNotificationAdapter", () => {
  it("binds the mock adapter when 'mock' is selected (AD-12: config-driven, not hardcoded)", async () => {
    const adapter = createNotificationAdapter("mock", createLogger("notification"));

    const result = await adapter.sendEmail({ to: "a@b.com", subject: "s", body: "b" });

    expect(result).toEqual({ success: true });
  });
});
