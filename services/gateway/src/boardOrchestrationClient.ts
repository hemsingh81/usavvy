import { healthStatusSchema, type DownstreamHealth } from "@usavvy/shared-types";
import type { Logger } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const PROXY_TIMEOUT_MS = 5000;

export interface BoardOrchestrationClient {
  fetchHealth(): Promise<DownstreamHealth>;
  forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult>;
}

// Story 3.1 (FR-B-1): sibling to coursesClient.ts/ingestionClient.ts, not a shared
// generalization — matches this codebase's established per-service client precedent.
export function createBoardOrchestrationClient(boardOrchestrationServiceUrl: string, logger: Logger, internalServiceSecret: string): BoardOrchestrationClient {
  return {
    async fetchHealth(): Promise<DownstreamHealth> {
      try {
        const response = await fetch(`${boardOrchestrationServiceUrl}/health`, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
        if (!response.ok) {
          logger.error("board-orchestration health check returned non-ok status", { status: response.status });
          return { status: "unreachable" };
        }
        const body: unknown = await response.json();
        return healthStatusSchema.parse(body);
      } catch (error) {
        logger.error("board-orchestration health check failed", { reason: error instanceof Error ? error.message : String(error) });
        return { status: "unreachable" };
      }
    },

    async forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult> {
      try {
        const response = await fetch(`${boardOrchestrationServiceUrl}${path}`, {
          method,
          headers: { "content-type": "application/json", "x-internal-secret": internalServiceSecret, ...options?.headers },
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
          ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
        const body: unknown = await response.json().catch(() => undefined);
        return { status: response.status, body };
      } catch (error) {
        logger.error("proxy to board-orchestration failed", { path, reason: error instanceof Error ? error.message : String(error) });
        return {
          status: 503,
          body: { error: { code: "BOARD_ORCHESTRATION_UNREACHABLE", message: "unable to reach board-orchestration service" } },
        };
      }
    },
  };
}
