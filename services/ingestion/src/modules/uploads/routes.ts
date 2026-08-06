import type { FastifyInstance, FastifyRequest } from "fastify";
import type { z } from "zod";
import { AppError, type JobQueuePort, type StoragePort } from "@usavvy/service-kernel";
import { ROLES, type Role } from "@usavvy/config";
import { listUploadsQuerySchema, optionalCustomCourseIdSchema } from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { listUploadedDocuments, uploadDocument } from "./service.js";

// Duplicated from courses' own identically-named private helper (AD-9/AD-13).
function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid request", 400, result.error.issues);
  }
  return result.data;
}

export interface UploadsRouteDeps {
  db: Db;
  storagePort: StoragePort;
  jobQueuePort: JobQueuePort;
}

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

// Duplicated from courses'/core's own identically-named private helper (AD-9/AD-13 —
// services/* never import each other; each service's modules/* are private except for
// their own index.ts barrel).
function requireTrustedUser(request: FastifyRequest): { userId: string; role: Role } {
  const userId = request.headers["x-user-id"];
  const role = request.headers["x-user-role"];
  if (typeof userId !== "string" || typeof role !== "string" || !isRole(role)) {
    throw new AppError("UNAUTHENTICATED", "authentication required", 401);
  }
  return { userId, role };
}

function fieldValue(fields: Record<string, unknown>, name: string): string | undefined {
  const field = fields[name];
  if (field && typeof field === "object" && "value" in field && typeof (field as { value: unknown }).value === "string") {
    return (field as { value: string }).value;
  }
  return undefined;
}

export function registerUploadsRoutes(app: FastifyInstance, deps: UploadsRouteDeps): void {
  // AD-7: auth-only, any authenticated role — this is the caller's own private data,
  // not a privileged content-ops action (matches startCourse/saveCourseCustomization's
  // precedent in services/courses, not createCourse's content-ops-only gate).
  app.post("/uploads", async (request, reply) => {
    const { userId } = requireTrustedUser(request);

    const data = await request.file();
    if (!data) {
      throw new AppError("VALIDATION_ERROR", "no file provided", 400);
    }

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch (error) {
      // Review finding: @fastify/multipart's own `limits.fileSize` (app.ts) doesn't
      // silently truncate an oversized file — it throws FST_REQ_FILE_TOO_LARGE from
      // toBuffer(), which isn't an AppError. Left uncaught, this fell through to a
      // generic 500, meaning the app-level `MAX_FILE_SIZE_BYTES` check in service.ts
      // was dead code for every REAL oversized upload (only reachable when
      // uploadDocument() is called directly with a pre-built buffer, i.e. in tests).
      if (error && typeof error === "object" && "code" in error && error.code === "FST_REQ_FILE_TOO_LARGE") {
        throw new AppError("VALIDATION_ERROR", "file exceeds 50 MB limit", 400);
      }
      throw error;
    }

    // The frontend sends customCourseId/copyrightAttested BEFORE the file field in the
    // FormData (see apps/web's uploads api.ts) — @fastify/multipart only guarantees
    // `.fields` is fully populated for fields already parsed by the time the file
    // stream is drained, which `toBuffer()` above does.
    const customCourseIdValue = parseOrThrow(optionalCustomCourseIdSchema, fieldValue(data.fields, "customCourseId"));
    const copyrightAttested = fieldValue(data.fields, "copyrightAttested") === "true";

    const result = await uploadDocument(deps, userId, {
      customCourseId: customCourseIdValue,
      fileName: data.filename,
      buffer,
      copyrightAttested,
    });
    reply.code(201).send(result);
  });

  app.get("/uploads", async (request) => {
    const { userId } = requireTrustedUser(request);
    const { customCourseId } = parseOrThrow(listUploadsQuerySchema, request.query);
    return listUploadedDocuments(deps.db, userId, customCourseId);
  });
}
