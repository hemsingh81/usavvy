import { z } from "zod";

/**
 * AD-1/AD-12: this is the one place the mock/real binding for NotificationPort (and
 * every later port) is selected. Add new adapter names to this enum as they're built —
 * never let a module read process.env directly to make this choice itself.
 */
const notificationAdapterSchema = z.enum(["mock"]);

const serverEnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),
  NOTIFICATION_ADAPTER: notificationAdapterSchema.default("mock"),
});

export interface ServerConfig {
  port: number;
  notificationAdapter: z.infer<typeof notificationAdapterSchema>;
}

/**
 * Validates and returns the backend's structural runtime config (AD-12: boot-time,
 * zod-validated, loaded once). Takes the raw env object as a parameter rather than
 * reading `process.env` itself, so this module stays environment-agnostic and testable.
 */
export function loadServerConfig(env: Record<string, string | undefined>): ServerConfig {
  const parsed = serverEnvSchema.parse(env);
  return {
    port: parsed.PORT,
    notificationAdapter: parsed.NOTIFICATION_ADAPTER,
  };
}
