import { z } from "zod";
import { baseServiceEnvSchema } from "@usavvy/config";

/**
 * AD-1/AD-12: this is the one place the mock/real binding for NotificationPort (and
 * every later port) is selected. Add new adapter names to this enum as they're built —
 * never let a module read process.env directly to make this choice itself.
 */
const notificationAdapterSchema = z.enum(["mock"]);

const coreEnvSchema = baseServiceEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.url().default("postgres://usavvy:usavvy@localhost:5432/usavvy_core"),
  STORAGE_ENDPOINT: z.url().default("http://localhost:8333"),
  NOTIFICATION_ADAPTER: notificationAdapterSchema.default("mock"),
});

export interface CoreConfig {
  port: number;
  databaseUrl: string;
  storageEndpoint: string;
  notificationAdapter: z.infer<typeof notificationAdapterSchema>;
}

export function loadCoreConfig(env: Record<string, string | undefined>): CoreConfig {
  const parsed = coreEnvSchema.parse(env);
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    storageEndpoint: parsed.STORAGE_ENDPOINT,
    notificationAdapter: parsed.NOTIFICATION_ADAPTER,
  };
}
