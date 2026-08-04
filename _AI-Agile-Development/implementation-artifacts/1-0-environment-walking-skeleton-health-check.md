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

1. **Given** `docker-compose` is run locally (Postgres+pgvector, SeaweedFS) **When** `apps/api` and `apps/web` are started **Then** `GET /health` on the backend returns 200 with service status (DB connection ok, storage adapter ok) **And** the frontend home page calls `/health` and visibly displays "System OK" **And** this works with zero external API keys configured — mock adapters only (AD-1)
2. **Given** the walking skeleton is running **When** a developer inspects the repo **Then** the structure matches the architecture spine's Structural Seed (`apps/web`, `apps/api`, `packages/shared-types`, `packages/config`) with empty module shells for every module in AD-14's ownership table
3. **Given** the walking skeleton's module shells **When** `NotificationPort` is wired **Then** its `mock` adapter is bound and callable (logs to console/file, no real email sent) — this exists so Story 1.1 (Sign Up & Log In) can call it without discovering it's missing

## Tasks / Subtasks

- [ ] **Task 1: Monorepo scaffold** (AC: #2)
  - [ ] Init pnpm workspace at repo root (`pnpm-workspace.yaml` listing `apps/*`, `packages/*`)
  - [ ] Create `packages/shared-types` (empty package, TS project, will hold DTOs/event contracts later)
  - [ ] Create `packages/config` (empty package, will hold the typed `zod`-validated config loader — AD-12)
  - [ ] Root `tsconfig.json` with strict mode on (AD-9); each package/app extends it
- [ ] **Task 2: `apps/api` skeleton** (AC: #1, #2)
  - [ ] Fastify 5.x + TypeScript 6.x app, listens on port `3001` by default (configurable via `packages/config`)
  - [ ] Create empty module-shell folders under `apps/api/src/modules/` — per the Structural Seed's module list (informed by AD-14 for the entity-owning modules): `auth`, `users`, `courses`, `ingestion`, `board-orchestration`, `generation`, `voice`, `notification`, `plans-progress`, `cohorts`, `assignments`, `engagement`, `admin`, `shared-kernel` (config, logging, db, event-bus, PubSubPort, JobQueuePort live here)
  - [ ] `GET /health` route: checks DB connectivity (Drizzle ping) and storage adapter reachability (SeaweedFS), returns `{ status: "ok" | "degraded", db: bool, storage: bool }` with 200 in both cases — never 500 for a degraded-but-responding check (this is the health endpoint itself; it must not throw)
  - [ ] Enable CORS for `http://localhost:5173` (the dev web origin) on the `/health` route at minimum, since `apps/web` calls this cross-origin with no proxy layer
  - [ ] `apps/api/tests/` tree mirroring `src/` path-for-path, empty placeholders acceptable for now except health-check tests (AD-8)
- [ ] **Task 3: `apps/web` skeleton** (AC: #1, #2)
  - [ ] React 19 + Vite 8 SPA, dev server on port `5173` (Vite default)
  - [ ] Empty module-shell folders under `apps/web/src/modules/`: `auth`, `board`, `courses`, `plans`, `cohorts`, `assignments`, `engagement`, `admin` (per Structural Seed — these mirror backend boundaries in UI terms, not 1:1 identical names)
  - [ ] `apps/web/src/shared/` (design system/layout placeholder) and `apps/web/src/app/` (routing, providers, entry)
  - [ ] Backend base URL is read through `packages/config` (a validated `VITE_API_URL`, default `http://localhost:3001`) — never hardcoded inline in the fetch call (AD-12)
  - [ ] Home page component calls `GET /health` on mount and renders "System OK" (or a clear degraded/error state — no silent failure, AD-17) — this is a real page, not a stub
  - [ ] `apps/web/tests/` tree mirroring `src/` 1:1 (AD-8)
- [ ] **Task 4: `NotificationPort` + mock adapter** (AC: #3)
  - [ ] Define `NotificationPort` interface in `apps/api/src/modules/notification/` (email + in-app send methods — in-app channel is used later by Story 1.10's Notification Center, email by Story 1.1)
  - [ ] Implement `notification/mock` adapter: writes to console/file, never a real network call
  - [ ] Wire the mock adapter as the default binding via `packages/config` (AD-12) — no module reads `process.env` directly to pick the adapter
- [ ] **Task 5: `infra/docker-compose.yml`** (AC: #1)
  - [ ] Services: `postgres` (image with pgvector extension available, version 18.x), `seaweedfs` (S3-compatible) — these are the ONLY containerized services (AD-11)
  - [ ] `apps/api` and `apps/web` are run natively (`tsx watch`, `vite dev`), not containerized, for fast HMR — do not add them to docker-compose
  - [ ] Document the exact `pnpm` scripts to bring the whole stack up: `docker compose -f infra/docker-compose.yml up -d` first (stateful deps), then a root `pnpm dev` that runs `apps/api` and `apps/web` dev servers **concurrently** (e.g. via `concurrently`/`turbo`/`pnpm -r --parallel dev`) — never a `&&`-chained sequence, since both are long-running processes that never exit
- [ ] **Task 6: Lint/format/pre-commit tooling** (AD-9 — not itself an AC here, but every later story depends on this existing)
  - [ ] ESLint with `no-unused-vars`, `no-unreachable`, `import/no-cycle` as build-breaking errors
  - [ ] Husky pre-commit hook running lint + typecheck
  - [ ] (`eslint-plugin-boundaries` for AD-1/AD-13 port-only-import and module-boundary enforcement can land in a later story once real module code exists to lint — note this as a follow-up, don't block Story 1.0 on it)

## Dev Notes

**This is the first story in the project. There is no existing code.** Everything you create is new — there is nothing to preserve, no regression risk, no previous story's patterns to match. Every later story assumes the scaffold you build here exists exactly as specified; get the module names and paths right.

### Architecture constraints that apply directly to this story

- **AD-1 (ports-and-adapters):** `NotificationPort` must be a real interface with a swappable adapter, not a function that directly does the mock behavior inline. The `mock` binding is selected via config (AD-12), not hardcoded — this is the pattern every later port (`GenerationPort`, `VoicePort`, etc.) will follow, so get the shape right now.
- **AD-8 (test mirroring):** `tests/` mirrors `src/` path-for-path in both `apps/api` and `apps/web`. Don't create a separate `__tests__` convention or colocate test files next to source — this project's convention is a parallel tree.
- **AD-9 (no dead code, mechanically enforced):** TypeScript `strict: true` from the start. ESLint rules are build-breaking, not warnings. Set this up now — retrofitting strict mode onto a codebase with 9 epics of stories already written against loose mode would be far more painful later.
- **AD-11 (local-only dev):** Only Postgres and SeaweedFS are containerized. Do not containerize `apps/api`/`apps/web` — the fast-iteration-loop requirement (explicitly requested by the user) depends on native `tsx watch`/`vite dev`, not a Docker rebuild cycle.
- **AD-12 (config):** All structural runtime config (which adapter binds to which port) goes through `packages/config` with a `zod` schema, validated once at boot. No module reads `process.env` directly — this is a rule every later story's code review will check.
- **AD-14 (module ownership):** The module list in Task 2 is exhaustive and exact — these are the modules every future epic's stories will add code to. Don't invent extra top-level modules or rename these; other stories reference them by these exact names.
- **AD-17 (no silent failures, added post-readiness-review):** The `/health` endpoint and the frontend's health check are the first place this rule applies. A DB-down or storage-down condition must be a visible, distinguishable state (`degraded`), never an unhandled exception or a page that just hangs. Every `catch` block from here forward either surfaces a user-facing state or logs with context — there is no third option.

### Tech stack — versions verified same-day during the architecture spine's own reviewer gate (2026-08-04), reuse rather than re-verify

| Name | Version | Note |
| --- | --- | --- |
| Node.js | 24 LTS | Active LTS as of spine verification |
| TypeScript | 6.x | strict mode on from day one |
| Fastify | 5.x | backend framework |
| React | 19.x | frontend |
| Vite | 8.x | frontend build/dev server |
| pnpm | 11.x | workspaces |
| PostgreSQL | 18.x + pgvector 0.8.x | via docker-compose only |
| Drizzle ORM | latest stable | schema-as-code, no codegen magic |
| SeaweedFS | latest | S3-compatible; MinIO OSS was discontinued, do not use MinIO |
| pg-boss | latest stable | not needed by this story, but the `shared-kernel`'s `JobQueuePort` shell should exist as an empty folder per AD-14/AD-15 |
| Vitest / React Testing Library / Playwright | latest stable | test runners |

### Project Structure Notes

Target structure (from the architecture spine's Structural Seed — build exactly this, nothing more, nothing less for this story):

```text
usavvy/
  apps/
    web/
      src/
        modules/{auth,board,courses,plans,cohorts,assignments,engagement,admin}/
        shared/
        app/
      tests/                    # mirrors src/ 1:1
    api/
      src/
        modules/{auth,users,courses,ingestion,board-orchestration,generation,voice,notification,plans-progress,cohorts,assignments,engagement,admin,shared-kernel}/
      tests/                    # mirrors src/ 1:1
  packages/
    shared-types/
    config/
  infra/
    docker-compose.yml
```

No alignment conflicts possible — this is the first story, so there is no existing structure to vary from. All module folders except `notification` (Task 4) and `shared-kernel` (needs a boot-time config loader for Task 4/5 to work) can be genuinely empty (a `.gitkeep` or an `index.ts` placeholder) — do not pre-build functionality for modules whose stories haven't started yet (per the epics workflow's own "create tables/entities only when needed" rule, applied here to module code).

### Testing requirements

- `apps/api/tests/modules/notification/` — unit test for the mock adapter (send returns success, logs the payload, never throws)
- `apps/api/tests/` — integration test for `GET /health`: healthy case (200, `status: "ok"`, `db: true`, `storage: true`) and at least one degraded case (mock a DB failure, assert 200 with `status: "degraded"`, `db: false` — per AD-17, this endpoint must not itself throw)
- `apps/web/tests/` — component test for the home page's health-check display: success state and failure/degraded state both render distinguishable, non-blank UI
- All tests pass locally via `docker-compose up` + native dev servers before this story is considered done

### Git workflow for this story (user preference, applies to every story going forward, not just this one)

**Commit at each logical checkpoint once its tests pass** — do not wait until the entire story is done to make one giant commit. Suggested checkpoints for this story: (1) monorepo scaffold + tsconfig, (2) `apps/api` skeleton + health endpoint + its tests passing, (3) `apps/web` skeleton + health display + its tests passing, (4) `NotificationPort` + mock adapter + its tests passing, (5) docker-compose + final end-to-end verification. Each commit should be small, buildable, and have its own tests green — never commit code with failing tests just to checkpoint.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.0, Epic 1 intro]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-8, AD-9, AD-11, AD-12, AD-14, AD-17, Stack table, Structural Seed]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Foundation (Radix UI primitives assumption, flagged `[ASSUMPTION]` — not required for this story, but note it before `apps/web`'s component base solidifies in later stories)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
