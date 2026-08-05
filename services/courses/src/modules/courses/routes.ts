import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import { createConceptInputSchema, createCourseInputSchema, createModuleInputSchema, createTopicInputSchema } from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { archiveModule, createConcept, createCourse, createModule, createTopic, getCourse } from "./service.js";

export interface CoursesRouteDeps {
  db: Db;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Story 2.1: duplicated from core's own identically-named private helper rather than
// imported across the service boundary (AD-9/AD-13 — services/* never import each other;
// each service's modules/* are private except for their own index.ts barrel).
function requireTrustedUser(request: FastifyRequest): { userId: string; role: Role } {
  const userId = request.headers["x-user-id"];
  const role = request.headers["x-user-role"];
  if (typeof userId !== "string" || typeof role !== "string" || !isRole(role)) {
    throw new AppError("UNAUTHENTICATED", "authentication required", 401);
  }
  return { userId, role };
}

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid request body", 400, result.error.issues);
  }
  return result.data;
}

const idParamsSchema = z.object({ id: z.uuid() });

export function registerCoursesRoutes(app: FastifyInstance, deps: CoursesRouteDeps): void {
  app.post("/courses", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const body = parseOrThrow(createCourseInputSchema, request.body);
    reply.send(await createCourse(deps.db, role, body));
  });

  app.post("/courses/:id/modules", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(createModuleInputSchema, request.body);
    reply.send(await createModule(deps.db, role, id, body));
  });

  app.post("/modules/:id/topics", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(createTopicInputSchema, request.body);
    reply.send(await createTopic(deps.db, role, id, body));
  });

  app.post("/topics/:id/concepts", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(createConceptInputSchema, request.body);
    reply.send(await createConcept(deps.db, role, id, body));
  });

  app.delete("/modules/:id", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    await archiveModule(deps.db, role, id);
    reply.code(204).send();
  });

  app.get("/courses/:id", async (request, reply) => {
    requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    reply.send(await getCourse(deps.db, id));
  });
}
