import { useEffect, useState } from "react";
import { useHealthCheck } from "./useHealthCheck.js";
import { useAuth } from "../modules/auth/index.js";

export interface HomePageProps {
  apiUrl: string;
}

// Config-error handling (a misconfigured VITE_API_URL, AD-17) now lives in App.tsx,
// which resolves apiUrl once for both this page and AuthProvider — no longer duplicated
// here.
export function HomePage({ apiUrl }: HomePageProps) {
  const health = useHealthCheck(apiUrl);
  const { session, getMe } = useAuth();
  const [onboardingComplete, setOnboardingComplete] = useState(false);

  useEffect(() => {
    if (!session) return;
    getMe(session.accessToken)
      .then((me) => setOnboardingComplete(me.onboardingComplete))
      .catch(() => {
        // A failed /me call here (e.g. an expired session) just means the CTA doesn't
        // show — this is a passive landing page's optional enrichment fetch, not a
        // user-initiated submit whose failure needs surfacing; the health check above
        // still renders regardless (AD-17 is satisfied by that, not by this fetch).
      });
    // Only ever needs to re-run if the session itself changes.
  }, [session?.accessToken]);

  return (
    <main>
      <h1>Usavvy</h1>
      {health.kind === "loading" && <p role="status">Checking system status…</p>}
      {health.kind === "ok" && <p role="status">System OK</p>}
      {health.kind === "degraded" && <p role="alert">System Degraded — {health.detail}</p>}
      {health.kind === "error" && <p role="alert">Unable to reach system — {health.detail}</p>}
      {session && onboardingComplete ? (
        // AC #1: a generic, non-navigating CTA — Epic 2 owns the real catalog surface;
        // this is an intentional placeholder until it exists, not an oversight.
        <button className="usavvy-button-primary" disabled>
          Browse the catalog
        </button>
      ) : null}
    </main>
  );
}
