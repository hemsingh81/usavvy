import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import { mergeProposedConceptsInputSchema, reorderProposedTopicsInputSchema } from "@usavvy/shared-types";
import type { Db } from "../../../db/client.js";
import {
  confirmOutline,
  deleteProposedConcept,
  deleteProposedTopic,
  listProposedOutline,
  mergeProposedConcepts,
  recordOutlineConfirmation,
  renameProposedConcept,
  renameProposedTopic,
  reorderProposedTopics,
  setProposedConceptPriority,
  setProposedTopicPriority,
} from "./service.js";

// Duplicated from uploads/routes.ts's own identically-named private helpers (AD-9/AD-13).
function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid request", 400, result.error.issues);
  }
  return result.data;
}

const idSchema = z.uuid();
function requireValidId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid id", 400);
  }
  return result.data;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

function requireTrustedUser(request: FastifyRequest): { userId: string; role: Role } {
  const userId = request.headers["x-user-id"];
  const role = request.headers["x-user-role"];
  if (typeof userId !== "string" || typeof role !== "string" || !isRole(role)) {
    throw new AppError("UNAUTHENTICATED", "authentication required", 401);
  }
  return { userId, role };
}

// One PATCH body shape for both /topics/:id and /concepts/:id — either or both fields,
// matching this codebase's partial-PATCH convention. Not a packages/shared-types export:
// a route-level convenience merge of renameProposedItemInputSchema/
// setProposedItemPriorityInputSchema, not itself a DTO any other service consumes.
const patchProposedItemInputSchema = z
  .object({ title: z.string().min(1).optional(), priority: z.boolean().optional() })
  .refine((data) => data.title !== undefined || data.priority !== undefined, { message: "at least one of title/priority is required" });

const listOutlineQuerySchema = z.object({ customCourseId: z.uuid() });
const confirmationInputSchema = z.object({ customCourseId: z.uuid(), courseId: z.string().min(1) });

export interface OutlineRouteDeps {
  db: Db;
}

export function registerOutlineRoutes(app: FastifyInstance, deps: OutlineRouteDeps): void {
  // AD-7: auth-only, same as every other uploads route — the caller's own private data.
  app.get("/uploads/outline", async (request) => {
    const { userId } = requireTrustedUser(request);
    const { customCourseId } = parseOrThrow(listOutlineQuerySchema, request.query);
    return listProposedOutline(deps.db, userId, customCourseId);
  });

  app.patch("/uploads/outline/topics/:id", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    const body = parseOrThrow(patchProposedItemInputSchema, request.body);
    if (body.title !== undefined) await renameProposedTopic(deps.db, userId, id, body.title);
    if (body.priority !== undefined) await setProposedTopicPriority(deps.db, userId, id, body.priority);
    reply.code(204).send();
  });

  app.patch("/uploads/outline/concepts/:id", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    const body = parseOrThrow(patchProposedItemInputSchema, request.body);
    if (body.title !== undefined) await renameProposedConcept(deps.db, userId, id, body.title);
    if (body.priority !== undefined) await setProposedConceptPriority(deps.db, userId, id, body.priority);
    reply.code(204).send();
  });

  app.delete("/uploads/outline/topics/:id", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    await deleteProposedTopic(deps.db, userId, id);
    reply.code(204).send();
  });

  app.delete("/uploads/outline/concepts/:id", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    await deleteProposedConcept(deps.db, userId, id);
    reply.code(204).send();
  });

  app.put("/uploads/outline/topics/reorder", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(z.object({ customCourseId: z.uuid() }).and(reorderProposedTopicsInputSchema), request.body);
    await reorderProposedTopics(deps.db, userId, body.customCourseId, body.orderedTopicIds);
    reply.code(204).send();
  });

  app.post("/uploads/outline/concepts/merge", async (request) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(mergeProposedConceptsInputSchema, request.body);
    await mergeProposedConcepts(deps.db, userId, body.keepConceptId, body.mergeConceptId);
    return { keepConceptId: body.keepConceptId };
  });

  // Internal-only: called by gateway's outline-confirmation orchestration, never
  // directly by apps/web (AD-13 — ingestion and courses never call each other).
  app.post("/uploads/outline/confirm", async (request) => {
    const { userId } = requireTrustedUser(request);
    const { customCourseId } = parseOrThrow(listOutlineQuerySchema, request.body);
    return confirmOutline(deps.db, userId, customCourseId);
  });

  app.post("/uploads/outline/confirmations", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(confirmationInputSchema, request.body);
    await recordOutlineConfirmation(deps.db, userId, body.customCourseId, body.courseId);
    reply.code(204).send();
  });
}
