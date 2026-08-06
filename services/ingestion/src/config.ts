import { z } from "zod";
import { baseServiceEnvSchema } from "@usavvy/config";

/**
 * AD-1/AD-12: the one place the mock/real StoragePort/JobQueuePort binding is
 * selected for this service — never let a module read process.env directly.
 */
const storageAdapterSchema = z.enum(["mock", "seaweedfs"]);
const jobQueueAdapterSchema = z.enum(["mock", "pgboss"]);

const ingestionEnvSchema = baseServiceEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3003),
  DATABASE_URL: z.url().default("postgres://usavvy:usavvy@localhost:5433/usavvy_ingestion"),
  // Same dev default as every other service (AD-12) — must match gateway's own
  // INTERNAL_SERVICE_SECRET exactly so gateway's proxied requests are trusted here.
  INTERNAL_SERVICE_SECRET: z.string().min(1).default("usavvy-dev-only-internal-secret-do-not-use-in-production"),
  STORAGE_ENDPOINT: z.url().default("http://localhost:8333"),
  STORAGE_ADAPTER: storageAdapterSchema.default("seaweedfs"),
  STORAGE_BUCKET: z.string().min(1).default("uploads"),
  JOB_QUEUE_ADAPTER: jobQueueAdapterSchema.default("pgboss"),
});

export interface IngestionConfig {
  port: number;
  databaseUrl: string;
  internalServiceSecret: string;
  storageEndpoint: string;
  storageAdapter: z.infer<typeof storageAdapterSchema>;
  storageBucket: string;
  jobQueueAdapter: z.infer<typeof jobQueueAdapterSchema>;
}

export function loadIngestionConfig(env: Record<string, string | undefined>): IngestionConfig {
  const parsed = ingestionEnvSchema.parse(env);
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    internalServiceSecret: parsed.INTERNAL_SERVICE_SECRET,
    storageEndpoint: parsed.STORAGE_ENDPOINT,
    storageAdapter: parsed.STORAGE_ADAPTER,
    storageBucket: parsed.STORAGE_BUCKET,
    jobQueueAdapter: parsed.JOB_QUEUE_ADAPTER,
  };
}
