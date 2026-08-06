import Fastify from "fastify";
import fastifyMultipart from "@fastify/multipart";
import type { HealthStatus } from "@usavvy/shared-types";
import { AppError, registerErrorHandler, type JobQueuePort, type Logger, type StoragePort } from "@usavvy/service-kernel";
import type { Db } from "./db/client.js";
import { registerUploadsRoutes } from "./modules/uploads/index.js";
import { registerOutlineRoutes } from "./modules/uploads/outline/index.js";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export interface BuildAppDeps {
  checkDb: () => Promise<boolean>;
  db: Db;
  storagePort: StoragePort;
  jobQueuePort: JobQueuePort;
  internalServiceSecret: string;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  void app.register(fastifyMultipart, { limits: { fileSize: MAX_FILE_SIZE_BYTES } });

  registerErrorHandler(app, deps.logger);

  // Same trust-boundary guard as every other service's own (Story 1.0/2.1 review
  // finding): nothing but gateway should ever reach this service directly. /health
  // stays exempt.
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
    // No real StoragePort health check is wired here (courses' identical precedent for
    // its own health route) — the real check already exists at core's own /health.
    try {
      const db = await deps.checkDb();
      return { status: db ? "ok" : "degraded", db, storage: true };
    } catch {
      return { status: "degraded", db: false, storage: true };
    }
  });

  registerUploadsRoutes(app, { db: deps.db, storagePort: deps.storagePort, jobQueuePort: deps.jobQueuePort, logger: deps.logger });
  // Story 2.13 (FR-C-10): outline editing is its own module, distinct from uploads/'s
  // upload-and-ingest job pipeline.
  registerOutlineRoutes(app, { db: deps.db });

  return app;
}
