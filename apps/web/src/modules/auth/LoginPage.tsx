import { useState, type FormEvent } from "react";
import { Form } from "radix-ui";
import { Link, useNavigate } from "react-router-dom";
import { Button, TextField } from "../../shared/index.js";
import { AuthApiError } from "./api.js";
import { useAuth } from "./useAuth.js";
import { GoogleSignInButton } from "./GoogleSignInButton.js";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setServerError(undefined);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
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
      <GoogleSignInButton onError={setServerError} onSuccess={() => navigate("/")} />
      <p>
        Don&apos;t have an account? <Link to="/signup">Sign up</Link>
      </p>
    </main>
  );
}
