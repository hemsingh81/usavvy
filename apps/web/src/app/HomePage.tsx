import { getWebConfig } from "./config.js";
import { useHealthCheck } from "./useHealthCheck.js";

function ConfigError({ message }: { message: string }) {
  return (
    <main>
      <h1>Usavvy</h1>
      <p role="alert">Configuration error — {message}</p>
    </main>
  );
}

function HealthDisplay({ apiUrl }: { apiUrl: string }) {
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

export function HomePage() {
  // Review finding: getWebConfig() throws on an invalid VITE_API_URL; without this catch,
  // React unmounts to a blank page instead of a distinguishable error state (AD-17).
  let apiUrl: string;
  try {
    apiUrl = getWebConfig().apiUrl;
  } catch (error) {
    return <ConfigError message={error instanceof Error ? error.message : String(error)} />;
  }

  return <HealthDisplay apiUrl={apiUrl} />;
}
