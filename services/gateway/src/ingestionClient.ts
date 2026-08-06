import { healthStatusSchema, type DownstreamHealth } from "@usavvy/shared-types";
import type { Logger } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const PROXY_TIMEOUT_MS = 5000;

export interface MultipartProxyOptions {
  headers?: Record<string, string>;
}

export interface IngestionClient {
  fetchHealth(): Promise<DownstreamHealth>;
  forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult>;
  forwardMultipart(path: string, contentType: string, rawBody: Buffer, options?: MultipartProxyOptions): Promise<ProxyResult>;
}

/**
 * Story 2.7 (FR-C-7/FR-C-12). A sibling to coreClient.ts/coursesClient.ts, same
 * established precedent of a separate typed client per downstream service.
 * `forwardMultipart` is the opposite direction of core's own `forwardBinary` — a
 * binary/multipart REQUEST body forwarded verbatim, not a binary response. Gateway
 * never parses the multipart body itself (see ingestionProxy.ts's own Dev Notes) — it
 * just relays the exact bytes and content-type (boundary included) ingestion received.
 */
export function createIngestionClient(ingestionServiceUrl: string, logger: Logger, internalServiceSecret: string): IngestionClient {
  return {
    async fetchHealth(): Promise<DownstreamHealth> {
      try {
        const response = await fetch(`${ingestionServiceUrl}/health`, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
        if (!response.ok) {
          logger.error("ingestion health check returned non-ok status", { status: response.status });
          return { status: "unreachable" };
        }
        const body: unknown = await response.json();
        return healthStatusSchema.parse(body);
      } catch (error) {
        logger.error("ingestion health check failed", { reason: error instanceof Error ? error.message : String(error) });
        return { status: "unreachable" };
      }
    },

    async forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult> {
      try {
        const response = await fetch(`${ingestionServiceUrl}${path}`, {
          method,
          headers: { "content-type": "application/json", "x-internal-secret": internalServiceSecret, ...options?.headers },
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
          ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
        const body: unknown = await response.json().catch(() => undefined);
        return { status: response.status, body };
      } catch (error) {
        logger.error("proxy to ingestion failed", { path, reason: error instanceof Error ? error.message : String(error) });
        return { status: 503, body: { error: { code: "INGESTION_UNREACHABLE", message: "unable to reach ingestion service" } } };
      }
    },

    async forwardMultipart(path: string, contentType: string, rawBody: Buffer, options?: MultipartProxyOptions): Promise<ProxyResult> {
      try {
        const response = await fetch(`${ingestionServiceUrl}${path}`, {
          method: "POST",
          headers: { "content-type": contentType, "x-internal-secret": internalServiceSecret, ...options?.headers },
          body: rawBody,
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
        });
        const body: unknown = await response.json().catch(() => undefined);
        return { status: response.status, body };
      } catch (error) {
        logger.error("multipart proxy to ingestion failed", { path, reason: error instanceof Error ? error.message : String(error) });
        return { status: 503, body: { error: { code: "INGESTION_UNREACHABLE", message: "unable to reach ingestion service" } } };
      }
    },
  };
}
