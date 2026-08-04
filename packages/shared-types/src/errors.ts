import { z } from "zod";

/**
 * Consistency Conventions: errors as `{ error: { code, message, details? } }` from one
 * central error-mapper, never per-route ad hoc shapes — shared here since both services'
 * error handlers and apps/web's inline error rendering all need the same shape.
 */
export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
