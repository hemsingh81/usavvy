import { useState, type FormEvent } from "react";
import { Form } from "radix-ui";
import { Link, useNavigate } from "react-router-dom";
import { Button, TextField } from "../../shared/index.js";
// Direct file import, not the users/index.js barrel — AgeDeclarationPage.tsx imports
// useAuth from this module's own index.js, so importing the users barrel here would
// form a real circular import between the two barrels.
import { resolvePostAuthDestination } from "../users/postAuthRedirect.js";
import { AuthApiError } from "./api.js";
import { useAuth, type Session } from "./useAuth.js";
import { GoogleSignInButton } from "./GoogleSignInButton.js";

export function LoginPage() {
  const { login, getMe } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Takes the just-issued Session explicitly rather than reading it from context —
  // `setSession` is asynchronous, so reading `session` from a closure immediately after
  // `login`/`googleAuth` resolves can see a stale pre-update value (a real bug found via
  // this exact sequence in testing).
  async function goToPostAuthDestination(session: Session): Promise<void> {
    const me = await getMe(session.accessToken);
    navigate(resolvePostAuthDestination(me));
  }

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
      const session = await login(email, password);
      await goToPostAuthDestination(session);
    } catch (error) {
      // Same message whether the account doesn't exist, the password is wrong, or it's
      // unverified with a specific code — server already decides which; we just render it.
      setServerError(error instanceof AuthApiError ? error.message : "something went wrong — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>Log in</h1>
      <Form.Root onSubmit={handleSubmit}>
        <TextField name="email" label="Email" type="email" autoComplete="email" required />
        <TextField name="password" label="Password" type="password" autoComplete="current-password" required />
        {serverError ? (
          <div className="usavvy-banner-error" role="alert">
            {serverError}
          </div>
        ) : null}
        <Form.Submit asChild>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Logging in…" : "Log in"}
          </Button>
        </Form.Submit>
      </Form.Root>
      <GoogleSignInButton onError={setServerError} onSuccess={(session) => void goToPostAuthDestination(session)} />
      <p>
        Don&apos;t have an account? <Link to="/signup">Sign up</Link>
      </p>
    </main>
  );
}
