import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps } from "./testHelpers.js";

describe("/auth/* proxy routes", () => {
  it("forwards signup to core and mirrors its status/body", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 201, body: { userId: "abc" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "POST", url: "/auth/signup", payload: { email: "a@example.com", password: "x" } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ userId: "abc" });
    expect(forwardToCore).toHaveBeenCalledWith("POST", "/auth/signup", { body: { email: "a@example.com", password: "x" } });
    await app.close();
  });

  it("is reachable with no Authorization header at all — /auth/* is pre-authentication", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 403, body: { error: { code: "EMAIL_NOT_VERIFIED", message: "x" } } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "a@example.com", password: "x" } });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("GET /me", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "GET", url: "/me" });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted x-user-id/x-user-role headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { id: "u1", email: "a@example.com", emailVerified: true, role: "student" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/me", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("GET", "/me", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("POST /users/age-declaration", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "POST", url: "/users/age-declaration", payload: { birthdate: "1990-01-01" } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body plus trusted headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { isMinor: false, parentalConsentStatus: "not_required" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: "/users/age-declaration",
      headers: { authorization: `Bearer ${token}` },
      payload: { birthdate: "1990-01-01" },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("POST", "/users/age-declaration", {
      body: { birthdate: "1990-01-01" },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("POST /users/parental-consent", () => {
  it("is reachable with no Authorization header at all — the parent has no account", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { success: true } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "POST", url: "/users/parental-consent", payload: { token: "a-token" } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("POST", "/users/parental-consent", { body: { token: "a-token" } });
    await app.close();
  });
});

describe("GET /users/onboarding", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "GET", url: "/users/onboarding" });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted x-user-id/x-user-role headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { goal: null, currentStep: 0, completedAt: null } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/users/onboarding", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("GET", "/users/onboarding", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("PUT /users/onboarding/step", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "PUT", url: "/users/onboarding/step", payload: { step: "goal", value: "x" } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body plus trusted headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { goal: "learn calculus", currentStep: 1, completedAt: null } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "PUT",
      url: "/users/onboarding/step",
      headers: { authorization: `Bearer ${token}` },
      payload: { step: "goal", value: "learn calculus" },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("PUT", "/users/onboarding/step", {
      body: { step: "goal", value: "learn calculus" },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});
