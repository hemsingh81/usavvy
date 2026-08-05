import { useState, type FormEvent } from "react";
import { Form } from "radix-ui";
import { Link, useNavigate } from "react-router-dom";
import { Button, TextField } from "../../shared/index.js";
// Direct file import — see LoginPage.tsx's comment on why this bypasses the
// users/index.js barrel (avoids a real circular import between the two modules).
import { resolvePostAuthDestination } from "../users/postAuthRedirect.js";
import { AuthApiError } from "./api.js";
import { useAuth } from "./useAuth.js";
import { GoogleSignInButton } from "./GoogleSignInButton.js";

export function SignUpPage() {
  const { signup, getMe } = useAuth();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // Review finding: the disabled button attribute alone leaves a brief window (before
    // React commits the re-render) where a fast double-click/double-Enter fires twice.
    if (submitting) return;
    setServerError(undefined);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setSubmitting(true);
    try {
      await signup(email, password);
      setSent(true);
    } catch (error) {
      // AD-17: every failure surfaces a distinguishable, non-silent state.
      setServerError(error instanceof AuthApiError ? error.message : "something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // AC #1: no auto-login after signup — the account isn't verified yet.
  if (sent) {
    return (
      <main>
        <h1>Check your email</h1>
        <p role="status">We sent a verification link to your email address. Click it to activate your account.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Sign up</h1>
      <Form.Root onSubmit={handleSubmit}>
        <TextField name="email" label="Email" type="email" autoComplete="email" required />
        <TextField name="password" label="Password" type="password" autoComplete="new-password" minLength={8} required />
        {serverError ? (
          <div className="usavvy-banner-error" role="alert">
            {serverError}
          </div>
        ) : null}
        <Form.Submit asChild>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing up…" : "Sign up"}
          </Button>
        </Form.Submit>
      </Form.Root>
      <GoogleSignInButton
        onError={setServerError}
        onSuccess={(session) => {
          // Google sign-up is pre-verified (AC #2, Story 1.1) — same post-auth
          // age-declaration check as everywhere else a session is established. Uses
          // the just-issued session's token directly (see LoginPage's comment on why
          // reading context `session` here would be stale).
          // Review finding: an un-caught rejection here (a failed /me call after a
          // successful Google auth) would silently strand the user with no navigation.
          getMe(session.accessToken)
            .then((me) => navigate(resolvePostAuthDestination(me)))
            .catch(() => setServerError("something went wrong — please try again"));
        }}
      />
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
