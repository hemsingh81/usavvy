import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import argon2 from "argon2";
import { createDb, type Db } from "../../../src/db/client.js";
import { emailVerificationTokens, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { createMockNotificationPort } from "../../testHelpers.js";
import { googleAuth, login, persistRefreshTokenHash, refreshSession, signup, verifyEmail } from "../../../src/modules/auth/service.js";
import { hashToken } from "../../../src/modules/auth/tokens.js";

// Integration tests against the real docker-compose Postgres (AD-11), same rationale
// as tests/db/schema.test.ts — password hashing, unique-email races, and token
// expiry/used-once semantics are the actual behavior under test, not mockable value.
const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;
const createdEmails: string[] = [];

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  while (createdEmails.length > 0) {
    const email = createdEmails.pop();
    if (!email) continue;
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) {
      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }
});

afterAll(async () => {
  await sql.end();
});

function uniqueEmail(label: string): string {
  const email = `auth-service-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

describe("signup", () => {
  it("creates an unverified user and sends a verification email via NotificationPort", async () => {
    const email = uniqueEmail("signup");
    const notificationPort = createMockNotificationPort();

    const result = await signup(db, notificationPort, { email, password: "a-long-enough-password" });

    const [user] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(user).toBeDefined();
    expect(user?.email).toBe(email);
    expect(user?.emailVerifiedAt).toBeNull();
    expect(user?.role).toBe("student");
    expect(user?.passwordHash).not.toBe("a-long-enough-password");
    expect(notificationPort.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: email }));
  });

  it("rejects a duplicate email with EMAIL_ALREADY_REGISTERED", async () => {
    const email = uniqueEmail("dup");
    const notificationPort = createMockNotificationPort();
    await signup(db, notificationPort, { email, password: "a-long-enough-password" });

    await expect(signup(db, notificationPort, { email, password: "another-password" })).rejects.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
      statusCode: 409,
    });
  });
});

describe("login", () => {
  it("rejects an unverified account with EMAIL_NOT_VERIFIED", async () => {
    const email = uniqueEmail("unverified");
    await signup(db, createMockNotificationPort(), { email, password: "a-long-enough-password" });

    await expect(login(db, { email, password: "a-long-enough-password" })).rejects.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
      statusCode: 403,
    });
  });

  it("rejects a wrong password with INVALID_CREDENTIALS", async () => {
    const email = uniqueEmail("wrongpw");
    await signup(db, createMockNotificationPort(), { email, password: "a-long-enough-password" });

    await expect(login(db, { email, password: "totally-wrong" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("rejects a nonexistent email with the same INVALID_CREDENTIALS message (no enumeration)", async () => {
    await expect(login(db, { email: "nobody-here@example.com", password: "whatever" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      statusCode: 401,
    });
  });

  it("succeeds once the account is verified", async () => {
    const email = uniqueEmail("verified-login");
    const password = "a-long-enough-password";
    const [user] = await db.insert(users).values({ email, passwordHash: await argon2.hash(password), emailVerifiedAt: new Date() }).returning();
    createdEmails.push(email);

    const result = await login(db, { email, password });
    expect(result).toEqual({ id: user?.id, email, role: "student" });
  });
});

describe("verifyEmail", () => {
  async function signupAndCaptureToken(email: string): Promise<string> {
    const notificationPort = createMockNotificationPort();
    await signup(db, notificationPort, { email, password: "a-long-enough-password" });
    const call = (notificationPort.sendEmail as unknown as { mock: { calls: [{ body: string }][] } }).mock.calls[0]?.[0];
    const match = /token=([^\s]+)/.exec(call?.body ?? "");
    if (!match?.[1]) throw new Error("verification token not found in captured email body");
    return match[1];
  }

  it("verifies the account and returns a session-ready summary", async () => {
    const email = uniqueEmail("verify-ok");
    const rawToken = await signupAndCaptureToken(email);

    const summary = await verifyEmail(db, { token: rawToken });
    expect(summary.email).toBe(email);

    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.emailVerifiedAt).not.toBeNull();
  });

  it("rejects reuse of an already-used token", async () => {
    const email = uniqueEmail("verify-reuse");
    const rawToken = await signupAndCaptureToken(email);
    await verifyEmail(db, { token: rawToken });

    await expect(verifyEmail(db, { token: rawToken })).rejects.toMatchObject({
      code: "INVALID_VERIFICATION_TOKEN",
      statusCode: 404,
    });
  });

  it("rejects an unknown token", async () => {
    await expect(verifyEmail(db, { token: "not-a-real-token" })).rejects.toMatchObject({
      code: "INVALID_VERIFICATION_TOKEN",
      statusCode: 404,
    });
  });

  it("rejects an expired token", async () => {
    const email = uniqueEmail("verify-expired");
    const [user] = await db.insert(users).values({ email, passwordHash: await argon2.hash("x") }).returning();
    createdEmails.push(email);
    const rawToken = `expired-raw-token-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await db.insert(emailVerificationTokens).values({
      userId: user!.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(verifyEmail(db, { token: rawToken })).rejects.toMatchObject({
      code: "INVALID_VERIFICATION_TOKEN",
      statusCode: 404,
    });
  });
});

describe("refreshSession", () => {
  it("succeeds when the token verifies and matches the stored hash", async () => {
    const email = uniqueEmail("refresh-ok");
    const [user] = await db.insert(users).values({ email, passwordHash: await argon2.hash("x"), emailVerifiedAt: new Date() }).returning();
    createdEmails.push(email);
    await persistRefreshTokenHash(db, user!.id, hashToken("a-refresh-token"));

    const verify = () => ({ sub: user!.id });
    const summary = await refreshSession(db, verify, { refreshToken: "a-refresh-token" });
    expect(summary.id).toBe(user!.id);
  });

  it("rejects a token that fails signature/expiry verification", async () => {
    const verify = () => {
      throw new Error("bad signature");
    };
    await expect(refreshSession(db, verify, { refreshToken: "whatever" })).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
      statusCode: 401,
    });
  });

  it("rejects a token that verifies but no longer matches the stored hash (already rotated)", async () => {
    const email = uniqueEmail("refresh-rotated");
    const [user] = await db.insert(users).values({ email, passwordHash: await argon2.hash("x"), emailVerifiedAt: new Date() }).returning();
    createdEmails.push(email);
    await persistRefreshTokenHash(db, user!.id, hashToken("current-token"));

    const verify = () => ({ sub: user!.id });
    await expect(refreshSession(db, verify, { refreshToken: "a-stale-rotated-token" })).rejects.toMatchObject({
      code: "INVALID_REFRESH_TOKEN",
      statusCode: 401,
    });
  });
});

describe("googleAuth", () => {
  it("rejects an unparseable/invalid ID token", async () => {
    await expect(googleAuth(db, "some-client-id.apps.googleusercontent.com", { idToken: "not-a-real-jwt" })).rejects.toMatchObject({
      code: "INVALID_GOOGLE_TOKEN",
      statusCode: 401,
    });
  });
});
