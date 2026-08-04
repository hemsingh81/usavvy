import { useEffect, useState } from "react";
import type { GatewayHealth } from "@usavvy/shared-types";

export type HealthDisplayState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "degraded"; detail: string }
  | { kind: "error"; detail: string };

/**
 * AD-17: every outcome of the /health call — success, a degraded response, an HTTP
 * error, or the fetch itself failing — maps to a distinguishable, rendered state.
 * There is no path that leaves the UI blank or silently stuck on "loading".
 */
export function useHealthCheck(apiUrl: string): HealthDisplayState {
  const [state, setState] = useState<HealthDisplayState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function check(): Promise<void> {
      try {
        const response = await fetch(`${apiUrl}/health`);
        if (!response.ok) {
          if (!cancelled) {
            setState({ kind: "error", detail: `unexpected response (${response.status})` });
          }
          return;
        }
        const body = (await response.json()) as GatewayHealth;
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
