import type { Logger } from "../logger.js";

const PING_TIMEOUT_MS = 5000;

export async function pingStorage(endpoint: string, logger: Logger): Promise<boolean> {
  try {
    await fetch(endpoint, { method: "GET", signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return true;
  } catch (error) {
    logger.error("storage ping failed", { reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
