import Fastify from "fastify";
import type { HealthStatus } from "@usavvy/shared-types";

export interface BuildAppDeps {
  checkDb: () => Promise<boolean>;
  checkStorage: () => Promise<boolean>;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  app.get("/health", async (): Promise<HealthStatus> => {
    // Defensive backstop (Review finding): today's real checkDb/checkStorage never reject
    // (pingDb/pingStorage are tested to always resolve), but the interface doesn't
    // guarantee that — this route must not 500 regardless of what a future caller wires
    // in here (AD-17).
    try {
      const [db, storage] = await Promise.all([deps.checkDb(), deps.checkStorage()]);
      const status = db && storage ? "ok" : "degraded";
      return { status, db, storage };
    } catch {
      return { status: "degraded", db: false, storage: false };
    }
  });

  return app;
}
