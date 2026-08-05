import { healthStatusSchema, type DownstreamHealth } from "@usavvy/shared-types";
import type { Logger } from "@usavvy/service-kernel";

export interface ProxyResult {
  status: number;
  body: unknown;
}

export interface ProxyOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export interface CoreClient {
  fetchHealth(): Promise<DownstreamHealth>;
  forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult>;
}

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const PROXY_TIMEOUT_MS = 5000;

/**
 * AD-13: the typed, decoupled way `gateway` calls `core` over HTTP — callers depend on
 * this interface, never on a raw `fetch` scattered per call site. A failed call (network
 * error or non-ok response) maps to "unreachable" rather than throwing (AD-17).
 */
export function createCoreClient(coreServiceUrl: string, logger: Logger, internalServiceSecret: string): CoreClient {
  return {
    async fetchHealth(): Promise<DownstreamHealth> {
      try {
        const response = await fetch(`${coreServiceUrl}/health`, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
        if (!response.ok) {
          logger.error("core health check returned non-ok status", { status: response.status });
          return { status: "unreachable" };
        }
        const body: unknown = await response.json();
        return healthStatusSchema.parse(body);
      } catch (error) {
        logger.error("core health check failed", { reason: error instanceof Error ? error.message : String(error) });
        return { status: "unreachable" };
      }
    },

    async forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult> {
      try {
        const response = await fetch(`${coreServiceUrl}${path}`, {
          method,
          // Review finding: core's trust in x-user-id/x-user-role was previously
          // unenforced — this header proves the request actually came from gateway.
          headers: { "content-type": "application/json", "x-internal-secret": internalServiceSecret, ...options?.headers },
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
          ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
        const body: unknown = await response.json().catch(() => undefined);
        return { status: response.status, body };
      } catch (error) {
        logger.error("proxy to core failed", { path, reason: error instanceof Error ? error.message : String(error) });
        return { status: 503, body: { error: { code: "CORE_UNREACHABLE", message: "unable to reach core service" } } };
      }
    },
  };
}
