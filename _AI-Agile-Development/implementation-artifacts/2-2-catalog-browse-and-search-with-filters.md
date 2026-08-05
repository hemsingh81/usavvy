---
baseline_commit: 124a1e4
---

# Story 2.2: Catalog browse and search with filters

Status: ready-for-dev

*(Epic 2, FR-C-2. Fixed during Implementation Readiness review, per epics.md's own note: "cohort-availability" referenced Epic 7 data that doesn't exist for 5 more epics, and "rating" had no producing mechanism anywhere in the 117 FRs — neither is buildable as originally scoped. Cohort-availability is deferred to an Epic 7 follow-on story; rating is dropped from v1 scope entirely. This is the first story to add a real `apps/web` UI for Epic 2 (Story 2.1 was data/service-layer only) and the first to need Postgres full-text search anywhere in this codebase. Story 2.1's `Course` entity has no `subject`/`level`/`duration`/`status` fields yet — this story adds them via a new migration to the existing `courses` table, the same incremental-schema-evolution pattern every Epic 1 story already used on `learner_profiles` (Story 1.4 added preference columns, Story 1.9 added `colorTheme`, etc.) — not a gap in Story 2.1, which correctly didn't invent fields no AC asked for at the time.)*

## Story

As a learner,
I want to browse and search the course catalog with filters for subject, level, and duration,
so that I can quickly find a course that fits what and how I want to learn.

## Acceptance Criteria

1. **Given** the catalog contains multiple published Courses spanning different subjects and levels **When** a learner opens the catalog without any filters **Then** all published Courses are listed with subject, level, and duration visible on each entry
2. **Given** the catalog listing **When** a learner applies any combination of subject, level, and duration filters **Then** only Courses matching all selected filters are returned **And** the active filters remain visible and individually removable
3. **Given** Epic 7 has shipped and a Course is cohort-enabled (FR-G-1) **When** this story's filter set is extended **Then** a follow-on Epic 7 story adds the cohort-availability filter on top of this one — out of scope here, not blocking
4. **Given** a learner enters a free-text search term **When** the search is submitted **Then** results are ranked by relevance against course title, description, and syllabus content **And** search results respect any filters currently applied
5. **Given** a filter combination that matches no Courses **When** the search/filter is applied **Then** an empty-state message is shown explaining no matches were found, with an option to clear filters

## Tasks / Subtasks

- [ ] **Task 1: Shared contract** (AC: #1, #2, #4, #5)
  - [ ] New `packages/shared-types/src/catalog.ts`: `courseStatusSchema = z.enum(["draft", "published"])`; `courseSummarySchema = z.object({ id, title, description: z.string().nullable(), subject: z.string().nullable(), level: difficultyTierSchema.nullable(), estimatedDurationHours: z.number().nullable(), status: courseStatusSchema })` — the lightweight per-entry shape AC #1 needs ("subject, level, and duration visible on each entry"), distinct from Story 2.1's `courseResponseSchema` (the full nested tree, used for the detail/authoring path, not the catalog listing)
  - [ ] `durationBucketSchema = z.enum(["short", "medium", "long"])` — no exact bucket boundaries are specified anywhere in the PRD/epics/UX docs; this story defines them as a documented product default (`short` < 5h, `medium` 5-15h, `long` > 15h — see Dev Notes) rather than leaving "duration" as an unbucketed numeric filter, since AC #1/#2 group it alongside the clearly-categorical `subject`/`level` facets
  - [ ] `catalogSearchParamsSchema = z.object({ subject: z.string().optional(), level: difficultyTierSchema.optional(), durationBucket: durationBucketSchema.optional(), q: z.string().optional() })` — all optional; an empty object means "no filters, no search" (AC #1)
  - [ ] `catalogListResponseSchema = z.array(courseSummarySchema)`
  - [ ] Extend `createCourseInputSchema` (Story 2.1, `packages/shared-types/src/courseHierarchy.ts`) with `subject?: z.string()`, `level?: difficultyTierSchema`, `estimatedDurationHours?: z.number().nonnegative()`, `status?: courseStatusSchema` (default `"draft"` applied at the service layer, same "derive, don't snapshot"-adjacent convention as `DEFAULT_LEARNER_PREFERENCES`) — this is the only way, absent a separate publish-workflow endpoint (out of scope — see Dev Notes), for a course to ever end up `published` and carry catalog-facet data; extending the one existing create endpoint is simpler and more honest than inventing a second write path this story doesn't need
  - [ ] Export everything from the barrel; new `packages/shared-types/tests/catalog.test.ts`; extend `packages/shared-types/tests/courseHierarchy.test.ts` for the new optional `createCourseInputSchema` fields

- [ ] **Task 2: `services/courses` — catalog fields + full-text search** (AC: #1, #2, #4, #5)
  - [ ] Migration adding to the existing `courses` table: `subject` (text, nullable), `level` (text, nullable, `$type<DifficultyTier>()`), `estimated_duration_hours` (integer, nullable), `status` (text, not null, default `'draft'`, `$type<CourseStatus>()`)
  - [ ] `createCourse` (Story 2.1, `service.ts`): persist the four new optional input fields, defaulting `status` to `"draft"` when omitted (mirrors `DEFAULT_LEARNER_PREFERENCES`'s "default computed at the service layer, not the DB level" convention — though here the DB *does* also carry a `DEFAULT 'draft'` for defense-in-depth on direct-DB-fixture rows in tests)
  - [ ] New `searchCourses(db, params: CatalogSearchParams): Promise<CourseSummary[]>` in `service.ts` — **the first Postgres full-text search in this codebase**. Filters `WHERE status = 'published'` unconditionally (AC #1: "published Courses" — a `draft` course never appears in catalog results, regardless of filters), then narrows by `subject`/`level`/`durationBucket` (translate the bucket back to an `estimated_duration_hours` range: `short` → `< 5`, `medium` → `5-15` inclusive, `long` → `> 15`) if given. When `q` is given, rank by relevance (AC #4: title/description/syllabus content) using `ts_rank` against a weighted `tsvector` built at query time: `setweight(to_tsvector('english', title), 'A') || setweight(to_tsvector('english', coalesce(description, '')), 'B') || setweight(to_tsvector('english', coalesce(syllabus_text, '')), 'C')`, where `syllabus_text` is an aggregated string of that course's Topic titles + Concept titles/objectives (a `LEFT JOIN` through `modules → topics → concepts` with `string_agg`, computed once per course via a subquery/CTE — **do not** try to precompute this as a stored/generated column: a Postgres generated column can't reference other tables, and this aggregates across three). Filter rows to `@@ plainto_tsquery('english', :q)` and `ORDER BY ts_rank(...) DESC` when `q` is present; when `q` is absent, order by `title ASC` (a stable, sensible default — no AC specifies unfiltered/unsearched ordering)
  - [ ] Use `db.execute(sql\`...\`)` with parameterized values (never string-interpolate `q`/filter values into the SQL — standard injection hygiene) since drizzle's query builder has no native `tsvector`/`ts_rank` helpers; map the raw result rows back to `CourseSummary` shape explicitly
  - [ ] `GET /courses` route in `routes.ts`: parses query params via `catalogSearchParamsSchema`, calls `searchCourses` — **no RBAC gate** (matches `GET /courses/:id`'s existing "every role can read" precedent from Story 2.1; catalog browse is a learner-facing read, not a content-ops write)
  - [ ] Tests: `services/courses/tests/modules/courses/catalog.test.ts` (new) — unfiltered search returns only `published` courses, never `draft` ones (AC #1); each filter (`subject`/`level`/`durationBucket`) narrows correctly alone and in combination (AC #2); a filter combination matching nothing returns `[]` (AC #5's backend half); `q` ranks a course whose *title* matches above one that only matches in nested syllabus content, and excludes a course matching neither (AC #4); search results are still narrowed by simultaneously-applied filters (AC #4's "search results respect any filters currently applied")

- [ ] **Task 3: `services/gateway`** (AC: #1, #2, #4, #5)
  - [ ] New `GET /courses` route in `coursesProxy.ts` — **the first proxy route in this codebase that must forward query-string parameters**, not just a bare path. Forward `request.url` (Fastify's `request.url` already includes the original query string) rather than the hardcoded `"/courses"` literal every other route uses, so `subject`/`level`/`durationBucket`/`q` reach `courses` unchanged. No `:id` param here, so none of Story 1.10/2.1's own path-param-validation fixes apply to this specific route
  - [ ] Extend `services/gateway/tests/coursesProxy.test.ts` — requires authentication (401); forwards the exact query string the client sent (assert `forwardToCourses` was called with a path containing the query params, not just `"/courses"`)

- [ ] **Task 4: `apps/web` — the Catalog page** (AC: #1, #2, #4, #5)
  - [ ] New `apps/web/src/modules/courses/api.ts`: `createCoursesApi(apiUrl)` with `searchCatalog(accessToken, params: CatalogSearchParams): Promise<CourseSummary[]>` — builds a query string from the given params (only including keys that are actually set) and calls `GET /courses`
  - [ ] New `apps/web/src/modules/courses/CatalogPage.tsx` at route `/catalog`, reachable directly (no new persistent nav bar — the same already-accepted "no nav chrome wires it up yet" gap every prior page-adding story in this codebase left open; `EXPERIENCE.md`'s own "Nav → Catalog" entry describes a full site nav this story does not build). Protected the same `useAuth()`/`Navigate`-to-`/login` way every other page is (catalog browse requires a session per this app's existing convention — no AC says otherwise)
  - [ ] State: a free-text search input, three filter controls (`subject` free-text or select, `level` select from the 3 tiers, `durationBucket` select from the 3 buckets), and a results list. Every control change re-fetches (debounce the free-text input; filter selects can fire immediately, matching `PreferencesPage`'s own "each control acts independently" convention adapted to a read/search context rather than a per-field save)
  - [ ] Active filters render as visible, individually-removable chips (AC #2's "active filters remain visible and individually removable") — clicking a chip's remove control clears just that one filter and re-searches, matching `PreferencesPage`'s "one control's action never disturbs another's state" precedent
  - [ ] Empty state: when a search/filter returns `[]`, show an explicit message (not a blank list) with a "Clear filters" action that resets all filters/search and re-fetches (AC #5)
  - [ ] Each result entry shows title, subject, level, and duration (AC #1) — no DESIGN.md component token exists for a catalog card (DESIGN.md predates Epic 2), so style it from the existing generic tokens/spacing already established, matching the same "no token exists yet, use the generic ones" precedent Stories 1.4/1.9 already set for their own new controls
  - [ ] Tests: `apps/web/tests/modules/courses/CatalogPage.test.tsx` (new) — redirects to `/login` with no session; renders all courses with subject/level/duration visible when no filters are applied (AC #1); applying a filter re-fetches with the right query params and shows it as a removable chip (AC #2); removing a chip re-fetches without that filter; submitting a search term re-fetches with `q` set; an empty result set shows the empty-state message and "Clear filters" resets and re-fetches unfiltered (AC #5); extend `apps/web/tests/modules/courses/api.test.ts` (new) for `searchCatalog`'s query-string construction

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-4 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `subject`/`level`/`estimatedDurationHours`/`status` extend `courses`, already owned by `courses` service — no new entity, no new database.
- **AD-7 (RBAC):** catalog read (`GET /courses`) is intentionally ungated, matching `GET /courses/:id`'s existing Story 2.1 precedent — every role can browse. `createCourse`'s existing `"create"` RBAC gate (Story 2.1) is untouched; setting `status: "published"` at creation time is still an admin/superadmin-only action, same as creating the course at all.
- **AD-17 (no silent failures):** an empty-result search shows an explicit message, never a blank panel (AC #5) — the same standing rule Story 1.11 applied to Activity History's empty state.
- **AD-8 (test mirroring):** see Task 5.
- **Postgres full-text search is new to this codebase** — no existing convention to follow beyond drizzle's own raw-`sql` escape hatch (already used elsewhere in this repo, e.g. `bumpVersion()`'s `sql\`${column} + 1\``). Parameterize every user-supplied value; never string-concatenate `q` or filter values into the query text.

### Why `subject`/`level`/`duration`/`status` are added to `courses` now, not in Story 2.1

Story 2.1's own AC never named these fields — it named Concept-level fields (objectives, prerequisites, source materials, board assets, checkpoints, difficulty tier) and Module/Topic/Concept positioning. Adding catalog-facet fields to `Course` speculatively in that story would have been exactly the "pre-build for a story that hasn't started" mistake that story's own Dev Notes explicitly warned against for Enrollment and update/reorder endpoints. This story is where those fields are actually needed, so this is where they're added — via a new migration to the same table, the identical pattern every Epic 1 story used to grow `learner_profiles` incrementally.

### Why `status`/duration/subject are set via `createCourse`'s existing input, not a new publish endpoint

A later Epic 9 story ("I want draft content to move through a draft → internal review → published workflow with explicit reviewer sign-off") owns the *real*, multi-state publish workflow with reviewer approval. Building any part of that workflow here — even a minimal "PUT /courses/:id/publish" — would be scope creep into that story's own design space. This story only needs *some* course to reach `status: "published"` so the catalog has something real to show; extending the one existing write path (`createCourse`) to accept `status` directly (content-ops can simply create a course already marked published, or a test/seed script can) is the minimal, honest way to make that possible without inventing workflow machinery no AC here asks for.

### Previous story intelligence (Story 2.1 — read before starting, don't rediscover this)

- **`courses`/`modules`/`topics`/`concepts` schema, RBAC pattern (`can(role, action, "courseHierarchy")`), and the `requireTrustedUser` duplication-not-import convention** are all already established in `services/courses/src/modules/courses/{service.ts,routes.ts}` — extend the same files, don't create parallel ones.
- **Review-round lesson from Story 2.1: pass the actual action to `can()`, not always `"create"`.** `searchCourses` is a read with no RBAC check at all (matching `getCourse`'s own precedent) — nothing to get wrong here, but don't add a gate reflexively without checking what action it should actually be.
- **Review-round lesson from Story 2.1: order-by needs a deterministic tiebreaker when the primary sort key can tie.** `searchCourses`'s unfiltered/unsearched `ORDER BY title ASC` should also add `id ASC` as a tiebreaker for courses sharing an identical title.
- **Review-round lesson from Story 1.10: any new gateway route touching a caller-supplied path segment must be validated before use.** Not applicable to `GET /courses` (no path param), but Task 3's query-string forwarding is genuinely new ground — make sure `request.url` is used as-is (Fastify itself has already parsed/validated the URL structure), not manually reconstructed from `request.query` in a way that could re-introduce an encoding bug.

### Scope note: what's explicitly OUT of scope for this story

- **Cohort-availability filter** (AC #3) — explicitly deferred to a future Epic 7 story; do not add a `cohortEnabled` field or filter now.
- **Rating/review data or a rating filter** — dropped from v1 scope entirely per the epics.md fix-note; no FR authorizes collecting it.
- **The draft → internal review → published workflow with reviewer sign-off** — that's Epic 9's own future story; this one only needs the `status` column and no-op default.
- **Course versioning** (`epics.md`'s later "content-ops team publishes a new version" story) — untouched.
- **Semantic/embedding-based search** — Story 2.12 ("Embedding and AI-proposed topic/concept outline") is where embeddings first exist in this codebase; this story's search is classic Postgres full-text search (`tsvector`/`ts_rank`), not vector similarity.
- **A persistent site-wide navigation bar** with a real "Catalog" link — `CatalogPage` is reachable by direct URL only, matching every prior story's identical, already-accepted gap.
- **Course detail page, customisation, or "Start course"** — Story 2.3/2.4's own scope.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.2, Epic 2 intro, FR-C-2, the Implementation Readiness fix-note dropping rating and deferring cohort-availability]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — "Catalog browse/search... Nav → Catalog"; "catalog search with no matches shows an explicit empty-with-clear-filters state"]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-1-model-the-course-module-topic-concept-hierarchy.md` — the `courses`/`modules`/`topics`/`concepts` schema and service this story extends; its own review-round lessons (RBAC action correctness, ordering tiebreakers) applied proactively here]
- [Source: `services/core/src/modules/users/service.ts`'s `bumpVersion()` — the established `sql\`...\`` raw-SQL escape-hatch convention this story's `ts_rank` query reuses]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

### File List
