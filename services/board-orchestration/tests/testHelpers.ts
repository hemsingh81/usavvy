import { vi } from "vitest";
import { createLogger } from "@usavvy/service-kernel";
import type { BuildAppDeps } from "../src/app.js";
import type { Db } from "../src/db/client.js";
import type { VoicePort } from "../src/modules/voice/index.js";
import type { PubSubPort } from "../src/modules/pubsub/index.js";

export const TEST_INTERNAL_SECRET = "test-internal-secret";

export function createMockVoicePort(): VoicePort {
  return {
    reestablishStream: vi.fn().mockResolvedValue({ streamRef: "stream-1" }),
  };
}

export function createMockPubSubPort(): PubSubPort {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Builds a full BuildAppDeps for route-level tests that don't touch the database
 * (e.g. /health). Non-/health routes require the `x-internal-secret` header
 * (TEST_INTERNAL_SECRET) — matches every other service's own app.ts trust-boundary.
 */
export function createTestAppDeps(overrides: Partial<BuildAppDeps> = {}): BuildAppDeps {
  return {
    checkDb: vi.fn().mockResolvedValue(true),
    db: undefined as unknown as Db,
    voicePort: createMockVoicePort(),
    pubSubPort: createMockPubSubPort(),
    internalServiceSecret: TEST_INTERNAL_SECRET,
    logger: createLogger("test"),
    ...overrides,
  };
}
