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
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/health");
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
