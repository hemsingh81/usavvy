import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb } from "../../../src/db/client.js";
import { users } from "../../../src/db/schema.js";
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
    if (email) await db.delete(users).where(eq(users.email, email));
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
