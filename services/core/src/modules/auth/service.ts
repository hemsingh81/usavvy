import argon2 from "argon2";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { OAuth2Client } from "google-auth-library";
import { AppError } from "@usavvy/service-kernel";
import type { Db } from "../../db/client.js";
import { emailVerificationTokens, users } from "../../db/schema.js";
import type { NotificationPort } from "../notification/index.js";
import { generateRawToken, hashToken } from "./tokens.js";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const UNIQUE_VIOLATION = "23505";

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

export async function signup(
  db: Db,
  notificationPort: NotificationPort,
  input: { email: string; password: string },
): Promise<{ userId: string }> {
  const [existing] = await db.select().from(users).where(eq(users.email, input.email));
  if (existing) {
    throw new AppError("EMAIL_ALREADY_REGISTERED", "an account with this email already exists", 409);
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

  let inserted: UserRow[];
  try {
    inserted = await db.insert(users).values({ email: input.email, passwordHash, role: "student" }).returning();
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
  const [user] = await db.select().from(users).where(eq(users.email, input.email));
  // Same generic message whether the email doesn't exist, the password is wrong, or the
  // account is Google-only (no passwordHash) — never leak which case it was.
  if (!user || !user.passwordHash || !(await argon2.verify(user.passwordHash, input.password))) {
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
    const [tokenRow] = await tx.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.tokenHash, tokenHash));
    if (!tokenRow || tokenRow.usedAt !== null || tokenRow.expiresAt.getTime() < Date.now()) {
      throw new AppError("INVALID_VERIFICATION_TOKEN", "verification link is invalid, expired, or already used", 404);
    }

    const [updatedUser] = await tx
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
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

export async function refreshSession(
  db: Db,
  verifyRefreshToken: (token: string) => { sub: string },
  input: { refreshToken: string },
): Promise<UserSummary> {
  let payload: { sub: string };
  try {
    payload = verifyRefreshToken(input.refreshToken);
  } catch {
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
  let payload: { sub: string; email?: string } | undefined;
  try {
    const ticket = await oauthClient.verifyIdToken({ idToken: input.idToken, audience: googleClientId });
    payload = ticket.getPayload();
  } catch {
    throw new AppError("INVALID_GOOGLE_TOKEN", "Google sign-in failed", 401);
  }
  if (!payload?.sub || !payload.email) {
    throw new AppError("INVALID_GOOGLE_TOKEN", "Google sign-in failed", 401);
  }
  const { sub: googleId, email } = payload;

  const [byGoogleId] = await db.select().from(users).where(eq(users.googleId, googleId));
  if (byGoogleId) {
    return toSummary(byGoogleId);
  }

  const [byEmail] = await db.select().from(users).where(eq(users.email, email));
  if (byEmail) {
    // Link the Google account to the existing email+password account rather than
    // creating a duplicate — and treat it as pre-verified going forward (AC #2).
    const linkedRows = await db
      .update(users)
      .set({ googleId, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() })
      .where(eq(users.id, byEmail.id))
      .returning();
    const linked = linkedRows[0];
    if (!linked) {
      throw new AppError("INTERNAL_ERROR", "failed to link Google account", 500);
    }
    return toSummary(linked);
  }

  const createdRows = await db
    .insert(users)
    .values({ email, googleId, role: "student", emailVerifiedAt: new Date() })
    .returning();
  const created = createdRows[0];
  if (!created) {
    throw new AppError("INTERNAL_ERROR", "failed to create account", 500);
  }
  return toSummary(created);
}

export async function persistRefreshTokenHash(db: Db, userId: string, refreshTokenHash: string): Promise<void> {
  await db.update(users).set({ refreshTokenHash, updatedAt: new Date() }).where(eq(users.id, userId));
}
