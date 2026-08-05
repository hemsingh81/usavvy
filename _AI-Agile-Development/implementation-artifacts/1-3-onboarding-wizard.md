---
baseline_commit: e46eb69
---

# Story 1.3: Onboarding Wizard

Status: review

*(Epic 1, FR-A-3. Rescoped during Implementation Readiness review: the original PRD AC landed the learner on a "Recommended Courses screen" requiring Epic 2's catalog — that contradicts Epic 1's own standalone claim, so this story lands on a generic "Browse the catalog" CTA instead; Epic 2 owns turning this into real recommendations later. First story to introduce a genuinely new `core`-owned entity beyond `users`/tokens — `LearnerProfile`, already named under `core` in the architecture's AD-14 ownership table but with no schema yet.)*

## Story

As a newly verified learner,
I want a short onboarding wizard,
so that the system knows my goals, availability, and level before recommending courses.

## Acceptance Criteria

1. **Given** a newly verified user completes the wizard (goal, interests, availability, session length, target date, level) **Then** a Learner Profile record is created and they land on an onboarding-complete screen with a generic "Browse the catalog" call to action

2. **Given** a user abandons onboarding partway **When** they return later **Then** they resume at the abandoned step, with prior answers intact — this is a named UX State Pattern (`EXPERIENCE.md`'s "Onboarding resume-at-abandoned-step", citing the PRD's own `AC-A-3.2`), not just a nice-to-have: it requires the wizard's progress to be persisted server-side (so it survives a different device/browser/session), not held only in client memory or `localStorage`

3. **Given** the Learner Profile record created here **When** Epic 2's catalog exists **Then** Epic 2 owns rendering a "Recommended Courses" surface driven by this profile's goal/interests/level — that surface is out of scope for this story and does not block it

## Tasks / Subtasks

- [x] **Task 1: `learnerProfiles` schema + shared step contract** (AC: #1, #2)
  - [x] New Drizzle table `learnerProfiles` in `services/core/src/db/schema.ts`: `id` (uuidv7), `userId` (FK to `users.id`, **unique** — one profile per user), `goal` (text, nullable), `interests` (`text().array()`, nullable), `availability` (jsonb, nullable — `{ monday: number, tuesday: number, ..., sunday: number }`, hours/day), `sessionLengthMinutes` (integer, nullable), `targetCompletionDate` (date, string mode, nullable — the one genuinely optional field per FR-A-3's "if any"), `level` (text, nullable — validated at the app layer as `"beginner" | "intermediate" | "advanced"`, same convention as `role` needing no DB enum type), `currentStep` (integer, not null, default `0` — see step-tracking design below), `completedAt` (timestamptz, nullable — null until all 6 steps are passed through), `createdAt`/`updatedAt` (timestamptz, per convention), `version` (integer, not null, default `1` — Consistency Conventions optimistic-concurrency column, same as `users`)
  - [x] Add `ONBOARDING_STEPS = ["goal", "interests", "availability", "sessionLength", "targetDate", "level"] as const` and its derived `OnboardingStep` type to `packages/shared-types` (**not** duplicated between `apps/web` and `core` the way `calculateAge` deliberately was in Story 1.2 — there the duplication was justified because both sides needed to independently *compute* the same math; here both sides only need to *agree on an ordered list*, which is exactly what a shared-types constant is for, and duplicating an ordered array with no computation involved would just be Story 1.2's own review-deferred "two hand-copies with only a comment enforcing sync" anti-pattern, avoidable for free here)
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 2: Step-tracking design (read before writing Task 3 — this is the one non-obvious design decision in this story)**
  - [x] `currentStep` is a **forward-only** progress pointer: an index into `ONBOARDING_STEPS` meaning "the learner has successfully passed through steps `0..currentStep-1`". Each successful step-save sets `currentStep = max(currentStep, stepIndexJustSaved + 1)` — never regresses, even if the learner navigates back within the wizard to edit an earlier answer (editing an earlier step must not un-complete later ones)
  - [x] `completedAt` is set (once, to `now()`) the moment `currentStep` reaches `ONBOARDING_STEPS.length` (i.e. the last step, `"level"`, is saved) — this is independent of whether every *field* has a non-null value: `targetCompletionDate` is the one field allowed to stay `null` (the learner "skips" it by submitting the step with `value: null`), but the *step itself* still has to be passed through to advance `currentStep`, same as every other step
  - [x] Resume behavior (AC #2) is a **read**, not a separate mechanism: `GET /users/onboarding` returns the full current row (all fields as saved so far, plus `currentStep`/`completedAt`) — the wizard UI seeks straight to `ONBOARDING_STEPS[currentStep]` on load and pre-fills any already-answered steps if the learner navigates back to them. No separate "resume token" or client-side persistence is needed; the server row *is* the resume state

- [x] **Task 3: `services/core`'s `users` module — onboarding endpoints + `/me` extension** (AC: #1, #2)
  - [x] `GET /users/onboarding` — **authenticated** (same trusted-header pattern as `/me`/`age-declaration`, no new auth mechanism). Returns the learner's `learnerProfiles` row if one exists (upsert-on-first-write — see next bullet — so a first-time caller before any step is saved gets a row with everything `null`/`currentStep: 0`, not a 404); shape: `{ goal, interests, availability, sessionLengthMinutes, targetCompletionDate, level, currentStep, completedAt }`
  - [x] `PUT /users/onboarding/step` `{ step: OnboardingStep, value }` — **authenticated**. `value`'s shape depends on `step` (validate with a per-step zod union, not one loose `unknown`): `goal` → non-empty trimmed string (reasonable max, e.g. 500 chars); `interests` → non-empty array of non-empty trimmed strings; `availability` → object with all 7 weekday keys, each a number `0–24`; `sessionLength` → integer minutes, sensible bounds (e.g. 10–180); `targetDate` → `z.iso.date()` **or explicit `null`** (the one skippable step — reject `undefined`/missing, require an explicit choice either way) and must not be in the past if provided; `level` → enum `"beginner" | "intermediate" | "advanced"`. On success: upsert the corresponding column, advance `currentStep` per Task 2's rule, set `completedAt` if this was the `"level"` step, bump `version`, return the same shape as `GET /users/onboarding`
  - [x] Upsert-on-first-write: the first `PUT` (or the first `GET`, whichever happens first) for a user with no `learnerProfiles` row creates one — don't require a separate "start onboarding" endpoint, there's no meaningful state before the first answer
  - [x] `GET /me`'s response gains `onboardingComplete: boolean` (derived: `learnerProfile?.completedAt != null`, `false` — not `null` — when no row exists yet at all; unlike `isMinor`/`parentalConsentStatus`, there's no "not applicable" case here since every learner must onboard, so a plain boolean is correct where Story 1.2's fields needed three states). Extend `meResponseSchema` in `packages/shared-types`, same reasoning Stories 1.1/1.2 used for adding fields there rather than a story-local shape

- [x] **Task 4: `services/gateway` — proxy the two new routes** (AC: #1, #2)
  - [x] `GET /users/onboarding` and `PUT /users/onboarding/step` → both authenticated, same `requireAuth` `preHandler` + trusted-header forwarding pattern as `/me`/`age-declaration` in `authProxy.ts` — do not invent a second protected-route pattern
  - [x] Validation happens at `core`'s route layer via zod, same `parseOrThrow` pattern as every other endpoint — gateway stays a thin proxy

- [x] **Task 5: `apps/web` — onboarding wizard + landing CTA** (AC: #1, #2, #3)
  - [x] New route `/onboarding` (protected — no session → redirect to `/login`, same pattern as `AgeDeclarationPage`). `OnboardingWizardPage.tsx` in `apps/web/src/modules/users/`: on mount, `GET /users/onboarding`; render the step at `ONBOARDING_STEPS[currentStep]` (or the completion state if `completedAt` is already set — a direct revisit after finishing should not force the wizard again, just show the same "Browse the catalog" landing). One Radix `Form`-based sub-component per step (reuse `apps/web/src/shared/Button.tsx`/`TextField.tsx`, same base Story 1.2's `AgeDeclarationPage` used — `DESIGN.md` has no dedicated wizard/stepper component token, so there is nothing more specific to reuse or match); each step's Continue button calls `PUT /users/onboarding/step` with that step's `value`, then advances to the next step using the **response's** `currentStep` (never assume local-increment matches the server — trust the response, matching the same "don't read stale local state" lesson from Story 1.2's `useAuth` fix). The `targetDate` step needs an explicit "Skip" action alongside its date input, submitting `value: null`
  - [x] After the final (`"level"`) step's `PUT` response comes back with `completedAt` set, navigate to `/` — do not build a separate `/onboarding-complete` route (see next bullet)
  - [x] Extend `apps/web/src/app/HomePage.tsx`: `HomePage` currently takes only `apiUrl` and has no `useAuth`/`getMe` dependency at all — it needs both now. On mount, if `useAuth().session` exists, call `getMe(session.accessToken)` (same call shape every other page already makes right after establishing a session — here it's on-mount instead, since `HomePage` is a landing page reachable at any time, not just right after login) and render the "Browse the catalog" CTA (AC #1) once that resolves with `onboardingComplete: true`. The CTA is a clearly-labeled, non-navigating call-to-action (`<button disabled>` or a link with no real destination, explicitly noted in its own code comment as an intentional Epic-2 placeholder, not a bug) shown alongside the existing health-check status, which stays exactly as-is for anonymous visitors and for a session that hasn't onboarded yet. Do **not** force a redirect away from `/` for a logged-in learner who hasn't onboarded — `resolvePostAuthDestination` already handles that at the moment a session is established (next bullet); `HomePage` reached via direct navigation/back-button with incomplete onboarding should just render its current no-CTA state, not fight the router. A failed `getMe()` call here (e.g. an expired session) must not crash the page or block the health check from still rendering — swallow it into "don't show the CTA," same AD-17-compliant non-silent-but-non-fatal handling as everywhere else `getMe` is called defensively
  - [x] `apps/web/src/modules/users/postAuthRedirect.ts`'s `resolvePostAuthDestination`: add a new branch — after the existing `birthdate`/minor-consent checks, if `me.onboardingComplete === false`, return `"/onboarding"`; otherwise fall through to the existing `"/"` default. Per Story 1.2's own review-established precedent (`resolvePostAuthDestination` must fail closed), gate explicitly on `=== false`, matching the existing style of the function rather than an `if (!x)` shorthand that would also (mis)trigger on an unexpected value

- [x] **Task 6: Tests mirroring `src/` 1:1** (AD-8)
  - [x] `services/core/tests/modules/users/onboarding.test.ts` (or extend `service.test.ts`/`routes.test.ts`, matching wherever Task 3's functions land) — each step's validation (including the `targetDate` explicit-`null`-vs-missing distinction, and rejecting a past `targetDate`), `currentStep` forward-only advancement (editing an earlier already-passed step must not regress it), `completedAt` set only after the `"level"` step, upsert-on-first-write (`GET` before any `PUT` returns an all-null row rather than 404), `/me`'s `onboardingComplete` in both states
  - [x] `services/gateway/tests/authProxy.test.ts` — new proxy routes both require auth (401 with no token)
  - [x] `apps/web/tests/modules/users/OnboardingWizardPage.test.tsx` (new) — step-by-step happy path, resume-at-abandoned-step (mock `GET /users/onboarding` returning a mid-wizard `currentStep` and assert the correct step renders first), the `targetDate` skip action, completion navigating to `/`
  - [x] `apps/web/tests/app/HomePage.test.tsx` (update) — CTA renders only when session exists **and** `onboardingComplete: true`; existing health-check-only behavior unchanged for anonymous visitors
  - [x] `apps/web/tests/modules/users/postAuthRedirect.test.ts` (update) — new `/onboarding` branch, including that it's checked after (not instead of) the existing minor-consent branches

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `learnerProfiles` belongs to `core` (owns `User`, and per the architecture's own ERD ownership table, `LearnerProfile` too) — same database, no new service. This is the first entity beyond `users`/tokens `core` has grown; nothing here changes that ownership model, just exercises it for the first time.
- **AD-7 (RBAC):** no new role/permission. Every role may manage their own onboarding, gated purely by "is this a valid authenticated session" — same as `age-declaration`. Don't add a `can()` matrix entry.
- **AD-17 (no silent failures):** every new failure path (invalid step value, past `targetDate`, missing/malformed `step` key) resolves to a specific `error.code` via the existing central error-mapper.
- **AD-8 (test mirroring):** see Task 6.
- **AD-13 (module boundaries):** all new `core` code lives in the existing `modules/users/` folder (no new module) — `LearnerProfile` is a `users`-module concern, same as `age.ts` was.
- **Consistency Conventions:** `learnerProfiles` needs its own `version` column (a *new* mutable entity, not a write path added to `users`) — bump it on every write, same discipline as `users.version`.

### Previous story intelligence (Stories 1.1/1.2 — read before starting, don't rediscover these)

- **Reuse, don't reinvent:** the central error-mapper (`AppError`/`registerErrorHandler` in `@usavvy/service-kernel`), `parseOrThrow` (`services/core/src/modules/auth/validation.ts`), the `x-internal-secret` trust-boundary check (already global in `core`'s `app.ts` — the new routes need no new wiring for it), `apps/web/src/shared/apiClient.ts`'s `apiRequest`/`ApiError` (used by every module's `api.ts`), `apps/web/src/shared/Button.tsx`/`TextField.tsx` (Radix-`Form`-based primitives).
- **`GET /me` already exists and reads trusted headers** — this story *extends* its response shape again (third story in a row to do so), it does not duplicate the auth-resolution logic.
- **Test tokens:** `services/core/tests/testHelpers.ts` exports `TEST_INTERNAL_SECRET` — every `app.inject(...)` call needs `headers: { "x-internal-secret": TEST_INTERNAL_SECRET }`, plus `x-user-id`/`x-user-role` for the authenticated routes.
- **`resolvePostAuthDestination` is the one place that decides where a freshly-authenticated learner lands** (`apps/web/src/modules/users/postAuthRedirect.ts`) — already has an `isMinor`/consent branch from Story 1.2; this story adds a fourth branch, doesn't replace the function. It's called from `LoginPage`/`SignUpPage`/`VerifyEmailPage`/`GoogleSignInButton`'s success handlers already — no new call sites needed, they all funnel through this one function.
- **Circular-import avoidance pattern (Story 1.2):** files in `apps/web/src/modules/auth/` that need `resolvePostAuthDestination` import it *directly* from `../users/postAuthRedirect.js`, bypassing the `users/index.js` barrel — this story's new `OnboardingWizardPage`/`HomePage` work is entirely within/consumed-by `modules/users`+`app/`, so this pattern shouldn't need to be touched, just not broken.
- **Story 1.2's own review found and fixed a real TOCTOU race**: `declareAge`'s already-declared check raced two concurrent requests because it read-then-checked-then-wrote with no WHERE-clause tie-back. This story's step-save endpoint has a similar shape (read current row, decide `currentStep`, write) — **but unlike age declaration, re-saving a step is not an error state here** (there's no "already declared" lock; steps are freely re-editable), so the fix isn't "reject the loser," it's making the `currentStep`-advancement arithmetic itself safe under a concurrent write (e.g. compute the new `currentStep` from the row read *inside* the same update, via SQL `GREATEST(current_step, N)` rather than an application-level `max()` on a possibly-stale read) — don't skip this just because it's not a blocking error case; a lost update here would silently regress `currentStep` and break resume (AC #2).
- **Story 1.2's own review found and fixed unhandled promise rejections** in `LoginPage`/`SignUpPage`'s Google sign-in success handlers (a failed `getMe()` after successful Google auth silently stranded the user). Any new async chain this story adds in those same success-handler call sites (there shouldn't be new ones — the new redirect branch lives inside the already-fixed `resolvePostAuthDestination`) must keep that `.catch()` discipline; don't reintroduce a bare `.then()` chain.
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass.

### API response shapes

| Route | Success shape |
| --- | --- |
| `GET /users/onboarding` | `200 { goal: string \| null, interests: string[] \| null, availability: Record<Weekday, number> \| null, sessionLengthMinutes: number \| null, targetCompletionDate: string \| null, level: "beginner" \| "intermediate" \| "advanced" \| null, currentStep: number, completedAt: string \| null }` |
| `PUT /users/onboarding/step` | same shape as `GET /users/onboarding`, reflecting the row *after* the write |
| `GET /me` (extended) | existing shape (see Story 1.2's story doc) + `onboardingComplete: boolean` |
| any failure | `{ error: { code, message, details? } }` — `400` validation (bad step value, missing/invalid `step` key, past `targetDate`), `401` unauthenticated |

### Validation rules

- **`step`:** must be one of `ONBOARDING_STEPS` (shared-types constant) — reject anything else with `VALIDATION_ERROR`, don't silently ignore an unrecognized step key.
- **`targetDate`:** the *only* step whose `value` may be `null` — every other step's `value` must be present and pass its own schema; `null`/missing on a non-`targetDate` step is a `VALIDATION_ERROR`, not treated as "skip." A provided (non-null) `targetDate` must be `>=` today (reuse the "not in the past" comparison shape from Story 1.2's `age.ts`/`routes.ts`, but inverted — future-or-today is valid here, not rejected).
- **`availability`:** all 7 weekday keys required (don't allow partial objects — a step is atomic, not independently-patchable per field), each `0–24`.

### Project Structure Notes

```text
services/core/
  src/
    db/
      schema.ts                              # updated — new learnerProfiles table
    modules/
      users/
        onboarding.ts                        # new — step validation schemas, step-advancement logic (or fold into service.ts if it stays small; developer's call, but keep it out of routes.ts either way, matching age.ts's precedent of a dedicated file for non-trivial logic)
        service.ts                            # updated — getOnboarding, saveOnboardingStep, getMe extended
        routes.ts                             # updated — GET /users/onboarding, PUT /users/onboarding/step
  tests/
    modules/users/onboarding.test.ts          # new (or folded into existing files — match Task 3's actual layout)

services/gateway/
  src/
    authProxy.ts                              # updated — two new authenticated routes
  tests/
    authProxy.test.ts                         # updated

packages/shared-types/
  src/
    auth.ts                                   # updated — meResponseSchema gains onboardingComplete
    users.ts                                  # new (or add to auth.ts) — ONBOARDING_STEPS, OnboardingStep, LearnerProfileResponse schema

apps/web/
  src/
    modules/
      users/
        OnboardingWizardPage.tsx               # new
        onboarding-api.ts (or fold into api.ts)  # new — getOnboarding, saveOnboardingStep
    app/
      HomePage.tsx                            # updated — CTA when session + onboardingComplete
      App.tsx                                 # updated — new /onboarding route
  tests/
    modules/users/OnboardingWizardPage.test.tsx  # new
    app/HomePage.test.tsx                     # updated
    modules/users/postAuthRedirect.test.ts    # updated
```

### Testing requirements

- Backend onboarding tests are integration-style against the real Postgres container, matching Stories 1.1/1.2's own precedent (`db.transaction`/concurrent-write behavior is real DB behavior, not mockable value) — Story 1.2's `service.test.ts` has a working example of a genuine concurrency test (`Promise.allSettled` firing two real concurrent calls at the same account); use the same shape to prove the `GREATEST()`-based `currentStep` advancement is actually safe, not just written to look safe.
- `targetDate` validation tests use fixed, explicit dates relative to a captured "today," never the test run's wall-clock date for the *expected* result — same discipline Story 1.2 established for birthdate tests.
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.3, Epic 1 intro, FR-A-3, requirements inventory]
- [Source: `Doc/00-Requirement.md` §8.1/§8.2 — FR-A-3's original field list, `AC-A-3.1`/`AC-A-3.2`, the onboarding BA note ("≤5 screens," "≤90 seconds," non-binding — not restated as a formal AC in epics.md's Story 1.3)]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Information Architecture surface map (onboarding as a first-run surface, after age-declaration/consent), the named "Onboarding resume-at-abandoned-step (AC-A-3.2)" State Pattern, general state patterns (empty states, retry-never-a-dead-end, no silent failures), Voice and Tone, Accessibility Floor]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — confirmed no dedicated wizard/stepper component token exists; generic `button-primary`/`button-secondary` + the shared `Button`/`TextField` primitives are the closest match]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-7, AD-8, AD-13, AD-14 (ownership table names `LearnerProfile` under `core`), AD-17, Consistency Conventions]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-2-age-declaration-minor-consent.md` — established token/error-mapper/trust-boundary/test conventions this story builds on, including its own code-review findings (TOCTOU race fix, fail-closed `resolvePostAuthDestination`, unhandled-promise-rejection fixes) that directly inform this story's step-advancement and redirect-branch design]

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-4, backend) — `learnerProfiles` table (first `core`-owned entity beyond `users`/tokens), `ONBOARDING_STEPS` + a discriminated-union per-step validation schema in `shared-types` (not duplicated between client/server — no computation involved, unlike `calculateAge`), `GET`/`PUT /users/onboarding` in `core` with forward-only `currentStep` advancement computed inside a single `greatest()`/`coalesce()` UPDATE (verified safe under two genuinely concurrent step-saves via a real concurrency test, not just written to look safe), `/me` extended with `onboardingComplete`, gateway proxy routes. 106 `services/core` tests (up from 82), 32 `services/gateway` tests (up from 28), 41 `shared-types` tests (up from 19).
- 2026-08-05: Checkpoint 2 (Tasks 5-6, frontend) — `OnboardingWizardPage` (6-step wizard seeded from the server's `currentStep`, one Radix-`Form` sub-component per step, `targetDate`'s explicit Skip action, Back navigation across already-fetched answers), `HomePage` extended with a placeholder "Browse the catalog" CTA gated on `/me`'s `onboardingComplete`, `resolvePostAuthDestination` gains a fail-closed onboarding branch checked after the existing minor-consent gates. 78 `apps/web` tests (up from 71).
- 2026-08-05: Task 6 completion — full regression clean (284 tests across the monorepo), migration applied to the live Postgres container, and the full flow reverified end-to-end against the real running stack: via `curl` (signup → verify → declare age → all 6 onboarding steps including the `targetDate` skip → `/me` flips to `onboardingComplete: true`, plus a genuine resume-at-abandoned-step check via a mid-wizard `GET`) and via a real browser (login → redirected straight to the correct mid-wizard step → completed via `curl` → re-login lands on `/` with the "Browse the catalog" CTA visible). Live testing surfaced and fixed a real, AC-relevant gap: `AgeDeclarationPage`'s adult branch had hardcoded `navigate("/")` since Story 1.2, so it never routed a newly-adult-declared learner through the new onboarding check at all — fixed to re-fetch `/me` and delegate to `resolvePostAuthDestination`, same as every other post-auth entry point, with new test coverage for both the onboarding-complete and onboarding-incomplete cases. Separately, this session's browser-automation tooling was found to be unable to send PUT/PATCH/DELETE requests at all (confirmed via a direct in-page fetch matrix across methods — GET/POST succeed, PUT/PATCH/DELETE fail at the network layer before reaching the server) — a limitation of the testing tool itself, not the product; the PUT-step flow was instead verified live via `curl` end-to-end plus the full `OnboardingWizardPage` unit-test suite against a real mocked fetch contract. Status → `review`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1-4 (backend):** `stepColumnUpdate()` maps each `OnboardingStepInput` variant to the one Drizzle column it writes; TypeScript's discriminated-union narrowing on `input.step` makes this exhaustive without a default case. `ensureLearnerProfile()` (upsert-on-first-write) uses `INSERT ... ON CONFLICT (user_id) DO NOTHING RETURNING *` then a fallback `SELECT` on conflict — race-safe for two concurrent first-time `GET`s. `requireTrustedUser()` factored out of `routes.ts` (was duplicated per-route) since this story added a third and fourth authenticated route needing the identical trusted-header check — Story 1.2's own review had already flagged the prior two-copy duplication as "soon more."
- **Task 5 (frontend):** `OnboardingWizardPage` tracks `viewedStep` locally, separate from the server's `currentStep` — after any successful save it advances by exactly one from wherever the learner was viewing, rather than jumping to the server's (forward-only, never-regressing) `currentStep`; this matters when a learner uses Back to revisit an earlier step; re-saving it should move them to the *next* step in sequence, not snap ahead to however far the account has ever reached. `interests` is collected as a single comma-separated text input rather than a tag-editor widget — `DESIGN.md` has no component token for either, and a plain field is the simpler, unambiguous choice for a 6-field wizard with no design spec to match.
- **Real, AC-relevant bug found via live testing (not caught by any unit test, since `AgeDeclarationPage.test.tsx` had no reason to know about `onboardingComplete` before this story existed):** `AgeDeclarationPage`'s adult branch has hardcoded `navigate("/")` since Story 1.2 — this story's whole point is that a newly-adult-declared learner should land on `/onboarding` next, but that page never called `resolvePostAuthDestination` at all, so every adult signup silently skipped onboarding entirely. Fixed by re-fetching `/me` and delegating to `resolvePostAuthDestination`, matching every other post-auth entry point (`LoginPage`/`SignUpPage`/`VerifyEmailPage`); the minor branch is unaffected (it already correctly goes straight to `/waiting-for-consent`, which gates before onboarding either way). New tests cover both the onboarding-complete and onboarding-incomplete outcomes of this branch.
- **Task 6 (full regression + live verification):** 284 tests green across the monorepo (config 14, shared-types 41, service-kernel 12, apps/web 78→79 after the `AgeDeclarationPage` fix, gateway 32, core 106), `tsc --noEmit`/`eslint .` clean in every workspace. Applied the new migration to the live Postgres container and verified the complete flow end-to-end via `curl` (all 6 steps including the `targetDate` skip, resume-at-abandoned-step via a mid-wizard `GET`, `/me` flipping to `onboardingComplete: true`) and via a real browser (login → correct mid-wizard step rendered → post-completion login lands on `/` with the CTA visible). Discovered along the way that this session's browser-automation extension cannot send PUT/PATCH/DELETE requests at all — verified directly via an in-page `fetch()` method matrix (GET/POST succeed, PUT/PATCH/DELETE fail with a bare network error before any response, even to a trivial existing GET-only endpoint) — a tooling limitation unrelated to the product; relied on `curl` plus the full `OnboardingWizardPage` unit-test suite (which exercises the real request/response contract against a mocked `fetch`) for that portion of verification instead. All test data cleaned up from Postgres afterward.

### File List

**Task 1 (schema + shared contract):**
- `services/core/src/db/schema.ts` (updated — new `learnerProfiles` table)
- `services/core/drizzle/0002_yielding_puff_adder.sql` (new — generated migration)
- `services/core/drizzle/meta/0002_snapshot.json` (new), `services/core/drizzle/meta/_journal.json` (updated)
- `packages/shared-types/src/users.ts` (new — `ONBOARDING_STEPS`, `OnboardingStep`, `learnerLevelSchema`, `availabilitySchema`, `learnerProfileResponseSchema`, `onboardingStepInputSchema`)
- `packages/shared-types/src/index.ts` (updated — barrel), `packages/shared-types/tests/users.test.ts` (new)

**Task 3 (core users module):**
- `services/core/src/modules/users/service.ts` (updated — `getMe` extended, `getOnboarding`, `saveOnboardingStep`, `ensureLearnerProfile`, `stepColumnUpdate`, `toLearnerProfileResponse`)
- `services/core/src/modules/users/routes.ts` (updated — `GET /users/onboarding`, `PUT /users/onboarding/step`, `requireTrustedUser()` extracted)
- `packages/shared-types/src/auth.ts` (updated — `meResponseSchema` gains `onboardingComplete`), `packages/shared-types/tests/auth.test.ts` (updated)
- `services/core/tests/modules/users/service.test.ts`, `services/core/tests/modules/users/routes.test.ts` (updated)

**Task 4 (gateway proxy):**
- `services/gateway/src/authProxy.ts` (updated — two new authenticated routes)
- `services/gateway/tests/authProxy.test.ts` (updated)

**Task 5 (apps/web):**
- `apps/web/src/modules/users/OnboardingWizardPage.tsx` (new)
- `apps/web/src/modules/users/api.ts` (updated — `getOnboarding`, `saveOnboardingStep`), `apps/web/src/modules/users/index.ts` (updated — barrel)
- `apps/web/src/modules/users/postAuthRedirect.ts` (updated — onboarding branch)
- `apps/web/src/app/HomePage.tsx` (updated — catalog CTA), `apps/web/src/app/App.tsx` (updated — `/onboarding` route)
- `apps/web/src/modules/users/AgeDeclarationPage.tsx` (updated — review-finding fix: adult branch now delegates to `resolvePostAuthDestination` instead of hardcoded `navigate("/")`)
- `apps/web/tests/modules/users/OnboardingWizardPage.test.tsx` (new)
- `apps/web/tests/app/HomePage.test.tsx`, `apps/web/tests/modules/users/postAuthRedirect.test.ts`, `apps/web/tests/modules/users/api.test.ts`, `apps/web/tests/modules/users/AgeDeclarationPage.test.tsx` (updated)

**Task 6 (sprint tracking):**
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (updated — Story 1.3 → `review`)
