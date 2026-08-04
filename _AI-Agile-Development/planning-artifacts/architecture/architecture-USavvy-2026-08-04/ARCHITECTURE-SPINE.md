---
name: 'Usavvy'
type: architecture-spine
purpose: build-substrate
altitude: initiative
paradigm: 'modular layering + hexagonal ports-and-adapters at every external boundary'
scope: 'Whole-system invariants for Usavvy (initiative altitude) — the AI-avatar interactive learning platform: self-paced / planned / cohort learning, the Interactive Board (Epic 3), generation + voice pipeline, ingestion, assignments/evaluation, engagement, back office.'
status: final
created: '2026-08-04'
updated: '2026-08-04'
binds: []
sources: ['Doc/00-Requirement.md']
companions: []
---

# Architecture Spine — Usavvy

## Design Paradigm

Modular feature-module layering internally; hexagonal ports-and-adapters at every external integration boundary (LLM generation, TTS/ASR, retrieval, object storage, notifications, realtime pub/sub, async jobs). Feature modules live under `apps/api/src/modules/*`; each depends on a shared kernel (config, logging, db, event bus) and on **ports**, never on a concrete adapter or on another module's internals.

## Invariants & Rules

### AD-1 — Modular layering + hexagonal ports-and-adapters

- **Binds:** all backend modules; generation, voice, retrieval, storage, and notification integrations
- **Prevents:** a module hard-depending on a specific vendor SDK, making swap (NFR-10, R-10) or config-driven behavior impossible
- **Rule:** any module consuming generation, voice, retrieval, storage, or notification capability depends only on its Port interface (`GenerationPort`, `VoicePort`, `VectorStorePort`, `StoragePort`, `NotificationPort`). Concrete adapters (`generation/mock`, `generation/anthropic`, `voice/mock`, `storage/minio-compatible`, `notification/mock`, `vectorstore/pgvector`) implement a port and are wired in by config (AD-12) — never imported directly by a feature module. A `mock` adapter is the default binding for generation, voice, and notification until a real provider is configured. `VectorStorePort` calls carry a required metadata contract (`documentId`, `courseId`, `conceptId`, `chunkId`) defined in `packages/shared-types` — `ingestion` (writer) and `generation` (reader) share this contract rather than each inventing their own chunk-tagging scheme.

### AD-2 — Generation caching, tiered routing, and rate-limiting are GenerationPort responsibilities

- **Binds:** `GenerationPort` and every module that calls it (board-orchestration, ingestion, assignments)
- **Prevents:** a module bypassing the cache/routing/rate-limit layer and calling a model adapter directly — the PRD names cache-first Beats + tiered routing as the primary lever for both NFR-B-1/B-2 latency budgets and the cost-per-learner-hour target (§10.6 R3, NFR-22/23, R-2 "critical/high"), and NFR-18's abuse protection is the same class of cross-cutting concern
- **Rule:** `GenerationPort` itself owns cache-first resolution (pre-generated Beats for catalog content at standard depth), tiered model routing (small model for simple branches, large model for authoring/deep branches), **and** rate-limiting/abuse-protection enforcement. No module calls a generation adapter directly or implements its own throttling — caching, routing, and limits are enforced once, at the port. Only the specific thresholds/algorithm are left to epic-altitude tuning, against the NFR-24/Principle-6 constraint that ceilings must be "expressed generously and only enforced against abuse patterns" — never encountered by a genuine learner.

### AD-3 — PII redaction and content-safety enforcement at a single choke point

- **Binds:** `GenerationPort`, `VoicePort`, and any human-authored real-time content (cohort chat, future peer messaging)
- **Prevents:** board narration, assignment feedback, ask-anything, and cohort chat each implementing their own ad hoc PII/safety handling — exactly the divergence a shared choke point exists to prevent, and a gap where human-to-human chat (arguably the likeliest place for a genuine crisis disclosure) has no safety owner at all
- **Rule:** `GenerationPort`/`VoicePort` implementations apply PII minimization (NFR-17) and content-safety filtering, including mandatory self-harm/crisis escalation to a static support-resources page (NFR-19, "never an improvised AI response"), before any request leaves the process and before any response reaches a calling module. Human-authored real-time messages (cohort chat) route through the same safety-filtering logic via a shared `SafetyFilter` call even though no generation call occurs — safety enforcement is a property of the content, not of which port it happened to pass through. No feature module implements its own redaction or safety logic.

### AD-4 — User-facing text: static copy vs. generated content are two distinct rules

- **Binds:** `apps/web`, `apps/api` (UI copy, notifications, error messages) and `GenerationPort`/`VoicePort` (Beat narration, generated feedback)
- **Prevents:** English text baked directly into components/templates, which would block adding Hindi + 2 more languages later without a rewrite (§3.3, NFR-12) — and conflating that static-string problem with the separate problem of "what language does the AI generate content in"
- **Rule:** (a) *Static copy* — all user-facing UI/notification/error text resolves through a locale layer via lookup key; only a single English bundle ships at launch; no module concatenates or hardcodes a user-facing string inline. (b) *Generated content* — every `GenerationPort`/`VoicePort` call carries a required `locale`/`language` parameter, enforced at the port per AD-2/AD-3's pattern; a `generation` or `voice` engineer cannot ship a call site that omits it. Locale library and translation tooling are Deferred.

### AD-5 — Realtime transport, pub/sub abstraction, and message contracts

- **Binds:** Board streaming (FR-B-*), cohort live sessions (FR-G-9..17), narration audio delivery
- **Prevents:** building a second, heavier realtime transport (WebRTC/media servers) nothing requires; a hard dependency on single-instance fan-out that would require a rewrite to meet NFR-3's "must scale horizontally to 10×"; and independently-built WS payloads drifting from each other or leaking internal fields
- **Rule:** all realtime fan-out (Beat streaming, cohort board sync, chat, polls, live narration audio) goes over WebSocket, server-authoritative — no WebRTC in v1. Fan-out itself goes through a `PubSubPort`; the dev/default adapter is single-instance in-memory, and a Redis adapter is the sanctioned, config-only swap to reach NFR-3's horizontal-scale requirement — the port exists specifically so that swap needs no redesign. Every WS message type is a named, versioned contract defined in `packages/shared-types`, structurally distinct from internal domain-event/entity shapes — never a raw serialization of an internal `Beat`/`LearningSession` entity (this is how internal fields like model-routing tier or per-call cost stay out of client payloads). Narration audio streams progressively over the same Beat WebSocket channel with word-level timing (matching the PRD's own §19 direction and the NFR-B-4 ≤200ms drift budget) — it is never a `StoragePort`-hosted file the client fetches after the fact; `StoragePort` (AD-6) is for durable artifacts only (recordings, exports), never live narration.

### AD-6 — Object storage behind a StoragePort

- **Binds:** UploadedDocument, assignment submissions, board exports, session recordings — durable artifacts only, never live narration audio (AD-5)
- **Prevents:** filesystem-path assumptions or a vendor SDK leaking into domain code
- **Rule:** all file reads/writes go through `StoragePort`. Dev binds to an S3-compatible self-hosted adapter (Stack table); a hosted S3/GCS adapter is a config swap, no domain code change.

### AD-7 — RBAC module: config-seeded roles, DB-assigned, role-level only in v1

- **Binds:** all authenticated routes and UI gating
- **Prevents:** role/permission checks scattered as ad-hoc string comparisons across modules, roles hardcoded where they can't be extended without a code change, and an `admin` back-office feature (per-user permission overrides) being built against a data path `auth` never agreed to serve
- **Rule:** roles are `SuperAdmin`, `Admin`, `Mentor`, `Student` (the PRD's Content-Ops and Admin/Moderation personas both map to `Admin`; split later only if their permission sets diverge materially). The role list and default permission matrix live in `packages/config` as versioned seed data; a user's assigned role(s) live in the DB. Every authorization check goes through one guard, `can(user, action, resource)`, evaluated purely from `role → permission matrix` — **no per-user/per-resource permission overrides exist in v1**; an admin UI must not be built assuming one until a follow-on AD adds it. Auth is JWT (access + refresh), custom-built, verified once in a single Fastify `preHandler` hook.

### AD-8 — Test structure mirrors source structure 1:1

- **Binds:** `apps/web`, `apps/api`
- **Prevents:** tests drifting from the module boundaries they're meant to verify, making coverage gaps invisible
- **Rule:** each app has a `tests/` tree that mirrors `src/` path-for-path (`tests/modules/x/y.test.ts` ↔ `src/modules/x/y.ts`). Vitest for unit/component, React Testing Library for FE components, Playwright for e2e.

### AD-9 — No dead code and no boundary violations, enforced mechanically

- **Binds:** `apps/web`, `apps/api`, `packages/*`
- **Prevents:** unused exports, unreachable branches, circular imports, stray adapter imports (AD-1), cross-module internal imports (AD-13), and hardcoded user-facing strings (AD-4) accumulating silently instead of failing the build
- **Rule:** TypeScript `strict: true` everywhere; ESLint with `no-unused-vars`, `no-unreachable`, `import/no-cycle` as build-breaking errors; `eslint-plugin-boundaries` (or `import/no-restricted-paths`) configured to enforce AD-1's port-only imports and AD-13's module-boundary rule; an i18n lint rule flags string literals in JSX/user-facing paths that bypass AD-4's locale layer. A Husky pre-commit hook runs all of it. Backstopped by `bmad-code-review` at story time.

### AD-10 — Entity naming disambiguates the PRD's "Session" collision

- **Binds:** data model, all modules referencing scheduling or live playback
- **Prevents:** one module building against "the calendar slot" and another against "the live Beat-playback run" under the same name
- **Rule:** the PRD's live teaching run (Beats, replay, pause) is `LearningSession`; the PRD's `ScheduledSession` (a plan's future calendar slot, not yet started) is `PlannedSession`; `CohortSession` is unchanged. No code or schema uses the bare term `Session`.

### AD-11 — Local-only dev environment, no deployment target yet

- **Binds:** local dev setup
- **Prevents:** dev-environment sprawl (containerizing everything) that slows the fast-iteration loop the phased/visible-together goal depends on
- **Rule:** one `docker-compose.yml` runs only stateful deps — Postgres+pgvector, the S3-compatible storage adapter. `apps/api` and `apps/web` run natively (`tsx watch`, `vite dev`) for fast HMR, not containerized in dev.

### AD-12 — Config-driven runtime behavior: boot-time structure vs. live-toggleable flags

- **Binds:** all modules, all adapters, `admin` back-office
- **Prevents:** `process.env` reads scattered through business logic; untyped/unvalidated config; and an `admin` "toggle this feature" UI silently doing nothing because it was built against a config model that only reloads on restart
- **Rule:** structural configuration (active adapter per port, RBAC seed data) is defined in `packages/config` with a `zod` schema, loaded and validated once at process boot — no module reads `process.env` directly. Operator-facing feature flags are a distinct, explicitly DB-backed sub-system: read on each request (or push-invalidated), still `zod`-validated, and exempt from the "loaded once at boot" clause — an `admin` toggle takes effect live, by design.

### AD-13 — Module boundary, dependency direction, and state-fact propagation

- **Binds:** `apps/api/src/modules/*`, `apps/web`, `packages/shared-types`
- **Prevents:** one feature module reaching into another's internals or writing a foreign key into a table it doesn't own; the frontend importing backend implementation details; and a state change (mastery, submission-graded, session-completed) that other modules depend on being delivered only via a direct synchronous call that a listening module never subscribed to
- **Rule:** see diagram. Cross-module communication happens only via a module's public service API (synchronous reads/commands) — never a direct import of another module's internal path, and never a schema write (FK, migration) into a table owned by another module (see AD-14's ownership map). Any state transition other modules are known to consume **must** additionally be published as a domain event on the shared bus, regardless of whether a synchronous call also occurred — event emission is not optional just because a caller also invoked a service method directly. `apps/web` imports only `packages/shared-types`, never anything under `apps/api/src`.

```mermaid
graph TD
  Web["apps/web"] -->|imports types only| Shared["packages/shared-types"]
  Web -->|HTTP / WebSocket| HTTP["apps/api :: HTTP+WS layer"]
  HTTP --> Modules["Feature modules: auth, courses, board-orchestration,
plans-progress, cohorts, assignments, engagement, admin, ingestion"]
  Modules --> Kernel["shared-kernel: config, logging, db, event-bus"]
  Modules --> Ports["Ports: GenerationPort, VoicePort, VectorStorePort,
StoragePort, NotificationPort, PubSubPort, JobQueuePort"]
  Ports --> Adapters["Adapters: mock / anthropic / s3-compatible / pgvector / pg-boss"]
  Modules -->|contracts + state-fact events only| Shared
```

### AD-14 — Entity ownership and cross-module data access

- **Binds:** every module that reads or writes a shared ERD entity
- **Prevents:** two modules each believing they own the same entity (duplicate tables, duplicate writers), or a module reaching around AD-13 by writing a foreign key into a table another module owns
- **Rule:** every ERD entity has exactly one owning module (table below). Any other module accesses it only through the owner's public service API or subscribed domain events — never a direct schema reference or FK into a table it doesn't own. `COHORT_SESSION` references the canonical "current beat" pointer owned by `board-orchestration` (via `LEARNING_SESSION`/`BEAT`), it does not maintain its own parallel playback state.

| Entity | Owning module |
| --- | --- |
| User, LearnerProfile, Notification | auth / users |
| Enrollment, Course, Module, Topic, Concept | courses |
| LearningPlan, PlannedSession, ConceptProgress | plans-progress |
| LearningSession, Beat, SessionEvent | board-orchestration |
| UploadedDocument, ContentChunk | ingestion |
| AssignmentSubmission, Evaluation | assignments |
| Note, StarTransaction, Badge, Streak | engagement |
| Cohort, CohortMembership, CohortSession, CohortMessage, WaitingListEntry | cohorts |

### AD-15 — Async job queue is a first-class port

- **Binds:** ingestion pipeline (PRD §19: "parse → OCR → structure → chunk → embed → outline"), long-form assignment grading (FR-E-13, up to 10 min), catalog Beat pre-generation (R3)
- **Prevents:** ingestion and a future assignments-evaluation pipeline independently inventing incompatible async patterns (DB-polling vs. ad hoc timers vs. a real queue), each with its own retry/failure semantics
- **Rule:** durable background work goes through a `JobQueuePort`. Dev/default adapter is `pg-boss` (Postgres-native, no extra infra beyond the database already running, free/OSS) — a dedicated queue (e.g. Redis-backed) is a config-only swap if scale later demands it.

### AD-16 — MVP analytics query the operational store directly

- **Binds:** Epic 8 (FR-O-6 funnel/retention/telemetry, FR-O-7 concept-difficulty heatmap, FR-O-8 AI-quality dashboard, FR-O-9 thumbs feedback)
- **Prevents:** a launch-blocking data-infrastructure question (where does Epic 8 read from) sitting silently undecided
- **Rule:** at MVP scale, Epic 8's analytics read `SessionEvent`, `ConceptProgress`, and related operational tables directly (read replica once load requires it) — no separate analytics warehouse in v1. A dedicated warehouse is Deferred, revisit when query load or retention requirements outgrow the operational store.

### AD-17 — No silent failures

- **Binds:** all modules, all adapters
- **Prevents:** an exception or error path that reaches neither the user nor a log — the specific failure mode NFR-25 exists to close off
- **Rule:** every `catch` block does one of two things: re-throws/maps to a user-facing error state (per the `error` envelope in Consistency Conventions and EXPERIENCE.md's "retry, never a dead end" state pattern), or logs via the shared-kernel logger with enough context (module, entity id, correlation id) to trace the failure — doing neither is a defect, not an acceptable shortcut. Enforced mechanically alongside AD-9: an ESLint rule forbidding empty catch blocks and catch blocks that neither log nor re-throw/return an error result, build-breaking like the rest of AD-9's toolchain.

### AD-18 — Notification Center and Activity History are read-projections, not new sources of truth

- **Binds:** `auth/users`' `Notification` entity (FR-A-10); the learner-facing Activity History view (FR-A-11)
- **Prevents:** Activity History becoming a second, divergent copy of data other modules already own (the exact class of problem AD-14 exists to prevent), and the Notification Center becoming a second delivery mechanism competing with `NotificationPort`
- **Rule:** the Notification Center persists in-app notification records (`Notification`, owned by `auth/users`) alongside `NotificationPort`'s existing email channel — one port, two channels, one record per in-app notification, referencing the domain event/process that triggered it so "is this tied to an in-progress process" (FR-A-10's clear-blocking rule) is a lookup, not a guess. Activity History reads `SessionEvent` (board-orchestration), `AssignmentSubmission` (assignments), and attendance data (cohorts) directly, the same read-only cross-module pattern AD-16 already established for analytics — it does not duplicate that data into a new table. `LearningSession`'s existing pause/resume lifecycle (Story 3.1) is the source for "session ended," extended with one additional domain event (`learning_session.ended`) so Activity History (and NFR-26's "checkable later" requirement generally) has a defined completion signal to key off, rather than inferring one from raw `SessionEvent` rows.

## Consistency Conventions

| Concern | Convention |
| --- | --- |
| Naming (entities, files, interfaces, events) | TS types PascalCase; DB tables/columns snake_case; REST routes kebab-case; domain events past-tense (`concept.mastered`, `beat.played`) |
| Data & formats (ids, dates, error shapes, envelopes) | IDs are UUIDv7 (time-ordered); all timestamps ISO 8601 UTC; errors as `{ error: { code, message, details? } }` from one central error-mapper, never per-route ad hoc shapes; monetary/cost values as integer smallest-unit (for NFR-22 cost dashboard) |
| State & cross-cutting (mutation, errors, logging, config, auth) | DB writes only through the owning module's service layer (AD-14), never from route handlers directly; structured JSON logging via shared-kernel logger; no silent failures (AD-17); config per AD-12; auth/authorization per AD-7 |
| Concurrency control | every mutable entity carries an `updated_at`/`version` column; a write whose expected version doesn't match current state is rejected with a `409` via the central error-mapper, never a silent last-write-wins overwrite |

## Stack

| Name | Version |
| --- | --- |
| Node.js | 24 LTS |
| TypeScript | 6.x (strict) |
| Fastify | 5.x |
| React | 19.x |
| Vite | 8.x |
| pnpm | 11.x (workspaces) |
| PostgreSQL | 18.x + pgvector extension (0.8.x) |
| Drizzle ORM | latest stable |
| Vitest / React Testing Library / Playwright | latest stable |
| S3-compatible object storage (dev) | SeaweedFS (actively maintained; MinIO's OSS edition was discontinued in the lead-up to this spine and is not a safe pin — swap is config-only via `StoragePort`, AD-6) |
| pg-boss | latest stable (Postgres-native job queue, AD-15) |

## Structural Seed

```text
usavvy/
  apps/
    web/                       # React + Vite SPA
      src/
        modules/                # mirrors backend module boundaries in UI terms
          auth/
          board/
          courses/
          plans/
          cohorts/
          assignments/
          engagement/
          admin/
        shared/                 # design system, layout, cross-module UI
        app/                    # routing, providers, entry
      tests/                    # mirrors src/ 1:1 (AD-8)
    api/                       # Fastify + TypeScript backend
      src/
        modules/
          auth/                  # RBAC, JWT (AD-7)
          users/
          courses/
          ingestion/              # + JobQueuePort consumer (AD-15)
          board-orchestration/   # the Lesson Orchestration "crown jewel" (PRD S19); owns LearningSession/Beat (AD-14)
          generation/             # GenerationPort + adapters (AD-1, AD-2)
          voice/                  # VoicePort + adapters (AD-1)
          notification/           # NotificationPort + adapters (AD-1)
          plans-progress/
          cohorts/
          assignments/
          engagement/
          admin/
          shared-kernel/          # config, logging, db, event-bus, PubSubPort, JobQueuePort
      tests/                    # mirrors src/ 1:1 (AD-8)
  packages/
    shared-types/               # DTOs, Beat schema, WS message contracts, role/permission enums, event contracts
    config/                     # typed runtime config + RBAC seed data (AD-12)
  infra/
    docker-compose.yml           # Postgres+pgvector, SeaweedFS (AD-11) — local dev only
```

```mermaid
erDiagram
  USER ||--|| LEARNER_PROFILE : has
  USER ||--o{ ENROLLMENT : enrolls
  USER ||--o{ NOTIFICATION : receives
  ENROLLMENT }o--|| COURSE : in
  COURSE ||--o{ MODULE : contains
  MODULE ||--o{ TOPIC : contains
  TOPIC ||--o{ CONCEPT : contains
  ENROLLMENT ||--|| LEARNING_PLAN : has
  LEARNING_PLAN ||--o{ PLANNED_SESSION : schedules
  ENROLLMENT ||--o{ CONCEPT_PROGRESS : tracks
  CONCEPT_PROGRESS }o--|| CONCEPT : for
  USER ||--o{ LEARNING_SESSION : runs
  LEARNING_SESSION ||--o{ BEAT : contains
  LEARNING_SESSION ||--o{ SESSION_EVENT : logs
  USER ||--o{ UPLOADED_DOCUMENT : uploads
  UPLOADED_DOCUMENT ||--o{ CONTENT_CHUNK : chunked_into
  CONTENT_CHUNK }o--o{ CONCEPT : tagged_with
  USER ||--o{ ASSIGNMENT_SUBMISSION : submits
  ASSIGNMENT_SUBMISSION ||--|| EVALUATION : graded
  USER ||--o{ NOTE : writes
  USER ||--o{ STAR_TRANSACTION : earns
  USER }o--o{ COHORT_MEMBERSHIP : joins
  COHORT_MEMBERSHIP }o--|| COHORT : in
  COHORT ||--o{ COHORT_SESSION : schedules
  COHORT_SESSION ||--o| LEARNING_SESSION : drives
  COHORT_SESSION ||--o{ COHORT_MESSAGE : logs
  COHORT ||--o{ WAITING_LIST_ENTRY : queues
```

**Deployment & environments:** local only at this stage (AD-11) — no cloud provider chosen, no staging/production topology defined. This is deliberate, not an oversight: real deployment is deferred until a workable slice exists, and the provider choice is entangled with OQ-2 (market/region, drives data residency under NFR-15) and the unit-cost model (NFR-22/23). See Deferred.

## Deferred

- **Cloud provider, staging/production topology, CI/CD pipeline, secrets management** — no deployment target exists yet; revisit once a workable vertical slice is ready to leave localhost, and once OQ-2 (market/region) is resolved (drives data residency, NFR-15).
- **Redis `PubSubPort` adapter activation** — the port exists from day one (AD-5) so the swap is config-only; activating it is deferred until NFR-3's concurrency targets are being tested against real load, not before.
- **Dedicated vector DB (e.g. Qdrant)** — pgvector is sufficient at current scale; swap is a `VectorStorePort` adapter change if retrieval performance demands it later.
- **Real LLM/TTS/ASR provider selection** — not yet chosen among Anthropic/OpenAI/other; ships behind `GenerationPort`/`VoicePort` with a `mock` adapter as the default until a provider is chosen and funded.
- **WebRTC** — explicitly rejected for v1 (AD-5); revisit only if a future requirement introduces live peer-to-peer audio/video.
- **Mentor role's permission scope** — RBAC structurally supports it (AD-7); what a Mentor can actually do is a product decision the PRD doesn't answer (it excludes live human tutors as a v1 non-goal). Flag to whichever epic first exercises this role.
- **Per-user permission overrides** — explicitly out of scope for v1 (AD-7); add a follow-on AD if the admin back office needs finer-grained control later.
- **Observability/APM tooling** — NFR-22's cost-per-learner-hour dashboard needs data collection; specific tool (e.g. OpenTelemetry backend) not chosen.
- **Analytics warehouse** — MVP reads the operational store directly (AD-16); revisit when query load or retention needs outgrow it.
- **Locale library / translation tooling** — AD-4 keeps the codebase translation-ready structurally; which i18n library and locale-data format is not yet chosen.
- **Payment/billing integration** — blocked on OQ-1 (monetisation model, explicitly unresolved upstream); no port or vendor chosen yet.
- **Epic 3 (Board) and Epic 5 (Cohorts) epic-altitude spines** — this initiative spine sets the invariants; both epics carry enough internal complexity (per the PRD's own risk register) to warrant their own inherited epic-altitude spine before story-writing.
