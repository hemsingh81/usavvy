---
baseline_commit: 46548f4
---

# Story 1.2: Age Declaration & Minor Consent

Status: done

*(Epic 1, FR-A-2/NFR-16. Directly extends Story 1.1's just-built auth flow — reuses its Drizzle/token/NotificationPort/error-envelope patterns rather than inventing new ones. First story to add a genuinely protected, authenticated write endpoint beyond `/me`.)*

## Story

As a new user,
I want to declare my age at sign-up,
so that the platform applies the right protections if I'm a minor.

## Acceptance Criteria

1. **Given** a newly verified, logged-in user who hasn't declared their age yet **When** they submit a birthdate indicating they are under 18 **And** a parent's email **Then** the account enters a minor flow: a parental consent email sends via `NotificationPort` (mock adapter in dev, Story 1.0's pattern) and no further account activity proceeds until consent is granted — this is the buildable form of "before any account activity": there is no protected resource yet beyond `/me` and this story's own endpoint, so the enforcement point today is the frontend routing to a waiting screen plus `/me` reporting the pending status, which is what will gate real features (Board, onboarding) once they exist

2. **Given** a minor-flagged account awaiting consent **When** the learner is logged in **Then** they see a clear, calm "waiting for parental consent" state (not an error/warning treatment — matches `DESIGN.md`'s `minor-consent-gate` component note) and `GET /me` reports the pending status

3. **Given** a parent clicks the consent link from the email **Then** the account's consent is recorded and marked granted, and the next time the learner is on the waiting screen (or logs in), the block is lifted and normal flow proceeds — "normal onboarding proceeds" per the epic's own text lands on the same placeholder destination Story 1.1's verify-email uses, since Story 1.3 (Onboarding Wizard) doesn't exist yet

4. **Given** a user whose declared birthdate indicates 18 or older **Then** no parental consent is required and they proceed immediately — no minor-flow state is ever shown to them

## Tasks / Subtasks

- [x] **Task 1: Extend the `users` schema + new `parental_consent_tokens` table** (AC: #1, #2, #3, #4)
  - [x] Add to `services/core/src/db/schema.ts`'s `users` table: `birthdate` (Drizzle's `date()` column, default string mode — verified live that `date()` with no config returns a string-typed column, matching the `"YYYY-MM-DD"` wire format end to end with no `Date`-object conversion layer; nullable, null means "not yet declared"), `parentEmail` (text, nullable — only ever set for minors), `parentConsentedAt` (timestamptz, nullable — null means pending/not-applicable)
  - [x] New table `parentalConsentTokens`, structurally identical to Story 1.1's `emailVerificationTokens` (id uuidv7 default, `userId` FK, `tokenHash` unique, `expiresAt`, `usedAt`, `createdAt`) — same hygiene: only the SHA-256 hash of the raw token is ever persisted, reuse `tokens.ts`'s existing `generateRawToken`/`hashToken` rather than duplicating them
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 2: Age computation utility** (AC: #1, #4)
  - [x] A pure, unit-tested `calculateAge(birthdate: Date, now: Date): number` in a new `services/core/src/modules/auth/age.ts` (or `users` module — this is squarely a `User` concern, so `modules/users/` is the better home; `age.ts` there) — exact year/month/day arithmetic, **not** a naive `now.year - birthdate.year` (that's off by one for anyone whose birthday hasn't occurred yet this calendar year — a classic, easy-to-miss bug; test it explicitly with a birthdate of "yesterday, N years + 1 day ago" vs "yesterday, exactly N years ago" vs "tomorrow, N+1 years ago")
  - [x] Reject a birthdate that is in the future or implausibly old (e.g. >120 years) at the validation layer (Task 4) — a basic sanity bound, not a business rule requiring a decision

- [x] **Task 3: `services/core`'s `users` module — age declaration + `/me` extension** (AC: #1, #2, #4)
  - [x] `POST /users/age-declaration` `{ birthdate, parentEmail? }` — **authenticated** (reads the same trusted `x-user-id` header `/me` already reads; gated through the internal-secret + gateway JWT chain Story 1.1 built, no new auth mechanism). Rejects if the user has already declared (`birthdate` already set) with a specific `error.code` (e.g. `AGE_ALREADY_DECLARED`) — this is a one-time declaration, not an editable profile field in this story's scope
  - [x] If computed age ≥ 18: set `birthdate`, leave `parentEmail`/`parentConsentedAt` null, return `{ isMinor: false, parentalConsentStatus: "not_required" }` — no email sent, no token created
  - [x] If computed age < 18: require `parentEmail` in the same request (reject with `VALIDATION_ERROR` if absent — the client should only ever omit it for the adult path); set `birthdate` + `parentEmail`, generate a consent token exactly like Story 1.1's verification token (24h expiry, matching precedent — no NFR specifies a different window), send it via `notificationPort.sendEmail(...)` to `parentEmail` (never to the learner's own email), return `{ isMinor: true, parentalConsentStatus: "pending" }`
  - [x] `GET /me`'s response gains `birthdate: string | null`, `isMinor: boolean | null` (null until declared), `parentalConsentStatus: "not_required" | "pending" | "granted" | null` (null until declared) — extend `meResponseSchema` in `packages/shared-types` (genuine cross-service contract, same reasoning Story 1.1 used for adding it there) rather than a story-local shape
  - [x] `POST /users/parental-consent` `{ token }` — **unauthenticated by design**, same public-link pattern as Story 1.1's `/auth/verify-email` (the parent has no account/session). Hash the incoming token, look up, reject if not found/expired/already-used with `INVALID_CONSENT_TOKEN`; in one transaction, mark the token `usedAt` and the user's `parentConsentedAt = now()`. Returns a simple `{ success: true }` — no session is issued (the parent isn't the account holder, unlike Story 1.1's verify-email which logs the *learner* in)

- [x] **Task 4: `services/gateway` — proxy the two new routes** (AC: #1, #2, #3)
  - [x] `POST /users/age-declaration` → authenticated (apply the same `requireAuth` `preHandler` + trusted-header forwarding `/me` already uses — extend `authProxy.ts`'s route list, don't invent a second protected-route pattern)
  - [x] `POST /users/parental-consent` → unauthenticated, forwarded as-is (add to the existing `AUTH_PATHS`-style pass-through list, or a small sibling list — it's pre-authentication by definition, same reasoning as `/auth/*`)
  - [x] Validation (email format for `parentEmail`, birthdate format/bounds) happens at `core`'s route layer via zod, same `parseOrThrow` pattern as every other endpoint — gateway stays a thin proxy, no business logic duplicated there

- [x] **Task 5: `apps/web` — age declaration form + waiting screen** (AC: #1, #2, #3, #4)
  - [x] New route `/age-declaration` (protected — if there's no session, `useAuth`'s `session` is null; redirect to `/login` rather than rendering a form with nothing to submit against). Radix `Form`-based birthdate input (`type="date"`) + conditional `parentEmail` field that appears once the entered birthdate computes to under 18 **client-side** (mirror the server's exact age math — do not let client and server drift on the age-boundary calculation; extract the same day/month/year-aware logic, don't naively parse only the year)
  - [x] After login/verify-email succeeds (Story 1.1's `LoginPage`/`VerifyEmailPage` both currently `navigate("/")`), check `/me`'s new fields: if `birthdate` is null, navigate to `/age-declaration` instead of `/`; if `isMinor && parentalConsentStatus === "pending"`, navigate to a `/waiting-for-consent` page instead — this requires calling `api.me()` (built in Story 1.1, never wired to any UI path until now — this is the first real consumer)
  - [x] `/waiting-for-consent` page: calm, informational tone per `DESIGN.md`'s `minor-consent-gate` component (primary accent, full surface background, **no** `usavvy-banner-error`/warning styling — this is a normal expected state, not a problem) — add a `usavvy-banner-info` (or reuse `usavvy-banner-success`'s calm styling; do not reuse the error banner class for this)
  - [x] Age-declaration form submit → on `{ isMinor: false }` response, navigate to `/` (same placeholder-for-onboarding destination as Story 1.1); on `{ isMinor: true, parentalConsentStatus: "pending" }`, navigate to `/waiting-for-consent`
  - [x] No new page needed for the parent's consent-click landing — the parent clicks a link with a `token`, which should go to a **new, separate** `/parental-consent` frontend route (distinct from the learner's `/verify-email`) that calls `POST /users/parental-consent` and shows a simple success/expired/already-used result, same three-state pattern as `VerifyEmailPage` (success/error UI, not session-related since the parent never gets a session)

- [x] **Task 6: Tests mirroring `src/` 1:1** (AD-8, extending Story 1.1's now-established pattern)
  - [x] `services/core/tests/modules/users/age.test.ts` — `calculateAge`'s exact-boundary cases (day-before/day-of/day-after an 18th birthday), future-birthdate rejection, implausibly-old rejection
  - [x] `services/core/tests/modules/users/*.test.ts` — age-declaration adult path, minor path (email sent, token created), already-declared rejection, missing-`parentEmail`-for-a-minor rejection; parental-consent success/expired/already-used/unknown-token; `/me`'s new fields in all three states (not-declared/pending/granted)
  - [x] `services/gateway/tests/*.test.ts` — new proxy routes: age-declaration requires auth (401 with no token), parental-consent reachable with no token
  - [x] `apps/web/tests/modules/auth/*.test.tsx` (or a new `users` module test dir, matching wherever Task 5's components land) — age-declaration form's adult/minor branches, waiting-for-consent page, parental-consent landing page's three states, and the post-login/verify redirect logic now consuming `/me`

### Review Findings (2026-08-05)

- [x] [Review][Patch] No guard against a minor supplying their own email as "parent's email," bypassing consent entirely [`services/core/src/modules/users/service.ts:98`]
- [x] [Review][Patch] `declareAge`'s already-declared check is not atomic — concurrent requests can both pass it before either writes, creating duplicate consent tokens/emails [`services/core/src/modules/users/service.ts:80-103`]
- [x] [Review][Patch] Unhandled promise rejection in Google sign-in success handlers — a `getMe()` failure after Google auth leaves the user stuck with no error and no navigation [`apps/web/src/modules/auth/LoginPage.tsx:68`, `apps/web/src/modules/auth/SignUpPage.tsx:75`]
- [x] [Review][Patch] `resolvePostAuthDestination` fails open (routes home) for a minor whose `parentalConsentStatus` is anything other than exactly `"pending"`, instead of failing closed [`apps/web/src/modules/users/postAuthRedirect.ts`]
- [x] [Review][Patch] Missing test coverage for the `MAX_AGE_YEARS` (120-year) birthdate-rejection boundary, despite Task 2 explicitly requiring it [`services/core/tests/modules/users/routes.test.ts`]
- [x] [Review][Patch] Missing HTTP-level test confirming `AGE_ALREADY_DECLARED` maps to a 409 through the real route [`services/core/tests/modules/users/routes.test.ts`]
- [x] [Review][Patch] `SignUpPage`'s Google-branch post-auth redirect (`getMe` + `navigate`) has zero test coverage [`apps/web/tests/modules/auth/SignUpPage.test.tsx`]
- [x] [Review][Defer] Parental-consent/verification email bodies are relative URLs with no scheme/host, unclickable in a real email client [`services/core/src/modules/users/service.ts:117`, `services/core/src/modules/auth/service.ts:89`] — deferred, pre-existing
- [x] [Review][Defer] `version` optimistic-concurrency column is bumped unconditionally with no compare-and-swap WHERE clause [`services/core/src/modules/users/service.ts` — `bumpVersion()` call sites] — deferred, pre-existing
- [x] [Review][Defer] No self-service "resend consent email" path if the 24h token expires or the email never arrives [`services/core/src/modules/users/service.ts:70-121`] — deferred, pre-existing
- [x] [Review][Defer] `declareAge`'s minor-path DB writes and the consent email send are not wrapped together, so a crash/failure mid-flow can't be cleanly retried [`services/core/src/modules/users/service.ts:100-118`] — deferred, pre-existing
- [x] [Review][Defer] Age-boundary "today" is computed via UTC, so a user in IST near midnight can be classified a day off from their local calendar date [`services/core/src/modules/users/service.ts:17-19`, `apps/web/src/modules/users/AgeDeclarationPage.tsx:13-15`] — deferred, pre-existing
- [x] [Review][Defer] No DB-level CHECK constraints enforcing new invariants (e.g. `parentConsentedAt` implies `parentEmail` is set) [`services/core/src/db/schema.ts`] — deferred, pre-existing
- [x] [Review][Defer] No audit trail beyond a timestamp for parental consent (no IP/user-agent capture) [`services/core/src/modules/users/service.ts:128-146`] — deferred, pre-existing
- [x] [Review][Defer] `ParentalConsentPage`/`VerifyEmailPage` both auto-fire on page load with no explicit "click to confirm" step [`apps/web/src/modules/users/ParentalConsentPage.tsx`] — deferred, pre-existing
- [x] [Review][Defer] Client and server each hand-duplicate `calculateAge` with nothing but a code comment enforcing they stay in sync [`apps/web/src/modules/users/age.ts`, `services/core/src/modules/users/age.ts`] — deferred, pre-existing
- [x] [Review][Defer] `calculateAge`/`parseIsoDate` produce `NaN` rather than throwing on a malformed date string [`services/core/src/modules/users/age.ts`, `apps/web/src/modules/users/age.ts`] — deferred, pre-existing
- [x] [Review][Defer] `POST /users/parental-consent`'s `token` field has no maximum length [`services/core/src/modules/users/routes.ts:35`] — deferred, pre-existing
- [x] [Review][Defer] `/waiting-for-consent` has no session/state guard, unlike `/age-declaration`'s explicit redirect [`apps/web/src/modules/users/WaitingForConsentPage.tsx`] — deferred, pre-existing

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** the new columns and `parentalConsentTokens` table belong to `core` (owns `User`) — same database, no new service.
- **AD-1 (ports):** reuse the existing `NotificationPort`/mock adapter unchanged — this story adds no new port, just a second kind of email through the same one (parental consent, alongside Story 1.1's verification email).
- **AD-7 (RBAC):** no new role/permission is introduced. `/users/age-declaration` is gated purely by "is this a valid authenticated session" (the existing JWT+trusted-header chain) — every role (there's only `student` at signup) may declare their own age. Don't add a `can()` matrix entry for this; it's not a role-based authorization decision.
- **AD-17 (no silent failures):** every new failure path (already-declared, missing `parentEmail` for a minor, invalid/expired/used consent token, out-of-bounds birthdate) resolves to a specific `error.code` via the same central error-mapper, exactly like every Story 1.1 failure path.
- **AD-8 (test mirroring):** see Task 6.
- **Consistency Conventions:** `birthdate`/`parentEmail`/`parentConsentedAt` are new mutable fields on `users` — writing them must bump `version` (Story 1.1's code-review fix established this convention; don't regress it by adding a write path that forgets to).

### Previous story intelligence (Story 1.1 — read before starting, don't rediscover these)

- **Reuse, don't reinvent:** `generateRawToken`/`hashToken` (`services/core/src/modules/auth/tokens.ts`), the `AppError`/`registerErrorHandler` central error-mapper (`@usavvy/service-kernel`), `parseOrThrow` (`services/core/src/modules/auth/validation.ts`), the `x-internal-secret` trust-boundary check (already applied globally to every non-`/health` route in `core`'s `app.ts` — the two new routes need **no new wiring** for this, it's automatic), and `withTimeout` (`@usavvy/service-kernel`) if any new external call needs one (none expected here — no external network calls in this story beyond the existing mock notification adapter).
- **The internal-secret guard is already global** (`app.addHook("preHandler", ...)` in `services/core/src/app.ts`) — the new routes automatically require it, same as every route added since. Don't add a second check.
- **`GET /me` already exists and already reads trusted headers** (`services/core/src/modules/users/`) — this story *extends* its response shape and the module that owns it; it does not duplicate the auth-resolution logic.
- **Test tokens:** `services/core/tests/testHelpers.ts` exports `TEST_INTERNAL_SECRET` — every `app.inject(...)` call in this story's new backend tests needs `headers: { "x-internal-secret": TEST_INTERNAL_SECRET }` (age-declaration also needs `x-user-id`/`x-user-role`, like `/me`'s own tests).
- **Email normalization applies to `parentEmail` too** — Story 1.1's code review added `normalizeEmail()` (trim+lowercase) for the user's own email; apply the same function to `parentEmail` for consistency (same zod `emailField` pattern from `services/core/src/modules/auth/routes.ts` — export and reuse it rather than redefining a second trim+lowercase+email zod chain).
- **`api.me()` (apps/web) was built in Story 1.1 but had zero UI consumers** — flagged as a defer in Story 1.1's own review ("no current UI path calls a protected endpoint after initial auth"). This story is that consumer — wire it into the post-login/verify redirect logic rather than adding a second way to fetch the current user.
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass.

### API response shapes

| Route | Success shape |
| --- | --- |
| `POST /users/age-declaration` | `200 { isMinor: boolean, parentalConsentStatus: "not_required" \| "pending" }` |
| `POST /users/parental-consent` | `200 { success: true }` |
| `GET /me` (extended) | `200 { id, email, emailVerified, role, birthdate: string \| null, isMinor: boolean \| null, parentalConsentStatus: "not_required" \| "pending" \| "granted" \| null }` |
| any failure | `{ error: { code, message, details? } }` — `400` validation (bad birthdate, missing `parentEmail`), `401` unauthenticated, `404` unknown consent token, `409` `AGE_ALREADY_DECLARED` |

### Validation rules

- **Birthdate:** transport as a `"YYYY-MM-DD"` date-only string; validate server-side with zod's `z.iso.date()` (verified live in this exact zod version — a plain `z.string()` plus manual `Date` parsing would accept ambiguous/datetime strings this shouldn't). Must not be in the future, must not be more than 120 years in the past (`.refine(...)` on top of `z.iso.date()`). No minimum-age floor beyond the existing under-18 rule — NFR-16/the India DPDP Act's "child" threshold is 18, already fully covered by the minor flow; don't invent an additional COPPA-style 13-year floor this product's own NFRs don't ask for.
- **`parentEmail`:** same `z.string().trim().toLowerCase().pipe(z.email())` pattern as the learner's own email (export `emailField` from `services/core/src/modules/auth/routes.ts` and import it, or lift it to a shared location if that import direction feels backwards — `users` importing from `auth` is fine given both are `core`-internal modules reachable via their `index.ts` barrels, AD-13's rule is about *services*, not modules within one service).

### Project Structure Notes

```text
services/core/
  src/
    db/
      schema.ts                              # updated — users gains 3 columns, new parentalConsentTokens table
    modules/
      users/
        age.ts                               # new — calculateAge
        service.ts                            # updated — declareAge, recordParentalConsent, getMe extended
        routes.ts                             # updated — POST /users/age-declaration, POST /users/parental-consent
  tests/
    modules/users/age.test.ts                # new
    modules/users/service.test.ts            # updated
    modules/users/routes.test.ts             # updated

services/gateway/
  src/
    authProxy.ts                              # updated — two new routes (one authenticated, one not)
  tests/
    authProxy.test.ts                        # updated

packages/shared-types/
  src/auth.ts                                 # updated — meResponseSchema gains birthdate/isMinor/parentalConsentStatus

apps/web/
  src/
    modules/
      users/                                  # new — this story's first real content in the users module shell
        AgeDeclarationPage.tsx
        WaitingForConsentPage.tsx
        ParentalConsentPage.tsx
        age.ts                                # client-side mirror of calculateAge — keep the two in sync deliberately
    app/
      App.tsx                                 # updated — new routes; post-auth redirect logic consults /me
  tests/
    modules/users/*.test.tsx                  # new
```

### Testing requirements

- All age-boundary tests use fixed, explicit dates (e.g. construct "exactly 18 years ago today" from a real captured `now`) — never rely on the test run's wall-clock date for the *expected* result, only for computing the fixture's relative birthdate, so the test is deterministic regardless of when it runs.
- `services/core/tests/modules/users/service.test.ts`'s age-declaration tests are integration-style against the real Postgres container, matching Story 1.1's own precedent (`db.transaction`, unique constraints, etc. are real DB behavior, not mockable value).
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.2, Epic 1 intro, FR-A-2]
- [Source: `Doc/00-Requirement.md` — FR-A-2, NFR-16, R-8 (risk register: "Minors using the platform without consent controls")]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — `minor-consent-gate` component token, "Minor/Parental-Consent Gate" Do's/Don'ts note]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Information Architecture surface map ("Age declaration + parental-consent flow (minors)", reached from Sign-up before onboarding)]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-1, AD-7, AD-8, AD-14, AD-17, Consistency Conventions]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-1-sign-up-log-in-with-email-verification.md` — established token/config/error-mapper/trust-boundary/test conventions this story builds directly on, including its own code-review fixes (email normalization, `version` bump, internal-secret guard) that now apply automatically to this story's new routes]

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-5) — `birthdate`/`parentEmail`/`parentConsentedAt` on `users`, new `parentalConsentTokens` table, `calculateAge` (server + a deliberately-duplicated client mirror), `POST /users/age-declaration` (authenticated, adult/minor branches) and `POST /users/parental-consent` (unauthenticated — the parent has no account), `/me` extended with derived `isMinor`/`parentalConsentStatus`. Gateway proxies both routes. Frontend: `AgeDeclarationPage` (protected, conditional parent-email field), `WaitingForConsentPage`, `ParentalConsentPage` (StrictMode-safe dedup, mirrors `VerifyEmailPage`'s pattern), and a `resolvePostAuthDestination` resolver wired into login/signup/verify-email. Fixed a real state-timing bug found via test failures: `getMe()` was reading `session` from `useAuth`'s context immediately after `login`/`verifyEmail`/`googleAuth` resolved, racing `setSession`'s async update and reading a stale closure — those three functions now return the `Session` directly instead of `void`. 215 tests green across the monorepo (up from 157), `tsc --noEmit`/`eslint .` clean.
- 2026-08-05: Task 6 — full regression suite run clean, migration applied to the live Postgres container, and both the adult and minor+parental-consent flows confirmed end-to-end against the real running stack: via `curl` (signup → verify → declare age → `/me` reflects the new fields → for the minor path, unauthenticated consent grant → token-reuse correctly rejected → `/me` flips to `granted`) and via a real browser (signup → verify-email → redirected to `/age-declaration` → parent-email field appears live once the entered birthdate computes to a minor → submit → redirected to `/waiting-for-consent` → parent's consent link renders `ParentalConsentPage`'s success state). Status → `review`.
- 2026-08-05: Adversarial code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) run against the diff since `baseline_commit`. Acceptance Auditor confirmed full compliance with all 4 ACs and every Dev Notes constraint. 7 patch, 12 defer, 2 dismissed as false positives (a non-bug leap-year convention, and a claimed-missing test file that already exists from Story 1.1). All 7 patches applied: a self-consent bypass closed (a minor could supply their own email as "parent's" and grant their own consent), `declareAge`'s one-time-declaration check made atomic via a compare-and-swap `UPDATE ... WHERE birthdate IS NULL` (closing a real TOCTOU race where two concurrent requests could both pass the check and create duplicate consent tokens/emails), unhandled-promise-rejection fixes in both Google sign-in success handlers (a failed `/me` call after Google auth no longer silently strands the user), `resolvePostAuthDestination` changed to fail closed for any non-`"granted"` minor-consent state instead of only gating the one expected `"pending"` value, plus three missing test cases (the 120-year birthdate boundary, an HTTP-level `AGE_ALREADY_DECLARED` 409, and the previously-uncovered `SignUpPage` Google-branch redirect). Both the self-consent rejection and the concurrency fix were reverified live against the running stack (curl, including firing two genuinely concurrent requests at the same account and confirming exactly one succeeded), not just unit-tested. 12 deferred items logged to `deferred-work.md` (mostly patterns matching Story 1.1's own already-accepted conventions — decorative version-bump, un-transacted email-send, relative-URL email links, no resend path — plus a few product/compliance decisions like consent audit trails that need a follow-up story, not a patch). 87 tests green in `services/core` (up from 82), 62 in `apps/web` (up from 60), `tsc --noEmit`/`eslint .` clean across the monorepo. Status → `done`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1-4 (backend):** `deriveAgeFields()` computes `isMinor`/`parentalConsentStatus` dynamically from `birthdate` on every `getMe()` call rather than persisting a snapshot — deliberate: a former minor who ages out shouldn't need stale consent tracking cleared. `recordParentalConsent` runs in a `db.transaction()` with a `.for("update")` row lock on the token row (same pattern as Story 1.1's `verifyEmail`) since it's the one write path with no session/auth to serialize against. Exported `emailField` (auth/routes.ts) and `normalizeEmail` (auth/service.ts) for reuse on `parentEmail` rather than redefining the trim+lowercase+email zod chain.
- **Task 5 (frontend):** Avoided a real circular import between `modules/auth` and `modules/users` — `useAuth`/`resolvePostAuthDestination` are the only two cross-module symbols consumed, so `LoginPage`/`SignUpPage`/`VerifyEmailPage` import `resolvePostAuthDestination` directly from `../users/postAuthRedirect.js` (bypassing the `users/index.js` barrel) while `AgeDeclarationPage` imports `useAuth` from the `auth/index.js` barrel — a one-directional barrel dependency, not a cycle. `apps/web/src/modules/users/age.ts` duplicates the server's `calculateAge` byte-for-byte per the story's own instruction to keep the two in sync deliberately, so the conditional parent-email field never drifts from what the server will actually decide.
- **Real bug found via test failures (not manual testing this time):** `getMe()` reading `session` from `useAuth`'s context immediately after `login`/`verifyEmail`/`googleAuth` resolved read a stale pre-update closure, since `setSession` is asynchronous. Fixed by having those three functions return the `Session` object directly and `getMe` accept an explicit `accessToken` parameter instead of reading from context state — required updating `GoogleSignInButton`'s prop signature and all three consuming pages.
- **Task 6 (full regression + live verification):** 215 tests green across the monorepo (config 14, shared-types 19, service-kernel 12, apps/web 60, gateway 28, core 82), `tsc --noEmit`/`eslint .` clean in every workspace. Applied the new migration to the live Postgres container and re-verified both the adult and minor+parental-consent paths end-to-end via `curl` against the running gateway/core, then again in a real browser (signup → verify-email → `/age-declaration` with the parent-email field appearing live for a minor birthdate → `/waiting-for-consent` → the parent's `/parental-consent` link landing on `ParentalConsentPage`'s success state) — confirmed the token-reuse rejection (`INVALID_CONSENT_TOKEN`) and `/me`'s three-state transition (`not_required`/`pending`/`granted`) live, not just unit-tested. All smoke-test rows cleaned up from Postgres afterward.
- **Code review patch round:** the most significant fix closed a genuine consent-bypass — nothing stopped a minor from declaring their own account email as "parent's email" and self-approving. The second most significant made `declareAge`'s one-time-declaration guarantee actually atomic: it previously read-then-checked-then-wrote with no WHERE-clause tie-back, so two concurrent requests for the same account could both pass the already-declared check; fixed by moving the check into the UPDATE's WHERE clause (`isNull(users.birthdate)`) and checking the returned row count, the same compare-and-swap shape as a version-checked write. Verified live, not just unit-tested: fired two genuinely concurrent `POST /users/age-declaration` requests at the same account via `curl` backgrounding and confirmed exactly one succeeded. Also fixed two unhandled-promise-rejection bugs (Google sign-in's post-auth `getMe`/navigate chain had no `.catch` in either `LoginPage` or `SignUpPage`) and a fail-open branch in `resolvePostAuthDestination`. Filled three test gaps the reviewers caught: Task 2's own required 120-year-boundary test was missing, `AGE_ALREADY_DECLARED` was only tested at the service layer (not through the real HTTP route), and `SignUpPage`'s Google-branch redirect had zero coverage despite being new behavior in this story. 12 findings deferred (logged to `deferred-work.md`) — most turned out to match patterns Story 1.1 itself already established and shipped as `done` (decorative version-bump, un-transacted email-send-after-write, relative-URL email bodies with no real email provider wired yet), so fixing them here would mean redesigning a cross-cutting convention rather than patching this story's own code; a few others (consent audit trail, resend-email self-service) are product decisions needing a new AC, not a code fix. 2 findings dismissed as false positives after verification (a claimed leap-year bug that the existing month/day comparison already handles by ordinary calendar convention, and a claimed-missing `GoogleSignInButton.test.tsx` that in fact already exists from Story 1.1's own patch round). 87 tests green in `services/core` (up from 82), 62 in `apps/web` (up from 60), `tsc --noEmit`/`eslint .` clean.

### File List

**Task 1 (schema + migration):**
- `services/core/src/db/schema.ts` (updated — `users` gains `birthdate`/`parentEmail`/`parentConsentedAt`; new `parentalConsentTokens` table)
- `services/core/drizzle/0001_messy_legion.sql` (new — generated migration)
- `services/core/drizzle/meta/0001_snapshot.json` (new), `services/core/drizzle/meta/_journal.json` (updated)

**Task 2 (age utility):**
- `services/core/src/modules/users/age.ts` (new — `calculateAge`)
- `services/core/tests/modules/users/age.test.ts` (new)

**Task 3 (core users module):**
- `services/core/src/modules/users/service.ts` (rewritten — `getMe` extended, `declareAge`, `recordParentalConsent`)
- `services/core/src/modules/users/routes.ts` (rewritten — `POST /users/age-declaration`, `POST /users/parental-consent`)
- `services/core/src/modules/auth/routes.ts` (updated — `emailField` exported), `services/core/src/modules/auth/service.ts` (updated — `normalizeEmail` exported), `services/core/src/modules/auth/index.ts` (updated — re-exports both)
- `services/core/src/app.ts` (updated — wires `notificationPort` into `registerUsersRoutes`)
- `packages/shared-types/src/auth.ts` (updated — `parentalConsentStatusSchema`, `meResponseSchema` extended, `ageDeclarationResponseSchema`, `parentalConsentResponseSchema`), `packages/shared-types/src/index.ts` (updated), `packages/shared-types/tests/auth.test.ts` (updated)
- `services/core/tests/modules/users/service.test.ts`, `services/core/tests/modules/users/routes.test.ts` (rewritten)

**Task 4 (gateway proxy):**
- `services/gateway/src/authProxy.ts` (updated — `AUTH_PATHS` renamed `PUBLIC_PROXY_PATHS` + `/users/parental-consent` added, new authenticated `POST /users/age-declaration` route)
- `services/gateway/tests/authProxy.test.ts` (updated)

**Task 5 (apps/web):**
- `apps/web/src/shared/apiClient.ts` (new — `ApiError`/`apiRequest` extracted from `auth/api.ts` for shared reuse)
- `apps/web/src/modules/auth/api.ts` (updated — uses the shared client), `apps/web/src/modules/auth/useAuth.tsx` (rewritten — `login`/`verifyEmail`/`googleAuth` return `Session` directly, `getMe` takes an explicit `accessToken`; fixes the stale-context-read bug), `apps/web/src/modules/auth/index.ts` (updated — exports `Session`)
- `apps/web/src/modules/auth/GoogleSignInButton.tsx`, `LoginPage.tsx`, `SignUpPage.tsx`, `VerifyEmailPage.tsx` (updated — consume the returned `Session` and resolve the post-auth destination via `/me`)
- `apps/web/src/modules/users/api.ts` (new — `createUsersApi`), `age.ts` (new — client mirror of `calculateAge`), `postAuthRedirect.ts` (new — `resolvePostAuthDestination`), `AgeDeclarationPage.tsx`, `WaitingForConsentPage.tsx`, `ParentalConsentPage.tsx` (new), `index.ts` (new — barrel)
- `apps/web/src/shared/tokens.css` (updated — `--color-primary-container`/`--color-on-primary-container`), `apps/web/src/shared/components.css` (updated — `.usavvy-banner-info`)
- `apps/web/src/app/App.tsx` (updated — `/age-declaration`, `/waiting-for-consent`, `/parental-consent` routes)
- `apps/web/tests/modules/auth/api.test.ts`, `LoginPage.test.tsx`, `VerifyEmailPage.test.tsx` (updated)
- `apps/web/tests/modules/users/age.test.ts`, `api.test.ts`, `postAuthRedirect.test.ts`, `AgeDeclarationPage.test.tsx`, `WaitingForConsentPage.test.tsx`, `ParentalConsentPage.test.tsx` (new)

**Task 6 (sprint tracking):**
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (updated — Story 1.2 → `review`, later → `done`)

**Code review patch round (2026-08-05):**
- `services/core/src/modules/users/service.ts` (updated — `declareAge`'s already-declared check made atomic via `UPDATE ... WHERE isNull(birthdate)` + `.returning()` row-count check on both branches; self-consent guard rejecting a `parentEmail` matching the declaring user's own account email)
- `services/core/tests/modules/users/service.test.ts` (updated — self-consent rejection test, concurrent-declaration race test)
- `services/core/tests/modules/users/routes.test.ts` (updated — 120-year max-age boundary test, HTTP-level `AGE_ALREADY_DECLARED` 409 test, HTTP-level self-consent rejection test)
- `apps/web/src/modules/users/postAuthRedirect.ts` (updated — fails closed on any non-`"granted"` minor-consent status)
- `apps/web/src/modules/auth/LoginPage.tsx`, `SignUpPage.tsx` (updated — `.catch()` on the Google sign-in success handler's `getMe`/navigate chain, surfacing a server error instead of an unhandled rejection)
- `apps/web/tests/modules/auth/SignUpPage.test.tsx` (updated — Google-branch success/failure redirect coverage, mocking `@react-oauth/google`)
- `_AI-Agile-Development/implementation-artifacts/deferred-work.md` (updated — 12 items deferred from this review)
