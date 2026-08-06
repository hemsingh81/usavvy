---
baseline_commit: 8ba3b884b47bfc58a0b34ee5f05bb2f444df2943
---

# Story 3.3: Step Back and Forward Between Beats

Status: done

*(Epic 3, FR-B-3. Third real-backend story behind the Epic 3 mock-first UX pass, building directly on Story 3.1's `services/board-orchestration` scaffolding and Story 3.2's `replayCurrentBeat` (its exact write-ordering/reset pattern is this story's template). No new service, no new scaffolding. Read the CRITICAL SCOPE NOTE before starting any task.)*

## Story

As a learner,
I want to step back or forward between Beats,
so that I can review or move ahead through the lesson at my own pace.

## Acceptance Criteria

1. **Given** the board is on any Beat other than the first in the session **When** I select Back **Then** the board navigates to the previous Beat and restores that Beat's exact visual state — all rendered text, diagrams, math, code, tables, and charts as they appeared when that Beat finished rendering
2. **Given** the board is on any Beat other than the last generated Beat **When** I select Forward **Then** the board navigates to the next Beat and restores or renders that Beat's content
3. **Given** I am on the first Beat of the session **When** I select Back **Then** the control is disabled or no-ops, and no error is shown
4. **Given** I am on the last known Beat and later Beats have not yet been generated **When** I select Forward **Then** the system requests the next Beat via PubSubPort and shows a loading state until it streams in, or an error state with retry if generation fails

## CRITICAL SCOPE NOTE — read before starting any task

**Confirmed by reading Story 3.1's and 3.2's full implementations (`services/board-orchestration`). Read every bullet before writing code.**

- **This story adds Back/Forward navigation ONLY across Beats that already exist (caller-supplied at session creation) — no new service, no new scaffolding, no real Beat-generation-on-demand.** Every session's Beats are a fixed array supplied once at `createOrResumeLearningSession` time (Story 3.1's own established scope: "Beats are caller-supplied... real Beat content generation is `GenerationPort`'s future job, Stories 3.5-3.10/3.14+"). That has NOT changed for this story. Back/Forward moves `currentBeatId` among the Beats that already exist in the session's fixed array — it does not, and cannot yet, generate a new one.
- **AC #4's "requests the next Beat via `PubSubPort`... loading state... or error state with retry" describes the FULL future behavior once a real `GenerationPort` binding exists — it is NOT this story's job to build that round-trip.** There is no consumer of a "please generate the next Beat" pub/sub event anywhere in this codebase yet, and `GenerationPort` is not bound to `board-orchestration` (confirmed by re-reading `ARCHITECTURE-SPINE.md`'s AD-2 and the Deferred section — unchanged since Story 3.1). Building a speculative publish call with no subscriber is the exact "infrastructure for a provider that doesn't exist yet" anti-pattern Story 3.1's own CRITICAL SCOPE NOTE already rejected for `VoicePort` audio streaming. **This story's actual backend job for AC #4's boundary case is narrower and honest: when Forward is called past the last known Beat, return a clear, distinguishable "no further Beats yet" response** (a 404-shaped `AppError`, giving a future frontend something concrete to build a loading/retry UI around once real generation exists) — not a crash, not a silent no-op, not a fake success. Note the full PubSubPort-generation-request mechanism as explicitly deferred; do not attempt to build it.
- **AC #3's "control is disabled or no-ops, and no error is shown" describes the FRONTEND's job** (disabling the Back button once on the first Beat) — `BoardPage.tsx`'s mocked journey is NOT rewired this story, same as Stories 3.1/3.2. If the backend route is called anyway at this boundary (a stale client, a race), it returns a clear `VALIDATION_ERROR`/400 rather than a silent no-op — matching AD-17 ("no silent failures") and every other boundary condition already in this service (e.g. `recordBeatReached`'s foreign-Beat-id rejection). "No error is shown to the learner" is a UI-layer responsibility of the control being disabled in the first place, not a mandate that the API pretend success.
- **Stepping to a Beat is semantically "jump, then Replay-from-start of that Beat" — reuse `replayCurrentBeat`'s exact pattern, don't reinvent it.** Both AC #1 ("restores that Beat's exact visual state... as they appeared when that Beat finished rendering") and AC #2 ("restores or renders") describe re-displaying a Beat's full, already-known content from the start — this codebase has no per-Beat "how far did rendering get" persistence to restore a *mid-render* state (that concept only exists for the *current* Beat's pause offset, via `narrationOffsetMs`/`boardRenderState` on the session, and those are meaningless once you've moved to a *different* Beat). Reconstructing a Beat's full visual state from its own immutable, already-persisted `boardAction` is a **frontend rendering concern** (the Beat's content is static and replayable — the frontend can always re-render any known Beat's `boardAction` deterministically), not something this story's backend needs to solve. The backend's job, exactly like `replayCurrentBeat`: move `currentBeatId` to the target Beat, reset `narrationOffsetMs` to `0` and `boardRenderState` to `null`, call `voicePort.reestablishStream(targetBeatId, 0)` **before any write** (AD-17), flip `status` to `"active"`, and return a fresh `streamRef` — reuse `resumeLearningSessionResponseSchema`, don't invent a new response schema (same "don't invent a new one" instruction Story 3.2 already followed for its own error code and response shape).
- **Stepping does NOT auto-end the session, even when Forward lands on the session's last Beat.** This is a real, important distinction from `recordBeatReached`: `recordBeatReached` is called by the frontend when a Beat *finishes narrating* during normal playback (Story 3.1, AC #5 — reaching the last Beat that way ends the session). Manually navigating to the last Beat via the Back/Forward controls is browsing/review, not "this Beat just finished" — a learner stepping Forward to look at the last Beat should not have their session end out from under them. Do not call `endLearningSessionInternal`/reuse `recordBeatReached`'s auto-end branch from this story's new function.
- **Valid from either `"active"` or `"paused"` status, guarded against `"ended"` — apply Story 3.1's code-review-hardened defensive pattern (guard-check up front, `status <> "ended"` scoping the actual write) from the start, exactly like `replayCurrentBeat` already does.** Do not ship an unguarded version and patch it later, the way Story 3.1's original `pauseLearningSession`/`recordBeatReached` had to be.
- **Session-event types: `"stepped_back"` / `"stepped_forward"`** (past tense, two distinct types — matching this codebase's existing one-distinct-type-per-distinct-action convention, e.g. `"replayed"`/`"resumed"`/`"paused"`, rather than one generic `"stepped"` type with a direction field in the payload).

## Tasks / Subtasks

- [x] **Task 1: `stepBeat` service function** (AD-17; AC: #1-#4)
  - [x] `services/board-orchestration/src/modules/learningSessions/service.ts`: add `export async function stepBeat(db: Db, userId: string, sessionId: string, direction: "back" | "forward", voicePort: VoicePort): Promise<LearningSessionResponse & { streamRef: string }>`.
    - Load the session via `loadSessionOrThrow`. Reject with `VALIDATION_ERROR` (400) if `session.status === "ended"` (matches `replayCurrentBeat`'s exact guard).
    - Load this session's Beats ordered by `position, id` (matches `recordBeatReached`'s exact query shape) and locate the current Beat's index via `session.currentBeatId`.
    - `direction === "back"`: if the current Beat is already index `0`, throw `AppError("VALIDATION_ERROR", "already at the first Beat", 400)` (AC #3's backend-side boundary — see CRITICAL SCOPE NOTE on why this is a real error, not a silent no-op). Otherwise target = `beats[index - 1]`.
    - `direction === "forward"`: if the current Beat is already the last index, throw `AppError("NO_FURTHER_BEATS", "no additional Beats are available yet for this session", 404)` (AC #4's boundary — see CRITICAL SCOPE NOTE; do NOT attempt a real PubSubPort generation-request round-trip). Otherwise target = `beats[index + 1]`.
    - Call `voicePort.reestablishStream(target.id, 0)` — **before any write**. On failure, throw the same `AppError("VOICE_UNAVAILABLE", ..., 503, { reason })` shape `resumeLearningSession`/`replayCurrentBeat` already use.
    - On success: `UPDATE learningSessions SET status = "active", currentBeatId = target.id, narrationOffsetMs = 0, boardRenderState = null, updatedAt = now() WHERE id = :sessionId AND status <> "ended" RETURNING *`. If `!updated` (lost race against a concurrent `end`), throw `AppError("SESSION_STATE_CHANGED", ..., 409)` — reuse the existing error code, don't invent a new one.
    - Insert a `sessionEvents` row: `{ sessionId, type: direction === "back" ? "stepped_back" : "stepped_forward", payload: { fromBeatId: session.currentBeatId, toBeatId: target.id } }`.
    - Return `{ ...await toResponse(db, updated), streamRef }`.
  - [x] Tests (extend `services/board-orchestration/tests/modules/learningSessions/service.test.ts`, new `describe("stepBeat", ...)` block):
    - Back from the second Beat moves to the first, resets `narrationOffsetMs`/`boardRenderState`, returns a `streamRef`, records a `"stepped_back"` event.
    - Back from the first Beat rejects with `VALIDATION_ERROR`, DB row unchanged (AC #3's backend boundary).
    - Forward from the first Beat (in a 3-Beat session) moves to the second, records a `"stepped_forward"` event.
    - Forward from the LAST Beat rejects with `NO_FURTHER_BEATS`/404, and — the one behavior that most needs a dedicated test — the session's `status` is NOT flipped to `"ended"` by this rejection (proves stepping never auto-ends, unlike `recordBeatReached`).
    - Forward to the last Beat (in a session with ≥3 Beats, stepping from the second-to-last) succeeds normally and does NOT end the session (distinguishes from `recordBeatReached` reaching the same Beat).
    - On `VoicePort` failure, throws `VOICE_UNAVAILABLE`/503, DB row byte-for-byte unchanged (matches `replayCurrentBeat`'s own test rigor).
    - Rejects stepping (both directions) on an already-`"ended"` session, DB row unchanged.
    - A deterministic concurrency test racing a concurrent `end` from inside the mock VoicePort call, asserting `SESSION_STATE_CHANGED`/409 and that the DB is left `"ended"`, not reversed — apply this from the start (see Story 3.2's own code-review lesson: `replayCurrentBeat` initially shipped without this exact test).
    - 404s for another learner's session.

- [x] **Task 2: Routes + shared-types + gateway wiring** (AC: #1-#4)
  - [x] `services/board-orchestration/src/modules/learningSessions/routes.ts`: add `POST /learning-sessions/:id/back` and `POST /learning-sessions/:id/forward`, both calling `stepBeat` with the corresponding direction — same `requireTrustedUser`/`requireValidId`/no-body shape as `/resume`/`/replay`. (Two routes, not one route with a body-supplied direction — matches this codebase's existing one-route-per-distinct-action convention for this same module.)
  - [x] `packages/shared-types/src/learningSessions.ts`: no new schema needed — reuses `resumeLearningSessionResponseSchema`.
  - [x] `services/gateway/src/boardOrchestrationProxy.ts`: add both routes as dumb 1:1 forwards — same shape as `/resume`/`/replay` in this same file.
  - [x] `apps/web/src/modules/board/api.ts`: add `stepBack(apiUrl, accessToken, sessionId)` and `stepForward(apiUrl, accessToken, sessionId)` — same shape as `replayCurrentBeat`'s existing wrapper.
  - [x] Tests: `services/gateway/tests/boardOrchestrationProxy.test.ts` — new `describe` blocks for both new routes, mirroring `/replay`'s existing shape (401-without-token, trusted-header forwarding, no body). `apps/web/tests/modules/board/api.test.ts` — new tests for both wrappers, mirroring `replayCurrentBeat`'s existing test.

- [x] **Task 3: End-to-end proof** (AC: #1-#4)
  - [x] `services/board-orchestration/tests/modules/learningSessions/routes.test.ts`: extend the existing real-HTTP lifecycle test to step Back then Forward through the real Fastify app + real database at some point before the existing reached/end assertions, asserting `currentBeatId` moves correctly and `narrationOffsetMs` resets to `0` each time.

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-17 (no silent failures):** identical to Stories 3.1/3.2 — every boundary condition (first Beat, last Beat, ended session, VoicePort failure, lost race) surfaces a distinguishable, real error; nothing silently no-ops at the API layer (the *frontend* silently disabling a control is a different, UI-layer concern — see CRITICAL SCOPE NOTE).
- **AD-2 (GenerationPort):** still not bound to `board-orchestration` — unchanged since Story 3.1. AC #4's real generation-on-demand behavior is explicitly out of scope; see CRITICAL SCOPE NOTE.

### Previous story intelligence — read before starting, don't rediscover this

- **`services/board-orchestration/src/modules/learningSessions/service.ts`** — read `replayCurrentBeat` (Story 3.2) in full; it is the near-exact template for `stepBeat`'s write-ordering, reset semantics, and defensive `status <> "ended"` write. Read `recordBeatReached` (Story 3.1) for the "load Beats ordered by position/id, find index" query shape — reuse that shape, but do NOT reuse its auto-end branch (see CRITICAL SCOPE NOTE: stepping never auto-ends).
- **Story 3.2's own code review found a real, pre-existing bug in `createOrResumeLearningSession`'s unique-violation handling** (`isUniqueViolation` didn't account for drizzle-orm wrapping every query error in `DrizzleQueryError`, with the real Postgres error code on `.cause`) — already fixed in `service.ts`. Nothing new to do here, but if this story's own new concurrency test ever needs to detect a unique-violation-shaped error for any reason, reuse the now-fixed `isUniqueViolation` helper rather than re-deriving the check.
- **Story 3.2's own code review found a missing concurrency test** for `replayCurrentBeat`'s `SESSION_STATE_CHANGED` branch, added after the fact. This story's own Task 1 test list already includes the equivalent test from the start — don't skip it the way 3.2 initially did.
- **`services/board-orchestration/tests/modules/learningSessions/routes.test.ts`** — the real-HTTP-lifecycle integration-test pattern (Story 3.1, extended by 3.2) to extend again for this story's Task 3.

### Scope note: what's explicitly OUT of scope for this story

- **Real Beat generation-on-demand (AC #4's full behavior)** — no `GenerationPort` binding exists yet; see CRITICAL SCOPE NOTE. This story only returns a clear boundary signal when Forward has nowhere further to go.
- **Rewiring `BoardPage.tsx`'s mocked Back/Forward controls to call these real endpoints, or disabling the Back control at the first Beat** — stays exactly as signed off; incremental future-story work, same as Stories 3.1/3.2.
- **Reconstructing a Beat's exact rendered visual state server-side** — a Beat's content (`boardAction`) is already immutable and persisted; re-rendering it is a frontend concern, not something this story adds new backend state for.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 3.3, FR-B-3 (lines ~818-836)]
- [Source: `_AI-Agile-Development/implementation-artifacts/3-1-pause-and-resume-the-board.md`, `3-2-replay-current-beat.md` — the two direct predecessor stories; their Review Findings sections document the exact race-condition class and test-coverage lessons this story must apply from the start]
- [Source: `services/board-orchestration/src/modules/learningSessions/service.ts`, `routes.ts` — the exact functions/shapes to extend]
- [Source: `services/gateway/src/boardOrchestrationProxy.ts`, `apps/web/src/modules/board/api.ts` — the exact wiring shapes to extend]

## Review Findings

One adversarial review ran against the diff. **No defects found.** Applying Stories 3.1/3.2's own code-review lessons from the start (defensive `status <> "ended"` writes, a dedicated concurrency test, the no-auto-end distinction from `recordBeatReached`) paid off — the reviewer specifically traced the 2-Beat boundary case at both ends simultaneously, confirmed `stepBeat` is structurally incapable of auto-ending (its signature has no `pubSubPort` parameter at all), and verified the concurrency test genuinely reaches the last Beat via `stepBeat` itself (not `recordBeatReached`) before asserting the no-auto-end claim. Nothing patched; nothing deferred.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no blocking failures. Implemented test-first (red/green): all 9 new `stepBeat` service tests were confirmed failing (`stepBeat is not a function`) before the function existed, then confirmed passing (47/47) once implemented, reverified stable across 3 repeated full-suite runs. Two known, pre-existing, unrelated flakes were encountered and confirmed non-regressions during full monorepo validation: (1) `apps/web`'s `BoardPage.test.tsx` (a timing-sensitive `waitFor` on progressive-reveal text, untouched by this story) failed once under heavy system load, then passed clean (286/286) on immediate retry; (2) `pnpm -r test`'s combined parallel run continues to show the already-documented (Story 2.14) first-test-in-file timeout pattern in `services/gateway` under `apps/web`'s heavy CPU load — every affected package verified clean individually instead (`services/gateway` 144/144, `services/board-orchestration` 47/47 ×3, `services/courses` 121/121, `services/core` 200/200, `services/ingestion` 177/177, `apps/web` 286/286).

### Completion Notes List

- All 3 tasks implemented: `stepBeat` added to `services/board-orchestration`'s `learningSessions` service, reusing `replayCurrentBeat`'s exact write-ordering discipline (VoicePort before any write; `status <> "ended"` scoping the write) from the start — applying Story 3.2's own code-review lesson (add the `SESSION_STATE_CHANGED` concurrency test immediately, not as a follow-up patch) proactively this time.
- Implemented the two boundary conditions honestly per the CRITICAL SCOPE NOTE: Back at the first Beat returns `VALIDATION_ERROR`/400 (a real error, not a silent no-op — disabling the control is the frontend's job); Forward past the last known Beat returns a new, distinguishable `NO_FURTHER_BEATS`/404 rather than attempting any real `PubSubPort` Beat-generation round-trip (no `GenerationPort` binding exists yet — building that would be speculative infrastructure for a producer that doesn't exist).
- Verified, via a dedicated test, that stepping to the session's last Beat via Forward does **not** auto-end the session — a deliberate, tested distinction from `recordBeatReached`'s own auto-end branch (Story 3.1, AC #5), since manually browsing to the last Beat is not the same event as that Beat finishing narration.
- Reused `resumeLearningSessionResponseSchema` for both routes' responses and the existing `SESSION_STATE_CHANGED` error code for the lost-update race — no new shared-types schema or error code invented, per the story's own explicit instruction (continuing Story 3.2's precedent).
- Two distinct session-event types (`"stepped_back"`/`"stepped_forward"`) rather than one generic type with a direction field, matching this codebase's established one-type-per-action convention.
- Extended (not duplicated) the real-HTTP lifecycle integration test to exercise Forward then Back through the real Fastify app and real database, including the first-Beat boundary's 400 response, before continuing into the existing reached/end assertions.
- Full monorepo validation: `pnpm -r typecheck` (9/9 clean); every workspace's own test suite verified individually and clean (see Debug Log for the two confirmed-non-regression flakes encountered along the way); `pnpm lint` (clean). New test counts: `services/board-orchestration` 38 → 47 (+9), `services/gateway` 140 → 144 (+4), `apps/web` 284 → 286 (+2).

### File List

- `services/board-orchestration/src/modules/learningSessions/service.ts` (modified — new `stepBeat` function)
- `services/board-orchestration/src/modules/learningSessions/routes.ts` (modified — new `POST /learning-sessions/:id/back` and `.../forward` routes)
- `services/board-orchestration/tests/modules/learningSessions/service.test.ts` (modified — new `stepBeat` describe block, 9 tests)
- `services/board-orchestration/tests/modules/learningSessions/routes.test.ts` (modified — extended the lifecycle test to cover Back/Forward, including the first-Beat boundary)
- `services/gateway/src/boardOrchestrationProxy.ts` (modified — new `/back`/`/forward` forwards)
- `services/gateway/tests/boardOrchestrationProxy.test.ts` (modified — two new `describe` blocks, 4 tests)
- `apps/web/src/modules/board/api.ts` (modified — new `stepBack`/`stepForward` wrappers)
- `apps/web/tests/modules/board/api.test.ts` (modified — two new tests)
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-08-06: Story implementation completed (Tasks 1-3): added `stepBeat` (Back/Forward navigation across already-existing Beats) to `services/board-orchestration`'s existing `learningSessions` service, applying Story 3.2's code-review lesson (the `SESSION_STATE_CHANGED` concurrency test) from the start rather than as a follow-up patch. Wired both routes through gateway and `apps/web`'s existing api module. Extended (not duplicated) the real-HTTP lifecycle integration test. Full monorepo `pnpm -r typecheck`/per-workspace `test`/`pnpm lint` verified clean; two pre-existing, unrelated environmental flakes encountered and confirmed non-regressions. Status moved to review.
- 2026-08-06: Code review — no defects found; applying Stories 3.1/3.2's own lessons from the start avoided a repeat patch round. Status moved to done.
