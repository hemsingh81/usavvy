import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoreClient } from "../src/coreClient.js";
import { createLogger } from "@usavvy/service-kernel";

describe("createCoreClient().fetchHealth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns core's parsed HealthStatus when the HTTP call succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", db: true, storage: true }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createCoreClient("http://localhost:3001", createLogger("test"));
    const result = await client.fetchHealth();

    expect(result).toEqual({ status: "ok", db: true, storage: true });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/health", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("returns unreachable, never throws, when the HTTP call itself fails (AD-17)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createCoreClient("http://localhost:3001", createLogger("test"));
    const result = await client.fetchHealth();

    expect(result).toEqual({ status: "unreachable" });
  });

  it("returns unreachable when core responds with a non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createCoreClient("http://localhost:3001", createLogger("test"));
    const result = await client.fetchHealth();

    expect(result).toEqual({ status: "unreachable" });
  });
});

describe("createCoreClient().forward", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes through core's status code and body unchanged", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 201,
      json: () => Promise.resolve({ userId: "abc" }),
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createCoreClient("http://localhost:3001", createLogger("test"));
    const result = await client.forward("POST", "/auth/signup", { body: { email: "a@example.com", password: "x" } });

    expect(result).toEqual({ status: 201, body: { userId: "abc" } });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/auth/signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@example.com", password: "x" }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("forwards custom headers (e.g. trusted x-user-id) without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ status: 200, json: () => Promise.resolve({ id: "u1" }) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const client = createCoreClient("http://localhost:3001", createLogger("test"));
    await client.forward("GET", "/me", { headers: { "x-user-id": "u1", "x-user-role": "student" } });

    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions.headers).toEqual(expect.objectContaining({ "x-user-id": "u1", "x-user-role": "student" }));
    expect(callOptions).not.toHaveProperty("body");
  });

  it("maps a failed fetch to a 503 CORE_UNREACHABLE envelope rather than throwing (AD-17)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    const client = createCoreClient("http://localhost:3001", createLogger("test"));
    const result = await client.forward("POST", "/auth/login", { body: {} });

    expect(result).toEqual({ status: 503, body: { error: { code: "CORE_UNREACHABLE", message: "unable to reach core service" } } });
  });
});
