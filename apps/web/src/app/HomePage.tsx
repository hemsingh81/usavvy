import { useHealthCheck } from "./useHealthCheck.js";

export interface HomePageProps {
  apiUrl: string;
}

// Config-error handling (a misconfigured VITE_API_URL, AD-17) now lives in App.tsx,
// which resolves apiUrl once for both this page and AuthProvider — no longer duplicated
// here.
export function HomePage({ apiUrl }: HomePageProps) {
  const health = useHealthCheck(apiUrl);

  return (
    <main>
      <h1>Usavvy</h1>
      {health.kind === "loading" && <p role="status">Checking system status…</p>}
      {health.kind === "ok" && <p role="status">System OK</p>}
      {health.kind === "degraded" && <p role="alert">System Degraded — {health.detail}</p>}
      {health.kind === "error" && <p role="alert">Unable to reach system — {health.detail}</p>}
    </main>
  );
}
