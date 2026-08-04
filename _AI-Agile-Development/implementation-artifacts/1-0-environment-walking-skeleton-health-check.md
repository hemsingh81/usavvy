---
baseline_commit: 1252efda389b07f99399e99b919d45fcc95253be
---

# Story 1.0: Environment Walking Skeleton & Health Check

Status: in-progress

*(Sprint 0 — infrastructure, no FR mapping. This is the foundation every later story builds on. Greenfield: no existing code to preserve, everything here is NEW.)*

## Story

As a developer,
I want a working frontend + backend skeleton wired together locally, with a health-check,
so that I can verify the environment is correctly set up before building real features.

## Acceptance Criteria

1. **Given** `docker-compose` is run locally (Postgres, Redis, SeaweedFS) **When** `services/gateway`, `services/core`, and `apps/web` are started **Then** `GET /health` on `gateway` returns 200 with an aggregated status covering both `gateway` itself and a real HTTP call to `core`'s own `/health` (DB connection ok, storage adapter ok) **And** the frontend home page calls `gateway`'s `/health` and visibly displays "System OK" **And** this works with zero external API keys configured — mock adapters only (AD-1) **And** killing `core` while `gateway` keeps running causes `gateway`'s `/health` to report `core` as unreachable/degraded rather than hanging or throwing (AD-17), proving the network hop is real, not an in-process call
2. **Given** the walking skeleton is running **When** a developer inspects the repo **Then** the structure matches the (microservices-pivoted, 2026-08-04) architecture spine's Structural Seed: `apps/web`, `services/gateway`, `services/core` (each its own workspace package with its own `tests/`), `packages/shared-types`, `packages/config`, `packages/service-kernel` — every other service in AD-14's ownership table is intentionally **not** created yet (AD-1's scaffold-on-demand rule: a service's folder is created when its owning epic starts)
3. **Given** the walking skeleton's `core` service **When** `NotificationPort` is wired **Then** its `mock` adapter is bound and callable (logs to console/file, no real email sent) — this exists so Story 1.1 (Sign Up & Log In) can call it without discovering it's missing

## Tasks / Subtasks

- [x] **Task 1: Monorepo scaffold** (AC: #2)
  - [x] Init pnpm workspace at repo root (`pnpm-workspace.yaml` listing `apps/*`, `packages/*`, `services/*`)
  - [x] Create `packages/shared-types` (TS project; seeded with the `HealthStatus` zod schema/type, the first real cross-app contract, rather than left fully empty)
  - [x] Create `packages/config` (TS project; env-agnostic zod-validated loaders, AD-12)
  - [x] Root `tsconfig.json` with strict mode on (AD-9); each package/app/service extends it
  - [x] **Amendment (2026-08-04, microservices pivot):** split `packages/config`'s monolithic `loadServerConfig` into a composable `baseServiceEnvSchema`/`loadBaseServiceConfig(env)` (just `PORT`) that each service extends with its own fields — `core` adds `DATABASE_URL`/`STORAGE_ENDPOINT`/`NOTIFICATION_ADAPTER`, `gateway` adds `CORE_SERVICE_URL`/CORS origin. Move the now-service-specific tests out of `packages/config` to wherever they're actually owned. `pnpm-workspace.yaml` gains a `services/*` glob.
- [x] **Task 2: `services/gateway` + `services/core` skeleton, `packages/service-kernel`** (AC: #1, #2)
  - [x] `packages/service-kernel`: promote the logger / DB-ping / storage-ping utilities (originally scoped as `apps/api/src/modules/shared-kernel`, never committed under that path) into a real shared workspace package with an `index.ts` barrel — every service depends on this directly (AD-13's kernel exception)
  - [x] `services/gateway`: Fastify 5.x + TypeScript 6.x app, listens on port `3000` by default (configurable via its own config module built on `packages/config`'s base schema); `GET /health` calls its own trivial self-check **and** makes a real HTTP call to `core`'s `GET /health`, returning an aggregated `{ gateway: HealthStatus-like, core: HealthStatus | "unreachable" }` shape — never throws even if `core` is down (AD-17)
  - [x] `services/core`: Fastify 5.x + TypeScript 6.x app, listens on port `3001` by default; module-shell folders under `services/core/src/modules/`: `auth`, `users`, `notification` (AD-14: this service owns User, LearnerProfile, Notification); `GET /health` checks DB connectivity (Drizzle ping) and storage adapter reachability (SeaweedFS), returns `{ status: "ok" | "degraded", db: bool, storage: bool }` with 200 in both cases — never 500 for a degraded-but-responding check
  - [x] Enable CORS on `gateway` for `http://localhost:5173` (the dev web origin) — `core` has no public CORS surface, it's reachable only from `gateway` over the private docker/localhost network (AD-7's trust boundary)
  - [x] `services/gateway/tests/` and `services/core/tests/`, each mirroring its own `src/` path-for-path (AD-8)
- [x] **Task 3: `apps/web` skeleton** (AC: #1, #2)
  - [x] React 19 + Vite 8 SPA, dev server on port `5173` (Vite default)
  - [x] Empty module-shell folders under `apps/web/src/modules/`: `auth`, `board`, `courses`, `plans`, `cohorts`, `assignments`, `engagement`, `admin` (per Structural Seed — these mirror backend service boundaries in UI terms, not 1:1 identical names)
  - [x] `apps/web/src/shared/` (design system/layout placeholder) and `apps/web/src/app/` (routing, providers, entry)
  - [x] Backend base URL — always `gateway`, never any other service directly — is read through `packages/config` (a validated `VITE_API_URL`, default `http://localhost:3000`) — never hardcoded inline in the fetch call (AD-12)
  - [x] Home page component calls `GET /health` on `gateway` on mount and renders "System OK" (or a clear degraded/error state — no silent failure, AD-17) — this is a real page, not a stub
  - [x] `apps/web/tests/` tree mirroring `src/` 1:1 (AD-8)
- [ ] **Task 4: `NotificationPort` + mock adapter** (AC: #3)
  - [ ] Define `NotificationPort` interface in `services/core/src/modules/notification/` (email + in-app send methods — in-app channel is used later by Story 1.10's Notification Center, email by Story 1.1)
  - [ ] Implement `notification/mock` adapter: writes to console/file, never a real network call
  - [ ] Wire the mock adapter as the default binding via `core`'s own config (built on `packages/config`'s base schema, AD-12) — no module reads `process.env` directly to pick the adapter
- [ ] **Task 5: `infra/docker-compose.yml`** (AC: #1)
  - [ ] Services: `postgres` (image with pgvector extension available, version 18.x — one server, `core` gets its own database inside it per AD-14), `redis` (7.x, AD-5's `PubSubPort` adapter, active from day one under the microservices pivot), `seaweedfs` (S3-compatible) — these are the ONLY containerized services (AD-11)
  - [ ] `services/gateway`, `services/core`, and `apps/web` are run natively (`tsx watch`, `vite dev`), not containerized, for fast HMR — do not add them to docker-compose
  - [ ] Document the exact `pnpm` scripts to bring the whole stack up: `docker compose -f infra/docker-compose.yml up -d` first (stateful deps), then a root `pnpm dev` that runs `gateway`, `core`, and `web` dev servers **concurrently** (via `concurrently`) — never a `&&`-chained sequence, since all are long-running processes that never exit
- [ ] **Task 6: Lint/format/pre-commit tooling** (AD-9 — not itself an AC here, but every later story depends on this existing)
  - [ ] ESLint with `no-unused-vars`, `no-unreachable`, `import/no-cycle` as build-breaking errors
  - [ ] Husky pre-commit hook running lint + typecheck
  - [ ] (`eslint-plugin-boundaries` for AD-1/AD-13 port-only-import, intra-service module-boundary, **and** the microservices-specific no-`services/a`-importing-`services/b` rule can land in a later story once real module code exists to lint — note this as a follow-up, don't block Story 1.0 on it)

## Dev Notes

**This is the first story in the project. There is no existing code.** Everything you create is new — there is nothing to preserve, no regression risk, no previous story's patterns to match. Every later story assumes the scaffold you build here exists exactly as specified; get the module names and paths right.

### Architecture constraints that apply directly to this story

- **AD-1 (ports-and-adapters):** `NotificationPort` must be a real interface with a swappable adapter, not a function that directly does the mock behavior inline. The `mock` binding is selected via config (AD-12), not hardcoded — this is the pattern every later port (`GenerationPort`, `VoicePort`, etc.) will follow, so get the shape right now.
- **AD-8 (test mirroring):** `tests/` mirrors `src/` path-for-path in `apps/web`, `services/gateway`, and `services/core` — each its own tree, never a shared one. Don't create a separate `__tests__` convention or colocate test files next to source — this project's convention is a parallel tree.
- **AD-9 (no dead code, mechanically enforced):** TypeScript `strict: true` from the start. ESLint rules are build-breaking, not warnings. Set this up now — retrofitting strict mode onto a codebase with 9 epics of stories already written against loose mode would be far more painful later.
- **AD-1 / AD-13 (microservices pivot, 2026-08-04, per explicit user request for a fully decoupled, independently-scalable project structure):** the whole story shifted from one `apps/api` process to `services/gateway` + `services/core`, each its own deployable with its own `package.json`/port/database — see the "Amendment" note under Task 1 and the rewritten Task 2. Within each service, `modules/<name>/` folders still expose exactly one importable file, `index.ts` (module-private otherwise) — but the stronger new guarantee is structural, not just lint convention: `services/gateway` and `services/core` are separate workspace packages with no dependency on each other's package, so there is no TypeScript import path between them even if someone tried. `packages/service-kernel` (not `shared-kernel` inside one app anymore) is the sole cross-cutting exception every service depends on directly, with an `index.ts` barrel re-exporting `createLogger`/`pingDb`/`pingStorage` — services import from `service-kernel/index.js`, never reach into `service-kernel/logger.js` etc. directly (test files are the one exception, per AD-8 they import the exact file they're unit-testing). `gateway` reaches `core` **only** over HTTP (a typed fetch call using `HealthStatus` from `packages/shared-types`), which is what AC #1's "kill `core`, `gateway` degrades gracefully" clause actually proves.
- **AD-11 (local-only dev, updated for multi-service):** Postgres, Redis, and SeaweedFS are containerized; `gateway`, `core`, and `apps/web` all run natively (`tsx watch`/`vite dev`) — the fast-iteration-loop requirement (explicitly requested by the user) depends on it, not a Docker rebuild cycle per service.
- **AD-12 (config):** All structural runtime config (which adapter binds to which port) goes through `packages/config`'s base schema, extended per-service, validated once at boot. No module reads `process.env` directly — this is a rule every later story's code review will check.
- **AD-14 (entity ownership / database-per-service):** `core` owns User, LearnerProfile, Notification and gets its own Postgres database inside the shared dev Postgres server. The full service list in AD-1 is exhaustive and exact — these are the services every future epic's stories will scaffold. Don't invent extra top-level services or rename these; other stories reference them by these exact names.
- **AD-17 (no silent failures, added post-readiness-review):** The `/health` endpoint and the frontend's health check are the first place this rule applies. A DB-down, storage-down, **or now core-service-unreachable** condition must be a visible, distinguishable state (`degraded`), never an unhandled exception or a page that just hangs. Every `catch` block from here forward either surfaces a user-facing state or logs with context — there is no third option.

### Tech stack — versions verified same-day during the architecture spine's own reviewer gate (2026-08-04), reuse rather than re-verify

| Name | Version | Note |
| --- | --- | --- |
| Node.js | 24 LTS | Active LTS as of spine verification |
| TypeScript | 6.x | strict mode on from day one |
| Fastify | 5.x | backend framework, one instance per service |
| React | 19.x | frontend |
| Vite | 8.x | frontend build/dev server |
| pnpm | 11.x | workspaces |
| PostgreSQL | 18.x + pgvector 0.8.x | via docker-compose only; one server, one database per service |
| Redis | 7.x | via docker-compose; `PubSubPort` adapter, active from day one under the microservices pivot |
| Drizzle ORM | latest stable | schema-as-code, no codegen magic |
| SeaweedFS | latest | S3-compatible; MinIO OSS was discontinued, do not use MinIO |
| pg-boss | latest stable | not needed by this story, but the `service-kernel`'s `JobQueuePort` shell should exist as an empty folder per AD-14/AD-15 |
| Vitest / React Testing Library / Playwright | latest stable | test runners |

### Project Structure Notes

Target structure (from the architecture spine's Structural Seed, post-microservices-pivot — build exactly this, nothing more, nothing less for this story):

```text
usavvy/
  apps/
    web/
      src/
        modules/{auth,board,courses,plans,cohorts,assignments,engagement,admin}/
        shared/
        app/
      tests/                    # mirrors src/ 1:1
  services/
    gateway/
      src/
      tests/                    # mirrors src/ 1:1
    core/
      src/
        modules/{auth,users,notification}/
      tests/                    # mirrors src/ 1:1
  packages/
    shared-types/
    config/
    service-kernel/
  infra/
    docker-compose.yml
```

No alignment conflicts possible — this is the first story, so there is no existing structure to vary from. Every service in AD-1's full list **other than `gateway` and `core`** is intentionally not created — scaffold-on-demand, when that service's owning epic starts (per the epics workflow's own "create tables/entities only when needed" rule, applied here at service granularity). Within `core`, all module folders except `notification` (Task 4) can be genuinely empty (a `.gitkeep` or an `index.ts` placeholder).

### Testing requirements

- `services/core/tests/modules/notification/` — unit test for the mock adapter (send returns success, logs the payload, never throws)
- `services/gateway/tests/` — integration test for `GET /health`: healthy case (200, aggregated status showing both `gateway` and `core` reachable) and degraded cases — mock `core` DB failure (200, `core.status: "degraded"`) and mock `core` being entirely unreachable (200, `core` reported unreachable, never a hang or 500) — per AD-17, this endpoint must not itself throw
- `services/core/tests/` — integration test for `GET /health`: healthy case (200, `status: "ok"`, `db: true`, `storage: true`) and at least one degraded case (mock a DB failure, assert 200 with `status: "degraded"`, `db: false`)
- `apps/web/tests/` — component test for the home page's health-check display: success state and failure/degraded state both render distinguishable, non-blank UI
- All tests pass locally via `docker-compose up` + native dev servers before this story is considered done

### Git workflow for this story (user preference, applies to every story going forward, not just this one)

**Commit at each logical checkpoint once its tests pass** — do not wait until the entire story is done to make one giant commit. Suggested checkpoints for this story: (1) monorepo scaffold + tsconfig, (2) `services/gateway` + `services/core` skeleton + `packages/service-kernel` + health aggregation + their tests passing, (3) `apps/web` skeleton + health display + its tests passing, (4) `NotificationPort` + mock adapter + its tests passing, (5) docker-compose + final end-to-end verification. Each commit should be small, buildable, and have its own tests green — never commit code with failing tests just to checkpoint.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.0, Epic 1 intro]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-5, AD-7, AD-8, AD-9, AD-11, AD-12, AD-13, AD-14, AD-17, Stack table, Structural Seed (all updated 2026-08-04 for the microservices pivot)]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Foundation (Radix UI primitives assumption, flagged `[ASSUMPTION]` — not required for this story, but note it before `apps/web`'s component base solidifies in later stories)]

## Change Log

- 2026-08-04: Checkpoint 1 — monorepo scaffold (pnpm workspace, root tsconfig, `packages/shared-types`, `packages/config`), all tests green.
- 2026-08-04: **Architecture pivot** — user explicitly requested a fully decoupled, independently-scalable project structure ("microservice mode... so that we can scale it easily in future and handle it load etc."). Re-ran the architecture spine's paradigm decision (AD-1) from modular monolith to microservices; rescoped this story's remaining tasks (2-6) and both ACs #1/#2 accordingly before continuing implementation. No committed code was discarded — Task 1's `packages/shared-types`/`packages/config` are unchanged in kind (config gets a small composable-schema amendment); Task 2's not-yet-committed RED tests are being relocated from the planned `apps/api` into `services/gateway`/`services/core` rather than rewritten from scratch.
- 2026-08-04: Checkpoint 2 — `packages/service-kernel` (logger/db-ping/storage-ping), `services/core` (config, `/health`, module shells), `services/gateway` (config, `coreClient`, aggregated `/health` with real HTTP call to `core`), `packages/config` split into composable base schema, `packages/shared-types` gains `GatewayHealth`/`DownstreamHealth`. 36 tests green across 5 packages/services, `tsc --noEmit` clean.
- 2026-08-04: Checkpoint 3 — `apps/web` (React 19 + Vite 8, module shells, `HomePage` health-check display with a 4-state `loading`/`ok`/`degraded`/`error` union, `VITE_API_URL` default corrected to gateway's port). 39 tests green across 6 packages/services/apps, `tsc --noEmit` clean.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- **Checkpoint 1 (Task 1 — monorepo scaffold):** TypeScript pinned to `^6.0.3` (latest stable 6.x), not the newly-stable `7.x` (native-compiler rewrite) — honors the architecture spine's explicit "6.x" pin rather than opportunistically jumping a major the spine never evaluated. ESLint/typescript-eslint/@types/node/concurrently pinned to their actual current npm registry versions (verified live via `npm view`, not guessed) since the spine didn't pin these itself. `packages/shared-types` seeded with a real `HealthStatus` schema (not left empty) since it's the first genuine cross-app contract `/health` needs. `packages/config` built out fully now (not deferred) since Tasks 2-4 all depend on it existing.
- **Checkpoint 2 (Task 2 — `services/gateway` + `services/core` + `packages/service-kernel`):** implemented after the microservices pivot; `apps/api`'s never-committed RED tests were relocated (adjusted import paths and split by service) rather than rewritten from first principles, so no design work was thrown away. `packages/config`'s `loadServerConfig` was split into `baseServiceEnvSchema`/`loadBaseServiceConfig` (just `PORT`) — `services/core/src/config.ts` and `services/gateway/src/config.ts` each `.extend()` it with their own fields, proving the composable-schema design actually works for two different services rather than just being asserted in the architecture doc. Added `GatewayHealth`/`DownstreamHealth` to `packages/shared-types` so `gateway`'s aggregated `/health` response is a typed contract, not an ad hoc object shape. `gateway`'s `coreClient.ts` is the first real inter-service HTTP client (AD-13) — unit-tested in isolation (mocked `fetch`) to prove a network failure or non-ok response maps to `{ status: "unreachable" }` rather than throwing or hanging (AD-17); the full real-network proof (start both services, kill `core`, confirm `gateway` degrades) happens at Task 5 once `docker-compose`/`pnpm dev` exist to run them together. All 5 packages/services green: 36 tests total, `tsc --noEmit` clean across the board.
- **Checkpoint 3 (Task 3 — `apps/web`):** `packages/config`'s `loadWebConfig` default updated to `http://localhost:3000` (gateway's port; it was still `3001` from the pre-pivot `apps/api` design). `HomePage` uses a small `useHealthCheck` hook with an explicit 4-state union (`loading`/`ok`/`degraded`/`error`) so every outcome of the gateway call — success, a degraded `GatewayHealth` body, a non-ok HTTP response, or the `fetch` itself throwing — renders a distinguishable, non-blank state (AD-17); tests mock `global.fetch` for all three externally-visible states (ok/degraded/error) via React Testing Library. `react`/`vite`/`@testing-library/*`/`jsdom` versions verified live via `npm view` before pinning, same discipline as checkpoint 1.

### File List

- `pnpm-workspace.yaml` (new)
- `package.json` (new)
- `tsconfig.json` (new)
- `packages/shared-types/package.json` (new)
- `packages/shared-types/tsconfig.json` (new)
- `packages/shared-types/src/health.ts` (new)
- `packages/shared-types/src/index.ts` (new)
- `packages/shared-types/tests/health.test.ts` (new)
- `packages/config/package.json` (new)
- `packages/config/tsconfig.json` (new)
- `packages/config/src/base.ts` (new — checkpoint 2, replaces `server.ts`)
- `packages/config/src/server.ts` (deleted — checkpoint 2, split into `base.ts` + per-service config)
- `packages/config/src/web.ts` (new)
- `packages/config/src/index.ts` (new, updated checkpoint 2)
- `packages/config/tests/base.test.ts` (new — checkpoint 2, replaces `server.test.ts`)
- `packages/config/tests/server.test.ts` (deleted — checkpoint 2)
- `packages/config/tests/web.test.ts` (new)
- `packages/shared-types/src/health.ts` (updated checkpoint 2 — `GatewayHealth`/`DownstreamHealth`)
- `packages/shared-types/src/index.ts` (updated checkpoint 2)
- `packages/shared-types/tests/health.test.ts` (updated checkpoint 2)
- `packages/service-kernel/package.json` (new — checkpoint 2)
- `packages/service-kernel/tsconfig.json` (new — checkpoint 2)
- `packages/service-kernel/src/logger.ts` (new — checkpoint 2)
- `packages/service-kernel/src/db.ts` (new — checkpoint 2)
- `packages/service-kernel/src/storage.ts` (new — checkpoint 2)
- `packages/service-kernel/src/index.ts` (new — checkpoint 2)
- `packages/service-kernel/tests/logger.test.ts` (new — checkpoint 2)
- `packages/service-kernel/tests/db.test.ts` (new — checkpoint 2)
- `packages/service-kernel/tests/storage.test.ts` (new — checkpoint 2)
- `services/core/package.json` (new — checkpoint 2)
- `services/core/tsconfig.json` (new — checkpoint 2)
- `services/core/src/config.ts` (new — checkpoint 2)
- `services/core/src/app.ts` (new — checkpoint 2)
- `services/core/src/main.ts` (new — checkpoint 2)
- `services/core/src/modules/auth/index.ts` (new — checkpoint 2, shell)
- `services/core/src/modules/users/index.ts` (new — checkpoint 2, shell)
- `services/core/src/modules/notification/index.ts` (new — checkpoint 2, shell; filled in Task 4)
- `services/core/tests/config.test.ts` (new — checkpoint 2)
- `services/core/tests/health.test.ts` (new — checkpoint 2)
- `services/gateway/package.json` (new — checkpoint 2)
- `services/gateway/tsconfig.json` (new — checkpoint 2)
- `services/gateway/src/config.ts` (new — checkpoint 2)
- `services/gateway/src/coreClient.ts` (new — checkpoint 2)
- `services/gateway/src/app.ts` (new — checkpoint 2)
- `services/gateway/src/main.ts` (new — checkpoint 2)
- `services/gateway/tests/config.test.ts` (new — checkpoint 2)
- `services/gateway/tests/coreClient.test.ts` (new — checkpoint 2)
- `services/gateway/tests/health.test.ts` (new — checkpoint 2)
- `pnpm-workspace.yaml` (updated checkpoint 2 — `services/*` glob)
- `package.json` (updated checkpoint 2 — `dev` script runs gateway/core/web)
- `packages/config/src/web.ts` (updated checkpoint 3 — default `VITE_API_URL` now `http://localhost:3000`)
- `packages/config/tests/web.test.ts` (updated checkpoint 3)
- `apps/web/package.json` (new — checkpoint 3)
- `apps/web/tsconfig.json` (new — checkpoint 3)
- `apps/web/vite.config.ts` (new — checkpoint 3)
- `apps/web/index.html` (new — checkpoint 3)
- `apps/web/src/main.tsx` (new — checkpoint 3)
- `apps/web/src/app/App.tsx` (new — checkpoint 3)
- `apps/web/src/app/HomePage.tsx` (new — checkpoint 3)
- `apps/web/src/app/config.ts` (new — checkpoint 3)
- `apps/web/src/app/useHealthCheck.ts` (new — checkpoint 3)
- `apps/web/src/shared/index.ts` (new — checkpoint 3, shell)
- `apps/web/src/modules/{auth,board,courses,plans,cohorts,assignments,engagement,admin}/index.ts` (new — checkpoint 3, shells)
- `apps/web/tests/setup.ts` (new — checkpoint 3)
- `apps/web/tests/app/HomePage.test.tsx` (new — checkpoint 3)
