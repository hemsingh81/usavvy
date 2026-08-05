import { describe, expect, it } from "vitest";
import { updateDisplayNameInputSchema } from "../src/profile.js";

describe("updateDisplayNameInputSchema", () => {
  it("accepts a normal display name", () => {
    expect(() => updateDisplayNameInputSchema.parse({ displayName: "Ananya" })).not.toThrow();
  });

  it("trims surrounding whitespace", () => {
    const result = updateDisplayNameInputSchema.parse({ displayName: "  Ananya  " });
    expect(result.displayName).toBe("Ananya");
  });

  it("rejects an empty string", () => {
    expect(() => updateDisplayNameInputSchema.parse({ displayName: "" })).toThrow();
  });

  it("rejects a whitespace-only string", () => {
    expect(() => updateDisplayNameInputSchema.parse({ displayName: "   " })).toThrow();
  });

  it("rejects a string over 60 characters", () => {
    expect(() => updateDisplayNameInputSchema.parse({ displayName: "a".repeat(61) })).toThrow();
  });

  it("accepts a string at exactly 60 characters", () => {
    expect(() => updateDisplayNameInputSchema.parse({ displayName: "a".repeat(60) })).not.toThrow();
  });

  it("rejects a missing displayName field", () => {
    expect(() => updateDisplayNameInputSchema.parse({})).toThrow();
  });
});
