import { z } from "zod";

/**
 * AD-12: the structural fields every service needs, regardless of what it does.
 * A service extends this with its own fields (DATABASE_URL, adapter bindings, etc.)
 * rather than this package owning a single monolithic "the server's config" shape —
 * there is no longer one server, there are many independently-deployable services (AD-1).
 */
export const baseServiceEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
});

export interface BaseServiceConfig {
  port: number;
}

export function loadBaseServiceConfig(env: Record<string, string | undefined>): BaseServiceConfig {
  const parsed = baseServiceEnvSchema.parse(env);
  return { port: parsed.PORT };
}
