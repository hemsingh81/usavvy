import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import type { HealthStatus } from "@usavvy/shared-types";
import { AppError, registerErrorHandler, type Logger } from "@usavvy/service-kernel";
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
  internalServiceSecret: string;
  googleClientId: string | undefined;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  // AD-7: core signs tokens on successful auth; gateway verifies them. Same secret.
  void app.register(fastifyJwt, { secret: deps.jwtSecret });

  registerErrorHandler(app, deps.logger);

  // Review finding: core bound 0.0.0.0 and trusted x-user-id/x-user-role unconditionally
  // with no compensating control — anything on the host's network reaching core's port
  // directly could forge those headers and impersonate any user/role. /health stays
  // exempt (diagnostic, no user data) — everything else requires the shared secret only
  // gateway knows.
  app.addHook("preHandler", async (request) => {
    // An unmatched route reaches this hook too (Fastify runs the full hook chain before
    // falling back to the not-found handler) — let it fall through to a real 404 instead
    // of masking it as a 401.
    if (request.is404) return;
    if (request.url.split("?")[0] === "/health") return;
    if (request.headers["x-internal-secret"] !== deps.internalServiceSecret) {
      throw new AppError("UNAUTHENTICATED", "authentication required", 401);
    }
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send({ error: { code: "NOT_FOUND", message: "route not found" } });
  });

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
  registerUsersRoutes(app, { db: deps.db, notificationPort: deps.notificationPort });

  return app;
}
