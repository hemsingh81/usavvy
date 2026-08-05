import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb } from "../../../src/db/client.js";
import { learnerProfiles, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { createTestAppDeps, TEST_INTERNAL_SECRET } from "../../testHelpers.js";

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
const db = createDb(sql);
const createdEmails: string[] = [];
const internalHeaders = { "x-internal-secret": TEST_INTERNAL_SECRET };

afterEach(async () => {
  while (createdEmails.length > 0) {
    const email = createdEmails.pop();
    if (!email) continue;
    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (user) await db.delete(learnerProfiles).where(eq(learnerProfiles.userId, user.id));
    await db.delete(users).where(eq(users.email, email));
  }
});

afterAll(async () => {
  await sql.end();
});

describe("GET /me", () => {
  it("returns the user's shape when trusted headers are present (set only by gateway)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = `users-routes-${Date.now()}@example.com`;
    createdEmails.push(email);
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
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
    await app.close();
  });

  it("returns 401 when the trusted headers are missing (even with a valid internal secret)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/me", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("returns 401 when x-user-role is not a recognized role", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { ...internalHeaders, "x-user-id": "00000000-0000-0000-0000-000000000000", "x-user-role": "not-a-real-role" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 401 when the internal secret is missing, even with otherwise-valid trusted headers (review finding: unenforced trust boundary)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = `users-routes-nosecret-${Date.now()}@example.com`;
    createdEmails.push(email);
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({ method: "GET", url: "/me", headers: { "x-user-id": user!.id, "x-user-role": "student" } });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

function uniqueEmail(label: string): string {
  const email = `users-routes-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

describe("POST /users/age-declaration", () => {
  it("requires authentication (401 with no trusted headers, even with a valid internal secret)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "POST",
      url: "/users/age-declaration",
      headers: internalHeaders,
      payload: { birthdate: "1990-01-01" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("declares an adult and returns not_required", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("age-adult");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "POST",
      url: "/users/age-declaration",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { birthdate: "1990-01-01" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ isMinor: false, parentalConsentStatus: "not_required" });
    await app.close();
  });

  it("rejects a birthdate in the future with a VALIDATION_ERROR envelope", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("age-future");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "POST",
      url: "/users/age-declaration",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { birthdate: "2999-01-01" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects a birthdate more than 120 years ago with a VALIDATION_ERROR envelope (review finding: Task 2's own required coverage was missing)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("age-implausibly-old");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "POST",
      url: "/users/age-declaration",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { birthdate: "1900-01-01" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("returns 409 AGE_ALREADY_DECLARED through the real route on a second declaration (review finding: only service-level tested before)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("age-already-declared-http");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const headers = { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" };

    const first = await app.inject({ method: "POST", url: "/users/age-declaration", headers, payload: { birthdate: "1990-01-01" } });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: "/users/age-declaration", headers, payload: { birthdate: "1991-01-01" } });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: "AGE_ALREADY_DECLARED" } });
    await app.close();
  });

  it("rejects a minor declaring their own account email as the parent's email (review finding: self-consent bypass)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("age-self-consent");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "POST",
      url: "/users/age-declaration",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { birthdate: "2015-01-01", parentEmail: email },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });
});

describe("POST /users/parental-consent", () => {
  it("is reachable with no x-user-id/x-user-role at all (the parent has no account) — still requires the internal secret like every other non-/health route", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "POST",
      url: "/users/parental-consent",
      headers: internalHeaders,
      payload: { token: "not-a-real-token" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_CONSENT_TOKEN" } });
    await app.close();
  });

  it("returns 401 with no internal secret at all, before even reaching the route logic", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/users/parental-consent", payload: { token: "not-a-real-token" } });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});

describe("GET /users/onboarding", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/users/onboarding", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns an all-null row on first call", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("onboarding-get");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "GET",
      url: "/users/onboarding",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ goal: null, currentStep: 0, completedAt: null });
    await app.close();
  });
});

describe("PUT /users/onboarding/step", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: internalHeaders,
      payload: { step: "goal", value: "learn calculus" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("saves a step and returns the updated profile", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("onboarding-put");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { step: "goal", value: "learn calculus" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ goal: "learn calculus", currentStep: 1 });
    await app.close();
  });

  it("rejects an attempt to skip ahead to a step not yet reached (review finding: onboarding could be marked complete with every field still null)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("onboarding-skip-ahead-http");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { step: "level", value: "beginner" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects an unrecognized step key with a VALIDATION_ERROR envelope", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("onboarding-bad-step");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { step: "not-a-real-step", value: "x" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects a targetDate in the past", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("onboarding-past-target-date");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { step: "targetDate", value: "2000-01-01" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects a missing targetDate value (must be an explicit choice)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("onboarding-missing-target-date");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { step: "targetDate" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });
});

describe("GET /users/preferences", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/users/preferences", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns the default preferences on first call", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("preferences-get");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "GET",
      url: "/users/preferences",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    // Review finding: asserting only 2 of 6 fields wouldn't catch a bug that drops or
    // mis-serializes one of the other four specifically at the HTTP response boundary.
    expect(response.json()).toEqual({
      voiceEnabled: true,
      speechRate: 1,
      boardTheme: "dark",
      explanationStyle: "concise",
      captionsEnabled: false,
      reducedMotion: false,
      colorTheme: "indigo-focus",
    });
    await app.close();
  });
});

describe("PUT /users/preferences", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: internalHeaders,
      payload: { voiceEnabled: false },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("saves a partial update and returns the full preferences shape", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("preferences-put");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { boardTheme: "paper" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ boardTheme: "paper", voiceEnabled: true });
    await app.close();
  });

  it("rejects an empty update body with a VALIDATION_ERROR envelope", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("preferences-empty");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects an out-of-bounds speechRate", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("preferences-bad-rate");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { speechRate: 5 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects an unrecognized boardTheme value (review finding: only schema-unit-tested before, not through the real route)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("preferences-bad-theme");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { boardTheme: "neon" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects an unrecognized explanationStyle value", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("preferences-bad-style");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { explanationStyle: "sarcastic" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });
});

describe("PUT /users/display-name", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "PUT",
      url: "/users/display-name",
      headers: internalHeaders,
      payload: { displayName: "Ananya" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("saves the display name and returns the updated /me-shaped response", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("display-name-put");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/display-name",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { displayName: "Ananya" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ displayName: "Ananya", email });
    await app.close();
  });

  it("rejects an empty display name with a VALIDATION_ERROR envelope", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("display-name-empty");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/display-name",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { displayName: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("rejects a display name over 60 characters", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("display-name-toolong");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/display-name",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { displayName: "a".repeat(61) },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });
});

describe("GET /users/privacy-settings", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/users/privacy-settings", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns the default privacy settings on first call", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("privacy-get");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "GET",
      url: "/users/privacy-settings",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ publicLeaderboardSharing: false, cohortDisplayName: true, uploadsForTraining: false });
    await app.close();
  });
});

describe("PUT /users/privacy-settings", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "PUT",
      url: "/users/privacy-settings",
      headers: internalHeaders,
      payload: { publicLeaderboardSharing: true },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("saves a partial update and returns the full privacy-settings shape", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("privacy-put");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/privacy-settings",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: { uploadsForTraining: true },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ uploadsForTraining: true, cohortDisplayName: true });
    await app.close();
  });

  it("rejects an empty update body with a VALIDATION_ERROR envelope", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("privacy-empty");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "PUT",
      url: "/users/privacy-settings",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });
});

describe("POST /users/account-deletion", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/users/account-deletion", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with a scheduledDeletionAt field on a valid request", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("account-deletion");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "POST",
      url: "/users/account-deletion",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ scheduledDeletionAt: expect.any(String) });
    await app.close();
  });

  it("returns 409 ACCOUNT_DELETION_ALREADY_REQUESTED through the real route on a second request", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("account-deletion-twice");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();
    const headers = { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" };

    const first = await app.inject({ method: "POST", url: "/users/account-deletion", headers });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: "/users/account-deletion", headers });

    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: "ACCOUNT_DELETION_ALREADY_REQUESTED" } });
    await app.close();
  });
});

describe("GET /users/data-export/json", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/users/data-export/json", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with the expected top-level keys", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("export-json");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "GET",
      url: "/users/data-export/json",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json())).toEqual(
      expect.arrayContaining(["account", "learnerProfile", "preferences", "privacySettings"]),
    );
    await app.close();
  });
});

describe("GET /users/data-export/pdf", () => {
  it("requires authentication (401 with no trusted headers)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/users/data-export/pdf", headers: internalHeaders });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 200 with application/pdf content-type and PDF magic bytes", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("export-pdf");
    const [user] = await db.insert(users).values({ email, emailVerifiedAt: new Date() }).returning();

    const response = await app.inject({
      method: "GET",
      url: "/users/data-export/pdf",
      headers: { ...internalHeaders, "x-user-id": user!.id, "x-user-role": "student" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.rawPayload.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    await app.close();
  });
});
