import type { FastifyInstance } from "fastify";
import type { BinaryProxyOptions, BinaryProxyResult, ProxyOptions, ProxyResult } from "./coreClient.js";
import { requireAuth, trustedHeaders } from "./authPlugin.js";

export interface AuthProxyDeps {
  forwardToCore: (method: string, path: string, options?: ProxyOptions) => Promise<ProxyResult>;
  forwardBinaryToCore: (method: string, path: string, options?: BinaryProxyOptions) => Promise<BinaryProxyResult>;
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

  app.post("/users/account-deletion", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("POST", "/users/account-deletion", { headers: trustedHeaders(request) });
    reply.code(result.status).send(result.body);
  });

  // Story 1.8 review finding: this is the "download my personal data" endpoint
  // (identity fields, onboarding answers, preferences, privacy settings) — no-store
  // keeps it out of the browser's disk cache and any intermediary cache.
  app.get("/users/data-export/json", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardToCore("GET", "/users/data-export/json", { headers: trustedHeaders(request) });
    reply.header("cache-control", "no-store").code(result.status).send(result.body);
  });

  app.get("/users/data-export/pdf", { preHandler: requireAuth }, async (request, reply) => {
    const result = await deps.forwardBinaryToCore("GET", "/users/data-export/pdf", { headers: trustedHeaders(request) });
    reply.header("cache-control", "no-store");
    // Review finding: branching on `result.isBinary` (derived from the upstream
    // response's own status) rather than a strict content-type string match — a
    // genuinely successful response must never fall into the JSON-error path just
    // because its content-type header wasn't byte-for-byte "application/pdf".
    if (result.isBinary) {
      reply
        .code(result.status)
        .type(result.contentType ?? "application/pdf")
        .header("content-disposition", result.contentDisposition ?? 'attachment; filename="usavvy-data-export.pdf"')
        .send(result.body);
      return;
    }
    reply.code(result.status).send(result.body);
  });
}
