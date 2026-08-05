---
baseline_commit: 8932130
---

# Story 1.11: Activity History

Status: review

*(Epic 1, FR-A-11. This is the last story in Epic 1's own list. Its own epics.md note is explicit: "this story defines the Activity History surface and reads from data Epic 1 already owns (login/account events); as Epic 3, Epic 6, and Epic 7 ship, each contributes its own entries via their own already-existing events/records... rather than this story depending on those epics existing first." None of Epic 3 (board-orchestration/`LearningSession`/`SessionEvent`), Epic 6 (assignments/`AssignmentSubmission`), or Epic 7 (cohorts) exist anywhere in this codebase yet — confirmed by grep, `services/core/src/db/schema.ts` has no such tables, and per the architecture's own "scaffold-on-demand" rule those services' folders don't exist until their epic starts. This story's own AC #3 anticipates exactly this: "only the activity types from currently-shipped epics appear... the timeline never errors or shows a placeholder for a type that doesn't exist yet." Concretely today, that means the timeline is *always* empty in real usage — this story builds the surface, the extensible shape, and the empty state, not any populated example, since there is nothing genuine to populate it with yet.)*

## Story

As a learner,
I want to review a chronological history of my board sessions, assignment attempts, and cohort sessions,
so that I can look back at anything I've done, anytime.

## Acceptance Criteria

1. **Given** a logged-in learner opens Activity History **Then** they see a reverse-chronological timeline of their recorded activity, each entry showing its type, date, and a link back to its source (a board session entry links to that session's Transcript; an assignment entry links to its feedback; a cohort session entry links to its recording if available)
2. **Given** a learner has no recorded activity yet **Then** an explicit empty state is shown, not a blank panel
3. **Given** Epic 3/6/7 have not yet shipped **When** a learner opens Activity History **Then** only the activity types from currently-shipped epics appear — the timeline never errors or shows a placeholder for a type that doesn't exist yet

## Tasks / Subtasks

- [x] **Task 1: Shared contract — a generic, extensible `ActivityHistoryEntry` shape** (AC: #1, #3)
  - [x] New `packages/shared-types/src/activityHistory.ts`: `activityHistoryEntrySchema = z.object({ type: z.string(), occurredAt: z.string(), label: z.string(), sourceUrl: z.string() })`. Deliberately **not** a discriminated union with hardcoded `"board_session"`/`"assignment"`/`"cohort_session"` variants — those concrete shapes belong to Epic 3/6/7's own future stories, which don't exist yet; inventing them now would be exactly the kind of "pre-build for a story that hasn't started" this codebase's own architecture doc explicitly warns against (see Dev Notes). `type`/`label`/`sourceUrl` are generic strings a future per-epic contributor fills in, not an enum this story owns
  - [x] `activityHistoryResponseSchema = z.array(activityHistoryEntrySchema)` — reverse-chronological order is a service-layer/query-layer contract (AC #1), not something the schema itself enforces
  - [x] Export both from `packages/shared-types/src/index.ts`'s barrel
  - [x] `packages/shared-types/tests/activityHistory.test.ts` (new): valid shape accepted; empty array accepted; a shape missing any field rejected

- [x] **Task 2: `services/core` — `getActivityHistory` (returns `[]` today, by design) + route** (AC: #1, #2, #3)
  - [x] New `getActivityHistory(db: Db, userId: string): Promise<ActivityHistoryEntry[]>` in `services/core/src/modules/users/service.ts` (same file as every other `auth/users`-owned read — Epic 1's own intro names Activity History as one of the things this epic owns, alongside the Theme Picker and Notification Center already built in Stories 1.9/1.10). Per AD-18, this is a **read-only cross-module aggregator** — it reads `SessionEvent`/`AssignmentSubmission`/cohort attendance data owned by `board-orchestration`/`assignments`/`cohorts` respectively, never duplicating it into a new table here. Since none of those three services exist yet, the function's body today is a documented no-op that returns `[]` — **this is the correct, honest implementation for this story, not a stub to "finish later" within this story's own scope.** The comment above it must say plainly: this is where Story 3.x/6.x/7.x each add their own read once their owning service and its HTTP contract exist; nothing here should attempt to guess at those shapes in advance
  - [x] `GET /users/activity-history` in `services/core/src/modules/users/routes.ts` — `requireTrustedUser` → `getActivityHistory`, identical shape to every other read-only `/users/*` route
  - [x] Tests: `services/core/tests/modules/users/activityHistory.test.ts` (new, DB-integration mirroring this module's existing test style) — `getActivityHistory` returns `[]` for any user (the only real, correct behavior available today); extend `routes.test.ts` — `GET /users/activity-history` requires authentication (401), returns `200` with `[]` for a learner with no recorded activity

- [x] **Task 3: `services/gateway`** (AC: #1, #2, #3)
  - [x] Add `GET /users/activity-history` to `services/gateway/src/authProxy.ts`, identical `requireAuth` + `forwardToCore` + `trustedHeaders` shape as every other GET route (`/users/preferences`, `/users/notifications`, etc.) — no path parameter this time, so none of Story 1.10's own review-round `id`-validation concerns apply here
  - [x] Extend `services/gateway/tests/authProxy.test.ts` — requires authentication (401, `forwardToCore` never called); forwards trusted headers and mirrors the response on success

- [x] **Task 4: `apps/web` — the Activity History page** (AC: #1, #2, #3)
  - [x] New `apps/web/src/modules/users/ActivityHistoryPage.tsx` at route `/activity-history`, reachable directly (no nav chrome wires it up yet — the same already-accepted gap `PreferencesPage`/`ProfilePage` documented for themselves in Stories 1.3/1.9; `EXPERIENCE.md` says this page belongs behind a "Profile menu" that doesn't exist as a built component anywhere in this codebase yet, and building one is out of scope here — see Scope note). Protected: redirects to `/login` with no session, same `useAuth()`/`Navigate` pattern every other protected page already uses
  - [x] On mount (session exists), fetch `GET /users/activity-history` once via a new `getActivityHistory` method on `createUsersApi` — same load-effect + `cancelled`-guard convention as every other page's own mount fetch
  - [x] Render: if the fetched list is empty, an explicit empty state (e.g. `<p role="status">No activity yet</p>`) — **never** a blank panel (AC #2, the one state genuinely reachable in production today). If non-empty (a live scenario only a test fixture can exercise until Epic 3/6/7 ships), render a vertical timeline: each entry shows its `label`, a formatted `occurredAt` date, and an `<a href={entry.sourceUrl}>` link back to its source, styled per `DESIGN.md`'s `activity-history` component token (`timeline-line: outline-variant`, `entry-icon-bg: surface-container-low`) — a small icon chip per entry on a quiet, unstyled/neutral background, deliberately not borrowing the accent treatment stars/streaks use (`DESIGN.md`'s own explicit instruction)
  - [x] **`--color-surface-container-low` doesn't exist yet in `tokens.css`** (verified — only `primary`/`secondary`/`accent`/`error`/`success`/`surface`/`on-surface`/`outline`/`background` tokens are defined; DESIGN.md's own colors block names `surface-container-low: '#F7F6FB'`). Add it to `:root` at that exact value — the same kind of "found a genuinely missing token while implementing" gap Story 1.9 hit for `--color-secondary`, closed the same way (added at its documented default value, not invented)
  - [x] New `.usavvy-activity-*` classes in `apps/web/src/shared/components.css` per the token above

- [x] **Task 5: Tests mirroring `src/` 1:1** (AD-8)
  - [x] `packages/shared-types/tests/activityHistory.test.ts` — see Task 1
  - [x] `services/core/tests/modules/users/activityHistory.test.ts` (new) + `routes.test.ts` (extend) — see Task 2
  - [x] `services/gateway/tests/authProxy.test.ts` (extend) — see Task 3
  - [x] `apps/web/tests/modules/users/ActivityHistoryPage.test.tsx` (new) — redirects to `/login` with no session; shows the empty state when the fetched list is empty (the real, always-true case today); given a mocked non-empty response (proving the rendering logic works even though nothing produces one live yet), renders entries in the order the backend returned them with the right label/date/link; a fetch failure shows a distinguishable error rather than a blank page (AD-17)

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-18 (Activity History is a read-projection, not a new source of truth):** `getActivityHistory` reads other modules' own data directly (once those modules exist) rather than duplicating it into a new table here — see the code comment requirement in Task 2.
- **AD-14 (ownership):** the Activity History *surface* (this aggregator + route) is owned by `core`'s `auth/users` area per Epic 1's own intro naming it alongside the Theme Picker/Notification Center; the underlying `SessionEvent`/`AssignmentSubmission`/cohort data stays owned by `board-orchestration`/`assignments`/`cohorts` respectively, whenever those services come to exist.
- **AD-7 (RBAC):** no new role/permission — identical reasoning to every other `/users/*` route.
- **AD-17 (no silent failures):** a fetch failure on `ActivityHistoryPage` shows a distinguishable error state, matching every other page's own established pattern — never a blank panel (this is also literally AC #2's own requirement, just extended to the failure case too).
- **AD-8 (test mirroring):** see Task 5.
- **"Don't pre-build for stories that haven't started"** (the architecture doc's own scaffold-on-demand convention, applied here to data shapes rather than services): this story must not invent concrete `board_session`/`assignment`/`cohort_session` variant shapes for Epic 3/6/7's own not-yet-written stories to conform to later. The generic `{ type, occurredAt, label, sourceUrl }` shape in Task 1 is intentionally the full extent of this story's contract — whatever Epic 3/6/7 actually need when they get there is those stories' own design decision, not this one's to guess at now.

### Previous story intelligence (Story 1.10 — read before starting, don't rediscover this)

- **`useNotifications`/`ColorThemeProvider`'s mount-effect + `cancelled`-guard convention** is the right shape for `ActivityHistoryPage`'s own one-time fetch — this page has no write path at all (a read-only reference surface per `EXPERIENCE.md`: "no re-ordering, no editing, no deletion"), so it's simpler than either of those: no optimistic update, no `markRead`/`clear`-equivalent, just fetch-once-and-render.
- **Story 1.10's review round found real value in checking whether a copied guard pattern actually applies before adding it** (the "only seed once" guard that turned out unnecessary for `useNotifications`, since it has no second independent fetch source to race against). `ActivityHistoryPage` has exactly one fetch and zero mutations — there is no race to guard against here at all; don't add one speculatively.
- **`AppHeader` (Story 1.10) already exists as this app's first persistent chrome** — it is NOT extended in this story. Nothing in FR-A-11's AC or `EXPERIENCE.md` ties Activity History to the bell icon; they're unrelated surfaces reachable by different (currently both nav-chrome-less) paths.

### Scope note: what's explicitly OUT of scope for this story

- **Any concrete board-session/assignment/cohort-session entry type, or any code that queries `SessionEvent`/`AssignmentSubmission`/cohort attendance tables.** None of those tables/services exist. `getActivityHistory` returns `[]` — this is correct, not incomplete.
- **A "Profile menu" or any new nav chrome.** `EXPERIENCE.md` places this page one level under a "Profile menu" that doesn't exist as a built component anywhere in this app; building one is a separate, unscoped design decision, matching the identical gap `PreferencesPage`/`ProfilePage` already left open for themselves.
- **Pagination, filtering, or date-range controls.** Not named in any AC; premature for a list that's empty in every real scenario today.
- **`learning_session.ended`, the one new domain event AD-18 names** — that's Story 3.1's own future addition once `board-orchestration`/`LearningSession` exist; nothing to wire here yet.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.11, Epic 1 intro, FR-A-11]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-18 (Activity History as read-projection), the "scaffold-on-demand" convention, the ERD (no `SessionEvent`/`AssignmentSubmission`/cohort-attendance entities exist in `core`'s own tables)]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — the `activity-history` component token (`timeline-line: outline-variant`, `entry-icon-bg: surface-container-low`) and its prose ("deliberately unstyled/neutral... does not borrow" the accent treatment)]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — "Activity History (FR-A-11)... read-only reference surface — no re-ordering, no editing, no deletion"; placement "1 [level deep], Profile menu"]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-10-notification-center.md` — `useNotifications`'s mount-effect/`cancelled` convention and its own review-round lesson about not copying a guard pattern without checking it applies]
- [Source: `apps/web/src/shared/tokens.css` — confirmed `--color-surface-container-low` doesn't exist yet; DESIGN.md's frontmatter colors block gives its exact value]

## Change Log

- 2026-08-05: Full implementation in one pass (Tasks 1-5) — a deliberately small story given Epic 3/6/7 don't exist yet. `activityHistoryEntrySchema`/`activityHistoryResponseSchema` added to `packages/shared-types` (generic shape, no hardcoded board/assignment/cohort variants). `getActivityHistory()` in `services/core` takes no parameters and returns `[]` — the honest, correct implementation given no source data exists to aggregate (originally drafted with unused `db`/`userId` parameters "for future stories," then removed after eslint's zero-tolerance `no-unused-vars` rule caught them, which was the right outcome anyway: matches this story's own "don't pre-build for a story that hasn't started" principle applied to the signature, not just the response shape). `GET /users/activity-history` added to both core and gateway, identical shape to every other read-only route. New `ActivityHistoryPage` at `/activity-history`, reachable directly with no new nav chrome (matching `PreferencesPage`/`ProfilePage`'s own already-accepted precedent). Added the missing `--color-surface-container-low` token to `tokens.css` (found while implementing, same class of gap as Story 1.9's missing `--color-secondary`). Full monorepo regression clean: 561 tests (14 config, 104 shared-types, 12 service-kernel, 166 apps/web, 65 gateway, 200 core), `tsc --noEmit`/`eslint .` clean in every workspace. Live-verified directly against `core`: `GET /users/activity-history` returns `200 []` for an authenticated learner and `401` with no trusted headers; confirmed in a real browser that `/activity-history` with no session correctly redirects to `/login`. Status → `review`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Why this story is small:** Epic 1's own epics.md note and AC #3 both anticipate that Epic 3/6/7 haven't shipped — `getActivityHistory` correctly returning `[]` today is the whole of this story's real backend behavior. The generic `ActivityHistoryEntry` shape (Task 1) deliberately has no board/assignment/cohort-specific fields; inventing them now would mean guessing at three future stories' own designs.
- **Signature-narrowing correction:** the first draft of `getActivityHistory` accepted `(_db: Db, _userId: string)` on the reasoning that future call sites would need them — eslint's `@typescript-eslint/no-unused-vars` (configured `"error"`, no ignore pattern anywhere in this codebase) correctly rejected unused parameters. Rather than work around the linter, removed the parameters entirely: the function takes none today, and whichever future story adds the first real query is the one that adds whatever parameters that query actually needs. A cleaner outcome than the original plan, not a workaround.
- **No new persistent nav chrome added** — `ActivityHistoryPage` is reachable only by direct URL, consistent with `PreferencesPage`/`ProfilePage`'s own long-standing, already-accepted gap (not `AppHeader`, which Story 1.10 built specifically for the bell icon and nothing else).

### File List

**Task 1 (shared contract):**
- `packages/shared-types/src/activityHistory.ts` (new)
- `packages/shared-types/src/index.ts` (updated — barrel)
- `packages/shared-types/tests/activityHistory.test.ts` (new)

**Task 2 (core):**
- `services/core/src/modules/users/service.ts` (updated — `getActivityHistory`)
- `services/core/src/modules/users/routes.ts` (updated — `GET /users/activity-history`)
- `services/core/tests/modules/users/activityHistory.test.ts` (new), `routes.test.ts` (updated)

**Task 3 (gateway):**
- `services/gateway/src/authProxy.ts` (updated — `GET /users/activity-history`)
- `services/gateway/tests/authProxy.test.ts` (updated)

**Task 4 (apps/web):**
- `apps/web/src/modules/users/ActivityHistoryPage.tsx` (new)
- `apps/web/src/modules/users/index.ts` (updated — barrel)
- `apps/web/src/modules/users/api.ts` (updated — `getActivityHistory` client method)
- `apps/web/src/app/App.tsx` (updated — route wiring)
- `apps/web/src/shared/tokens.css` (updated — `--color-surface-container-low`)
- `apps/web/src/shared/components.css` (updated — `.usavvy-activity-*` classes)

**Task 5 (tests):**
- `apps/web/tests/modules/users/ActivityHistoryPage.test.tsx` (new)
- `apps/web/tests/modules/users/api.test.ts` (updated)
