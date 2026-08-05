import { z } from "zod";

export const accountDeletionResponseSchema = z.object({
  scheduledDeletionAt: z.string(),
});

export type AccountDeletionResponse = z.infer<typeof accountDeletionResponseSchema>;
