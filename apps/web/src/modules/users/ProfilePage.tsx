import { useEffect, useRef, useState } from "react";
import { Form } from "radix-ui";
import { Navigate } from "react-router-dom";
import type { MeResponse } from "@usavvy/shared-types";
import { Avatar, TextField } from "../../shared/index.js";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * AC #1/#2: reached directly (no nav chrome wires it up yet — same gap Stories 1.3/1.4
 * documented for themselves). Protected — no session means no identity to display.
 *
 * Rescoped per this story's own Dev Notes (following the Implementation Readiness
 * Report's finding that epics.md's AC bundles fields owned by later epics): only
 * displayName/avatar/memberSince are real, editable identity data this story owns.
 * Stars/streak/courses/certificates/privacy render as explicit, static placeholder
 * text — never fabricated numbers — since engagement/courses/plans-progress aren't
 * scaffolded yet and privacy toggles are Story 1.6's own scope.
 */
export function ProfilePage() {
  const { session, getMe } = useAuth();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [me, setMe] = useState<MeResponse | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const isMountedRef = useRef(true);
  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!session) return;
    // Guards against a stale response landing after the session changed or this page
    // was navigated away from before the request resolved (Story 1.3/1.4 precedent).
    let cancelled = false;
    getMe(session.accessToken)
      .then((result) => {
        if (cancelled) return;
        setMe(result);
        setDisplayNameInput(result.displayName);
        setView({ kind: "ready" });
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
  const { accessToken } = session;

  function handleDisplayNameBlur(): void {
    const trimmed = displayNameInput.trim();
    if (!me || trimmed === me.displayName) {
      // No-op edit (matches PreferencesPage's speechRate precedent of only saving on
      // an actual change) — also covers the empty-string case, which the field's own
      // client-side "required" validation already surfaces without a round trip.
      if (me) setDisplayNameInput(me.displayName);
      return;
    }
    const previous = me;
    setFieldError(undefined);
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .updateDisplayName(accessToken, { displayName: trimmed })
      .then((updated) => {
        if (!isMountedRef.current) return;
        setMe(updated);
        setDisplayNameInput(updated.displayName);
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current) return;
        setDisplayNameInput(previous.displayName);
        setFieldError(error instanceof ApiError ? error.message : "something went wrong — please try again");
      });
  }

  if (view.kind === "loading") {
    return (
      <main>
        <h1>Profile</h1>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (view.kind === "error" || !me) {
    return (
      <main>
        <h1>Profile</h1>
        <div className="usavvy-banner-error" role="alert">
          {view.kind === "error" ? view.message : "something went wrong — please try again"}
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Profile</h1>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-4)" }}>
        <Avatar label={me.displayName} />
        {/* Form.Root: TextField uses Radix Form.Field internally, which requires a
            Form.Root ancestor (Story 1.3/1.4's established fix for this exact gap). */}
        <Form.Root onSubmit={(event) => event.preventDefault()} style={{ flex: 1 }}>
          <TextField
            name="displayName"
            label="Display name"
            value={displayNameInput}
            onChange={(event) => setDisplayNameInput(event.target.value)}
            onBlur={handleDisplayNameBlur}
            {...(fieldError !== undefined ? { serverError: fieldError } : {})}
          />
        </Form.Root>
      </div>
      <p>Member since {new Date(me.memberSince).toLocaleDateString()}</p>

      <div className="usavvy-profile-placeholder">Stars &amp; streaks will appear here once Epic 5 (engagement) ships.</div>
      <div className="usavvy-profile-placeholder">
        Courses in progress and completed will appear here once the catalog (Epic 2) and progress tracking (Epic 4) ship.
      </div>
      <div className="usavvy-profile-placeholder">Certificates will appear here once Epic 5 ships.</div>
      <div className="usavvy-profile-placeholder">Privacy controls will appear here once Story 1.6 ships.</div>
    </main>
  );
}
