import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockNotificationAdapter } from "../../../src/modules/notification/mock.js";
import { createLogger } from "@usavvy/service-kernel";

describe("createMockNotificationAdapter", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("sendEmail logs the payload and resolves success, never a real network call", async () => {
    const adapter = createMockNotificationAdapter(createLogger("notification"));

    const result = await adapter.sendEmail({ to: "learner@example.com", subject: "Welcome", body: "Hi there" });

    expect(result).toEqual({ success: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ to: "learner@example.com", subject: "Welcome" });
  });

  it("sendInApp logs the payload and resolves success, never throws", async () => {
    const adapter = createMockNotificationAdapter(createLogger("notification"));

    const result = await adapter.sendInApp({ userId: "user-1", message: "Assignment graded" });

    expect(result).toEqual({ success: true });
    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({ userId: "user-1", notificationMessage: "Assignment graded" });
  });
});
