import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardOrchestrationClient } from "../src/boardOrchestrationClient.js";
import { createLogger } from "@usavvy/service-kernel";

describe("createBoardOrchestrationClient().fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns board-orchestration's parsed HealthStatus when the HTTP call succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", db: true, storage: true }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createBoardOrchestrationClient("http://localhost:3004", createLogger("test"), "the-internal-secret");
    const result = await client.fetchHealth();

    expect(result).toEqual({ status: "ok", db: true, storage: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3004/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("returns unreachable, never throws, when the HTTP call itself fails (AD-17)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createBoardOrchestrationClient("http://localhost:3004", createLogger("test"), "the-internal-secret");
    const result = await client.fetchHealth();

    expect(result).toEqual({ status: "unreachable" });
  });

  it("returns unreachable when board-orchestration responds with a non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createBoardOrchestrationClient("http://localhost:3004", createLogger("test"), "the-internal-secret");
    const result = await client.fetchHealth();

    expect(result).toEqual({ status: "unreachable" });
  });
});

describe("createBoardOrchestrationClient().forward", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes through board-orchestration's status code and body unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: () => Promise.resolve({ id: "session-1" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createBoardOrchestrationClient("http://localhost:3004", createLogger("test"), "the-internal-secret");
    const result = await client.forward("POST", "/learning-sessions", { body: { conceptId: "c1", beats: [] } });

    expect(result).toEqual({ status: 201, body: { id: "session-1" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3004/learning-sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conceptId: "c1", beats: [] }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("sends x-internal-secret on every forwarded request", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: () => Promise.resolve({}) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createBoardOrchestrationClient("http://localhost:3004", createLogger("test"), "the-internal-secret");
    await client.forward("GET", "/learning-sessions/s1", { headers: { "x-user-id": "u1", "x-user-role": "student" } });

    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions.headers).toEqual(
      expect.objectContaining({ "x-internal-secret": "the-internal-secret", "x-user-id": "u1", "x-user-role": "student" }),
    );
  });

  it("maps a failed fetch to a 503 BOARD_ORCHESTRATION_UNREACHABLE envelope rather than throwing (AD-17)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createBoardOrchestrationClient("http://localhost:3004", createLogger("test"), "the-internal-secret");
    const result = await client.forward("POST", "/learning-sessions", { body: {} });

    expect(result).toEqual({
      status: 503,
      body: { error: { code: "BOARD_ORCHESTRATION_UNREACHABLE", message: "unable to reach board-orchestration service" } },
    });
  });
});
