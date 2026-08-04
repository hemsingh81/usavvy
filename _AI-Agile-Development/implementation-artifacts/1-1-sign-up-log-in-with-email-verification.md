---
baseline_commit: 23e85cd
---

# Story 1.1: Sign Up & Log In with Email Verification

Status: ready-for-dev

*(Epic 1, FR-A-1. First real auth story — wires JWT + RBAC end to end per the architecture spine's own "walking-skeleton delivery direction," and is the first story to touch a real database table, so it also wires Drizzle for real.)*

## Story

As a learner,
I want to sign up with email+password or Google OAuth and verify my email,
so that I can securely access my account before starting to learn.

## Acceptance Criteria

1. **Given** a new visitor registers with email+password **When** they submit the form **Then** a verification email sends via `NotificationPort` (mock adapter in dev, per Story 1.0) **And** they cannot obtain an authenticated session (login is rejected with a specific "email not verified" error) until verified — this is the buildable, present-day form of the epic's "cannot start a board session until verified": the Board doesn't exist yet (Epic 3), so the enforcement point today is login, which is what will gate Board access once it does exist

2. **Given** a visitor chooses "Sign up with Google" **When** OAuth completes **Then** the account is created (or matched by Google account id if it already exists) and treated as pre-verified — no verification email is sent, login succeeds immediately

3. **Given** an unverified user clicks the verification link **Then** their account becomes verified and they receive a working authenticated session (the redirect-to-onboarding destination named in the epic doesn't exist yet — Story 1.3 — so this story lands them on a plain "verified" confirmation screen; Story 1.3 changes the destination, not the verification mechanism)

## Tasks / Subtasks

- [x] **Task 1: Wire Drizzle for real — `users` + `email_verification_tokens` schema** (AC: #1, #2, #3)
  - [x] `services/core/src/db/schema.ts`: Drizzle table definitions (see Dev Notes for exact columns)
  - [x] `services/core/drizzle.config.ts` pointing at the schema file and a `services/core/drizzle/` migrations output folder; `db:generate`/`db:migrate` scripts in `services/core/package.json` (migration client must use `postgres(url, { max: 1 })` per Drizzle's own postgres-js guidance — a pooled connection breaks migrations)
  - [x] `services/core/src/db/client.ts`: the real Drizzle client (`drizzle(sql)` wrapping the existing `postgres` instance `main.ts` already creates) — replace the raw-SQL-ping-only usage with a shared `sql`/`db` pair main.ts exports for the rest of the service to import, rather than each module opening its own connection
  - [x] Document the one new manual setup step in `README.md`'s quick start: `pnpm --filter @usavvy/core db:migrate`, run once after `docker compose up` and before `pnpm dev`

- [x] **Task 2: RBAC seed data + `can()` guard** (AD-7 — foundational; exercised by AC #1–#3 via `/me`)
  - [x] `packages/config/src/rbac.ts`: `Role` enum (`superadmin`/`admin`/`mentor`/`student`), a versioned `PERMISSION_MATRIX` seed object, and one `can(role, action, resource)` guard function — this is the *only* place an authorization decision is made, per AD-7's "one guard" rule
  - [x] Seed the matrix with only what this story actually exercises: every role can `read` the `self` resource (`/me`). Do not fabricate unused permission entries for features that don't exist yet — later stories extend this matrix as their own protected resources land
  - [x] New user defaults to `student` (no signup flow grants any other role)

- [x] **Task 3: Password hashing + JWT plugin wiring** (AC: #1, #2, #3)
  - [x] `argon2` (argon2id, the 2026 OWASP-recommended default for a new project — no legacy bcrypt deployment to preserve) for `password_hash`; never store or log a raw password
  - [x] Register `@fastify/jwt` in **both** `core` (signs access+refresh on successful auth) and `gateway` (verifies the client-presented access token) — both read the same `JWT_SECRET` from their own config (AD-12), matching the "shared symmetric secret" the architecture's single-hop-verification design requires. Access token TTL 15m, refresh TTL 30d
  - [x] `JWT_SECRET` gets a dev-only default (documented in `README.md`, clearly flagged as unsafe for any non-local deployment) — same pattern as `DATABASE_URL`'s dev default, not a config gap
  - [x] Refresh token: store only its hash (`argon2` or a plain SHA-256 — a refresh token isn't a low-entropy secret being brute-forced the way a password is, so SHA-256 is sufficient and cheaper) in `users.refresh_token_hash`, single active refresh token per user (MVP scope — no multi-device session list; note this as a scope decision, not an oversight), rotated on every use via `POST /auth/refresh`

- [x] **Task 4: `services/core`'s `auth` module — signup, login, verify-email, refresh, Google OAuth** (AC: #1, #2, #3)
  - [x] `POST /auth/signup` `{ email, password }` → reject if email already registered; hash password; insert `users` row (`role: "student"`, `email_verified_at: null`); generate a random verification token (32 bytes, base64url), store only its SHA-256 hash + a 24h expiry in `email_verification_tokens`; send the **raw** token in a verification link via `notificationPort.sendEmail(...)` (import the `notificationPort` instance `main.ts` already exports — do not construct a second adapter instance, `main.ts`'s own comment says as much); return `201` with `{ userId }`, no tokens issued yet (unverified)
  - [x] `POST /auth/login` `{ email, password }` → verify password via `argon2.verify`; if `email_verified_at` is null, return a `403` with a specific `error.code` (e.g. `EMAIL_NOT_VERIFIED`) per the central error-mapper shape (`{ error: { code, message, details? } }`, Consistency Conventions) — never a generic 401; on success issue access+refresh JWTs (`role` claim included, since `gateway`'s trusted header forwards it)
  - [x] `POST /auth/verify-email` `{ token }` → hash the incoming token, look up by hash, reject if not found/expired/already used; mark `users.email_verified_at = now()` and the token row `used_at = now()` in one transaction; issue access+refresh JWTs so the learner lands verified *and* logged in, not just verified-but-logged-out
  - [x] `POST /auth/refresh` `{ refreshToken }` → verify against the stored hash, reject if mismatched (the account's single active refresh token was already rotated/revoked); issue a new access+refresh pair, overwrite the stored hash (rotation)
  - [x] `POST /auth/google` `{ idToken }` → verify via `google-auth-library`'s `OAuth2Client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`; find user by `google_id`, else by matching `email` (link the Google account to an existing email+password account rather than creating a duplicate), else create new (`email_verified_at: now()` — pre-verified per AC #2, `password_hash: null`); issue tokens directly, no separate login step
  - [x] `GOOGLE_CLIENT_ID` has **no dev default** (unlike every other config value in this codebase so far) — a real Google Cloud OAuth client must be registered to exercise this path at all, even in dev, since it's a client-facing identity flow rather than a generation/voice/notification call that a `mock` adapter can stand in for. If unset, `/auth/google` returns a clear `503`-with-explanation rather than crashing at boot or on first call (AD-17) — document this in `README.md` next to `JWT_SECRET`

- [x] **Task 5: `services/core`'s `users` module — `/me`** (supports AC #1–#3: the "am I logged in and verified" check every later protected page will reuse)
  - [x] `GET /me` reads the trusted `x-user-id`/`x-user-role` headers `gateway` sets (never re-verifies the JWT itself, per AD-7) and returns `{ id, email, emailVerified, role }` for the resolved user, gated through `can(role, "read", "self")` from Task 2
  - [x] If the trusted headers are absent (a request that somehow reached `core` without going through `gateway`'s preHandler — shouldn't happen given `core` isn't publicly bound, but AD-17 forbids assuming a guarantee an interface doesn't state), return `401`, not a crash

- [x] **Task 6: `services/gateway` — JWT verification + trusted-header forwarding + `/auth/*` proxy** (AC: #1, #2, #3; this is the first story to give `gateway` an actual authorization responsibility, not just pass-through health aggregation)
  - [x] A `preHandler` hook (applied to `/me` and any future protected route, **not** to `/auth/*` — those are pre-authentication by definition) that calls `request.jwtVerify()`; on failure, returns `401` via the central error-mapper shape rather than letting `@fastify/jwt`'s default error surface raw
  - [x] On success, set `x-user-id`/`x-user-role` headers on the proxied request to `core` from the verified JWT payload — this is the one and only place these headers are set; `core` trusts them unconditionally because nothing but `gateway` can reach it (AD-7)
  - [x] Proxy routes: `POST /auth/signup`, `/auth/login`, `/auth/verify-email`, `/auth/refresh`, `/auth/google` (unauthenticated, forwarded as-is to `core`) and `GET /me` (authenticated, per above) — extend `coreClient.ts`'s typed-fetch-wrapper pattern from Story 1.0 rather than introducing a second way to call `core`

- [ ] **Task 7: `apps/web`'s `auth` module — sign-up, log-in, verify-email screens; Google Sign-In; component base decision** (AC: #1, #2, #3)
  - [ ] **Resolve the `EXPERIENCE.md` `[ASSUMPTION]`:** adopt Radix UI primitives (package `radix-ui`) as `apps/web`'s component base, styled from `DESIGN.md`'s tokens — this is the first story building real form UI, exactly the point `EXPERIENCE.md` flagged as needing "engineering confirmation" before the base solidifies. Confirmed compatible with React 19 (verified live, not assumed)
  - [ ] Sign-up form (email, password, submit), login form (email, password, submit) — both built from Radix `Form`/primitive inputs, not raw unstyled `<input>` — client-side validation (non-empty, basic email shape) before submit, server error surfaced inline (never a silent failure, AD-17)
  - [ ] "Check your email" confirmation screen after signup (no auto-login — matches AC #1's "cannot obtain a session until verified")
  - [ ] Verify-email landing route reads `?token=` from the URL, calls `/auth/verify-email`, shows a distinguishable success/expired/already-used state (never a blank page while the call is in flight or on failure)
  - [ ] Google Sign-In via `@react-oauth/google` (wraps Google Identity Services; confirmed React-version-agnostic peer dep, so React 19-safe) — renders only if `VITE_GOOGLE_CLIENT_ID` is configured client-side; omit the button entirely rather than rendering a button that 503s on click when it isn't. Add `VITE_GOOGLE_CLIENT_ID` to `packages/config/src/web.ts`'s `webEnvSchema` as `z.string().optional()` (no default, matching `GOOGLE_CLIENT_ID`'s server-side treatment in Task 4) alongside the existing `VITE_API_URL` field — don't read `import.meta.env` directly in the component, same rule `VITE_API_URL` already follows
  - [ ] A small `useAuth` hook/context: holds the access token in memory (not `localStorage` — an XSS-exfiltrable long-lived token in `localStorage` is a real, avoidable risk; losing it on hard refresh is an acceptable MVP trade-off, silently re-fetch via `/auth/refresh` using a refresh token kept in an httpOnly-equivalent... **no** — this codebase has no cookie infrastructure yet, so for this story the refresh token also lives in memory alongside the access token; document this as a known MVP gap, not a silent decision, since a page refresh currently logs the learner out. This is honest scope, not a security hole given nothing sensitive is reachable yet yet (Board doesn't exist))

- [ ] **Task 8: Tests mirroring `src/` 1:1** (AD-8; extends Story 1.0's established pattern rather than inventing a new one)
  - [ ] `services/core/tests/db/schema.test.ts` or equivalent — schema constraints actually enforced (unique email, FK behavior)
  - [ ] `services/core/tests/modules/auth/*.test.ts` — signup/login/verify/refresh/google handlers, including the unverified-login-rejected and duplicate-email-rejected paths
  - [ ] `services/core/tests/modules/users/*.test.ts` — `/me` with and without trusted headers
  - [ ] `packages/config/tests/rbac.test.ts` — `can()` guard, including a role with no matching matrix entry denying by default (never fail-open)
  - [ ] `services/gateway/tests/*.test.ts` — JWT verify preHandler (valid/expired/missing token), trusted-header forwarding, proxy routes
  - [ ] `apps/web/tests/modules/auth/*.test.tsx` — sign-up/login forms (success + inline error states), verify-email landing page's three states

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-1 (ports-and-adapters):** `NotificationPort` already exists (Story 1.0) — call the exported `notificationPort` instance from `core`'s `main.ts`, don't construct a new adapter. This story introduces no new port; Google OAuth and JWT are not ports (they're not swappable-by-config vendor integrations the way generation/voice/storage are) — don't over-abstract them into one.
- **AD-7 (RBAC):** roles are `superadmin`/`admin`/`mentor`/`student`, config-seeded, DB-assigned, one `can()` guard, JWT verified exactly once at `gateway`'s `preHandler`, trusted headers downstream. This story is where all of that gets built for the first time — get the header-trust boundary right, since every later protected route depends on it being correct now.
- **AD-8 (test mirroring):** see Task 8.
- **AD-9 (no dead code):** the `eslint-plugin-boundaries` follow-up Story 1.0 deferred is *still* deferred — don't block this story on it, but be aware `services/core/src/modules/auth` and `.../users` are meant to be decoupled from each other even sharing one process (AD-13's intra-service module rule), so `auth` should not reach into `users`' internals — talk to it via its `index.ts` barrel only, same rule as any other module pair.
- **AD-12 (config):** `JWT_SECRET` and `GOOGLE_CLIENT_ID` are new config values on both `core` and `gateway` (JWT_SECRET) / `core` only (GOOGLE_CLIENT_ID, server-side verification) and `apps/web` (`VITE_GOOGLE_CLIENT_ID`, client-side button rendering) — all through `packages/config`'s zod schema pattern, none read from `process.env` directly at a call site.
- **AD-13/AD-14 (ownership):** `User` (and its new `email_verification_tokens` friend table) is owned by `core` alone — no other service reaches into this schema, matching the database-per-service rule already in place.
- **AD-17 (no silent failures):** every new failure path above (unverified login, expired/used verification token, Google token verification failure, missing trusted headers, unconfigured `GOOGLE_CLIENT_ID`) must resolve to a specific, distinguishable state — reuse the `{ error: { code, message, details? } }` shape from Consistency Conventions consistently rather than each handler inventing its own.
- **Consistency Conventions:** IDs are UUIDv7 — **verified live** that the running Postgres 18 container has a native `uuidv7()` function (`select uuidv7()` returned a real value), so use `default(sql\`uuidv7()\`)` at the schema level rather than generating IDs in application code. Timestamps ISO 8601 UTC. Every mutable entity (i.e. `users`) carries `updated_at` + a `version` column per the optimistic-concurrency convention — a login/verify/refresh write should bump it.

### Previous story intelligence (Story 1.0)

- `services/core/src/main.ts` already creates the `postgres` client and exports `notificationPort` — this story adds a Drizzle wrapper around the *same* `sql` instance (Task 1), not a second connection.
- `core`'s `DATABASE_URL` default is `postgres://usavvy:usavvy@localhost:5433/usavvy_core` — **port 5433, not 5432** (changed in the commit immediately before this story, to avoid colliding with a native Postgres install on the dev machine). Drizzle's `drizzle.config.ts` must read the same `DATABASE_URL` (via `loadCoreConfig` or the same env var), not a hardcoded/re-guessed connection string.
- Every external network call in this codebase gets an explicit timeout (`AbortSignal.timeout(...)` for `fetch`, a `Promise.race` wrapper for others) per Story 1.0's own code-review finding — apply the same discipline to the Google token-verification call and the `gateway`→`core` proxy calls this story adds.
- Config validation failures throw at `zod.parse()` time inside `loadXConfig` — new fields (`JWT_SECRET`, `GOOGLE_CLIENT_ID`) follow the same `z.url()`/`z.string()` pattern already established in `services/core/src/config.ts` and `services/gateway/src/config.ts`, not a parallel config-loading mechanism.
- Git workflow convention carries forward: commit at each logical checkpoint once its tests pass (Task-sized commits, not one giant end-of-story commit).

### Latest library versions (verified live via `npm view`, 2026-08-05 — do not re-guess)

| Package | Version | Use |
| --- | --- | --- |
| `argon2` | 0.45.1 | password hashing (argon2id) |
| `@fastify/jwt` | 10.2.1 | JWT sign (`core`) / verify (`gateway`) |
| `google-auth-library` | 11.0.0 | `OAuth2Client.verifyIdToken` for Google sign-in |
| `drizzle-orm` | 0.45.2 | ORM, `postgres-js` driver mode |
| `drizzle-kit` | 0.31.10 | migration generation/CLI |
| `radix-ui` | 1.6.7 | component base (resolves `EXPERIENCE.md`'s `[ASSUMPTION]`) — confirmed React 19-compatible |
| `@react-oauth/google` | 0.13.5 | Google Identity Services React wrapper — peer dep is `react >=16.8.0`, no React 19 conflict |
| `zod` | 4.4.3 | already a dependency; no version bump needed, listed for reference |

Drizzle + `postgres-js` migration gotcha (from current docs): the migration client must be created with `postgres(url, { max: 1 })` — a pooled connection (the default) breaks `drizzle-orm/postgres-js/migrator`'s `migrate()`. Use a separate single-connection client for the migration script; the app's normal `sql` client (already pooled by default in `main.ts`) is unaffected and unrelated to this.

### Project Structure Notes

New files this story adds (nothing here conflicts with Story 1.0's structure — `auth`/`users`/`notification` module folders inside `core` already exist as shells per the Structural Seed):

```text
services/core/
  drizzle.config.ts                          # new
  drizzle/                                   # new — generated migrations
  src/
    db/
      schema.ts                              # new — users, email_verification_tokens
      client.ts                              # new — drizzle(sql) wrapper
    modules/
      auth/
        index.ts                             # was a shell; real barrel now
        signup.ts, login.ts, verify-email.ts, refresh.ts, google.ts   # new
      users/
        index.ts                             # was a shell; real barrel now
        me.ts                                # new
  tests/
    db/schema.test.ts                        # new
    modules/auth/*.test.ts                   # new
    modules/users/*.test.ts                  # new

services/gateway/
  src/
    authPlugin.ts                            # new — @fastify/jwt registration + preHandler
    authProxy.ts                             # new — /auth/* + /me route proxying (extends coreClient.ts's pattern)
  tests/
    authPlugin.test.ts, authProxy.test.ts    # new

packages/config/
  src/rbac.ts                                # new — Role enum, PERMISSION_MATRIX, can()
  tests/rbac.test.ts                         # new

apps/web/
  src/
    modules/auth/
      index.ts                               # was a shell; real barrel now
      SignUpPage.tsx, LoginPage.tsx, VerifyEmailPage.tsx   # new
      useAuth.ts                             # new
    shared/
      (Radix-based primitive wrappers land here — Button, TextField, Form — per DESIGN.md tokens)
  tests/modules/auth/*.test.tsx              # new
```

### Validation rules (avoid an arbitrary or inconsistent rule per layer)

- **Email:** validated server-side with zod's `z.email()` (same library/pattern already used for `DATABASE_URL`'s `z.url()`) — never a hand-rolled regex.
- **Password:** minimum 8 characters, no forced composition rules (no mandatory uppercase/digit/symbol) — this matches current NIST 800-63B guidance favoring length over composition, and there's no NFR mandating anything stricter. Enforce the same 8-character minimum in both the client-side form (Task 7) and the server-side `signup` handler (Task 4) — one rule, not two independently-guessed ones.
- **Rate limiting on `/auth/*`:** explicitly out of scope for this story — NFR-18 scopes rate-limiting to generation endpoints specifically, and no other NFR names auth brute-force protection yet. Don't add it speculatively; flag it as a follow-up if a later security pass calls for it.

### API response shapes (avoid inventing ad hoc ones per handler)

| Route | Success shape |
| --- | --- |
| `POST /auth/signup` | `201 { userId: string }` |
| `POST /auth/login` | `200 { accessToken, refreshToken, user: { id, email, role } }` |
| `POST /auth/verify-email` | `200 { accessToken, refreshToken, user: { id, email, role } }` (same shape as login — verifying also logs in) |
| `POST /auth/refresh` | `200 { accessToken, refreshToken }` |
| `POST /auth/google` | `200 { accessToken, refreshToken, user: { id, email, role } }` |
| `GET /me` | `200 { id, email, emailVerified: boolean, role }` |
| any failure | `{ error: { code, message, details? } }` with the appropriate status (400 validation, 401 auth, 403 unverified, 404 unknown token, 409 duplicate email, 503 Google OAuth unconfigured) |

### Testing requirements

- `services/core/tests/modules/auth/`: signup (success, duplicate email), login (success, wrong password, unverified account), verify-email (success, expired token, already-used token, unknown token), refresh (success, mismatched/rotated-away token), google (new user, existing-email link, invalid Google token)
- `services/core/tests/modules/users/me.test.ts`: valid trusted headers → 200 with correct shape; missing headers → 401
- `packages/config/tests/rbac.test.ts`: every seeded matrix entry allows correctly; an unlisted role/action/resource combination denies (fail-closed, not fail-open)
- `services/gateway/tests/`: missing/expired/malformed JWT on a protected route → 401 via the error-mapper shape; valid JWT → headers set correctly on the forwarded request; `/auth/*` routes reachable with no JWT at all
- `apps/web/tests/modules/auth/`: sign-up and login forms render inline validation/server errors distinguishably (never blank/silent); verify-email page's three states (success/expired/already-used) each render distinct, non-blank UI
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` + native dev servers before this story is considered done

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.1, Epic 1 intro, Requirements Inventory FR-A-1]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-7, AD-8, AD-9, AD-12, AD-13, AD-14, AD-17, Consistency Conventions, Stack table]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Foundation's Radix UI `[ASSUMPTION]`, Information Architecture surface map, State Patterns]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — Buttons, color tokens, error/warning/success semantic triad]
- [Source: `Doc/00-Requirement.md` — FR-A-1, NFR-16 (minor protections, not this story's concern but adjacent — see Story 1.2), NFR-17 (PII minimization)]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-0-environment-walking-skeleton-health-check.md` — established config/logging/timeout/testing conventions, `notificationPort` export, port-5433 change]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1–5 (backend: Drizzle, RBAC, JWT, auth, users):** `db.transaction()` used for `verifyEmail` (mark-used + mark-verified atomically). Auth business logic in `service.ts` stays Fastify-free (testable directly against the real Postgres container, same integration-test philosophy as Story 1.0's `db.test.ts`); JWT sign/verify lives in `routes.ts` since it needs the `app.jwt` decorator. Added a shared `AppError`/`registerErrorHandler` to `packages/service-kernel` and an `ErrorEnvelope`/`MeResponse`/`AuthSessionResponse` DTO set to `packages/shared-types` — genuinely cross-service contracts (every service's error shape; `/me` and session responses gateway proxies verbatim), not story-local additions. `noUncheckedIndexedAccess` (root tsconfig) required explicit undefined-checks on every `.returning()` call — caught at typecheck time, not runtime. 96 tests green across the touched workspaces (up from 54 after Story 1.0), `tsc --noEmit`/`eslint .` clean.

### File List

- `packages/shared-types/src/errors.ts` (new — `ErrorEnvelope`)
- `packages/shared-types/src/auth.ts` (new — `MeResponse`, `AuthSessionResponse`)
- `packages/shared-types/src/index.ts` (updated — barrel exports)
- `packages/service-kernel/package.json` (updated — `fastify`, `@usavvy/shared-types` deps)
- `packages/service-kernel/src/errors.ts` (new — `AppError`, `registerErrorHandler`)
- `packages/service-kernel/src/index.ts` (updated — barrel exports)
- `packages/config/src/rbac.ts` (new — `Role`, `PERMISSION_MATRIX`, `can()`)
- `packages/config/src/index.ts` (updated — barrel exports)
- `packages/config/tests/rbac.test.ts` (new)
- `services/core/package.json` (updated — `@fastify/jwt`, `argon2`, `drizzle-kit`, `google-auth-library`; `db:generate`/`db:migrate` scripts)
- `services/core/drizzle.config.ts` (new)
- `services/core/drizzle/0000_fixed_captain_stacy.sql` (new — generated migration)
- `services/core/src/db/schema.ts` (new — `users`, `email_verification_tokens`)
- `services/core/src/db/client.ts` (new — `createDb`)
- `services/core/src/db/migrate.ts` (new — migration CLI script)
- `services/core/src/config.ts` (updated — `JWT_SECRET`, `GOOGLE_CLIENT_ID`)
- `services/core/src/main.ts` (updated — wires `db`, passes new deps to `buildApp`)
- `services/core/src/app.ts` (updated — registers `@fastify/jwt`, error handler, auth/users routes)
- `services/core/src/modules/auth/tokens.ts` (new)
- `services/core/src/modules/auth/validation.ts` (new — `parseOrThrow`)
- `services/core/src/modules/auth/service.ts` (new — signup/login/verifyEmail/refreshSession/googleAuth)
- `services/core/src/modules/auth/routes.ts` (new — HTTP layer, JWT issuance)
- `services/core/src/modules/auth/index.ts` (updated — real barrel, replaces shell)
- `services/core/src/modules/users/service.ts` (new — `getMe`)
- `services/core/src/modules/users/routes.ts` (new — `GET /me`)
- `services/core/src/modules/users/index.ts` (updated — real barrel, replaces shell)
- `services/core/tests/config.test.ts` (updated — new config fields)
- `services/core/tests/health.test.ts` (updated — uses new `createTestAppDeps` helper)
- `services/core/tests/testHelpers.ts` (new)
- `services/core/tests/db/schema.test.ts` (new)
- `services/core/tests/modules/auth/tokens.test.ts` (new)
- `services/core/tests/modules/auth/service.test.ts` (new)
- `services/core/tests/modules/auth/routes.test.ts` (new)
- `services/core/tests/modules/users/service.test.ts` (new)
- `services/core/tests/modules/users/routes.test.ts` (new)
- `services/gateway/package.json` (updated — `@fastify/jwt` dep)
- `services/gateway/src/config.ts` (updated — `JWT_SECRET`)
- `services/gateway/tests/config.test.ts` (updated — new config field)
- `apps/web/package.json` (updated — `@react-oauth/google`, `radix-ui`, `react-router-dom` deps; not in original story task list, added as the mechanical minimum needed for Task 7's multi-page routing — noted here rather than silently)
- `README.md` (updated — migration quick-start step, `JWT_SECRET`/`GOOGLE_CLIENT_ID` docs)
- `infra/docker-compose.yml`, `services/core/src/config.ts` DATABASE_URL, `services/core/tests/config.test.ts` (port 5433 fix — landed in the prior commit, before this story's dev work began, not part of this story's own changes)

**Task 6 (gateway):**
- `services/gateway/package.json` (updated — `@fastify/jwt` dep)
- `services/gateway/src/authPlugin.ts` (new — `registerJwtPlugin`, `requireAuth`, `trustedHeaders`)
- `services/gateway/src/authProxy.ts` (new — `/auth/*` + `/me` route registration)
- `services/gateway/src/coreClient.ts` (updated — `forward()` generic proxy method)
- `services/gateway/src/app.ts` (updated — registers JWT plugin, error handler, auth proxy routes)
- `services/gateway/src/main.ts` (updated — wires `forwardToCore`, `jwtSecret`, `logger`)
- `services/gateway/tests/testHelpers.ts` (new)
- `services/gateway/tests/health.test.ts` (updated — uses `createTestAppDeps`)
- `services/gateway/tests/coreClient.test.ts` (updated — `forward()` tests)
- `services/gateway/tests/authPlugin.test.ts` (new)
- `services/gateway/tests/authProxy.test.ts` (new)
- `services/core/src/modules/auth/service.ts` (fixed — `import { PostgresError } from "postgres"` doesn't exist as a named ESM export under Node's native loader, though vitest's resolution silently tolerated it; caught only by actually restarting the dev server, not by the test suite. Switched to the default import (`postgres.PostgresError`).
- `services/core/src/modules/notification/mock.ts`, `services/core/tests/modules/notification/mock.test.ts` (Story 1.0 file — `sendEmail`'s mock adapter now logs the message body too, not just to/subject; without it there was no way to manually retrieve a verification link/token during local dev testing)
