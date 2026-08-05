import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";
import { requireAuth, trustedHeaders } from "./authPlugin.js";

export interface CoursesProxyDeps {
  forwardToCourses: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
}

// Story 1.10's own review round found a real path-traversal bug from splicing an
// unvalidated path-param id into a forwarded path string — validated here, before any
// id is ever used to build one, same as that story's own fix.
const idSchema = z.uuid();

function requireValidId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid id", 400);
  }
  return result.data;
}

/**
 * Story 2.1 (FR-C-1). A distinct proxy-registration file, not folded into authProxy.ts —
 * a separate downstream service deserves its own registration point. RBAC (who may
 * create/update/delete course-hierarchy nodes) is enforced at the courses service layer
 * (packages/config's can()), not re-implemented here — mirrors how every other proxy
 * route leaves authorization decisions to the service it forwards to.
 */
export function registerCoursesProxyRoutes(app: FastifyInstance, deps: CoursesProxyDeps): void {
  app.post("/courses", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCourses("POST", "/courses", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/courses/:id/modules", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToCourses("POST", `/courses/${id}/modules`, { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/modules/:id/topics", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToCourses("POST", `/modules/${id}/topics`, { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/topics/:id/concepts", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToCourses("POST", `/topics/${id}/concepts`, { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.delete("/modules/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToCourses("DELETE", `/modules/${id}`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.get("/courses/:id", { preHandler: requireAuth }, async (request, reply) => {
    const id = requireValidId((request.params as { id: string }).id);
    const result = await deps.forwardToCourses("GET", `/courses/${id}`, { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });
}
