---
baseline_commit: 5a19983
---

# Story 2.5: Optional placement check

Status: review

*(Epic 2, FR-C-5. Reuses Story 2.1's existing `checkpointQuestions` (Concept-level, `{question: string}` only — no answer/grading shape, by that story's own explicit design) as the placement check's question pool, and Story 2.4's `course_customizations` table as where a completed placement check's results land. No AI generation is used or needed: `GenerationPort` (architecture's own binding list) is scoped to `board-orchestration`/`ingestion`/`assignments`, none of which exist yet, and `courses` isn't a listed consumer at all. Scoring is a small, self-contained, self-assessment mechanism — the learner rates their own mastery per question — not real auto-grading, which is explicitly Epic 6's future concern per Story 2.1's own Dev Notes.)*

## Story

As a learner,
I want an optional 5–8 question placement check before starting a course,
so that topics I've already mastered are automatically deselected and my starting difficulty is set appropriately.

## Acceptance Criteria

1. **Given** a learner on the course customisation screen **When** they choose to take the placement check **Then** they are presented with 5–8 questions covering a representative sample of the course's Topics
2. **Given** the learner has completed the placement check **When** their answers are scored **Then** Topics corresponding to demonstrated mastery are automatically deselected in the course customisation, and a starting difficulty tier is set for the remaining Topics **And** the learner can see and manually override any auto-deselection before confirming
3. **Given** a learner who skips the placement check **When** they proceed to customisation or start **Then** no Topics are auto-deselected and the course's default starting difficulty is used
4. **Given** a learner who scores at the minimum on every placement question **When** results are applied **Then** no Topics are deselected and the starting difficulty defaults to the course's easiest tier, without error

## Tasks / Subtasks

- [x] **Task 1: Shared contract** (AC: #1, #2, #3, #4)
  - [x] New `packages/shared-types/src/placementCheck.ts`: `placementCheckQuestionSchema = z.object({ topicId, topicTitle, conceptId, question })`; `placementCheckQuestionsResponseSchema = z.array(placementCheckQuestionSchema)`; `placementCheckAnswerInputSchema = z.object({ topicId, conceptId, masteryDemonstrated: z.boolean() })` — a binary self-assessment ("I know this" / "I don't"), not a graded free-response answer, since `checkpointQuestions` (Story 2.1) has no answer key and none is being invented here; `scorePlacementCheckInputSchema = z.object({ answers: z.array(placementCheckAnswerInputSchema) })`; `placementCheckProposalSchema = z.object({ proposedDeselectedTopicIds: z.array(z.string()), proposedStartingDifficultyTier: difficultyTierSchema })` (imports `difficultyTierSchema` from `./courseHierarchy.js`)
  - [x] Extend `packages/shared-types/src/courseCustomization.ts`'s `courseCustomizationResponseSchema` with `startingDifficultyTier: difficultyTierSchema.nullable()`, and `saveCourseCustomizationInputSchema`/`SaveCourseCustomizationInput` with `startingDifficultyTier: difficultyTierSchema.optional()` — the learner can set/override this the same manual way they already set `depth`/`explanationStyle` (AC #2's "can... manually override"); `null` means "never set — falls back to the Course's own `level` at display time" (AC #3)
  - [x] Export everything from the barrel; new `packages/shared-types/tests/placementCheck.test.ts`; extend `courseCustomization.test.ts` for the new field

- [x] **Task 2: `services/courses` — question sampling and scoring** (AC: #1, #2, #3, #4)
  - [x] Migration adding `starting_difficulty_tier` (text, nullable, `$type<DifficultyTier>()`) to the existing `course_customizations` table (Story 2.4) — same incremental-extension pattern every prior Epic 2 story used
  - [x] `getPlacementCheckQuestions(db, courseId): Promise<PlacementCheckQuestion[]>` — reads the same Module→Topic→Concept tree `getCourse`/`getCourseTopicGraph` already read; for each Topic (position order, live/non-archived only — reuse `getCourseTopicGraph`'s existing archived-Topic exclusion, Story 2.4's own review-round fix), picks the FIRST checkpoint question found on any of that Topic's Concepts (position order), skipping Topics with none. Caps the result at 8; if the course has fewer than 5 usable questions, returns however many exist rather than fabricating placeholders — a content-completeness gap, not a bug this story fixes
  - [x] `scorePlacementCheck(db, courseId, answers: PlacementCheckAnswerInput[]): Promise<PlacementCheckProposal>` — a **pure, stateless computation, no database write**: validates every `topicId`/`conceptId` pair actually belongs to the course (reusing `getCourseTopicGraph`), collects `topicId`s where `masteryDemonstrated === true` into `proposedDeselectedTopicIds` (deduped), and computes `proposedStartingDifficultyTier` from `masteryRatio = masteryCount / answers.length`: `0` → `"beginner"` (AC #4's exact minimum-score case), `1` → `"advanced"`, anything else → `"intermediate"` — a documented product default (no FR names exact thresholds), same class of invented-but-documented constant as Story 2.2's duration buckets and Story 2.4's depth multipliers. `answers.length === 0` also resolves to `"beginner"` (treated the same as "no mastery demonstrated," not a divide-by-zero)
  - [x] Extend `createCourse`... no — extend `saveCourseCustomization`/`getCourseCustomization`/`toCourseCustomizationResponse` (Story 2.4, `service.ts`) to persist/return `startingDifficultyTier` the identical way `depth`/`explanationStyle` already are (`input.startingDifficultyTier ?? existing?.startingDifficultyTier ?? null` — note the fallback is `null`, not a fabricated tier, unlike `depth`'s `"standard"` default; AC #3 requires the *Course's* `level` be used when nothing was ever set, which only the response consumer — the frontend, which already has the Course loaded — can apply, not this service function in isolation)
  - [x] `GET /courses/:id/placement-check` route — auth-only (matches `GET /courses/:id/customization`'s identical precedent, this is a personal-progress-facing read, not a `courseHierarchy` content-ops action)
  - [x] `POST /courses/:id/placement-check/score` route — auth-only, stateless (no persistence — AC #2's "can see and manually override... before confirming" requires the proposal NOT be silently saved; the learner applies it for real through the existing `PUT .../customization` from Story 2.4)
  - [x] Tests: a course with several Topics each carrying checkpoint questions returns a representative, position-ordered, ≤8-question sample, skipping Topics with none and excluding archived Topics (AC #1); scoring an all-mastery answer set proposes every corresponding Topic deselected and `"advanced"` (AC #2); scoring an all-`false` answer set proposes zero deselections and `"beginner"` (AC #4, the story's own literal edge case); a mixed answer set proposes `"intermediate"`; scoring never writes to the database (assert no `course_customizations` row exists afterward); an invalid topic/concept id in an answer is rejected, naming it; `saveCourseCustomization`/`getCourseCustomization` round-trip `startingDifficultyTier` the same way `depth` already does

- [x] **Task 3: `services/gateway`** (AC: #1, #2, #3, #4)
  - [x] New `GET /courses/:id/placement-check` and `POST /courses/:id/placement-check/score` proxy routes in `coursesProxy.ts` — `requireAuth`, `requireValidId`, mirroring every other route in this file
  - [x] Extend `services/gateway/tests/coursesProxy.test.ts`: both require authentication (401); both forward the validated id (and, for the POST, the body) correctly; a malformed id is rejected before any forward call

- [x] **Task 4: `apps/web` — the Placement Check screen, and CustomizePage's proposal-review flow** (AC: #1, #2, #3, #4)
  - [x] Extend `apps/web/src/modules/courses/api.ts`: `getPlacementCheckQuestions(accessToken, courseId): Promise<PlacementCheckQuestion[]>`; `scorePlacementCheck(accessToken, courseId, answers): Promise<PlacementCheckProposal>`
  - [x] New `apps/web/src/modules/courses/PlacementCheckPage.tsx` at route `/courses/:id/placement-check`. On mount, fetches the question set; if empty, shows an explicit "No placement check available for this course yet" message (AD-17 — never a blank/broken quiz) with a link back to `/courses/:id/customize`. Otherwise renders each question with two buttons — "I know this" / "I'm not sure yet" — collecting one `PlacementCheckAnswerInput` per question (AC #1). On submit, calls `scorePlacementCheck`, then navigates to `/courses/:id/customize` passing the resulting `PlacementCheckProposal` via React Router's `navigate(path, { state })` — **not** saved yet (AC #2's confirm-before-applying requirement)
  - [x] `CustomizePage.tsx` (Story 2.4) reads `useLocation().state` for an incoming `PlacementCheckProposal`. When present on initial load, the READY view's `deselectedTopicIds` and `startingDifficultyTier` are seeded from the proposal instead of (or merged over) whatever was already saved — `priorityTopicIds`/`depth`/`explanationStyle` are untouched, the placement check has no opinion on them. Shows a distinguishing banner ("Placement check results — review below, then confirm") with a "Confirm results" button that calls the same existing `save()` function with the current (possibly learner-edited) view state — reusing Story 2.4's save/conflict-handling path entirely, not a second one. Every individual topic checkbox remains independently clickable/editable before or instead of confirming, satisfying AC #2's "manually override" requirement with no new interaction model
  - [x] `CustomizePage.tsx` gains a "Take placement check" link to `/courses/:id/placement-check`, and a "Starting difficulty" display: `view.startingDifficultyTier ?? view.course.level` (AC #3's skip-path fallback — computed here, in the one place that already has both values, not invented server-side) with a manual three-tier override `<select>` (AC #2's override, reusing `difficultyTierSchema`'s existing 3 values, matching every other select's established pattern in this codebase)
  - [x] Tests: `apps/web/tests/modules/courses/PlacementCheckPage.test.tsx` (new) — redirects to `/login` with no session; renders each fetched question with both response buttons (AC #1); shows the "not available" message for an empty question set rather than a broken quiz; submitting navigates to the customize screen carrying the scored proposal. Extend `CustomizePage.test.tsx`: an incoming proposal pre-fills the topic checkboxes and starting-difficulty display but does NOT save until "Confirm results" (or an individual control) is clicked (AC #2); with no incoming proposal and no saved `startingDifficultyTier`, the Course's own `level` is displayed (AC #3). Extend `apps/web/tests/modules/courses/api.test.ts` for the two new calls

- [x] **Task 5: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-4 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `starting_difficulty_tier` extends `course_customizations`, already owned by `services/courses` (Story 2.4) — no new entity, no new database. The placement-check question/score endpoints are pure reads/computations over data `services/courses` already owns (Concepts' `checkpointQuestions`, the Topic/prerequisite graph).
- **AD-7 (RBAC):** both new routes are auth-only, matching `GET`/`PUT .../customization`'s identical Story 2.4 precedent — personal, not content-ops.
- **AD-17 (no silent failures):** a course with no usable checkpoint questions shows an explicit "not available" state (AC-adjacent, matching Story 2.3's identical sample-asset precedent), never a blank/broken quiz.
- **AD-2 (GenerationPort) does NOT apply to this story.** `GenerationPort`'s architecture binding list is `board-orchestration`, `ingestion`, `assignments` — `courses` is not a listed consumer, and none of those three services are scaffolded yet (AD-1's scaffold-on-demand). Building any AI-generated or AI-graded placement mechanism here would both violate that binding and pre-build Epic 6's ("auto-generate calibrated assignments," "deterministically auto-grade objective items") own future work. This story's scoring is a small, self-contained, deterministic self-assessment — the learner rates their own mastery per question; there is no correct-answer key anywhere in this codebase for `checkpointQuestions`, by Story 2.1's own explicit design ("no answer/grading shape invented here, that's Epic 6's concern").
- **AD-8 (test mirroring):** see Task 5.

### Why scoring is stateless, not a third write to `course_customizations`

AC #2 explicitly requires the learner to "see and manually override any auto-deselection **before confirming**." If `POST .../placement-check/score` persisted its result directly, an unwanted auto-deselection would already be saved before the learner ever got a chance to review it — the opposite of what the AC asks for. Keeping scoring a pure computation (no DB write) that hands its proposal to the *already-existing* `PUT .../customization` (Story 2.4) for the learner to actually commit is the minimal design that satisfies "review, then confirm" without inventing a second persistence path or a draft/staging table.

### Why the difficulty-tier thresholds are documented constants, not a formula from the PRD

No FR or epics.md story names exact scoring thresholds — only the two boundary behaviors AC #4 states explicitly (all-minimum → easiest tier) and AC #2 implies (mastery demonstrated → a "set" tier, direction unspecified). `masteryRatio` of `0`/`1`/anything-else mapping to beginner/advanced/intermediate is this story's own invented, documented default — same class of decision as Story 2.2's duration-bucket boundaries and Story 2.4's depth multipliers, made the same way: pick something defensible, name it explicitly, don't leave it silently unbucketed.

### Previous story intelligence (Story 2.4 — read before starting, don't rediscover this)

- **`course_customizations`, `getCourseTopicGraph` (including its Story-2.4-review-round archived-Topic exclusion), and the `effective = input ?? existing ?? default` partial-update merge pattern** are all established in `services/courses/src/modules/courses/service.ts` — extend them, don't duplicate.
- **Review-round lesson from Story 2.4: dedupe id arrays at the write layer, and diff against previously-accepted state rather than re-blocking on every touch.** Not directly applicable to `scorePlacementCheck` (it doesn't write anything), but `proposedDeselectedTopicIds` should still be deduped defensively before being handed to the frontend, which will eventually route it through `saveCourseCustomization`'s own (already-deduping) write path anyway.
- **Review-round lesson from Story 2.4: a stateless/derived computation must not be conflated with "the row doesn't exist" or any other DB-shaped 404.** `scorePlacementCheck` has no "not found" case of its own beyond an invalid topic/concept id (`VALIDATION_ERROR`, matching `saveCourseCustomization`'s identical naming-the-invalid-id convention) — don't invent a spurious 404 path for it.
- **CustomizePage's existing `save()`, conflict-handling, and per-control auto-save convention** (Story 2.4) is reused as-is for actually persisting a confirmed placement-check proposal — this story adds a new way to *seed* that screen's initial state, not a new way to *save* it.

### Scope note: what's explicitly OUT of scope for this story

- **Real AI-generated placement questions or AI-graded free-response answers** — `GenerationPort` doesn't apply here (see Dev Notes above); questions are sampled from existing `checkpointQuestions`, and scoring is a binary self-assessment.
- **A dedicated placement-check results/history record** — the proposal is ephemeral (computed, shown, either applied via the existing customization save or discarded); nothing beyond the final `course_customizations` row records that a placement check ever happened.
- **Per-Concept (rather than per-Topic) mastery/difficulty tracking** — Epic 4/6's future concern (mastery/progress model); this story only sets one course-level `startingDifficultyTier` per learner per course.
- **Retaking or comparing multiple placement-check attempts** — no AC asks for history; each attempt simply produces a fresh proposal the learner can apply or ignore.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.5, FR-C-5]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1 (scaffold-on-demand, confirms `generation`/`assignments`/`board-orchestration` don't exist yet), AD-2 (`GenerationPort`'s binding list, confirms `courses` isn't a consumer), AD-7, AD-8, AD-14, AD-17]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-1-model-the-course-module-topic-concept-hierarchy.md` — `checkpointQuestions`' own explicit "no answer/grading shape invented here" scope note, directly informing this story's self-assessment design]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-4-course-customisation-before-start.md` — `course_customizations`, `getCourseTopicGraph`, and the partial-update merge pattern this story extends]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- All 5 tasks implemented and tested. `course_customizations` gained `startingDifficultyTier` (migration `0004_adorable_paibok.sql`); `saveCourseCustomization`/`getCourseCustomization` extended to persist/return it exactly like `depth`/`explanationStyle`, except the fallback is `null` (not a fabricated default) since AC #3's Course-level fallback is applied by the frontend, the one place that already has both values.
- `getPlacementCheckQuestions` samples one representative checkpoint question per live (non-archived) Topic, position-ordered, capped at 8 — reusing Story 2.1's existing `checkpointQuestions` data with zero new question-authoring or AI infrastructure.
- `scorePlacementCheck` is a pure, stateless computation (no database write) — verified directly by a test asserting no `course_customizations` row exists after scoring. Mastery-ratio thresholds (`0` → beginner, `1` → advanced, else → intermediate) are a documented product default, matching Story 2.2/2.4's precedent for inventing-and-naming values no FR specifies.
- `apps/web`'s new `PlacementCheckPage` presents each question with a binary self-assessment ("I know this" / "I'm not sure yet"), and on submit navigates to `CustomizePage` carrying the scored `PlacementCheckProposal` via React Router state — never auto-saved. `CustomizePage` seeds its `deselectedTopicIds`/`startingDifficultyTier` from an incoming proposal, shows a distinguishing banner with a "Confirm results" button, and lets every individual control remain independently editable before or instead of confirming (AC #2's "manually override" requirement, satisfied via the same save path Story 2.4 already built — no second persistence mechanism).
- `CustomizePage` also gained a "Take placement check" link and a "Starting difficulty" select (falling back to the Course's own `level` when nothing has been set — AC #3's skip-path default).
- Live-verified end-to-end: sampled two real checkpoint questions, scored a mixed answer set (proposing the correct deselection + "intermediate"), confirmed scoring persisted nothing (404 on customization read afterward), then applied the proposal for real via the existing save endpoint and confirmed the recalculated hours — both directly against `services/courses` and through the gateway with a real JWT (including the empty-answers → "beginner" edge case, AC #4). Test data cleaned up afterward.
- Full monorepo regression: 778 tests passing (18+168+12+204+92+84+200 across all 8 workspaces), `tsc --noEmit` and `eslint .` clean.

### File List

- `packages/shared-types/src/placementCheck.ts` (new)
- `packages/shared-types/src/courseCustomization.ts` (modified — `startingDifficultyTier` added to both schemas)
- `packages/shared-types/src/index.ts` (modified — barrel exports)
- `packages/shared-types/tests/placementCheck.test.ts` (new)
- `packages/shared-types/tests/courseCustomization.test.ts` (modified)
- `services/courses/src/db/schema.ts` (modified — new `starting_difficulty_tier` column)
- `services/courses/drizzle/0004_adorable_paibok.sql` (new migration)
- `services/courses/src/modules/courses/service.ts` (modified — `startingDifficultyTier` plumbed through `saveCourseCustomization`/`getCourseCustomization`/`toCourseCustomizationResponse`; new `getPlacementCheckQuestions`, `scorePlacementCheck`, `difficultyTierFromMasteryRatio`)
- `services/courses/src/modules/courses/routes.ts` (modified — `GET /courses/:id/placement-check`, `POST /courses/:id/placement-check/score`)
- `services/courses/tests/modules/courses/placementCheck.test.ts` (new)
- `services/courses/tests/modules/courses/customization.test.ts` (modified)
- `services/courses/tests/modules/courses/routes.test.ts` (modified)
- `services/gateway/src/coursesProxy.ts` (modified — two new proxy routes)
- `services/gateway/tests/coursesProxy.test.ts` (modified)
- `apps/web/src/modules/courses/api.ts` (modified — `getPlacementCheckQuestions`, `scorePlacementCheck`)
- `apps/web/src/modules/courses/PlacementCheckPage.tsx` (new)
- `apps/web/src/modules/courses/CustomizePage.tsx` (modified — proposal-review flow, Starting difficulty select, "Take placement check" link)
- `apps/web/src/modules/courses/index.ts` (modified — barrel export)
- `apps/web/src/app/App.tsx` (modified — `/courses/:id/placement-check` route)
- `apps/web/tests/modules/courses/api.test.ts` (modified)
- `apps/web/tests/modules/courses/PlacementCheckPage.test.tsx` (new)
- `apps/web/tests/modules/courses/CustomizePage.test.tsx` (modified)

## Change Log

- 2026-08-06: Implemented Optional placement check (Tasks 1-5): shared contract, `services/courses` question sampling + stateless scoring + `startingDifficultyTier` persistence, gateway proxy, `apps/web` PlacementCheckPage plus CustomizePage's proposal-review flow. Live-verified end-to-end. Status → review.
