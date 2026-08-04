import type { FastifyInstance } from "fastify";
import type { ErrorEnvelope } from "@usavvy/shared-types";
import type { Logger } from "./logger.js";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Consistency Conventions: one central error-mapper, registered once per service.
 * AD-17: an error that isn't a known `AppError` still logs with context and returns a
 * distinguishable envelope, never a raw stack trace, a hang, or a silently-swallowed
 * failure.
 */
export function registerErrorHandler(app: FastifyInstance, logger: Logger): void {
  app.setErrorHandler((error: Error, request, reply) => {
    if (error instanceof AppError) {
      const envelope: ErrorEnvelope = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      };
      reply.code(error.statusCode).send(envelope);
      return;
    }
    logger.error("unhandled error", { path: request.url, reason: error.message });
    const envelope: ErrorEnvelope = { error: { code: "INTERNAL_ERROR", message: "an unexpected error occurred" } };
    reply.code(500).send(envelope);
  });
}
