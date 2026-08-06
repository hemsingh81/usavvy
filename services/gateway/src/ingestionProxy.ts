import type { FastifyInstance } from "fastify";
import { AppError } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";
import { requireAuth, trustedHeaders } from "./authPlugin.js";

export interface IngestionProxyDeps {
  forwardToIngestion: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardMultipartToIngestion: (path: string, contentType: string, rawBody: Buffer, headers: Record<string, string>) => Promise<ProxyResult>;
}

/**
 * Story 2.7 (FR-C-7/FR-C-12). Gateway never parses the multipart body itself — every
 * other proxy route in this codebase is a dumb byte-forwarding pass-through, and adding
 * `@fastify/multipart` here just to re-serialize a new multipart body for ingestion
 * would be pure wasted work and a second place a parsing bug could live. `request.body`
 * for a `multipart/form-data` request is the raw `Buffer` app.ts's own content-type
 * parser produces — forwarded byte-for-byte, boundary and all.
 */
export function registerIngestionProxyRoutes(app: FastifyInstance, deps: IngestionProxyDeps): void {
  app.post("/uploads", { preHandler: requireAuth }, async (request, reply) => {
    const contentType = request.headers["content-type"];
    if (!contentType || !request.body || !Buffer.isBuffer(request.body)) {
      throw new AppError("VALIDATION_ERROR", "a multipart/form-data body is required", 400);
    }
    const result = await deps.forwardMultipartToIngestion("/uploads", contentType, request.body, trustedHeaders(request));
    reply.code(result.status).send(result.body);
  });

  app.get("/uploads", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToIngestion("GET", request.url, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });
}
