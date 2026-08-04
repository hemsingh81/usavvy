import type { ZodType } from "zod";
import { AppError } from "@usavvy/service-kernel";

/**
 * One place a request-body validation failure becomes the same `{ error }` envelope
 * every other failure uses (Consistency Conventions) — a raw ZodError thrown from
 * `.parse()` would otherwise fall into the generic 500 handler instead of a 400.
 */
export function parseOrThrow<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "invalid request body", 400, result.error.issues);
  }
  return result.data;
}
