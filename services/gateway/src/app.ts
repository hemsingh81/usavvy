import Fastify from "fastify";
import cors from "@fastify/cors";
import type { DownstreamHealth, GatewayHealth } from "@usavvy/shared-types";
import { registerErrorHandler, type Logger } from "@usavvy/service-kernel";
import type { BinaryProxyOptions, BinaryProxyResult, ProxyOptions, ProxyResult } from "./coreClient.js";
import { registerJwtPlugin } from "./authPlugin.js";
import { registerAuthProxyRoutes } from "./authProxy.js";
import { registerCoursesProxyRoutes } from "./coursesProxy.js";
import { registerIngestionProxyRoutes } from "./ingestionProxy.js";
import { registerOutlineConfirmationProxyRoutes } from "./outlineConfirmationProxy.js";
import { registerBoardOrchestrationProxyRoutes } from "./boardOrchestrationProxy.js";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export interface BuildAppDeps {
  fetchCoreHealth: () => Promise<DownstreamHealth>;
  forwardToCore: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardBinaryToCore: (method: string, path: string, options?: BinaryProxyOptions) => Promise<BinaryProxyResult>;
  forwardToCourses: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardToIngestion: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardMultipartToIngestion: (path: string, contentType: string, rawBody: Buffer, headers: Record<string, string>) => Promise<ProxyResult>;
  forwardToBoardOrchestration: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  corsOrigin: string;
  jwtSecret: string;
  logger: Logger;
}

export function buildApp(deps: BuildAppDeps) {
  const app = Fastify();

  void app.register(cors, { origin: deps.corsOrigin });
  registerJwtPlugin(app, deps.jwtSecret);
  registerErrorHandler(app, deps.logger);

  // Story 2.7: gateway never parses multipart itself (see ingestionProxy.ts's own Dev
  // Notes) — this just buffers the raw bytes so they can be forwarded byte-for-byte,
  // boundary and all, to ingestion (which DOES need to read the individual form fields).
  app.addContentTypeParser("multipart/form-data", { parseAs: "buffer", bodyLimit: MAX_UPLOAD_BYTES }, (_request, payload, done) => {
    done(null, payload);
  });

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
  registerCoursesProxyRoutes(app, { forwardToCourses: deps.forwardToCourses });
  registerIngestionProxyRoutes(app, {
    forwardToIngestion: deps.forwardToIngestion,
    forwardMultipartToIngestion: deps.forwardMultipartToIngestion,
  });
  // Story 2.13 (FR-C-10): the first cross-service-aggregating proxy in this codebase —
  // see outlineConfirmationProxy.ts's own Dev Notes.
  registerOutlineConfirmationProxyRoutes(app, {
    forwardToIngestion: deps.forwardToIngestion,
    forwardToCourses: deps.forwardToCourses,
    logger: deps.logger,
  });
  registerBoardOrchestrationProxyRoutes(app, { forwardToBoardOrchestration: deps.forwardToBoardOrchestration });

  return app;
}
