import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError, type Logger } from "@usavvy/service-kernel";
import { can, type Role } from "@usavvy/config";
import {
  DEFAULT_LEARNER_PREFERENCES,
  DEFAULT_PRIVACY_SETTINGS,
  ONBOARDING_STEPS,
  type AccountDeletionResponse,
  type AgeDeclarationResponse,
  type DataExport,
  type LearnerPreferences,
  type LearnerPrivacySettings,
  type LearnerProfileResponse,
  type MeResponse,
  type OnboardingStepInput,
  type ParentalConsentStatus,
  type PreferencesUpdateInput,
  type PrivacySettingsUpdateInput,
  type UpdateDisplayNameInput,
} from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { learnerProfiles, parentalConsentTokens, users } from "../../db/schema.js";
import type { NotificationPort } from "../notification/index.js";
import type { PubSubPort } from "../pubsub/index.js";
import { normalizeEmail } from "../auth/index.js";
import { generateRawToken, hashToken } from "../auth/tokens.js";
import { calculateAge } from "./age.js";

const ACCOUNT_DELETION_GRACE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

const CONSENT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MINOR_AGE_THRESHOLD = 18;

type UserRow = typeof users.$inferSelect;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Bumps the optimistic-concurrency `version` column (Consistency Conventions,
// established by Story 1.1's own code review — every write path must keep doing this).
function bumpVersion() {
  return sql`${users.version} + 1`;
}

/**
 * `isMinor`/`parentalConsentStatus` are derived from `birthdate` on every read, never
 * persisted as a snapshot — a learner who was a minor at declaration and later has an
 * actual birthday genuinely stops needing consent; storing a stale computed flag would
 * require remembering to keep it in sync instead of just being correct by construction.
 */
function deriveAgeFields(user: Pick<UserRow, "birthdate" | "parentConsentedAt">): {
  isMinor: boolean | null;
  parentalConsentStatus: ParentalConsentStatus | null;
} {
  if (user.birthdate === null) {
    return { isMinor: null, parentalConsentStatus: null };
  }
  const isMinor = calculateAge(user.birthdate, todayIso()) < MINOR_AGE_THRESHOLD;
  if (!isMinor) {
    return { isMinor: false, parentalConsentStatus: "not_required" };
  }
  return { isMinor: true, parentalConsentStatus: user.parentConsentedAt !== null ? "granted" : "pending" };
}

// Review finding: `updateDisplayName` originally re-fetched via a second `getMe(db,
// userId, role)` call after its own UPDATE. If that second SELECT ever threw (transient
// DB error, a future permission-matrix change), the client would be told the save
// failed and revert its optimistic update — even though the write itself had already
// committed, an AD-17 "database says one thing, UI says another" bug. Factoring the
// response assembly out to take an already-loaded `user` row lets `updateDisplayName`
// build its response directly from the row its own UPDATE just returned, with no
// second `users` SELECT at all.
async function buildMeResponse(db: Db, user: UserRow, role: Role): Promise<MeResponse> {
  if (!can(role, "read", "self")) {
    throw new AppError("FORBIDDEN", "not permitted", 403);
  }
  // A plain read, not ensureLearnerProfile's upsert — checking /me must not have the
  // side effect of creating a row; "no row yet" and "onboardingComplete: false" mean
  // the same thing here; there's no need to persist that fact just to report it.
  const [profile] = await db.select({ completedAt: learnerProfiles.completedAt }).from(learnerProfiles).where(eq(learnerProfiles.userId, user.id));
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    birthdate: user.birthdate,
    ...deriveAgeFields(user),
    onboardingComplete: (profile?.completedAt ?? null) !== null,
    // Story 1.5 (FR-A-5): the fallback is computed here, once, rather than duplicated
    // client-side. Review finding: `email` being non-empty (validated at signup) only
    // guarantees `split("@")[0]` is non-empty when the local part itself is non-empty —
    // `z.email()` does reject a bare `@example.com` today, but the `|| "learner"` guard
    // costs nothing and removes the dependency on that being true forever.
    displayName: user.displayName ?? (user.email.split("@")[0] || "learner"),
    memberSince: user.createdAt.toISOString(),
  };
}

export async function getMe(db: Db, userId: string, role: Role): Promise<MeResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AppError("NOT_FOUND", "user not found", 404);
  }
  return buildMeResponse(db, user, role);
}

/**
 * Story 1.5 (FR-A-5). No CAS/step-order check needed — same reasoning Story 1.4's
 * `savePreferences` already established for a freely re-editable field with no
 * ordering invariant.
 */
export async function updateDisplayName(db: Db, userId: string, role: Role, input: UpdateDisplayNameInput): Promise<MeResponse> {
  const [updated] = await db
    .update(users)
    .set({ displayName: input.displayName, updatedAt: new Date(), version: bumpVersion() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) {
    throw new AppError("NOT_FOUND", "user not found", 404);
  }
  return buildMeResponse(db, updated, role);
}

/**
 * AD-7: no new role/permission here — every role may declare its own age. This is
 * gated purely by "is this a valid authenticated session" (the trusted `x-user-id`
 * header), not a role-based authorization decision, so no `can()` matrix entry.
 */
export async function declareAge(
  db: Db,
  notificationPort: NotificationPort,
  userId: string,
  input: { birthdate: string; parentEmail?: string | undefined },
): Promise<AgeDeclarationResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AppError("NOT_FOUND", "user not found", 404);
  }
  if (user.birthdate !== null) {
    // AC scope: a one-time declaration, not an editable profile field in this story.
    throw new AppError("AGE_ALREADY_DECLARED", "age has already been declared for this account", 409);
  }

  const isMinor = calculateAge(input.birthdate, todayIso()) < MINOR_AGE_THRESHOLD;

  // The `birthdate !== null` check above is only a fast-path courtesy error message —
  // it has a TOCTOU race with a concurrent identical request. The real guarantee comes
  // from the `isNull(users.birthdate)` condition below: only one concurrent request can
  // ever match it (a compare-and-swap on "declaration not yet made"), so at most one
  // parental-consent token/email is ever created per account.
  if (!isMinor) {
    const updated = await db
      .update(users)
      .set({ birthdate: input.birthdate, updatedAt: new Date(), version: bumpVersion() })
      .where(and(eq(users.id, userId), isNull(users.birthdate)))
      .returning({ id: users.id });
    if (updated.length === 0) {
      throw new AppError("AGE_ALREADY_DECLARED", "age has already been declared for this account", 409);
    }
    return { isMinor: false, parentalConsentStatus: "not_required" };
  }

  if (!input.parentEmail) {
    throw new AppError("VALIDATION_ERROR", "parentEmail is required when the declared age is under 18", 400);
  }
  const parentEmail = normalizeEmail(input.parentEmail);
  if (parentEmail === user.email) {
    // The entire point of this flow is an independent adult granting consent — a minor
    // supplying their own account email would let them self-approve and bypass it.
    throw new AppError("VALIDATION_ERROR", "parentEmail must not be your own account email", 400);
  }

  const updated = await db
    .update(users)
    .set({ birthdate: input.birthdate, parentEmail, updatedAt: new Date(), version: bumpVersion() })
    .where(and(eq(users.id, userId), isNull(users.birthdate)))
    .returning({ id: users.id });
  if (updated.length === 0) {
    throw new AppError("AGE_ALREADY_DECLARED", "age has already been declared for this account", 409);
  }

  const rawToken = generateRawToken();
  await db.insert(parentalConsentTokens).values({
    userId,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + CONSENT_TOKEN_TTL_MS),
  });

  // AC #1: parental consent email via NotificationPort (mock adapter in dev, Story 1.0)
  // — sent to the parent's email, never the learner's own.
  await notificationPort.sendEmail({
    to: parentEmail,
    subject: "Parental consent required for Usavvy",
    body: `Your child would like to use Usavvy. Grant consent by visiting: /parental-consent?token=${rawToken}`,
  });

  return { isMinor: true, parentalConsentStatus: "pending" };
}

/**
 * Unauthenticated by design — the parent has no account/session on this platform,
 * same public-link pattern as auth's verify-email. Unlike verify-email, no session is
 * issued here: the parent isn't the account holder.
 */
export async function recordParentalConsent(db: Db, input: { token: string }): Promise<{ success: true }> {
  const tokenHash = hashToken(input.token);
  return db.transaction(async (tx) => {
    // Row lock (Story 1.1's code-review precedent for verifyEmail) — two concurrent
    // requests with the same still-unused token must not both succeed.
    const [tokenRow] = await tx.select().from(parentalConsentTokens).where(eq(parentalConsentTokens.tokenHash, tokenHash)).for("update");
    if (!tokenRow || tokenRow.usedAt !== null || tokenRow.expiresAt.getTime() < Date.now()) {
      throw new AppError("INVALID_CONSENT_TOKEN", "consent link is invalid, expired, or already used", 404);
    }

    await tx
      .update(users)
      .set({ parentConsentedAt: new Date(), updatedAt: new Date(), version: bumpVersion() })
      .where(eq(users.id, tokenRow.userId));
    await tx.update(parentalConsentTokens).set({ usedAt: new Date() }).where(eq(parentalConsentTokens.id, tokenRow.id));

    return { success: true as const };
  });
}

type LearnerProfileRow = typeof learnerProfiles.$inferSelect;

function toLearnerProfileResponse(row: LearnerProfileRow): LearnerProfileResponse {
  return {
    goal: row.goal,
    interests: row.interests,
    availability: row.availability,
    sessionLengthMinutes: row.sessionLengthMinutes,
    targetCompletionDate: row.targetCompletionDate,
    level: row.level,
    currentStep: row.currentStep,
    completedAt: row.completedAt !== null ? row.completedAt.toISOString() : null,
  };
}

/**
 * Upsert-on-first-write (Task 3): the first GET or PUT for a user with no
 * learnerProfiles row creates one — there's no meaningful state before the first
 * answer, so no separate "start onboarding" endpoint exists.
 */
async function ensureLearnerProfile(db: Db, userId: string): Promise<LearnerProfileRow> {
  const inserted = await db.insert(learnerProfiles).values({ userId }).onConflictDoNothing().returning();
  if (inserted[0]) {
    return inserted[0];
  }
  const [existing] = await db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, userId));
  if (!existing) {
    throw new AppError("INTERNAL_ERROR", "failed to load learner profile", 500);
  }
  return existing;
}

export async function getOnboarding(db: Db, userId: string): Promise<LearnerProfileResponse> {
  return toLearnerProfileResponse(await ensureLearnerProfile(db, userId));
}

function stepColumnUpdate(input: OnboardingStepInput): Partial<typeof learnerProfiles.$inferInsert> {
  switch (input.step) {
    case "goal":
      return { goal: input.value };
    case "interests":
      return { interests: input.value };
    case "availability":
      return { availability: input.value };
    case "sessionLength":
      return { sessionLengthMinutes: input.value };
    case "targetDate":
      return { targetCompletionDate: input.value };
    case "level":
      return { level: input.value };
  }
}

/**
 * currentStep is forward-only (Task 2's design) and completedAt is set once, on the
 * final ("level") step — both computed inside the same UPDATE via greatest()/coalesce()
 * so the advancement is safe under two genuinely concurrent step-saves for the same
 * profile, not just an application-level read-then-max() that a lost update could
 * silently regress (Story 1.2's own review found exactly this class of bug elsewhere).
 *
 * Review finding: nothing previously stopped a client from submitting e.g. "level"
 * first on a fresh profile — currentStep would jump straight to 6 and completedAt would
 * be set with every other field still null, defeating FR-A-3's entire purpose. A step
 * may only be (re-)saved once the learner has actually reached it: stepIndex must be
 * `<= currentStep` (already-passed steps stay freely editable; the one exactly at the
 * frontier is allowed; anything beyond it is a skip-ahead attempt). Enforced in the same
 * atomic UPDATE via the WHERE clause, not a separate read-then-check, so it can't be
 * raced the same way the already-declared check in Story 1.2 originally could.
 */
export async function saveOnboardingStep(db: Db, userId: string, input: OnboardingStepInput): Promise<LearnerProfileResponse> {
  await ensureLearnerProfile(db, userId);
  const stepIndex = ONBOARDING_STEPS.indexOf(input.step);
  const isLastStep = stepIndex === ONBOARDING_STEPS.length - 1;

  const [updated] = await db
    .update(learnerProfiles)
    .set({
      ...stepColumnUpdate(input),
      currentStep: sql`greatest(${learnerProfiles.currentStep}, ${stepIndex + 1})`,
      ...(isLastStep ? { completedAt: sql`coalesce(${learnerProfiles.completedAt}, now())` } : {}),
      updatedAt: new Date(),
      version: sql`${learnerProfiles.version} + 1`,
    })
    .where(and(eq(learnerProfiles.userId, userId), sql`${learnerProfiles.currentStep} >= ${stepIndex}`))
    .returning();

  if (!updated) {
    throw new AppError("VALIDATION_ERROR", "onboarding steps must be completed in order", 400);
  }
  return toLearnerProfileResponse(updated);
}

function toLearnerPreferences(row: LearnerProfileRow): LearnerPreferences {
  return {
    voiceEnabled: row.voiceEnabled ?? DEFAULT_LEARNER_PREFERENCES.voiceEnabled,
    speechRate: row.speechRate ?? DEFAULT_LEARNER_PREFERENCES.speechRate,
    boardTheme: row.boardTheme ?? DEFAULT_LEARNER_PREFERENCES.boardTheme,
    explanationStyle: row.explanationStyle ?? DEFAULT_LEARNER_PREFERENCES.explanationStyle,
    captionsEnabled: row.captionsEnabled ?? DEFAULT_LEARNER_PREFERENCES.captionsEnabled,
    reducedMotion: row.reducedMotion ?? DEFAULT_LEARNER_PREFERENCES.reducedMotion,
  };
}

export async function getPreferences(db: Db, userId: string): Promise<LearnerPreferences> {
  return toLearnerPreferences(await ensureLearnerProfile(db, userId));
}

/**
 * Unlike saveOnboardingStep, no step-order/CAS check is needed here — every preference
 * is freely, repeatedly re-editable with no invariant a concurrent write could violate
 * (Story 1.3's own review reached exactly this conclusion for a similar-looking case).
 */
export async function savePreferences(db: Db, userId: string, input: PreferencesUpdateInput): Promise<LearnerPreferences> {
  await ensureLearnerProfile(db, userId);

  const [updated] = await db
    .update(learnerProfiles)
    .set({
      ...input,
      updatedAt: new Date(),
      version: sql`${learnerProfiles.version} + 1`,
    })
    .where(eq(learnerProfiles.userId, userId))
    .returning();

  if (!updated) {
    throw new AppError("INTERNAL_ERROR", "failed to save preferences", 500);
  }
  return toLearnerPreferences(updated);
}

function toPrivacySettings(row: LearnerProfileRow): LearnerPrivacySettings {
  return {
    publicLeaderboardSharing: row.publicLeaderboardSharing ?? DEFAULT_PRIVACY_SETTINGS.publicLeaderboardSharing,
    cohortDisplayName: row.cohortDisplayName ?? DEFAULT_PRIVACY_SETTINGS.cohortDisplayName,
    uploadsForTraining: row.uploadsForTraining ?? DEFAULT_PRIVACY_SETTINGS.uploadsForTraining,
  };
}

export async function getPrivacySettings(db: Db, userId: string): Promise<LearnerPrivacySettings> {
  return toPrivacySettings(await ensureLearnerProfile(db, userId));
}

/**
 * Story 1.6 (FR-A-6). No CAS/step-order check needed — identical reasoning
 * `savePreferences` already established for a freely re-editable field with no
 * ordering invariant.
 */
export async function savePrivacySettings(db: Db, userId: string, input: PrivacySettingsUpdateInput): Promise<LearnerPrivacySettings> {
  await ensureLearnerProfile(db, userId);

  const [updated] = await db
    .update(learnerProfiles)
    .set({
      ...input,
      updatedAt: new Date(),
      version: sql`${learnerProfiles.version} + 1`,
    })
    .where(eq(learnerProfiles.userId, userId))
    .returning();

  if (!updated) {
    throw new AppError("INTERNAL_ERROR", "failed to save privacy settings", 500);
  }
  return toPrivacySettings(updated);
}

/**
 * Story 1.7 (FR-A-7). Compare-and-swap exactly like declareAge's established one-time-
 * action pattern (Story 1.2) — the WHERE clause is the real guarantee against two
 * concurrent requests both succeeding, not a separate pre-check.
 *
 * Deliberately does NOT delete any data, anywhere — see the story's own Scope note.
 * `core` only owns `users`/`learnerProfiles`; the uploads/notes/submissions/progress
 * data the AC's "all uploads and personal data" phrase refers to belongs to services
 * that don't exist yet (AD-14), and the actual 30-day-later purge needs a durable job
 * scheduler (JobQueuePort, AD-15) that isn't wired anywhere in this codebase yet. This
 * function's job ends at scheduling the deletion, notifying the learner, and publishing
 * the domain event a future subscriber will act on.
 */
export async function requestAccountDeletion(
  db: Db,
  notificationPort: NotificationPort,
  pubSubPort: PubSubPort,
  logger: Logger,
  userId: string,
): Promise<AccountDeletionResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AppError("NOT_FOUND", "user not found", 404);
  }

  const requestedAt = new Date();
  const scheduledDeletionAt = new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_PERIOD_MS);

  const updated = await db
    .update(users)
    .set({ deletionRequestedAt: requestedAt, scheduledDeletionAt, updatedAt: requestedAt, version: bumpVersion() })
    .where(and(eq(users.id, userId), isNull(users.deletionRequestedAt)))
    .returning({ id: users.id });
  if (updated.length === 0) {
    throw new AppError("ACCOUNT_DELETION_ALREADY_REQUESTED", "account deletion has already been requested", 409);
  }

  // Review finding: the CAS write above is the source of truth for "has this account's
  // deletion been scheduled" — once it succeeds, a transient failure sending the
  // confirmation email or publishing the domain event must not throw and leave the
  // account permanently stuck (the CAS guard above would reject every future retry with
  // ACCOUNT_DELETION_ALREADY_REQUESTED, with no way to recover). Logged, not silently
  // swallowed (AD-17), but best-effort rather than blocking the already-correct response.
  const [emailResult, publishResult] = await Promise.allSettled([
    notificationPort.sendEmail({
      to: user.email,
      subject: "Your Usavvy account deletion request",
      body: `We've received your request to delete your Usavvy account. Your account and personal data will be removed within 30 days, on ${scheduledDeletionAt.toISOString()}. If this wasn't you, contact support immediately.`,
    }),
    pubSubPort.publish({
      type: "user.deletion_requested",
      payload: { userId, scheduledDeletionAt: scheduledDeletionAt.toISOString() },
    }),
  ]);
  if (emailResult.status === "rejected") {
    logger.error("account-deletion confirmation email failed", { userId, reason: String(emailResult.reason) });
  }
  if (publishResult.status === "rejected") {
    logger.error("account-deletion domain event publish failed", { userId, reason: String(publishResult.reason) });
  }

  return { scheduledDeletionAt: scheduledDeletionAt.toISOString() };
}

/**
 * Story 1.8 (FR-A-8). A thin composition of existing pieces — `getMe` for the account
 * section (no field-mapping logic duplicated), and the three existing row-to-response
 * mappers (Stories 1.3/1.4/1.6) applied to a single `ensureLearnerProfile` read, not
 * three separate queries.
 */
export async function generateDataExport(db: Db, userId: string, role: Role): Promise<DataExport> {
  const me = await getMe(db, userId, role);
  const profileRow = await ensureLearnerProfile(db, userId);
  return {
    account: {
      id: me.id,
      email: me.email,
      displayName: me.displayName,
      memberSince: me.memberSince,
      birthdate: me.birthdate,
      role: me.role,
    },
    learnerProfile: toLearnerProfileResponse(profileRow),
    preferences: toLearnerPreferences(profileRow),
    privacySettings: toPrivacySettings(profileRow),
  };
}
