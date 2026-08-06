---
baseline_commit: 51b86d25d31054a9ceb6b012fea2e3c17dfd297c
---

# Story 3.2: Replay Current Beat

Status: done

*(Epic 3, FR-B-2. The second real-backend story behind the Epic 3 mock-first UX pass. Builds directly on Story 3.1's `services/board-orchestration` scaffolding, `learningSessions` service, and `VoicePort` — no new service, no new scaffolding. Read the CRITICAL SCOPE NOTE before starting any task.)*

## Story

As a learner,
I want to replay the current Beat,
so that I can re-hear and re-watch content I missed the first time.

## Acceptance Criteria

1. **Given** the board is displaying/narrating any Beat, whether playing or paused **When** I select Replay **Then** the board visual state resets to the start of the current Beat and narration restarts from the beginning of that Beat's audio, verbatim, using the same content and locale as originally generated
2. **Given** I select Replay while narration is mid-sentence **When** the replay is triggered **Then** any in-flight audio stream is stopped cleanly before the replay stream starts, with no overlapping audio
3. **Given** the Beat's narration audio was previously generated and cached by GenerationPort **When** I select Replay **Then** the cached version is reused rather than regenerated, so the wording is identical to the original playback

## CRITICAL SCOPE NOTE — read before starting any task

**Confirmed by reading Story 3.1's full implementation (`services/board-orchestration`) and the architecture spine. Read every bullet before writing code.**

- **This story adds ONE new endpoint to the EXISTING `services/board-orchestration`/`learningSessions` module — no new service, no new scaffolding, no new port.** Everything Story 3.1 built (schema, `VoicePort`, `PubSubPort`, the trust-boundary, the gateway wiring shape) is reused as-is. This is a small, surgical addition, not a new subsystem.
- **AC #1/#2 (board visual reset, clean audio-stream teardown) are frontend/client-side concerns.** Exactly like Story 3.1's Pause/Resume, `BoardPage.tsx`'s mocked journey is NOT rewired in this story (same mock-first-epic-kickoff convention — real backend lands story-by-story, UI rewiring is separate future work). This story's backend responsibility is narrower and precise: hand back a fresh, valid narration stream reference for the CURRENT Beat at offset 0, and persist that offset-0 state. Actually stopping a previous audio element and re-rendering the board from scratch happens client-side once a real player exists — note this honestly in Dev Notes, don't pretend it's solved here.
- **AC #3 ("cached version is reused rather than regenerated") is not independently testable against today's mock ports**, for the identical reason Story 3.1's Dev Notes already established for NFR-B-3: no real `GenerationPort`/`VoicePort` provider is chosen yet (`ARCHITECTURE-SPINE.md`'s Deferred section), so there is no real cache to verify a hit against. The mock `VoicePort`'s `reestablishStream` is a pure placeholder that never "regenerates" anything in the first place — calling it for Replay is consistent with the AC's *intent* (no new generation call is made), but proving the *caching* behavior specifically requires a real provider. Note this honestly; do not write a test that can't mean anything against a mock.
- **Replay is semantically "resume, but forced to offset 0" — reuse `resumeLearningSession`'s exact write-ordering discipline, don't reinvent it.** Call `voicePort.reestablishStream(currentBeatId, 0)` **before** any DB write (AD-17); on failure, throw a distinguishable error with zero mutation, exactly like `resumeLearningSession`. Unlike Resume, Replay is valid from **either** `"active"` or `"paused"` status (AC #1 says "whether playing or paused") — do not require `status === "paused"` the way `resumeLearningSession` does.
- **Reuse the existing `resumeLearningSessionResponseSchema` shape (`LearningSessionResponse & { streamRef: string }`) for Replay's response — do not invent a new schema.** The response shape is identical (the full session plus a fresh `streamRef`); only the semantics of which offset gets used differ.
- **Apply Story 3.1's own code-review-hardened defensive pattern from day one, not as a follow-up patch:** reject Replay on an already-`"ended"` session up front (`VALIDATION_ERROR`, matching `pauseLearningSession`/`recordBeatReached`'s established guard), AND scope the actual UPDATE's `WHERE` clause to `status <> "ended"` as well (closing the same lost-update/resurrection window Story 3.1's code review found and fixed three times over). Do not ship the unguarded version Story 3.1 initially shipped and then had to patch.
- **`boardRenderState` is reset to `null` on Replay, not synthesized into some "start of Beat" value.** It's an opaque, frontend-owned blob this service has never interpreted (Story 3.1's own established convention) — board-orchestration cannot construct a meaningful "start of Beat" render state for it. Setting it to `null` signals "no persisted mid-Beat state" and is consistent with a freshly-created session's own initial value.
- **Session-event type: use `"replayed"` (past tense), not the PRD's bare literal `"replay"`.** `Doc/00-Requirement.md`'s ERD lists `SessionEvent` types loosely as "pause, replay, explain_deeper, question, …", but this codebase's own established domain-event naming convention (`"started"`/`"paused"`/`"resumed"`/`"ended"`, all past-tense) already overrides that literal wording — same kind of terminology disambiguation as AD-10's `Session` → `LearningSession`. Do not introduce a bare-present-tense event type inconsistent with every other one in this table.
- **No new domain event needs publishing on `PubSubPort` for Replay.** AD-18's `learning_session.ended` obligation is unrelated to this story; Replay doesn't end anything and Activity History has no stated interest in replay events. Don't invent a new pubsub event this story doesn't need.

## Tasks / Subtasks

- [x] **Task 1: `replayCurrentBeat` service function** (AD-17; AC: #1-#3)
  - [x] `services/board-orchestration/src/modules/learningSessions/service.ts`: add `export async function replayCurrentBeat(db: Db, userId: string, sessionId: string, voicePort: VoicePort): Promise<LearningSessionResponse & { streamRef: string }>`.
    - Load the session via `loadSessionOrThrow` (ownership-scoped, 404 not 403 — existing helper, reuse it).
    - Reject with `VALIDATION_ERROR` (400) if `session.status === "ended"`.
    - Reject with `INTERNAL_ERROR` (500) if `session.currentBeatId` is null (should never happen post-creation, same defensive shape `resumeLearningSession` already uses for its own missing-Beat/offset check).
    - Call `voicePort.reestablishStream(session.currentBeatId, 0)` — **before any write**. On failure, throw the same distinguishable `AppError("VOICE_UNAVAILABLE", ..., 503, { reason })` shape `resumeLearningSession` uses (reuse the exact catch block shape, don't invent new wording for the same failure mode).
    - On success: `UPDATE learningSessions SET status = "active", narrationOffsetMs = 0, boardRenderState = null, updatedAt = now() WHERE id = :sessionId AND status <> "ended" RETURNING *`. If `!updated` (lost race against a concurrent `end`), throw `AppError("SESSION_STATE_CHANGED", ..., 409)` — reuse `resumeLearningSession`'s exact pattern and error code for this same race shape, don't invent a new one.
    - Insert a `sessionEvents` row: `{ sessionId, type: "replayed", payload: { currentBeatId: session.currentBeatId } }`.
    - Return `{ ...await toResponse(db, updated), streamRef }`.
  - [x] Tests (extend `services/board-orchestration/tests/modules/learningSessions/service.test.ts`, new `describe("replayCurrentBeat", ...)` block):
    - Succeeds from `"active"` status (no prior pause) — resets `narrationOffsetMs` to 0, `boardRenderState` to `null`, returns a `streamRef`, records a `"replayed"` event.
    - Succeeds from `"paused"` status with a non-zero persisted offset — asserts the returned/persisted `narrationOffsetMs` is `0`, not the old paused offset (this is the one behavior that actually distinguishes Replay from Resume — write a test that would fail if `replayCurrentBeat` were accidentally implemented as a call to `resumeLearningSession`).
    - On `VoicePort` failure (via the mock's `failNext()`), throws `VOICE_UNAVAILABLE`/503 and the DB row is byte-for-byte unchanged afterward (assert via a fresh read, matching Story 3.1's own `resumeLearningSession` failure test's rigor — don't just assert on the thrown error).
    - Rejects replaying an already-`"ended"` session, DB row left unchanged (matching the `pauseLearningSession`/`recordBeatReached` ended-session guard tests from Story 3.1's code review).
    - 404s for another learner's session.

- [x] **Task 2: Route + shared-types + gateway wiring** (AC: #1-#3)
  - [x] `services/board-orchestration/src/modules/learningSessions/routes.ts`: add `POST /learning-sessions/:id/replay`, calling `replayCurrentBeat` — same `requireTrustedUser`/`requireValidId` shape as every other route in this file (no new body to parse; matches `/resume`'s exact no-body shape).
  - [x] `packages/shared-types/src/learningSessions.ts`: no new schema needed — the route responds with the existing `resumeLearningSessionResponseSchema` shape (`LearningSessionResponse & { streamRef }`). If a dedicated `replayLearningSessionResponseSchema` alias reads better to whoever implements this, an alias export is fine, but do not duplicate the object shape.
  - [x] `services/gateway/src/boardOrchestrationProxy.ts`: add `POST /learning-sessions/:id/replay` as a dumb 1:1 forward — same shape as the existing `/resume` route in this same file (no body, `requireAuth`, `trustedHeaders`, `requireValidId`).
  - [x] `apps/web/src/modules/board/api.ts`: add `replayCurrentBeat(apiUrl, accessToken, sessionId)` — same shape as the existing `resumeLearningSession` wrapper in this same file.
  - [x] Tests: `services/gateway/tests/boardOrchestrationProxy.test.ts` — new `describe("POST /learning-sessions/:id/replay", ...)` mirroring the existing `/resume` describe block's shape exactly (401-without-token, trusted-header forwarding, no body). `apps/web/tests/modules/board/api.test.ts` — new test mirroring the existing `resumeLearningSession` test's shape.

- [x] **Task 3: End-to-end proof** (AC: #1-#3)
  - [x] `services/board-orchestration/tests/modules/learningSessions/routes.test.ts`: extend the existing real-HTTP lifecycle test (or add a new one) to exercise `POST /learning-sessions/:id/replay` through the real Fastify app + real database — pause the session first (to prove Replay works from a paused state with a non-zero offset, not just fresh-active), then replay, and assert the response's `narrationOffsetMs` is `0`.

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-17 (no silent failures):** identical to Story 3.1's own `resumeLearningSession` — a `VoicePort` failure on Replay must surface a distinguishable, real error, never silently retried or swallowed.
- **AD-2/AD-3 (GenerationPort caching, PII/safety):** not newly bound by this story — `board-orchestration` still doesn't call a real `GenerationPort`/`VoicePort` provider; the mock adapters from Story 3.1 are reused unchanged.

### Previous story intelligence — read before starting, don't rediscover this

- **`services/board-orchestration/src/modules/learningSessions/service.ts`** (Story 3.1, patched during its own code review) — read `resumeLearningSession` in full; it is the near-exact template for `replayCurrentBeat`'s write-ordering, error shapes, and the code-review-hardened `status <> "ended"` defensive `WHERE` clause. Also read `pauseLearningSession`'s/`recordBeatReached`'s ended-session guard (added during Story 3.1's code review, not in the original implementation) — replicate that guard shape from the start this time.
- **Story 3.1's own code review found and fixed three separate lost-update/race bugs** (documented in its Review Findings section) — all three shared one root cause: a status-changing write with no `WHERE status = ...`/`status <> "ended"` condition, checked only in application code before the write, not enforced at write time. `replayCurrentBeat` must not repeat that class of bug — the CRITICAL SCOPE NOTE above spells out the exact defensive shape to use from the start.
- **`services/board-orchestration/tests/modules/learningSessions/routes.test.ts`** (added during Story 3.1's code review) — the real-HTTP-lifecycle integration-test pattern to extend for this story's Task 3, using `app.inject()` against the real Fastify app and real Postgres, not a gateway-spanning test (Story 3.1's Dev Notes/`deferred-work.md` already document why that's the right level, not a gap).
- **`services/gateway/src/boardOrchestrationProxy.ts`/`boardOrchestrationClient.ts`** — already wired for `board-orchestration` in general (Story 3.1); this story only adds one more route to the existing proxy file, no new client method needed (the generic `forward()` method already handles any path/method).
- **`apps/web/src/modules/board/api.ts`** — already exists (Story 3.1); this story adds one more thin wrapper function to the existing file, matching `resumeLearningSession`'s exact shape.

### Scope note: what's explicitly OUT of scope for this story

- **Rewiring `BoardPage.tsx`'s mocked Replay button to call this real endpoint** — stays exactly as signed off in the Epic 3 mock-first UX pass; incremental future-story work, same as Story 3.1.
- **Actually stopping/tearing down an in-flight audio element client-side (AC #2)** — there is no real audio player anywhere in this codebase yet (mock `VoicePort` only); this is real-provider/real-frontend-audio work for a future story.
- **Verifying AC #3's caching claim against a real provider** — not testable against today's mock ports; see CRITICAL SCOPE NOTE.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 3.2, FR-B-2 (lines ~802-816)]
- [Source: `Doc/00-Requirement.md` — line 264 (FR-B-2's one-line summary), line 615 (SessionEvent's ERD type list, superseded here by this codebase's past-tense domain-event convention)]
- [Source: `_AI-Agile-Development/implementation-artifacts/3-1-pause-and-resume-the-board.md` — the direct predecessor story; its Review Findings section documents the exact race-condition class this story must avoid from the start]
- [Source: `services/board-orchestration/src/modules/learningSessions/service.ts`, `routes.ts` — the exact functions/shapes to extend]
- [Source: `services/gateway/src/boardOrchestrationProxy.ts`, `apps/web/src/modules/board/api.ts` — the exact wiring shapes to extend]

## Review Findings

One adversarial review ran against the diff (a single reviewer, not three in parallel — this story's diff was small and tightly scoped, unlike Story 3.1's from-scratch service scaffolding). Result: `replayCurrentBeat`'s write-safety and every CRITICAL SCOPE NOTE instruction were followed correctly; one closeable test-coverage gap was found and patched. Separately, while re-running the full test suite after that patch, a genuine pre-existing bug from Story 3.1 was caught and fixed (not something the reviewer flagged — surfaced by an actual race finally reproducing).

### Patched

- **LOW — `replayCurrentBeat`'s `SESSION_STATE_CHANGED`/409 branch (the `!updated` lost-update guard) had no dedicated test actually driving it**, unlike `resumeLearningSession`'s identical branch, which Story 3.1's own code review armed with a deterministic concurrency test. Added the equivalent test here (`rejects with SESSION_STATE_CHANGED, and does not reverse an end that lands while VoicePort is in flight`) so a future regression in that `WHERE` clause would actually be caught.
- **Found independently while re-running the full suite (not a reviewer finding): `createOrResumeLearningSession`'s unique-violation fallback (added during Story 3.1's own code review) never actually worked.** `isUniqueViolation` checked `error.code` directly, but drizzle-orm's postgres-js session wraps every query error in its own `DrizzleQueryError`, whose `.cause` — not the error itself — holds the real `PostgresError` with the actual `23505` code. The existing concurrency test for this path had been passing by accident: the SELECT-vs-INSERT race window usually didn't line up for both concurrent calls to reach the INSERT at the same time, so the broken fallback path was rarely exercised. Adding this story's own new concurrency test for Replay happened to run at a moment the create-or-resume race genuinely collided, surfacing the bug via a real, reproducible failure (confirmed by re-running the suite 5 times after the fix — clean every time). Fixed by checking `error.cause?.code` as a fallback. This is a Story 3.1 defect, fixed here because this is where it was found — see File List for the affected file (`services/board-orchestration/src/modules/learningSessions/service.ts`, already shipped in Story 3.1's commit, patched again in this story's commit).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no blocking failures. Implemented test-first (red/green): the 5 new `replayCurrentBeat` service tests were written and confirmed failing (`replayCurrentBeat is not a function`) before the function existed, then confirmed passing once implemented. `pnpm -r typecheck` (9/9 workspaces) and `pnpm -r test` both clean on first full run after implementation — no regressions, no flakes this time.

### Completion Notes List

- All 3 tasks implemented: `replayCurrentBeat` added to `services/board-orchestration`'s `learningSessions` service, reusing `resumeLearningSession`'s exact write-ordering discipline (VoicePort called before any write; on failure, zero mutation) and its code-review-hardened `status <> "ended"` defensive write — applied from the start this time, per the story's own CRITICAL SCOPE NOTE, rather than shipped unguarded and patched later the way Story 3.1's equivalent guards were.
- The one behavior that actually distinguishes Replay from Resume — forcing `narrationOffsetMs` to `0` rather than restoring the persisted paused offset — is covered by a dedicated test (`succeeds from 'paused' status with a non-zero offset, resetting it to 0`) that would fail if `replayCurrentBeat` were accidentally implemented as a thin call to `resumeLearningSession`.
- `boardRenderState` resets to `null` on Replay (not synthesized into a "start of Beat" value) — consistent with Story 3.1's own established "opaque, frontend-owned blob" convention for this field.
- Reused the existing `resumeLearningSessionResponseSchema` for Replay's response (no new shared-types schema needed — the shape is identical: `LearningSessionResponse & { streamRef }`), and reused the existing `SESSION_STATE_CHANGED`/409 error code for the identical lost-update race shape, per the story's own explicit "don't invent a new one" instruction.
- Extended (rather than duplicated) the real-HTTP lifecycle integration test added during Story 3.1's own code review (`routes.test.ts`) to exercise Replay from a paused, non-zero-offset state through the real Fastify app and real database, then re-paused before continuing into the existing Resume/reached/end assertions.
- AC #2 (clean audio-stream teardown) and AC #3 (real caching verification) remain explicitly out of scope per the story's own CRITICAL SCOPE NOTE — no real audio player or real `GenerationPort`/`VoicePort` provider exists yet in this codebase; noted honestly rather than papered over with an untestable assertion.
- Full monorepo validation: `pnpm -r typecheck` (9/9 clean), `pnpm -r test` (clean across all workspaces individually — see Debug Log for the gateway flake note), `pnpm lint` (clean). New test counts: `services/board-orchestration` 32 → 38 (+5 `replayCurrentBeat` tests, +1 concurrency test added during code review), `services/gateway` 138 → 140 (+2), `apps/web` 283 → 284 (+1).
- **Code review found a real, pre-existing Story 3.1 bug** (not this story's own code): `createOrResumeLearningSession`'s unique-violation fallback never actually matched a real race, because drizzle-orm wraps every query error in `DrizzleQueryError` and the real Postgres error code lives on `.cause`, not the top-level error. This story's own new `replayCurrentBeat` concurrency test happened to run at a moment the pre-existing create-or-resume race genuinely collided, exposing it. Fixed in `service.ts`'s `isUniqueViolation` helper; reverified with 5 repeated full test-suite runs, all clean. See Review Findings above.

### File List

- `services/board-orchestration/src/modules/learningSessions/service.ts` (modified — new `replayCurrentBeat` function; also fixes a pre-existing Story 3.1 bug in `isUniqueViolation`, see Review Findings)
- `services/board-orchestration/src/modules/learningSessions/routes.ts` (modified — new `POST /learning-sessions/:id/replay` route)
- `services/board-orchestration/tests/modules/learningSessions/service.test.ts` (modified — new `replayCurrentBeat` describe block, 6 tests including the code-review-added concurrency test)
- `services/board-orchestration/tests/modules/learningSessions/routes.test.ts` (modified — extended the lifecycle test to cover Replay)
- `services/gateway/src/boardOrchestrationProxy.ts` (modified — new `POST /learning-sessions/:id/replay` forward)
- `services/gateway/tests/boardOrchestrationProxy.test.ts` (modified — new `describe` block, 2 tests)
- `apps/web/src/modules/board/api.ts` (modified — new `replayCurrentBeat` wrapper)
- `apps/web/tests/modules/board/api.test.ts` (modified — new test)
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-08-06: Story implementation completed (Tasks 1-3): added `replayCurrentBeat` to `services/board-orchestration`'s existing `learningSessions` service, applying Story 3.1's code-review-hardened defensive-write pattern from the start rather than as a follow-up patch. Wired the new route through gateway and `apps/web`'s existing api module. Extended (not duplicated) Story 3.1's real-HTTP lifecycle integration test. Full monorepo `pnpm -r typecheck`/`pnpm -r test`/`pnpm lint` verified clean on first pass. Status moved to review.
- 2026-08-06: Code review patch round — added the missing concurrency test for `replayCurrentBeat`'s lost-update guard (LOW), and, while re-verifying the suite, caught and fixed a genuine pre-existing bug in Story 3.1's `createOrResumeLearningSession` (the unique-violation fallback never matched a real race due to drizzle-orm's error-wrapping shape). Reverified with 5 repeated full-suite runs, all clean, plus every service's suite individually. Full monorepo `pnpm -r typecheck`/`pnpm lint` reverified clean. Status moved to done.
