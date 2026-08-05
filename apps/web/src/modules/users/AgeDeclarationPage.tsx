import { useState, type FormEvent } from "react";
import { Form } from "radix-ui";
import { Navigate, useNavigate } from "react-router-dom";
import { Button, TextField } from "../../shared/index.js";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { useAuth } from "../auth/index.js";
import { createUsersApi } from "./api.js";
import { calculateAge } from "./age.js";

const MINOR_AGE_THRESHOLD = 18;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * AC #1/#4: reached right after signup/verify/login. Protected — if there's no
 * session, there's nothing to declare an age against, so redirect to /login rather
 * than rendering a form with nothing to submit.
 */
export function AgeDeclarationPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [birthdate, setBirthdate] = useState("");
  const [serverError, setServerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  // Captured into a local so TS's null-narrowing survives into handleSubmit's closure
  // (narrowing on `session` itself doesn't persist across the function boundary).
  const { accessToken } = session;

  // Mirrors the server's exact age math (services/core's calculateAge) so the
  // parentEmail field appears/disappears consistently with what the server will
  // actually decide — never let client and server drift on the age boundary.
  const isMinor = birthdate.length > 0 && calculateAge(birthdate, todayIso()) < MINOR_AGE_THRESHOLD;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    setServerError(undefined);
    const formData = new FormData(event.currentTarget);
    const declaredBirthdate = String(formData.get("birthdate") ?? "");
    const parentEmail = formData.get("parentEmail");

    setSubmitting(true);
    try {
      const { apiUrl } = getWebConfig();
      const usersApi = createUsersApi(apiUrl);
      const result = await usersApi.declareAge(accessToken, {
        birthdate: declaredBirthdate,
        ...(parentEmail ? { parentEmail: String(parentEmail) } : {}),
      });
      // AC #3/#4: adult proceeds to the same placeholder-for-onboarding destination
      // Story 1.1 uses; minor goes to the waiting screen.
      navigate(result.isMinor ? "/waiting-for-consent" : "/");
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : "something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>When were you born?</h1>
      <Form.Root onSubmit={handleSubmit}>
        <TextField name="birthdate" label="Birthdate" type="date" required value={birthdate} onChange={(event) => setBirthdate(event.target.value)} />
        {isMinor ? <TextField name="parentEmail" label="Parent or guardian's email" type="email" required /> : null}
        {serverError ? (
          <div className="usavvy-banner-error" role="alert">
            {serverError}
          </div>
        ) : null}
        <Form.Submit asChild>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Continue"}
          </Button>
        </Form.Submit>
      </Form.Root>
    </main>
  );
}
