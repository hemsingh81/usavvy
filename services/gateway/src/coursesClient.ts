import { healthStatusSchema, type DownstreamHealth } from "@usavvy/shared-types";
import type { Logger } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";

const HEALTH_CHECK_TIMEOUT_MS = 5000;
const PROXY_TIMEOUT_MS = 5000;

export interface CoursesClient {
  fetchHealth(): Promise<DownstreamHealth>;
  forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult>;
}

/**
 * Story 2.1 (FR-C-1): a sibling to coreClient.ts, not a generalization of it into one
 * parameterized client — this codebase's own established precedent (forward/forwardBinary
 * staying separate rather than one contorted shared function). No forwardBinary needed
 * here yet; this story has no binary payloads.
 */
export function createCoursesClient(coursesServiceUrl: string, logger: Logger, internalServiceSecret: string): CoursesClient {
  return {
    async fetchHealth(): Promise<DownstreamHealth> {
      try {
        const response = await fetch(`${coursesServiceUrl}/health`, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
        if (!response.ok) {
          logger.error("courses health check returned non-ok status", { status: response.status });
          return { status: "unreachable" };
        }
        const body: unknown = await response.json();
        return healthStatusSchema.parse(body);
      } catch (error) {
        logger.error("courses health check failed", { reason: error instanceof Error ? error.message : String(error) });
        return { status: "unreachable" };
      }
    },

    async forward(method: string, path: string, options?: ProxyOptions): Promise<ProxyResult> {
      try {
        const response = await fetch(`${coursesServiceUrl}${path}`, {
          method,
          headers: { "content-type": "application/json", "x-internal-secret": internalServiceSecret, ...options?.headers },
          signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
          ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        });
        const body: unknown = await response.json().catch(() => undefined);
        return { status: response.status, body };
      } catch (error) {
        logger.error("proxy to courses failed", { path, reason: error instanceof Error ? error.message : String(error) });
        return { status: 503, body: { error: { code: "COURSES_UNREACHABLE", message: "unable to reach courses service" } } };
      }
    },
  };
}
