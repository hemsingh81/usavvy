import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AuthApiError } from "./api.js";
import { useAuth } from "./useAuth.js";

type ViewState = { kind: "verifying" } | { kind: "success" } | { kind: "error"; message: string };

/**
 * AC #3: verifying also logs the learner in. The epic's own AC names a redirect to
 * onboarding as the destination — that screen doesn't exist yet (Story 1.3), so this
 * lands on a plain confirmation instead. Story 1.3 changes the destination, not this
 * verification mechanism.
 */
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const [view, setView] = useState<ViewState>({ kind: "verifying" });
  // Bug found via manual browser testing (StrictMode double-invokes effects in dev):
  // verify-email is a one-time-use mutation. A naive per-invocation `cancelled`
  // closure doesn't work here even combined with a dedup ref — StrictMode's
  // simulated cleanup fires on the *first* invocation while its real request is
  // still in flight, so that invocation's own `cancelled` flag is already true by
  // the time the (only) response arrives, permanently discarding the real result.
  // Fix: dedup the request itself per token (survives the double-invoke, refs
  // aren't reset), and gate the result on a mounted-ref that nets out to `true`
  // after both invocations settle — the standard pattern for this exact issue.
  const requestedTokenRef = useRef<string | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setView({ kind: "error", message: "no verification token was provided" });
      return;
    }
    if (requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;

    // Review finding: if the URL's token changes while a request for a previous token
    // is still in flight, only apply a result while it's still the current token —
    // `requestedTokenRef` may have moved on to a newer one by the time this settles.
    const isStillCurrent = () => isMountedRef.current && requestedTokenRef.current === token;

    verifyEmail(token)
      .then(() => {
        if (isStillCurrent()) setView({ kind: "success" });
      })
      .catch((error: unknown) => {
        if (!isStillCurrent()) return;
        setView({ kind: "error", message: error instanceof AuthApiError ? error.message : "verification failed" });
      });
  }, [searchParams, verifyEmail]);

  if (view.kind === "verifying") {
    return (
      <main>
        <h1>Verifying…</h1>
        <p role="status">Verifying your email…</p>
      </main>
    );
  }

  if (view.kind === "success") {
    return (
      <main>
        <h1>Email verified</h1>
        <div className="usavvy-banner-success" role="status">
          Your account is verified and you&apos;re logged in.
        </div>
        <Link to="/">Continue</Link>
      </main>
    );
  }

  return (
    <main>
      <h1>Verification failed</h1>
      <div className="usavvy-banner-error" role="alert">
        {view.message}
      </div>
      <Link to="/login">Back to login</Link>
    </main>
  );
}
