import { getWebConfig } from "./config.js";
import { useHealthCheck } from "./useHealthCheck.js";

export function HomePage() {
  const { apiUrl } = getWebConfig();
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
