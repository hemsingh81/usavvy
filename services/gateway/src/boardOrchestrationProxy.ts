import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";
import { requireAuth, trustedHeaders } from "./authPlugin.js";

// Duplicated from coursesProxy.ts's/ingestionProxy.ts's own identically-named private
// helper (AD-9/AD-13).
const idSchema = z.uuid();
function requireValidId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid id", 400);
  }
  return result.data;
}

export interface BoardOrchestrationProxyDeps {
  forwardToBoardOrchestration: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
}

/**
 * Story 3.1 (FR-B-1). Dumb 1:1 forwards, matching every other proxy route in this
 * codebase — auth-only gate, own-resource, RBAC (none needed here) left to the service
 * it forwards to.
 */
export function registerBoardOrchestrationProxyRoutes(app: FastifyInstance, deps: BoardOrchestrationProxyDeps): void {
  app.post("/learning-sessions", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToBoardOrchestration("POST", "/learning-sessions", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.get("/learning-sessions/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToBoardOrchestration("GET", `/learning-sessions/${id}`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/learning-sessions/:id/pause", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToBoardOrchestration("POST", `/learning-sessions/${id}/pause`, {
      body: request.body,
      headers: trustedHeaders(request),
    });
    reply.code(result.status).send(result.body);
  });

  app.post("/learning-sessions/:id/resume", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToBoardOrchestration("POST", `/learning-sessions/${id}/resume`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/learning-sessions/:id/replay", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToBoardOrchestration("POST", `/learning-sessions/${id}/replay`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/learning-sessions/:id/beats/:beatId/reached", { preHandler: requireAuth }, async (request, reply) => {
    const { id, beatId } = request.params as { id: string; beatId: string };
    const result = await deps.forwardToBoardOrchestration(
      "POST",
      `/learning-sessions/${requireValidId(id)}/beats/${requireValidId(beatId)}/reached`,
      { headers: trustedHeaders(request) },
    );
    reply.code(result.status).send(result.body);
  });

  app.post("/learning-sessions/:id/end", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToBoardOrchestration("POST", `/learning-sessions/${id}/end`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });
}
