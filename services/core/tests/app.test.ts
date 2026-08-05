import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { buildApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";
import { loadCoreConfig } from "../src/config.js";
import { createTestAppDeps, TEST_INTERNAL_SECRET } from "./testHelpers.js";

const config = loadCoreConfig(process.env);
const sql = postgres(config.databaseUrl);
const db = createDb(sql);

afterAll(async () => {
  await sql.end();
});

describe("internal-secret trust boundary (review finding)", () => {
  it("GET /health is exempt — no internal secret required", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a non-health request with no x-internal-secret header", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "a@example.com", password: "x" } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("rejects a non-health request with the wrong x-internal-secret", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-internal-secret": "not-the-real-secret" },
      payload: { email: "a@example.com", password: "x" },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a non-health request with the correct x-internal-secret", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "x-internal-secret": TEST_INTERNAL_SECRET },
      payload: { email: "nonexistent@example.com", password: "x" },
    });

    // Reaches the real route logic (invalid credentials), rather than being rejected
    // at the trust-boundary check.
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    await app.close();
  });
});

describe("404 handling", () => {
  it("returns the standard error envelope for an unmatched route", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({ method: "GET", url: "/this-route-does-not-exist" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    await app.close();
  });
});
