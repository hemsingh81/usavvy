import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockPubSubAdapter } from "../../../src/modules/pubsub/mock.js";
import { createLogger } from "@usavvy/service-kernel";

describe("createMockPubSubAdapter", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("publish logs the event and resolves, never a real network call", async () => {
    const adapter = createMockPubSubAdapter(createLogger("pubsub"));

    await adapter.publish({ type: "user.deletion_requested", payload: { userId: "u1", scheduledDeletionAt: "2026-09-04T00:00:00.000Z" } });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(payload).toMatchObject({
      type: "user.deletion_requested",
      payload: { userId: "u1", scheduledDeletionAt: "2026-09-04T00:00:00.000Z" },
    });
  });
});
