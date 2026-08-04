import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import type { HealthStatus } from "@usavvy/shared-types";
import { registerErrorHandler, type Logger } from "@usavvy/service-kernel";
import type { Db } from "./db/client.js";
import type { NotificationPort } from "./modules/notification/index.js";
import { registerAuthRoutes } from "./modules/auth/index.js";
import { registerUsersRoutes } from "./modules/users/index.js";

export interface BuildAppDeps {
  checkDb: () => Promise<boolean>;
  checkStorage: () => Promise<boolean>;
  db: Db;
  notificationPort: NotificationPort;
  jwtSecret: string;
  googleClientId: string | undefined;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  // AD-7: core signs tokens on successful auth; gateway verifies them. Same secret.
  void app.register(fastifyJwt, { secret: deps.jwtSecret });

  registerErrorHandler(app, deps.logger);

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

  registerAuthRoutes(app, { db: deps.db, notificationPort: deps.notificationPort, googleClientId: deps.googleClientId });
  registerUsersRoutes(app, { db: deps.db });

  return app;
}
