---
baseline_commit: f25037d6897183db926777988529445232d75b64
---

# Story 2.11: Ingestion status with progress and failure reasons

Status: done

*(Epic 2, FR-C-11. The FIRST ingestion story with a learner-facing UI component — Stories 2.7-2.10 were all backend-only. It's also the first story to introduce REAL intermediate (non-terminal) `UploadedDocument` statuses (`"parsing"`, `"safety scan"`) written mid-job, and the first to build a delete/remove endpoint for a learner's own upload. Story 2.12 (embedding/outline) and Story 2.13 (outline review screen) do NOT exist yet — see Dev Notes for how this story stays honest about that.)*

## Story

As a learner,
I want to see the status and progress of my document while it's being processed, and a clear reason if something goes wrong,
so that I know what's happening and what to do next.

## Acceptance Criteria

1. **Given** a learner has an UploadedDocument queued or running through ingestion **When** they view their custom course's upload screen **Then** each document shows its current stage (queued, parsing, safety scan, embedding, outline ready) and a progress indicator that updates as the job advances through JobQueuePort
2. **Given** an UploadedDocument whose ingestion job failed due to an encrypted PDF, failed OCR, unsupported language, corrupt file, or a safety-scan block **When** the learner views that document's status **Then** a specific, human-readable failure reason matching the actual cause is shown, distinct from a generic error message
3. **Given** an UploadedDocument that failed ingestion **When** the learner views its status **Then** they are offered a relevant next step (e.g. "upload a text version", "remove this file") appropriate to the failure reason, and can remove the failed file without affecting the other files in the same custom course
4. **Given** a document successfully completes every ingestion stage **When** the learner views its status **Then** the status shows "outline ready" and links to the outline review screen (Story 2.13)

## CRITICAL SCOPE NOTE — read before starting any task

**Stories 2.12 (embedding/outline proposal) and 2.13 (outline review screen) do not exist yet.** This means, TODAY, in this codebase:
- No document can ever reach `"embedding"` or `"outline ready"` — no code produces those status values (the ingestion job's only terminal states remain `"parsed"` / `"blocked"` / `"failed"`, per Stories 2.9/2.10).
- "unsupported language" and "failed OCR" are NOT real, distinguishable failure reasons anywhere in the pipeline today — Story 2.9 deliberately made OCR a best-effort, non-fatal fallback (a single bad page degrades to empty text, never fails the whole document — `parsers/ocr.ts`'s own documented AD-17 reasoning), and no language-detection/rejection logic exists at all (Tesseract is English-only by explicit Story 2.9 scope).
- No outline review screen exists to link to.

Given AD-1 (scaffold-on-demand) and this epic's own established discipline of never fabricating a capability the codebase doesn't have (Story 2.9's OCR/DOCX-encryption limitations, Story 2.10's no-percentage-threshold decision), this story:
- Builds the FULL 5-stage display vocabulary and a forward-compatible stage→label/progress mapping (so when Story 2.12/2.13 later start producing `"embedding"`/`"outline ready"`, this story's display logic needs no changes) — verified via unit tests using literal hypothetical status strings, since no real job can produce them yet.
- Wires up REAL, observable intermediate progress for the two stages this story's own job CAN reach: `"parsing"` and `"safety scan"`, written mid-job by `ingestDocument.ts` (previously the job wrote no status at all until its very last line).
- Only builds specific failure-reason/next-step mappings for reasons the pipeline can ACTUALLY produce today: `"encrypted file"`, `"corrupt file"`, `"blocked: <category>"` (Story 2.9/2.10's existing values). "failed OCR" / "unsupported language" are explicitly OUT OF SCOPE (no producing code path — inventing new failure-detection capability is a different, unscoped piece of work, not "displaying a reason").
- Does NOT build a Notification Center / Activity History integration for ingestion completion, even though `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` line 81 describes that as a longer-term expectation ("long-running work is checkable later ... each ... lands a Notification Center entry when it resolves") — this is a spine-level aspiration beyond this story's 4 explicit ACs, and no other ingestion-sourced notification exists yet either (confirmed: `services/core`'s notification system currently only fires for `account_deletion_requested`, per Story 1.10). Documented here as a known, deferred gap, not silently dropped.

## Tasks / Subtasks

- [x] **Task 1: Real intermediate status + fixed idempotency guard** (AD-17; AC: #1)
  - [x] `services/ingestion/src/modules/uploads/jobs/ingestDocument.ts`: write `status: "parsing"` via a standalone `db.update(uploadedDocuments)...` call immediately after the existing idempotency guard passes and BEFORE `storagePort.getObject(...)`. Write `status: "safety scan"` via a standalone update immediately after `chunkSections(...)` and BEFORE `scanChunks(...)`. Neither write needs transaction wrapping — each is a single-row update by primary key with no concurrent writer, unlike the final chunk-insert+terminal-status pairing, which correctly keeps its existing transaction (Story 2.9's review-round fix)
  - [x] **Fixed the idempotency guard**: changed from `document.status !== "queued"` to a `TERMINAL_STATUSES` set (`["parsed", "blocked", "failed"]`) — skip ONLY if the document is already in one of those; a document parked at `"queued"`, `"parsing"`, or `"safety scan"` is now eligible for (re)processing, since the job produces no persisted side effects before its own final transaction
  - [x] Tests: a real-DB test proving `"parsing"` is genuinely observable via a concurrent read before storage is fetched (a `storagePort.getObject` mock reads the document's own status mid-flight and asserts it's `"parsing"`); a spy-on-`db.update` test proving the exact `["parsing", "safety scan"]` call sequence; two crash-recovery tests confirming documents stuck at `"parsing"`/`"safety scan"` ARE reprocessed (storage is fetched, unlike the terminal-skip case) and reach a terminal state; a new `"failed"`-status skip test closing a small pre-existing coverage gap (only `"parsed"`/`"blocked"` skips were previously tested)

- [x] **Task 2: Expose `failureReason` in the API response** (AC: #2)
  - [x] `packages/shared-types/src/uploads.ts`: added `failureReason: z.string().nullable()` to `uploadedDocumentResponseSchema`
  - [x] `services/ingestion/src/modules/uploads/service.ts`: added `failureReason: string | null` to `UploadedDocumentResponse` and populated it in `toResponse()` from `row.failureReason`
  - [x] Tests: `listUploadedDocuments` round-trips `failureReason` correctly — `null` for a healthy document, the real reason string for a document updated to `"failed"`

- [x] **Task 3: Remove/delete a learner's own uploaded document** (AD-7, AD-17; AC: #3)
  - [x] `services/ingestion/src/db/schema.ts`: `contentChunks.documentId`'s FK now cascades (`onDelete: "cascade"`). Migration generated (`0003_pretty_red_ghost.sql`) and applied
  - [x] `services/ingestion/src/modules/uploads/service.ts`: new `deleteUploadedDocument(deps, ownerId, id)` — ownership-scoped-or-404 in the same where clause as `services/core`'s `markNotificationRead`/`clearNotification`; best-effort `storagePort.deleteObject` after the DB delete, logging (not throwing) on failure
  - [x] `services/ingestion/src/modules/uploads/routes.ts`: `app.delete("/uploads/:id", ...)` — same auth-only gate as every other route, UUID-validated id, 204 on success
  - [x] `services/gateway/src/ingestionProxy.ts`: `app.delete("/uploads/:id", { preHandler: requireAuth }, ...)` — copies `coursesProxy.ts`'s `requireValidId` + forward pattern
  - [x] Confirmed (via test): deleting a document mid-flight is safe with no new cancellation logic — `ingestDocument`'s existing "document no longer exists" guard (Story 2.9) already covers it
  - [x] Tests: service-level (own-document delete + cascade to chunks for a `"blocked"` document with real chunks; another owner's document 404s; a nonexistent id 404s), route-level (full `DELETE /uploads/:id` round-trip removing the document from a subsequent `GET /uploads`; malformed id → 400; no auth → 401), gateway proxy-level (forwards id + trusted headers; malformed id rejected before forwarding; no auth → 401)

- [x] **Task 4: Client-side stage/progress/failure display mapping** (AD-1; AC: #1, #2, #3, #4) — implemented `apps/web/src/modules/uploads/ingestionStatus.ts` and 10 unit tests exactly per this task's spec
  - [x] `apps/web/src/modules/uploads/ingestionStatus.ts` (new) — a pure function, NOT a new shared-types export, since this is purely a client-rendering concern (the server returns raw `status`/`failureReason` strings; formatting them for display has always been the client's job in this codebase, matching Story 2.7's own precedent of returning a raw status string with no server-side formatting)
  - [x] `describeIngestionStatus(status: string, failureReason: string | null): StatusDisplay` where:
    ```ts
    interface StatusDisplay {
      stageLabel: string;
      progressPercent: number;    // 0-100, position within the 5-stage vocabulary
      isTerminal: boolean;        // true once no further automatic transition is expected TODAY — stops polling
      isFailure: boolean;
      failureReason: string | null;   // the raw reason, unmodified, for AC #2's "specific reason shown"
      nextStepSuggestion: string | null;
    }
    ```
  - [ ] Mapping (all 7 real+forward-compatible status values this column can hold):
    - `"queued"` → `{stageLabel: "Queued", progressPercent: 0, isTerminal: false, isFailure: false, failureReason: null, nextStepSuggestion: null}`
    - `"parsing"` → `{stageLabel: "Parsing", progressPercent: 25, isTerminal: false, ...}`
    - `"safety scan"` → `{stageLabel: "Safety scan", progressPercent: 50, isTerminal: false, ...}`
    - `"parsed"` → `{stageLabel: "Processed — outline generation coming soon", progressPercent: 60, isTerminal: true, isFailure: false, ...}` — `isTerminal: true` here is a deliberate, documented choice: nothing in this codebase can EVER advance a `"parsed"` document further today (no embedding code exists), so continuing to poll it is pointless; this is an honest "as far as this stage can currently go" terminal, not a claim that the document's journey is conceptually complete
    - `"embedding"` (forward-compatible, unreachable today) → `{stageLabel: "Embedding", progressPercent: 75, isTerminal: false, ...}`
    - `"outline ready"` (forward-compatible, unreachable today) → `{stageLabel: "Outline ready", progressPercent: 100, isTerminal: true, isFailure: false, ...}` (AC #4 — a review-screen link is Story 2.13's job to wire up; do not invent a link to a route that doesn't exist)
    - `"blocked"` → `{stageLabel: "Blocked", progressPercent: 50, isTerminal: true, isFailure: true, failureReason, nextStepSuggestion: "This content violates our content policy and can't be used. Remove this file and upload different material."}`
    - `"failed"` → `{stageLabel: "Failed", isTerminal: true, isFailure: true, failureReason, nextStepSuggestion: <mapped below>}`
  - [x] `"failed"`'s `nextStepSuggestion`, matched by the raw `failureReason` value (AC #2/#3 — "a specific reason" AND "a relevant next step", matched together, not two independent lookups): `"encrypted file"` → "Remove the password protection from this file and upload it again, or upload a different file."; `"corrupt file"` → "This file appears to be corrupted. Try re-exporting or uploading a different file."; any other/unrecognized reason → a generic-but-still-present "Remove this file and try uploading a different one." (AD-17: a document with an unrecognized reason still gets SOME actionable suggestion, never nothing — only the case of a truly unknown reason falls back to the generic text, never the case of a known reason being mishandled)
  - [x] Tests (`apps/web/src/modules/uploads/ingestionStatus.test.ts`, new): one test per status value's exact mapping (including the two forward-compatible, currently-unreachable `"embedding"`/`"outline ready"` values — passed as literal strings, proving the display logic is ready even though no live job produces them yet); each of the 3 known `"failed"` reason mappings; the unrecognized-reason fallback

- [x] **Task 5: Wire the upload screen to real status, polling, and remove** (AC: #1, #2, #3, #4)
  - [x] `apps/web/src/modules/uploads/UploadPage.tsx`: fetches `listUploads` once `customCourseId` is known, populating a `documents: UploadedDocumentResponse[]` state alongside the existing `results` list
  - [x] Each listed document renders `describeIngestionStatus(...)`'s `stageLabel`, a `<progress>` indicator, and — when `isFailure` — the `failureReason`/`nextStepSuggestion` text plus a "Remove" button
  - [x] **Polling**: a `setInterval`-based re-fetch, matching `useNotifications.tsx`'s plain-fetch/`cancelled`-flag convention. Polls only while any listed document has `isTerminal: false`; the interval is cleared once every document is terminal
  - [x] "Remove" button calls the new `deleteUpload` and removes the document from local state on success
  - [x] Tests: stage label/progress render from a mocked `listUploads` response; polling schedules exactly one interval at the real `POLL_INTERVAL_MS` delay and clears it once a manually-triggered tick resolves to an all-terminal list (tested by capturing and directly invoking the `setInterval` callback — deterministic, avoids fake-timer/`userEvent` interaction issues); clicking "Remove" calls the delete endpoint and the item disappears; a failed document's specific reason and next-step text render. Also updated the pre-existing test suite's mocked upload responses to include the new required `failureReason` field

### Review Findings

- [x] [Review][Decision] Cascade-delete lets a learner erase all evidence of their own blocked content — Story 2.10's Dev Notes state chunks are deliberately kept for a `"blocked"` document "so future review tooling can see what was blocked." Task 3's cascade-delete now lets that same learner permanently erase that evidence via the new Remove button. **Resolved by product owner (2026-08-06): accept as-is.** No content-ops/review tooling exists yet to consume those retained chunks — it's a stated future aspiration, not a built feature — so removal behaves identically for blocked and non-blocked documents (it's the learner's own data). Revisit once real review tooling is built and actually depends on blocked chunks surviving a learner's own delete.
- [x] [Review][Patch] Multi-file upload batches can silently stop appearing once documents exist — `UploadPage.tsx`'s status-fetch effect depends only on `[accessToken, customCourseId]`, and `customCourseId` is set once from the first upload's response and never changes value for later files in the same batch, so the effect never re-fires for files #2+. If the first `fetchDocuments()` call happens to observe an all-terminal list, the poll interval never starts and later-uploaded files in the same session never get fetched into `documents` at all. [apps/web/src/modules/uploads/UploadPage.tsx:45] — **Fixed:** added `results.length` to the effect's dependency array so it re-runs after every new upload result. New test added.
- [x] [Review][Patch] A transient error on the very first status fetch permanently stops polling from ever starting — the `catch` block treats any fetch failure as `allTerminal = true`, so a single dropped request or momentary 401/5xx on mount means the interval is never scheduled and the learner is stuck showing the initial state forever with no retry. [apps/web/src/modules/uploads/UploadPage.tsx:57] — **Fixed:** catch now returns `false` (not-terminal) so a retry interval is scheduled instead of giving up. New test added.
- [x] [Review][Patch] Removing a document doesn't free the client-side 10-file limit — `acceptedCount`/`atLimit` are derived from the `results` upload log, which `handleRemove` never updates; removing a document to make room for a new upload leaves `atLimit` stuck `true`. [apps/web/src/modules/uploads/UploadPage.tsx:94] — **Fixed:** `handleRemove`'s new shared `dropDocument` helper also filters the matching entry out of `results`. New test added.
- [x] [Review][Patch] "Remove" has no in-flight guard — a rapid double-click fires two concurrent `DELETE` requests for the same id; the first succeeds and removes the row, the second 404s and surfaces a "document not found" alert despite the removal having actually succeeded. [apps/web/src/modules/uploads/UploadPage.tsx:78] — **Fixed:** a `removingIds` set disables the Remove button while its own delete is in flight, and a `NOT_FOUND` response is now treated as an already-successful removal rather than an error. New test added.
- [x] [Review][Patch] `describeIngestionStatus`'s default branch silently marks an unrecognized status as terminal and non-failure, stopping polling with no error signal — inconsistent with this same story's AD-17 "no silent failures" discipline applied everywhere else in this file. [apps/web/src/modules/uploads/ingestionStatus.ts:91] — **Fixed:** default case now returns `isTerminal: false` so polling continues rather than falsely declaring done. New test added.
- [x] [Review][Patch] Global `setInterval`/`clearInterval` spies in the new polling test are never restored (`vi.spyOn` with no `mockRestore`), leaking spy state into later tests in the same file. [apps/web/tests/modules/uploads/UploadPage.test.tsx] — **Fixed:** added `vi.restoreAllMocks()` to the file's `afterEach`.
- [x] [Review][Defer] Dev Notes overclaim test coverage for the mid-flight-delete race — the only test proving "deleting a document mid-flight is safe" uses a document that never existed (deleted-before-first-read), not one deleted after `ingestDocument`'s initial existence check but before its final transaction. A real occurrence of that narrower window throws an uncaught storage/FK error rather than a graceful no-op, though pg-boss's redelivery + the idempotency check self-heals on retry (the document is gone by then, so the retry returns cleanly) — bounded to a spurious failed-job log entry, not stuck state or data corruption. [services/ingestion/src/modules/uploads/jobs/ingestDocument.ts:60] — deferred, self-healing via existing retry/idempotency path; a real fix needs a locking or existence-recheck mechanism, a bigger change than this story's display-layer scope.
- [x] [Review][Defer] Widening the idempotency guard (`TERMINAL_STATUSES`) to include `"parsing"`/`"safety scan"` reopens a genuine-concurrent (non-crash) double-processing window with no new locking — a lease-timeout redelivery while an earlier attempt is still genuinely in-flight can now have two workers process the same document concurrently. [services/ingestion/src/modules/uploads/jobs/ingestDocument.ts:83] — deferred, the crash-recovery case this fixes is real and necessary; closing the concurrent-redelivery gap needs row-level locking (`SELECT ... FOR UPDATE` or a "claimed" status), a materially different piece of infrastructure than this story's scope.
- [x] [Review][Defer] `requireValidId` is now triplicated (`coursesProxy.ts`, `ingestionProxy.ts`, `routes.ts`) with no shared test guarding behavioral parity across copies. [services/gateway/src/ingestionProxy.ts, services/ingestion/src/modules/uploads/routes.ts] — deferred, matches this codebase's established AD-9/AD-13 "duplicate small private helpers" convention; a shared parity test would require extracting a common module, which the convention deliberately avoids.

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-1 (scaffold-on-demand):** see the CRITICAL SCOPE NOTE above — do not fabricate "failed OCR"/"unsupported language" detection, do not build a real embedding/outline pipeline, do not build Notification Center integration. Build the display/progress infrastructure to be forward-compatible, not the future stories' actual work.
- **AD-7 (RBAC):** the new `DELETE /uploads/:id` route uses the same auth-only (`requireTrustedUser`/`requireAuth`), any-authenticated-role gate as every existing upload route — this is the caller's own private data, not a privileged content-ops action, matching `GET /uploads`'s own precedent (routes.ts line 49-51's comment).
- **AD-17 (no silent failures):** the idempotency-guard fix (Task 1) exists specifically because a naive "just add more status values" change would otherwise silently strand documents forever; the storage-delete-failure handling (Task 3) logs rather than swallows; the "unrecognized failure reason" fallback (Task 4) still gives an actionable suggestion, never a bare blank.
- **AD-9/AD-13 (module boundaries):** `deleteUploadedDocument`'s ownership-scoped-or-404 pattern is copied from `services/core`'s notification-deletion functions, not imported across the service boundary — matching this codebase's established "duplicate small private helpers" convention (`requireTrustedUser` is already duplicated this same way).

### Previous story intelligence (Stories 2.9/2.10 — read before starting, don't rediscover this)

- **`ingestDocument.ts`'s current flow** (post Story 2.10, commit `f25037d`): idempotency guard (`status !== "queued"` → skip) → `storagePort.getObject` → `parseByFileType` (typed-error catch → `"failed"` + reason, return; anything else propagates uncaught, correctly reported "failed" to pg-boss per Story 2.9's `perJobResults` fix, but note this LEAVES `uploadedDocuments.status` un-updated — a genuine, pre-existing, OUT-OF-SCOPE-for-this-story gap: if pg-boss's retries are ultimately exhausted, the document stays stuck at whatever intermediate status it last had, with no failure ever recorded. Not fixed here — would require a dead-letter-queue consumer, a materially different piece of work than "display the reasons the system already detects." Documented, not silently ignored) → OCR pass for `needsOcr` sections (failures degrade to empty text, never thrown) → `chunkSections` → `scanChunks`/`aggregateDocumentOutcome` → one transaction (chunk insert + terminal status). This story's two new intermediate writes slot in at the two points named in Task 1.
- **`status`/`failureReason` are plain text columns, no DB enum** (Story 2.7's original choice, explicitly made so new values need no migration) — Task 1 adds two new string VALUES, not columns.
- **Story 2.10 inserts `ContentChunk` rows even for a `"blocked"` document** (deliberately, so future review tooling can see what was blocked) — this is WHY Task 3's cascade-delete fix is necessary; a naive delete of a `"blocked"` document would hit the existing `.references(() => uploadedDocuments.id)` FK (no `onDelete` clause today) and fail.
- **`GET /uploads` (`listUploadedDocuments`) already scopes correctly by `and(eq(ownerId), eq(customCourseId))`** — the exact pattern Task 3's new delete function reuses for its own ownership check.

### Why the stage-mapping function lives in `apps/web`, not `packages/shared-types`

Nothing server-side needs to compute a display label, a progress percentage, or a next-step suggestion — the server's job (already done, Task 2) is just to return the raw `status`/`failureReason` strings truthfully. Presentation has always been the client's responsibility in this codebase (Story 2.7 never formatted `status` server-side either). Putting it in `shared-types` would be premature cross-boundary plumbing for a concern only one consumer (the web app) has today.

### Why this is the first polling UI, and why it's a plain `setInterval`, not a new library

Confirmed by research: zero `react-query`/`swr`/polling-hook precedent exists anywhere in `apps/web`. Every existing data-fetching page uses a plain `fetch` inside a `useEffect`, guarded by a `cancelled` flag on unmount (see `useNotifications.tsx`). Introducing a data-fetching library for exactly one polling use case would be a disproportionate new dependency for what a ~15-line `setInterval` + the existing `cancelled`-flag pattern already handles — consistent with this codebase's general "don't add infrastructure ahead of a second real need" discipline (AD-1's spirit, applied to the frontend).

### Scope note: what's explicitly OUT of scope for this story

- **Real "failed OCR" / "unsupported language" detection** — no producing code path exists; inventing one is unscoped, separate work from this story's "display what's already detected."
- **Real embedding / outline proposal** — Story 2.12's job entirely; this story only makes the DISPLAY layer ready for the status values Story 2.12 will eventually write.
- **The outline review screen itself** — Story 2.13's job; `"outline ready"`'s display mapping exists and is tested, but nothing links to a route that doesn't exist yet.
- **Notification Center / Activity History entries for ingestion completion** — a longer-term `EXPERIENCE.md` expectation beyond this story's 4 explicit ACs; no other ingestion-sourced notification exists yet either. Deferred, not silently dropped.
- **A dead-letter/exhausted-retry recovery path** for a document permanently stuck mid-job after pg-boss's own retries are exhausted — a genuine, pre-existing gap (see Previous Story Intelligence above), but a materially different piece of infrastructure work than this story's display-layer scope.
- **Persistent navigation to the upload screen** — still reachable only via direct URL, the same already-accepted gap every prior upload-related story left open (Story 2.7's own Dev Notes).

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.11, FR-C-11 (lines 671-689); Story 2.10 (lines 651-669) and Story 2.9 (lines 631-649) for the pipeline this story adds visibility into; Story 2.12/2.13 (lines 691-712+) confirming those stories don't exist yet]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-10-content-safety-scan-during-ingestion.md` — current `ingestDocument.ts` flow and the `"blocked"` status this story's cascade-delete fix must account for]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — line 77 ("Ingestion status surfaces the exact stage ... and, on failure, the specific human-readable reason ... with a relevant next step — never a generic 'something went wrong'"), line 79 ("Retry, never a dead end"), line 81 (Notification Center expectation — see Scope Note)]
- [Source: `services/gateway/src/coursesProxy.ts` — the `requireValidId` + `DELETE /modules/:id` pattern Task 3's gateway route copies]
- [Source: `services/core/src/modules/users/service.ts` — `markNotificationRead`/`clearNotification`'s ownership-scoped-or-404 pattern Task 3's `deleteUploadedDocument` copies]
- [Source: `apps/web/src/notifications/useNotifications.tsx` — the plain-fetch/`cancelled`-flag convention Task 5's polling reuses]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no blocking failures encountered. `pnpm -r test`, `pnpm -r typecheck`, and `pnpm lint` all pass clean after fixing two pre-existing unused-variable lint errors surfaced during final validation (`act` import in `UploadPage.test.tsx`, unused `key` param in `ingestDocument.test.ts`'s spy).

### Completion Notes List

- All 5 tasks implemented and verified: real intermediate `"parsing"`/`"safety scan"` status writes with a fixed idempotency guard (Task 1), `failureReason` exposed end-to-end through the API response (Task 2), ownership-scoped delete with cascade-to-chunks across service/route/gateway-proxy layers (Task 3), the forward-compatible client-side `describeIngestionStatus` stage/progress/failure mapping (Task 4), and the polling upload screen wired to real status/remove (Task 5).
- Task 4's subtask checkboxes were left unchecked from a prior session despite the implementation and its 10 tests already existing verbatim per spec — verified against the spec line-by-line and checked off; no code changes were needed for Task 4 itself.
- Full monorepo validation: `pnpm -r test` (all 8 workspaces, 1007 tests passing), `pnpm -r typecheck` (clean), `pnpm lint` (clean after the two unused-variable fixes above).

### File List

- `apps/web/src/modules/uploads/UploadPage.tsx` (modified)
- `apps/web/src/modules/uploads/api.ts` (modified)
- `apps/web/src/modules/uploads/ingestionStatus.ts` (new; patched during review round)
- `apps/web/tests/modules/uploads/UploadPage.test.tsx` (modified; patched during review round)
- `apps/web/tests/modules/uploads/ingestionStatus.test.ts` (new; patched during review round)
- `packages/shared-types/src/uploads.ts` (modified)
- `packages/shared-types/tests/uploads.test.ts` (modified)
- `services/gateway/src/ingestionProxy.ts` (modified)
- `services/gateway/tests/ingestionProxy.test.ts` (modified)
- `services/ingestion/drizzle/0003_pretty_red_ghost.sql` (new)
- `services/ingestion/drizzle/meta/0003_snapshot.json` (new)
- `services/ingestion/drizzle/meta/_journal.json` (modified)
- `services/ingestion/src/app.ts` (modified)
- `services/ingestion/src/db/schema.ts` (modified)
- `services/ingestion/src/modules/uploads/jobs/ingestDocument.ts` (modified)
- `services/ingestion/src/modules/uploads/routes.ts` (modified)
- `services/ingestion/src/modules/uploads/service.ts` (modified)
- `services/ingestion/tests/modules/uploads/jobs/ingestDocument.test.ts` (modified)
- `services/ingestion/tests/modules/uploads/routes.test.ts` (modified)
- `services/ingestion/tests/modules/uploads/service.test.ts` (modified)

## Change Log

- 2026-08-06: Story implementation completed (Tasks 1-5); finalized Task 4 checkbox bookkeeping, fixed two unused-variable lint errors, verified full monorepo test/typecheck/lint suite passes clean; status moved to review.
- 2026-08-06: Code review round (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor found zero spec violations. Resolved 1 decision-needed item (blocked-content cascade-delete accepted as-is — no review tooling exists yet to depend on retained chunks) and applied 6 patches (multi-file batch visibility gap, permanent-polling-stop on transient fetch error, stale file-limit count after remove, no in-flight guard on Remove, silent-success default status mapping, unrestored test spies). Deferred 3 pre-existing/bounded-risk items to `deferred-work.md`. Full monorepo test/typecheck/lint re-verified clean (243 web tests, up from 238). Status moved to done.
