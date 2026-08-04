import Fastify from "fastify";
import cors from "@fastify/cors";
import type { DownstreamHealth, GatewayHealth } from "@usavvy/shared-types";

export interface BuildAppDeps {
  fetchCoreHealth: () => Promise<DownstreamHealth>;
  corsOrigin: string;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  void app.register(cors, { origin: deps.corsOrigin });

  app.get("/health", async (): Promise<GatewayHealth> => {
    // Defensive backstop (Review finding): today's real fetchCoreHealth() never rejects
    // (proven by coreClient's own tests), but the interface doesn't guarantee that — this
    // route must not 500 regardless of what a future caller wires in here (AD-17).
    let core: DownstreamHealth;
    try {
      core = await deps.fetchCoreHealth();
    } catch {
      core = { status: "unreachable" };
    }
    return { gateway: { status: "ok" }, core };
  });

  return app;
}
