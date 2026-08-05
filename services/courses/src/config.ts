import { z } from "zod";
import { baseServiceEnvSchema } from "@usavvy/config";

const coursesEnvSchema = baseServiceEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3002),
  DATABASE_URL: z.url().default("postgres://usavvy:usavvy@localhost:5433/usavvy_courses"),
  // Same dev default as core/gateway (AD-12) — must match gateway's own
  // INTERNAL_SERVICE_SECRET exactly so gateway's proxied requests are trusted here.
  INTERNAL_SERVICE_SECRET: z.string().min(1).default("usavvy-dev-only-internal-secret-do-not-use-in-production"),
});

export interface CoursesConfig {
  port: number;
  databaseUrl: string;
  internalServiceSecret: string;
}

export function loadCoursesConfig(env: Record<string, string | undefined>): CoursesConfig {
  const parsed = coursesEnvSchema.parse(env);
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    internalServiceSecret: parsed.INTERNAL_SERVICE_SECRET,
  };
}
