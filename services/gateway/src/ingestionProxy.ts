import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";
import { requireAuth, trustedHeaders } from "./authPlugin.js";

// Duplicated from coursesProxy.ts's own identically-named private helper (AD-9/AD-13).
const idSchema = z.uuid();
function requireValidId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid id", 400);
  }
  return result.data;
}

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

  // Story 2.8 (FR-C-8): plain JSON forwards, unlike /uploads above — no multipart body
  // to relay, matching every other JSON proxy route's exact shape in this codebase.
  app.post("/uploads/paste-text", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToIngestion("POST", "/uploads/paste-text", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/uploads/url-import", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToIngestion("POST", "/uploads/url-import", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  // Story 2.11 (FR-C-11), AC #3.
  app.delete("/uploads/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToIngestion("DELETE", `/uploads/${id}`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  // Story 2.13 (FR-C-10): plain 1:1 forwards, matching every other route in this file —
  // only the confirm step (outlineConfirmationProxy.ts) needs cross-service orchestration.
  app.get("/uploads/outline", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToIngestion("GET", request.url, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.patch("/uploads/outline/topics/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToIngestion("PATCH", `/uploads/outline/topics/${id}`, { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.patch("/uploads/outline/concepts/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToIngestion("PATCH", `/uploads/outline/concepts/${id}`, { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.delete("/uploads/outline/topics/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToIngestion("DELETE", `/uploads/outline/topics/${id}`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.delete("/uploads/outline/concepts/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToIngestion("DELETE", `/uploads/outline/concepts/${id}`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.put("/uploads/outline/topics/reorder", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToIngestion("PUT", "/uploads/outline/topics/reorder", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/uploads/outline/concepts/merge", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToIngestion("POST", "/uploads/outline/concepts/merge", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });
}
