import type { MeResponse } from "@usavvy/shared-types";

/**
 * Shared by every page that establishes a session (LoginPage, VerifyEmailPage,
 * GoogleSignInButton's onSuccess) — one place decides where a freshly-authenticated
 * learner lands, based on Story 1.2's age-declaration state.
 */
export function resolvePostAuthDestination(me: MeResponse): string {
  if (me.birthdate === null) {
    return "/age-declaration";
  }
  if (me.isMinor === true && me.parentalConsentStatus === "pending") {
    return "/waiting-for-consent";
  }
  return "/";
}
