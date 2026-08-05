---
baseline_commit: 46548f4
---

# Story 1.2: Age Declaration & Minor Consent

Status: ready-for-dev

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

- [ ] **Task 1: Extend the `users` schema + new `parental_consent_tokens` table** (AC: #1, #2, #3, #4)
  - [ ] Add to `services/core/src/db/schema.ts`'s `users` table: `birthdate` (Drizzle's `date()` column, default string mode — verified live that `date()` with no config returns a string-typed column, matching the `"YYYY-MM-DD"` wire format end to end with no `Date`-object conversion layer; nullable, null means "not yet declared"), `parentEmail` (text, nullable — only ever set for minors), `parentConsentedAt` (timestamptz, nullable — null means pending/not-applicable)
  - [ ] New table `parentalConsentTokens`, structurally identical to Story 1.1's `emailVerificationTokens` (id uuidv7 default, `userId` FK, `tokenHash` unique, `expiresAt`, `usedAt`, `createdAt`) — same hygiene: only the SHA-256 hash of the raw token is ever persisted, reuse `tokens.ts`'s existing `generateRawToken`/`hashToken` rather than duplicating them
  - [ ] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [ ] **Task 2: Age computation utility** (AC: #1, #4)
  - [ ] A pure, unit-tested `calculateAge(birthdate: Date, now: Date): number` in a new `services/core/src/modules/auth/age.ts` (or `users` module — this is squarely a `User` concern, so `modules/users/` is the better home; `age.ts` there) — exact year/month/day arithmetic, **not** a naive `now.year - birthdate.year` (that's off by one for anyone whose birthday hasn't occurred yet this calendar year — a classic, easy-to-miss bug; test it explicitly with a birthdate of "yesterday, N years + 1 day ago" vs "yesterday, exactly N years ago" vs "tomorrow, N+1 years ago")
  - [ ] Reject a birthdate that is in the future or implausibly old (e.g. >120 years) at the validation layer (Task 4) — a basic sanity bound, not a business rule requiring a decision

- [ ] **Task 3: `services/core`'s `users` module — age declaration + `/me` extension** (AC: #1, #2, #4)
  - [ ] `POST /users/age-declaration` `{ birthdate, parentEmail? }` — **authenticated** (reads the same trusted `x-user-id` header `/me` already reads; gated through the internal-secret + gateway JWT chain Story 1.1 built, no new auth mechanism). Rejects if the user has already declared (`birthdate` already set) with a specific `error.code` (e.g. `AGE_ALREADY_DECLARED`) — this is a one-time declaration, not an editable profile field in this story's scope
  - [ ] If computed age ≥ 18: set `birthdate`, leave `parentEmail`/`parentConsentedAt` null, return `{ isMinor: false, parentalConsentStatus: "not_required" }` — no email sent, no token created
  - [ ] If computed age < 18: require `parentEmail` in the same request (reject with `VALIDATION_ERROR` if absent — the client should only ever omit it for the adult path); set `birthdate` + `parentEmail`, generate a consent token exactly like Story 1.1's verification token (24h expiry, matching precedent — no NFR specifies a different window), send it via `notificationPort.sendEmail(...)` to `parentEmail` (never to the learner's own email), return `{ isMinor: true, parentalConsentStatus: "pending" }`
  - [ ] `GET /me`'s response gains `birthdate: string | null`, `isMinor: boolean | null` (null until declared), `parentalConsentStatus: "not_required" | "pending" | "granted" | null` (null until declared) — extend `meResponseSchema` in `packages/shared-types` (genuine cross-service contract, same reasoning Story 1.1 used for adding it there) rather than a story-local shape
  - [ ] `POST /users/parental-consent` `{ token }` — **unauthenticated by design**, same public-link pattern as Story 1.1's `/auth/verify-email` (the parent has no account/session). Hash the incoming token, look up, reject if not found/expired/already-used with `INVALID_CONSENT_TOKEN`; in one transaction, mark the token `usedAt` and the user's `parentConsentedAt = now()`. Returns a simple `{ success: true }` — no session is issued (the parent isn't the account holder, unlike Story 1.1's verify-email which logs the *learner* in)

- [ ] **Task 4: `services/gateway` — proxy the two new routes** (AC: #1, #2, #3)
  - [ ] `POST /users/age-declaration` → authenticated (apply the same `requireAuth` `preHandler` + trusted-header forwarding `/me` already uses — extend `authProxy.ts`'s route list, don't invent a second protected-route pattern)
  - [ ] `POST /users/parental-consent` → unauthenticated, forwarded as-is (add to the existing `AUTH_PATHS`-style pass-through list, or a small sibling list — it's pre-authentication by definition, same reasoning as `/auth/*`)
  - [ ] Validation (email format for `parentEmail`, birthdate format/bounds) happens at `core`'s route layer via zod, same `parseOrThrow` pattern as every other endpoint — gateway stays a thin proxy, no business logic duplicated there

- [ ] **Task 5: `apps/web` — age declaration form + waiting screen** (AC: #1, #2, #3, #4)
  - [ ] New route `/age-declaration` (protected — if there's no session, `useAuth`'s `session` is null; redirect to `/login` rather than rendering a form with nothing to submit against). Radix `Form`-based birthdate input (`type="date"`) + conditional `parentEmail` field that appears once the entered birthdate computes to under 18 **client-side** (mirror the server's exact age math — do not let client and server drift on the age-boundary calculation; extract the same day/month/year-aware logic, don't naively parse only the year)
  - [ ] After login/verify-email succeeds (Story 1.1's `LoginPage`/`VerifyEmailPage` both currently `navigate("/")`), check `/me`'s new fields: if `birthdate` is null, navigate to `/age-declaration` instead of `/`; if `isMinor && parentalConsentStatus === "pending"`, navigate to a `/waiting-for-consent` page instead — this requires calling `api.me()` (built in Story 1.1, never wired to any UI path until now — this is the first real consumer)
  - [ ] `/waiting-for-consent` page: calm, informational tone per `DESIGN.md`'s `minor-consent-gate` component (primary accent, full surface background, **no** `usavvy-banner-error`/warning styling — this is a normal expected state, not a problem) — add a `usavvy-banner-info` (or reuse `usavvy-banner-success`'s calm styling; do not reuse the error banner class for this)
  - [ ] Age-declaration form submit → on `{ isMinor: false }` response, navigate to `/` (same placeholder-for-onboarding destination as Story 1.1); on `{ isMinor: true, parentalConsentStatus: "pending" }`, navigate to `/waiting-for-consent`
  - [ ] No new page needed for the parent's consent-click landing — the parent clicks a link with a `token`, which should go to a **new, separate** `/parental-consent` frontend route (distinct from the learner's `/verify-email`) that calls `POST /users/parental-consent` and shows a simple success/expired/already-used result, same three-state pattern as `VerifyEmailPage` (success/error UI, not session-related since the parent never gets a session)

- [ ] **Task 6: Tests mirroring `src/` 1:1** (AD-8, extending Story 1.1's now-established pattern)
  - [ ] `services/core/tests/modules/users/age.test.ts` — `calculateAge`'s exact-boundary cases (day-before/day-of/day-after an 18th birthday), future-birthdate rejection, implausibly-old rejection
  - [ ] `services/core/tests/modules/users/*.test.ts` — age-declaration adult path, minor path (email sent, token created), already-declared rejection, missing-`parentEmail`-for-a-minor rejection; parental-consent success/expired/already-used/unknown-token; `/me`'s new fields in all three states (not-declared/pending/granted)
  - [ ] `services/gateway/tests/*.test.ts` — new proxy routes: age-declaration requires auth (401 with no token), parental-consent reachable with no token
  - [ ] `apps/web/tests/modules/auth/*.test.tsx` (or a new `users` module test dir, matching wherever Task 5's components land) — age-declaration form's adult/minor branches, waiting-for-consent page, parental-consent landing page's three states, and the post-login/verify redirect logic now consuming `/me`

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

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

### File List
