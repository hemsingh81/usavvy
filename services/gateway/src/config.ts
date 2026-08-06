import { z } from "zod";
import { baseServiceEnvSchema } from "@usavvy/config";

const gatewayEnvSchema = baseServiceEnvSchema.extend({
  PORT: z.coerce.number().int().positive().default(3000),
  CORE_SERVICE_URL: z.url().default("http://localhost:3001"),
  COURSES_SERVICE_URL: z.url().default("http://localhost:3002"),
  INGESTION_SERVICE_URL: z.url().default("http://localhost:3003"),
  WEB_ORIGIN: z.url().default("http://localhost:5173"),
  // Must match core's JWT_SECRET exactly (AD-7's single symmetric secret) — core signs,
  // gateway verifies. Same dev-only default as core's; override both together.
  JWT_SECRET: z.string().min(1).default("usavvy-dev-only-jwt-secret-do-not-use-in-production"),
  // Must match core's INTERNAL_SERVICE_SECRET exactly — sent on every proxied request
  // so core can verify it's actually gateway calling, not anything else that can reach
  // its port (review finding: the trust boundary was previously unenforced).
  INTERNAL_SERVICE_SECRET: z.string().min(1).default("usavvy-dev-only-internal-secret-do-not-use-in-production"),
});

export interface GatewayConfig {
  port: number;
  coreServiceUrl: string;
  coursesServiceUrl: string;
  ingestionServiceUrl: string;
  webOrigin: string;
  jwtSecret: string;
  internalServiceSecret: string;
}

export function loadGatewayConfig(env: Record<string, string | undefined>): GatewayConfig {
  const parsed = gatewayEnvSchema.parse(env);
  return {
    port: parsed.PORT,
    coreServiceUrl: parsed.CORE_SERVICE_URL,
    coursesServiceUrl: parsed.COURSES_SERVICE_URL,
    ingestionServiceUrl: parsed.INGESTION_SERVICE_URL,
    webOrigin: parsed.WEB_ORIGIN,
    jwtSecret: parsed.JWT_SECRET,
    internalServiceSecret: parsed.INTERNAL_SERVICE_SECRET,
  };
}
