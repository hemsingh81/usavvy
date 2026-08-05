import { useEffect, useRef, useState } from "react";
import { Form } from "radix-ui";
import { Navigate } from "react-router-dom";
import type { LearnerPrivacySettings, MeResponse } from "@usavvy/shared-types";
import { Avatar, Switch, TextField } from "../../shared/index.js";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };
type PrivacyFieldErrors = Partial<Record<keyof LearnerPrivacySettings, string>>;

/**
 * AC #1/#2: reached directly (no nav chrome wires it up yet — same gap Stories 1.3/1.4
 * documented for themselves). Protected — no session means no identity to display.
 *
 * Rescoped per Story 1.5's own Dev Notes (following the Implementation Readiness
 * Report's finding that epics.md's AC bundles fields owned by later epics):
 * displayName/avatar/memberSince (Story 1.5) and privacy toggles (Story 1.6, FR-A-6)
 * are the real, editable identity/settings data this page owns. Stars/streak/courses/
 * certificates still render as explicit, static placeholder text — never fabricated
 * numbers — since engagement/courses/plans-progress aren't scaffolded yet.
 */
export function ProfilePage() {
  const { session, getMe } = useAuth();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [me, setMe] = useState<MeResponse | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [privacy, setPrivacy] = useState<LearnerPrivacySettings | null>(null);
  const [privacyErrors, setPrivacyErrors] = useState<PrivacyFieldErrors>({});
  const isMountedRef = useRef(true);
  // Review finding (Story 1.5, all three review layers): overlapping saves (edit,
  // blur, edit again, blur again before the first request resolves) previously let
  // whichever response *arrived* last win, not whichever request was *issued* last.
  // Keyed per-field (Story 1.6 Dev Notes: generalized from a single counter once a
  // second independently-saving field — the privacy toggles — was added to this same
  // page) so one field's save can never invalidate a different field's in-flight one.
  const requestIdRef = useRef<Record<string, number>>({});
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
    const { apiUrl } = getWebConfig();
    Promise.all([getMe(session.accessToken), createUsersApi(apiUrl).getPrivacySettings(session.accessToken)])
      .then(([meResult, privacyResult]) => {
        if (cancelled) return;
        setMe(meResult);
        setDisplayNameInput(meResult.displayName);
        setPrivacy(privacyResult);
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
      // an actual change). An empty value falls through to the real save path below —
      // TextField isn't rendered with `required` here, so no client-side short-circuit
      // exists; the server's VALIDATION_ERROR is what actually rejects it.
      if (me) {
        setDisplayNameInput(me.displayName);
        setFieldError(undefined);
      }
      return;
    }
    const previous = me;
    setFieldError(undefined);
    const requestId = (requestIdRef.current.displayName = (requestIdRef.current.displayName ?? 0) + 1);
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .updateDisplayName(accessToken, { displayName: trimmed })
      .then((updated) => {
        if (!isMountedRef.current || requestIdRef.current.displayName !== requestId) return;
        setMe(updated);
        setDisplayNameInput(updated.displayName);
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current || requestIdRef.current.displayName !== requestId) return;
        setDisplayNameInput(previous.displayName);
        setFieldError(error instanceof ApiError ? error.message : "something went wrong — please try again");
      });
  }

  // Story 1.6 (FR-A-6): each toggle auto-saves independently on change, matching
  // PreferencesPage's established per-control pattern exactly — optimistic update,
  // merge only the one changed field into state (Story 1.4 review finding — never
  // replace the whole object with a single field's response), reverted with an inline
  // error on failure, race-guarded per field via the shared requestIdRef.
  function savePrivacyField<K extends keyof LearnerPrivacySettings>(field: K, value: LearnerPrivacySettings[K]): void {
    if (!privacy) return;
    const previous = privacy[field];
    setPrivacy((current) => (current ? { ...current, [field]: value } : current));
    setPrivacyErrors((current) => ({ ...current, [field]: undefined }));
    const requestId = (requestIdRef.current[field] = (requestIdRef.current[field] ?? 0) + 1);
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .savePrivacySettings(accessToken, { [field]: value } as Partial<LearnerPrivacySettings>)
      .then((updated) => {
        if (!isMountedRef.current || requestIdRef.current[field] !== requestId) return;
        setPrivacy((current) => (current ? { ...current, [field]: updated[field] } : current));
      })
      .catch((error: unknown) => {
        if (!isMountedRef.current || requestIdRef.current[field] !== requestId) return;
        setPrivacy((current) => (current ? { ...current, [field]: previous } : current));
        setPrivacyErrors((current) => ({
          ...current,
          [field]: error instanceof ApiError ? error.message : "something went wrong — please try again",
        }));
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

  if (view.kind === "error" || !me || !privacy) {
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
        <Avatar label={me.displayName} colorSeed={me.id} />
        {/* Form.Root: TextField uses Radix Form.Field internally, which requires a
            Form.Root ancestor (Story 1.3/1.4's established fix for this exact gap). */}
        <Form.Root onSubmit={(event) => event.preventDefault()} style={{ flex: 1 }}>
          <TextField
            name="displayName"
            label="Display name"
            value={displayNameInput}
            maxLength={60}
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

      <Switch
        label="Public leaderboard sharing"
        checked={privacy.publicLeaderboardSharing}
        onCheckedChange={(value) => savePrivacyField("publicLeaderboardSharing", value)}
      />
      {privacyErrors.publicLeaderboardSharing ? (
        <span className="usavvy-message-error" role="alert">
          {privacyErrors.publicLeaderboardSharing}
        </span>
      ) : null}

      <Switch
        label="Display name in cohorts"
        checked={privacy.cohortDisplayName}
        onCheckedChange={(value) => savePrivacyField("cohortDisplayName", value)}
      />
      {privacyErrors.cohortDisplayName ? (
        <span className="usavvy-message-error" role="alert">
          {privacyErrors.cohortDisplayName}
        </span>
      ) : null}

      <Switch
        label="Use my uploads to improve Usavvy"
        checked={privacy.uploadsForTraining}
        onCheckedChange={(value) => savePrivacyField("uploadsForTraining", value)}
      />
      {privacyErrors.uploadsForTraining ? (
        <span className="usavvy-message-error" role="alert">
          {privacyErrors.uploadsForTraining}
        </span>
      ) : null}
    </main>
  );
}
