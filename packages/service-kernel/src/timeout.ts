/**
 * Shared timeout wrapper — every external network call in this codebase gets an
 * explicit timeout (Story 1.0 convention). Extracted from db.ts (Story 1.1 code
 * review) so non-fetch external calls (e.g. Google's token-verification endpoint)
 * can reuse it instead of each call site inventing its own.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
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
