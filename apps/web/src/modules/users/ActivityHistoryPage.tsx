import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import type { ActivityHistoryEntry } from "@usavvy/shared-types";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready"; entries: ActivityHistoryEntry[] } | { kind: "error"; message: string };

/**
 * Story 1.11 (FR-A-11). Reachable directly (no nav chrome wires it up yet — the same
 * already-accepted gap PreferencesPage/ProfilePage documented for themselves). A
 * read-only reference surface: no re-ordering, no editing, no deletion, and — since
 * getActivityHistory() always returns [] today (no Epic 3/6/7 source data exists yet
 * to aggregate) — the empty state is the only one genuinely reachable in production.
 */
export function ActivityHistoryPage() {
  const { session } = useAuth();
  const [view, setView] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .getActivityHistory(session.accessToken)
      .then((entries) => {
        if (cancelled) return;
        setView({ kind: "ready", entries });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.accessToken]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (view.kind === "loading") {
    return (
      <main>
        <h1>Activity History</h1>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (view.kind === "error") {
    return (
      <main>
        <h1>Activity History</h1>
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Activity History</h1>
      {view.entries.length === 0 ? (
        <p role="status">No activity yet</p>
      ) : (
        <ul className="usavvy-activity-timeline">
          {view.entries.map((entry, index) => (
            <li key={`${entry.type}-${entry.occurredAt}-${index}`} className="usavvy-activity-entry">
              <span className="usavvy-activity-icon" aria-hidden="true" />
              <div>
                <a href={entry.sourceUrl}>{entry.label}</a>
                <p className="usavvy-activity-date">{new Date(entry.occurredAt).toLocaleDateString()}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
