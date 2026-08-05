import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError } from "../../shared/apiClient.js";
import { getWebConfig } from "../../app/config.js";
import { createUsersApi } from "./api.js";

type ViewState = { kind: "verifying" } | { kind: "success" } | { kind: "error"; message: string };

/**
 * AC #3: the parent's landing page after clicking the consent link — distinct from
 * the learner's VerifyEmailPage since the parent has no account/session; no tokens are
 * issued here. Same StrictMode-safe dedup pattern VerifyEmailPage established (Story
 * 1.1's code review): dedup the request per token, gate the result on a mounted-ref.
 */
export function ParentalConsentPage() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<ViewState>({ kind: "verifying" });
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
      setView({ kind: "error", message: "no consent token was provided" });
      return;
    }
    if (requestedTokenRef.current === token) {
      return;
    }
    requestedTokenRef.current = token;

    const isStillCurrent = () => isMountedRef.current && requestedTokenRef.current === token;
    const { apiUrl } = getWebConfig();

    createUsersApi(apiUrl)
      .parentalConsent({ token })
      .then(() => {
        if (isStillCurrent()) setView({ kind: "success" });
      })
      .catch((error: unknown) => {
        if (!isStillCurrent()) return;
        setView({ kind: "error", message: error instanceof ApiError ? error.message : "something went wrong" });
      });
  }, [searchParams]);

  if (view.kind === "verifying") {
    return (
      <main>
        <h1>Confirming…</h1>
        <p role="status">Confirming your consent…</p>
      </main>
    );
  }

  if (view.kind === "success") {
    return (
      <main>
        <h1>Consent granted</h1>
        <div className="usavvy-banner-success" role="status">
          Thank you — your child can now continue using Usavvy.
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Something went wrong</h1>
      <div className="usavvy-banner-error" role="alert">
        {view.message}
      </div>
      <Link to="/">Return home</Link>
    </main>
  );
}
