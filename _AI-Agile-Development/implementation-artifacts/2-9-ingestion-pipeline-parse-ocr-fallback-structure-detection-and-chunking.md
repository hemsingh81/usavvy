---
baseline_commit: 2645c30e2f2384f8be04a1fa5c024eec406ac111
---

# Story 2.9: Ingestion pipeline — parse, OCR fallback, structure detection, and chunking

Status: ready-for-dev

*(Epic 2, FR-C-9. The largest story in Epic 2's ingestion arc so far: this is the FIRST story to register a real `JobQueuePort` CONSUMER — Stories 2.7/2.8 only ever produced (`enqueue`d) jobs, nothing has ever processed one. It's also the first to do REAL document parsing (Story 2.7's `getPdfPageCount` and Story 2.8's `stripHtmlToReadableText` were both explicitly-documented cheap regex approximations, with their own comments promising "Story 2.9 does the real parse" — this story is that promise coming due) and the first to introduce `ContentChunk`, the second (and last, per AD-14's ownership table) entity `services/ingestion` owns.)*

## Story

As a learner,
I want my uploaded content parsed, OCR-processed if scanned, and broken into structured chunks,
so that the system has the raw material it needs to propose a course outline.

## Acceptance Criteria

1. **Given** an `UploadedDocument` queued for ingestion via `JobQueuePort` **When** the ingestion job runs on a text-based file **Then** the document's text is parsed, headings and sections are detected to form a structure map, and the text is split into `ContentChunk`s each linked to the source document and its page/section range
2. **Given** an `UploadedDocument` containing scanned image-only pages **When** those pages are parsed and no extractable text layer is found **Then** OCR is run as a fallback on those pages, and the OCR output is used to produce `ContentChunk`s in the same way as extracted text
3. **Given** an `UploadedDocument` that is password-encrypted **When** the parse step attempts to open it **Then** the ingestion job fails immediately with a recorded failure reason of "encrypted file", and no `ContentChunk`s are produced
4. **Given** an `UploadedDocument` that is corrupt or unreadable **When** the parse step attempts to open it **Then** the ingestion job fails with a recorded failure reason of "corrupt file", and no `ContentChunk`s are produced

## Tasks / Subtasks

- [ ] **Task 1: New dependencies and schema** (AD-1, AD-14; AC: #1, #2, #3, #4)
  - [ ] Add to `services/ingestion/package.json`: `pdfjs-dist` (PDF text extraction — pure JS via the `legacy/build/pdf.mjs` Node entrypoint, NOT the browser build), `mammoth` (DOCX → HTML, using `convertToHtml` rather than `extractRawText` so heading tags survive for structure detection), `jszip` (reading PPTX's zip container), `tesseract.js` (OCR), `pdf-to-img` (renders a PDF page to a PNG buffer for OCR input — wraps `pdfjs-dist` + `@napi-rs/canvas`; `@napi-rs/canvas` ships prebuilt binaries, no compile step, same risk tier as `argon2` already tolerated elsewhere in this monorepo per `pnpm-workspace.yaml`'s `allowBuilds`)
  - [ ] `db/schema.ts`: new `contentChunks` table — `id` (uuid pk), `documentId` (uuid, references `uploaded_documents.id`), `chunkIndex` (integer, not null — order within the document), `text` (text, not null), `heading` (text, nullable — the detected section heading this chunk falls under, if any), `pageRangeStart`/`pageRangeEnd` (integer, nullable — PDF page numbers or PPTX slide numbers; null for formats with no page concept), `createdAt`. Add to `uploaded_documents`: `failureReason` (text, nullable — "encrypted file" / "corrupt file", `status` stays a plain text column per Story 2.7's own convention, now also taking the values `"parsed"`/`"failed"` alongside `"queued"`)
  - [ ] Migration generated and applied against the live `usavvy_ingestion` database

- [ ] **Task 2: Per-format text+structure extraction** (AD-1; AC: #1, #2, #3, #4)
  - [ ] `parsers/pdf.ts`: `parsePdf(buffer): Promise<ParsedDocument>` using `pdfjs-dist`'s `getDocument({ data: buffer }).promise` — catches `PasswordException` → throws `EncryptedDocumentError`; catches `InvalidPDFException`/`UnknownErrorException` → throws `CorruptDocumentError`. For each page, `getTextContent()` extracts text items; a page whose extracted text is empty/whitespace-only is flagged as `needsOcr: true` for that page (AC #2) rather than being treated as an error. **Structure detection (heading heuristic):** an item is treated as a heading if its font size (from its transform matrix) is noticeably larger than the page's own median text-item font size — a documented, cheap heuristic (this codebase's established precedent: Story 2.7's page-count regex, Story 2.8's HTML stripper), not a real layout-analysis engine. Each page is one "section" boundary regardless of headings found, giving every chunk a `pageRangeStart`/`pageRangeEnd`
  - [ ] `parsers/docx.ts`: `parseDocx(buffer): Promise<ParsedDocument>` using `mammoth.convertToHtml({ buffer })` — genuine, reliable structure detection here (not a heuristic): `<h1>`-`<h6>` tags in Mammoth's output ARE real headings from the source document's own paragraph styles. Split on heading boundaries to form sections; no page concept for DOCX (`pageRangeStart`/`pageRangeEnd` stay null, section identity carried via `heading` alone). A thrown Mammoth error (corrupt/non-DOCX-zip input) → `CorruptDocumentError`. DOCX has no password-protection concept reachable via Mammoth's own API — encrypted `.docx` files (rare; Office's own encrypted format wraps the zip in CFB/OLE) surface as a corrupt-zip error to Mammoth, which is accurate enough (this codebase doesn't attempt to distinguish "encrated DOCX" from "corrupt DOCX" — document this as an accepted limitation, not silently wrong)
  - [ ] `parsers/pptx.ts`: `parsePptx(buffer): Promise<ParsedDocument>` — `JSZip.loadAsync(buffer)` (throws on non-zip/corrupt input → `CorruptDocumentError`), reads each `ppt/slides/slideN.xml` in numeric order, extracts `<a:t>...</a:t>` text runs via regex (documented pragmatic shortcut — this is a small, stable corner of ECMA-376 that hasn't changed across PowerPoint versions; not attempting a full OOXML parse). Each slide is one section; the slide's FIRST text run becomes that section's `heading` (typically the title placeholder); `pageRangeStart`/`pageRangeEnd` both equal the slide number
  - [ ] `parsers/plainText.ts`: `parsePlainText(buffer, format: "txt" | "md"): ParsedDocument` — for `.md`, lines starting with `#`-prefixes are real, reliable headings (Markdown's own explicit syntax, same reliability tier as DOCX's — not a heuristic); for `.txt`, there is no structural signal available at all, and this story does NOT invent a fake heuristic (e.g. "ALL CAPS lines are headings") for it — the whole file is treated as one sectionless block. Document this honestly: a TXT file's structure detection is "there is none," not "poor quality"
  - [ ] Shared `ParsedDocument` type: `{ sections: Array<{ heading: string | null; text: string; pageRangeStart: number | null; pageRangeEnd: number | null; needsOcr?: boolean }> }`
  - [ ] `EncryptedDocumentError`/`CorruptDocumentError` — plain `Error` subclasses (not `AppError`; these cross a queue-worker boundary, not an HTTP request — see Dev Notes), each carrying a `.reason` string matching AC #3/#4's exact required text ("encrypted file" / "corrupt file")
  - [ ] Tests per parser: a real small encrypted PDF fixture → `EncryptedDocumentError`; a truncated/corrupted byte buffer for each format → `CorruptDocumentError`; a normal fixture of each type → correct section/heading/page-range extraction; a PDF with an intentionally empty text layer → `needsOcr: true` on that page, no error thrown

- [ ] **Task 3: OCR fallback** (AC: #2)
  - [ ] `parsers/ocr.ts`: `ocrPdfPages(buffer, pageNumbers: number[]): Promise<Map<number, string>>` — for each page flagged `needsOcr` by `parsers/pdf.ts`, renders that ONE page to a PNG via `pdf-to-img` (`scale: 2` for reasonable OCR accuracy vs. speed) and runs it through a `tesseract.js` worker (`createWorker("eng")`, reused across pages within the same job rather than one worker per page — meaningfully cheaper); returns extracted text keyed by page number
  - [ ] `parsers/pdf.ts`'s caller (the job handler, Task 4) is responsible for invoking OCR only for pages flagged `needsOcr` and splicing the OCR text back into that page's section text — `parsers/pdf.ts` itself has no OCR dependency, keeping the two concerns separable and independently testable
  - [ ] **Explicitly scoped, documented limitations** (accepted, not silently glossed over): generic Tesseract OCR with no image preprocessing (deskew, contrast correction) on real-world scans is "good enough to search and build a rough outline from," not "publication-quality transcription" — this is inherent to OCR generally, not a corner this story cut; a hard cap (`MAX_OCR_PAGES_PER_DOCUMENT = 50`) prevents a single pathological scanned document from making one ingestion job run for an unbounded amount of time — pages beyond the cap are simply skipped (their section keeps whatever empty text it had, not an error), a documented, low-severity MVP limitation
  - [ ] Tests: a scanned single-page PDF fixture (real image, no text layer) → OCR output containing the expected known text; the `MAX_OCR_PAGES_PER_DOCUMENT` cap is respected when a fixture has more flagged pages than the cap; a page that OCRs to empty/garbage text still doesn't throw (OCR failure degrades gracefully to an empty section, never fails the whole job — matching AD-17's "no silent total failure," while accepting a per-page best-effort result is fine here since this is explicitly a fallback path, not the primary guarantee)

- [ ] **Task 4: Chunking and the `JobQueuePort` consumer** (AD-15; AC: #1, #2, #3, #4)
  - [ ] `chunking.ts`: `chunkSections(sections: ParsedDocument["sections"]): Array<{ heading, text, pageRangeStart, pageRangeEnd }>` — splits each section's text into bounded chunks (`MAX_CHUNK_CHARS = 1500`, breaking on paragraph boundaries (`\n\n`) where possible, falling back to a hard cut only when a single paragraph itself exceeds the limit) — a documented, simple fixed-size-with-boundary-awareness strategy (not semantic/embedding-based chunking, which is a materially bigger scope than "the system has the raw material it needs," AC #1's own stated bar). Each resulting chunk inherits its parent section's `heading`/`pageRangeStart`/`pageRangeEnd`
  - [ ] `jobs/ingestDocument.ts`: the actual `JobQueuePort` consumer handler — the FIRST one this codebase has ever registered (Stories 2.7/2.8 only ever enqueued). Looks up the `UploadedDocument` row by the job payload's `uploadedDocumentId`, fetches its bytes via `StoragePort.getObject(storageKey)`, dispatches to the matching parser by `fileType`, runs OCR for any `needsOcr`-flagged PDF pages (Task 3), chunks the resulting sections (above), inserts all `ContentChunk` rows in one batch insert, and updates the `UploadedDocument` row: `status: "parsed"` on success, or `status: "failed", failureReason: "encrypted file" | "corrupt file"` when a parser throws one of Task 2's typed errors — no `ContentChunk`s are ever inserted in the failure path (AC #3/#4's "no ContentChunks are produced")
  - [ ] Extend `packages/service-kernel`'s `JobQueuePort` interface with a `work(jobName, handler): Promise<void>` method (producer-only until now, per its own doc comment — this story is exactly the "first `work()`-style consumer" that comment predicted); implement it in the real `pgboss.ts` adapter (`boss.work(jobName, async (jobs) => { ... })`, matching pg-boss v12's batch-handler API) and the `mock.ts` test adapter (records registered handlers, exposes a way for tests to manually invoke one — e.g. `mockJobQueuePort.trigger(jobName, payload)` — so `ingestDocument`'s own tests don't need a real pg-boss instance)
  - [ ] `services/ingestion/src/main.ts`: registers the `ingest-document` consumer via `jobQueuePort.work(...)` alongside the existing HTTP server startup
  - [ ] Tests: a full happy-path run (enqueue via the real `uploadDocument`/`importPastedText`/`importFromUrl` flow already built, then manually trigger the mock queue's handler) produces the expected `ContentChunk` rows and `status: "parsed"`; an encrypted-PDF fixture run through the full job produces zero `ContentChunk` rows, `status: "failed"`, `failureReason: "encrypted file"`; same for a corrupt fixture; a job for an `uploadedDocumentId` that no longer exists (a theoretical race with some future deletion feature — none exists yet, but the handler must not crash the whole worker) logs and returns cleanly rather than throwing an uncaught error out of the job handler (AD-17)

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-4 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `ContentChunk` is the second and LAST entity `services/ingestion` owns per the architecture spine's own ownership table (`UploadedDocument, ContentChunk | ingestion`) — no new table beyond this one is expected for this service going forward in Epic 2.
- **AD-15 (JobQueuePort):** this story registers the first real consumer (`work()`) this codebase has ever had. The port's interface gains a method it didn't need until now — extending a port's interface when a new capability is genuinely needed (not speculatively) is exactly what AD-1's scaffold-on-demand principle asks for.
- **AD-1 (scaffold-on-demand):** every heuristic in this story (PDF heading-by-font-size, PPTX heading-by-first-text-run) is explicitly a "good enough for AC #1's stated bar" approximation, matching the same discipline already applied to Story 2.7's PDF page-count regex and Story 2.8's HTML-stripping regex — documented, not silently passed off as more sophisticated than it is.
- **AD-17 (no silent failures):** AC #3/#4's two distinct failure reasons must remain genuinely distinguishable (not collapsed into one generic "parse failed"); a job handler that crashes must not take down the whole worker process silently — pg-boss's own retry/dead-letter semantics handle a genuinely-thrown error, but a handler that can throw for an EXPECTED case (missing document row) instead logs and returns.
- **AD-8 (test mirroring):** see Task 5.

### Why `EncryptedDocumentError`/`CorruptDocumentError` are plain `Error` subclasses, not `AppError`

`AppError` (from `@usavvy/service-kernel`) is designed around HTTP request/response semantics — a `statusCode`, mapped by `registerErrorHandler` into an HTTP envelope. A `JobQueuePort` consumer has no HTTP response to produce; its "response" is a DB row update (`status`/`failureReason`) performed by the job handler itself after catching the error. Reusing `AppError` here would carry along an HTTP-shaped concept (`statusCode`) that means nothing in a queue-worker context — a plain `Error` subclass carrying just the `.reason` string the job handler needs is the honest shape for this boundary.

### Why chunking is fixed-size-with-boundary-awareness, not semantic/embedding-based

AC #1's own stated bar is "the system has the raw material it needs to propose a course outline" — a bounded, readable, source-linked chunk. Semantic chunking (grouping by topic similarity, typically embedding-based) is Story 2.12's actual job ("Embedding and AI-proposed Topic/Concept outline") — building it here would be doing Story 2.12's work early and worse (without the embeddings Story 2.12 introduces, "semantic" chunking here would just be another heuristic pretending to be smarter than it is). A simple, paragraph-boundary-respecting fixed-size chunker is honest about being exactly that.

### Why OCR runs inline within the same job, not a separately-scoped async step

Research surfaced a real concern: OCR (page rendering + Tesseract) is CPU-heavy — multi-second-per-page — and would be a poor fit inside a synchronous HTTP request handler. That concern doesn't apply here: `ingestDocument`'s job handler ALREADY runs asynchronously via `JobQueuePort`, off any HTTP request/response cycle (this is the entire reason Story 2.7 built the queueing mechanism in the first place). Splitting OCR into a SECOND separately-queued job would be solving a latency problem that doesn't exist yet at this story's scale, at the cost of a second job type, a second status to track, and cross-job coordination — pure speculative complexity. `MAX_OCR_PAGES_PER_DOCUMENT` bounds worst-case job duration instead, a much simpler mitigation matching this codebase's established "solve the problem you actually have" discipline.

### Previous story intelligence (Story 2.8 — read before starting, don't rediscover this)

- **A Fastify/library-native error left uncaught falls through to a generic 500 (or, in this story's queue-worker context, an uncaught job failure) — always wrap and map explicitly.** Every parser's own throw points (Task 2) must be the ONLY way an error crosses into the job handler; verify no parser leaks a raw `pdfjs-dist`/`mammoth`/`jszip` error class past its own `parsers/*.ts` boundary.
- **Prove "no I/O happened" claims by spying on the mock port directly, not by asserting on an unrelated row/id** — apply this to Task 4's "zero ContentChunk rows on failure" tests from the start (query the actual table, don't just check the returned status).
- **`node:dns/promises` (or any other real-network/real-filesystem dependency) should be mocked in unit tests for determinism** — this story's parser tests should use small, real, checked-in binary fixture files (a genuine tiny encrypted PDF, a genuine tiny corrupt-byte buffer, a genuine tiny scanned-page PDF) rather than mocking the parsing libraries themselves, since the whole point of this story is exercising the REAL parsing behavior — mocking pdfjs-dist itself would prove nothing. Store fixtures under `services/ingestion/tests/fixtures/`.
- **RBAC role check pitfall:** `ROLES` is `["superadmin", "admin", "mentor", "student"] as const` — not relevant to this story directly (no new HTTP routes), but keep it in mind for any live-verification calls.

### Scope note: what's explicitly OUT of scope for this story

- **Content safety scanning** — Story 2.10, entirely separate from this story's parse/chunk output.
- **Embedding and AI-proposed outline** — Story 2.12.
- **Any ingestion-status UI or progress reporting beyond the `status`/`failureReason` columns** — Story 2.11 builds the full status model (`queued`/`parsing`/`safety scan`/`embedding`/`outline ready`) and learner-facing UI; this story only needs `"queued"` → `"parsed"`/`"failed"`, the minimum this story's own ACs require.
- **Real layout-analysis-grade structure detection** — see Dev Notes; PDF/PPTX heading detection are documented heuristics, DOCX/MD use real signal already present in those formats.
- **OCR quality improvements (deskew, contrast correction, language auto-detection)** — English-only (`createWorker("eng")`), no image preprocessing; revisit if real-world scan quality proves this insufficient.
- **Distinguishing "encrypted DOCX" from "corrupt DOCX"** — see Task 2; both surface as `CorruptDocumentError` given Mammoth's own API doesn't distinguish them.
- **A separately-queued/async OCR step** — see Dev Notes; OCR runs inline within the same ingestion job, bounded by `MAX_OCR_PAGES_PER_DOCUMENT`.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.9, FR-C-9]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-7-upload-learner-content-with-copyright-attestation.md` — `StoragePort`/`JobQueuePort` (producer side), `uploaded_documents` schema, the `getPdfPageCount` regex-approximation precedent this story's own heuristics follow the same documentation discipline of]
- [Source: `_AI-Agile-Development/implementation-artifacts/2-8-paste-text-and-public-url-import.md` — `stripHtmlToReadableText`'s cheap-approximation precedent; the SSRF-guard review-finding pattern (wrap every library-native error explicitly, don't assume a shared handler catches it)]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-8, AD-14 (ownership table: ContentChunk → ingestion), AD-15, AD-17]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-06: Story drafted (create-story) for Epic 2, Story 2.9. Status → ready-for-dev.
