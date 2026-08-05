import { useEffect, useRef, useState } from "react";
import { Form } from "radix-ui";
import { Navigate } from "react-router-dom";
import { DEFAULT_LEARNER_PREFERENCES, type BoardTheme, type ExplanationStyle, type LearnerPreferences } from "@usavvy/shared-types";
import { Switch, TextField } from "../../shared/index.js";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";

type ViewState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };
type FieldErrors = Partial<Record<keyof LearnerPreferences, string>>;

/**
 * AC #1: reached directly (no nav chrome wires it up yet — same gap Story 1.3 documented
 * for itself). Protected — no session means nothing to save preferences against.
 * Not gated on onboardingComplete: nothing in this story's AC ties preferences to
 * onboarding state.
 */
export function PreferencesPage() {
  const { session } = useAuth();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [preferences, setPreferences] = useState<LearnerPreferences>(DEFAULT_LEARNER_PREFERENCES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [speechRateInput, setSpeechRateInput] = useState(String(DEFAULT_LEARNER_PREFERENCES.speechRate));
  // Review finding: unmounting mid-save (e.g. navigating away right after a toggle)
  // shouldn't call setState on a gone component, mirroring the mount effect's guard.
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
    // was navigated away from before the request resolved (Story 1.3 review finding).
    let cancelled = false;
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .getPreferences(session.accessToken)
      .then((result) => {
        if (cancelled) return;
        setPreferences(result);
        setSpeechRateInput(String(result.speechRate));
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

  // Each control auto-saves independently (EXPERIENCE.md's Theme Picker precedent:
  // "applied instantly... no page reload"). Optimistic update, reverted on failure — a
  // failed save must not disturb the other five controls' current values.
  //
  // Review finding: the success/failure handlers below merge only the ONE field this
  // particular request corresponds to (`{ [field]: ... }`) rather than replacing the
  // whole `preferences` object with the server's response. Replacing the whole object
  // let an in-flight save for a *different* field get silently clobbered by whichever
  // response happened to land last, regardless of which request was issued last —
  // confirmed independently by all three code-review layers as the same race.
  async function saveField<K extends keyof LearnerPreferences>(field: K, value: LearnerPreferences[K]): Promise<void> {
    const previous = preferences[field];
    setPreferences((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    try {
      const { apiUrl } = getWebConfig();
      const updated = await createUsersApi(apiUrl).savePreferences(accessToken, { [field]: value } as Partial<LearnerPreferences>);
      if (!isMountedRef.current) return;
      setPreferences((current) => ({ ...current, [field]: updated[field] }));
      if (field === "speechRate") setSpeechRateInput(String(updated.speechRate));
    } catch (error) {
      if (!isMountedRef.current) return;
      setPreferences((current) => ({ ...current, [field]: previous }));
      if (field === "speechRate") setSpeechRateInput(String(previous));
      setFieldErrors((current) => ({
        ...current,
        [field]: error instanceof ApiError ? error.message : "something went wrong — please try again",
      }));
    }
  }

  function handleSpeechRateBlur(): void {
    const parsed = Number(speechRateInput);
    if (Number.isNaN(parsed) || parsed < 0.5 || parsed > 2) {
      setFieldErrors((current) => ({ ...current, speechRate: "Speech rate must be between 0.5 and 2" }));
      setSpeechRateInput(String(preferences.speechRate));
      return;
    }
    void saveField("speechRate", parsed);
  }

  if (view.kind === "loading") {
    return (
      <main>
        <h1>Preferences</h1>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (view.kind === "error") {
    return (
      <main>
        <h1>Preferences</h1>
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Preferences</h1>
      {/* No single submit — every control auto-saves independently — but Radix's
          Form.Field (used below for the enum selects and the speechRate field) still
          requires a Form.Root ancestor. preventDefault since there's nothing to submit. */}
      <Form.Root onSubmit={(event) => event.preventDefault()}>
        <Switch label="Voice" checked={preferences.voiceEnabled} onCheckedChange={(value) => void saveField("voiceEnabled", value)} />
        {fieldErrors.voiceEnabled ? (
          <span className="usavvy-message-error" role="alert">
            {fieldErrors.voiceEnabled}
          </span>
        ) : null}

        <TextField
          name="speechRate"
          label="Speech rate"
          type="number"
          min={0.5}
          max={2}
          step={0.1}
          value={speechRateInput}
          onChange={(event) => setSpeechRateInput(event.target.value)}
          onBlur={handleSpeechRateBlur}
          {...(fieldErrors.speechRate !== undefined ? { serverError: fieldErrors.speechRate } : {})}
        />

        <Form.Field name="boardTheme" className="usavvy-field">
          <Form.Label className="usavvy-label">Board theme</Form.Label>
          <Form.Control asChild>
            <select
              className="usavvy-input"
              value={preferences.boardTheme}
              onChange={(event) => void saveField("boardTheme", event.target.value as BoardTheme)}
            >
              <option value="dark">Dark</option>
              <option value="paper">Paper</option>
            </select>
          </Form.Control>
          {fieldErrors.boardTheme ? (
            <span className="usavvy-message-error" role="alert">
              {fieldErrors.boardTheme}
            </span>
          ) : null}
        </Form.Field>

        <Form.Field name="explanationStyle" className="usavvy-field">
          <Form.Label className="usavvy-label">Explanation style</Form.Label>
          <Form.Control asChild>
            <select
              className="usavvy-input"
              value={preferences.explanationStyle}
              onChange={(event) => void saveField("explanationStyle", event.target.value as ExplanationStyle)}
            >
              <option value="concise">Concise</option>
              <option value="detailed">Detailed</option>
              <option value="example-first">Example-first</option>
              <option value="analogy-first">Analogy-first</option>
            </select>
          </Form.Control>
          {fieldErrors.explanationStyle ? (
            <span className="usavvy-message-error" role="alert">
              {fieldErrors.explanationStyle}
            </span>
          ) : null}
        </Form.Field>

        <Switch label="Captions" checked={preferences.captionsEnabled} onCheckedChange={(value) => void saveField("captionsEnabled", value)} />
        {fieldErrors.captionsEnabled ? (
          <span className="usavvy-message-error" role="alert">
            {fieldErrors.captionsEnabled}
          </span>
        ) : null}

        <Switch label="Reduced motion" checked={preferences.reducedMotion} onCheckedChange={(value) => void saveField("reducedMotion", value)} />
        {fieldErrors.reducedMotion ? (
          <span className="usavvy-message-error" role="alert">
            {fieldErrors.reducedMotion}
          </span>
        ) : null}
      </Form.Root>
    </main>
  );
}
