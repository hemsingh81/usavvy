import { healthStatusSchema, type DownstreamHealth } from "@usavvy/shared-types";
import type { Logger } from "@usavvy/service-kernel";

export interface CoreClient {
  fetchHealth(): Promise<DownstreamHealth>;
}

const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * AD-13: the typed, decoupled way `gateway` calls `core` over HTTP — callers depend on
 * this interface, never on a raw `fetch` scattered per call site. A failed call (network
 * error or non-ok response) maps to "unreachable" rather than throwing (AD-17).
 */
export function createCoreClient(coreServiceUrl: string, logger: Logger): CoreClient {
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
  };
}
