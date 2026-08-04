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
    const core = await deps.fetchCoreHealth();
    return { gateway: { status: "ok" }, core };
  });

  return app;
}
