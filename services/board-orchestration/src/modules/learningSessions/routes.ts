import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { AppError, type Logger } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import { createLearningSessionInputSchema, pauseLearningSessionInputSchema } from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import type { VoicePort } from "../voice/index.js";
import type { PubSubPort } from "../pubsub/index.js";
import { createOrResumeLearningSession, endLearningSession, getLearningSession, pauseLearningSession, recordBeatReached, resumeLearningSession } from "./service.js";

// Duplicated from courses'/ingestion's own identically-named private helper (AD-9/AD-13
// — services/* never import each other; each service's modules/* are private except
// for their own index.ts barrel).
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

export interface LearningSessionsRouteDeps {
  db: Db;
  voicePort: VoicePort;
  pubSubPort: PubSubPort;
  logger: Logger;
}

/**
 * Story 3.1 (FR-B-1). Auth-only, own-resource — this is the learner's own private
 * session, not a privileged content-ops action (matches `startCourse`/
 * `saveCourseCustomization`'s established precedent in services/courses, not
 * `createCourse`'s content-ops-only gate).
 */
export function registerLearningSessionsRoutes(app: FastifyInstance, deps: LearningSessionsRouteDeps): void {
  app.post("/learning-sessions", async (request, reply) => {
    const { userId } = requireTrustedUser(request);
    const body = parseOrThrow(createLearningSessionInputSchema, request.body);
    // shared-types' BeatInput leaves audioRef/sourceRef as optional (string | undefined,
    // exactOptionalPropertyTypes-sensitive); the service module's own BeatInput expects
    // string | null, matching its DB-column shape.
    const beatInputs = body.beats.map((beat) => ({ ...beat, audioRef: beat.audioRef ?? null, sourceRef: beat.sourceRef ?? null }));
    const session = await createOrResumeLearningSession(deps.db, userId, body.conceptId, beatInputs);
    reply.code(201).send(session);
  });

  app.get("/learning-sessions/:id", async (request) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    return getLearningSession(deps.db, userId, id);
  });

  app.post("/learning-sessions/:id/pause", async (request) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    const body = parseOrThrow(pauseLearningSessionInputSchema, request.body);
    return pauseLearningSession(deps.db, userId, id, body);
  });

  app.post("/learning-sessions/:id/resume", async (request) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    return resumeLearningSession(deps.db, userId, id, deps.voicePort);
  });

  app.post("/learning-sessions/:id/beats/:beatId/reached", async (request) => {
    const { userId } = requireTrustedUser(request);
    const { id, beatId } = request.params as { id: string; beatId: string };
    return recordBeatReached(deps.db, userId, requireValidId(id), requireValidId(beatId), deps.pubSubPort);
  });

  app.post("/learning-sessions/:id/end", async (request) => {
    const { userId } = requireTrustedUser(request);
    const id = requireValidId((request.params as { id: string }).id);
    return endLearningSession(deps.db, userId, id, deps.pubSubPort);
  });
}
