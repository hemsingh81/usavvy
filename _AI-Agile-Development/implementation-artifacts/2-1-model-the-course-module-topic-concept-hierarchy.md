---
baseline_commit: 7f67318
---

# Story 2.1: Model the Course→Module→Topic→Concept hierarchy

Status: done

*(Epic 2, FR-C-1. First story of Epic 2 — the first story in this codebase to scaffold a brand-new microservice (`services/courses`), per the architecture's own "scaffold-on-demand" convention (AD-1): "every other service's folder is created when its owning epic starts." This story is the entity/CRUD owner for `Course`/`Module`/`Topic`/`Concept` per AD-14's ownership table (`| Enrollment, Course, Module, Topic, Concept | courses |`) — `Enrollment` is explicitly NOT built here, since no AC in this story mentions it; it belongs to whichever future story actually needs it. A later Epic 9 story (9.1, "Course hierarchy builder") builds an admin authoring-console UI on top of this story's own service API — its own text is explicit: *"Epic 2 Story 2.1 is the entity/CRUD owner per AD-14 (courses module); this story is the authoring console UI on top of that same rule, not a second, competing implementation of it."* This story therefore has NO frontend UI at all — its AC text is entirely data/service-layer language ("Given the courses module's data store..."), and Story 9.1 is where a human actually interacts with this through a UI. "Content operations user" in the story statement maps to the existing `admin` RBAC role per the architecture's own explicit rule: "the PRD's Content-Ops and Admin/Moderation personas both map to `Admin`.")*

## Story

As a content operations user,
I want catalog content stored as a Course→Module→Topic→Concept hierarchy where each Concept carries its objectives, prerequisites, source material, board assets, checkpoints, and difficulty tier,
so that catalog courses can be authored and later browsed, customised, and taught with a consistent structure.

## Acceptance Criteria

1. **Given** the courses module's data store **When** a Course is created with nested Modules, Topics, and Concepts **Then** each Concept persists its learning objectives, prerequisite links to other Concepts, source material references, board asset references, checkpoint questions, and a difficulty tier **And** each Module, Topic, and Concept records its position/order within its parent for stable sequencing
2. **Given** a Concept being created with a prerequisite link **When** the prerequisite references a Concept ID that does not exist in the same Course **Then** the create/update operation is rejected with a validation error naming the invalid prerequisite reference
3. **Given** an existing Course with Modules, Topics, and Concepts **When** a Module is deleted **Then** its child Topics and Concepts are deleted or archived consistently (no orphaned Topic/Concept records remain reachable through the catalog) **And** any other Concept's prerequisite link pointing into the deleted subtree is flagged rather than silently left dangling
4. **Given** a fully populated Course hierarchy **When** it is retrieved by ID **Then** the full Course→Module→Topic→Concept tree is returned with all Concept-level fields intact, suitable for rendering a syllabus

## Tasks / Subtasks

- [x] **Task 1: Shared contract** (AC: #1-4)
  - [x] New `packages/shared-types/src/courseHierarchy.ts`: `difficultyTierSchema = z.enum(["beginner", "intermediate", "advanced"])` (same 3-tier scale as `learnerLevelSchema`, kept as its own schema since a Concept's difficulty and a learner's own level are distinct domain concepts that happen to share a scale — do not import/reuse `learnerLevelSchema` directly)
  - [x] `checkpointQuestionSchema = z.object({ question: z.string().min(1) })` — the minimal shape AC #1 actually names ("checkpoint questions"); no answer/grading shape invented here, that's Epic 6's (assignments) concern
  - [x] `conceptResponseSchema`: `{ id, topicId, title, position, objectives: z.array(z.string()), sourceMaterialRefs: z.array(z.string()), boardAssetRefs: z.array(z.string()), checkpointQuestions: z.array(checkpointQuestionSchema), difficultyTier: difficultyTierSchema.nullable(), prerequisites: z.array(z.object({ conceptId: z.string(), archived: z.boolean() })), archivedAt: z.string().nullable(), createdAt, updatedAt }` — `prerequisites` carries a computed `archived` flag per entry (AC #3's "flagged rather than silently left dangling"), not a stored column
  - [x] `topicResponseSchema`: `{ id, moduleId, title, position, archivedAt: z.string().nullable(), concepts: z.array(conceptResponseSchema) }`
  - [x] `moduleResponseSchema`: `{ id, courseId, title, position, archivedAt: z.string().nullable(), topics: z.array(topicResponseSchema) }`
  - [x] `courseResponseSchema`: `{ id, title, description: z.string().nullable(), modules: z.array(moduleResponseSchema), createdAt, updatedAt }` — this is the full-tree shape AC #4 requires
  - [x] Input schemas (one per creatable node, matching the granular per-node API in Task 2 — see Dev Notes on why this story exposes node-by-node creation, not one giant nested-create call): `createCourseInputSchema { title: z.string().min(1), description: z.string().optional() }`, `createModuleInputSchema { title: z.string().min(1), position: z.number().int().nonnegative() }` (matches this package's existing `z.number().int()...` convention in `users.ts`, not the `z.int()` shorthand), `createTopicInputSchema` (same shape as module), `createConceptInputSchema { title, position, objectives?: string[], sourceMaterialRefs?: string[], boardAssetRefs?: string[], checkpointQuestions?: checkpointQuestionSchema[], difficultyTier?: difficultyTierSchema, prerequisiteConceptIds?: string[] }`
  - [x] Export everything from the barrel; new `packages/shared-types/tests/courseHierarchy.test.ts`

- [x] **Task 2: Scaffold `services/courses`** (AC: #1-4)
  - [x] New workspace package `services/courses` — copy the exact shape of `services/core` (already fully read for this story): `package.json` (deps: `@usavvy/config`, `@usavvy/service-kernel`, `@usavvy/shared-types`, `drizzle-orm`, `fastify`, `postgres`, `zod`; devDeps: `@types/node`, `drizzle-kit`, `tsx`, `typescript`, `vitest`; scripts: `dev`/`build`/`test`/`typecheck`/`db:generate`/`db:migrate`, identical to core's), `tsconfig.json` (identical to core's, extending root), `drizzle.config.ts` (same shape, pointed at `usavvy_courses`)
  - [x] `src/config.ts`: `coursesEnvSchema = baseServiceEnvSchema.extend({ PORT: ...default(3002), DATABASE_URL: ...default("postgres://usavvy:usavvy@localhost:5433/usavvy_courses"), INTERNAL_SERVICE_SECRET: ...same dev default as core/gateway })` — no JWT verification needed here (courses never issues/verifies tokens itself, same as every non-`core` service will be); the internal-secret preHandler guard is still required (same reasoning as core's own — nothing should reach this service except gateway)
  - [x] `src/db/schema.ts`: four tables, `courses`/`modules`/`topics`/`concepts`, plus a `concept_prerequisites` join table (`conceptId`, `prerequisiteConceptId`, both FK to `concepts.id`) for the many-to-many prerequisite links. `modules.courseId`/`topics.moduleId`/`concepts.topicId` are FKs with `.notNull()`. Every node table gets `position` (`integer().notNull()`), `archivedAt` (`timestamp({ withTimezone: true })`, nullable — the archive mechanism for AC #3), `createdAt`/`updatedAt`/`version` (same Consistency-Conventions shape every `core` table already uses). `concepts` also gets `objectives`/`sourceMaterialRefs`/`boardAssetRefs` (`text().array()`, nullable), `checkpointQuestions` (`jsonb()`, nullable, `$type<{question: string}[]>()`), `difficultyTier` (`text()`, nullable, `$type<DifficultyTier>()`)
  - [x] `src/db/client.ts`, `src/db/migrate.ts` — identical to core's, just importing this service's own `config.ts`/`schema.ts`
  - [x] `src/modules/courses/service.ts` + `routes.ts` + `index.ts` (mirroring `core`'s `modules/<name>/index.ts`-barrel convention, AD-13):
    - `createCourse(db, role, input)` — `can(role, "create", "courseHierarchy")` guard (403 if not admin/superadmin — see Task 5), inserts a `courses` row
    - `createModule(db, role, courseId, input)`, `createTopic(db, role, moduleId, input)` — same guard, insert scoped to the given parent id (404 if the parent doesn't exist)
    - `createConcept(db, role, topicId, input)` — same guard; if `input.prerequisiteConceptIds` is given, validate each id (a) exists as a `concepts` row and (b) belongs to the SAME course as the concept being created (traced via `topic → module → course`) — **AC #2**: any failing id throws `AppError("VALIDATION_ERROR", ...)` naming that specific id, before the insert happens (no partial write)
    - `archiveModule(db, role, moduleId)` — same guard; in one transaction, sets `archivedAt = now()` on the module and cascades the same timestamp to every topic under it and every concept under those topics (**AC #3**'s "deleted or archived consistently" — this codebase archives, per the epics.md fix-note establishing this as Story 2.1's own rule that Story 9.1 builds on top of, not a hard delete)
    - `getCourse(db, courseId)` — **AC #4**: returns the full nested tree (course → modules → topics → concepts), each concept's `prerequisites` array computed by joining `concept_prerequisites` against `concepts.archivedAt` to set the `archived` flag per entry (**AC #3**'s "flagged rather than silently left dangling") — open to any authenticated role (see Task 5), not admin-gated, since a future catalog/browse story will read through this same function
  - [x] `src/app.ts`: same shape as core's — `fastifyJwt` is NOT registered here (courses never issues/verifies a JWT itself), just the internal-secret preHandler guard, `registerErrorHandler`, `/health`, and `registerCoursesRoutes`
  - [x] `src/main.ts`: same shape as core's boot sequence (create `sql`, `db`, `buildApp`, listen, graceful shutdown on SIGTERM/SIGINT)
  - [x] Routes in `courses` module: `POST /courses`, `POST /courses/:id/modules`, `POST /modules/:id/topics`, `POST /topics/:id/concepts`, `DELETE /modules/:id`, `GET /courses/:id` — trusted `x-user-id`/`x-user-role` headers read the same way `core`'s `requireTrustedUser` does (duplicate that small helper here; no shared package exists for it, and `core`'s own version is private to its module per AD-13 — do not import across `services/*`, AD-9)
  - [x] Generate + apply the migration

- [x] **Task 3: RBAC — extend the permission matrix** (AC: #1-3)
  - [x] `packages/config/src/rbac.ts`: extend `Action` to `"read" | "create" | "update" | "delete"`, extend `Resource` to `"self" | "courseHierarchy"`. `PERMISSION_MATRIX`: `superadmin`/`admin` get `courseHierarchy: ["create", "update", "delete"]` (matches "content operations user" mapping to `admin` per the architecture's own explicit rule); `mentor`/`student` get no `courseHierarchy` entry (fails closed, per this file's own existing convention). `getCourse`'s read path (Task 2) is intentionally NOT gated through `can()` at all — every role can read, matching a future catalog/browse story's needs; only the four write operations are gated
  - [x] Extend `packages/config/tests/rbac.test.ts` (check exact filename first) for the new resource/actions

- [x] **Task 4: `services/gateway` — proxy to the new service** (AC: #1-4)
  - [x] New `services/gateway/src/coursesClient.ts`, structurally identical to `coreClient.ts`'s `forward()` (same `ProxyResult`/`ProxyOptions` shapes, same try/catch-to-503 pattern) but pointed at `COURSES_SERVICE_URL` — a sibling client, not a generalization of `coreClient.ts` into one parameterized client (matches this codebase's own precedent of `forward`/`forwardBinary` staying separate rather than one contorted shared function)
  - [x] `services/gateway/src/config.ts`: add `COURSES_SERVICE_URL: z.url().default("http://localhost:3002")`
  - [x] New routes in a `coursesProxy.ts` (sibling to `authProxy.ts`, not added into it — a distinct downstream service deserves its own proxy-registration file): `POST /courses`, `POST /courses/:id/modules`, `POST /modules/:id/topics`, `POST /topics/:id/concepts`, `DELETE /modules/:id`, `GET /courses/:id` — same `requireAuth` + `trustedHeaders` shape as every existing proxy route, forwarding to `forwardToCourses` instead of `forwardToCore`. The four write routes' path-param ids (`:id` appearing on `/courses/:id/modules`, `/modules/:id/topics`, etc.) get the same `z.uuid()` validation Story 1.10's review round established for `/users/notifications/:id` — do not repeat that story's original mistake of skipping it
  - [x] Wire `coursesClient`/`coursesProxy` into `app.ts`/`main.ts` alongside the existing `core` wiring

- [x] **Task 5: Infra — the new service must actually run** (AC: #1-4)
  - [x] `infra/init-db.sh`: add `CREATE DATABASE usavvy_courses;` alongside the existing `usavvy_core` line (AD-14, database-per-service) — no `vector` extension needed here (that's `ingestion`'s concern once embeddings land, Story 2.12)
  - [x] Root `package.json`'s `dev` script: add `courses` to the `concurrently` invocation (`-n gateway,core,courses,web ... "pnpm --filter @usavvy/courses dev"`) — without this, the new service exists in the workspace but never actually starts in local dev, leaving the system not genuinely working end-to-end (the create-story workflow's own standing rule)

- [x] **Task 6: Tests mirroring `src/` 1:1** (AD-8)
  - [x] `packages/shared-types/tests/courseHierarchy.test.ts` — see Task 1
  - [x] `services/courses/tests/modules/courses/service.test.ts` (new, DB-integration mirroring `core`'s own test style) — `createCourse`/`createModule`/`createTopic`/`createConcept` persist correctly with position recorded; `createConcept` with a prerequisite from a DIFFERENT course is rejected (AC #2, naming the bad id); `archiveModule` cascades `archivedAt` to its topics and concepts (AC #3); `getCourse` returns the full nested tree (AC #4) with a prerequisite's `archived` flag correctly `true` once its target concept is archived and `false` otherwise; all four write operations reject a non-admin role with 403
  - [x] `services/courses/tests/modules/courses/routes.test.ts` (new) — each route requires the internal secret; end-to-end create-course → create-module → create-topic → create-concept → get-course round trip returns the expected tree; `DELETE /modules/:id` archives correctly through the real route
  - [x] `packages/config/tests/rbac.test.ts` (extend) — see Task 3
  - [x] `services/gateway/tests/coursesProxy.test.ts` (new) — each route requires authentication (401); a non-admin token's write attempt still forwards to `courses` (RBAC is enforced at the service layer per Task 2/3's design, not re-implemented at the gateway — mirrors how `core`'s routes, not `gateway`'s, own every existing authorization decision); path-param ids are validated before forwarding (mirrors Story 1.10's own review-round fix)

### Review Findings (2026-08-06)

- [x] [Review][Patch] Every write function checked `can(role, "create", "courseHierarchy")` regardless of what it actually does — `archiveModule` is semantically a delete but never checked the `"delete"` permission, only appearing to work because admin/superadmin get all three actions bundled in one matrix entry today (Blind Hunter) [`services/courses/src/modules/courses/service.ts`] — `requireCourseHierarchyWriteAccess` now takes an explicit `action` parameter; `archiveModule` passes `"delete"`, the four creates pass `"create"`. Regression test added mocking `can()` (wrapping the real implementation) to assert the exact action string each operation checks, confirmed failing before the fix (asserted `"delete"`, received `"create"`) and passing after
- [x] [Review][Patch] The archive cascade left `updatedAt`/`version` untouched on all three levels, unlike every other write in this codebase's Consistency Conventions (Blind Hunter) [`services/courses/src/modules/courses/service.ts`] — all three `UPDATE`s in the transaction now also bump `updatedAt`/`version`. Regression test added, confirmed failing before the fix and passing after
- [x] [Review][Patch] Re-archiving an already-archived Module silently re-stamped `archivedAt` with a new timestamp on every call, corrupting the "when was this actually archived" audit trail (Edge Case Hunter) [`services/courses/src/modules/courses/service.ts`] — `archiveModule` is now idempotent: a no-op once the module's `archivedAt` is already set. Regression test added, confirmed failing before the fix and passing after; also live-verified (two `DELETE` calls in a row against a running instance return the identical `archivedAt`)
- [x] [Review][Patch] `createConcept`'s Concept insert and its prerequisite-link insert were two separate round-trips with no transaction — a connection drop between them would silently leave a Concept persisted without the prerequisites the caller asked for (Blind Hunter) [`services/courses/src/modules/courses/service.ts`] — both inserts now happen inside one `db.transaction`
- [x] [Review][Patch] A duplicate id in `prerequisiteConceptIds` (the same id listed twice) was not deduped — passed validation and inserted two identical `concept_prerequisites` rows, which `getCourse` then returned as two entries for the same prerequisite. Confirmed independently by both Blind Hunter and Edge Case Hunter [`services/courses/src/modules/courses/service.ts`] — deduped via `[...new Set(...)]` before validation/insert. Regression test added (asserting both the response shape and the actual row count), confirmed failing before the fix and passing after
- [x] [Review][Patch] `getCourse`'s ordering (`ORDER BY position`) had no tiebreaker, so Postgres gave no guarantee about the relative order of two siblings sharing the same `position` value (Edge Case Hunter) [`services/courses/src/modules/courses/service.ts`] — added `id` (uuidv7, time-ordered) as a secondary sort key at all three levels. Regression test added creating two same-position Modules and asserting deterministic order
- [x] [Review][Patch] The Acceptance Auditor found the original AC #4 test only asserted `title`/`difficultyTier` on the *retrieval* path (full-field coverage existed only for the create-response) — extended with a dedicated test asserting every Concept field (`objectives`, `sourceMaterialRefs`, `boardAssetRefs`, `checkpointQuestions`, `prerequisites`, `archivedAt`) survives a `getCourse` round trip
- [x] [Review][Patch] The Acceptance Auditor found `createTopic`/`createConcept` had no explicit 403 test (only `createCourse`/`createModule`/`archiveModule` did), and `coursesProxy.test.ts` never tested a non-admin token's write attempt forwarding through (only admin-role requests were tested) — both gaps closed with dedicated tests
- [x] [Review][Defer] `archiveModule`'s existence check runs before opening its transaction, a latent TOCTOU window — logged to `deferred-work.md`; not currently exploitable (no hard-delete path exists, and archiving is now idempotent)
- [x] [Review][Defer] No self-reference/circular-prerequisite validation — logged to `deferred-work.md`; not currently constructible (ids are server-generated, no prerequisite-edit endpoint exists yet), but must be added before any future story ships a prerequisite-editing endpoint
- [x] [Review][Defer] No DB-level unique constraint on `concept_prerequisites(concept_id, prerequisite_concept_id)` — logged to `deferred-work.md`; the service layer now dedupes, but an out-of-band write could still bypass it; no table in this schema uses unique constraints for cross-column invariants, a schema-wide convention change

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-1 (scaffold-on-demand):** `services/courses` is created now because Epic 2 has started — the first service scaffold since Story 1.0 built `gateway`/`core`.
- **AD-14 (ownership, database-per-service):** `Course`/`Module`/`Topic`/`Concept` are owned by `courses`, with its own `usavvy_courses` Postgres database — no cross-service direct DB access, ever.
- **AD-13 (ports over concrete adapters, module boundaries):** `courses`' own `modules/courses/index.ts` is its only importable surface from outside the module, same discipline `core`'s `modules/*` already follow.
- **AD-7 (RBAC):** the one place an authorization decision is made is `can(role, action, resource)` — see Task 3. Gateway forwards trusted headers; it does not itself decide who can author content.
- **AD-17 (no silent failures):** an invalid prerequisite reference names the specific bad id (AC #2); an archived subtree's dangling prerequisite is flagged, not silently dropped (AC #3).
- **AD-8 (test mirroring):** see Task 6.
- **AD-9 (module boundaries):** `services/courses` must not import anything from `services/core` or vice versa (no `eslint-plugin-boundaries` enforcement exists yet per Story 1.0's own deferred item, so this is enforced by convention/review only, same as everywhere else in this codebase today) — the small `requireTrustedUser`-equivalent header-reading helper is duplicated, not imported across the service boundary.

### Why this story archives (not hard-deletes) on Module removal

Already settled by an Implementation Readiness review fix recorded directly in `epics.md`, quoted in this story's own frontmatter note: Epic 9's own "Course hierarchy builder" story originally specified a *blocking* delete rule for the same entities, which conflicted with this story. The fix designates **this** story (2.1) as the entity/CRUD owner whose rule — archive with dangling-reference flagging — is authoritative; Story 9.1's UI calls this same service API rather than inventing a second, competing delete semantics.

### Why this story's API is granular (one node per call), not one nested bulk-create

Story 9.1 (the future authoring console) describes a learner... a content-ops admin creating a Course and then adding "Modules, Topics, and Concepts beneath it in nested order" through an editable tree UI, with reordering support — a node-by-node authoring flow, not "submit one giant JSON document for the whole syllabus at once." A granular `POST /courses` → `POST /courses/:id/modules` → ... API is what that future UI actually needs to call incrementally; it also happens to be the simplest shape that still satisfies this story's own AC #1 (a Course "created with nested Modules, Topics, and Concepts" just means those child rows end up persisted under it, not that they must arrive in one request).

### Previous story intelligence (Story 1.10 — the last time this codebase added a path-param route)

- **Path-param ids must be validated (`z.uuid()`) before use, both where they're consumed (service/DB layer) and where they're first accepted (the gateway proxy, before being spliced into a forwarded path string).** Story 1.10's own review round found a real path-traversal bug from skipping this at the gateway layer — this story's own gateway proxy routes (Task 4) must not repeat it.
- **Ownership/ownership-adjacent checks belong in the same query as the mutation, not a separate pre-check** — Story 1.10's `WHERE id = ... AND user_id = ...` pattern is the model for this story's own "prerequisite must belong to the same course" check (traced via a join, not a separate round-trip that could race).

### Scope note: what's explicitly OUT of scope for this story

- **`Enrollment`** — named in AD-14's ownership row for `courses`, but no AC here mentions it; a future story's concern.
- **Update/reorder endpoints** (editing a title, drag-reordering siblings, moving a node to a different parent). Not named in any AC; Story 9.1's own "reorder via drag-or-move" is that future story's job to build against whatever this story ships.
- **Deleting/archiving a Course or a Topic or a Concept directly** — AC #3 only names Module deletion; archiving cascades downward from a Module, but no AC calls for a direct Course/Topic/Concept delete endpoint.
- **The actual content of source materials/board assets** (file upload, storage, retrieval) — `sourceMaterialRefs`/`boardAssetRefs` are opaque reference arrays here; Epic 2's own later ingestion stories (2.7+) and Epic 3's board-orchestration own the real referenced entities.
- **Checkpoint grading/assessment logic** — `checkpointQuestions` here is just a persisted `{question}` shape; Epic 6 (assignments) owns real assessment.
- **Course versioning/publishing** (`epics.md` describes a later "content-ops team publishes a new version" story) — not this story.
- **Any frontend UI** — this story is entirely `services/courses` + `services/gateway` + shared-types; `apps/web` is untouched (see this story's own frontmatter note on Story 9.1 owning the UI).

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.1, Epic 2 intro, FR-C-1; Story 9.1's own frontmatter fix-note establishing the archive-not-block delete rule as Story 2.1's]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1 (scaffold-on-demand), AD-14's ownership table (`Enrollment, Course, Module, Topic, Concept | courses`), AD-7 (`Content-Ops... maps to Admin`), the ERD (`COURSE ||--o{ MODULE`, etc.), the `services/<name>` directory structure]
- [Source: `services/core/{package.json,tsconfig.json,drizzle.config.ts,src/config.ts,src/app.ts,src/main.ts,src/db/client.ts,src/db/migrate.ts}` — the exact scaffold this story's `services/courses` copies]
- [Source: `services/gateway/{src/config.ts,src/app.ts,src/main.ts,src/coreClient.ts,src/authProxy.ts}` — the exact proxy pattern `coursesClient.ts`/`coursesProxy.ts` mirrors]
- [Source: `packages/config/src/rbac.ts` — the existing `can()`/`PERMISSION_MATRIX` this story extends, and its own "don't pre-populate permissions for resources that don't exist yet" convention now satisfied by this story actually needing `courseHierarchy`]
- [Source: `infra/docker-compose.yml`, `infra/init-db.sh` — the database-per-service bootstrap this story extends with `usavvy_courses`]

## Change Log

- 2026-08-06: Full implementation in one pass (Tasks 1-6) — first new microservice since Story 1.0. `packages/shared-types/src/courseHierarchy.ts` (schemas), `packages/config/src/rbac.ts` extended (`courseHierarchy` create/update/delete gated to admin/superadmin), new `services/courses` (schema, service, routes, app/main/config/db boilerplate copied from `core`'s own shape), new `services/gateway/src/{coursesClient,coursesProxy}.ts` siblings to the existing core ones with `z.uuid()` path-param validation applied from the start (Story 1.10's own review-round fix, not repeated here as a mistake). `infra/init-db.sh` and root `package.json`'s `dev` script updated so the new service actually runs. Full monorepo regression clean: 623 tests (18 config, 124 shared-types, 12 service-kernel, 166 apps/web, 78 gateway, 25 courses, 200 core), `tsc --noEmit`/`eslint .` clean across all 8 workspaces. Live-verified end-to-end: created a full Course→Module→Topic→Concept tree directly against `courses` (port 3002) with all AC #1 fields persisted; a cross-course prerequisite was rejected naming the specific bad id (AC #2); a non-admin role was rejected with 403; archiving a Module cascaded `archivedAt` to its Topic and Concepts and the dependent Concept's prerequisite came back flagged `archived: true` on retrieval (AC #3/#4); confirmed the same `POST /courses` flow succeeds through `gateway` with a real signed JWT (not just directly against `courses`). Status → `review`.
- 2026-08-06: Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) run against the diff since `baseline_commit` — the largest diff reviewed so far (a full new microservice). Six real bugs found, five confirmed by at least one hunter and two (duplicate prerequisite dedup) confirmed independently by both: (1) every write function checked the `"create"` RBAC action regardless of what it actually did, so `archiveModule` never genuinely checked `"delete"`; (2) the archive cascade never bumped `updatedAt`/`version`, breaking this codebase's own Consistency Conventions; (3) re-archiving an already-archived module non-idempotently re-stamped `archivedAt`; (4) `createConcept`'s two inserts weren't transactional; (5) duplicate prerequisite ids weren't deduped; (6) sibling ordering had no tiebreaker for position collisions. The Acceptance Auditor separately found two test-coverage gaps (AC #4's retrieval-path test didn't assert every Concept field; `createTopic`/`createConcept` and the gateway's non-admin write-forward lacked explicit tests) — code was correct in both cases, only the proof was thin. 6 patch, 2 test-gap patch, 0 dismiss, 3 defer. Every functional patch has a dedicated regression test, confirmed failing before the fix and passing after; the archive-idempotency fix was also re-verified live against the running service (two consecutive `DELETE` calls now return the identical `archivedAt`). 3 findings deferred (logged to `deferred-work.md`): a latent TOCTOU on `archiveModule`'s pre-transaction existence check (not exploitable without a hard-delete path), missing self-reference/cycle validation for prerequisites (not constructible without a prerequisite-edit endpoint, which doesn't exist), and no DB-level unique constraint backing the new service-layer dedup. 633 tests green (up from 623), `tsc --noEmit`/`eslint .` clean across all 8 workspaces. Status → `done`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **This story is data/service-layer only** — no `apps/web` changes. Its AC text is entirely "given the courses module's data store" language; Epic 9's own Story 9.1 is where a human-facing authoring console gets built against this same API, per an epics.md fix-note settling that exact division (quoted in this story's own frontmatter).
- **Granular per-node API, not one bulk nested-create call** — `POST /courses` → `POST /courses/:id/modules` → `POST /modules/:id/topics` → `POST /topics/:id/concepts`. Matches how Story 9.1's own future authoring-console UI describes building a hierarchy incrementally (add a module, then topics, then concepts, with drag-reorder later), and is simpler to validate/test than a single large nested payload.
- **Archive, not hard-delete, on Module removal** — settled by the epics.md fix-note this story's own frontmatter quotes; `archiveModule` cascades the same timestamp to child Topics/Concepts in one transaction. Dangling prerequisites into an archived subtree are flagged via a value **computed at `getCourse` read time** (comparing a prerequisite's target `archivedAt`), not a stored/trigger-maintained column — matches this codebase's existing "derive, don't snapshot" philosophy.
- **`GET /courses/:id` is intentionally not RBAC-gated** — every role can read (a future catalog/browse story needs this); only the four write operations (`create`/`update`/`delete` on `courseHierarchy`) are gated through `can()`.
- **Ownership tables (`courses`/`modules`/`topics`/`concepts`/`concept_prerequisites`) live in `services/courses`' own Postgres database (`usavvy_courses`)**, per AD-14's database-per-service rule — no cross-service DB access from `core` or anywhere else.
- **`services/courses/src/modules/courses/routes.ts` duplicates `core`'s own `requireTrustedUser` helper** rather than importing it — AD-9/AD-13 forbid one `services/*` importing another's private module internals, and no shared package currently exists for this small piece of header-reading logic.
- **Review round:** all 6 functional patches plus both test-coverage gaps landed inside the same files already touched in Tasks 2-4 (`service.ts` and its own test file, `coursesProxy.test.ts`) — no new files needed. The RBAC-action fix's regression test wraps the real `can()` implementation via `vi.fn(actual.can)` (not a full mock replacement) so every other test's genuine allow/deny behavior stays unaffected while still letting the specific action string passed per operation be inspected.

### File List

**Task 1 (shared contract):**
- `packages/shared-types/src/courseHierarchy.ts` (new)
- `packages/shared-types/src/index.ts` (updated — barrel)
- `packages/shared-types/tests/courseHierarchy.test.ts` (new)

**Task 2 (services/courses scaffold):**
- `services/courses/package.json`, `tsconfig.json`, `drizzle.config.ts` (new)
- `services/courses/src/config.ts`, `src/app.ts`, `src/main.ts` (new)
- `services/courses/src/db/{schema.ts,client.ts,migrate.ts}` (new)
- `services/courses/drizzle/0000_skinny_alice.sql` + `meta/` (new migration)
- `services/courses/src/modules/courses/{service.ts,routes.ts,index.ts}` (new)
- `services/courses/tests/testHelpers.ts`, `tests/modules/courses/{service.test.ts,routes.test.ts}` (new)

**Task 3 (RBAC):**
- `packages/config/src/rbac.ts` (updated — `courseHierarchy` resource)
- `packages/config/tests/rbac.test.ts` (updated)

**Task 4 (gateway):**
- `services/gateway/src/{coursesClient.ts,coursesProxy.ts}` (new)
- `services/gateway/src/{app.ts,main.ts,config.ts}` (updated — wiring)
- `services/gateway/tests/coursesProxy.test.ts` (new), `tests/testHelpers.ts` (updated)

**Task 5 (infra):**
- `infra/init-db.sh` (updated — `usavvy_courses`)
- `package.json` (updated — `dev` script)
