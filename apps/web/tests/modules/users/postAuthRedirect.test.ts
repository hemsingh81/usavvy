import { describe, expect, it } from "vitest";
import { resolvePostAuthDestination } from "../../../src/modules/users/postAuthRedirect.js";

function me(overrides: Partial<Parameters<typeof resolvePostAuthDestination>[0]> = {}) {
  return {
    id: "u1",
    email: "a@example.com",
    emailVerified: true,
    role: "student",
    birthdate: null,
    isMinor: null,
    parentalConsentStatus: null,
    ...overrides,
  };
}

describe("resolvePostAuthDestination", () => {
  it("routes to /age-declaration when birthdate hasn't been declared", () => {
    expect(resolvePostAuthDestination(me())).toBe("/age-declaration");
  });

  it("routes to /waiting-for-consent when a minor's consent is pending", () => {
    expect(resolvePostAuthDestination(me({ birthdate: "2015-01-01", isMinor: true, parentalConsentStatus: "pending" }))).toBe(
      "/waiting-for-consent",
    );
  });

  it("routes home for an adult who has declared", () => {
    expect(resolvePostAuthDestination(me({ birthdate: "1990-01-01", isMinor: false, parentalConsentStatus: "not_required" }))).toBe("/");
  });

  it("routes home for a minor whose consent was granted", () => {
    expect(resolvePostAuthDestination(me({ birthdate: "2015-01-01", isMinor: true, parentalConsentStatus: "granted" }))).toBe("/");
  });
});
