import type { Logger } from "./logger.js";

export type QueryExecutor = () => Promise<unknown>;

export async function pingDb(execute: QueryExecutor, logger: Logger): Promise<boolean> {
  try {
    await execute();
    return true;
  } catch (error) {
    logger.error("db ping failed", { reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
