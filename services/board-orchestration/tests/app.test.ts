import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps, TEST_INTERNAL_SECRET } from "./testHelpers.js";

describe("GET /health", () => {
  it("returns 200 with status ok when db is reachable", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: true, storage: true });
    await app.close();
  });

  it("returns 200 with status degraded (never 500) when the db check fails (AD-17)", async () => {
    const app = buildApp(createTestAppDeps({ checkDb: async () => false }));

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "degraded", db: false, storage: true });
    await app.close();
  });

  it("returns 200 with status degraded (never 500) even if checkDb violates its contract and rejects", async () => {
    const app = buildApp(createTestAppDeps({ checkDb: async () => Promise.reject(new Error("unexpected")) }));

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "degraded", db: false, storage: true });
    await app.close();
  });
});

describe("internal-secret trust boundary", () => {
  it("GET /health is exempt — no internal secret required", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it("rejects a non-health request with no x-internal-secret header", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({ method: "POST", url: "/learning-sessions", payload: {} });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
    await app.close();
  });

  it("rejects a non-health request with the wrong x-internal-secret", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({
      method: "POST",
      url: "/learning-sessions",
      headers: { "x-internal-secret": "not-the-real-secret" },
      payload: {},
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("accepts a non-health request with the correct x-internal-secret (reaches real route logic, not the trust-boundary check)", async () => {
    const app = buildApp(createTestAppDeps());

    const response = await app.inject({
      method: "POST",
      url: "/learning-sessions",
      headers: { "x-internal-secret": TEST_INTERNAL_SECRET },
      payload: {},
    });

    // No x-user-id/x-user-role headers → rejected by requireTrustedUser, not the
    // trust-boundary preHandler — proves it got past the boundary check.
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: "UNAUTHENTICATED" } });
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
