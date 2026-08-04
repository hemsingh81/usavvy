import type { Logger } from "./logger.js";

export type QueryExecutor = () => Promise<unknown>;

const PING_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error as Error);
      },
    );
  });
}

export async function pingDb(execute: QueryExecutor, logger: Logger): Promise<boolean> {
  try {
    await withTimeout(execute(), PING_TIMEOUT_MS);
    return true;
  } catch (error) {
    logger.error("db ping failed", { reason: error instanceof Error ? error.message : String(error) });
    return false;
  }
}
