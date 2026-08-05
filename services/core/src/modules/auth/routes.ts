import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "@usavvy/service-kernel";
import type { AuthSessionResponse } from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import type { NotificationPort } from "../notification/index.js";
import { googleAuth, login, persistRefreshTokenHash, refreshSession, signup, verifyEmail, type UserSummary } from "./service.js";
import { hashToken } from "./tokens.js";
import { parseOrThrow } from "./validation.js";

export interface AuthRouteDeps {
  db: Db;
  notificationPort: NotificationPort;
  googleClientId: string | undefined;
}

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "30d";
// Review finding: no upper bound meant an arbitrarily large request body was passed
// straight into argon2.hash. 128 is a generous ceiling no genuine password needs.
const MAX_PASSWORD_LENGTH = 128;

// Trim+lowercase before format validation so accidental whitespace doesn't reject an
// otherwise-valid email at this layer — service.ts's normalizeEmail() does the same
// normalization again before any DB comparison (defense in depth, review finding).
// Exported for reuse by other core modules (e.g. users' parentEmail field, Story 1.2) —
// one email-validation rule, not a second one redefined per call site.
export const emailField = z.string().trim().toLowerCase().pipe(z.email());

// Password: 8-char minimum, no forced composition rules (current NIST 800-63B
// guidance favors length over composition; no NFR mandates anything stricter).
const signupSchema = z.object({ email: emailField, password: z.string().min(8).max(MAX_PASSWORD_LENGTH) });
const loginSchema = z.object({ email: emailField, password: z.string().min(1) });
const verifyEmailSchema = z.object({ token: z.string().min(1) });
const refreshSchema = z.object({ refreshToken: z.string().min(1) });
const googleAuthSchema = z.object({ idToken: z.string().min(1) });

interface JwtPayload {
  sub: string;
  role: string;
  // Review finding: access and refresh tokens were structurally indistinguishable —
  // this is checked on the refresh path (service.ts's refreshSession) and by
  // gateway's requireAuth on the access path.
  typ: "access" | "refresh";
}

async function issueTokens(app: FastifyInstance, deps: AuthRouteDeps, user: UserSummary): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await app.jwt.sign({ sub: user.id, role: user.role, typ: "access" } satisfies JwtPayload, { expiresIn: ACCESS_TOKEN_TTL });
  const refreshToken = await app.jwt.sign({ sub: user.id, role: user.role, typ: "refresh" } satisfies JwtPayload, { expiresIn: REFRESH_TOKEN_TTL });
  await persistRefreshTokenHash(deps.db, user.id, hashToken(refreshToken));
  return { accessToken, refreshToken };
}

async function issueSession(app: FastifyInstance, deps: AuthRouteDeps, user: UserSummary): Promise<AuthSessionResponse> {
  const tokens = await issueTokens(app, deps, user);
  return { ...tokens, user };
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDeps): void {
  app.post("/auth/signup", async (request, reply) => {
    const body = parseOrThrow(signupSchema, request.body);
    const result = await signup(deps.db, deps.notificationPort, body);
    reply.code(201).send(result);
  });

  app.post("/auth/login", async (request, reply) => {
    const body = parseOrThrow(loginSchema, request.body);
    const user = await login(deps.db, body);
    reply.send(await issueSession(app, deps, user));
  });

  app.post("/auth/verify-email", async (request, reply) => {
    const body = parseOrThrow(verifyEmailSchema, request.body);
    const user = await verifyEmail(deps.db, body);
    reply.send(await issueSession(app, deps, user));
  });

  app.post("/auth/refresh", async (request, reply) => {
    const body = parseOrThrow(refreshSchema, request.body);
    const verifyRefreshToken = (token: string) => app.jwt.verify<JwtPayload>(token);
    const user = await refreshSession(deps.db, verifyRefreshToken, body);
    reply.send(await issueTokens(app, deps, user));
  });

  app.post("/auth/google", async (request, reply) => {
    if (!deps.googleClientId) {
      throw new AppError("GOOGLE_OAUTH_NOT_CONFIGURED", "Google sign-in is not configured on this environment", 503);
    }
    const body = parseOrThrow(googleAuthSchema, request.body);
    const user = await googleAuth(deps.db, deps.googleClientId, body);
    reply.send(await issueSession(app, deps, user));
  });
}
