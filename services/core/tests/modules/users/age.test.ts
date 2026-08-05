import { describe, expect, it } from "vitest";
import { calculateAge } from "../../../src/modules/users/age.js";

describe("calculateAge", () => {
  // Fixed reference "now" so these tests are deterministic regardless of when they run —
  // only the fixture birthdates are computed relative to it, never the expected result.
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

  it("handles the exact same month with an earlier day (already had birthday)", () => {
    expect(calculateAge("2008-08-01", NOW)).toBe(18);
  });

  it("handles the exact same month with a later day (not yet had birthday)", () => {
    expect(calculateAge("2008-08-31", NOW)).toBe(17);
  });

  it("computes a newborn as age 0", () => {
    expect(calculateAge(NOW, NOW)).toBe(0);
  });
});
