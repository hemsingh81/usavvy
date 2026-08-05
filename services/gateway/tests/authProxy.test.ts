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

describe("GET /users/preferences", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "GET", url: "/users/preferences" });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted x-user-id/x-user-role headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { voiceEnabled: true, boardTheme: "dark" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/users/preferences", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("GET", "/users/preferences", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("PUT /users/preferences", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "PUT", url: "/users/preferences", payload: { voiceEnabled: false } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body plus trusted headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { voiceEnabled: false, boardTheme: "dark" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "PUT",
      url: "/users/preferences",
      headers: { authorization: `Bearer ${token}` },
      payload: { voiceEnabled: false },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("PUT", "/users/preferences", {
      body: { voiceEnabled: false },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("PUT /users/display-name", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "PUT", url: "/users/display-name", payload: { displayName: "Ananya" } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body plus trusted headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { displayName: "Ananya" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "PUT",
      url: "/users/display-name",
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: "Ananya" },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("PUT", "/users/display-name", {
      body: { displayName: "Ananya" },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("GET /users/privacy-settings", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "GET", url: "/users/privacy-settings" });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted x-user-id/x-user-role headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { publicLeaderboardSharing: false } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/users/privacy-settings", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("GET", "/users/privacy-settings", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("PUT /users/privacy-settings", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "PUT", url: "/users/privacy-settings", payload: { publicLeaderboardSharing: true } });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body plus trusted headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { publicLeaderboardSharing: true } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "PUT",
      url: "/users/privacy-settings",
      headers: { authorization: `Bearer ${token}` },
      payload: { publicLeaderboardSharing: true },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("PUT", "/users/privacy-settings", {
      body: { publicLeaderboardSharing: true },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("POST /users/account-deletion", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "POST", url: "/users/account-deletion" });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted x-user-id/x-user-role headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { scheduledDeletionAt: "2026-09-04T00:00:00.000Z" } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "POST", url: "/users/account-deletion", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("POST", "/users/account-deletion", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("GET /users/data-export/json", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToCore }));

    const response = await app.inject({ method: "GET", url: "/users/data-export/json" });

    expect(response.statusCode).toBe(401);
    expect(forwardToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted x-user-id/x-user-role headers derived from a valid token", async () => {
    const forwardToCore = vi.fn().mockResolvedValue({ status: 200, body: { account: {} } });
    const app = buildApp(createTestAppDeps({ forwardToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/users/data-export/json", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToCore).toHaveBeenCalledWith("GET", "/users/data-export/json", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });
});

describe("GET /users/data-export/pdf", () => {
  it("returns 401 with no token and never calls core", async () => {
    const forwardBinaryToCore = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardBinaryToCore }));

    const response = await app.inject({ method: "GET", url: "/users/data-export/pdf" });

    expect(response.statusCode).toBe(401);
    expect(forwardBinaryToCore).not.toHaveBeenCalled();
    await app.close();
  });

  it("sets content-type: application/pdf on a successful proxied response", async () => {
    const pdfBytes = Buffer.from("%PDF-1.4");
    const forwardBinaryToCore = vi.fn().mockResolvedValue({ status: 200, body: pdfBytes, contentType: "application/pdf" });
    const app = buildApp(createTestAppDeps({ forwardBinaryToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/users/data-export/pdf", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("application/pdf");
    expect(response.rawPayload.equals(pdfBytes)).toBe(true);
    expect(forwardBinaryToCore).toHaveBeenCalledWith("GET", "/users/data-export/pdf", { headers: { "x-user-id": "u1", "x-user-role": "student" } });
    await app.close();
  });

  it("passes through a JSON error envelope (not as a PDF) when core returns a non-2xx response", async () => {
    const forwardBinaryToCore = vi
      .fn()
      .mockResolvedValue({ status: 500, body: { error: { code: "INTERNAL_ERROR", message: "boom" } }, contentType: "application/json" });
    const app = buildApp(createTestAppDeps({ forwardBinaryToCore }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: "/users/data-export/pdf", headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: "boom" } });
    await app.close();
  });
});
