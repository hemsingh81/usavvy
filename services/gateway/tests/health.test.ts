import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns 200 with an aggregated status when core is healthy", async () => {
    const app = buildApp({
      fetchCoreHealth: vi.fn().mockResolvedValue({ status: "ok", db: true, storage: true }),
      corsOrigin: "http://localhost:5173",
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ gateway: { status: "ok" }, core: { status: "ok", db: true, storage: true } });
    await app.close();
  });

  it("returns 200 with core reported degraded, passed through unchanged", async () => {
    const app = buildApp({
      fetchCoreHealth: vi.fn().mockResolvedValue({ status: "degraded", db: false, storage: true }),
      corsOrigin: "http://localhost:5173",
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ gateway: { status: "ok" }, core: { status: "degraded", db: false, storage: true } });
    await app.close();
  });

  it("returns 200 with core reported unreachable (never a hang or 500) — AD-17: proves the network hop is real", async () => {
    const app = buildApp({
      fetchCoreHealth: vi.fn().mockResolvedValue({ status: "unreachable" }),
      corsOrigin: "http://localhost:5173",
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ gateway: { status: "ok" }, core: { status: "unreachable" } });
    await app.close();
  });

  it("returns 200 with core reported unreachable (never 500) even if fetchCoreHealth violates its contract and rejects (Review finding: defensive backstop)", async () => {
    const app = buildApp({
      fetchCoreHealth: vi.fn().mockRejectedValue(new Error("unexpected")),
      corsOrigin: "http://localhost:5173",
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ gateway: { status: "ok" }, core: { status: "unreachable" } });
    await app.close();
  });

  it("responds with the correct CORS header for the dev web origin", async () => {
    const app = buildApp({
      fetchCoreHealth: vi.fn().mockResolvedValue({ status: "ok", db: true, storage: true }),
      corsOrigin: "http://localhost:5173",
    });

    const response = await app.inject({ method: "GET", url: "/health", headers: { origin: "http://localhost:5173" } });

    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    await app.close();
  });
});
