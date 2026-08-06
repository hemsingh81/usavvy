---
baseline_commit: 1061386e3f42ab5e6a1786649b64d4115f5a1e4c
---

# Story 2.7: Upload learner content with copyright attestation

Status: ready-for-dev

*(Epic 2, FR-C-7/FR-C-12. This is the first story to need a real `services/ingestion` (AD-1 scaffold-on-demand, AD-14 owns `UploadedDocument`/`ContentChunk`), the first to need a REAL `StoragePort` implementation (AD-6 — until now only `pingStorage`'s health-check ping existed), and the first to need a REAL `JobQueuePort` implementation (AD-15 — until now only an empty placeholder). It does NOT build the ingestion pipeline itself (parsing/OCR/chunking/embedding/outline — Stories 2.9-2.12) or the outline review screen (Story 2.13) — only accepting, validating, storing, and queueing an upload, per its own four ACs.)*

## Story

As a learner,
I want to upload my own PDF, DOCX, PPTX, TXT, or MD files after confirming I have the right to use them,
so that I can turn my own material into a custom course that stays private to me.

## Acceptance Criteria

1. **Given** a learner starting a custom course upload **When** they select files of type PDF, DOCX, PPTX, TXT, or MD, each under 50 MB and 300 pages, with the attestation checkbox checked confirming they have rights to use the material **Then** each file is accepted, stored in the ingestion module as an `UploadedDocument` owned by that learner, marked private to the uploader, and queued for ingestion
2. **Given** a learner attempts to upload a file exceeding 50 MB, exceeding 300 pages, or of an unsupported file type **When** the upload is submitted **Then** that specific file is rejected with a message stating which limit was violated, while any other valid files in the same batch are still accepted
3. **Given** a learner has already added 10 files to a custom course **When** they attempt to add an 11th file **Then** the upload is blocked with a message stating the 10-file-per-course limit has been reached
4. **Given** a learner attempts to upload without checking the copyright attestation checkbox **When** they submit the upload **Then** the upload is blocked until the attestation is checked, and no file is stored or queued for ingestion

## Tasks / Subtasks

- [x] **Task 1: `packages/service-kernel` — real `StoragePort`** (AD-6; AC: #1)
  - [x] New `src/storage/port.ts`: `StoragePort { putObject(key: string, data: Buffer, contentType: string): Promise<void>; getObject(key: string): Promise<Buffer>; deleteObject(key: string): Promise<void> }` — same DI-seam shape as core's `NotificationPort` (`port.ts`/adapter/`factory.ts`), so a future hosted-S3 swap is config-only (AD-6's own stated rule)
  - [x] New `src/storage/seaweedfs.ts`: real adapter — plain unauthenticated `fetch` PUT/GET/DELETE against `${endpoint}/<bucket>/<key>` (SeaweedFS's dev docker-compose command has no identity/auth configured, so no AWS SigV4 signing is needed — matches `pingStorage`'s already-established unauthenticated-fetch precedent against this same endpoint; do NOT add an AWS SDK dependency for this)
  - [x] New `src/storage/mock.ts`: in-memory `Map`-backed adapter for tests, mirroring `notification/mock.ts`'s shape
  - [x] New `src/storage/factory.ts`: `createStorageAdapter(adapter: "mock" | "seaweedfs", endpoint: string, logger: Logger): StoragePort`
  - [x] Move the existing `pingStorage` health-check helper into `src/storage/ping.ts` (unchanged behavior) and keep re-exporting it from `src/index.ts` exactly as today — core's and courses' existing `/health` checks must keep working unmodified
  - [x] Tests: `seaweedfs.test.ts` (mock `fetch`, verify PUT/GET/DELETE URLs and methods), `mock.test.ts`, `factory.test.ts`

- [x] **Task 2: `packages/service-kernel` — real `JobQueuePort`** (AD-15; AC: #1)
  - [x] Add `pg-boss` as a dependency of `packages/service-kernel` — already the architecture's chosen stack tech for this exact purpose (Stack table: "pg-boss | latest stable (Postgres-native job queue, AD-15)"), not a new/undecided library; pre-approved by this story, no separate approval needed
  - [x] Replace the placeholder `src/jobqueue/index.ts` with: `port.ts` (`JobQueuePort { enqueue(jobName: string, payload: Record<string, unknown>): Promise<string> }` — producer-only; nothing consumes a job yet, Story 2.9 registers the first real `work()` handler), `pgboss.ts` (real adapter — `new PgBoss(databaseUrl)`, `.start()` once at boot, `.send(jobName, payload)` per `enqueue` call), `mock.ts` (records enqueued jobs in an array, for tests), `factory.ts` (`createJobQueueAdapter(adapter: "mock" | "pgboss", databaseUrl: string, logger: Logger): Promise<JobQueuePort>` — async because the real adapter must `.start()` before use)
  - [x] Tests: `pgboss.test.ts` (can mock the `pg-boss` module — verify `.send()` is called with the right job name/payload), `mock.test.ts`

- [x] **Task 3: New `services/ingestion`** (AD-1, AD-14; AC: #1, #2, #3, #4)
  - [x] Scaffold matching `services/courses`' exact shape 1:1: `package.json` (same dependency set as courses, plus `@fastify/multipart` — needed to parse the incoming multipart upload request; a natural, expected Fastify companion library, not a surprising dependency), `tsconfig.json`, `src/{config.ts,app.ts,main.ts}`, `src/db/{schema.ts,client.ts,migrate.ts}`, `drizzle.config.ts`
  - [x] `infra/init-db.sh`: add `CREATE DATABASE usavvy_ingestion;` (matches the existing `usavvy_core`/`usavvy_courses` lines exactly). **The running dev Postgres container's data volume already exists from prior stories, so `init-db.sh` will NOT re-run automatically** — also manually run `CREATE DATABASE usavvy_ingestion;` against the live container (`docker exec usavvy-postgres-1 psql -U usavvy -c "CREATE DATABASE usavvy_ingestion;"`) so local dev/testing works without a full volume wipe
  - [x] `config.ts`: `PORT` default `3003` (3000=gateway, 3001=core, 3002=courses); `DATABASE_URL` default `postgres://usavvy:usavvy@localhost:5433/usavvy_ingestion`; `INTERNAL_SERVICE_SECRET` (same dev default as every other service); `STORAGE_ENDPOINT` default `http://localhost:8333`; `STORAGE_ADAPTER` enum `["mock","seaweedfs"]` default `"seaweedfs"`; `JOB_QUEUE_ADAPTER` enum `["mock","pgboss"]` default `"pgboss"`
  - [x] `app.ts`: same trust-boundary `x-internal-secret` preHandler guard as courses' `app.ts` (copy verbatim, `/health` exempt); register `@fastify/multipart` with `limits: { fileSize: 50 * 1024 * 1024 }` (AC #2's 50 MB ceiling enforced at the HTTP layer itself, not just in application code)
  - [x] `db/schema.ts` — new `uploaded_documents` table (owned by ingestion per AD-14): `id` (uuid pk, `uuidv7Default`), `owner_id` (text, opaque cross-service reference — same convention as `course_customizations.user_id`), `custom_course_id` (uuid, not null — groups files into one upload batch; see Dev Notes on why this is NOT yet a real `courses` row), `file_name` (text, not null), `file_type` (text, not null — one of `pdf|docx|pptx|txt|md`, validated by Zod at the request boundary, not a DB enum, matching this schema's existing "validate at the Zod boundary, not with a DB CHECK constraint" convention), `file_size_bytes` (integer, not null), `storage_key` (text, not null — the `StoragePort` object key), `copyright_attested` (boolean, not null), `status` (text, not null, default `'queued'` — Story 2.9/2.11 will add more states; a plain text column, not a DB enum, so extending it later needs no migration), `created_at` (timestamp with tz, `defaultNow()`)
  - [x] `modules/uploads/service.ts`:
    - `SUPPORTED_FILE_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md"] as const` (validate by extension, not browser-supplied MIME type — MIME types are absent/unreliable for some of these formats across browsers; document this choice)
    - `MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024`, `MAX_PAGES = 300`, `MAX_FILES_PER_CUSTOM_COURSE = 10`
    - `getPdfPageCount(buffer: Buffer): number` — count occurrences of the `/Type /Page` (not `/Type /Pages`) object pattern in the raw PDF bytes via regex; a well-known lightweight technique that avoids adding a full PDF-parsing dependency for a single page count (Story 2.9 will do the real, full PDF parse later). **The 300-page limit applies to PDF only** — DOCX/PPTX/TXT/MD have no literal, cheaply-readable "page count" at upload time (a real page count would require rendering, which is out of scope for an upload-time check); for those formats, the 50 MB size ceiling alone is the enforced limit. Document this explicitly so Story 2.9 doesn't rediscover it.
    - `uploadDocument(deps, ownerId, input: { customCourseId: string | undefined; fileName: string; buffer: Buffer; copyrightAttested: boolean }): Promise<UploadedDocumentResponse>` — order of checks (AC #4 first, since it must block BEFORE any storage/DB write): (1) `copyrightAttested !== true` → `AppError("VALIDATION_ERROR", "copyright attestation is required", 400)`, no I/O yet; (2) resolve `customCourseId` — if not supplied, mint a fresh one (`uuidv7()`, matching the pk convention); (3) file-extension check → `AppError("VALIDATION_ERROR", "unsupported file type", 400)`; (4) size check → `AppError("VALIDATION_ERROR", "file exceeds 50 MB limit", 400)`; (5) count existing rows for `customCourseId` — if `>= 10` → `AppError("VALIDATION_ERROR", "10-file-per-course limit reached", 400)`; (6) if `.pdf`, page-count check → `AppError("VALIDATION_ERROR", "file exceeds 300 page limit", 400)`; (7) only after every check passes: `storagePort.putObject(key, buffer, contentType)`, insert the `uploaded_documents` row with `status: "queued"`, `jobQueuePort.enqueue("ingest-document", { uploadedDocumentId })`, return the response. **Each file is one independent call to this function** — AC #2's "other valid files in the same batch are still accepted" is satisfied by the frontend looping one HTTP request per selected file (see Task 5), not by a single multi-file server-side batch endpoint; document this as the chosen design so Story 2.11 doesn't assume a batch endpoint exists.
    - `listUploadedDocuments(db, ownerId, customCourseId): Promise<UploadedDocumentResponse[]>` — scoped to the caller's own `ownerId`; returns `[]` for a `customCourseId` the caller doesn't own (never a 403 leaking existence) — needed by the frontend to show the running list of already-added files and know when it's hit 10
  - [x] `modules/uploads/routes.ts`: `POST /uploads` (auth-only via the same `requireTrustedUser` pattern courses' `routes.ts` already establishes — any authenticated role, matching the "caller's own private data" precedent from `startCourse`/customization routes, not a content-ops-gated route) — parses the multipart body via `request.file()` (`@fastify/multipart`), reads `customCourseId`/`copyrightAttested` from the other form fields; `GET /uploads?customCourseId=` (auth-only)
  - [x] `modules/uploads/index.ts` barrel
  - [x] Tests mirroring `src/` 1:1 (AD-8): extension/size/page/count/attestation rejections (each independently, and confirming a valid file in the same "batch" — i.e. a second call for the same `customCourseId` — still succeeds after an earlier one was rejected); attestation-missing blocks BEFORE any `StoragePort`/DB write (assert the mock storage/DB adapters were never called); a fresh `customCourseId` is minted when none is supplied and reused correctly when supplied; `listUploadedDocuments` never returns another learner's documents

- [x] **Task 4: `services/gateway` — multipart passthrough proxy** (AC: #1, #2, #3, #4)
  - [x] New `src/ingestionClient.ts` mirroring `coreClient.ts`'s `forwardBinary` shape but for the OPPOSITE direction (binary/multipart REQUEST forwarding, not response): `forwardMultipart(path: string, contentType: string, rawBody: Buffer, headers): Promise<ProxyResult>` — forwards the raw multipart bytes verbatim (including the `boundary=` parameter in `content-type`) plus the trusted `x-user-id`/`x-user-role`/`x-internal-secret` headers; gateway does NOT parse the multipart body itself, it's a dumb byte-forwarding proxy exactly like every other route in this codebase, just with a binary body instead of JSON
  - [x] In `app.ts`, register a custom `addContentTypeParser("multipart/form-data", ...)` that collects the raw request body into a `Buffer` with NO parsing (Fastify has no built-in multipart support without a plugin; the gateway must NOT add `@fastify/multipart` itself since it never needs to read individual form fields, only forward bytes) — cap at 50 MB via the parser's own size limit, matching ingestion's own limit
  - [x] New `src/ingestionProxy.ts`: `POST /uploads` (`requireAuth`), `GET /uploads` (`requireAuth`, forwards the `customCourseId` query param)
  - [x] `services/gateway/tests/ingestionProxy.test.ts`: 401 without auth; a multipart POST forwards the raw body/content-type/boundary and trusted headers correctly (mock the client); GET forwards the query param

- [ ] **Task 5: `apps/web` — upload UI** (AC: #1, #2, #3, #4)
  - [ ] New `packages/shared-types/src/uploads.ts`: `uploadedDocumentResponseSchema` (id, customCourseId, fileName, fileType, fileSizeBytes, status, createdAt), barrel-exported
  - [ ] New `apps/web/src/modules/uploads/api.ts`: `uploadFile(accessToken, customCourseId: string | undefined, file: File, copyrightAttested: boolean): Promise<UploadedDocumentResponse>` (builds a `FormData`, does NOT use the shared `apiRequest` JSON helper — a new small multipart-aware fetch wrapper, since `FormData` must not be JSON-stringified or have its `content-type` set manually, the browser sets the boundary itself); `listUploads(accessToken, customCourseId)`
  - [ ] New `apps/web/src/modules/uploads/UploadPage.tsx`: a copyright-attestation checkbox (unchecked by default — AC #4), a `<input type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md">`, and an "Upload" action that loops over every selected file, calling `uploadFile` once per file **sequentially** (not `Promise.all` — needed so the running per-batch file count used for the 10-file check is accurate file-to-file, and so the first-file-mints-`customCourseId` response is available before the second file's request is sent), showing each file's individual accepted/rejected result (AC #2 — one bad file doesn't block the others) and a running "X of 10 files" count; disables further selection once 10 files are reached (AC #3, client-side pre-check as a UX nicety — the server is still the authority and re-checked on every request)
  - [ ] Tests: `UploadPage.test.tsx` — attestation checkbox blocks submission with no fetch call when unchecked; a mixed batch (one oversized, one valid) shows both a per-file error and a per-file success; hitting 10 accepted files disables adding more

- [ ] **Task 6: Root workspace wiring**
  - [ ] `package.json`'s root `dev` script: add `ingestion` to the `concurrently` command (`-n gateway,core,courses,ingestion,web ... "pnpm --filter @usavvy/ingestion dev"`)

- [ ] **Task 7: Tests mirroring `src/` 1:1** (AD-8) — consolidates the per-task test lists above; no additional test files beyond what Tasks 1-5 already name

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-1 (scaffold-on-demand):** `services/ingestion` is scaffolded NOW, for the first time — matching the architecture tree's own annotation ("ingestion — + JobQueuePort consumer (AD-15); scaffolded when Epic 2 starts"). Only what THIS story's 4 ACs need is built — no parsing, OCR, chunking, embedding, or outline logic (Stories 2.9-2.12), no outline review UI (Story 2.13).
- **AD-6 (StoragePort):** this is the first REAL implementation — `pingStorage` (health-check only) already exists but nothing has ever actually read/written an object through it. Build the real port now; don't special-case around it.
- **AD-14 (ownership):** `UploadedDocument`/`ContentChunk` belong to `ingestion` (already recorded in the architecture's ownership table) — a new database (`usavvy_ingestion`), never reusing `usavvy_courses`.
- **AD-15 (JobQueuePort):** `ingestion` is the pipeline AD-15 explicitly names as bound to this port. This story only PRODUCES a job (`enqueue`); Story 2.9 is the first to CONSUME one (`work()`). Building only the producer side now, not a consumer with nothing to do yet, matches AD-1's own scaffold-on-demand discipline.
- **AD-13 (service boundaries):** `uploaded_documents.owner_id` and `custom_course_id` are opaque text/uuid references to `core`'s users and (eventually) `courses`' courses — never a real cross-service DB foreign key, matching every existing cross-service reference in this codebase (`course_customizations.user_id`, `learner_course_pins.user_id`, etc.).
- **AD-7 (RBAC):** `POST/GET /uploads` are auth-only (any authenticated role) — this is the caller's own private data, not a privileged action, matching `startCourse`/`saveCourseCustomization`'s existing precedent, not `createCourse`'s content-ops-only gate.
- **AD-17 (no silent failures):** a rejected file always names the specific limit violated (AC #2) — never a generic "upload failed."
- **AD-8 (test mirroring):** see Task 7.

### Why `customCourseId` is a bare uuid, not yet a real `courses` row

Story 2.13 ("the edited outline replaces the proposed one as the working Topic/Concept structure for **that custom course**") is the first point in this epic where a genuinely finished, learner-reviewed custom course needs to exist as a real, queryable `courses` row (so a later learning session can start against it, same as any catalog course). Building that row NOW, before any outline exists to populate it, would mean either an empty/placeholder `courses` row sitting around for the entire multi-story ingestion pipeline (2.9-2.12) with no Modules/Topics/Concepts and no way to know if it'll ever be completed, or inventing a "draft custom course" state on the `courses` table that Story 2.13 would need to redesign anyway once it knows what a finished outline actually looks like. Instead, `customCourseId` is a bare identifier scoped entirely within `ingestion`, existing purely to group a batch of uploads and enforce the 10-file limit (AC #3) — Story 2.13 (or whichever story is best positioned once the outline pipeline's actual shape is known) decides how/when to create the real `courses` row and link it. This is the same restraint Story 2.6 applied to Epic 3/4's "real learning session" (build only the minimal, honest mechanism the CURRENT story's ACs require).

### Why each file is its own request, not one multi-file batch endpoint

AC #2's "other valid files in the same batch are still accepted" only requires that ONE bad file doesn't block the rest — it doesn't require a single HTTP request carrying multiple files. One-file-per-request (looped client-side, per file result shown independently) is simpler on every layer (multipart parsing, per-file error handling, `StoragePort` calls) than a true multi-file batch endpoint, and satisfies the AC exactly as written. Don't build a batch endpoint for this story.

### Why the gateway doesn't parse multipart itself

Every existing gateway proxy route (`coursesProxy.ts`, `authProxy.ts`, etc.) is a dumb pass-through: parse trust/auth, forward the body verbatim, relay the response. Adding `@fastify/multipart` to the GATEWAY would mean parsing the file out of the multipart body just to re-serialize it into a NEW multipart body to forward to ingestion — pure wasted work and a second place a parsing bug could live. Instead, the gateway reads the raw request bytes (via a custom, non-parsing `addContentTypeParser`) and forwards them completely unchanged, boundary and all — only `services/ingestion` (which actually needs the individual form fields) uses `@fastify/multipart`.

### Why PDF page-count uses a regex, not a real PDF parser

Counting `/Type /Page` object markers in the raw bytes is a well-known, cheap approximation good enough for an upload-time limit check (it can occasionally over/under-count against exotic PDF structures, but for a 300-page ceiling check this is an acceptable, well-established shortcut) — a full, robust page-count requires the same real PDF-parsing library Story 2.9 will add for actual content extraction. Adding that dependency now, only to check a number, would be built-ahead-of-need; Story 2.9 does the real parse.

### Previous story intelligence (Story 2.6 — read before starting, don't rediscover this)

- **Config-driven adapter selection (AD-1/AD-12) belongs in one place** — `config.ts`'s enum + a `factory.ts`, never a module reading `process.env` itself. Follow `core`'s `NotificationPort` (`port.ts`/`mock.ts`/`factory.ts`) shape exactly for both new ports in this story.
- **The `x-internal-secret` trust-boundary preHandler hook** (courses' `app.ts`) must be copied verbatim into ingestion's `app.ts` — every service-to-service call must go through gateway, never direct.
- **RBAC role check pitfall (rediscovered live this session, Story 2.6's review round):** `ROLES` is `["superadmin", "admin", "mentor", "student"] as const` (`packages/config/src/rbac.ts`) — NOT `"contentops"`/`"learner"`. Don't invent role names when writing tests or manual verification calls.
- **Local dev Postgres container already has an initialized volume** — a NEW line in `init-db.sh` only takes effect on a fresh volume. Also run the `CREATE DATABASE` manually against the live container (see Task 3).
- **Review-round lesson from Story 2.6, repeated across several stories this session: verify against the LATEST/published state, not just "does a row exist."** Not directly applicable to this story's ACs, but keep the same instinct alert for any "is this the current/valid one" check this story's later siblings (2.9-2.13) will add.

### Scope note: what's explicitly OUT of scope for this story

- **The actual ingestion pipeline** (parse/OCR/structure/chunk/embed/outline) — Stories 2.9, 2.12.
- **A `JobQueuePort` consumer/`work()` handler** — Story 2.9 registers the first one; this story only enqueues.
- **Content safety scanning** — Story 2.10.
- **Ingestion status/progress UI beyond a bare `status` column** — Story 2.11 (`queued`/`parsing`/`safety scan`/`embedding`/`outline ready`/failure reasons) builds on this story's `status` column but doesn't need to be fully modeled yet.
- **Outline review** — Story 2.13.
- **Paste-text / URL import** — Story 2.8 (separate ACs, likely reuses this story's `uploaded_documents` table and validation helpers once built).
- **A real `courses` row for the custom course** — see Dev Notes above.
- **Resuming an in-progress upload batch after a page reload** — `customCourseId` lives only in client component state for this story; an accepted MVP gap, same class as Story 2.6's already-deferred ephemeral "started" UI state.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 2.7, FR-C-7, FR-C-12; Stories 2.8-2.13 read for forward context on `UploadedDocument`/`customCourseId` shape]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-6, AD-7, AD-8, AD-13, AD-14 (ownership table: UploadedDocument/ContentChunk → ingestion), AD-15, AD-17; Stack table (pg-boss, SeaweedFS)]
- [Source: `services/core/src/modules/notification/{port,mock,factory}.ts` — the DI-seam shape both new ports in this story copy]
- [Source: `services/gateway/src/coreClient.ts` — `forwardBinary`'s pattern, adapted in the opposite direction for multipart request forwarding]
- [Source: `infra/init-db.sh`, `infra/docker-compose.yml` — per-service database provisioning, SeaweedFS's unauthenticated dev S3 endpoint]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-06: Story drafted (create-story) for Epic 2, Story 2.7. Status → ready-for-dev.
