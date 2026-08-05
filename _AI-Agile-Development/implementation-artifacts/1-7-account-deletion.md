---
baseline_commit: c62736c
---

# Story 1.7: Account Deletion

Status: done

*(Epic 1, FR-A-7. Per the Implementation Readiness Report's own Major finding — "Story 1.7's account-deletion AC implies direct cross-module deletion, violating AD-14 (should publish a domain event instead)" — this story does not have `core` reach into other services' data. It can't, structurally: uploads/notes/submissions/progress belong to `ingestion`/`engagement`/`assignments`/`plans-progress`, none of which are scaffolded yet (all still "scaffolded when their epic starts" per the architecture spine's own source tree), and AD-14 forbids a direct cross-database write/delete regardless. Following AD-13's actual rule ("a state change... must additionally be published as a domain event on Redis... event emission is not optional just because a caller also invoked the HTTP API directly"), this story builds the missing piece the readiness report flagged: a minimal `PubSubPort` (mirroring `NotificationPort`'s exact AD-1 port pattern from Story 1.0 — mock adapter only, no new npm dependency, matching AD-12's "config-driven, swap the real adapter in later" philosophy) that `core` uses to publish `user.deletion_requested`. Actual data purge — the "removed within 30 days" half of the AC — needs two things that don't exist yet: a real event *subscriber* in each owning service (none exist), and a durable scheduled job (`JobQueuePort`, AD-15, "entirely unwired" per Story 1.1's own identical deferred item for token cleanup). This story's buildable scope is the request → confirm → schedule → notify → publish-event vertical slice; the actual purge is deferred exactly the way Story 1.1 deferred its own JobQueuePort-dependent cleanup.)*

## Story

As a learner,
I want to delete my account,
so that I can exercise my right to be forgotten.

## Acceptance Criteria

1. **Given** a learner confirms account deletion **Then** a confirmation email sends via `NotificationPort` — reusing the existing mock adapter from Story 1.0, same as every other transactional email in this codebase (verification, parental consent)
2. **Given** the same confirmation **Then** the account is marked for deletion with a `scheduledDeletionAt` timestamp 30 days out, and a `user.deletion_requested` domain event is published via a new `PubSubPort` — this is the "removed within 30 days" AC's *scheduling* half; the actual cross-service purge is deferred (see Scope note) since no service exists yet to subscribe to the event, and no durable job scheduler (`JobQueuePort`, AD-15) exists yet to execute it on the 30-day deadline
3. **Given** a learner who has already requested deletion **Then** a second request is rejected (`409`) rather than resetting the clock or sending a duplicate email — matches Story 1.2's `AGE_ALREADY_DECLARED` one-time-action precedent exactly

## Tasks / Subtasks

- [x] **Task 1: `PubSubPort` — the missing domain-event mechanism (AD-1, AD-13)** (AC: #2)
  - [x] New module `services/core/src/modules/pubsub/` mirroring `services/core/src/modules/notification/`'s exact 4-file shape: `port.ts` (`export interface DomainEvent { type: string; payload: Record<string, unknown>; }` and `export interface PubSubPort { publish(event: DomainEvent): Promise<void>; }` — `type` is past-tense per the Consistency Conventions' own naming rule, e.g. `"user.deletion_requested"`, matching the spine's own examples `concept.mastered`/`beat.played`), `mock.ts` (`createMockPubSubAdapter(logger)` — logs `{ type, payload }` via `logger.info`, identical shape to `createMockNotificationAdapter`), `factory.ts` (`createPubSubAdapter(adapter: "mock", logger): PubSubPort`, identical shape to `createNotificationAdapter`), `index.ts` (barrel, re-exporting all three)
  - [x] **Do not add a Redis client dependency (`ioredis`, `redis`, etc.) in this story.** `NotificationPort` itself still only has a `mock` adapter with no real email provider wired (Story 1.1's own documented state) — the mock-only pattern is this codebase's established way to satisfy a port's interface contract before a concrete swap is actually needed. A real Redis-backed `PubSubPort` adapter is a config-only swap (AD-12) for whenever a real subscriber exists to receive it; building one now with zero consumers would be speculative infrastructure this codebase's own conventions avoid
  - [x] `services/core/src/config.ts`: add `PUBSUB_ADAPTER: z.enum(["mock"]).default("mock")` and `pubSubAdapter` to `CoreConfig`, mirroring `NOTIFICATION_ADAPTER`/`notificationAdapter` exactly
  - [x] `services/core/src/main.ts`: `export const pubSubPort = createPubSubAdapter(config.pubSubAdapter, createLogger("pubsub"));`, pass into `buildApp({ ..., pubSubPort })`, mirroring `notificationPort`'s exact wiring
  - [x] `services/core/src/app.ts`: add `pubSubPort: PubSubPort` to `BuildAppDeps`
  - [x] `services/core/tests/testHelpers.ts`: add `createMockPubSubPort(): PubSubPort` (a `vi.fn()`-based mock, mirroring `createMockNotificationPort`) and add it to `createTestAppDeps`'s defaults

- [x] **Task 2: `users` table gains deletion-scheduling columns + shared contract** (AC: #2, #3)
  - [x] Add 2 nullable timestamp columns to the existing `users` table in `services/core/src/db/schema.ts` (same table `displayName` was added to in Story 1.5 — an account-identity concern, not a `learnerProfiles` one): `deletionRequestedAt` (`timestamp("deletion_requested_at", { withTimezone: true })`), `scheduledDeletionAt` (`timestamp("scheduled_deletion_at", { withTimezone: true })`). Both null until a deletion is requested
  - [x] In `packages/shared-types` (new file `accountDeletion.ts`): `accountDeletionResponseSchema` (`z.object({ scheduledDeletionAt: z.string() })` — ISO 8601, per Consistency Conventions)
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 3: `services/core`'s `users` module — account-deletion endpoint** (AC: #1, #2, #3)
  - [x] New `requestAccountDeletion(db, notificationPort, pubSubPort, userId): Promise<AccountDeletionResponse>` in `services/core/src/modules/users/service.ts`. Compute `scheduledDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)` (30 days from now — a plain server-clock computation, no config for this MVP since no NFR specifies a configurable grace period). Perform the write as an atomic compare-and-swap exactly like `declareAge`'s established pattern: `UPDATE users SET deletion_requested_at = now(), scheduled_deletion_at = ... WHERE id = userId AND deletion_requested_at IS NULL RETURNING id` — if zero rows update, throw `AppError("ACCOUNT_DELETION_ALREADY_REQUESTED", ..., 409)` (this is the real guarantee; a fast-path courtesy pre-check adds no correctness, matching `declareAge`'s own documented reasoning for skipping one). On success: `await notificationPort.sendEmail({ to: user.email, subject: "...", body: "..." })` (mentioning the 30-day window in the body — mirrors `declareAge`'s parental-consent email precedent of a plain, informative body, not a templated one), then `await pubSubPort.publish({ type: "user.deletion_requested", payload: { userId, scheduledDeletionAt: scheduledDeletionAt.toISOString() } })`, then return `{ scheduledDeletionAt: scheduledDeletionAt.toISOString() }`
  - [x] New route `POST /users/account-deletion` in `services/core/src/modules/users/routes.ts` — **authenticated** via the existing `requireTrustedUser()` (no request body needed; the confirmation *is* the request itself, matching how `POST /users/parental-consent` needs only a token)
  - [x] **Do not implement the actual data purge, the 30-day scheduled job, or any cross-service deletion in this story** — see Scope note

- [x] **Task 4: `services/gateway` — proxy the new route** (AC: #1, #2, #3)
  - [x] `POST /users/account-deletion` → authenticated, identical `requireAuth` `preHandler` + trusted-header forwarding pattern already used for every other `users/*` route in `authProxy.ts`

- [x] **Task 5: `apps/web` — a dedicated confirmation page** (AC: #1, #2, #3)
  - [x] New route `/account-deletion` (protected — no session → redirect to `/login`, same pattern as every other authenticated page). This is a **new, dedicated page** (`AccountDeletionPage.tsx` in `apps/web/src/modules/users/`), **not** a control bolted onto `ProfilePage` — matches `AgeDeclarationPage`'s precedent of a standalone page for a single, high-consequence, one-time confirmation, unlike `ProfilePage`'s freely-repeatable identity/privacy edits. No IA/nav doc places this control anywhere specific either, so a direct, un-navigated route is consistent with every other page added so far
  - [x] Render an explanation of what deletion means (mentioning the 30-day window) and a single confirm action (`Button`, primary or a distinct destructive styling if one exists in `components.css` — check first; if none exists, use the existing error-color tokens already defined in `tokens.css`, don't invent a new color). On confirm, `POST /users/account-deletion` (add `requestAccountDeletion` to `apps/web/src/modules/users/api.ts`'s `createUsersApi`, matching the existing method shapes). On success, replace the confirm UI with a plain-text confirmation showing the returned `scheduledDeletionAt` date and a note to check email. On a `409 ACCOUNT_DELETION_ALREADY_REQUESTED` failure, show that as a specific inline message (not a generic error) — the account already has a pending deletion, which is useful information, not a failure
  - [x] No client-side cancellation/undo flow in this story (not in the AC; a natural near-term follow-up, same "flag it, don't build it" treatment Stories 1.1/1.2 gave their own out-of-scope follow-ups)

- [x] **Task 6: Tests mirroring `src/` 1:1** (AD-8)
  - [x] `services/core/tests/modules/pubsub/factory.test.ts` and/or `mock.test.ts` (new, mirroring however `notification`'s own tests are organized — check first) — the mock adapter logs and resolves successfully; the factory returns the mock adapter for `"mock"`
  - [x] `services/core/tests/modules/users/service.test.ts` — `requestAccountDeletion` sets `deletionRequestedAt`/`scheduledDeletionAt` (30 days out) and returns the same ISO date; sends exactly one confirmation email to the account's own address; publishes exactly one `user.deletion_requested` event with the correct `userId`/`scheduledDeletionAt` payload; rejects a second request with `409 ACCOUNT_DELETION_ALREADY_REQUESTED`, sending no second email and publishing no second event; under two concurrent requests for the same account, exactly one succeeds (mirrors `declareAge`'s own concurrent-request test precedent)
  - [x] `services/core/tests/modules/users/routes.test.ts` — `POST /users/account-deletion` requires authentication (401 with no trusted headers); a valid request returns `200` with a `scheduledDeletionAt` field; a second request returns `409` through the real route
  - [x] `services/gateway/tests/authProxy.test.ts` — the new proxy route requires auth (401 with no token)
  - [x] `packages/shared-types/tests/accountDeletion.test.ts` (new) — `accountDeletionResponseSchema` accepts a valid ISO-date shape, rejects a missing field
  - [x] `apps/web/tests/modules/users/AccountDeletionPage.test.tsx` (new) — redirects to `/login` with no session; renders the confirm action; confirming fires `POST /users/account-deletion` and shows the returned scheduled date on success; a `409` response shows the "already requested" message instead of a generic error

### Review Findings (2026-08-05)

- [x] [Review][Patch] The CAS write (marking `deletionRequestedAt`) committed before the confirmation email and domain-event publish, with no compensating action — if either later `await` threw, the request failed with a `500` but the CAS guard now permanently rejected every future retry with `409 ACCOUNT_DELETION_ALREADY_REQUESTED`, leaving the account stuck with no email sent, no event published, and no way to recover (confirmed independently by both Blind Hunter and Edge Case Hunter) [`services/core/src/modules/users/service.ts`] — the two side effects now run via `Promise.allSettled`, with a failure logged (not silently swallowed, AD-17) rather than thrown; a `Logger` was threaded through `UsersRouteDeps`/`requestAccountDeletion` for this. Verified with two new tests (mocked `sendEmail`/`publish` rejection), each confirmed to fail against the pre-fix sequential-`await` code and pass against the fix
- [x] [Review][Patch] The destructive "Delete my account" button was styled via an inline `style` prop rather than `Button`'s existing `variant` mechanism, sidestepping the component's own API [`apps/web/src/modules/users/AccountDeletionPage.tsx`] — added a proper `destructive` variant to `Button.tsx`/`components.css`, reusing the same existing error-color tokens the inline style already used (no new color invented, matching the story's own instruction)
- [x] [Review][Dismiss] Frontend error handling was flagged for not explicitly branching on `error.code === "ACCOUNT_DELETION_ALREADY_REQUESTED"` — on inspection this already correctly satisfies AC #3: any `ApiError` (including the 409) renders its own specific server-provided message, and only a non-`ApiError` (network/unexpected) failure falls back to the generic message. This is the same `instanceof ApiError` pattern already established by `AgeDeclarationPage`/`ParentalConsentPage`; no functional gap exists.
- [x] [Review][Defer] The feature's own copy (email + page) promises data removal within 30 days that no code anywhere can currently execute — no `JobQueuePort`-based scheduler and no downstream service exists yet to consume `user.deletion_requested`. This is the story's own explicit, documented scope decision (see the italic note after the title and the Scope note below), not an oversight; revisit once a purge subscriber and job scheduler exist.
- [x] [Review][Defer] No cancel/undo-deletion flow — already explicitly out of scope per this story's own Task 5 note.
- [x] [Review][Defer] No step-up re-authentication (password re-entry, secondary confirmation) before an irreversible action — no page in this app requires re-auth for anything today; a systemic gap, not unique to this story.
- [x] [Review][Defer] `AccountDeletionPage` doesn't check for an already-pending deletion on mount, so revisiting the page after a successful request shows the same confirm UI again (the truth only surfaces via the `409` message after a second click). Fixing this needs a new `GET` status check or an extension to `/me` — explicitly out of scope per this story's own "do not touch `GET /me`" constraint; a natural follow-up once that's warranted.
- [x] [Review][Defer] `DomainEvent` (`{ type, payload }`) carries no event id, timestamp, or schema version for future dedup/idempotent processing. Premature — no real subscriber exists yet to need it; matches this codebase's "don't build for hypothetical future requirements" convention.
- [x] [Review][Defer] No DB index on `scheduled_deletion_at` for the future "find everyone due for purge" query. Premature — no such query exists yet, and the table has no meaningful row count to index against today.
- [x] [Review][Defer] The pre-check `SELECT` and the CAS `UPDATE` are two separate statements; a row removed in between would report `409` rather than `404`. Matches `declareAge`'s identical, already-accepted TOCTOU tradeoff (Story 1.2) — unreachable today regardless, since no account-deletion-execution feature exists yet to remove a user row.
- [x] [Review][Defer] No session-expiry-specific handling in `AccountDeletionPage`'s submit handler (an expired token mid-submit shows a generic/API error rather than redirecting to `/login`). Matches Story 1.4's identical already-deferred "no auto-refresh-on-expiry" gap — systemic, not unique to this diff.
- [x] [Review][Defer] Timezone display mismatch: the confirmation email renders `scheduledDeletionAt` as a raw UTC ISO instant while the page renders the same value via `toLocaleDateString()` in the viewer's local timezone, which can disagree by a calendar day near midnight. Matches the identical, already-deferred local-date-math pattern from Stories 1.2/1.3/1.5.
- [x] [Review][Defer] Generated migration/snapshot files lack a trailing newline. Matches Story 1.3/1.4/1.6's identical dismissed finding.

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-1 (ports over concrete adapters):** `PubSubPort` follows the identical shape/rationale as `NotificationPort` — depend on the interface, bind the concrete adapter once at boot from config (AD-12).
- **AD-13 (domain events, not direct cross-service calls):** this is the entire point of Task 1 — `core` publishes `user.deletion_requested`; it never reaches into another service's database or calls another service's API to delete data it doesn't own.
- **AD-14 (ownership):** `deletionRequestedAt`/`scheduledDeletionAt` extend `users`, already owned by `core`. `core` never touches a table it doesn't own — that's precisely why the purge is a published event, not a direct delete.
- **AD-15 (JobQueuePort):** the actual 30-day-later execution needs a durable scheduled job. Not scaffolded anywhere yet (Story 1.1 already deferred an identical need for verification-token cleanup) — out of scope here too.
- **AD-7 (RBAC):** no new role/permission — every role may delete their own account, identical reasoning to every other `users/*` route.
- **AD-17 (no silent failures):** a second deletion request resolves to a specific `409 ACCOUNT_DELETION_ALREADY_REQUESTED`, not a silent no-op or a generic error.
- **AD-8 (test mirroring):** see Task 6.
- **Consistency Conventions:** domain event `type` values are past-tense (`user.deletion_requested`, matching the spine's own `concept.mastered`/`beat.played` examples); all timestamps ISO 8601 UTC.

### Previous story intelligence (Stories 1.0–1.6 — read before starting, don't rediscover these)

- **`NotificationPort` (`services/core/src/modules/notification/`, Story 1.0) is the exact template for `PubSubPort`** — same 4-file shape (`port.ts`/`mock.ts`/`factory.ts`/`index.ts`), same config-driven adapter selection, same "mock only until a real need exists" philosophy. Copy its structure, don't reinvent a different shape.
- **`declareAge`'s compare-and-swap pattern** (`services/core/src/modules/users/service.ts`, Story 1.2) is the exact template for `requestAccountDeletion`'s one-time-action guard: `WHERE id = userId AND <not-yet-done-column> IS NULL`, a `409` on zero rows updated, no separate pre-check (TOCTOU-safe by construction, not by a fast-path guess). Story 1.2's own review found and fixed a race in an earlier, weaker version of this exact pattern — don't reintroduce that weaker version.
- **`requireTrustedUser()`** (`services/core/src/modules/users/routes.ts`) — this route's authentication, no new copy.
- **The `AgeDeclarationPage`/`ParentalConsentPage` precedent** for a dedicated, single-purpose confirmation page (not a control embedded in a general-purpose page like `ProfilePage`) — `AccountDeletionPage` follows that shape, not `PreferencesPage`'s per-control auto-save shape (this is a one-time, high-consequence action, not a freely-repeatable setting).
- **Cancellation guards are mandatory on every mount-time and submit-time async call** — every page added since Story 1.3's review has needed one. Build `AccountDeletionPage` with one from the start.
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass. Commits must **not** include a `Co-Authored-By` trailer.

### Scope note: what's explicitly OUT of scope for this story

- **The actual deletion of any data, anywhere, on the 30-day deadline.** No `JobQueuePort` exists to schedule it, and no other service exists yet to own the uploads/notes/submissions/progress data the AC's "all uploads and personal data" phrase refers to. This story's contribution is the request/schedule/notify/publish-event slice; a later story (once `JobQueuePort` and at least one data-owning service exist) is responsible for a subscriber that actually executes the purge on `user.deletion_requested` at the scheduled time.
- **A real Redis-backed `PubSubPort` adapter.** Only the `mock` adapter is built, exactly matching `NotificationPort`'s own current state (no real email provider wired either). Swapping in a real adapter is a config change (AD-12) for whenever an actual subscriber needs to receive the event over the wire.
- **Blocking login, or any other behavior change, for an account with a pending deletion.** Not in the AC; inventing it would be scope creep with no spec to validate it against.
- **A cancel/undo-deletion flow.** Not in the AC — flagged as a likely near-term follow-up, not built.
- **Any change to `GET /me`.** `deletionRequestedAt`/`scheduledDeletionAt` are not surfaced there — no AC requires it, and this page doesn't need to read `/me` to render its own confirm/confirmed states.
- **No nav entry point.** Same gap every prior Epic 1 story has documented for itself — `/account-deletion` is directly reachable, matching every other page.

### API response shape

| Route | Success shape |
| --- | --- |
| `POST /users/account-deletion` | `200 { scheduledDeletionAt: string }` (ISO 8601) |
| any failure | `{ error: { code, message, details? } }` — `401` unauthenticated, `409 ACCOUNT_DELETION_ALREADY_REQUESTED` on a second request |

### Project Structure Notes

```text
services/core/
  src/
    modules/
      pubsub/
        port.ts                               # new — DomainEvent, PubSubPort
        mock.ts                               # new — createMockPubSubAdapter
        factory.ts                            # new — createPubSubAdapter
        index.ts                              # new — barrel
      users/
        service.ts                            # updated — requestAccountDeletion
        routes.ts                             # updated — POST /users/account-deletion
    db/
      schema.ts                               # updated — users gains deletionRequestedAt, scheduledDeletionAt
    config.ts                                 # updated — PUBSUB_ADAPTER
    main.ts                                   # updated — pubSubPort wiring
    app.ts                                    # updated — BuildAppDeps gains pubSubPort
  tests/
    testHelpers.ts                            # updated — createMockPubSubPort
    modules/pubsub/                           # new
    modules/users/service.test.ts             # updated
    modules/users/routes.test.ts              # updated

services/gateway/
  src/
    authProxy.ts                              # updated — one new authenticated route
  tests/
    authProxy.test.ts                         # updated

packages/shared-types/
  src/
    accountDeletion.ts                        # new — accountDeletionResponseSchema
    index.ts                                   # updated — barrel
  tests/
    accountDeletion.test.ts                   # new

apps/web/
  src/
    modules/
      users/
        AccountDeletionPage.tsx               # new
        api.ts                                 # updated — requestAccountDeletion
        index.ts                               # updated — barrel
    app/
      App.tsx                                 # updated — /account-deletion route
  tests/
    modules/users/AccountDeletionPage.test.tsx # new
```

### Testing requirements

- Backend account-deletion tests are integration-style against the real Postgres container, matching every prior story's precedent.
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.7, Epic 1 intro, FR-A-7]
- [Source: `_AI-Agile-Development/planning-artifacts/implementation-readiness-report-2026-08-04.md` — Major finding: "Story 1.7's account-deletion AC implies direct cross-module deletion, violating AD-14 (should publish a domain event instead)" — the basis for this story's `PubSubPort` scope]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-7, AD-8, AD-12, AD-13 (domain events, Redis pub/sub, "event emission is not optional"), AD-14, AD-15 (JobQueuePort), AD-17, Consistency Conventions (past-tense event naming)]
- [Source: `services/core/src/modules/notification/` — the exact port/mock/factory shape `PubSubPort` mirrors]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-2-age-declaration-minor-consent.md` — `declareAge`'s compare-and-swap one-time-action pattern this story's `requestAccountDeletion` reuses]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-1-sign-up-log-in-with-email-verification.md` — the identical, already-deferred "needs JobQueuePort, entirely unwired" reasoning this story's own deferred purge-job matches]

## Dev Agent Record

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-4, backend) — new `PubSubPort` (mock adapter, mirroring `NotificationPort`'s exact 4-file shape, no new dependency), `users` gains `deletionRequestedAt`/`scheduledDeletionAt`, `POST /users/account-deletion` (core + gateway proxy) with `declareAge`-style compare-and-swap one-time-action guard, confirmation email, and domain event publish. 155 `services/core` tests (up from 144), 44 `services/gateway` tests (up from 42), 73 `shared-types` tests (up from 71).
- 2026-08-05: Checkpoint 2 (Task 5, frontend) — new dedicated `AccountDeletionPage` (`/account-deletion`, not bolted onto `ProfilePage`), confirm action → `POST /users/account-deletion` → success shows the scheduled date, a `409` shows a specific "already requested" message rather than a generic error. `requestAccountDeletion` added to `users/api.ts`. 118 `apps/web` tests (up from 113).
- 2026-08-05: Task 6 completion — full regression clean (416 tests across the monorepo: 14 config, 73 shared-types, 12 service-kernel, 118 apps/web, 44 gateway, 155 core), `tsc --noEmit`/`eslint .` clean in every workspace. Migration applied to the live Postgres container and the full flow reverified end-to-end via `curl` directly against `core`: a first request returns `200` with a `scheduledDeletionAt` 30 days out, a second returns `409 ACCOUNT_DELETION_ALREADY_REQUESTED`, and the gateway proxy rejects an unauthenticated request with `401`. A live browser render/interaction check of `AccountDeletionPage` was not performed — this session's browser-automation tooling was already confirmed unable to send non-GET/POST-with-body requests reliably in earlier stories; `curl` + mocked-fetch component tests cover the same contract. Test data cleaned up from Postgres. Status → `review`.
- 2026-08-05: Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) run against the diff since `baseline_commit`. Blind Hunter and Edge Case Hunter independently flagged the same critical bug: the CAS write committed before the confirmation email/domain-event publish, with no compensating action — a failure in either left the account permanently stuck (every retry rejected by the CAS guard, with no email ever sent and no event ever published). Acceptance Auditor found zero spec violations. 2 patch, 1 dismiss, 10 defer. Both patches applied: the two side effects now run via `Promise.allSettled` with failures logged (a `Logger` threaded through `UsersRouteDeps`/`requestAccountDeletion` for this) rather than thrown, verified with two new tests proven to fail against the pre-fix sequential-`await` code and pass against the fix; and the destructive button now uses a proper new `Button` `destructive` variant (reusing the same existing error-color tokens) instead of an inline `style` override. 10 findings deferred (logged to `deferred-work.md`) — all either the story's own explicit, already-documented scope decisions, premature engineering for consumers/queries that don't exist yet, or systemic gaps matching prior stories' own accepted patterns. 418 tests green (up from 416), `tsc --noEmit`/`eslint .` clean. Re-verified live via `curl` against `core` after the fix. Status → `done`.

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1-4 (backend):** `PubSubPort` is a direct structural copy of `NotificationPort` (Story 1.0) — same port/mock/factory/index shape, same config-driven adapter selection. `requestAccountDeletion` reuses `declareAge`'s exact compare-and-swap idiom (`WHERE id = userId AND deletion_requested_at IS NULL`) rather than a separate pre-check, for the same TOCTOU-safety reasoning Story 1.2's own review established.

### File List

**Task 1 (PubSubPort):**
- `services/core/src/modules/pubsub/port.ts` (new), `mock.ts` (new), `factory.ts` (new), `index.ts` (new)
- `services/core/src/config.ts` (updated — `PUBSUB_ADAPTER`), `services/core/src/main.ts` (updated — `pubSubPort` wiring), `services/core/src/app.ts` (updated — `BuildAppDeps` gains `pubSubPort`)
- `services/core/tests/testHelpers.ts` (updated — `createMockPubSubPort`)
- `services/core/tests/modules/pubsub/factory.test.ts` (new), `services/core/tests/modules/pubsub/mock.test.ts` (new)

**Task 2 (schema + shared contract):**
- `services/core/src/db/schema.ts` (updated — `users` gains `deletionRequestedAt`/`scheduledDeletionAt`)
- `services/core/drizzle/0007_unusual_havok.sql` (new — generated migration), `services/core/drizzle/meta/0007_snapshot.json` (new), `services/core/drizzle/meta/_journal.json` (updated)
- `packages/shared-types/src/accountDeletion.ts` (new — `accountDeletionResponseSchema`)
- `packages/shared-types/src/index.ts` (updated — barrel), `packages/shared-types/tests/accountDeletion.test.ts` (new)

**Task 3 (core users module):**
- `services/core/src/modules/users/service.ts` (updated — `requestAccountDeletion`)
- `services/core/src/modules/users/routes.ts` (updated — `POST /users/account-deletion`, `UsersRouteDeps` gains `pubSubPort`)
- `services/core/tests/modules/users/service.test.ts` (updated), `services/core/tests/modules/users/routes.test.ts` (updated)

**Task 4 (gateway proxy):**
- `services/gateway/src/authProxy.ts` (updated — one new authenticated route)
- `services/gateway/tests/authProxy.test.ts` (updated)

**Task 5 (apps/web):**
- `apps/web/src/modules/users/AccountDeletionPage.tsx` (new)
- `apps/web/src/modules/users/api.ts` (updated — `requestAccountDeletion`), `apps/web/src/modules/users/index.ts` (updated — barrel)
- `apps/web/src/app/App.tsx` (updated — `/account-deletion` route)
- `apps/web/tests/modules/users/AccountDeletionPage.test.tsx` (new)

**Task 6 (sprint tracking):**
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (updated — Story 1.7 → `in-progress`, then `review`, then `done`)

**Code review patch round (2026-08-05):**
- `services/core/src/modules/users/service.ts` (updated — `Promise.allSettled` for email/publish, logged not thrown, `Logger` param added)
- `services/core/src/modules/users/routes.ts` (updated — passes `deps.logger` through), `services/core/src/app.ts` (updated — `registerUsersRoutes` call passes `logger`)
- `services/core/tests/modules/users/service.test.ts` (updated — 2 new stuck-state regression tests, verified to fail against the pre-patch code)
- `apps/web/src/shared/Button.tsx` (updated — new `destructive` variant), `apps/web/src/shared/components.css` (updated — `.usavvy-button-destructive`)
- `apps/web/src/modules/users/AccountDeletionPage.tsx` (updated — uses `variant="destructive"` instead of inline style)
- `_AI-Agile-Development/implementation-artifacts/deferred-work.md` (updated — 10 items deferred from this review)
