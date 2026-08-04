import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.boolean(),
  storage: z.boolean(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

/**
 * What `gateway`'s /health reports for a downstream service it called over HTTP —
 * either that service's own HealthStatus, or "unreachable" if the HTTP call itself
 * failed (AD-17: the network hop failing is a distinguishable state, never a hang/throw).
 */
export const downstreamHealthSchema = z.union([healthStatusSchema, z.object({ status: z.literal("unreachable") })]);

export type DownstreamHealth = z.infer<typeof downstreamHealthSchema>;

export const gatewayHealthSchema = z.object({
  gateway: z.object({ status: z.literal("ok") }),
  core: downstreamHealthSchema,
});

export type GatewayHealth = z.infer<typeof gatewayHealthSchema>;
