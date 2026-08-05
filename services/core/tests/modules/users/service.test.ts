import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { parentalConsentTokens, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { createMockNotificationPort } from "../../testHelpers.js";
import { declareAge, getMe, recordParentalConsent } from "../../../src/modules/users/service.js";
import { hashToken } from "../../../src/modules/auth/tokens.js";

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
      await db.delete(parentalConsentTokens).where(eq(parentalConsentTokens.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }
});

afterAll(async () => {
  await sql.end();
});

function uniqueEmail(label: string): string {
  const email = `users-service-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

// A birthdate that's unambiguously an adult (age math itself is covered exhaustively
// in age.test.ts — these tests only need "definitely adult" / "definitely minor").
const ADULT_BIRTHDATE = "1990-01-01";
const MINOR_BIRTHDATE = new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe("getMe", () => {
  it("returns the resolved user's shape for an allowed role, with age fields null before declaration", async () => {
    const email = uniqueEmail("me");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me).toEqual({
      id: user!.id,
      email,
      emailVerified: true,
      role: "student",
      birthdate: null,
      isMinor: null,
      parentalConsentStatus: null,
    });
  });

  it("reports emailVerified: false for an unverified user", async () => {
    const email = uniqueEmail("unverified");
    const [user] = await db.insert(users).values({ email }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me.emailVerified).toBe(false);
  });

  it("throws NOT_FOUND for a user id that doesn't exist", async () => {
    await expect(getMe(db, "00000000-0000-0000-0000-000000000000", "student")).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });

  it("derives isMinor/parentalConsentStatus from birthdate dynamically rather than a stored snapshot", async () => {
    const email = uniqueEmail("derived-adult");
    const [user] = await db.insert(users).values({ email, birthdate: ADULT_BIRTHDATE }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me.isMinor).toBe(false);
    expect(me.parentalConsentStatus).toBe("not_required");
  });
});

describe("declareAge", () => {
  it("sets birthdate and returns not_required for an adult, sending no email", async () => {
    const email = uniqueEmail("adult");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const notificationPort = createMockNotificationPort();

    const result = await declareAge(db, notificationPort, user!.id, { birthdate: ADULT_BIRTHDATE });

    expect(result).toEqual({ isMinor: false, parentalConsentStatus: "not_required" });
    expect(notificationPort.sendEmail).not.toHaveBeenCalled();
    const [updated] = await db.select().from(users).where(eq(users.id, user!.id));
    expect(updated?.birthdate).toBe(ADULT_BIRTHDATE);
    expect(updated?.parentEmail).toBeNull();
  });

  it("sets birthdate + parentEmail and sends a consent email for a minor", async () => {
    const email = uniqueEmail("minor");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const notificationPort = createMockNotificationPort();

    const result = await declareAge(db, notificationPort, user!.id, { birthdate: MINOR_BIRTHDATE, parentEmail: "Parent@Example.com" });

    expect(result).toEqual({ isMinor: true, parentalConsentStatus: "pending" });
    expect(notificationPort.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "parent@example.com" }));
    const [updated] = await db.select().from(users).where(eq(users.id, user!.id));
    expect(updated?.parentEmail).toBe("parent@example.com");
    expect(updated?.parentConsentedAt).toBeNull();
  });

  it("rejects a minor declaration missing parentEmail", async () => {
    const email = uniqueEmail("minor-no-parent");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    await expect(declareAge(db, createMockNotificationPort(), user!.id, { birthdate: MINOR_BIRTHDATE })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });
  });

  it("rejects a second declaration for the same account", async () => {
    const email = uniqueEmail("already-declared");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date(), birthdate: ADULT_BIRTHDATE }).returning();

    await expect(declareAge(db, createMockNotificationPort(), user!.id, { birthdate: ADULT_BIRTHDATE })).rejects.toMatchObject({
      code: "AGE_ALREADY_DECLARED",
      statusCode: 409,
    });
  });
});

describe("recordParentalConsent", () => {
  async function declareMinorAndCaptureToken(email: string): Promise<string> {
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const notificationPort = createMockNotificationPort();
    await declareAge(db, notificationPort, user!.id, { birthdate: MINOR_BIRTHDATE, parentEmail: "parent@example.com" });
    const call = (notificationPort.sendEmail as unknown as { mock: { calls: [{ body: string }][] } }).mock.calls[0]?.[0];
    const match = /token=([^\s]+)/.exec(call?.body ?? "");
    if (!match?.[1]) throw new Error("consent token not found in captured email body");
    return match[1];
  }

  it("marks consent granted and the token used", async () => {
    const email = uniqueEmail("consent-ok");
    const rawToken = await declareMinorAndCaptureToken(email);

    const result = await recordParentalConsent(db, { token: rawToken });

    expect(result).toEqual({ success: true });
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user?.parentConsentedAt).not.toBeNull();
    const me = await getMe(db, user!.id, "student");
    expect(me.parentalConsentStatus).toBe("granted");
  });

  it("rejects reuse of an already-used consent token", async () => {
    const email = uniqueEmail("consent-reuse");
    const rawToken = await declareMinorAndCaptureToken(email);
    await recordParentalConsent(db, { token: rawToken });

    await expect(recordParentalConsent(db, { token: rawToken })).rejects.toMatchObject({
      code: "INVALID_CONSENT_TOKEN",
      statusCode: 404,
    });
  });

  it("rejects an unknown token", async () => {
    await expect(recordParentalConsent(db, { token: "not-a-real-token" })).rejects.toMatchObject({
      code: "INVALID_CONSENT_TOKEN",
      statusCode: 404,
    });
  });

  it("rejects an expired token", async () => {
    const email = uniqueEmail("consent-expired");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const rawToken = `expired-consent-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await db.insert(parentalConsentTokens).values({
      userId: user!.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(recordParentalConsent(db, { token: rawToken })).rejects.toMatchObject({
      code: "INVALID_CONSENT_TOKEN",
      statusCode: 404,
    });
  });
});
