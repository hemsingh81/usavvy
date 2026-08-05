import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { learnerProfiles, parentalConsentTokens, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { createMockNotificationPort } from "../../testHelpers.js";
import { declareAge, getMe, getOnboarding, recordParentalConsent, saveOnboardingStep, updateDisplayName } from "../../../src/modules/users/service.js";
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
      await db.delete(learnerProfiles).where(eq(learnerProfiles.userId, user.id));
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
      onboardingComplete: false,
      displayName: email.split("@")[0],
      memberSince: user!.createdAt.toISOString(),
    });
  });

  it("falls back to the email's local-part for displayName until one is set (Story 1.5)", async () => {
    const email = uniqueEmail("me-no-display-name");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me.displayName).toBe(email.split("@")[0]);
  });

  it("returns the stored displayName once one has been set", async () => {
    const email = uniqueEmail("me-with-display-name");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date(), displayName: "Ananya" }).returning();

    const me = await getMe(db, user!.id, "student");

    expect(me.displayName).toBe("Ananya");
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

  it("rejects a minor supplying their own account email as the parent's (review finding: self-consent bypass)", async () => {
    const email = uniqueEmail("self-consent");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    await expect(
      declareAge(db, createMockNotificationPort(), user!.id, { birthdate: MINOR_BIRTHDATE, parentEmail: email.toUpperCase() }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 });
  });

  it("under two concurrent declarations for the same account, exactly one succeeds (review finding: TOCTOU race on the already-declared check)", async () => {
    const email = uniqueEmail("concurrent-declare");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const results = await Promise.allSettled([
      declareAge(db, createMockNotificationPort(), user!.id, { birthdate: ADULT_BIRTHDATE }),
      declareAge(db, createMockNotificationPort(), user!.id, { birthdate: "1991-01-01" }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "AGE_ALREADY_DECLARED" });
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

const VALID_AVAILABILITY = { monday: 1, tuesday: 0, wednesday: 1, thursday: 0, friday: 1, saturday: 2, sunday: 0 };

describe("getOnboarding", () => {
  it("upsert-on-first-write: creates an all-null row on the first call rather than 404ing", async () => {
    const email = uniqueEmail("onboarding-get-first");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await getOnboarding(db, user!.id);

    expect(result).toEqual({
      goal: null,
      interests: null,
      availability: null,
      sessionLengthMinutes: null,
      targetCompletionDate: null,
      level: null,
      currentStep: 0,
      completedAt: null,
    });
  });

  it("is idempotent — a second call doesn't create a second row or reset progress", async () => {
    const email = uniqueEmail("onboarding-get-idempotent");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "learn calculus" });

    const result = await getOnboarding(db, user!.id);

    expect(result.goal).toBe("learn calculus");
    expect(result.currentStep).toBe(1);
    const rows = await db.select().from(learnerProfiles).where(eq(learnerProfiles.userId, user!.id));
    expect(rows).toHaveLength(1);
  });
});

describe("saveOnboardingStep", () => {
  it("saves the goal step and advances currentStep to 1", async () => {
    const email = uniqueEmail("onboarding-goal");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await saveOnboardingStep(db, user!.id, { step: "goal", value: "learn calculus" });

    expect(result.goal).toBe("learn calculus");
    expect(result.currentStep).toBe(1);
    expect(result.completedAt).toBeNull();
  });

  it("saves the interests step once the goal step has been reached", async () => {
    const email = uniqueEmail("onboarding-interests");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });

    const result = await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math", "physics"] });

    expect(result.interests).toEqual(["math", "physics"]);
  });

  it("saves the availability step once the prior steps have been reached", async () => {
    const email = uniqueEmail("onboarding-availability");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });

    const result = await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY });

    expect(result.availability).toEqual(VALID_AVAILABILITY);
  });

  it("saves the sessionLength step once the prior steps have been reached", async () => {
    const email = uniqueEmail("onboarding-session-length");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });
    await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY });

    const result = await saveOnboardingStep(db, user!.id, { step: "sessionLength", value: 45 });

    expect(result.sessionLengthMinutes).toBe(45);
  });

  it("saves a provided targetDate once the prior steps have been reached", async () => {
    const email = uniqueEmail("onboarding-target-date");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });
    await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY });
    await saveOnboardingStep(db, user!.id, { step: "sessionLength", value: 30 });

    const result = await saveOnboardingStep(db, user!.id, { step: "targetDate", value: "2999-01-01" });

    expect(result.targetCompletionDate).toBe("2999-01-01");
  });

  it("rejects an attempt to skip ahead to a step not yet reached (review finding: onboarding could be marked complete with every field still null)", async () => {
    const email = uniqueEmail("onboarding-skip-ahead");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    await expect(saveOnboardingStep(db, user!.id, { step: "level", value: "beginner" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      statusCode: 400,
    });

    const result = await getOnboarding(db, user!.id);
    expect(result.completedAt).toBeNull();
    expect(result.level).toBeNull();
  });

  it("saves an explicit null targetDate (skip) and still advances currentStep", async () => {
    const email = uniqueEmail("onboarding-target-date-skip");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    for (const step of ["goal", "interests", "availability", "sessionLength"] as const) {
      await saveOnboardingStep(
        db,
        user!.id,
        step === "goal"
          ? { step, value: "x" }
          : step === "interests"
            ? { step, value: ["math"] }
            : step === "availability"
              ? { step, value: VALID_AVAILABILITY }
              : { step, value: 30 },
      );
    }

    const result = await saveOnboardingStep(db, user!.id, { step: "targetDate", value: null });

    expect(result.targetCompletionDate).toBeNull();
    expect(result.currentStep).toBe(5);
  });

  it("sets completedAt only once the final (level) step is saved", async () => {
    const email = uniqueEmail("onboarding-complete");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });
    await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY });
    await saveOnboardingStep(db, user!.id, { step: "sessionLength", value: 30 });
    const beforeLevel = await getOnboarding(db, user!.id);
    expect(beforeLevel.completedAt).toBeNull();
    await saveOnboardingStep(db, user!.id, { step: "targetDate", value: null });

    const result = await saveOnboardingStep(db, user!.id, { step: "level", value: "beginner" });

    expect(result.level).toBe("beginner");
    expect(result.currentStep).toBe(6);
    expect(result.completedAt).not.toBeNull();

    const me = await getMe(db, user!.id, "student");
    expect(me.onboardingComplete).toBe(true);
  });

  it("currentStep is forward-only — re-saving an earlier step after a later one must not regress it", async () => {
    const email = uniqueEmail("onboarding-forward-only");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });
    await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY });

    // Re-save the first step after progressing to step 3.
    const result = await saveOnboardingStep(db, user!.id, { step: "goal", value: "revised goal" });

    expect(result.goal).toBe("revised goal");
    expect(result.currentStep).toBe(3);
  });

  it("does not reset an already-set completedAt when the level step is re-saved", async () => {
    const email = uniqueEmail("onboarding-recomplete");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });
    await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY });
    await saveOnboardingStep(db, user!.id, { step: "sessionLength", value: 30 });
    await saveOnboardingStep(db, user!.id, { step: "targetDate", value: null });
    const first = await saveOnboardingStep(db, user!.id, { step: "level", value: "beginner" });

    const second = await saveOnboardingStep(db, user!.id, { step: "level", value: "advanced" });

    expect(second.level).toBe("advanced");
    expect(second.completedAt).toBe(first.completedAt);
  });

  it("under two concurrent step-saves for the same profile, currentStep reflects the max of both — no lost update", async () => {
    const email = uniqueEmail("onboarding-concurrent");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await saveOnboardingStep(db, user!.id, { step: "goal", value: "x" });
    await saveOnboardingStep(db, user!.id, { step: "interests", value: ["math"] });
    await saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY }); // currentStep now 3

    const results = await Promise.allSettled([
      saveOnboardingStep(db, user!.id, { step: "availability", value: VALID_AVAILABILITY }), // index 2, re-save an already-passed step (2 <= 3)
      saveOnboardingStep(db, user!.id, { step: "sessionLength", value: 30 }), // index 3, exactly the frontier (3 <= 3)
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);

    const result = await getOnboarding(db, user!.id);
    expect(result.currentStep).toBe(4);
    expect(result.sessionLengthMinutes).toBe(30);
  });
});

describe("updateDisplayName", () => {
  it("sets displayName and returns it in the getMe-shaped response", async () => {
    const email = uniqueEmail("display-name-set");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const result = await updateDisplayName(db, user!.id, "student", { displayName: "Ananya" });

    expect(result.displayName).toBe("Ananya");
    const [updated] = await db.select().from(users).where(eq(users.id, user!.id));
    expect(updated?.displayName).toBe("Ananya");
  });

  it("updates only displayName — every other users column is untouched", async () => {
    const email = uniqueEmail("display-name-isolated");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date(), birthdate: ADULT_BIRTHDATE }).returning();

    await updateDisplayName(db, user!.id, "student", { displayName: "Ravi" });

    const [updated] = await db.select().from(users).where(eq(users.id, user!.id));
    expect(updated?.email).toBe(email);
    expect(updated?.birthdate).toBe(ADULT_BIRTHDATE);
  });

  it("a second call overwrites the previous value", async () => {
    const email = uniqueEmail("display-name-overwrite");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    await updateDisplayName(db, user!.id, "student", { displayName: "First" });

    const result = await updateDisplayName(db, user!.id, "student", { displayName: "Second" });

    expect(result.displayName).toBe("Second");
  });

  it("throws NOT_FOUND for a user id that doesn't exist", async () => {
    await expect(updateDisplayName(db, "00000000-0000-0000-0000-000000000000", "student", { displayName: "Ghost" })).rejects.toMatchObject({
      code: "NOT_FOUND",
      statusCode: 404,
    });
  });
});
