import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { confirmOutlineResponseSchema, createCustomCourseResponseSchema } from "@usavvy/shared-types";
import { AppError, type Logger } from "@usavvy/service-kernel";
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

export interface OutlineConfirmationProxyDeps {
  forwardToIngestion: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardToCourses: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  logger: Logger;
}

/**
 * Story 2.13 (FR-C-10), AC #2. The first route in this codebase to aggregate two
 * backend services into one client response — every other proxy route is a strict 1:1
 * forward (see coursesProxy.ts/ingestionProxy.ts). `ingestion` and `courses` never call
 * each other directly (AD-13); this orchestration exists only here.
 */
export function registerOutlineConfirmationProxyRoutes(app: FastifyInstance, deps: OutlineConfirmationProxyDeps): void {
  app.post("/uploads/outline/:customCourseId/confirm", { preHandler: requireAuth }, async (request, reply) => {
    const customCourseId = requireValidId((request.params as { customCourseId: string }).customCourseId);
    const headers = trustedHeaders(request);

    const confirmResult = await deps.forwardToIngestion("POST", "/uploads/outline/confirm", { body: { customCourseId }, headers });
    if (confirmResult.status !== 200) {
      reply.code(confirmResult.status).send(confirmResult.body);
      return;
    }

    const confirmed = confirmOutlineResponseSchema.parse(confirmResult.body);
    if (confirmed.alreadyConfirmed) {
      reply.send({ courseId: confirmed.courseId });
      return;
    }

    const coursesResult = await deps.forwardToCourses("POST", "/courses/custom", {
      body: { title: confirmed.title, topics: confirmed.topics },
      headers,
    });
    if (coursesResult.status !== 200) {
      // Scope Note: this failure mode is NOT the accepted small window — that only
      // covers the recording step below failing after courses already succeeded. A
      // failure here means no course was ever created, so nothing to record.
      reply.code(coursesResult.status).send(coursesResult.body);
      return;
    }

    const { courseId } = createCustomCourseResponseSchema.parse(coursesResult.body);
    const recordResult = await deps.forwardToIngestion("POST", "/uploads/outline/confirmations", { body: { customCourseId, courseId }, headers });
    if (recordResult.status !== 204) {
      // AD-17: don't swallow this silently, but don't fail the request either — the
      // real courses row already exists and is what the learner actually wanted; see
      // this story's Scope Note on the accepted small cross-service consistency window.
      deps.logger.error("failed to record outline confirmation after courses row was created", {
        customCourseId,
        courseId,
        status: recordResult.status,
      });
    }

    reply.send({ courseId });
  });
}
