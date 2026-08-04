import { z } from "zod";

const webEnvSchema = z.object({
  VITE_API_URL: z.url().default("http://localhost:3000"),
  // No default, matching GOOGLE_CLIENT_ID's server-side treatment (core's config.ts) —
  // Google sign-in needs a real registered OAuth client even in dev. Unset means the
  // Google Sign-In button simply doesn't render.
  VITE_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
});

export interface WebConfig {
  apiUrl: string;
  googleClientId: string | undefined;
}

/**
 * Validates and returns the frontend's structural runtime config (AD-12). Takes the
 * env object (e.g. `import.meta.env`) as a parameter rather than reading it internally,
 * so this module has no direct dependency on Vite's runtime and stays unit-testable.
 * `VITE_API_URL` always points at `gateway` (AD-1) — the frontend never talks to any
 * other service directly.
 */
export function loadWebConfig(env: Record<string, string | undefined>): WebConfig {
  const parsed = webEnvSchema.parse(env);
  return {
    apiUrl: parsed.VITE_API_URL,
    googleClientId: parsed.VITE_GOOGLE_CLIENT_ID,
  };
}
