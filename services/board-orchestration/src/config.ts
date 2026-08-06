import { z } from "zod";
import { baseServiceEnvSchema } from "@usavvy/config";

const boardOrchestrationEnvSchema = baseServiceEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3004),
  DATABASE_URL: z.url().default("postgres://usavvy:usavvy@localhost:5433/usavvy_board_orchestration"),
  // Same dev default as every other service (AD-12) — must match gateway's own
  // INTERNAL_SERVICE_SECRET exactly so gateway's proxied requests are trusted here.
  INTERNAL_SERVICE_SECRET: z.string().min(1).default("usavvy-dev-only-internal-secret-do-not-use-in-production"),
});

export interface BoardOrchestrationConfig {
  port: number;
  databaseUrl: string;
  internalServiceSecret: string;
}

export function loadBoardOrchestrationConfig(env: Record<string, string | undefined>): BoardOrchestrationConfig {
  const parsed = boardOrchestrationEnvSchema.parse(env);
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    internalServiceSecret: parsed.INTERNAL_SERVICE_SECRET,
  };
}
