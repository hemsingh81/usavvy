---
baseline_commit: 2e1abbe
---

# Story 2.3: Course detail page

Status: review

*(Epic 2, FR-C-3. This is the first `apps/web` UI to consume `GET /courses/:id` — already built in Story 2.1 and already returning the full Module→Topic→Concept tree with everything the syllabus needs — so no new backend route is required. `Course` gains three new fields this story: `prerequisites`, `outcomes`, and a `sampleBoardAssetRef`, added incrementally to the same table exactly as Story 2.2 added `subject`/`level`/`estimatedDurationHours`/`status` — no AC before this one named them, so building them earlier would have been the "pre-build for a story that hasn't started" mistake every prior Epic 2 story's Dev Notes warned against.)*

## Story

As a learner,
I want a course detail page showing the syllabus, estimated hours, prerequisites, a short sample board session, and outcomes,
so that I can decide whether this course is right for me before starting.

## Acceptance Criteria

1. **Given** a published Course with a full Module/Topic/Concept hierarchy **When** a learner opens its detail page **Then** the syllabus is rendered showing Modules and Topics in order, the total estimated hours are shown, prerequisite courses/knowledge are listed, and stated learning outcomes are displayed
2. **Given** a Course detail page with an available sample board asset **When** the learner plays the sample **Then** a 30-second preview of a board session plays, representative of the Avatar's teaching style for that course
3. **Given** a Course that has no sample board asset configured **When** the learner opens its detail page **Then** the sample session section is omitted or shows a "sample not yet available" state rather than an error, and the rest of the page renders normally
4. **Given** a Course detail page **When** the learner has not yet started the course **Then** primary calls to action for "Start course" and "Customise before starting" are both visible

## Tasks / Subtasks

- [x] **Task 1: Shared contract** (AC: #1, #2, #3)
  - [x] Extend `packages/shared-types/src/courseHierarchy.ts`'s `courseResponseSchema` with `prerequisites: z.array(z.string())`, `outcomes: z.array(z.string())`, `sampleBoardAssetRef: z.string().nullable()` — plain opaque-string arrays/ref, the exact same convention `conceptResponseSchema`'s `objectives`/`sourceMaterialRefs`/`boardAssetRefs` already use (no URL-format validation, since the actual asset-hosting mechanism doesn't exist yet — see Dev Notes)
  - [x] Extend `createCourseInputSchema` with `prerequisites: z.array(z.string()).optional()`, `outcomes: z.array(z.string()).optional()`, `sampleBoardAssetRef: z.string().optional()` — the only way, absent a separate course-editing endpoint (none exists), for these fields to ever be populated; mirrors Story 2.2's identical "extend the one existing write path" reasoning for `subject`/`level`/`status`
  - [x] Extend `packages/shared-types/tests/courseHierarchy.test.ts`'s `VALID_COURSE` fixture and add cases for the three new optional `createCourseInputSchema` fields and the new required-but-possibly-empty-array/nullable `courseResponseSchema` fields

- [x] **Task 2: `services/courses` — persist and return the three new fields** (AC: #1, #2, #3)
  - [x] Migration adding to the existing `courses` table: `prerequisites` (`text[]`, nullable), `outcomes` (`text[]`, nullable), `sample_board_asset_ref` (`text`, nullable) — same `text(...).array()` convention `concepts.objectives`/`sourceMaterialRefs`/`boardAssetRefs` already use
  - [x] `createCourse` (`service.ts`): persist the three new optional input fields (`?? null` when omitted, matching every other optional `Course` field's existing pattern)
  - [x] `getCourse` (`service.ts`): extend the returned object with `prerequisites: course.prerequisites ?? []`, `outcomes: course.outcomes ?? []`, `sampleBoardAssetRef: course.sampleBoardAssetRef ?? null` — no other change to `getCourse`'s existing tree-assembly logic (Modules/Topics/Concepts, ordering, dangling-prerequisite flagging) since none of that is touched by this story
  - [x] No new route needed — `GET /courses/:id` (Story 2.1) and its gateway proxy (Story 2.1) already exist, are already ungated the same way `GET /courses` is, and already return the full tree; this story only widens what that same endpoint returns
  - [x] Extend `services/courses/tests/modules/courses/routes.test.ts`/a new `courseDetail.test.ts` as needed: `getCourse` returns the three new fields (present and absent cases); a course created without them returns `[]`/`[]`/`null`, never `undefined` or a thrown error (AC #3's backend half)

- [x] **Task 3: `apps/web` — the Course Detail page** (AC: #1, #2, #3, #4)
  - [x] Extend `apps/web/src/modules/courses/api.ts`'s `createCoursesApi` with `getCourse: (accessToken, id): Promise<CourseResponse>` — calls `GET /courses/:id`, parses with `courseResponseSchema` (already exported from `@usavvy/shared-types`)
  - [x] New `apps/web/src/modules/courses/CourseDetailPage.tsx` at route `/courses/:id` (`useParams` from `react-router-dom`, the first use of it in this codebase — every prior page instead reads state/session, never a URL param). Protected the same `useAuth()`/`Navigate`-to-`/login` way every other page is
  - [x] Render: course title/description; syllabus as an ordered list of Modules, each showing its Topics in order (position-ordered, already guaranteed by `getCourse`'s existing `orderBy(position, id)`) — Concepts themselves are not required to render for this AC, which asks only for "Modules and Topics in order"; total estimated hours (`estimatedDurationHours`, reusing Story 2.2's field — show a "not yet estimated" state when `null`, don't invent a fake number); `prerequisites` and `outcomes` as simple bulleted lists, each empty-list-safe (render nothing extra, not an empty bullet, when `[]`)
  - [x] Sample board session section: when `sampleBoardAssetRef` is non-null, render a native `<video>` element pointing at it (see Dev Notes — this is a plain external URL reference, not a `StoragePort`-backed fetch, since that infrastructure doesn't exist yet); when `null`, render an explicit "Sample not yet available" message in the same section rather than omitting it silently or showing an error (AC #3)
  - [x] Two visible, non-functional primary CTAs — "Start course" and "Customise before starting" (AC #4). Neither destination page exists yet (Story 2.4 owns customisation; Epic 3/4 own actually starting a course), so both render as `disabled` buttons rather than linking to a route that would 404 — matches this codebase's existing "page/feature reachable only once its own story ships" convention (e.g. `CatalogPage` itself has no nav wiring yet)
  - [x] `CatalogPage`'s result cards each become a `<Link to={\`/courses/${course.id}\`}>` around the title — the minimal wiring needed for the catalog and detail page to actually work together end-to-end (no AC requires this explicitly, but a detail page unreachable from the one listing page that shows courses would leave the feature non-functional in practice)
  - [x] Tests: `apps/web/tests/modules/courses/CourseDetailPage.test.tsx` (new) — redirects to `/login` with no session; renders Modules/Topics in order, estimated hours, prerequisites, and outcomes (AC #1); renders a `<video>` pointing at `sampleBoardAssetRef` when present (AC #2); renders "Sample not yet available" (not an error) when `sampleBoardAssetRef` is null, with the rest of the page still rendering normally (AC #3); both CTAs are visible and disabled (AC #4); a fetch failure (e.g. 404 for an unknown course id) shows a distinguishable error, not a blank page (AD-17). Extend `apps/web/tests/modules/courses/api.test.ts` for `getCourse`. Extend `apps/web/tests/modules/courses/CatalogPage.test.tsx` for the new card-to-detail-page link.

- [x] **Task 4: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-3 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `prerequisites`/`outcomes`/`sampleBoardAssetRef` extend `courses`, already owned by `courses` service — no new entity, no new database, no new migration target.
- **AD-7 (RBAC):** `GET /courses/:id` is already ungated (Story 2.1 precedent, same as `GET /courses`) — nothing to change here. `createCourse`'s existing `"create"` gate is untouched.
- **AD-17 (no silent failures):** a missing sample board asset shows an explicit "not yet available" message (AC #3), never an empty gap or a swallowed error; a failed course-detail fetch (e.g. unknown/malformed id) shows a distinguishable error, matching `CatalogPage`'s own established error-surfacing pattern.
- **AD-8 (test mirroring):** see Task 4.
- **AD-6 (Object storage behind `StoragePort`) does NOT apply to this story.** `StoragePort` doesn't exist anywhere in this codebase yet (verified: no file under `packages/` references it) — it's scoped by AD-6 to durable artifacts like uploaded documents and board exports, which belong to Epic 2's later ingestion stories (2.7+) and Epic 3's board itself. Building any part of that now would be exactly the kind of pre-built-for-a-future-story infrastructure this codebase's Dev Notes have repeatedly declined to add early. `sampleBoardAssetRef` is therefore modeled as a bare opaque string (matching `boardAssetRefs`' existing convention on `Concept`) — in practice a URL a content-ops user supplies directly when creating a course, rendered by the frontend as a plain external `<video src>`. **Do not** attempt to wire real upload/storage for this field in this story.

### Why "sample board session" doesn't build any part of Epic 3's board

Epic 3 ("The Interactive Board" — pause/resume, beat replay, progressive text/math/diagrams/code/charts synced to narration) is still entirely `backlog` and defines what a real teaching session actually looks like. AC #2's "30-second preview... representative of the Avatar's teaching style" only needs *something that plays* — a pre-rendered video clip is a faithful, honest way to satisfy that without inventing a miniature version of Epic 3's own real board renderer ahead of its own story. This mirrors Story 2.2's identical reasoning for not building Epic 9's publish workflow just to get a Course to `"published"`.

### Why `prerequisites`/`outcomes` are freeform string arrays, not structured Course references

No FR or epics.md story anywhere describes an inter-course prerequisite graph (Story 2.1's `conceptPrerequisites` table is intra-course, Concept-to-Concept, only). FR-C-3 itself just says "prerequisites" and "outcomes" with no structure implied beyond "listed"/"displayed". A plain string array (content-ops writes free text like `"Basic algebra"` or `"Completes Intro to Statistics first"`) is the minimal shape that satisfies the AC without inventing a cross-course dependency model no other story asks for.

### Why "Start course"/"Customise before starting" are disabled, not linked

Story 2.4 ("Course customisation before start") is the very next backlog story and will own building the customisation screen for real — wiring "Customise before starting" to a route that doesn't exist yet would either 404 (via `App.tsx`'s existing catch-all `NotFoundPage`) or require speculatively building part of Story 2.4's own screen here. "Start course" depends on Epic 3/4 infrastructure that doesn't exist at all yet. Rendering both as visible-but-disabled satisfies AC #4's literal "are both visible" requirement without scope-creeping into either future story's design space.

### Previous story intelligence (Story 2.2 — read before starting, don't rediscover this)

- **`courses`/`modules`/`topics`/`concepts` schema, the `requireTrustedUser` duplication-not-import convention, and the "extend the one existing write path rather than invent a new one" pattern** are all established in `services/courses/src/modules/courses/{service.ts,routes.ts}` and reused as-is here.
- **`GET /courses/:id` already exists end-to-end** (service, route, gateway proxy) since Story 2.1 — confirmed by reading all three files directly; this story only needs to widen the response shape, not add any new route on either `services/courses` or `services/gateway`.
- **Review-round lesson from Story 2.2 (twice-confirmed): free-text or facet-like fields need care around case/empty-state handling** — not directly applicable here since `prerequisites`/`outcomes` are rendered lists, not search filters, but keep the same discipline: an empty array must render as "nothing shown", never a spurious empty bullet or a crash.
- **Review-round lesson from Story 2.2: don't leave a debounced/derived piece of UI state only half-cleared.** `CourseDetailPage` has no debounced input, so this specific bug shape doesn't recur here, but it's a reminder to trace every piece of state a "clear"/"reset" action touches all the way through, not just the most visible one.

### Scope note: what's explicitly OUT of scope for this story

- **Any real playback of an interactive Avatar-narrated board session** — that's Epic 3's own future work; this story only plays a static video reference.
- **Real `StoragePort`-backed upload or storage of the sample asset** — no upload UI, no `services/*` storage integration; `sampleBoardAssetRef` is set the same way `createCourse`'s other new-in-this-story fields are, via the existing create endpoint.
- **"Start course" or "Customise before starting" actually doing anything** — both are visible, disabled placeholders; Story 2.4 and later Epic 3/4 stories own making them real.
- **An inter-course prerequisite graph or "you must complete X before Y" enforcement** — `prerequisites` is informational display text only, not an enforced dependency.
- **A persistent site-wide navigation bar** — `CourseDetailPage` is reachable via a catalog-card link (this story's own minimal addition) or a direct URL; no nav-bar entry is added, matching every prior story's identical accepted gap.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.3, FR-C-3]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-6 (`StoragePort`, confirmed unbuilt), AD-7 (RBAC), AD-8 (test mirroring), AD-14 (ownership)]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-1-model-the-course-module-topic-concept-hierarchy.md` — `getCourse`'s existing full-tree assembly this story extends, not replaces]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-2-catalog-browse-and-search-with-filters.md` — the "extend the one existing write path" and "add facet fields incrementally" precedent this story repeats for `prerequisites`/`outcomes`/`sampleBoardAssetRef`]
- [Source: `services/courses/src/db/schema.ts`'s `concepts.objectives`/`sourceMaterialRefs`/`boardAssetRefs` — the `text(...).array()`, opaque-reference-string convention this story's three new `courses` columns follow]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- All 4 tasks implemented and tested. `courses` gained `prerequisites`/`outcomes`/`sampleBoardAssetRef` (migration `0002_parallel_victor_mancha.sql`); `createCourse`/`getCourse` extended to persist/return them, following Story 2.2's exact "extend the one existing write path" pattern.
- **No new backend route was needed** — `GET /courses/:id` (Story 2.1) and its gateway proxy already existed, already ungated, and already returned the full Module→Topic→Concept tree; this story only widened what that same endpoint returns.
- `CourseDetailPage` renders the syllabus (Modules/Topics in position order, reusing `getCourse`'s existing deterministic ordering), estimated hours (with a "not yet estimated" fallback for `null`), prerequisites/outcomes as empty-array-safe bulleted lists, a native `<video>` for the sample board asset when present, and an explicit "Sample not yet available" message when it's `null` (AC #3 — the rest of the page still renders normally in that case, verified by test). "Start course"/"Customise before starting" render as visible, disabled buttons (AC #4) since neither destination exists yet.
- `CatalogPage`'s result cards now link their title to `/courses/:id` — the minimal wiring needed for the catalog and detail page to work together end-to-end (not explicitly required by any AC, but the feature would be otherwise unreachable in practice).
- Live-verified end-to-end: created a published course with prerequisites/outcomes/a sample asset ref plus a module/topic, confirmed `GET /courses/:id` returns everything correctly both directly against `services/courses` and through the gateway with a real JWT, and confirmed a 404 for an unknown course id surfaces as a clean error envelope, not a crash. Test data cleaned up afterward.
- Full monorepo regression: 687 tests passing (18+142+12+185+82+48+200 across all 8 workspaces), `tsc --noEmit` and `eslint .` clean.

### File List

- `packages/shared-types/src/courseHierarchy.ts` (modified — `courseResponseSchema`/`createCourseInputSchema` extended with `prerequisites`/`outcomes`/`sampleBoardAssetRef`)
- `packages/shared-types/tests/courseHierarchy.test.ts` (modified)
- `services/courses/src/db/schema.ts` (modified — new `courses` columns)
- `services/courses/drizzle/0002_parallel_victor_mancha.sql` (new migration)
- `services/courses/src/modules/courses/service.ts` (modified — `createCourse`/`getCourse` extended)
- `services/courses/tests/modules/courses/service.test.ts` (modified)
- `apps/web/src/modules/courses/api.ts` (modified — new `getCourse`)
- `apps/web/src/modules/courses/CourseDetailPage.tsx` (new)
- `apps/web/src/modules/courses/CatalogPage.tsx` (modified — card title links to detail page)
- `apps/web/src/modules/courses/index.ts` (modified — barrel export)
- `apps/web/src/app/App.tsx` (modified — `/courses/:id` route)
- `apps/web/src/shared/components.css` (modified — syllabus/CTA styles)
- `apps/web/tests/modules/courses/api.test.ts` (modified)
- `apps/web/tests/modules/courses/CourseDetailPage.test.tsx` (new)
- `apps/web/tests/modules/courses/CatalogPage.test.tsx` (modified — card-link test)

## Change Log

- 2026-08-06: Implemented Course detail page (Tasks 1-4): shared contract extension, `services/courses` persistence for the 3 new fields (no new route needed), `apps/web` CourseDetailPage plus catalog card linking. Live-verified end-to-end. Status → review.
