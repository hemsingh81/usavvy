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
  // Fail closed: any minor whose consent isn't affirmatively "granted" is gated,
  // rather than only gating the one status value ("pending") the happy path expects.
  if (me.isMinor === true && me.parentalConsentStatus !== "granted") {
    return "/waiting-for-consent";
  }
  // Story 1.3: checked after (not instead of) the age/consent gates above — a minor
  // still awaiting consent must never skip ahead to onboarding. Fails closed on `!==
  // true` (review finding) rather than `=== false`, matching the minor-consent check
  // above — an unexpected non-boolean value gates the learner rather than silently
  // granting access.
  if (me.onboardingComplete !== true) {
    return "/onboarding";
  }
  return "/";
}
