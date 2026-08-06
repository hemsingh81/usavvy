import type { Logger } from "../logger.js";
import type { StoragePort } from "./port.js";

const REQUEST_TIMEOUT_MS = 30000;

/**
 * AD-6's dev adapter: SeaweedFS's S3-compatible gateway, run with no identity/auth
 * configured (see infra/docker-compose.yml) — a plain, unsigned `fetch` against
 * `${endpoint}/<bucket>/<key>` is all that's needed, same unauthenticated-fetch
 * precedent `pingStorage` already established against this same endpoint. No AWS SDK
 * dependency; a hosted S3/GCS adapter (which WOULD need real signing) is a future,
 * separate adapter behind the same `StoragePort` interface.
 */
export function createSeaweedFsStorageAdapter(endpoint: string, bucket: string, logger: Logger): StoragePort {
  function objectUrl(key: string): string {
    return `${endpoint}/${bucket}/${key}`;
  }

  return {
    async putObject(key, data, contentType) {
      const response = await fetch(objectUrl(key), {
        method: "PUT",
        headers: { "content-type": contentType },
        body: data,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        logger.error("storage putObject failed", { key, status: response.status });
        throw new Error(`storage putObject failed with status ${response.status}`);
      }
    },

    async getObject(key) {
      const response = await fetch(objectUrl(key), { method: "GET", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        logger.error("storage getObject failed", { key, status: response.status });
        throw new Error(`storage getObject failed with status ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },

    async deleteObject(key) {
      const response = await fetch(objectUrl(key), { method: "DELETE", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) {
        logger.error("storage deleteObject failed", { key, status: response.status });
        throw new Error(`storage deleteObject failed with status ${response.status}`);
      }
    },
  };
}
