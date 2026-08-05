---
baseline_commit: 3965212
---

# Story 2.4: Course customisation before start

Status: done

*(Epic 2, FR-C-4. This story owns wiring "Customise before starting" for real — Story 2.3's own Dev Notes explicitly deferred that button to this story. "Start course" remains disabled; it depends on Epic 3/4 infrastructure that doesn't exist yet and is not this story's job. "Regenerated plan"/"estimated hours" here means the recalculated Topic-selection scope and its resulting hour estimate — NOT a real dated session-by-session schedule; that is Epic 4's `PlannedSession` ("Generate dated session schedule respecting prerequisites"), still `backlog`.)*

## Story

As a learner,
I want to customise a catalog course before starting — deselecting topics I already know, marking priority topics, setting depth, and choosing my default explanation style,
so that my plan and estimated hours reflect what I actually need to learn.

## Acceptance Criteria

1. **Given** a learner on the customisation screen for a Course **When** they deselect one or more Topics they already know **Then** those Topics are excluded from the regenerated plan and the estimated hours recalculate to reflect only the remaining Topics
2. **Given** the customisation screen **When** the learner marks one or more Topics as priority and sets a depth (overview / standard / deep dive) and a default explanation style **Then** the selections are saved against the learner's course customisation and the estimated hours recalculate to reflect the chosen depth
3. **Given** a learner deselects a Topic that is a prerequisite for another Topic still selected **When** the deselection is applied **Then** the system warns the learner that a dependent Topic requires it, and either blocks the deselection or requires explicit confirmation before proceeding
4. **Given** a learner has saved customisation choices and returns later before starting the course **When** they reopen the customisation screen **Then** their previous deselections, priorities, depth, and explanation style are pre-loaded for further editing

## Tasks / Subtasks

- [x] **Task 1: Shared contract** (AC: #1, #2, #3, #4)
  - [x] New `packages/shared-types/src/courseCustomization.ts`: `courseCustomizationDepthSchema = z.enum(["overview", "standard", "deep-dive"])` — no exact depth levels/multipliers are named anywhere beyond these three labels (PRD/epics), so this story defines the multiplier values as a documented product default (see Dev Notes), the same "invent and document, don't leave unbucketed" precedent Story 2.2 set for duration buckets
  - [x] `saveCourseCustomizationInputSchema = z.object({ deselectedTopicIds: z.array(z.string()).optional(), priorityTopicIds: z.array(z.string()).optional(), depth: courseCustomizationDepthSchema.optional(), explanationStyle: explanationStyleSchema.optional(), force: z.boolean().optional() })` — a genuine partial update, matching `updatePreferencesInputSchema`'s (Story 1.4) identical all-optional convention; `explanationStyleSchema` is imported from `./preferences.js` (already exists from Story 1.4 — do NOT redefine it)
  - [x] `courseCustomizationResponseSchema = z.object({ courseId, deselectedTopicIds: z.array(z.string()), priorityTopicIds: z.array(z.string()), depth: courseCustomizationDepthSchema, explanationStyle: explanationStyleSchema, estimatedHours: z.number().nullable(), updatedAt: z.string() })`
  - [x] `dependencyConflictSchema = z.object({ topicId: z.string(), topicTitle: z.string(), requiredByTopicId: z.string(), requiredByTopicTitle: z.string() })` — AC #3's structured warning payload
  - [x] Export everything from the barrel; new `packages/shared-types/tests/courseCustomization.test.ts`

- [x] **Task 2: `services/courses` — persistence, dependency-conflict detection, hour recalculation** (AC: #1, #2, #3, #4)
  - [x] New table `course_customizations`: `id` (uuid pk), `user_id` (text, NOT a real FK — cross-service reference, same as every other opaque `userId` column in this codebase), `course_id` (uuid, FK to `courses`), `deselected_topic_ids`/`priority_topic_ids` (`text[]`, nullable), `depth` (text, NOT NULL, default `'standard'`, `$type<CourseCustomizationDepth>()`), `explanation_style` (text, NOT NULL, default `'concise'`, `$type<ExplanationStyle>()`), `created_at`/`updated_at`/`version` (standard). A **composite unique index on `(user_id, course_id)`** — one customization per learner per course, upserted on save (`onConflictDoUpdate`, target the composite index) — matches `learnerProfiles.userId`'s single-column `.unique()` precedent, just composite here
  - [x] `getCourseCustomization(db, userId, courseId): Promise<CourseCustomizationResponse | null>` — returns `null` (route maps to 404 `NOT_FOUND`) when the learner has never saved one for this course yet (AC #4's "first time" case); do **not** auto-create a row on read (unlike `ensureLearnerProfile`'s upsert-on-read convention) — a course customization is genuinely optional/course-scoped, not a guaranteed one-per-user profile row, and there's no cross-service way to seed a sensible `explanationStyle` default from the learner's account-wide preference without a new courses→core HTTP dependency no AC asks for (see Dev Notes)
  - [x] `saveCourseCustomization(db, userId, courseId, input): Promise<CourseCustomizationResponse>`:
    - Validate every id in `deselectedTopicIds`/`priorityTopicIds` actually belongs to this Course's Topics (naming the invalid id in the error, matching `createConcept`'s existing prerequisite-validation message convention)
    - Compute dependency conflicts (AC #3): for every Concept whose Topic remains selected (not in `deselectedTopicIds`), if it has a prerequisite Concept belonging to a Topic that IS in `deselectedTopicIds`, that's a conflict — reusing the same `concept_prerequisites` data `getCourse` already reads, no new prerequisite model needed (Topic-level prerequisites are *derived* from the existing Concept-level graph, not separately stored)
    - If conflicts exist and `input.force !== true`: throw `AppError("DEPENDENCY_CONFLICT", "...", 409, conflicts)` — nothing is saved. The caller (frontend) shows the conflicts and resubmits with `force: true` to save anyway (AC #3's "requires explicit confirmation" branch — chosen over "blocks outright" since this is the learner's own choice about their own learning path, matching this codebase's `EXPERIENCE.md`-stated "the learner holds the remote" principle already applied elsewhere)
    - Upsert the row (insert with defaults for any omitted field, `onConflictDoUpdate` on the composite unique index for an existing row), then compute and return `estimatedHours` (see the recalculation formula in Dev Notes) alongside the saved selections
  - [x] `GET /courses/:id/customization` route: `requireTrustedUser`, no RBAC gate beyond authentication — this is the learner's own personal data, matching `PUT /users/preferences`'s (Story 1.4) identical "no role check, auth only" precedent, not a `courseHierarchy` content-ops action
  - [x] `PUT /courses/:id/customization` route: same auth-only gate
  - [x] Tests: unfiltered save/read round-trip; partial update preserves untouched fields; invalid topic id named in the validation error; a real dependency conflict is detected and blocks without `force`, then saves with `force: true` (AC #3); `estimatedHours` recalculates correctly for a deselected-topic case (AC #1) and for each depth level (AC #2); `GET` returns `null`/404 before any save exists, then the exact previously-saved shape after one (AC #4); a course with a null `estimatedDurationHours` returns a null recalculated `estimatedHours` rather than fabricating a number; a course with zero Topics returns the course's own `estimatedDurationHours` unchanged (nothing to weight/deselect)

- [x] **Task 3: `services/gateway`** (AC: #1, #2, #3, #4)
  - [x] New `GET`/`PUT /courses/:id/customization` proxy routes in `coursesProxy.ts`, `requireAuth`, `requireValidId` on the path param (Story 1.10's own path-validation fix, already this file's established convention) — mirrors the existing `GET/PUT` shape of every other proxied route in this file
  - [x] Extend `services/gateway/tests/coursesProxy.test.ts`: both require authentication (401); both forward the validated id and (for `PUT`) the request body correctly; an invalid `:id` is rejected before any forward call is made

- [x] **Task 4: `apps/web` — the Customise screen, and wiring Story 2.3's disabled button** (AC: #1, #2, #3, #4)
  - [x] Extend `apps/web/src/modules/courses/api.ts`: `getCustomization(accessToken, courseId): Promise<CourseCustomizationResponse | null>` — catches a `NOT_FOUND` `ApiError` and returns `null` rather than throwing (AC #4's "first time" case is not an error state); `saveCustomization(accessToken, courseId, input): Promise<CourseCustomizationResponse>` — lets a `DEPENDENCY_CONFLICT` `ApiError` propagate (the caller needs its `details`, not a swallowed generic message)
  - [x] New `apps/web/src/modules/courses/CustomizePage.tsx` at route `/courses/:id/customize` (`useParams`, same as `CourseDetailPage`). Protected the same `useAuth()`/`Navigate`-to-`/login` way every other page is. On mount: fetch the Course (for its Topic list and `estimatedDurationHours`) and the existing customization (if any) in parallel; if no customization exists yet, default `depth` to `"standard"` and `explanationStyle` to the learner's own account-wide preference (fetched via the already-existing `createUsersApi(apiUrl).getPreferences(...)` from Story 1.4) rather than a hardcoded value — a frontend-only nicety, no new backend call
  - [x] Render: a checkbox per Topic to deselect ("I already know this") and a separate checkbox to mark it priority; a depth `<select>` (overview/standard/deep dive); an explanation-style `<select>` (reusing the same 4 options `PreferencesPage` already offers); a live recalculated estimated-hours display that updates as selections change (re-fetches/recomputes on every change, matching `CatalogPage`'s established "every control change re-queries" convention) — AC #1/#2
  - [x] On save, if the API throws a `DEPENDENCY_CONFLICT` error, show an explicit warning listing each conflict (`"<Topic> requires <Topic>"`) with a "Save anyway" button that resubmits with `force: true`, and a way to cancel/adjust selections instead (AC #3) — never silently swallow or silently force-save
  - [x] `CourseDetailPage.tsx`'s "Customise before starting" button (added disabled in Story 2.3) becomes a real `<Link to={`/courses/${id}/customize`}>` — this is the button Story 2.3's own Dev Notes named as this story's job to wire up. "Start course" remains disabled/untouched — out of scope here too (Epic 3/4)
  - [x] Tests: `apps/web/tests/modules/courses/CustomizePage.test.tsx` (new) — redirects to `/login` with no session; renders all Topics with deselect/priority checkboxes; deselecting a Topic recalculates and displays the new estimated hours (AC #1); changing depth recalculates hours (AC #2); a dependency conflict shows the warning with the specific Topic names and a working "Save anyway" (AC #3); reopening the page after a save pre-loads the exact prior selections (AC #4). Extend `CourseDetailPage.test.tsx` for the now-enabled "Customise before starting" link. Extend `apps/web/tests/modules/courses/api.test.ts` for `getCustomization`/`saveCustomization`

- [x] **Task 5: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-4 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `course_customizations` lives in `services/courses`'s own database, not `services/core`'s — it needs deep read access to the Course's Topic/Concept/prerequisite graph to validate selections and detect conflicts, and doing that from `core` would require a new cross-service call for every save. `userId` is stored as an opaque string (no real FK across service databases), the same pattern every cross-service reference in this codebase already uses.
- **AD-7 (RBAC):** both new routes are auth-only, no `courseHierarchy` permission check — this is the learner's own personal data (their choices about their own course), not a content-ops write. Matches `PUT /users/preferences`'s (Story 1.4) identical precedent, explicitly re-confirmed rather than assumed.
- **AD-17 (no silent failures):** a dependency conflict is a distinguishable error (`DEPENDENCY_CONFLICT`, 409, with structured `details`), never silently dropped or silently force-saved.
- **AD-8 (test mirroring):** see Task 5.
- **AD-9/AD-13 (no cross-service imports):** `services/courses` does not call `services/core` to look up the learner's account-wide `explanationStyle` preference — that merge happens client-side in `apps/web`, which already has access to both services' APIs. Do not add a new courses→core HTTP dependency for this.

### Why Topic-level prerequisites are *derived*, not separately stored

Story 2.1 only modeled prerequisites at the **Concept** level (`concept_prerequisites`, Concept→Concept, within the same Course). This story's AC #3 talks about **Topic**-level dependency ("a Topic that is a prerequisite for another Topic"), which has no dedicated storage anywhere. Building a second, parallel Topic-to-Topic prerequisite model would duplicate data that's already fully derivable: a Topic B depends on Topic A exactly when some Concept in B has a prerequisite Concept that belongs to A. `saveCourseCustomization` computes this at request time from the existing `concept_prerequisites` table (already read by `getCourse`), the same "derive, don't duplicate" reasoning `getCourse`'s own `archived` prerequisite flag already uses.

### Depth multiplier and hours-recalculation formula (documented product default — not named in any FR)

No spec anywhere names exact multiplier values for overview/standard/deep-dive, or how a Course's single `estimatedDurationHours` (Story 2.2) splits across its Topics (no per-Topic duration field exists). This story defines, as an explicit product default:
- **Equal per-Topic weighting:** `hoursPerTopic = course.estimatedDurationHours / totalTopicCount` (no per-Topic duration exists to weight by anything else).
- **Depth multiplier:** `overview = 0.5`, `standard = 1.0`, `deep-dive = 1.5`.
- **Formula:** `estimatedHours = round(hoursPerTopic * selectedTopicCount * depthMultiplier, 1 decimal place)`, where `selectedTopicCount = totalTopicCount - deselectedTopicIds.length`.
- **Guards:** if `course.estimatedDurationHours` is `null`, `estimatedHours` is `null` (never fabricate a number from nothing). If `totalTopicCount === 0`, return `course.estimatedDurationHours` unchanged (nothing to weight or deselect).

### Why "Customise before starting" gets wired now, and "Start course" still doesn't

Story 2.3's own Dev Notes explicitly named this story as the one that makes "Customise before starting" real, while "Start course" depends on Epic 3 (the Board) and Epic 4 (Pacing/Scheduling) infrastructure that still doesn't exist — wiring it here would mean inventing a fake version of either epic's real work. Only the button this story actually owns changes.

### Previous story intelligence (Story 2.3 — read before starting, don't rediscover this)

- **`courses`/`modules`/`topics`/`concepts` schema, `requireTrustedUser`, and `getCourse`'s existing tree-assembly** are reused as-is for reading Topics and computing conflicts — don't rebuild any of that.
- **Review-round lesson from Story 2.3 (twice-confirmed): don't use a value that isn't a real identity as a React list key**, and **validate for exact-duplicate entries at the write layer** (`createConcept`'s `[...new Set(...)]` precedent, reused again by Story 2.3 for `prerequisites`/`outcomes`) — apply the same discipline to this story's own Topic-id arrays (`deselectedTopicIds`/`priorityTopicIds`): dedupe on save, and key any rendered list by index/id, not by value.
- **Review-round lesson from Story 2.3: verify claims about validation/error paths live, don't assume** — e.g. actually curl a malformed id against the running service before deciding whether a fix is needed, rather than trusting a review agent's untested assertion.

### Scope note: what's explicitly OUT of scope for this story

- **A real dated session-by-session schedule** — that's Epic 4's `PlannedSession` (`4.3 - Generate dated session schedule respecting prerequisites`), still `backlog`. This story's "plan" is only the recalculated Topic-selection scope and its hour estimate.
- **"Start course" becoming functional** — Epic 3/4's job, untouched here.
- **A courses→core cross-service call to seed the initial `explanationStyle` default** — handled client-side instead (see Dev Notes above).
- **Per-Topic real duration estimates** — no FR names one; this story's equal-weighting formula is a documented placeholder, not a claim of accuracy.
- **Placement-check-driven auto-deselection** — that's Story 2.5 ("Optional placement check"), still `backlog`; this story's deselection is purely manual/learner-driven.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.4, FR-C-4]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-1-model-the-course-module-topic-concept-hierarchy.md` — `concept_prerequisites`, the schema this story's derived Topic-level conflict detection reads]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-2-catalog-browse-and-search-with-filters.md` — the "invent and document a product default when no spec names one" precedent (duration buckets), reused here for depth multipliers]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-3-course-detail-page.md` — the disabled "Customise before starting" button this story wires up, and its own review-round lessons (dedupe-on-write, index-based list keys) applied proactively here]
- [Source: `packages/shared-types/src/preferences.ts` — `explanationStyleSchema`, reused as-is, not redefined]
- [Source: `services/core/src/modules/users/service.ts` — `updatePreferencesInputSchema`'s all-optional partial-update convention, and `PUT /users/preferences`'s no-RBAC-beyond-auth precedent, both reused here]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- All 5 tasks implemented and tested. New `course_customizations` table (composite unique index on `(user_id, course_id)`, migration `0003_cultured_katie_power.sql`) with `getCourseCustomization`/`saveCourseCustomization` in `services/courses`.
- Topic-level dependency conflicts (AC #3) are computed at request time from the existing `concept_prerequisites` table (Story 2.1) — no new prerequisite model was needed. A conflict blocks the save with `AppError("DEPENDENCY_CONFLICT", ..., 409, conflicts)` unless `force: true` is sent.
- **Design refinement made during implementation, before any review round:** the conflict-recheck guard was changed from "was `deselectedTopicIds` present in this request" to "does the effective deselected set actually differ (by value) from what's already saved." The original, narrower version would have re-blocked an already-force-confirmed conflict forever on any later save that resent the same `deselectedTopicIds` value explicitly (rather than omitting it) — exactly what `apps/web`'s `CustomizePage` does, since it always sends full current state on every save. Caught and fixed while building the frontend against the backend, with a dedicated regression test proving both the omission case and the explicit-same-value case are safe.
- `estimatedHours` recalculation uses a documented product default: equal per-Topic weighting of the Course's total `estimatedDurationHours`, and depth multipliers overview=0.5/standard=1.0/deep-dive=1.5 (no FR names either).
- `apps/web`'s `ApiError` class gained an optional `details` field (previously it only carried `code`/`message`) — needed for `DEPENDENCY_CONFLICT`'s conflict list to actually reach `CustomizePage`'s warning UI; `throwForErrorResponse` now passes the error envelope's `details` through.
- New `CustomizePage` at `/courses/:id/customize`: per-Topic deselect/priority checkboxes, depth/explanation-style selects, a live recalculated estimated-hours display, and a conflict-warning banner with "Save anyway" (force-resubmits) / "Cancel". Defaults `explanationStyle` to the learner's account-wide preference (Story 1.4) when no customization exists yet — a frontend-only merge, no new backend call.
- `CourseDetailPage`'s "Customise before starting" button (added disabled in Story 2.3) is now a real link to this page; "Start course" remains disabled/untouched, per Story 2.3's own scope note.
- Live-verified end-to-end against the running `services/courses` and through the gateway: 404 before any save, a real dependency conflict blocking with the specific Topic names, a successful force-save, correct hour recalculation (12h course → 6h after deselecting one of two Topics → 9h after also switching to deep-dive), and confirmed the depth-only follow-up save did NOT re-trigger the already-confirmed conflict. Test data cleaned up afterward.
- Full monorepo regression: 737 tests passing (18+155+12+199+87+66+200 across all 8 workspaces), `tsc --noEmit` and `eslint .` clean.

### File List

- `packages/shared-types/src/courseCustomization.ts` (new)
- `packages/shared-types/src/index.ts` (modified — barrel exports)
- `packages/shared-types/tests/courseCustomization.test.ts` (new)
- `services/courses/src/db/schema.ts` (modified — new `course_customizations` table)
- `services/courses/drizzle/0003_cultured_katie_power.sql` (new migration)
- `services/courses/src/modules/courses/service.ts` (modified — `getCourseCustomization`, `saveCourseCustomization`, `getCourseTopicGraph`, `computeDependencyConflicts`, `computeEstimatedHours`)
- `services/courses/src/modules/courses/routes.ts` (modified — `GET`/`PUT /courses/:id/customization`)
- `services/courses/tests/modules/courses/customization.test.ts` (new)
- `services/courses/tests/modules/courses/routes.test.ts` (modified)
- `services/gateway/src/coursesProxy.ts` (modified — `GET`/`PUT /courses/:id/customization` proxy)
- `services/gateway/tests/coursesProxy.test.ts` (modified)
- `apps/web/src/shared/apiClient.ts` (modified — `ApiError` gained `details`)
- `apps/web/tests/shared/apiClient.test.ts` (modified)
- `apps/web/src/modules/courses/api.ts` (modified — `getCustomization`, `saveCustomization`)
- `apps/web/src/modules/courses/CustomizePage.tsx` (new)
- `apps/web/src/modules/courses/CourseDetailPage.tsx` (modified — "Customise before starting" now a real link)
- `apps/web/src/modules/courses/index.ts` (modified — barrel export)
- `apps/web/src/app/App.tsx` (modified — `/courses/:id/customize` route)
- `apps/web/src/shared/components.css` (modified — customize-screen styles)
- `apps/web/tests/modules/courses/api.test.ts` (modified)
- `apps/web/tests/modules/courses/CustomizePage.test.tsx` (new)
- `apps/web/tests/modules/courses/CourseDetailPage.test.tsx` (modified)
- `_AI-Agile-Development/implementation-artifacts/deferred-work.md` (modified — review-round deferred findings)

## Senior Developer Review (AI)

Three parallel adversarial reviewers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) ran against the full diff (`c8e08cf..3380a2b`).

**Acceptance Auditor:** all 4 ACs independently verified SATISFIED — "one of the more thoroughly verified stories," with real Postgres-backed integration tests exercising the actual dependency graph and UI tests asserting on rendered DOM/fetch-call counts.

**Confirmed and patched (all three found independently or cross-confirmed):**
1. **An archived Topic remained selectable and diluted the equal-per-Topic hours weighting** (Blind Hunter + Edge Case Hunter, independently) — `getCourseTopicGraph`'s Topic query had no `archivedAt` filter, so an archived Topic still passed id-validation and still counted in the denominator. Fixed by excluding `archivedAt IS NOT NULL` Topics from the graph entirely. Regression test added and proven to fail before / pass after (`customization.test.ts`, "excludes an archived Topic...").
2. **An already force-confirmed conflict re-blocked every later save that touched the deselected set at all** (Edge Case Hunter) — the guard recomputed conflicts over the *entire* effective set whenever it changed, re-surfacing an already-accepted conflict just because an unrelated Topic was also deselected. Fixed to only block on conflicts that are NEW relative to what's already saved (diffing against the previously-saved deselected set's own conflicts). Regression test added and proven to fail before / pass after (`customization.test.ts`, "does not re-block an already-force-confirmed conflict..."), plus a companion test confirming a genuinely new conflict introduced alongside an old one still blocks correctly.
3. **`GET /courses/:id/customization` for a Course that doesn't exist returned the same 404 as "no customization saved yet," with a misleading message** (Blind Hunter) — `getCourseCustomization` checked for a saved row before checking the Course existed, unlike `saveCourseCustomization`'s identical-shaped function which checks course existence first. Fixed by reordering to call `getCourseTopicGraph` (which 404s "course not found") before the row lookup. Regression test added and proven to fail before / pass after.
4. **Minor hardening:** `computeEstimatedHours`'s `selectedTopicCount` gained a `Math.max(0, ...)` clamp — not currently reachable (dedup + membership validation already prevent it), but the other two guards in that function are explicit and this one wasn't.

**Deferred (documented in `deferred-work.md`, not blocking):** dependency-conflict detection is single-hop, not transitive across multi-Topic chains; no CAS/partial-column-update on concurrent saves from two tabs; a Topic can be both deselected and marked priority simultaneously with no rejection.

Post-patch: full monorepo regression (741 tests across 8 workspaces; one `services/core` auth test flaked once under full-suite load, confirmed unrelated to this diff and passing cleanly in isolation and on re-run), `tsc --noEmit` and `eslint .` clean.

## Change Log

- 2026-08-06: Implemented Course customisation before start (Tasks 1-5): shared contract, `services/courses` customization persistence + derived dependency-conflict detection + hour recalculation, gateway proxy, `apps/web` CustomizePage plus wiring Story 2.3's disabled button. Fixed a conflict-recheck design gap found during implementation (value-based, not presence-based). Live-verified end-to-end. Status → review.
- 2026-08-06: Code review round — fixed archived-topic pollution of the graph, incorrect re-blocking of already-confirmed conflicts, and a misleading 404 for a nonexistent course (all three proven via failing-then-passing regression tests), plus a defensive hours-clamp. Deferred 3 non-blocking findings. Status → done.
