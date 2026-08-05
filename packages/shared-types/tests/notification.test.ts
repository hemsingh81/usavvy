import { describe, expect, it } from "vitest";
import { notificationListResponseSchema, notificationResponseSchema } from "../src/notification.js";

const VALID_NOTIFICATION = {
  id: "n1",
  type: "account_deletion_requested",
  message: "Your account deletion is scheduled",
  sourceProcessType: "account_deletion",
  sourceProcessStatus: "in_progress",
  readAt: null,
  createdAt: "2026-01-15T00:00:00.000Z",
};

describe("notificationResponseSchema", () => {
  it("accepts a fully-populated notification tied to an in-progress process", () => {
    expect(() => notificationResponseSchema.parse(VALID_NOTIFICATION)).not.toThrow();
  });

  it("accepts a notification with no source process (sourceProcessType/Status both null)", () => {
    expect(() =>
      notificationResponseSchema.parse({ ...VALID_NOTIFICATION, sourceProcessType: null, sourceProcessStatus: null }),
    ).not.toThrow();
  });

  it("accepts a readAt timestamp once marked read", () => {
    expect(() => notificationResponseSchema.parse({ ...VALID_NOTIFICATION, readAt: "2026-01-16T00:00:00.000Z" })).not.toThrow();
  });

  it("rejects a sourceProcessStatus value outside the 2-item enum", () => {
    expect(() => notificationResponseSchema.parse({ ...VALID_NOTIFICATION, sourceProcessStatus: "cancelled" })).toThrow();
  });

  it.each(["id", "type", "message", "createdAt"] as const)("rejects a shape missing %s", (key) => {
    const rest = Object.fromEntries(Object.entries(VALID_NOTIFICATION).filter(([k]) => k !== key));
    expect(() => notificationResponseSchema.parse(rest)).toThrow();
  });
});

describe("notificationListResponseSchema", () => {
  it("accepts an empty array", () => {
    expect(() => notificationListResponseSchema.parse([])).not.toThrow();
  });

  it("accepts an array of valid notifications", () => {
    expect(() => notificationListResponseSchema.parse([VALID_NOTIFICATION, { ...VALID_NOTIFICATION, id: "n2" }])).not.toThrow();
  });

  it("rejects an array containing an invalid notification", () => {
    expect(() => notificationListResponseSchema.parse([VALID_NOTIFICATION, { bad: "shape" }])).toThrow();
  });
});
