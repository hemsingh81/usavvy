import { describe, expect, it } from "vitest";
import { accountDeletionResponseSchema } from "../src/accountDeletion.js";

describe("accountDeletionResponseSchema", () => {
  it("accepts a valid shape", () => {
    expect(() => accountDeletionResponseSchema.parse({ scheduledDeletionAt: "2026-09-04T00:00:00.000Z" })).not.toThrow();
  });

  it("rejects a missing field", () => {
    expect(() => accountDeletionResponseSchema.parse({})).toThrow();
  });
});
