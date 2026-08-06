import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps } from "./testHelpers.js";

const VALID_ID = "019fd2fd-0000-7000-8000-000000000001";
const VALID_BEAT_ID = "019fd2fd-0000-7000-8000-000000000002";

describe("POST /learning-sessions", () => {
  it("returns 401 with no token and never calls board-orchestration", async () => {
    const forwardToBoardOrchestration = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));

    const response = await app.inject({ method: "POST", url: "/learning-sessions", payload: { conceptId: "c1", beats: [] } });

    expect(response.statusCode).toBe(401);
    expect(forwardToBoardOrchestration).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards the body and trusted headers derived from a valid token", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 201, body: { id: "s1" } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: "/learning-sessions",
      headers: { authorization: `Bearer ${token}` },
      payload: { conceptId: "c1", beats: [] },
    });

    expect(response.statusCode).toBe(201);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("POST", "/learning-sessions", {
      body: { conceptId: "c1", beats: [] },
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("GET /learning-sessions/:id", () => {
  it("returns 401 with no token and never calls board-orchestration", async () => {
    const forwardToBoardOrchestration = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));

    const response = await app.inject({ method: "GET", url: `/learning-sessions/${VALID_ID}` });

    expect(response.statusCode).toBe(401);
    expect(forwardToBoardOrchestration).not.toHaveBeenCalled();
    await app.close();
  });

  it("interpolates the id param and forwards trusted headers", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "GET", url: `/learning-sessions/${VALID_ID}`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("GET", `/learning-sessions/${VALID_ID}`, {
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });

  it("rejects a path-traversal id with a 400 rather than forwarding it", async () => {
    const forwardToBoardOrchestration = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "GET",
      url: "/learning-sessions/..%2Fother-route",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(forwardToBoardOrchestration).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("POST /learning-sessions/:id/pause", () => {
  it("forwards the body and trusted headers", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID, status: "paused" } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });
    const payload = { currentBeatId: VALID_BEAT_ID, narrationOffsetMs: 1200, boardRenderState: {} };

    const response = await app.inject({
      method: "POST",
      url: `/learning-sessions/${VALID_ID}/pause`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("POST", `/learning-sessions/${VALID_ID}/pause`, {
      body: payload,
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("POST /learning-sessions/:id/resume", () => {
  it("returns 401 with no token and never calls board-orchestration", async () => {
    const forwardToBoardOrchestration = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));

    const response = await app.inject({ method: "POST", url: `/learning-sessions/${VALID_ID}/resume` });

    expect(response.statusCode).toBe(401);
    expect(forwardToBoardOrchestration).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted headers with no body", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID, streamRef: "stream-1" } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "POST", url: `/learning-sessions/${VALID_ID}/resume`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("POST", `/learning-sessions/${VALID_ID}/resume`, {
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("POST /learning-sessions/:id/replay", () => {
  it("returns 401 with no token and never calls board-orchestration", async () => {
    const forwardToBoardOrchestration = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));

    const response = await app.inject({ method: "POST", url: `/learning-sessions/${VALID_ID}/replay` });

    expect(response.statusCode).toBe(401);
    expect(forwardToBoardOrchestration).not.toHaveBeenCalled();
    await app.close();
  });

  it("forwards trusted headers with no body", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID, streamRef: "stream-1" } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "POST", url: `/learning-sessions/${VALID_ID}/replay`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("POST", `/learning-sessions/${VALID_ID}/replay`, {
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});

describe("POST /learning-sessions/:id/beats/:beatId/reached", () => {
  it("interpolates both id params and forwards trusted headers", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: `/learning-sessions/${VALID_ID}/beats/${VALID_BEAT_ID}/reached`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("POST", `/learning-sessions/${VALID_ID}/beats/${VALID_BEAT_ID}/reached`, {
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });

  it("rejects a malformed beatId with a 400 rather than forwarding it", async () => {
    const forwardToBoardOrchestration = vi.fn();
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({
      method: "POST",
      url: `/learning-sessions/${VALID_ID}/beats/not-a-uuid/reached`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(forwardToBoardOrchestration).not.toHaveBeenCalled();
    await app.close();
  });
});

describe("POST /learning-sessions/:id/end", () => {
  it("forwards trusted headers with no body", async () => {
    const forwardToBoardOrchestration = vi.fn().mockResolvedValue({ status: 200, body: { id: VALID_ID, status: "ended" } });
    const app = buildApp(createTestAppDeps({ forwardToBoardOrchestration }));
    await app.ready();
    const token = app.jwt.sign({ sub: "u1", role: "student", typ: "access" });

    const response = await app.inject({ method: "POST", url: `/learning-sessions/${VALID_ID}/end`, headers: { authorization: `Bearer ${token}` } });

    expect(response.statusCode).toBe(200);
    expect(forwardToBoardOrchestration).toHaveBeenCalledWith("POST", `/learning-sessions/${VALID_ID}/end`, {
      headers: { "x-user-id": "u1", "x-user-role": "student" },
    });
    await app.close();
  });
});
