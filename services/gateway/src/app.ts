import Fastify from "fastify";
import cors from "@fastify/cors";
import type { DownstreamHealth, GatewayHealth } from "@usavvy/shared-types";
import { registerErrorHandler, type Logger } from "@usavvy/service-kernel";
import type { BinaryProxyOptions, BinaryProxyResult, ProxyOptions, ProxyResult } from "./coreClient.js";
import { registerJwtPlugin } from "./authPlugin.js";
import { registerAuthProxyRoutes } from "./authProxy.js";

export interface BuildAppDeps {
  fetchCoreHealth: () => Promise<DownstreamHealth>;
  forwardToCore: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardBinaryToCore: (method: string, path: string, options?: BinaryProxyOptions) => Promise<BinaryProxyResult>;
  corsOrigin: string;
  jwtSecret: string;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  void app.register(cors, { origin: deps.corsOrigin });
  registerJwtPlugin(app, deps.jwtSecret);
  registerErrorHandler(app, deps.logger);

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

  registerAuthProxyRoutes(app, { forwardToCore: deps.forwardToCore, forwardBinaryToCore: deps.forwardBinaryToCore });

  return app;
}
