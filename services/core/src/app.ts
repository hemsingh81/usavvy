import Fastify from "fastify";
import type { HealthStatus } from "@usavvy/shared-types";

export interface BuildAppDeps {
  checkDb: () => Promise<boolean>;
  checkStorage: () => Promise<boolean>;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  app.get("/health", async (): Promise<HealthStatus> => {
    const [db, storage] = await Promise.all([deps.checkDb(), deps.checkStorage()]);
    const status = db && storage ? "ok" : "degraded";
    return { status, db, storage };
  });

  return app;
}
