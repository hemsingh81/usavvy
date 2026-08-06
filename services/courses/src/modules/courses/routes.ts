import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import {
  catalogSearchParamsSchema,
  createConceptInputSchema,
  createCourseInputSchema,
  createCustomCourseInputSchema,
  createModuleInputSchema,
  createTopicInputSchema,
  saveCourseCustomizationInputSchema,
  scorePlacementCheckInputSchema,
} from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import {
  archiveModule,
  createConcept,
  createCourse,
  createCourseVersion,
  createCustomCourseFromOutline,
  createModule,
  createTopic,
  getCourseCustomization,
  getPlacementCheckQuestions,
  resolveCourseForLearner,
  saveCourseCustomization,
  scorePlacementCheck,
  searchCourses,
  startCourse,
  updateCourseVersionPin,
} from "./service.js";

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
  // Story 2.2: catalog browse/search — no RBAC gate, matching GET /courses/:id's own
  // Story 2.1 precedent (every role can read; only writes are gated).
  app.get("/courses", async (request, reply) => {
    requireTrustedUser(request);
    const params = parseOrThrow(catalogSearchParamsSchema, request.query);
    reply.send(await searchCourses(deps.db, params));
  });

  app.post("/courses", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const body = parseOrThrow(createCourseInputSchema, request.body);
    reply.send(await createCourse(deps.db, role, body));
  });

  // Story 2.13 (FR-C-10): the learner's own resource (their confirmed custom-course
  // outline) — no RBAC gate, matching saveCourseCustomization/startCourse's identical
  // auth-only precedent, not a courseHierarchy content-ops action. Internal-only: called
  // by gateway's outline-confirmation orchestration, never directly by apps/web.
  app.post("/courses/custom", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(createCustomCourseInputSchema, request.body);
    const courseId = await createCustomCourseFromOutline(deps.db, userId, body.title, body.topics);
    reply.send({ courseId });
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

  // Story 2.6: transparently resolves to the requesting learner's pinned version (if any)
  // regardless of which version id was requested — getCourse itself is unchanged and still
  // used internally by resolveCourseForLearner.
  app.get("/courses/:id", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    reply.send(await resolveCourseForLearner(deps.db, userId, id));
  });

  // Story 2.4: the learner's own personal data (their choices about their own course) —
  // no RBAC gate beyond authentication, matching PUT /users/preferences' (Story 1.4)
  // identical precedent, not a courseHierarchy content-ops action.
  app.get("/courses/:id/customization", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const result = await getCourseCustomization(deps.db, userId, id);
    if (!result) {
      throw new AppError("NOT_FOUND", "no customization saved yet", 404);
    }
    reply.send(result);
  });

  app.put("/courses/:id/customization", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(saveCourseCustomizationInputSchema, request.body);
    reply.send(await saveCourseCustomization(deps.db, userId, id, body));
  });

  // Story 2.5: auth-only, matching GET/PUT .../customization's identical precedent.
  app.get("/courses/:id/placement-check", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    reply.send(await getPlacementCheckQuestions(deps.db, id, userId));
  });

  // Stateless — no persistence (AC #2's "review before confirming"; the caller applies
  // this via PUT .../customization instead).
  app.post("/courses/:id/placement-check/score", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(scorePlacementCheckInputSchema, request.body);
    reply.send(await scorePlacementCheck(deps.db, id, body.answers, userId));
  });

  // Story 2.6: "publishing a new version" — same RBAC as createCourse (a whole new courses
  // row, not an in-place edit; see that story's Dev Notes).
  app.post("/courses/:id/versions", async (request, reply) => {
    const { role } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    const body = parseOrThrow(createCourseInputSchema, request.body);
    reply.send(await createCourseVersion(deps.db, role, id, body));
  });

  // AC #1: auth-only, idempotent "access recorded" — not a real Epic 3/4 learning session.
  app.post("/courses/:id/start", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    reply.send(await startCourse(deps.db, userId, id));
  });

  // AC #4: learner-initiated only — never automatic (AC #3).
  app.post("/courses/:id/update-to-latest", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const { id } = parseOrThrow(idParamsSchema, request.params);
    reply.send(await updateCourseVersionPin(deps.db, userId, id));
  });
}
