import { describe, expect, it } from "vitest";
import { createGenerationAdapter } from "../../../src/modules/generation/factory.js";

describe("createGenerationAdapter", () => {
  it("dispatches 'mock' to a working GenerationPort", async () => {
    const adapter = createGenerationAdapter("mock");
    await expect(adapter.embed("hello")).resolves.toHaveLength(1536);
  });
});
