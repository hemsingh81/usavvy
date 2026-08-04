import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { createTestAppDeps } from "./testHelpers.js";

describe("GET /health", () => {
  it("returns 200 with status ok when db and storage are both reachable", async () => {
    const app = buildApp(
      createTestAppDeps({
        checkDb: vi.fn().mockResolvedValue(true),
        checkStorage: vi.fn().mockResolvedValue(true),
      }),
    );

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", db: true, storage: true });
    await app.close();
  });

  it("returns 200 with status degraded (never 500) when the db check fails — AD-17: the health endpoint itself must not throw", async () => {
    const app = buildApp(
      createTestAppDeps({
        checkDb: vi.fn().mockResolvedValue(false),
        checkStorage: vi.fn().mockResolvedValue(true),
      }),
    );

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "degraded", db: false, storage: true });
    await app.close();
  });

  it("returns 200 with status degraded when the storage check fails", async () => {
    const app = buildApp(
      createTestAppDeps({
        checkDb: vi.fn().mockResolvedValue(true),
        checkStorage: vi.fn().mockResolvedValue(false),
      }),
    );

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "degraded", db: true, storage: false });
    await app.close();
  });

  it("returns 200 with status degraded (never 500) even if a check function violates its contract and rejects (Review finding: defensive backstop)", async () => {
    const app = buildApp(
      createTestAppDeps({
        checkDb: vi.fn().mockRejectedValue(new Error("unexpected")),
        checkStorage: vi.fn().mockResolvedValue(true),
      }),
    );

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "degraded", db: false, storage: false });
    await app.close();
  });
});
