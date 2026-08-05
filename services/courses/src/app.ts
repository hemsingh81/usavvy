import Fastify from "fastify";
import type { HealthStatus } from "@usavvy/shared-types";
import { AppError, registerErrorHandler, type Logger } from "@usavvy/service-kernel";
import type { Db } from "./db/client.js";
import { registerCoursesRoutes } from "./modules/courses/index.js";

export interface BuildAppDeps {
  checkDb: () => Promise<boolean>;
  db: Db;
  internalServiceSecret: string;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  registerErrorHandler(app, deps.logger);

  // Same trust-boundary guard as core's own (Story 1.0 review finding): nothing but
  // gateway should ever reach this service directly. /health stays exempt.
  app.addHook("preHandler", async (request) => {
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
    // Reuses core's HealthStatus shape (gateway already aggregates every downstream
    // service's health the same way) even though `storage` isn't a real dependency for
    // this service yet — courses has no StoragePort binding today, so it's always
    // reported true rather than adding a second, service-specific health response shape.
    try {
      const db = await deps.checkDb();
      return { status: db ? "ok" : "degraded", db, storage: true };
    } catch {
      return { status: "degraded", db: false, storage: true };
    }
  });

  registerCoursesRoutes(app, { db: deps.db });

  return app;
}
