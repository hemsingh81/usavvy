import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError } from "@usavvy/service-kernel";
import { can, type Role } from "@usavvy/config";
import type { AgeDeclarationResponse, MeResponse, ParentalConsentStatus } from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { parentalConsentTokens, users } from "../../db/schema.js";
import type { NotificationPort } from "../notification/index.js";
import { normalizeEmail } from "../auth/index.js";
import { generateRawToken, hashToken } from "../auth/tokens.js";
import { calculateAge } from "./age.js";

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

export async function getMe(db: Db, userId: string, role: Role): Promise<MeResponse> {
  if (!can(role, "read", "self")) {
    throw new AppError("FORBIDDEN", "not permitted", 403);
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AppError("NOT_FOUND", "user not found", 404);
  }
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    birthdate: user.birthdate,
    ...deriveAgeFields(user),
  };
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
