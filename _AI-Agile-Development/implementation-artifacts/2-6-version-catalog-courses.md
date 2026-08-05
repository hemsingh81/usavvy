---
baseline_commit: c5d0a02
---

# Story 2.6: Version catalog courses

Status: ready-for-dev

*(Epic 2, FR-C-6. This story is the first in this codebase to need real Course content versioning and the first to need any notion of "a learner has started a Course" — neither exists yet. No Epic 9 (admin/back-office authoring, still `backlog`) publish-workflow UI exists either. This story builds the minimal, honest mechanism its own four ACs require: a version-group model where "publishing a new version" means creating a new `courses` row sharing a group key, a minimal idempotent "access pinning" record (NOT a real Epic 3/4 learning session), and a title-based reconciliation for Story 2.4 customisations across versions — nothing more.)*

## Story

As a learner in progress on a course,
I want to stay on the version I started unless I choose to update,
so that content and progress I've already engaged with doesn't shift under me unexpectedly.

## Acceptance Criteria

1. **Given** a learner starts a Course **When** their access to that course is first recorded **Then** the specific Course version they started is pinned to them, independent of later edits to the catalog Course
2. **Given** a catalog Course that a learner has pinned to an earlier version **When** the content-ops team publishes a new version of that Course **Then** the learner continues to see and study the version they started, while new learners starting the course see the latest published version
3. **Given** a learner pinned to an older Course version **When** they view the course and a newer version is available **Then** they see a clear, dismissible notice offering to update, without the update happening automatically
4. **Given** a learner who opts into updating to the latest version **When** the update is applied **Then** their pin moves to the new version, and any of their prior customisation selections (Story 2.4) referencing Topics removed or renamed in the new version are flagged for review rather than silently dropped

## Tasks / Subtasks

- [ ] **Task 1: Shared contract** (AC: #1, #2, #3, #4)
  - [ ] New `packages/shared-types/src/courseVersioning.ts`: `startCourseResponseSchema = z.object({ pinnedCourseId: z.string(), startedAt: z.string() })`; `updateToLatestVersionResponseSchema = z.object({ pinnedCourseId: z.string(), flaggedTopicTitles: z.array(z.string()) })` — AC #4's "flagged for review" payload, a plain list of Topic titles that no longer exist in the new version and were therefore removed from the learner's saved customisation (see Dev Notes on why title-matching, not id-matching, is the only viable reconciliation strategy here)
  - [ ] Extend `packages/shared-types/src/courseHierarchy.ts`'s `courseResponseSchema` with `isPinnedToOlderVersion: z.boolean()` and `latestVersionId: z.string().nullable()` — AC #2/#3's "which version am I looking at, and is a newer one available" signal, computed once per `GET /courses/:id` call rather than requiring a second round trip
  - [ ] Export everything from the barrel; new `packages/shared-types/tests/courseVersioning.test.ts`; extend `courseHierarchy.test.ts` for the two new response fields

- [ ] **Task 2: `services/courses` — version groups, pinning, and reconciliation** (AC: #1, #2, #3, #4)
  - [ ] Migration adding to `courses`: `version_group_id` (uuid, nullable, references `courses.id`) and `version_number` (integer, not null, default 1). **Naming note:** this table already has a `version` integer column — the pre-existing "bump on every write" optimistic-concurrency counter (Consistency Conventions), unrelated to content versioning. `version_number` is a deliberately distinct name so the two are never confused, the same disambiguation discipline AD-10 already applies to `Session`/`PlannedSession`/`LearningSession`. `version_group_id = NULL` means "this row is the root of its own version group" (its own `id` is the group key) — avoids an awkward self-referential insert for the very first version of every Course
  - [ ] New table `learner_course_pins`: `id` (uuid pk), `user_id` (text, opaque cross-service reference, same convention as `course_customizations.user_id`), `version_group_id` (uuid, references `courses.id` — always a ROOT course id, never `NULL`), `pinned_course_id` (uuid, references `courses.id` — the specific version row), `created_at`/`updated_at`. Composite unique index on `(user_id, version_group_id)` — one pin per learner per version group, same upsert-target pattern Story 2.4 established for `course_customizations`
  - [ ] `createCourseVersion(db, role, courseId, input: CreateCourseInput): Promise<CourseResponse>` — content-ops "publishes a new version": resolves `courseId`'s group key (`versionGroupId ?? id`), finds the current max `versionNumber` in that group, and creates a new `courses` row via the same insert logic `createCourse` already uses, with `versionGroupId` set to the resolved group key and `versionNumber = max + 1`. The new version's Modules/Topics/Concepts are then built via the ALREADY-EXISTING `createModule`/`createTopic`/`createConcept` functions pointed at the new version's id — no new hierarchy-building endpoints needed
  - [ ] `startCourse(db, userId, courseId): Promise<{ pinnedCourseId: string; startedAt: string }>` — AC #1's "access... first recorded," idempotent: if a pin already exists for `(userId, groupKey)`, returns it unchanged (a second "start" is a no-op, not an error); otherwise inserts a new pin at the REQUESTED `courseId` (not necessarily the latest — a learner starting an older catalog listing they found some other way still pins to what they actually started). Explicitly NOT a real learning-session start (Epic 3/4's future job) — see Dev Notes
  - [ ] `resolveCourseForLearner(db, userId, requestedCourseId): Promise<CourseResponse>` — the new `GET /courses/:id` resolution path: looks up the requested course's group key, checks for an existing pin, and returns `getCourse`'s (Story 2.1, unchanged) full tree for the PINNED version if one exists, else for the requested version — with `isPinnedToOlderVersion`/`latestVersionId` computed by comparing against the group's max `versionNumber` row. A learner with no pin yet (hasn't started) always sees exactly the version they requested (AC #2's "new learners... see the latest," trivially true since the catalog only ever surfaces the latest — see below)
  - [ ] `updateCourseVersionPin(db, userId, courseId): Promise<{ pinnedCourseId: string; flaggedTopicTitles: string[] }>` — AC #4: resolves the group's latest version, re-points the learner's pin to it, then reconciles their existing `course_customizations` row (Story 2.4) if one exists for the OLD pinned version: for each of their `deselectedTopicIds`/`priorityTopicIds`, match the OLD Topic's title against the NEW version's Topic titles; a match carries the reference forward (using the NEW version's Topic id — the old id is meaningless in the new version's own tree); no match means the Topic was removed or renamed — drop that specific id from the persisted set (an unmatched, foreign-to-the-new-version id would otherwise make every future `saveCourseCustomization` call fail its own topic-membership validation) and add its OLD title to the returned `flaggedTopicTitles` list. "Flagged for review, not silently dropped" (AC #4) is satisfied by this list being explicitly returned and surfaced to the learner, not by keeping a now-invalid reference forever
  - [ ] `searchCourses` (Story 2.2) extended: only the highest-`versionNumber` `published` row per version group is ever returned — a raw-SQL correlated subquery (`c.id = (SELECT ... ORDER BY version_number DESC, id DESC LIMIT 1)`), matching this function's existing raw-`sql` escape-hatch convention. A version history must never multiply catalog listings
  - [ ] New routes: `POST /courses/:id/versions` (same RBAC as `createCourse` — content-ops only); `POST /courses/:id/start` (auth-only, any role, matches `GET /courses/:id`'s existing precedent); `POST /courses/:id/update-to-latest` (auth-only). `GET /courses/:id` now calls `resolveCourseForLearner` instead of `getCourse` directly — `getCourse` itself is unchanged and still used internally
  - [ ] Tests: creating a version bumps `versionNumber` within the same group and leaves the original version's own Modules/Topics/Concepts untouched; starting a course pins the exact requested version, idempotently; `GET /courses/:id` transparently resolves to a learner's pinned version regardless of which version id was requested, with `isPinnedToOlderVersion`/`latestVersionId` correct in both the pinned-to-old and no-pin-yet cases; catalog search never returns more than one row per version group and always the latest published one; updating to latest moves the pin and correctly reconciles a customisation — a same-titled Topic carries its reference forward, a removed/renamed Topic's old reference is dropped AND named in `flaggedTopicTitles`; a learner with no saved customisation updates cleanly with an empty flagged list

- [ ] **Task 3: `services/gateway`** (AC: #1, #2, #3, #4)
  - [ ] New `POST /courses/:id/versions`, `POST /courses/:id/start`, `POST /courses/:id/update-to-latest` proxy routes — `requireAuth`, `requireValidId`, matching every other route in `coursesProxy.ts`
  - [ ] Extend `services/gateway/tests/coursesProxy.test.ts`: each requires authentication (401); each forwards the validated id (and body, where applicable) correctly; a malformed id is rejected before any forward call

- [ ] **Task 4: `apps/web`** (AC: #1, #2, #3, #4)
  - [ ] Extend `apps/web/src/modules/courses/api.ts`: `startCourse`, `updateToLatestVersion` calls
  - [ ] `CourseDetailPage.tsx`: "Start course" (disabled since Story 2.3/2.4) becomes a real button calling `startCourse` and showing a simple confirmation state ("You started this course") — explicitly NOT a navigation into any real learning session, which doesn't exist yet (Epic 3/4). When `isPinnedToOlderVersion` is true, show a dismissible notice ("A newer version of this course is available") with an "Update" action calling `updateToLatestVersion`; on a non-empty `flaggedTopicTitles` response, show which Topics need review with a link to `/courses/:id/customize` (AC #4)
  - [ ] Tests: `CourseDetailPage.test.tsx` extended — "Start course" fires the start call and shows confirmation; the update notice renders only when `isPinnedToOlderVersion` is true and is dismissible; clicking "Update" surfaces flagged Topics when the response names any, and shows nothing extra when the list is empty

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-4 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** version groups, pins, and reconciliation all live in `services/courses` — no new service, no new database.
- **AD-7 (RBAC):** `POST /courses/:id/versions` reuses `createCourse`'s existing content-ops-only gate (`can(role, "create", "courseHierarchy")`) — publishing a new version is exactly as privileged as creating the first one. `start`/`update-to-latest` are auth-only, matching every personal-data route since Story 2.4.
- **AD-17 (no silent failures):** AC #4 is precisely an AD-17 case — a removed/renamed Topic reference is never silently kept (would break future saves) nor silently vanished (the learner would never know); it's explicitly named in the response.
- **AD-8 (test mirroring):** see Task 5.
- **AD-10-style naming discipline:** the new `version_number` column is deliberately NOT named `version`, to avoid colliding with the pre-existing optimistic-concurrency `version` counter every table in this schema already has.

### Why a new version is a whole new `courses` row, not an edit to the existing one

No update/edit endpoint exists anywhere for Course/Module/Topic/Concept content — only `createCourse`/`createModule`/`createTopic`/`createConcept` (write-once at creation) and `archiveModule` (soft-delete) exist. Building real in-place content editing is Epic 9's own future authoring-workflow story ("content moves through visibly distinct draft → in-review → published states," still `backlog`) — this story doesn't need it. Modeling "a new version" as an entirely new `courses` row (with its own fresh Modules/Topics/Concepts, built via the exact same creation endpoints every prior story already uses) requires zero new content-mutation machinery, at the cost of Topic/Concept ids never being stable across versions — which is exactly why AC #4's reconciliation has to work by Topic *title*, not id (see below).

### Why AC #4's reconciliation matches by Topic title, not id

Because a new version's Topics are entirely new rows (new ids), a learner's `course_customizations` (Story 2.4) `deselectedTopicIds`/`priorityTopicIds` — saved against the OLD version's Topic ids — can never literally match anything in the new version's Topic set. The only meaningful signal available for "is this the same Topic, just carried into the new version" is its title. A title match carries the reference forward (remapped to the new version's Topic id, since `saveCourseCustomization`'s existing validation requires ids belonging to the CURRENT course); no match means the Topic was renamed or removed, and its OLD title is reported in `flaggedTopicTitles` rather than the id being silently kept (which would break every future save) or silently dropped with no notice (which is exactly what AC #4 forbids).

### Why "Start course" only records a pin, not a real learning session

Epic 3 (the Board) and Epic 4 (Pacing/Scheduling) — the actual mechanics of "starting" and studying a course — are both still entirely `backlog`. AC #1 only requires that "access... is first recorded" and a version gets pinned; it does not require a real session to begin. Enabling "Start course" to do only that, with a plain confirmation state and no navigation into machinery that doesn't exist, satisfies the letter of AC #1 without fabricating Epic 3/4's own future work — the same restraint every prior Epic 2 story applied to whatever later epic's territory it bordered.

### Previous story intelligence (Story 2.5 — read before starting, don't rediscover this)

- **`course_customizations`, `getCourseTopicGraph`, and the composite-unique-index upsert pattern** (Story 2.4) are reused as-is; `learner_course_pins` follows the identical `(user_id, version_group_id)` unique-index-as-upsert-target shape.
- **Review-round lesson from Story 2.4/2.5 (repeated across both): dedupe id/title arrays at the write layer, and be careful that a "recompute on every touch" guard doesn't re-trigger something already resolved.** Apply the same discipline to `flaggedTopicTitles` (dedupe) and to pin resolution (don't re-flag a Topic the learner has already been shown once, if that ever becomes a persisted concept — for this story a fresh flagged list on every `update-to-latest` call is fine, since it's a one-time action, not a recurring auto-save).
- **Review-round lesson from Story 2.5: verify a stateless/derived computation never accidentally persists, and that stale client-held state (e.g. router state) gets cleared once consumed.** Not directly applicable here (this story's writes are real, intentional pin/version mutations), but the same rigor applies to the dismissible update-notice: dismissing it must be pure client-side UI state, never mistaken for "the learner updated."

### Scope note: what's explicitly OUT of scope for this story

- **A real content-authoring/publish-workflow UI** (draft → in-review → published) — Epic 9's own future story; `POST /courses/:id/versions` is a bare API a content-ops caller uses directly, no admin console screen.
- **Copying/cloning the previous version's content forward automatically** — no AC asks for this; a new version's Modules/Topics/Concepts are built via the existing creation endpoints from scratch, same as any new Course.
- **A real Epic 3/4 learning session beginning on "Start course"** — see Dev Notes above.
- **Migrating/reconciling anything beyond `course_customizations`** — no other learner-scoped, Topic-id-referencing data exists yet in this codebase to reconcile.
- **Automatic, non-opt-in version updates** — AC #3 explicitly forbids this; updating is always a learner-initiated action.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.6, FR-C-6]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1 (scaffold-on-demand, confirms Epic 9's authoring UI and Epic 3/4's learning session don't exist yet), AD-7, AD-8, AD-10 (naming-collision discipline, reused for `version_number` vs. the pre-existing `version` column), AD-14, AD-17]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-1-model-the-course-module-topic-concept-hierarchy.md` — `getCourse`'s unchanged tree assembly, reused internally by `resolveCourseForLearner`]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-4-course-customisation-before-start.md` — `course_customizations`'s schema and upsert pattern, reused for `learner_course_pins` and reconciled by `updateCourseVersionPin`]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

### File List
