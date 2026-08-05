import { useEffect, useState, type FormEvent } from "react";
import { Form } from "radix-ui";
import { Navigate, useNavigate } from "react-router-dom";
import { ONBOARDING_STEPS, type LearnerProfileResponse, type OnboardingStepInput } from "@usavvy/shared-types";
import { Button, TextField } from "../../shared/index.js";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

const EMPTY_PROFILE: LearnerProfileResponse = {
  goal: null,
  interests: null,
  availability: null,
  sessionLengthMinutes: null,
  targetCompletionDate: null,
  level: null,
  currentStep: 0,
  completedAt: null,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type ViewState = { kind: "loading" } | { kind: "ready" } | { kind: "error"; message: string };

/**
 * AC #1/#2: reached right after onboarding-not-complete is detected (resolvePostAuthDestination)
 * or by direct navigation. Protected — no session means nothing to save progress against.
 * Resume-at-abandoned-step (AC #2) is a read: GET /users/onboarding returns the server's
 * currentStep, and the wizard seeks straight there on mount rather than starting over.
 */
export function OnboardingWizardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewState>({ kind: "loading" });
  const [profile, setProfile] = useState<LearnerProfileResponse>(EMPTY_PROFILE);
  // Which step is currently displayed — seeded from the server's currentStep on load, then
  // advances locally after each successful save (see handleStepSubmit's comment for why
  // this is deliberately NOT re-synced to the server's currentStep on every response).
  const [viewedStep, setViewedStep] = useState(0);
  const [serverError, setServerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!session) return;
    const { apiUrl } = getWebConfig();
    createUsersApi(apiUrl)
      .getOnboarding(session.accessToken)
      .then((result) => {
        setProfile(result);
        setViewedStep(Math.min(result.currentStep, ONBOARDING_STEPS.length - 1));
        setView({ kind: "ready" });
      })
      .catch((error: unknown) => {
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong — please try again" });
      });
    // Only ever runs once per mount — accessToken doesn't change for a given session.
  }, [session?.accessToken]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  const { accessToken } = session;

  if (view.kind === "loading") {
    return (
      <main>
        <h1>Let's get you set up</h1>
        <p role="status">Loading…</p>
      </main>
    );
  }

  if (view.kind === "error") {
    return (
      <main>
        <h1>Let's get you set up</h1>
        <div className="usavvy-banner-error" role="alert">
          {view.message}
        </div>
      </main>
    );
  }

  // AC #1: a direct revisit after finishing shouldn't force the wizard again — the
  // completion landing (the "Browse the catalog" CTA) lives on HomePage, not here.
  if (profile.completedAt !== null) {
    return <Navigate to="/" replace />;
  }

  async function handleStepSubmit(input: OnboardingStepInput): Promise<void> {
    if (submitting) return;
    setServerError(undefined);
    setSubmitting(true);
    try {
      const { apiUrl } = getWebConfig();
      const updated = await createUsersApi(apiUrl).saveOnboardingStep(accessToken, input);
      setProfile(updated);
      if (updated.completedAt !== null) {
        navigate("/");
        return;
      }
      // Advances by one from wherever the learner was viewing, not to the server's
      // (forward-only, never-regressing) currentStep — editing an earlier step after
      // resuming should move to the NEXT step in sequence, not jump ahead to however
      // far this account has ever reached.
      setViewedStep((current) => Math.min(current + 1, ONBOARDING_STEPS.length - 1));
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  const step = ONBOARDING_STEPS[viewedStep];

  return (
    <main>
      <h1>Let's get you set up</h1>
      <p role="status">
        Step {viewedStep + 1} of {ONBOARDING_STEPS.length}
      </p>
      {step === "goal" ? <GoalStep profile={profile} submitting={submitting} onSubmit={handleStepSubmit} /> : null}
      {step === "interests" ? <InterestsStep profile={profile} submitting={submitting} onSubmit={handleStepSubmit} /> : null}
      {step === "availability" ? <AvailabilityStep profile={profile} submitting={submitting} onSubmit={handleStepSubmit} /> : null}
      {step === "sessionLength" ? <SessionLengthStep profile={profile} submitting={submitting} onSubmit={handleStepSubmit} /> : null}
      {step === "targetDate" ? <TargetDateStep profile={profile} submitting={submitting} onSubmit={handleStepSubmit} /> : null}
      {step === "level" ? <LevelStep profile={profile} submitting={submitting} onSubmit={handleStepSubmit} /> : null}
      {serverError ? (
        <div className="usavvy-banner-error" role="alert">
          {serverError}
        </div>
      ) : null}
      {viewedStep > 0 ? (
        <Button type="button" variant="secondary" onClick={() => setViewedStep((current) => Math.max(current - 1, 0))} disabled={submitting}>
          Back
        </Button>
      ) : null}
    </main>
  );
}

interface StepProps {
  profile: LearnerProfileResponse;
  submitting: boolean;
  onSubmit: (input: OnboardingStepInput) => void;
}

function GoalStep({ profile, submitting, onSubmit }: StepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit({ step: "goal", value: String(formData.get("goal") ?? "") });
  }
  return (
    <Form.Root onSubmit={handleSubmit}>
      <TextField name="goal" label="What's your learning goal?" required defaultValue={profile.goal ?? ""} />
      <Form.Submit asChild>
        <Button type="submit" disabled={submitting}>
          Continue
        </Button>
      </Form.Submit>
    </Form.Root>
  );
}

function InterestsStep({ profile, submitting, onSubmit }: StepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const raw = String(formData.get("interests") ?? "");
    const interests = raw
      .split(",")
      .map((interest) => interest.trim())
      .filter((interest) => interest.length > 0);
    onSubmit({ step: "interests", value: interests });
  }
  return (
    <Form.Root onSubmit={handleSubmit}>
      <TextField
        name="interests"
        label="Subject interests (comma-separated)"
        required
        defaultValue={profile.interests?.join(", ") ?? ""}
      />
      <Form.Submit asChild>
        <Button type="submit" disabled={submitting}>
          Continue
        </Button>
      </Form.Submit>
    </Form.Root>
  );
}

function AvailabilityStep({ profile, submitting, onSubmit }: StepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const availability = Object.fromEntries(WEEKDAYS.map((day) => [day, Number(formData.get(day) ?? 0)])) as Record<
      (typeof WEEKDAYS)[number],
      number
    >;
    onSubmit({ step: "availability", value: availability });
  }
  return (
    <Form.Root onSubmit={handleSubmit}>
      <p>How many hours are you available on each day?</p>
      {WEEKDAYS.map((day) => (
        <TextField
          key={day}
          name={day}
          label={day[0]!.toUpperCase() + day.slice(1)}
          type="number"
          min={0}
          max={24}
          step={0.5}
          required
          defaultValue={profile.availability?.[day] ?? 0}
        />
      ))}
      <Form.Submit asChild>
        <Button type="submit" disabled={submitting}>
          Continue
        </Button>
      </Form.Submit>
    </Form.Root>
  );
}

function SessionLengthStep({ profile, submitting, onSubmit }: StepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onSubmit({ step: "sessionLength", value: Number(formData.get("sessionLength") ?? 0) });
  }
  return (
    <Form.Root onSubmit={handleSubmit}>
      <TextField
        name="sessionLength"
        label="Preferred session length (minutes)"
        type="number"
        min={10}
        max={180}
        required
        defaultValue={profile.sessionLengthMinutes ?? 30}
      />
      <Form.Submit asChild>
        <Button type="submit" disabled={submitting}>
          Continue
        </Button>
      </Form.Submit>
    </Form.Root>
  );
}

function TargetDateStep({ profile, submitting, onSubmit }: StepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const raw = formData.get("targetCompletionDate");
    onSubmit({ step: "targetDate", value: raw ? String(raw) : null });
  }
  function handleSkip(): void {
    onSubmit({ step: "targetDate", value: null });
  }
  return (
    <Form.Root onSubmit={handleSubmit}>
      <TextField
        name="targetCompletionDate"
        label="Target completion date (optional)"
        type="date"
        min={todayIso()}
        defaultValue={profile.targetCompletionDate ?? ""}
      />
      <Form.Submit asChild>
        <Button type="submit" disabled={submitting}>
          Continue
        </Button>
      </Form.Submit>
      <Button type="button" variant="secondary" onClick={handleSkip} disabled={submitting}>
        Skip
      </Button>
    </Form.Root>
  );
}

function LevelStep({ profile, submitting, onSubmit }: StepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get("level") ?? "beginner") as "beginner" | "intermediate" | "advanced";
    onSubmit({ step: "level", value });
  }
  return (
    <Form.Root onSubmit={handleSubmit}>
      <Form.Field name="level" className="usavvy-field">
        <Form.Label className="usavvy-label">What's your current level?</Form.Label>
        <Form.Control asChild>
          <select name="level" className="usavvy-input" required defaultValue={profile.level ?? "beginner"}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Form.Control>
      </Form.Field>
      <Form.Submit asChild>
        <Button type="submit" disabled={submitting}>
          Finish
        </Button>
      </Form.Submit>
    </Form.Root>
  );
}
