import type { Logger } from "../logger.js";
import type { JobQueuePort } from "./port.js";
import { createPgBossJobQueueAdapter } from "./pgboss.js";
import { createMockJobQueueAdapter } from "./mock.js";

export type JobQueueAdapterName = "mock" | "pgboss";

/**
 * AD-1/AD-12: the one place the mock/real JobQueuePort binding is selected, driven by
 * config rather than hardcoded at each call site. Async because the real adapter must
 * `start()` before it can be used.
 */
export async function createJobQueueAdapter(adapter: JobQueueAdapterName, databaseUrl: string, logger: Logger): Promise<JobQueuePort> {
  switch (adapter) {
    case "mock":
      return createMockJobQueueAdapter();
    case "pgboss":
      return createPgBossJobQueueAdapter(databaseUrl, logger);
  }
}
