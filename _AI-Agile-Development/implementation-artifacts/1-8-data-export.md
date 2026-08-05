---
baseline_commit: 6dacd3f
---

# Story 1.8: Data Export

Status: ready-for-dev

*(Epic 1, FR-A-8. Unlike Stories 1.5/1.7, this story's AC was already rescoped in `epics.md` itself during the Implementation Readiness review — the original AC promised progress/notes/submissions data from Epics 3/4/6 that don't exist yet; the current AC explicitly scopes this story to Epic 1's own data (identity, Learner Profile, preferences, privacy settings) and defines the export mechanism as something later epics extend incrementally, not something this story blocks on. Two genuinely new pieces of infrastructure are needed and are in scope here (unlike Story 1.7's deliberately-mock-only `PubSubPort`): a PDF-generation library (`pdfkit` — no PDF capability exists anywhere in this codebase, and the AC explicitly requires PDF output, so this is a spec-required dependency, not speculative infrastructure) and binary (non-JSON) response proxying through `gateway` (every existing proxied route forwards a JSON body; the PDF export is the first response that isn't JSON, so `gateway`'s `CoreClient`/`authProxy` need a second, binary-aware forwarding path alongside the existing JSON one — not a replacement for it).*

## Story

As a learner,
I want to export my data,
so that I have a personal copy of my account.

## Acceptance Criteria

1. **Given** a logged-in learner requests an export **Then** they receive their account and profile data (identity fields, Learner Profile, preferences, privacy settings) as **both** a JSON download and a PDF download — two separate, independently-triggerable downloads (not a single combined artifact), each containing the same underlying data
2. **Given** the export mechanism defined here **Then** it is built so a later epic (once Epic 3/4/6 ship notes/progress/submissions) can add its own section to the same export without this story needing to change — this story does not implement any such section itself, and does not block on those epics existing

## Tasks / Subtasks

- [x] **Task 1: Add `pdfkit` + shared export contract** (AC: #1)
  - [x] `pnpm --filter @usavvy/core add pdfkit` and `pnpm --filter @usavvy/core add -D @types/pdfkit` — the one new runtime dependency this story requires (PDF generation has no existing capability anywhere in this codebase; `pdfkit` is a pure-JS, no-native-compilation PDF library, consistent with this codebase never having introduced a native-binary dependency so far)
  - [x] In `packages/shared-types` (new file `dataExport.ts`): `dataExportSchema` — a single object combining the account-identity fields already exposed by `/me` (`id`, `email`, `displayName`, `memberSince`, `birthdate`, `role`), the full `learnerProfileResponseSchema` shape (Story 1.3), the full `learnerPreferencesSchema` shape (Story 1.4), and the full `learnerPrivacySettingsSchema` shape (Story 1.6) — reuse those three existing schemas directly (`z.object({ account: ..., learnerProfile: learnerProfileResponseSchema, preferences: learnerPreferencesSchema, privacySettings: learnerPrivacySettingsSchema })`), do not redeclare their fields by hand. Export a matching `DataExport` type
  - [x] **This is the shape a later epic's export section attaches to** — Epic 3/4/6 will eventually add their own top-level key (e.g. `notes`, `progress`, `submissions`) to this same object; nothing here needs to anticipate their exact shape, just be structured as an extensible top-level object rather than a flat one

- [x] **Task 2: `services/core`'s `users` module — assemble + render the export** (AC: #1, #2)
  - [x] `generateDataExport(db, userId, role): Promise<DataExport>` in `services/core/src/modules/users/service.ts` — reuse `ensureLearnerProfile()` (Story 1.3) for a single row read, then map that **one row** through the three existing mappers already in this file (`toLearnerProfileResponse`, `toLearnerPreferences`, `toPrivacySettings`) rather than issuing three separate queries. For the `account` section, reuse `buildMeResponse`'s user-row read (a second query is unavoidable — `users` and `learnerProfiles` are different tables — but do **not** duplicate `buildMeResponse`'s field-mapping logic; call it directly and take its non-onboarding fields, or factor the minimal shared piece out, developer's call, but no copy-pasted mapping logic)
  - [x] `generateDataExportPdf(data: DataExport): Buffer` in a new file `services/core/src/modules/users/dataExportPdf.ts` (kept separate from `service.ts` — a rendering concern, not a data-assembly one). Use `pdfkit`'s standard in-memory buffer pattern (`new PDFDocument()`, collect emitted chunks, resolve a `Buffer` on `"end"`). Render a simple, single-purpose document: a title ("Usavvy Data Export"), then one section per top-level key in `data` (Account, Learner Profile, Preferences, Privacy Settings), each rendering its fields as `label: value` lines. No design-system styling is warranted for an exported document a learner opens outside the app — plain, legible text is the entire requirement (no AC/NFR specifies visual design for this artifact)
  - [x] New routes in `services/core/src/modules/users/routes.ts`: `GET /users/data-export/json` — **authenticated** (`requireTrustedUser()`), calls `generateDataExport`, replies with the JSON object directly (Fastify's default JSON serialization — no special header handling needed, this route is identical in shape to every other JSON `GET` in this file). `GET /users/data-export/pdf` — **authenticated**, calls `generateDataExport` then `generateDataExportPdf`, and replies with the raw PDF bytes: `reply.type("application/pdf").header("content-disposition", 'attachment; filename="usavvy-data-export.pdf"').send(buffer)` — this is the **first non-JSON response** any route in this codebase sends; do not run it through `parseOrThrow`/the JSON error-mapper response path, `reply.send(buffer)` bypasses that entirely for a success response (errors, e.g. `401` from `requireTrustedUser()`, still go through the normal JSON error envelope — only the success path is binary)

- [x] **Task 3: `services/gateway` — a second, binary-aware proxy path** (AC: #1)
  - [x] `GET /users/data-export/json` proxies through the **existing** `forwardToCore`/`AuthProxyDeps.forwardToCore` mechanism unchanged — it's a JSON response like every other proxied route, no new plumbing needed here
  - [x] `GET /users/data-export/pdf` needs new plumbing: `forwardToCore`'s current implementation (`services/gateway/src/coreClient.ts`) unconditionally calls `.json()` on core's response, which would corrupt binary PDF bytes. Add a second method to `CoreClient` (and a second `AuthProxyDeps` field): `forwardBinary(method, path, headers): Promise<{ status: number; body: Buffer | undefined; contentType: string | undefined }>` — fetches core exactly like `forward()` does (same headers, same `x-internal-secret`, same timeout), but on success reads `await response.arrayBuffer()` → `Buffer.from(...)` instead of `.json()`, and captures `response.headers.get("content-type")`. On a non-2xx status, still attempt `.json()` for the error envelope (core's error responses are always JSON, even for this route — only the *success* path is binary) and return that as `body` with `contentType: "application/json"`. The new `POST/GET` route handler in `authProxy.ts` checks `result.contentType`: if `"application/pdf"`, `reply.type("application/pdf").header("content-disposition", ...).send(result.body)`; otherwise (an error case) `reply.code(result.status).send(result.body)` matching every other route's error path
  - [x] Both new routes are authenticated via the existing `requireAuth` `preHandler` + `trustedHeaders(request)`, identical to every other `users/*` proxy route

- [ ] **Task 4: `apps/web` — a dedicated export page** (AC: #1)
  - [ ] `apps/web/src/shared/apiClient.ts`: new `apiRequestBlob(apiUrl, path, accessToken): Promise<Blob>` — the existing `apiRequest` assumes a JSON response (`response.json()` + zod `.parse()`); this is the first binary download the frontend needs. On a non-ok response, attempt to parse the JSON error envelope exactly like `apiRequest` does (reuse `errorEnvelopeSchema`) and throw the same `ApiError`; on success, return `response.blob()`
  - [ ] New route `/data-export` (protected — no session → redirect to `/login`, matching every other authenticated page). `DataExportPage.tsx` in `apps/web/src/modules/users/`: two buttons, "Download as JSON" and "Download as PDF" (no auto-fetch on mount — this is an on-demand action, not page data to load, matching `AccountDeletionPage`'s confirm-on-click shape more than `ProfilePage`'s load-on-mount shape). Each button calls `apiRequestBlob` for its respective route, then triggers a browser download via the standard `URL.createObjectURL(blob)` + a synthetic `<a download>` click + `URL.revokeObjectURL(...)` afterward (the standard client-side blob-download pattern — needed because the `Authorization: Bearer` header can't be attached to a plain `<a href>` navigation, unlike a cookie-based session)
  - [ ] A failed download (either button) shows an inline error (AD-17) without disturbing the other button's availability

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8)
  - [ ] `services/core/tests/modules/users/service.test.ts` — `generateDataExport` returns the correct `account`/`learnerProfile`/`preferences`/`privacySettings` sections reflecting actual stored values (not just defaults); reflects a fresh/never-onboarded account's all-null `learnerProfile` correctly too
  - [ ] `services/core/tests/modules/users/dataExportPdf.test.ts` (new) — `generateDataExportPdf` returns a non-empty `Buffer` whose first bytes are a valid PDF header (`%PDF-`) — a minimal but real correctness check without asserting exact rendered content, which would make the test brittle against harmless formatting tweaks
  - [ ] `services/core/tests/modules/users/routes.test.ts` — both routes require authentication (401 with no trusted headers); `GET /users/data-export/json` returns `200` with the expected top-level keys; `GET /users/data-export/pdf` returns `200` with `content-type: application/pdf` and a body starting with the PDF magic bytes
  - [ ] `services/gateway/tests/coreClient.test.ts` (or wherever `coreClient`'s existing tests live — check first) — `forwardBinary` returns a `Buffer` + `contentType` on a successful binary response; falls back to parsing a JSON error envelope on a non-2xx response
  - [ ] `services/gateway/tests/authProxy.test.ts` — both new proxy routes require auth (401 with no token); the PDF route sets `content-type: application/pdf` on the proxied response
  - [ ] `packages/shared-types/tests/dataExport.test.ts` (new) — `dataExportSchema` accepts a fully-populated shape combining all four sections, rejects a shape missing any one section
  - [ ] `apps/web/tests/shared/apiClient.test.ts` (existing — check first) — `apiRequestBlob` returns a `Blob` on success, throws `ApiError` with the parsed error envelope's message on failure
  - [ ] `apps/web/tests/modules/users/DataExportPage.test.tsx` (new) — redirects to `/login` with no session; renders both download buttons; clicking "Download as JSON" fetches the JSON route and triggers a blob download (mock `URL.createObjectURL`/`revokeObjectURL` and assert they're called, matching how jsdom test environments typically stub these); clicking "Download as PDF" does the same for the PDF route; a failed request shows an inline error without removing the other button

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-6 (StoragePort for durable artifacts):** the architecture spine frames exports as a `StoragePort`-appropriate durable artifact. This story deliberately does **not** persist the export to `StoragePort` — no `StoragePort` implementation exists anywhere in this codebase yet (only a health-check `pingStorage`, no actual get/put adapter), and the AC only requires the learner to *receive* the export, not re-download a previously-generated copy later. Building a full `StoragePort` interface + a real SeaweedFS S3-compatible client just for this one feature would be introducing a whole new architectural component speculatively — this story generates the export synchronously, on request, and streams it directly in the HTTP response. See Scope note.
- **AD-14 (ownership):** every field in the export is already owned by `core` (`users`, `learnerProfiles`) — no cross-service reads, no new entity.
- **AD-7 (RBAC):** no new role/permission — every role may export their own data, identical reasoning to every other `users/*` route.
- **AD-17 (no silent failures):** a failed export request (either format) surfaces a specific inline error on the frontend; the PDF route's error path still goes through the normal JSON error envelope — only its success path is binary.
- **AD-8 (test mirroring):** see Task 5.
- **AD-1 (ports over concrete adapters):** `pdfkit` is called directly from `dataExportPdf.ts`, **not** behind a new port — a document-rendering library is a leaf implementation detail of one function, not a swappable infrastructure capability the rest of the codebase depends on (unlike `NotificationPort`/`PubSubPort`/`StoragePort`, which gate genuine cross-cutting capabilities). Don't over-engineer a `PdfPort` for a single call site.

### Previous story intelligence (Stories 1.3–1.7 — read before starting, don't rediscover these)

- **Reuse, don't reinvent:** `ensureLearnerProfile()`, `requireTrustedUser()`, and the three existing row-to-response mappers already in `services/core/src/modules/users/service.ts` — `toLearnerProfileResponse` (Story 1.3), `toLearnerPreferences` (Story 1.4), `toPrivacySettings` (Story 1.6). `generateDataExport` is a thin composition of these, not a new mapping implementation.
- **This story is the first to need a non-JSON HTTP response anywhere in the codebase.** Every prior route (`core` and `gateway` alike) assumes JSON in, JSON out. Read `services/gateway/src/coreClient.ts`'s existing `forward()` method and `services/gateway/src/authProxy.ts`'s existing route-registration pattern fully before writing the new binary path — the new `forwardBinary` sits *alongside* `forward()`, doesn't replace or generalize it (a shared abstraction trying to handle both JSON and binary would be more complex than two focused, separate methods for two genuinely different response shapes).
- **The frontend's `apiRequest` (`apps/web/src/shared/apiClient.ts`) assumes JSON too** — same reasoning, add a sibling `apiRequestBlob`, don't try to generalize `apiRequest` itself to handle both.
- **No dedicated page/nav placement is specified anywhere** (`EXPERIENCE.md`'s profile-menu list doesn't mention "export" either) — matches `AccountDeletionPage`'s precedent of a standalone, directly-reachable route with no nav wiring, rather than bolting an export control onto `ProfilePage`.
- **Cancellation guards are mandatory on every async call that updates component state** — every page added since Story 1.3's review has needed one. `DataExportPage`'s two download handlers are one-shot user-triggered actions (not mount-time fetches), but still guard `isMountedRef` before calling `setState` after the async call resolves, same discipline as every other page.
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass. Commits must **not** include a `Co-Authored-By` trailer.

### Scope note: what's explicitly OUT of scope for this story

- **Persisting the export to `StoragePort`/object storage.** No `StoragePort` adapter exists yet; this story generates and streams the export synchronously on each request. A "re-download my last export" or "email me a copy" feature would need real `StoragePort` wiring — a future story's job, not this one's.
- **Any Epic 3/4/6 data section** (notes, progress, submissions) — none of those epics have shipped. This story defines the extensible top-level shape (`dataExportSchema`) those epics will eventually add a key to; it implements only the `account`/`learnerProfile`/`preferences`/`privacySettings` sections.
- **A combined single-file export** (e.g. a zip containing both JSON and PDF) — AC #1 asks for both formats as independent downloads, not a bundle.
- **Any visual design/branding for the PDF** — plain, legible text only; no AC/NFR specifies a design requirement for this artifact.
- **No nav entry point** — same gap every prior Epic 1 story has documented for itself.

### API response shapes

| Route | Success shape |
| --- | --- |
| `GET /users/data-export/json` | `200 { account: {...}, learnerProfile: {...}, preferences: {...}, privacySettings: {...} }` |
| `GET /users/data-export/pdf` | `200`, `content-type: application/pdf`, `content-disposition: attachment; filename="usavvy-data-export.pdf"`, raw PDF bytes |
| any failure | `{ error: { code, message, details? } }` — `401` unauthenticated |

### Project Structure Notes

```text
services/core/
  package.json                             # updated — pdfkit, @types/pdfkit
  src/
    modules/
      users/
        service.ts                          # updated — generateDataExport
        dataExportPdf.ts                    # new — generateDataExportPdf
        routes.ts                           # updated — GET /users/data-export/{json,pdf}
  tests/
    modules/users/service.test.ts           # updated
    modules/users/dataExportPdf.test.ts     # new
    modules/users/routes.test.ts            # updated

services/gateway/
  src/
    coreClient.ts                           # updated — forwardBinary
    authProxy.ts                            # updated — two new routes, one binary-aware
    app.ts                                  # updated — AuthProxyDeps gains forwardBinaryToCore
    main.ts                                 # updated — wiring
  tests/
    coreClient.test.ts                      # updated (or wherever these tests live)
    authProxy.test.ts                       # updated

packages/shared-types/
  src/
    dataExport.ts                           # new — dataExportSchema
    index.ts                                 # updated — barrel
  tests/
    dataExport.test.ts                      # new

apps/web/
  src/
    shared/
      apiClient.ts                          # updated — apiRequestBlob
    modules/
      users/
        DataExportPage.tsx                  # new
        api.ts                                 # updated — export helpers (or call apiRequestBlob directly)
        index.ts                               # updated — barrel
    app/
      App.tsx                              # updated — /data-export route
  tests/
    shared/apiClient.test.ts                # updated
    modules/users/DataExportPage.test.tsx   # new
```

### Testing requirements

- Backend export tests are integration-style against the real Postgres container, matching every prior story's precedent.
- All tests pass locally via `docker-compose up` + native dev servers before this story is considered done.
- Verify the PDF route live via `curl -o export.pdf` (or equivalent) against the running `core`/`gateway` stack, not just via test assertions — a `content-type`/magic-bytes check in an automated test doesn't fully substitute for confirming a real PDF file was produced.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.8 (already rescoped in-place during Implementation Readiness review), Epic 1 intro, FR-A-8]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-6 (StoragePort, "durable artifacts... recordings, exports"), AD-7, AD-8, AD-14, AD-17]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-3-onboarding-wizard.md`, `1-4-learner-preferences.md`, `1-6-privacy-controls.md` — the three existing response schemas/mappers this story composes rather than re-implements]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-7-account-deletion.md` — the standalone-page-with-no-nav-placement precedent this story follows]
- [Source: `services/gateway/src/coreClient.ts`, `services/gateway/src/authProxy.ts` — the existing JSON-only proxy mechanism this story adds a binary-aware sibling to]

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-3, backend + gateway) — `pdfkit` added, `dataExportSchema` combining the three existing response schemas, `generateDataExport`/`generateDataExportPdf`, `GET /users/data-export/{json,pdf}` in core, and a new binary-aware `forwardBinary`/`forwardBinaryToCore` proxy path in gateway alongside the existing JSON-only `forward`. 165 `services/core` tests (up from 157), 52 `services/gateway` tests (up from 44), 78 `shared-types` tests (up from 73).

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1-3 (backend + gateway):** `generateDataExport` reuses `getMe` for the account section and the three existing row mappers (`toLearnerProfileResponse`/`toLearnerPreferences`/`toPrivacySettings`) applied to a single `ensureLearnerProfile` read — no duplicated mapping logic, two total queries. `generateDataExportPdf` returns `Promise<Buffer>` (not a synchronous `Buffer`) since `pdfkit` is inherently event-driven (chunks emitted over `"data"`, resolved on `"end"`) — the story's own Task 2 wording said `Buffer` for brevity, but the real API is necessarily async. Gateway's `forwardBinary` is a genuinely separate method from `forward()`, not a generalized one — JSON and binary responses have different enough handling (`.json()` vs `.arrayBuffer()`, and the two need different error-path assumptions) that one shared method would have been more convoluted than two focused ones.

### File List

**Task 1 (pdfkit + shared contract):**
- `services/core/package.json` (updated — `pdfkit`, `@types/pdfkit`)
- `packages/shared-types/src/dataExport.ts` (new — `dataExportSchema`)
- `packages/shared-types/src/index.ts` (updated — barrel), `packages/shared-types/tests/dataExport.test.ts` (new)

**Task 2 (core users module):**
- `services/core/src/modules/users/service.ts` (updated — `generateDataExport`)
- `services/core/src/modules/users/dataExportPdf.ts` (new — `generateDataExportPdf`)
- `services/core/src/modules/users/routes.ts` (updated — `GET /users/data-export/{json,pdf}`)
- `services/core/tests/modules/users/service.test.ts` (updated), `services/core/tests/modules/users/dataExportPdf.test.ts` (new), `services/core/tests/modules/users/routes.test.ts` (updated)

**Task 3 (gateway binary proxy):**
- `services/gateway/src/coreClient.ts` (updated — `forwardBinary`, `BinaryProxyOptions`, `BinaryProxyResult`)
- `services/gateway/src/app.ts` (updated — `BuildAppDeps` gains `forwardBinaryToCore`), `services/gateway/src/main.ts` (updated — wiring)
- `services/gateway/src/authProxy.ts` (updated — two new routes, one binary-aware)
- `services/gateway/tests/coreClient.test.ts` (updated), `services/gateway/tests/authProxy.test.ts` (updated), `services/gateway/tests/testHelpers.ts` (updated — `forwardBinaryToCore` default)
