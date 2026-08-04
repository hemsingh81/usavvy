import type { Logger } from "./logger.js";

export async function pingStorage(endpoint: string, logger: Logger): Promise<boolean> {
  try {
    await fetch(endpoint, { method: "GET" });
    return true;
  } catch (error) {
    logger.error("storage ping failed", { reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
