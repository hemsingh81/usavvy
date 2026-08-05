import { vi } from "vitest";
import { createLogger } from "@usavvy/service-kernel";
import type { BuildAppDeps } from "../src/app.js";
import type { Db } from "../src/db/client.js";

export const TEST_INTERNAL_SECRET = "test-internal-secret";

export function createTestAppDeps(overrides: Partial<BuildAppDeps> = {}): BuildAppDeps {
  return {
    checkDb: vi.fn().mockResolvedValue(true),
    db: undefined as unknown as Db,
    internalServiceSecret: TEST_INTERNAL_SECRET,
    logger: createLogger("test"),
    ...overrides,
  };
}
