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
    onboardingComplete: false,
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

  it("routes to /onboarding for an adult who has declared but hasn't onboarded yet", () => {
    expect(
      resolvePostAuthDestination(
        me({ birthdate: "1990-01-01", isMinor: false, parentalConsentStatus: "not_required", onboardingComplete: false }),
      ),
    ).toBe("/onboarding");
  });

  it("routes to /onboarding for a minor whose consent was granted but hasn't onboarded yet", () => {
    expect(
      resolvePostAuthDestination(me({ birthdate: "2015-01-01", isMinor: true, parentalConsentStatus: "granted", onboardingComplete: false })),
    ).toBe("/onboarding");
  });

  it("routes home for an adult who has declared and completed onboarding", () => {
    expect(
      resolvePostAuthDestination(
        me({ birthdate: "1990-01-01", isMinor: false, parentalConsentStatus: "not_required", onboardingComplete: true }),
      ),
    ).toBe("/");
  });

  it("routes home for a minor whose consent was granted and who has completed onboarding", () => {
    expect(
      resolvePostAuthDestination(me({ birthdate: "2015-01-01", isMinor: true, parentalConsentStatus: "granted", onboardingComplete: true })),
    ).toBe("/");
  });

  it("checks the onboarding branch after the minor-consent branches, not instead of them", () => {
    // Still pending consent — must land on /waiting-for-consent even though onboarding
    // is also incomplete, not skip ahead to /onboarding.
    expect(
      resolvePostAuthDestination(
        me({ birthdate: "2015-01-01", isMinor: true, parentalConsentStatus: "pending", onboardingComplete: false }),
      ),
    ).toBe("/waiting-for-consent");
  });
});
