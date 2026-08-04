import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "@usavvy/service-kernel";

export interface JwtPayload {
  sub: string;
  role: string;
}

/** AD-7: gateway is the one place a client-presented JWT is verified. */
export function registerJwtPlugin(app: FastifyInstance, jwtSecret: string): void {
  void app.register(fastifyJwt, { secret: jwtSecret });
}

/**
 * `preHandler` for any protected route — never applied to `/auth/*`, which is
 * pre-authentication by definition. A missing/expired/malformed token maps to the
 * central error-mapper's 401, not `@fastify/jwt`'s raw default error.
 */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError("UNAUTHENTICATED", "authentication required", 401);
  }
}

/**
 * The one and only place `x-user-id`/`x-user-role` are set — `core` trusts them
 * unconditionally because nothing but `gateway` can reach it (AD-7).
 */
export function trustedHeaders(request: FastifyRequest): Record<string, string> {
  const payload = request.user as JwtPayload;
  return { "x-user-id": payload.sub, "x-user-role": payload.role };
}
