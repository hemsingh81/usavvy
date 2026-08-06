---
baseline_commit: e79b8d66141fb662261bdb2c28287a55f80b2f05
---

# Story 2.10: Content safety scan during ingestion

Status: done

*(Epic 2, FR-C-13. Runs immediately after Story 2.9's parse/chunk step, inside the SAME `ingestDocument` job — this story extends that job rather than adding a second one. It introduces the first "blocked" terminal status for `UploadedDocument` and the first per-chunk classification field on `ContentChunk`, but adds NO new entity: both changes are columns on the two tables `services/ingestion` already owns per AD-14's ownership table.)*

## Story

As a platform operator,
I want every ingested document scanned for policy-violating content,
so that unsafe or non-compliant material is blocked or flagged before it reaches a learning session.

## Acceptance Criteria

1. **Given** ContentChunks produced by the parsing step (Story 2.9) for an UploadedDocument **When** the content safety scan runs against those chunks **Then** each chunk is checked against policy categories, and the scan result (clear, flagged, or blocked) is recorded against the UploadedDocument
2. **Given** a document where the safety scan finds content that clearly violates policy (e.g. content in a blocked category) **When** the scan completes **Then** the document's ingestion is halted, its status is set to `blocked`, and no further chunks proceed to embedding or outline proposal
3. **Given** a document where only a minority of chunks are flagged as borderline **When** the scan completes **Then** the document proceeds through ingestion with the flagged chunks marked, and the flag is recorded for downstream review rather than blocking the whole document
4. **Given** a document that passes the safety scan cleanly **When** the scan completes **Then** the document's status advances to allow embedding and outline proposal to proceed with no learner-visible interruption

## Tasks / Subtasks

- [x] **Task 1: Schema changes** (AD-14; AC: #1, #2, #3, #4)
  - [x] `db/schema.ts`: add to `contentChunks`: `safetyStatus` (text, not null, default `"clear"` — one of `"clear" | "flagged" | "blocked"`, a plain text column with no DB enum, matching this codebase's established `status` convention from Story 2.7/2.9), `safetyCategory` (text, nullable — the policy category name that matched, null when `safetyStatus` is `"clear"`)
  - [x] `db/schema.ts`: no new column needed on `uploadedDocuments` — `status` is already a free-text column (Story 2.7); this story simply adds `"blocked"` as a new value alongside `"queued"`/`"parsed"`/`"failed"`, and reuses the existing `failureReason` column for the blocked reason (e.g. `"blocked: <category>"`). Update the column's doc comment (currently lines 22-24, written in Story 2.9) to mention `"blocked"` — it currently only forward-references Story 2.11's stage names and is now stale
  - [x] Migration generated (`drizzle-kit generate`) and applied against the live `usavvy_ingestion` database — this migration ONLY touches `content_chunks` (two new columns); no migration needed for `uploaded_documents`

- [x] **Task 2: Content safety scan module** (AD-1; AC: #1, #2, #3)
  - [x] `modules/uploads/contentSafety.ts` (new, sibling to `chunking.ts` — a plain pure module, NOT a new port). **No `ModerationPort`/`ContentSafetyPort` abstraction exists anywhere in this codebase today** (confirmed by research — the only port-worthy precedent, AD-3's conceptual `SafetyFilter`, is explicitly scoped to `GenerationPort`/`VoicePort`/real-time chat, not batch document ingestion, and no `generation`/`voice` service exists yet to own it). Per AD-1's scaffold-on-demand principle, do NOT invent a port abstraction for a single hardcoded implementation with no swappable second adapter — that's exactly the "build ahead of need" AD-1 warns against. If a real external moderation vendor is ever integrated, that future story introduces the port then.
  - [x] **No policy-category taxonomy or vendor is specified anywhere in the PRD/epics/architecture** (confirmed by research — the AC text says only "checked against policy categories" / "content in a blocked category" with zero enumeration). Follow this exact story's own precedent chain — Story 2.7's page-count regex, Story 2.8's HTML-stripping regex, Story 2.9's font-size heading heuristic — and implement a small, honest, DOCUMENTED keyword/pattern-based heuristic: a hardcoded table of policy categories, each tagged with a severity (`"blocked"` or `"flagged"`) and a short list of matching keywords/patterns. Suggested categories (adjust naming as needed, but keep the blocked/flagged split): `"blocked"` severity for unambiguous, high-harm categories (e.g. explicit sexual content involving minors, credible violent threats, self-harm instructions); `"flagged"` severity for lower-severity borderline categories (e.g. profanity, mild harassment language) that warrant human review but shouldn't halt ingestion on their own. Document this plainly as a cheap heuristic — "good enough to catch obvious cases and route borderline ones to review, not a production-grade classifier" — same honesty standard as the three prior stories
  - [x] `scanChunkText(text: string): { status: "clear" | "flagged" | "blocked"; category: string | null }` — checks the text against the category table; if multiple categories match, `"blocked"` severity wins over `"flagged"` (report the first/highest-severity match)
  - [x] `scanChunks(chunks: Chunk[]): ScannedChunk[]` — maps `scanChunkText` over every chunk, returning each `Chunk` with `safetyStatus`/`safetyCategory` attached
  - [x] `aggregateDocumentOutcome(scannedChunks: ScannedChunk[]): { status: "blocked" | "parsed"; failureReason: string | null }` — **any** chunk with `safetyStatus: "blocked"` makes the WHOLE document `"blocked"` (AC #2), with `failureReason` set to `"blocked: <category>"` of the first blocked chunk found. Otherwise the document is `"parsed"` (AC #3/#4) regardless of how many chunks are merely `"flagged"` — AC #3's "minority" phrasing describes the realistic common case, not a numeric threshold to compute; nothing in the ACs defines a percentage gate, and inventing one would be guessing at an unspecified requirement. A `"flagged"` chunk is recorded (via `contentChunks.safetyStatus`) for downstream review per AC #3, but never itself halts the document — only `"blocked"` does
  - [x] Tests: `scanChunkText` returns `"clear"`/`null` for ordinary content, the correct `"flagged"` category for borderline text, the correct `"blocked"` category for clearly-violating text, and correctly prioritizes a blocked match over a flagged match when both are present in the same chunk; `aggregateDocumentOutcome` returns `"blocked"` when any chunk is blocked (regardless of how many other chunks are clear/flagged), `"parsed"` when chunks are a mix of clear and flagged with none blocked, and `"parsed"` when all chunks are clear

- [x] **Task 3: Wire the scan into the existing `ingestDocument` job** (AD-17; AC: #1, #2, #3, #4)
  - [x] `jobs/ingestDocument.ts`: **extend the SAME job handler — do not add a second job/queue.** Story 2.9's review round fixed a real crash-between-writes race by wrapping the chunk-insert and status-update in one transaction (lines ~97-105 currently); a second queued stage for the safety scan would read back already-committed chunks and reintroduce that exact class of race (a crash between "chunks scanned" and "document status updated" leaving chunks stuck unscanned with no idempotency signal). Instead: after `chunkSections(parsed.sections)` produces `chunks` and BEFORE the existing transaction, call `scanChunks(chunks)` then `aggregateDocumentOutcome(...)` — both pure, synchronous, in-memory operations requiring no extra I/O
  - [x] Insert each `ContentChunk` row (inside the existing transaction) WITH its `safetyStatus`/`safetyCategory` already computed — chunks belonging to a blocked document ARE still inserted (AC #2 says no chunks "proceed to embedding or outline proposal," not that they're never persisted — the scan operates on chunks that were already produced by the parse step, per AC #1's own "Given" clause, and downstream stories (2.12 embedding) will gate on `uploadedDocuments.status`, not on chunk existence)
  - [x] Update the document's `status`/`failureReason` inside the SAME transaction, using `aggregateDocumentOutcome`'s result — `"blocked"` + reason, or `"parsed"` (the existing Story 2.9 success value; do not invent new intermediate status values like "safety scan" here — that full stage vocabulary is Story 2.11's explicit job, per its own AC #1 listing `queued/parsing/safety scan/embedding/outline ready`; this story only needs the one new terminal value, `"blocked"`, that its own ACs require)
  - [x] The existing idempotency guard (`if (document.status !== "queued") { ...; return; }`, added in Story 2.9's review round) needs NO change — it already covers this story's new code path, since the scan now runs unconditionally as part of the same "queued" → terminal-status transition
  - [x] Tests (extend `tests/modules/uploads/jobs/ingestDocument.test.ts`): a document whose real parsed fixture text contains a blocked-category match → `status: "blocked"`, `failureReason` set, ALL its chunks still inserted with the correct per-chunk `safetyStatus`/`safetyCategory` values; a document with a minority of chunks matching a flagged-only category → `status: "parsed"`, the matching chunk(s) show `safetyStatus: "flagged"` with the right category, the rest show `"clear"`; the existing all-clean fixtures (`valid-text.pdf` etc.) continue to reach `status: "parsed"` with every chunk `safetyStatus: "clear"` (no regression to Story 2.9's happy path)

- [x] **Task 4: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 2-3 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** no new entity. `contentChunks.safetyStatus`/`safetyCategory` and a new `uploadedDocuments.status` value are the full schema footprint — `services/ingestion` still owns exactly `UploadedDocument, ContentChunk` per the spine's ownership table.
- **AD-1 (scaffold-on-demand):** do not build a `ModerationPort` for a single hardcoded implementation (see Task 2) — that is the exact "build ahead of need" AD-1 forbids. Do not invent Story 2.11's full status vocabulary early (see Task 3) — build only the one new status value (`"blocked"`) this story's own ACs require.
- **AD-17 (no silent failures):** the two outcomes (`blocked` vs `parsed`) must remain genuinely distinguishable via `failureReason`, matching Story 2.9's `"encrypted file"`/`"corrupt file"` precedent exactly (Story 2.11's AC #2 explicitly lists "a safety-scan block" alongside those as one of the distinct failure-reason categories learners will see).
- **AD-8 (test mirroring):** see Task 4.

### Why this is a plain module, not a new port (read before reaching for a port abstraction)

Research confirmed: no `ModerationPort`/`ContentSafetyPort`/`PolicyPort` exists anywhere in this codebase. The only related architecture concept, AD-3's `SafetyFilter`, is textually scoped to `GenerationPort`/`VoicePort` (AI-generated output) and real-time human chat — NOT batch document ingestion — and its owning services (`generation`, `voice`) don't exist yet (AD-1 scaffold-on-demand: they're built when their own epic starts). This story's scan is a separate, self-contained bounded context with no existing abstraction to conform to and, critically, no second implementation to swap against today — a port exists to let two adapters vary independently (e.g. `StoragePort`'s mock/disk/future-S3), and there is only one implementation needed here. Building a port now for a single hardcoded heuristic would be speculative, AD-1-violating architecture. If/when a real external moderation vendor is integrated, that story introduces the port then, using `StoragePort`'s existing pattern as its template.

### Why the scan runs inline in the same job, not a second job/queue stage

Story 2.9's review round found and fixed a real bug: the original `ingestDocument` job inserted chunks and updated status in two separate, unsynchronized statements, so a crash between them left orphaned chunks under a document stuck `"queued"` forever. The fix was wrapping both writes in one transaction. Adding safety-scanning as a SEPARATE job/queue stage (reading back already-committed chunks) would reopen that exact class of race — a crash between "chunks scanned" and "document status updated" with no idempotency signal distinguishing "not yet scanned" from "scan crashed mid-way." Since the scan itself needs no I/O (a pure, synchronous, in-memory keyword check — nothing like OCR's genuine CPU/latency cost that justified Story 2.9's own "why OCR runs inline" reasoning), there is no benefit to a second stage and a real cost in reintroduced race risk. Extend the one transaction Story 2.9 already built.

### Why "minority flagged" (AC #3) isn't implemented as a percentage threshold

AC #3 says "only a minority of chunks are flagged as borderline" as the scenario's setup, and AC #2 is the ONLY acceptance criterion that halts a document (a `"blocked"`-category match). Nothing in the ACs defines what happens if a MAJORITY of chunks are flagged-but-not-blocked, and inventing a percentage gate (e.g. "50%+ flagged also blocks") would be answering a question the story doesn't ask — a documented, honest design choice: any number of `"flagged"` chunks (even all of them) proceeds the document to `"parsed"` with those chunks marked for downstream review; only a `"blocked"` match ever halts. If product feedback later wants a majority-flagged threshold to also halt, that's a follow-up story with an actual specified threshold, not a guess made here.

### Previous story intelligence (Story 2.9 — read before starting, don't rediscover this)

- **`ingestDocument.ts`'s current end-to-end flow** (post review-round patch, commit `e79b8d6`): validate payload → look up `UploadedDocument` (missing → log + return, AD-17) → idempotency guard (`status !== "queued"` → log + return) → fetch bytes via `StoragePort.getObject` → `parseByFileType` (typed-error catch → `status: "failed"` + `failureReason`, return) → OCR fallback for `needsOcr` PDF pages → `chunkSections(parsed.sections)` → **single `db.transaction`**: insert all `contentChunks`, then `update uploadedDocuments set status = "parsed"`. This story's new scan step slots in right after `chunkSections` and right before that transaction, and its outcome becomes part of what the transaction writes (see Task 3).
- **The `status`/`failureReason` columns are plain text, not DB enums, specifically so new values need no schema migration** (Story 2.7's own documented choice) — this story adds a value (`"blocked"`), not a column, to `uploadedDocuments`.
- **Prove "no I/O happened" / "no chunks inserted on failure" claims by querying the actual table, not by asserting on the returned status alone** — apply this to Task 3's "blocked documents still get all their chunks inserted with correct per-chunk safety fields" test (query `contentChunks`, don't just check `uploadedDocuments.status`).
- **Real, checked-in binary/text fixtures over mocked libraries** — this story's scan tests don't need new binary fixtures (the scan operates on already-extracted chunk TEXT, not raw file bytes); use plain string/`Chunk` object test data for `contentSafety.test.ts`, and extend `ingestDocument.test.ts`'s existing PDF/DOCX fixtures only where a full end-to-end job test is needed (Task 3's last bullet) — for those, the simplest approach is a small fixture whose real extracted text contains an intentionally-chosen flagged/blocked keyword, OR (simpler, avoids maintaining another binary fixture) mock storage with a plain in-memory buffer of TXT content containing the test keyword, since `.txt` parsing needs no binary fixture at all (`parsePlainText` takes a raw buffer directly).
- **RBAC role check pitfall:** `ROLES` is `["superadmin", "admin", "mentor", "student"] as const` — not relevant to this story (no new HTTP routes; this is a job-handler-only story, mirroring 2.9's registration-only main.ts change, except this story doesn't even need a `main.ts` change since no new job type is added).

### Scope note: what's explicitly OUT of scope for this story

- **A real external moderation API/vendor integration** — see Dev Notes; a documented keyword heuristic only, matching this epic's established cheap-approximation discipline.
- **A `ModerationPort`/`ContentSafetyPort` abstraction** — see Dev Notes; a plain pure module, not a port, since there's no second implementation to swap against yet.
- **Story 2.11's full ingestion-status stage vocabulary** (`queued`/`parsing`/`safety scan`/`embedding`/`outline ready`) and any learner-facing progress UI — this story only adds the one `"blocked"` terminal status its own ACs require.
- **A numeric "majority flagged also blocks" threshold** — see Dev Notes; not specified by the ACs, not invented here.
- **Embedding/outline proposal gating logic itself** — Story 2.12 will be the first code to actually read `uploadedDocuments.status` to decide whether to embed; this story only ensures `"blocked"` is set correctly for that future code to check.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.10, FR-C-13 (lines 651-669); Story 2.11 AC #1/#2 (lines 677, 679) for the only canonical status-stage-name references in the whole planning corpus; Story 2.9 (lines 631-649) for the immediately-preceding story this one extends]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-9-ingestion-pipeline-parse-ocr-fallback-structure-detection-and-chunking.md` — current `ingestDocument.ts` flow, the transaction/idempotency review-round fixes this story must not undo, the cheap-approximation documentation precedent this story's own heuristic follows]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-3 (`SafetyFilter`'s actual scope — confirmed NOT to cover this story), AD-8, AD-14 (ownership table), AD-17]
- [Source: `_AI-Agile-Development/planning-artifacts/prd.md` — NFR-19 (confirmed scoped to learner input/Avatar output, a different bounded context than this story's batch ingestion scan)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- All 4 tasks implemented and tested via red-green TDD (failing tests written and confirmed failing before each implementation, then made to pass).
- No new port abstraction introduced — confirmed via research that no `ModerationPort`/`ContentSafetyPort` exists anywhere in this codebase, and AD-3's conceptual `SafetyFilter` is scoped to `GenerationPort`/`VoicePort`/real-time chat, not batch ingestion. `contentSafety.ts` is a plain pure module (`scanChunkText`/`scanChunks`/`aggregateDocumentOutcome`), matching `chunking.ts`'s and the parsers' existing style.
- Policy-category taxonomy is a small, hardcoded, documented keyword/regex heuristic (no external moderation vendor specified anywhere in the PRD/epics) — same cheap-approximation discipline as Story 2.7/2.8/2.9. Four categories: `self-harm-instructions`/`credible-violent-threat` (blocked severity), `profanity`/`harassment` (flagged severity). A blocked match always wins over a flagged match in the same chunk.
- `contentChunks` gained two columns (`safetyStatus`, `safetyCategory`) via a new migration (`0002_bitter_butterfly.sql`, generated and applied against the live `usavvy_ingestion` database); `uploadedDocuments` needed no migration — `"blocked"` is simply a new value in its existing free-text `status` column, reusing the existing `failureReason` column for the blocked reason (`"blocked: <category>"`).
- The scan runs inline inside the SAME `ingestDocument` job, right after `chunkSections` and before Story 2.9's existing insert-transaction — not a second queued stage — specifically to avoid reopening the crash-between-writes race Story 2.9's review round closed. All chunks (including any blocked-category chunk) are still inserted, with the document-level `status`/`failureReason` gating what future stories (2.12 embedding) will do with them.
- No numeric "majority flagged also blocks" threshold was implemented — the ACs only define a single halting condition (any blocked-category match); this is documented as a deliberate choice, not an oversight, in Dev Notes.
- Full monorepo regression after this story's changes: all packages pass (`packages/config` 18, `packages/shared-types` 181, `packages/service-kernel` 35, `apps/web` 224, `services/gateway` 106, `services/ingestion` 97, `services/courses` 107, `services/core` 200 in isolation — one `services/core` auth test flaked under full-parallel-suite resource contention, confirmed passing 14/14 in isolation, the same pre-existing flake class already documented for Stories 2.6-2.9 and unrelated to this story's changes). `tsc --noEmit` and `eslint .` both clean.
- **Review-round patch (3-layer adversarial review — see Senior Developer Review below):** fixed 4 confirmed findings, each proven via a failing test written and confirmed failing before the fix, then made to pass: (1) blocked-category regexes required a literal single space, silently missing the exact same phrase when split across a `\n\n` paragraph break (a realistic `.txt`/`.md` input shape, since those parsers preserve paragraph breaks verbatim unlike PDF/DOCX/PPTX, which collapse whitespace) — fixed by switching to `\s+`; (2) `scanChunks` only ever scanned `chunk.text`, never `chunk.heading`, so a policy-violating heading with a clean body was invisible to the scan — fixed by scanning heading+text combined; (3) `/\bsuicide method\b/i`'s trailing word boundary excluded the plural "methods" — fixed to `methods?`; (4) the harassment pattern missed the uncontracted "you are" and real curly/smart-quote apostrophes (what word-processor autocorrect actually produces) — fixed to accept both apostrophe variants and the uncontracted phrasing. Also strengthened test coverage: existing multi-chunk PDF/DOCX/PPTX happy-path tests now assert `safetyStatus: "clear"` on every chunk; the blocked/flagged job-level tests were rewritten from single-chunk to genuine multi-chunk fixtures asserting each chunk's own status independently; added a regression test for the idempotency guard's handling of an already-`"blocked"` document. Documented (not code-fixed, per AD-1) two accepted limitations of a per-chunk keyword heuristic: a phrase can still be split across two separate hard-cut chunks, and single common words used as flagged-tier triggers will over-flag some benign academic content — an accepted trade-off since "flagged" only routes to review and never blocks. Full monorepo regression, typecheck, and lint re-run clean after all fixes landed together.

### File List

- `services/ingestion/src/db/schema.ts` (modified — `contentChunks.safetyStatus`/`safetyCategory`; updated `uploadedDocuments.status`/`failureReason` doc comments to mention `"blocked"`)
- `services/ingestion/drizzle/0002_bitter_butterfly.sql` (new migration)
- `services/ingestion/src/modules/uploads/contentSafety.ts` (new; patched in review round — `\s+` regex fix, heading now scanned, plural/apostrophe/uncontracted-phrasing fixes, accepted-limitations doc comment)
- `services/ingestion/src/modules/uploads/jobs/ingestDocument.ts` (modified — wires `scanChunks`/`aggregateDocumentOutcome` into the existing transaction)
- `services/ingestion/tests/modules/uploads/contentSafety.test.ts` (new; review round added 5 regression tests)
- `services/ingestion/tests/modules/uploads/jobs/ingestDocument.test.ts` (modified — 3 new tests for blocked/flagged/clean safety-scan outcomes; review round strengthened PDF/DOCX/PPTX assertions, rewrote blocked/flagged tests to genuine multi-chunk fixtures, added a `"blocked"`-status idempotency test)

## Senior Developer Review (AI)

**Reviewers:** Blind Hunter, Edge Case Hunter, Acceptance Auditor (3-layer adversarial review, parallel background agents)
**Date:** 2026-08-06
**Outcome:** Changes Requested → all confirmed findings fixed, re-verified, approved

### Summary

Two independent adversarial review layers (Blind Hunter and Edge Case Hunter) independently converged on the same two root findings — the heading-not-scanned gap and the literal-space regex bug (found via different mechanisms: paragraph-join within a chunk vs. hard-cut across chunks) — raising confidence these were real, high-value bugs rather than review noise. Edge Case Hunter additionally found two further regex correctness bugs (plural "methods," apostrophe/uncontracted-phrasing). Acceptance Auditor confirmed all 4 ACs are genuinely implemented with a minor test-depth nitpick. All confirmed bugs were fixed and proven via the "write failing test → confirm it fails → fix → confirm it passes" methodology; two additional Edge Case Hunter findings (chunk-boundary phrase-splitting, common-word false-positive volume) were judged to be inherent, accepted limitations of a cheap per-chunk keyword heuristic (consistent with AD-1) and were documented rather than code-fixed.

### Action Items

- [x] **[High]** `contentSafety.ts`: blocked-category regexes required a literal single space between phrase halves, so the exact same phrase split across a `\n\n` paragraph break (realistic for `.txt`/`.md` input, which preserves paragraph breaks verbatim) silently evaded detection, defeating AC #2. Fixed by switching literal spaces to `\s+` in the multi-word patterns. (Blind Hunter, verified reproducible)
- [x] **[High]** `contentSafety.ts`'s `scanChunks`: only `chunk.text` was scanned, never `chunk.heading` — a chunk with a policy-violating heading and a clean body was entirely invisible to the scan, a real AC #1 gap ("each chunk is checked"). Fixed by scanning heading+text combined. (Edge Case Hunter)
- [x] **[Medium-High]** `contentSafety.ts`: `/\bsuicide method\b/i`'s trailing `\b` excluded the plural "methods" (no boundary exists between "method" and "s"). Fixed to `methods?`. (Edge Case Hunter)
- [x] **[Medium]** `contentSafety.ts`: the harassment pattern only matched the contracted "you're" with a straight apostrophe, missing both the uncontracted "you are" and the curly/smart-quote apostrophe real word-processor autocorrect produces. Fixed to accept both. (Blind Hunter + Edge Case Hunter, independently confirmed the apostrophe issue)
- [x] **[Medium]** Existing multi-chunk PDF/DOCX/PPTX happy-path tests in `ingestDocument.test.ts` never asserted `safetyStatus` at all. Added `every chunk safetyStatus: "clear"` assertions to all three. (Blind Hunter)
- [x] **[Low]** The blocked/flagged job-level tests used single-chunk fixtures, not genuine multi-chunk scenarios, so they couldn't prove per-chunk status is set correctly across multiple chunks. Rewrote both as multi-section markdown fixtures asserting each chunk's own status independently. (Blind Hunter + Acceptance Auditor)
- [x] **[Low]** The idempotency guard's handling of an already-`"blocked"` document specifically was untested (only `"parsed"` was covered). Added a matching regression test. (Edge Case Hunter)
- [x] **[Low, accepted-by-design, documented not code-fixed]** A trigger phrase can still be split across two separate chunks by `chunking.ts`'s own hard-cut, and single common words (e.g. "hell") used as flagged-tier triggers will over-flag benign academic content. Both are inherent to a cheap per-chunk keyword scan and are now explicitly documented in `contentSafety.ts` as accepted trade-offs — the former has no cheap fix within this story's scope (would require cross-chunk overlap scanning), and the latter is acceptable because the "flagged" tier only routes to review and never blocks. (Edge Case Hunter)
- [x] **[Cosmetic]** Story Completion Notes said "five categories" when only four are implemented. Corrected.

## Change Log

- 2026-08-06: Story drafted (create-story) for Epic 2, Story 2.10. Status → ready-for-dev.
- 2026-08-06: Implemented content safety scan (Tasks 1-4): `contentChunks.safetyStatus`/`safetyCategory` columns, a documented keyword-heuristic `contentSafety.ts` module, and wiring into the existing `ingestDocument` job's transaction — no new job/queue, no new port. Full monorepo regression, typecheck, and lint clean. Status → review.
- 2026-08-06: 3-layer adversarial code review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) found and fixed 4 confirmed regex/coverage bugs — literal-space paragraph-break miss, heading never scanned, plural "methods" word-boundary miss, apostrophe/uncontracted-phrasing miss — plus strengthened test coverage and documented two accepted heuristic limitations. Each fix proven via fail-then-pass regression testing. Full monorepo regression, typecheck, and lint clean. Status → done.
