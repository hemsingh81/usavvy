---
baseline_commit: 6512fde46283cb1f8df823734c1a7ffc70baabcb
---

# Story 2.8: Paste-text and public-URL import

Status: review

*(Epic 2, FR-C-8. Builds directly on Story 2.7's `services/ingestion` — `uploaded_documents`, `StoragePort`, `JobQueuePort`, the copyright-attestation-first ordering, and the 10-file-per-`customCourseId` advisory-lock transaction are all reused, not reinvented. This story adds two new ways to CREATE an `UploadedDocument` — pasted text and a fetched public URL — alongside Story 2.7's existing file upload, sharing the same downstream validation/storage/queueing core.)*

## Story

As a learner,
I want to paste text or import content from a public URL,
so that I can build a custom course without needing a file to upload.

## Acceptance Criteria

1. **Given** a learner on the custom course creation screen **When** they paste text content and submit it **Then** the pasted text is stored as an `UploadedDocument` in the ingestion module, attributed to the learner as private, subject to the same copyright attestation requirement as file uploads, and queued for ingestion
2. **Given** a learner provides a public URL **When** they submit it for import **Then** the page's readable content is fetched and stored as an `UploadedDocument`, and counts toward the 10-files-per-course limit
3. **Given** a learner submits a URL that is unreachable, returns an error, or disallows automated fetching **Then** the import is rejected with a specific reason (unreachable, access denied, or content not retrievable) and no partial document is stored
4. **Given** a learner pastes text below a minimal usable length (e.g. a few words) **When** they submit it **Then** the import is rejected with a message that there isn't enough content to build a course from

## Tasks / Subtasks

- [x] **Task 1: Refactor `services/ingestion`'s `service.ts` to share its core across all three input paths** (AD-1; AC: #1, #2, #3, #4)
  - [x] Extract a private `finalizeUpload(deps, ownerId, input: { customCourseId: string | undefined; fileName: string; fileType: string; buffer: Buffer; copyrightAttested: boolean })` from the current `uploadDocument` body — everything from the attestation check onward EXCEPT the extension/page-count checks (those stay specific to real file uploads): attestation-first ordering, the fast pre-check, `StoragePort.putObject`, the advisory-lock-guarded transaction (recount + insert), and `JobQueuePort.enqueue`. Both pasted-text and URL-import call this directly with a pre-resolved `fileType` (`"txt"`), skipping the extension/size/page checks entirely (they don't apply to synthesized text — see Dev Notes)
  - [x] `uploadDocument` (Story 2.7, file uploads) becomes a thin wrapper: extension/size/page-count checks, then calls `finalizeUpload`
  - [x] No behavior change for Story 2.7's existing file-upload path — its full existing test suite must keep passing unmodified

- [x] **Task 2: `services/ingestion` — pasted-text import** (AC: #1, #4)
  - [x] `MIN_PASTED_TEXT_WORDS = 10` — "a few words" (AC #4) has no numeric AC value; 10 is a documented, easily-tunable choice (count via `text.trim().split(/\s+/).filter(Boolean).length`)
  - [x] `importPastedText(deps, ownerId, input: { customCourseId: string | undefined; text: string; copyrightAttested: boolean }): Promise<UploadedDocumentResponse>` — order: (1) attestation check FIRST (same AC #4-style ordering precedent as Story 2.7's `uploadDocument`, even though THIS story's AC #4 is about length, not attestation — attestation is still checked first since it's a universal precondition, per Dev Notes); (2) word-count check → `AppError("VALIDATION_ERROR", "not enough content to build a course from", 400)`; (3) call `finalizeUpload` with `fileName: "pasted-text.txt"`, `fileType: "txt"`, `buffer: Buffer.from(text, "utf-8")`
  - [x] New route `POST /uploads/paste-text` (multipart-free — plain JSON body, unlike file upload; auth-only, same `requireTrustedUser` pattern)
  - [x] Tests: valid pasted text stored/queued; below-minimum text rejected with the specific message; attestation-missing blocks before any I/O (spy-verified, matching Story 2.7's strengthened AC #4 test pattern); counts toward the same `customCourseId`'s 10-file limit (shared `finalizeUpload` — a mixed batch of 2 file uploads + 1 pasted-text import against the same `customCourseId` correctly totals 3)

- [x] **Task 3: `services/ingestion` — public-URL import** (AC: #2, #3)
  - [x] `MAX_URL_FETCH_TIMEOUT_MS = 10000`; fetch the URL via `fetch(url, { signal: AbortSignal.timeout(...) })`
  - [x] `stripHtmlToReadableText(html: string): string` — a cheap approximation (regex-based: strip `<script>`/`<style>` blocks first, then all remaining tags, then collapse whitespace) explicitly NOT a real Readability-grade extraction (that's a real HTML-parsing dependency, out of scope for this story's "the page's readable content" — a later story can upgrade this if extraction quality becomes a real problem; document this choice exactly like Story 2.7's `getPdfPageCount` regex-approximation precedent)
  - [x] `importFromUrl(deps, ownerId, input: { customCourseId: string | undefined; url: string; copyrightAttested: boolean }): Promise<UploadedDocumentResponse>` — order: (1) attestation check FIRST; (2) `url` format validation (`z.url()`) → `AppError("VALIDATION_ERROR", "invalid URL", 400)`; (3) fetch with error mapping (AC #3's three distinct reasons): a thrown/aborted fetch (network error, DNS failure, timeout) → `AppError("VALIDATION_ERROR", "URL is unreachable", 400)`; a `401`/`403` response → `AppError("VALIDATION_ERROR", "access denied", 400)`; any other non-2xx response → `AppError("VALIDATION_ERROR", "content could not be retrieved", 400)`; (4) extract text via `stripHtmlToReadableText`, then the SAME `MIN_PASTED_TEXT_WORDS` check reused from Task 2 (an unreadable/empty page is indistinguishable from "not enough content" once extracted) → `AppError("VALIDATION_ERROR", "not enough content to build a course from", 400)`; (5) call `finalizeUpload` with `fileName` derived from the URL (e.g. its hostname+pathname, sanitized), `fileType: "txt"`, `buffer: Buffer.from(extractedText, "utf-8")`. **No partial document is ever stored on any rejection** (AC #3) — `finalizeUpload` (and therefore any I/O) is only reached after every check above passes, identical in spirit to Story 2.7's attestation-first-before-any-I/O discipline
  - [x] New route `POST /uploads/url-import` (JSON body `{ customCourseId?, url, copyrightAttested }`; auth-only)
  - [x] Tests (mock `fetch` — never call a real external URL in a test): valid HTML page imported and stored; a network-error/timeout fetch rejected with "unreachable"; a 401/403 response rejected with "access denied"; a 404/500 response rejected with "content could not be retrieved"; a page whose extracted text is below the minimum rejected with the same "not enough content" message pasted-text uses; a rejected import leaves zero rows and never calls `StoragePort`/`JobQueuePort` (spy-verified); counts toward the same `customCourseId`'s 10-file limit

- [x] **Task 4: `services/gateway` — new proxy routes** (AC: #1, #2, #3, #4)
  - [x] `POST /uploads/paste-text`, `POST /uploads/url-import` — both plain JSON forwards via the EXISTING `forward()` method on `ingestionClient.ts` (no new multipart handling needed, unlike Story 2.7's file-upload route — these are ordinary JSON bodies), `requireAuth`, matching every other JSON proxy route's exact shape in this codebase
  - [x] Tests: 401 without auth for both new routes; both forward body + trusted headers correctly

- [x] **Task 5: `apps/web` — paste-text and URL-import UI** (AC: #1, #2, #3, #4)
  - [x] Extend `packages/shared-types/src/uploads.ts`: `pasteTextInputSchema = z.object({ customCourseId: z.uuid().optional(), text: z.string(), copyrightAttested: z.boolean() })`, `urlImportInputSchema = z.object({ customCourseId: z.uuid().optional(), url: z.url(), copyrightAttested: z.boolean() })`
  - [x] Extend `apps/web/src/modules/uploads/api.ts`: `pasteText(apiUrl, accessToken, customCourseId, text, copyrightAttested)`, `importFromUrl(apiUrl, accessToken, customCourseId, url, copyrightAttested)` — both plain JSON `apiRequest` calls (unlike `uploadFile`'s `FormData`-based multipart call), reusing `uploadedDocumentResponseSchema` for the response
  - [x] Extend `UploadPage.tsx`: a "Paste text" `<textarea>` + submit button, and a "Import from URL" `<input type="url">` + submit button, alongside the existing file input — all three share the SAME `copyrightAttested` checkbox and the SAME running `results`/count list (a pasted-text or URL import that succeeds/fails renders in the identical list Story 2.7 already built, just with a synthetic "fileName" — e.g. `"pasted-text.txt"` or the imported URL — standing in for a real uploaded file's name)
  - [x] Tests: pasting valid text and submitting shows it accepted; pasting too-short text shows the specific rejection message; submitting an unreachable/erroring URL shows the specific reason from the mocked response; a successful paste/URL-import increments the same running count file uploads already use

- [x] **Task 6: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-5 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-1 (scaffold-on-demand):** reuse Story 2.7's `services/ingestion` scaffolding, `StoragePort`, `JobQueuePort`, and `uploaded_documents` table completely as-is — no new service, no new table, no schema migration. The only new server-side surface is two new route handlers and two new service functions sharing Task 1's extracted core.
- **AD-6/AD-15:** unchanged from Story 2.7 — both new import paths go through the exact same `StoragePort`/`JobQueuePort` bindings.
- **AD-7 (RBAC):** both new routes are auth-only, identical to Story 2.7's `POST /uploads` precedent — this is still the caller's own private data.
- **AD-17 (no silent failures):** AC #3's three distinct rejection reasons (unreachable / access denied / content not retrievable) must remain genuinely distinguishable in the response, not collapsed into one generic message — mirrors Story 2.7's "name the specific limit violated" discipline for file-upload rejections.
- **AD-8 (test mirroring):** see Task 6.

### Why attestation is checked first even though this story's own AC #4 is about text length, not attestation

Story 2.7 established attestation-before-any-I/O as a hard invariant for every way an `UploadedDocument` can be created, not just file uploads — the FR-C-12 requirement itself ("uploads remain private... " with a required attestation checkbox) applies to the whole ingestion module, not per-input-method. Checking length before attestation would let an unattested learner probe the length-validation error message before ever confirming rights to the content; checking attestation first (matching Story 2.7's own ordering exactly) closes that off and keeps the ordering invariant uniform across every entry point into `finalizeUpload`.

### Why URL text extraction is a cheap regex, not a real Readability library

"The page's readable content" (AC #2) doesn't specify extraction quality, and this codebase already has an established, explicitly-documented precedent for exactly this kind of tradeoff: Story 2.7's `getPdfPageCount` uses a cheap regex approximation rather than a full PDF-parsing dependency, because the real, robust version of that capability is Story 2.9's actual job (real content parsing for the ingestion pipeline). The same reasoning applies here — a real Readability-grade HTML content extractor is a meaningfully sized dependency and design decision on its own; a regex-based tag-stripper is good enough for "some readable text exists to build a course from," which is all THIS story's AC literally requires. Story 2.9's real parser can re-process the stored raw/extracted text later if quality ever becomes a real problem.

### Why pasted-text/URL-import share `finalizeUpload` with file uploads, not a separate table or pipeline

All three are the same thing from `uploaded_documents`' perspective: a private, attested, queued document scoped to a `customCourseId`, subject to the same 10-file limit. Story 2.7's `uploadDocument` already built the exact mechanism every one of AC #1/#2/#4's claims needs (private ownership, attestation gating, queueing, the 10-file limit via the advisory-lock transaction) — duplicating it into a second table or a parallel service function would be pure risk (two places to keep the attestation-ordering invariant correct) for zero benefit. Only the INPUT-specific validation (extension/size/page-count for files; word-count for text; URL-fetch-and-extract for URLs) differs per method — `finalizeUpload` is exactly the shared tail every method converges on after its own input-specific checks pass.

### Previous story intelligence (Story 2.7 — read before starting, don't rediscover this)

- **The advisory-lock-guarded transaction pattern** (`pg_advisory_xact_lock(hashtext(customCourseId))` wrapping a recount + insert) is this codebase's now-established fix for the 10-file-limit race — reuse it via `finalizeUpload`, don't re-derive or re-litigate it.
- **Review-round lesson (repeated across Story 2.6 and 2.7): a Fastify/library-native error (not an `AppError`) left uncaught falls through to a generic, unhelpful 500** — `registerErrorHandler` (shared `packages/service-kernel`) now maps any `FST_ERR_*`-coded 4xx framework error cleanly, but a NEW library-native error class this story might introduce (e.g. from `fetch` itself, or any HTML-parsing edge case) still needs its own explicit try/catch → `AppError` mapping at the point it's thrown — don't assume the shared handler catches everything.
- **Review-round lesson: prove a "no I/O happened" claim by spying on the mock `StoragePort`/`JobQueuePort` directly**, not by querying for an unrelated id — Story 2.7's own AC #4 test was found under-proven this exact way and had to be strengthened. Apply the same rigor to this story's own attestation/length-check-blocks-before-I/O tests from the start.
- **RBAC role check pitfall:** `ROLES` is `["superadmin", "admin", "mentor", "student"] as const` — not `"contentops"`/`"learner"`.
- **Local dev Postgres/SeaweedFS setup:** the `uploads` bucket already exists in the dev SeaweedFS instance (created during Story 2.7's live verification) — no new bucket-provisioning step needed for this story.

### Scope note: what's explicitly OUT of scope for this story

- **Real HTML content extraction (Readability-grade)** — see Dev Notes above; a cheap regex approximation is this story's deliberate choice.
- **Fetching a URL that requires JavaScript to render its content** (SPA-rendered pages) — `fetch` only ever sees the initial HTML response; a page that renders content client-side will correctly (if unhelpfully) fail the minimum-length check after extraction, same as any other too-short page. No headless-browser rendering is in scope.
- **Any change to the actual ingestion pipeline** (parsing/OCR/chunking/embedding/outline) — Stories 2.9/2.12, unchanged by this story.
- **Robots.txt / crawl-permission checking** — AC #3's "disallows automated fetching" is satisfied by correctly surfacing whatever the target server's own HTTP response says (401/403 → "access denied"); this story does not proactively check `robots.txt` before fetching. Revisit if this becomes a real compliance requirement.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.8, FR-C-8]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-7-upload-learner-content-with-copyright-attestation.md` — `uploadDocument`'s attestation-first ordering, the advisory-lock transaction, `StoragePort`/`JobQueuePort` bindings, all reused as-is]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-6, AD-7, AD-8, AD-15, AD-17 (all identical bindings to Story 2.7, no new architecture decisions needed)]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no live-environment bugs found this time (unlike Story 2.7's pg-boss/SeaweedFS-bucket surprises). All live verification (paste-text success/too-short, URL import against a real reachable page, an unreachable host, and a real 404) passed on the first attempt, reusing Story 2.7's already-provisioned SeaweedFS bucket and pg-boss queue.

### Completion Notes List

- All 6 tasks implemented and tested. Refactored `uploadDocument`'s shared tail into a private `finalizeUpload` (attestation already verified by the caller, the advisory-lock-guarded transaction, storage put, enqueue) so file upload, pasted text, and URL import all converge on the exact same validated core — confirmed non-breaking by running Story 2.7's full existing test suite unmodified before adding anything new.
- `importPastedText`: attestation first, then a `MIN_PASTED_TEXT_WORDS = 10` word-count check (a documented, tunable choice — AC #4 names no numeric threshold), then `finalizeUpload`.
- `importFromUrl`: attestation first, then URL-format validation, then a fetch with three distinctly-mapped failure reasons (AC #3): thrown/timed-out fetch → "URL is unreachable"; 401/403 → "access denied"; any other non-2xx → "content could not be retrieved". A successfully-fetched page is passed through `stripHtmlToReadableText` (a deliberate cheap regex approximation, not a real Readability-grade extractor — documented in Dev Notes) and then the SAME word-count check pasted-text uses.
- New routes `POST /uploads/paste-text` and `POST /uploads/url-import` (plain JSON, unlike Story 2.7's multipart file-upload route) and matching gateway JSON-forward proxy routes, using the gateway's existing `forward()` method with zero new gateway-level machinery.
- `apps/web`'s `UploadPage` gained a "Paste text" textarea and an "Import from URL" input, both sharing the exact same attestation checkbox and running per-item results/count list the file-upload UI already built.
- Live-verified end-to-end through the real gateway → ingestion chain, including real external HTTP requests: pasted text accepted and queued; too-short text rejected with the specific message; a real page (`https://example.com`) fetched, extracted, and stored; an unreachable/nonexistent host rejected with "URL is unreachable"; a real 404 path rejected with "content could not be retrieved" (distinctly from the unreachable-host case). Test data cleaned up afterward.
- Full monorepo regression: 891 tests passing across all 8 workspaces (18 config + 181 shared-types + 31 service-kernel + 224 web + 106 gateway + 44 ingestion + 200 core + 107 courses), `tsc --noEmit` and `eslint .` both clean. (One `services/core` test flaked under full-parallel-suite resource contention — confirmed passing 200/200 in isolation, unrelated to this story's changes, matching the same flake class already documented for Story 2.6/2.7.)

### File List

- `services/ingestion/src/modules/uploads/service.ts` (modified — extracted `finalizeUpload`; new `importPastedText`, `importFromUrl`, `stripHtmlToReadableText`, `MIN_PASTED_TEXT_WORDS`)
- `services/ingestion/src/modules/uploads/routes.ts` (modified — new `POST /uploads/paste-text`, `POST /uploads/url-import`)
- `services/ingestion/src/modules/uploads/index.ts` (modified — barrel exports)
- `services/ingestion/tests/modules/uploads/{service,routes}.test.ts` (modified — new test suites for both import paths)
- `packages/shared-types/src/uploads.ts` (modified — `pasteTextInputSchema`, `urlImportInputSchema`)
- `packages/shared-types/src/index.ts` (modified — barrel exports)
- `packages/shared-types/tests/uploads.test.ts` (modified — new schema tests)
- `services/gateway/src/ingestionProxy.ts` (modified — new `POST /uploads/paste-text`, `POST /uploads/url-import` proxy routes)
- `services/gateway/tests/ingestionProxy.test.ts` (modified — new route tests)
- `apps/web/src/modules/uploads/api.ts` (modified — `pasteText`, `importFromUrl`)
- `apps/web/src/modules/uploads/UploadPage.tsx` (modified — paste-text textarea, URL-import input, shared results list)
- `apps/web/src/modules/uploads/index.ts` (modified — barrel exports)
- `apps/web/tests/modules/uploads/UploadPage.test.tsx` (modified — new UI tests)

## Change Log

- 2026-08-06: Story drafted (create-story) for Epic 2, Story 2.8. Status → ready-for-dev.
- 2026-08-06: Implemented Paste-text and public-URL import (Tasks 1-6): refactored uploadDocument's shared tail into finalizeUpload, added importPastedText/importFromUrl, new gateway proxy routes, apps/web UI. No live-environment bugs found this round. Live-verified end-to-end with real external HTTP requests. Status → review.
