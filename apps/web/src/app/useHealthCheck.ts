import { useEffect, useState } from "react";
import { gatewayHealthSchema } from "@usavvy/shared-types";

export type HealthDisplayState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "degraded"; detail: string }
  | { kind: "error"; detail: string };

const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * AD-17: every outcome of the /health call — success, a degraded response, an HTTP
 * error, a malformed body, a timed-out/hung request, or the fetch itself failing — maps
 * to a distinguishable, rendered state. There is no path that leaves the UI blank or
 * silently stuck on "loading".
 */
export function useHealthCheck(apiUrl: string): HealthDisplayState {
  const [state, setState] = useState<HealthDisplayState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS) });
        if (!response.ok) {
          if (!cancelled) {
            setState({ kind: "error", detail: `unexpected response (${response.status})` });
          }
          return;
        }
        const rawBody: unknown = await response.json();
        const body = gatewayHealthSchema.parse(rawBody);
        if (cancelled) return;
        if (body.core.status === "ok") {
          setState({ kind: "ok" });
        } else {
          const detail = body.core.status === "unreachable" ? "core service unreachable" : "core service degraded";
          setState({ kind: "degraded", detail });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ kind: "error", detail: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    void check();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  return state;
}
