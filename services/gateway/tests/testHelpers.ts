import { vi } from "vitest";
import { createLogger } from "@usavvy/service-kernel";
import type { BuildAppDeps } from "../src/app.js";

export function createTestAppDeps(overrides: Partial<BuildAppDeps> = {}): BuildAppDeps {
  return {
    fetchCoreHealth: vi.fn().mockResolvedValue({ status: "ok", db: true, storage: true }),
    forwardToCore: vi.fn().mockResolvedValue({ status: 200, body: {} }),
    corsOrigin: "http://localhost:5173",
    jwtSecret: "test-secret",
    logger: createLogger("test"),
    ...overrides,
  };
}
