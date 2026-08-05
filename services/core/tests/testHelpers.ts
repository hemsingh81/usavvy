import { vi } from "vitest";
import { createLogger } from "@usavvy/service-kernel";
import type { BuildAppDeps } from "../src/app.js";
import type { Db } from "../src/db/client.js";
import type { NotificationPort } from "../src/modules/notification/index.js";
import type { PubSubPort } from "../src/modules/pubsub/index.js";

export const TEST_INTERNAL_SECRET = "test-internal-secret";

export function createMockNotificationPort(): NotificationPort {
  return {
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
    sendInApp: vi.fn().mockResolvedValue({ success: true }),
  };
}

export function createMockPubSubPort(): PubSubPort {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Builds a full BuildAppDeps for route-level tests that don't touch the database
 * (e.g. /health). Tests that exercise auth/users routes use the real Postgres
 * container instead (see tests/db/schema.test.ts's precedent) rather than mocking
 * Drizzle's query builder. Non-/health routes require the `x-internal-secret` header
 * (TEST_INTERNAL_SECRET) — see app.ts's review-finding fix.
 */
export function createTestAppDeps(overrides: Partial<BuildAppDeps> = {}): BuildAppDeps {
  return {
    checkDb: vi.fn().mockResolvedValue(true),
    checkStorage: vi.fn().mockResolvedValue(true),
    db: undefined as unknown as Db,
    notificationPort: createMockNotificationPort(),
    pubSubPort: createMockPubSubPort(),
    jwtSecret: "test-secret",
    internalServiceSecret: TEST_INTERNAL_SECRET,
    googleClientId: undefined,
    logger: createLogger("test"),
    ...overrides,
  };
}
