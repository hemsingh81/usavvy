import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.boolean(),
  storage: z.boolean(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;
