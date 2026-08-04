import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb } from "../../../src/db/client.js";
import { emailVerificationTokens, users } from "../../../src/db/schema.js";
import { loadCoreConfig } from "../../../src/config.js";
import { createTestAppDeps } from "../../testHelpers.js";

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
const db = createDb(sql);
const createdEmails: string[] = [];

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
  const email = `auth-routes-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  createdEmails.push(email);
  return email;
}

describe("POST /auth/signup", () => {
  it("returns 201 with a userId", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("signup");

    const response = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "a-long-enough-password" } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ userId: expect.any(String) });
    await app.close();
  });

  it("returns 400 with a VALIDATION_ERROR envelope for a short password", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "x@example.com", password: "short" } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    await app.close();
  });

  it("returns 409 for a duplicate email", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("dup");
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "a-long-enough-password" } });

    const response = await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "another-password" } });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "EMAIL_ALREADY_REGISTERED" } });
    await app.close();
  });
});

describe("POST /auth/login", () => {
  it("returns 403 EMAIL_NOT_VERIFIED for an unverified account", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const email = uniqueEmail("login-unverified");
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "a-long-enough-password" } });

    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email, password: "a-long-enough-password" } });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: "EMAIL_NOT_VERIFIED" } });
    await app.close();
  });
});

describe("POST /auth/verify-email and /auth/refresh", () => {
  it("verifying issues a session, and the resulting refresh token can be used to refresh", async () => {
    // The raw verification token isn't retrievable from its stored hash (one-way) — read
    // it out of the (mocked) sent email the same way a real learner would follow a link.
    const deps = createTestAppDeps({ db });
    const app = buildApp(deps);
    const email = uniqueEmail("verify-then-refresh");
    await app.inject({ method: "POST", url: "/auth/signup", payload: { email, password: "a-long-enough-password" } });

    const sendEmailMock = deps.notificationPort.sendEmail as unknown as { mock: { calls: [{ body: string }][] } };
    const call = sendEmailMock.mock.calls[0]?.[0];
    const match = /token=([^\s]+)/.exec(call?.body ?? "");
    expect(match?.[1]).toBeDefined();
    const rawToken = match![1];

    const verifyResponse = await app.inject({ method: "POST", url: "/auth/verify-email", payload: { token: rawToken } });
    expect(verifyResponse.statusCode).toBe(200);
    const verifyBody = verifyResponse.json();
    expect(verifyBody).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String), user: { email } });

    const refreshResponse = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: verifyBody.refreshToken } });
    expect(refreshResponse.statusCode).toBe(200);
    expect(refreshResponse.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });

    await app.close();
  });

  it("returns 401 for an unknown refresh token", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/auth/refresh", payload: { refreshToken: "not-a-real-token" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_REFRESH_TOKEN" } });
    await app.close();
  });
});

describe("POST /auth/google", () => {
  it("returns 503 when GOOGLE_CLIENT_ID is not configured", async () => {
    const app = buildApp(createTestAppDeps({ db, googleClientId: undefined }));

    const response = await app.inject({ method: "POST", url: "/auth/google", payload: { idToken: "whatever" } });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ error: { code: "GOOGLE_OAUTH_NOT_CONFIGURED" } });
    await app.close();
  });
});
