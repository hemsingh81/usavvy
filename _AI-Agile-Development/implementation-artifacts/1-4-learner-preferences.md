---
baseline_commit: 185e39d
---

# Story 1.4: Learner Preferences

Status: review

*(Epic 1, FR-A-4. Extends the same `learnerProfiles` row Story 1.3 created — the architecture's own AD-14 ownership table and the PRD's data model (§18: `User ──1:1── LearnerProfile (goal, level, availability, preferences, privacy flags)`) both nest preferences inside `LearnerProfile`, not a separate entity. Unlike onboarding, this is not a wizard: preferences are freely, repeatedly editable at any time, with real default values from the start — never "null until answered.")*

## Story

As a learner,
I want to set voice/board/explanation-style preferences,
so that my sessions match how I like to learn.

## Acceptance Criteria

1. **Given** a learner sets voice on/off, speech rate, board theme, explanation style, captions, reduced-motion **Then** these are saved and applied as defaults on their next board session — "applied as defaults" means `GET /users/preferences` always returns a fully-populated object (every field has a real value, never `null`), not a snapshot rendered before the Board itself exists yet (there is no Board to actually consume these defaults until a later epic; this story's scope ends at persisting and exposing them correctly, per the same "buildable form" reasoning Stories 1.2/1.3 used for their own not-yet-built downstream consumers)

## Tasks / Subtasks

- [x] **Task 1: Extend `learnerProfiles` schema + shared preferences contract** (AC: #1)
  - [x] Add 6 nullable columns to the existing `learnerProfiles` table in `services/core/src/db/schema.ts` (do **not** create a new table — same row Story 1.3 created, per AD-14): `voiceEnabled` (boolean), `speechRate` (real/numeric), `boardTheme` (text, `$type<BoardTheme>()`), `explanationStyle` (text, `$type<ExplanationStyle>()`), `captionsEnabled` (boolean), `reducedMotion` (boolean). Nullable, not defaulted at the DB level — defaults are computed at the service layer (next bullet), the same "derive, don't snapshot" philosophy `deriveAgeFields`/`getMe` already use, and it means a future story adding a 7th preference never needs a backfill migration for existing rows
  - [x] In `packages/shared-types` (new file `preferences.ts`, or add to `users.ts` — developer's call, but keep it separate from `learnerProfileResponseSchema`/`onboardingStepInputSchema`, which model a genuinely different concern on the same row): `boardThemeSchema` (`z.enum(["dark", "paper"])`, per `DESIGN.md`'s DC-3 Board Dark/Paper toggle — **not** FR-A-9's separate 4-preset app-wide color theme, which is a different story/control entirely, explicitly independent per `EXPERIENCE.md`), `explanationStyleSchema` (`z.enum(["concise", "detailed", "example-first", "analogy-first"])`, FR-A-4's literal parenthetical), `learnerPreferencesSchema` (all 6 fields, every one **non-nullable** — this is the response shape, always fully populated), `DEFAULT_LEARNER_PREFERENCES` (a `LearnerPreferences` constant: `voiceEnabled: true`, `speechRate: 1`, `boardTheme: "dark"`, `explanationStyle: "concise"`, `captionsEnabled: false`, `reducedMotion: false` — product judgment calls, documented as such below since no AC/NFR specifies exact defaults or a `speechRate` range), `preferencesUpdateInputSchema` (all 6 fields **optional**, `.refine()`d to reject an empty object — a `PUT` updates whatever subset of controls the learner just touched, not the whole form at once; see Task 4's "instant-apply per control" reasoning)
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 2: `services/core`'s `users` module — preferences endpoints** (AC: #1)
  - [x] `GET /users/preferences` — **authenticated** (same trusted-header pattern as every other `users` route). Reuse `ensureLearnerProfile()` (Story 1.3, upsert-on-first-write — a learner may visit Preferences before ever touching onboarding) to load the row, then map each of the 6 columns through `value ?? DEFAULT_LEARNER_PREFERENCES[field]` — the response is **always** fully populated, unlike `GET /users/onboarding`'s legitimately-null-until-answered fields. This is a materially different contract from `learnerProfileResponseSchema` even though both read the same table row
  - [x] `PUT /users/preferences` `Partial<LearnerPreferences>` (validated via `preferencesUpdateInputSchema`) — **authenticated**. Reuse `ensureLearnerProfile()`, then `UPDATE` only the columns present in the request body (a genuine partial update — do not overwrite absent fields with defaults), bump `updatedAt`/`version` per Consistency Conventions. Return the same fully-populated shape as `GET`. **No step-order, one-time-lock, or CAS check is needed here** — unlike `saveOnboardingStep`, every preference is a freely, repeatedly re-editable field with no invariant a concurrent write could violate (Story 1.3's own code review reached exactly this conclusion for a similar-looking case and correctly deferred adding one — don't reintroduce that complexity here where it's even less warranted)
  - [x] Do **not** touch `GET /me` or `meResponseSchema` — preferences are a growing, nested shape unlike the flat booleans/enums `/me` has accumulated so far (Story 1.2's `isMinor`, Story 1.3's `onboardingComplete`); a dedicated endpoint matches Story 1.3's own `GET/PUT /users/onboarding` precedent instead

- [x] **Task 3: `services/gateway` — proxy the two new routes** (AC: #1)
  - [x] `GET /users/preferences` and `PUT /users/preferences` → both authenticated, same `requireAuth` `preHandler` + trusted-header forwarding pattern already used for every other `users/*` route in `authProxy.ts`
  - [x] Validation happens at `core`'s route layer via zod, same `parseOrThrow` pattern as every other endpoint — gateway stays a thin proxy

- [x] **Task 4: `apps/web` — preferences page** (AC: #1)
  - [x] New shared primitive `apps/web/src/shared/Switch.tsx` (Radix `Switch`-based, matching `Button.tsx`/`TextField.tsx`'s existing wrapper style — unstyled-by-default Radix primitive, styled via CSS classes; `radix-ui` is already a dependency, no new package). Three of the six controls need a boolean toggle (`voiceEnabled`, `captionsEnabled`, `reducedMotion`) — building one reusable primitive for three uses is warranted, unlike a one-off. `DESIGN.md` has no dedicated toggle/switch component token (same gap Story 1.3 hit for the wizard/stepper and `interests` tag-editor) — style it from the generic tokens already in `components.css`, nothing more specific to match
  - [x] New route `/preferences` (protected — no session → redirect to `/login`, same pattern as `AgeDeclarationPage`/`OnboardingWizardPage`; **not** gated on `onboardingComplete` — nothing in this story's AC ties preferences to onboarding state, and a learner should be able to set preferences regardless of where they are in that separate flow). `PreferencesPage.tsx` in `apps/web/src/modules/users/`: on mount, `GET /users/preferences`; render all 6 controls at once (this is a settings page, not a wizard — no step/progress concept applies). `voiceEnabled`/`captionsEnabled`/`reducedMotion` → the new `Switch`; `boardTheme`/`explanationStyle` → a native `<select>` wrapped in `Form.Field`/`Form.Control asChild`, the exact pattern `OnboardingWizardPage`'s `LevelStep` already established for an enum control; `speechRate` → a plain `TextField type="number"` (bounded 0.5–2, matching the shared schema) — consistent with how Story 1.3 handled `sessionLengthMinutes`/`availability`'s numeric inputs rather than introducing a new slider primitive with no design token to match either
  - [x] Each control **auto-saves independently on change** — `PUT /users/preferences` with just that one field, immediately, no separate "Save" button — matching `EXPERIENCE.md`'s own stated precedent for the Theme Picker ("applied instantly on selection with no page reload, persisted to the Learner Profile"). A per-control save must not block or reset the other five controls' current values while in flight
  - [x] A failed individual save surfaces a small, per-control inline error (AD-17 — no silent failures) without discarding the learner's other successfully-saved preferences or forcing a full page reload to retry

- [x] **Task 5: Tests mirroring `src/` 1:1** (AD-8)
  - [x] `services/core/tests/modules/users/service.test.ts` (or a dedicated `preferences.test.ts`, matching wherever Task 2's functions land) — `getPreferences` returns `DEFAULT_LEARNER_PREFERENCES` verbatim before any write; a partial `savePreferences` updates only the given field(s), leaving the rest at their previous (or still-default) values; validation rejects an out-of-bounds `speechRate` and an unrecognized `boardTheme`/`explanationStyle`; rejects an empty update body
  - [x] `services/core/tests/modules/users/routes.test.ts` — both routes require authentication (401 with no trusted headers)
  - [x] `services/gateway/tests/authProxy.test.ts` — both new proxy routes require auth (401 with no token)
  - [x] `apps/web/tests/shared/Switch.test.tsx` (new) — renders, toggles, calls `onCheckedChange`
  - [x] `apps/web/tests/modules/users/PreferencesPage.test.tsx` (new) — loads and displays the fetched preferences, each control save fires the correct partial `PUT` body and doesn't disturb the other controls' displayed values, a failed save shows an inline error without losing other successfully-saved state

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** the 6 new columns extend `learnerProfiles`, already owned by `core` — same table Story 1.3 created, no new entity, no new service.
- **AD-7 (RBAC):** no new role/permission. Every role manages their own preferences, gated purely by "is this a valid authenticated session" — same reasoning Stories 1.2/1.3 used for `age-declaration`/`onboarding`.
- **AD-17 (no silent failures):** every new failure path (out-of-bounds `speechRate`, unrecognized enum value, empty update body) resolves to a specific `error.code` via the existing central error-mapper; a failed per-control save on the frontend surfaces inline rather than disappearing.
- **AD-8 (test mirroring):** see Task 5.
- **AD-13 (module boundaries):** all new `core` code lives in the existing `modules/users/` folder (no new module).
- **Consistency Conventions:** every write bumps `learnerProfiles.version`/`updatedAt`, same discipline as every other write to this table — but **no CAS/version check is needed on read**, since (unlike `AGE_ALREADY_DECLARED`'s one-time lock) there is no invariant a concurrent preference write could violate; see Task 2's explicit note on this.

### Previous story intelligence (Stories 1.1–1.3 — read before starting, don't rediscover these)

- **Reuse, don't reinvent:** `ensureLearnerProfile()` (`services/core/src/modules/users/service.ts`, Story 1.3) for both new routes' upsert-on-first-write — do not duplicate this logic. The central error-mapper (`AppError`/`registerErrorHandler`), `parseOrThrow`, the global `x-internal-secret` trust-boundary check (no new wiring needed), `apps/web/src/shared/apiClient.ts`'s `apiRequest`/`ApiError`.
- **`requireTrustedUser()`** (`services/core/src/modules/users/routes.ts`, extracted during Story 1.3's own code review after the third/fourth authenticated route needed the identical check) — this story's two new routes are the fifth/sixth; keep using it, don't reintroduce a copy.
- **No shared UI primitive exists yet for toggle/switch/select/slider** — only `Button`/`TextField` exist in `apps/web/src/shared/`. `OnboardingWizardPage`'s `LevelStep` already established the native-`<select>`-in-`Form.Field` pattern for an enum control; reuse it rather than inventing a second enum-control pattern. `DESIGN.md` has no component token for any of these control types (same gap Story 1.3 hit and documented for its own wizard/stepper).
- **Story 1.3's own code review found and fixed a real bug from an analogous-looking oversight**: nothing enforced that `saveOnboardingStep` couldn't be called out of order, letting a client mark onboarding "complete" with most fields still null. This story's endpoints have no such ordering concept at all (there is no "complete" state for preferences — every field always has a value), so there is nothing equivalent to guard against; don't add step-order-style validation here, it doesn't apply.
- **Story 1.3's own code review also found and fixed missing cancellation guards** on `useEffect`-based data-fetching in `HomePage`/`OnboardingWizardPage` (a stale response landing after the session changed or the component unmounted). `PreferencesPage`'s own mount-time `GET /users/preferences` needs the same guard from the start, not as a follow-up fix.
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass.

### Scope note: what's explicitly OUT of scope for this story

- **The dyslexia-friendly font toggle (Atkinson Hyperlegible, NFR-11)** is cross-referenced to FR-A-4 in `EXPERIENCE.md`'s Accessibility Floor section ("...available from Preferences (NFR-11, FR-A-4)"), but is **not** one of the fields epics.md's own Story 1.4 AC lists (voice on/off, speech rate, board theme, explanation style, captions, reduced-motion) — and epics.md's AC is this project's authoritative source over the PRD/UX docs where the two disagree (same precedent Story 1.3 followed for its own AC rescoping). Leave it out; flag as a likely small follow-up (one more boolean preference, same shape as the other three) rather than silently expanding this story's scope.
- **FR-A-9's app-wide color-theme picker** (Indigo Focus/Midnight/High Contrast/Warm Paper, its own `theme-picker` `DESIGN.md` component token) is a **different, later, SHOULD-priority requirement** — not part of FR-A-4, not part of this story, even though both surfaces live under "Preferences" in `EXPERIENCE.md`'s IA map. Don't conflate `boardTheme` (this story's dark/paper Board toggle, DC-3) with the app color theme.
- **No `/preferences` entry point is wired into any navigation chrome** — no primary nav/profile-menu exists anywhere in the app yet (the same gap Story 1.3 documented for itself: `/` is still a bare landing page). The route exists and is directly reachable, matching every other page added so far.
- **The Board itself doesn't exist yet** (later epic) — this story cannot "apply" these preferences to a live session; it ends at correctly persisting and exposing them.

### API response shapes

| Route | Success shape |
| --- | --- |
| `GET /users/preferences` | `200 { voiceEnabled: boolean, speechRate: number, boardTheme: "dark" \| "paper", explanationStyle: "concise" \| "detailed" \| "example-first" \| "analogy-first", captionsEnabled: boolean, reducedMotion: boolean }` (always fully populated) |
| `PUT /users/preferences` | same shape as `GET`, reflecting the row after the (partial) write |
| any failure | `{ error: { code, message, details? } }` — `400` validation (out-of-bounds `speechRate`, unrecognized enum, empty body), `401` unauthenticated |

### Validation rules

- **`speechRate`:** `0.5`–`2` inclusive (a product judgment call — no AC/NFR specifies an exact range; chosen as a conventional TTS-rate multiplier bound).
- **`boardTheme`/`explanationStyle`:** must be one of their respective enum's literal values — reject anything else with `VALIDATION_ERROR`.
- **Update body:** at least one of the 6 fields must be present — reject `{}` (an empty `PUT` is either a client bug or a no-op that shouldn't round-trip to the database).

### Project Structure Notes

```text
services/core/
  src/
    db/
      schema.ts                              # updated — learnerProfiles gains 6 preference columns
    modules/
      users/
        service.ts                            # updated — getPreferences, savePreferences
        routes.ts                             # updated — GET/PUT /users/preferences
  tests/
    modules/users/service.test.ts             # updated (or new preferences.test.ts)
    modules/users/routes.test.ts              # updated

services/gateway/
  src/
    authProxy.ts                              # updated — two new authenticated routes
  tests/
    authProxy.test.ts                         # updated

packages/shared-types/
  src/
    preferences.ts                            # new — boardThemeSchema, explanationStyleSchema, learnerPreferencesSchema, DEFAULT_LEARNER_PREFERENCES, preferencesUpdateInputSchema
    index.ts                                   # updated — barrel

apps/web/
  src/
    shared/
      Switch.tsx                              # new — Radix Switch wrapper
      index.ts                                # updated — barrel
    modules/
      users/
        PreferencesPage.tsx                   # new
        api.ts                                 # updated — getPreferences, savePreferences
        index.ts                               # updated — barrel
    app/
      App.tsx                                 # updated — new /preferences route
  tests/
    shared/Switch.test.tsx                    # new
    modules/users/PreferencesPage.test.tsx    # new
```

### Testing requirements

- Backend preferences tests are integration-style against the real Postgres container, matching every prior story's precedent.
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.4, Epic 1 intro, FR-A-4]
- [Source: `Doc/00-Requirement.md` §8.1 — FR-A-4's field list; §16.2 — NFR-8 (WCAG 2.1 AA), NFR-9 (captions always available), NFR-10 (`prefers-reduced-motion`), NFR-11 (200% text scaling, dyslexia-friendly font option); §18 — data model nesting preferences inside `LearnerProfile`]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — DC-3 Board Dark/Paper toggle, Atkinson Hyperlegible dyslexia-alt typography token (NFR-11, out of scope per above), the distinct FR-A-9 `theme-picker` token (also out of scope), confirmed no toggle/switch/select/slider component token exists]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Information Architecture (Preferences as a profile-menu surface), Theme Picker's "applied instantly, no page reload" precedent (informs this story's per-control auto-save design), Accessibility Floor (NFR-8/9/10/11 detail), TTS graceful-degradation state pattern]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-7, AD-8, AD-13, AD-14 (ownership table — no separate "Preferences" entity), AD-17, Consistency Conventions]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-3-onboarding-wizard.md` — established `ensureLearnerProfile`/`requireTrustedUser` reuse points, the `LevelStep` enum-control pattern, and its own code-review findings (step-order enforcement, cancellation guards) that inform what does/doesn't apply here]

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-3, backend) — 6 nullable preference columns on `learnerProfiles`, defaults computed at the service layer via `DEFAULT_LEARNER_PREFERENCES` (no DB defaults, no backfill needed for future preferences), `GET`/`PUT /users/preferences` reusing `ensureLearnerProfile`, a genuine partial update with no step-order/CAS check since every preference is freely re-editable, gateway proxy routes. 121 `services/core` tests (up from 108), 36 `services/gateway` tests (up from 32), 56 `shared-types` tests (up from 43).
- 2026-08-05: Checkpoint 2 (Task 4, frontend) — new shared `Switch` primitive (Radix-based), `PreferencesPage` with all 6 controls auto-saving independently on change (optimistic update, reverted with an inline error on failure, matching `EXPERIENCE.md`'s Theme Picker "instant-apply" precedent), `/preferences` route. 90 `apps/web` tests (up from 80).
- 2026-08-05: Task 5 completion — full regression clean (329 tests across the monorepo), migration applied to the live Postgres container, and the full flow reverified end-to-end via `curl`: first-call defaults, a single-field partial update, a multi-field partial update (confirming unrelated fields survive), and all three validation rejections (empty body, out-of-bounds `speechRate`, invalid `boardTheme`). A live browser render/interaction check of `PreferencesPage` was not performed beyond what's already covered by its unit-test suite — this session's browser-automation tooling was already confirmed unable to send `PUT`/`PATCH`/`DELETE` requests at all (discovered and documented during Story 1.3's own live verification), so a browser pass here would hit the identical wall for zero additional confidence beyond the existing `curl` + mocked-fetch component-test coverage. Status → `review`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1-3 (backend):** `toLearnerPreferences()` maps each nullable DB column through `?? DEFAULT_LEARNER_PREFERENCES[field]`, so `GET`/`PUT` always return a fully-populated object regardless of how many fields have actually been overridden. `savePreferences` spreads `PreferencesUpdateInput` directly into Drizzle's `.set()` — the input's keys are already validated as a subset of the table's own preference columns with matching types (via `preferencesUpdateInputSchema`), so no per-field mapping function was needed the way `stepColumnUpdate` was for onboarding's discriminated union.
- **Task 4 (frontend):** `PreferencesPage` keeps a separate `speechRateInput` string state for the numeric field — committing (validating + saving) on blur rather than on every keystroke, since firing a network request per digit typed would be poor UX and inconsistent with the calm, deliberate "instant-apply per control" pattern the other five controls follow. Each `saveField()` call does an optimistic local update first, then reverts that one field (and only that field) if the save fails, with a per-field inline error — verified via a dedicated test that the other controls' displayed values are untouched by one field's failure.
- **Real bug found via test failures (not live testing this time):** the page's `Form.Field`/`Form.Control` usage (for the `speechRate` input and the two `<select>`s) requires a Radix `Form.Root` ancestor — omitted at first since there's no single submit button on a page where every control auto-saves independently. Wrapped the whole control set in a `Form.Root` with a `preventDefault`-only `onSubmit` (there's nothing to actually submit) rather than dropping `Form.Field` in favor of raw HTML, keeping the same Radix-Form-based pattern every other form field in the app already uses.
- **Test infrastructure fix:** jsdom has no `ResizeObserver`, which Radix's `Switch` reads internally — added a minimal no-op stub to `apps/web/tests/setup.ts` (global, not per-test, since any future control using Radix's `useSize` hook would hit the same gap).
- **Task 5 (full regression + live verification):** 329 tests green across the monorepo (config 14, shared-types 56, service-kernel 12, apps/web 90, gateway 36, core 121), `tsc --noEmit`/`eslint .` clean in every workspace. Applied the new migration to the live Postgres container and verified the complete preferences flow end-to-end via `curl` — confirmed defaults on first call, single- and multi-field partial updates each leaving unrelated fields untouched, and all three validation rejections returning the expected `VALIDATION_ERROR` envelope. All test data cleaned up from Postgres afterward.

### File List

**Task 1 (schema + shared contract):**
- `services/core/src/db/schema.ts` (updated — `learnerProfiles` gains 6 nullable preference columns)
- `services/core/drizzle/0003_superb_iceman.sql` (new — generated migration)
- `services/core/drizzle/meta/0003_snapshot.json` (new), `services/core/drizzle/meta/_journal.json` (updated)
- `packages/shared-types/src/preferences.ts` (new — `boardThemeSchema`, `explanationStyleSchema`, `learnerPreferencesSchema`, `DEFAULT_LEARNER_PREFERENCES`, `preferencesUpdateInputSchema`)
- `packages/shared-types/src/index.ts` (updated — barrel), `packages/shared-types/tests/preferences.test.ts` (new)

**Task 2 (core users module):**
- `services/core/src/modules/users/service.ts` (updated — `getPreferences`, `savePreferences`, `toLearnerPreferences`)
- `services/core/src/modules/users/routes.ts` (updated — `GET/PUT /users/preferences`)
- `services/core/tests/modules/users/preferences.test.ts` (new), `services/core/tests/modules/users/routes.test.ts` (updated)

**Task 3 (gateway proxy):**
- `services/gateway/src/authProxy.ts` (updated — two new authenticated routes)
- `services/gateway/tests/authProxy.test.ts` (updated)

**Task 4 (apps/web):**
- `apps/web/src/shared/Switch.tsx` (new), `apps/web/src/shared/index.ts` (updated — barrel), `apps/web/src/shared/components.css` (updated — `.usavvy-switch*` classes)
- `apps/web/src/modules/users/PreferencesPage.tsx` (new)
- `apps/web/src/modules/users/api.ts` (updated — `getPreferences`, `savePreferences`), `apps/web/src/modules/users/index.ts` (updated — barrel)
- `apps/web/src/app/App.tsx` (updated — `/preferences` route)
- `apps/web/tests/shared/Switch.test.tsx` (new)
- `apps/web/tests/modules/users/PreferencesPage.test.tsx` (new)
- `apps/web/tests/modules/users/api.test.ts` (updated)
- `apps/web/tests/setup.ts` (updated — `ResizeObserver` stub for jsdom)

**Task 5 (sprint tracking):**
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (updated — Story 1.4 → `review`)
