import type { Logger } from "./logger.js";
import { withTimeout } from "./timeout.js";

export type QueryExecutor = () => Promise<unknown>;

const PING_TIMEOUT_MS = 5000;

export async function pingDb(execute: QueryExecutor, logger: Logger): Promise<boolean> {
  try {
    await withTimeout(execute(), PING_TIMEOUT_MS);
    return true;
  } catch (error) {
    logger.error("db ping failed", { reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
