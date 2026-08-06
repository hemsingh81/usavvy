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
function asFastifyClientError(error: Error): { statusCode: number; code: string } | undefined {
  if (!("statusCode" in error) || !("code" in error)) return undefined;
  const statusCode = (error as { statusCode: unknown }).statusCode;
  const code = (error as { code: unknown }).code;
  if (typeof statusCode !== "number" || typeof code !== "string") return undefined;
  if (statusCode < 400 || statusCode >= 500 || !code.startsWith("FST_ERR_")) return undefined;
  return { statusCode, code };
}

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
    // Review finding (Story 2.7): a request-level Fastify framework error (e.g. a body
    // exceeding a content-type parser's own bodyLimit — FST_ERR_CTP_BODY_TOO_LARGE)
    // fell through to a generic, unhelpful 500 here — but Fastify itself already
    // classified it as a well-understood 4xx client error. Surfacing its own
    // statusCode/code/message is strictly more informative than "an unexpected error
    // occurred" (AD-17), without pretending it's an application-level AppError.
    const fastifyClientError = asFastifyClientError(error);
    if (fastifyClientError !== undefined) {
      const envelope: ErrorEnvelope = { error: { code: fastifyClientError.code, message: error.message } };
      reply.code(fastifyClientError.statusCode).send(envelope);
      return;
    }
    logger.error("unhandled error", { path: request.url, reason: error.message });
    const envelope: ErrorEnvelope = { error: { code: "INTERNAL_ERROR", message: "an unexpected error occurred" } };
    reply.code(500).send(envelope);
  });
}
