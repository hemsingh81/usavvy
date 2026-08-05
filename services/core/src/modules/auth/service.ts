import argon2 from "argon2";
import { eq, sql } from "drizzle-orm";
import postgres from "postgres";
import { OAuth2Client } from "google-auth-library";
import { AppError, withTimeout } from "@usavvy/service-kernel";
import type { Db } from "../../db/client.js";
import { emailVerificationTokens, users } from "../../db/schema.js";
import type { NotificationPort } from "../notification/index.js";
import { generateRawToken, hashToken } from "./tokens.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";
const GOOGLE_VERIFY_TIMEOUT_MS = 5000;

export interface UserSummary {
  id: string;
  email: string;
  role: string;
}

type UserRow = typeof users.$inferSelect;

function toSummary(user: UserRow): UserSummary {
  return { id: user.id, email: user.email, role: user.role };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof postgres.PostgresError && error.code === UNIQUE_VIOLATION;
}

// Review finding: emails were compared/stored as-typed, so "User@Example.com" and
// "user@example.com" could register as distinct accounts.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Bumps the optimistic-concurrency `version` column (Consistency Conventions) —
// review finding: it was set once at insert and never incremented on any write.
function bumpVersion() {
  return sql`${users.version} + 1`;
}

// Review finding: `login` skipped `argon2.verify` entirely when the user/password
// hash was absent, making the response measurably faster than a real wrong-password
// case — a timing side-channel contradicting the function's own "never leak which
// case" comment. Verifying against a fixed dummy hash on every call normalizes the
// timing regardless of which case actually occurred.
const dummyPasswordHashPromise = argon2.hash("timing-normalization-dummy-password", { type: argon2.argon2id });

export async function signup(
  db: Db,
  notificationPort: NotificationPort,
  input: { email: string; password: string },
): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    throw new AppError("EMAIL_ALREADY_REGISTERED", "an account with this email already exists", 409);
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  let inserted: UserRow[];
  try {
    inserted = await db.insert(users).values({ email, passwordHash, role: "student" }).returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("EMAIL_ALREADY_REGISTERED", "an account with this email already exists", 409);
    }
    throw error;
  }
  const user = inserted[0];
  if (!user) {
    throw new AppError("INTERNAL_ERROR", "failed to create account", 500);
  }

  const rawToken = generateRawToken();
  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS),
  });

  // AC #1: verification email via NotificationPort (mock adapter in dev, Story 1.0).
  await notificationPort.sendEmail({
    to: user.email,
    subject: "Verify your Usavvy account",
    body: `Verify your email by visiting: /verify-email?token=${rawToken}`,
  });

  return { userId: user.id };
}

export async function login(db: Db, input: { email: string; password: string }): Promise<UserSummary> {
  const email = normalizeEmail(input.email);
  const [user] = await db.select().from(users).where(eq(users.email, email));

  const dummyPasswordHash = await dummyPasswordHashPromise;
  // Always runs argon2.verify (against a dummy hash when there's no real one to check)
  // so the response timing doesn't reveal which failure case occurred, and any
  // exception from a corrupt stored hash is treated as a normal verification failure
  // rather than surfacing as a 500 (review findings: timing side-channel + missing
  // try/catch).
  const passwordValid = await argon2.verify(user?.passwordHash ?? dummyPasswordHash, input.password).catch(() => false);

  // Same generic message whether the email doesn't exist, the password is wrong, or the
  // account is Google-only (no passwordHash) — never leak which case it was.
  if (!user || !user.passwordHash || !passwordValid) {
    throw new AppError("INVALID_CREDENTIALS", "email or password is incorrect", 401);
  }
  if (!user.emailVerifiedAt) {
    // AC #1: cannot obtain an authenticated session until verified.
    throw new AppError("EMAIL_NOT_VERIFIED", "please verify your email before logging in", 403);
  }
  return toSummary(user);
}

export async function verifyEmail(db: Db, input: { token: string }): Promise<UserSummary> {
  const tokenHash = hashToken(input.token);
  return db.transaction(async (tx) => {
    // Review finding: no row lock meant two concurrent requests for the same
    // still-unused token could both pass the not-yet-used check before either
    // committed. `for("update")` serializes them on this row.
    const [tokenRow] = await tx
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .for("update");
    if (!tokenRow || tokenRow.usedAt !== null || tokenRow.expiresAt.getTime() < Date.now()) {
      throw new AppError("INVALID_VERIFICATION_TOKEN", "verification link is invalid, expired, or already used", 404);
    }

    const [updatedUser] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date(), version: bumpVersion() })
      .where(eq(users.id, tokenRow.userId))
      .returning();
    if (!updatedUser) {
      throw new AppError("INVALID_VERIFICATION_TOKEN", "verification link is invalid, expired, or already used", 404);
    }

    await tx.update(emailVerificationTokens).set({ usedAt: new Date() }).where(eq(emailVerificationTokens.id, tokenRow.id));

    // AC #3: verifying also logs in — return the summary so the route can issue tokens.
    return toSummary(updatedUser);
  });
}

interface RefreshTokenPayload {
  sub: string;
  typ?: string;
}

export async function refreshSession(
  db: Db,
  verifyRefreshToken: (token: string) => RefreshTokenPayload,
  input: { refreshToken: string },
): Promise<UserSummary> {
  let payload: RefreshTokenPayload;
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch {
    throw new AppError("INVALID_REFRESH_TOKEN", "refresh token is invalid or expired", 401);
  }
  // Review finding: access and refresh tokens were structurally indistinguishable
  // (same payload shape, no `typ` claim) — only an incidental hash mismatch prevented
  // an access token from being replayed here. Now checked explicitly.
  if (payload.typ !== "refresh") {
    throw new AppError("INVALID_REFRESH_TOKEN", "refresh token is invalid or expired", 401);
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub));
  if (!user || !user.refreshTokenHash || hashToken(input.refreshToken) !== user.refreshTokenHash) {
    throw new AppError("INVALID_REFRESH_TOKEN", "refresh token is invalid or expired", 401);
  }
  return toSummary(user);
}

// Constructed once — `audience` is passed per-call to `verifyIdToken`, not at construction.
const oauthClient = new OAuth2Client();

export async function googleAuth(db: Db, googleClientId: string, input: { idToken: string }): Promise<UserSummary> {
  let payload: { sub: string; email?: string; email_verified?: boolean } | undefined;
  try {
    // Review finding: no explicit timeout on this external call, deviating from this
    // codebase's own "every external network call gets a timeout" discipline.
    const ticket = await withTimeout(oauthClient.verifyIdToken({ idToken: input.idToken, audience: googleClientId }), GOOGLE_VERIFY_TIMEOUT_MS);
    payload = ticket.getPayload();
  } catch {
    throw new AppError("INVALID_GOOGLE_TOKEN", "Google sign-in failed", 401);
  }
  // Review finding: the `email_verified` claim was never checked — trusting an
  // unverified Google email for account creation/linking is a known account-takeover
  // vector.
  if (!payload?.sub || !payload.email || payload.email_verified !== true) {
    throw new AppError("INVALID_GOOGLE_TOKEN", "Google sign-in failed", 401);
  }
  const googleId = payload.sub;
  const email = normalizeEmail(payload.email);

  const [byGoogleId] = await db.select().from(users).where(eq(users.googleId, googleId));
  if (byGoogleId) {
    return toSummary(byGoogleId);
  }

  const [byEmail] = await db.select().from(users).where(eq(users.email, email));
  if (byEmail) {
    // Link the Google account to the existing email+password account rather than
    // creating a duplicate — and treat it as pre-verified going forward (AC #2).
    let linkedRows: UserRow[];
    try {
      linkedRows = await db
        .update(users)
        .set({ googleId, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date(), version: bumpVersion() })
        .where(eq(users.id, byEmail.id))
        .returning();
    } catch (error) {
      // Review finding: a concurrent Google sign-in race threw an unhandled 500
      // instead of the mapped conflict `signup()` already produces for the same class
      // of race.
      if (isUniqueViolation(error)) {
        throw new AppError("GOOGLE_ACCOUNT_ALREADY_LINKED", "this Google account is already linked to another user", 409);
      }
      throw error;
    }
    const linked = linkedRows[0];
    if (!linked) {
      throw new AppError("INTERNAL_ERROR", "failed to link Google account", 500);
    }
    return toSummary(linked);
  }

  let createdRows: UserRow[];
  try {
    createdRows = await db.insert(users).values({ email, googleId, role: "student", emailVerifiedAt: new Date() }).returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError("GOOGLE_ACCOUNT_ALREADY_LINKED", "this Google account is already linked to another user", 409);
    }
    throw error;
  }
  const created = createdRows[0];
  if (!created) {
    throw new AppError("INTERNAL_ERROR", "failed to create account", 500);
  }
  return toSummary(created);
}

export async function persistRefreshTokenHash(db: Db, userId: string, refreshTokenHash: string): Promise<void> {
  await db.update(users).set({ refreshTokenHash, updatedAt: new Date(), version: bumpVersion() }).where(eq(users.id, userId));
}
