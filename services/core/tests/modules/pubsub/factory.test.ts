import { describe, expect, it } from "vitest";
import { createPubSubAdapter } from "../../../src/modules/pubsub/factory.js";
import { createLogger } from "@usavvy/service-kernel";

describe("createPubSubAdapter", () => {
  it("binds the mock adapter when 'mock' is selected (AD-12: config-driven, not hardcoded)", async () => {
    const adapter = createPubSubAdapter("mock", createLogger("pubsub"));

    await expect(adapter.publish({ type: "user.deletion_requested", payload: { userId: "u1" } })).resolves.toBeUndefined();
  });
});
