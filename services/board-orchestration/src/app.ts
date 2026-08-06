import Fastify from "fastify";
import type { HealthStatus } from "@usavvy/shared-types";
import { AppError, registerErrorHandler, type Logger } from "@usavvy/service-kernel";
import type { Db } from "./db/client.js";
import type { VoicePort } from "./modules/voice/index.js";
import type { PubSubPort } from "./modules/pubsub/index.js";
import { registerLearningSessionsRoutes } from "./modules/learningSessions/index.js";

export interface BuildAppDeps {
  checkDb: () => Promise<boolean>;
  db: Db;
  voicePort: VoicePort;
  pubSubPort: PubSubPort;
  internalServiceSecret: string;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  registerErrorHandler(app, deps.logger);

  // Same trust-boundary guard as every other service's own (Story 1.0 review finding):
  // nothing but gateway should ever reach this service directly. /health stays exempt.
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
    try {
      const db = await deps.checkDb();
      return { status: db ? "ok" : "degraded", db, storage: true };
    } catch {
      return { status: "degraded", db: false, storage: true };
    }
  });

  registerLearningSessionsRoutes(app, { db: deps.db, voicePort: deps.voicePort, pubSubPort: deps.pubSubPort, logger: deps.logger });

  return app;
}
