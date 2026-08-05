import { describe, expect, it } from "vitest";
import { calculateAge } from "../../../src/modules/users/age.js";

// Mirrors services/core/tests/modules/users/age.test.ts exactly — the client and
// server implementations must agree on every boundary case.
describe("calculateAge (client mirror)", () => {
  const NOW = "2026-08-05";

  it("returns 18 when the 18th birthday was exactly today", () => {
    expect(calculateAge("2008-08-05", NOW)).toBe(18);
  });

  it("returns 17 when the 18th birthday is tomorrow (not yet had it this year)", () => {
    expect(calculateAge("2008-08-06", NOW)).toBe(17);
  });

  it("returns 18 when the 18th birthday was yesterday", () => {
    expect(calculateAge("2008-08-04", NOW)).toBe(18);
  });

  it("handles a birth month after the current month (not yet had birthday this year)", () => {
    expect(calculateAge("2008-12-01", NOW)).toBe(17);
  });

  it("handles a birth month before the current month (already had birthday this year)", () => {
    expect(calculateAge("2008-01-01", NOW)).toBe(18);
  });
});
