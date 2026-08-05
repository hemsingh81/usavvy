import type { FastifyInstance } from "fastify";
import type { ProxyOptions, ProxyResult } from "./coreClient.js";
import { requireAuth, trustedHeaders } from "./authPlugin.js";

export interface AuthProxyDeps {
  forwardToCore: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
}

// Unauthenticated by definition (pre-JWT-auth) — forwarded to `core` as-is, no trusted
// headers set. Story 1.2 adds /users/parental-consent here: the parent has no account,
// same public-link reasoning as /auth/verify-email.
const PUBLIC_PROXY_PATHS = ["/auth/signup", "/auth/login", "/auth/verify-email", "/auth/refresh", "/auth/google", "/users/parental-consent"];

export function registerAuthProxyRoutes(app: FastifyInstance, deps: AuthProxyDeps): void {
  for (const path of PUBLIC_PROXY_PATHS) {
    app.post(path, async (request, reply) => {
      const result = await deps.forwardToCore("POST", path, { body: request.body });
      reply.code(result.status).send(result.body);
    });
  }

  app.get("/me", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("GET", "/me", { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.post("/users/age-declaration", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("POST", "/users/age-declaration", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.get("/users/onboarding", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("GET", "/users/onboarding", { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.put("/users/onboarding/step", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("PUT", "/users/onboarding/step", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.get("/users/preferences", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("GET", "/users/preferences", { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.put("/users/preferences", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("PUT", "/users/preferences", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.put("/users/display-name", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("PUT", "/users/display-name", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.get("/users/privacy-settings", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("GET", "/users/privacy-settings", { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  app.put("/users/privacy-settings", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("PUT", "/users/privacy-settings", { body: request.body, headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });
}
