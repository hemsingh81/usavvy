---
baseline_commit: 3fcc81c
---

# Story 1.5: Profile Page

Status: ready-for-dev

*(Epic 1, FR-A-5. Per the Implementation Readiness Report's own Major finding — "Epic 1: Stories 1.1/1.4/1.5/1.7 assert behavior owned by later epics" — this story's epics.md AC bundles fields owned by services that don't exist yet in Epic 1: `stars`/`streak`/`Badge` are `engagement` module entities (AD-14's ownership table: `Note, StarTransaction, Badge, Streak | engagement`), `engagement/` is only "scaffolded when its epic starts" (Epic 5) per the architecture spine's own source tree; in-progress/completed courses need `courses`/`plans-progress` (Epic 2/Epic 4); certificates are Epic 5 Story 5.5. "Privacy toggles" is itself the entirety of the next story, Story 1.6 (FR-A-6, with its own specific default values) — not a field this story should half-implement ahead of it. Following the exact precedent Story 1.3 set for its own "Recommended Courses… out of scope, does not block" carve-out, and Story 1.8's rescoping in epics.md itself: this story builds the Profile page **shell** with the one piece of identity data Epic 1 actually owns — display name (new) plus a generated, non-photographic avatar — and renders explicit, clearly-labeled placeholder states for everything else, wired up incrementally as each owning story/epic ships. It does not block on, and does not fabricate data for, systems that don't exist yet.)*

## Story

As a learner,
I want a profile page showing my progress and achievements,
so that I can see my learning identity at a glance.

## Acceptance Criteria

1. **Given** a logged-in learner opens their profile **Then** they see: an **avatar** (generated deterministically from their display name/email initials — no photo-upload feature exists anywhere in Epic 1's backlog, and `DESIGN.md` has an explicit, deliberate rule that the product's own "Avatar" concept is "never a photorealistic or cartoon face" (§ Avatar Presence Indicator, "Don't render a photorealistic or cartoon face/avatar anywhere — this was a deliberate product decision (§19.1), not a placeholder waiting for a 'real' avatar later"); a generated initials mark is the only interpretation consistent with that rule and with there being no upload/storage/moderation infrastructure in this epic), their **display name** (editable inline; a fresh account with none set yet falls back to displaying the local-part of their email, e.g. `jane` from `jane@example.com`, not a blank/broken UI), and their **member-since** date
2. **Given** the same learner **Then** they also see explicitly-labeled **placeholder sections** — not fabricated data — for: stars, streak, in-progress/completed courses, and certificates (each captioned with which future story/epic will populate it: engagement — Epic 5; courses — Epic 2/Epic 4), and a **privacy** section captioned that it will become the real controls once Story 1.6 (the next story in the backlog, sequenced immediately after this one) ships
3. **Given** a learner edits their display name and it saves successfully **Then** the page reflects the new value immediately, with no full-page reload — the AC's "see... display name" implies a working page, and a page that renders an uneditable dead-end text field for the one field this story genuinely owns would fail the create-story workflow's own "must leave the system working end-to-end" standard even though epics.md's AC doesn't spell out an edit flow explicitly
4. **Given** a learner submits an empty or over-length display name **Then** the save is rejected with a specific inline validation error (AD-17 — no silent failures), and the previously-saved value remains displayed (no destructive optimistic clobber)

## Tasks / Subtasks

- [x] **Task 1: `users` table gains `displayName` + shared contract** (AC: #1, #3, #4)
  - [x] Add one nullable column to the existing `users` table in `services/core/src/db/schema.ts` (not `learnerProfiles` — this is account identity, the same table `email`/`role` already live on, not a learning-specific attribute): `displayName: text("display_name")`. Null means "never set" (falls back to the email's local-part at the response-mapping layer — same "derive, don't snapshot" philosophy `deriveAgeFields` already uses, so a later story changing the fallback rule needs no backfill migration)
  - [x] In `packages/shared-types` (new file `profile.ts`): `displayNameSchema` (`z.string().trim().min(1).max(60)` — a product judgment call; no AC/NFR specifies a bound, chosen consistent with `goal`'s 500/`interests`' 100 established precedent of always bounding free text), `updateDisplayNameInputSchema` (`z.object({ displayName: displayNameSchema })`)
  - [x] Extend the **existing** `meResponseSchema` in `packages/shared-types/src/auth.ts` with two new fields — **do not** create a parallel "profile response" type for identity data that already flows through `/me`: `displayName: z.string()` (always a real string — the fallback-to-email-local-part is applied server-side before this ever reaches the client, so the frontend never has to duplicate that logic) and `memberSince: z.string()` (ISO 8601 `createdAt`, per the Consistency Conventions' "all timestamps ISO 8601 UTC"). This mirrors Story 1.4's own explicit reasoning for what belongs on `/me` ("flat booleans/enums" — `isMinor`, `onboardingComplete` — belong there; only a "growing, nested shape" like preferences warranted a dedicated endpoint). `displayName`/`memberSince` are exactly the flat-field case
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 2: `services/core`'s `users` module — profile endpoints** (AC: #1, #3, #4)
  - [x] Extend `getMe()` in `services/core/src/modules/users/service.ts`: add `displayName: user.displayName ?? user.email.split("@")[0]` and `memberSince: user.createdAt.toISOString()` to the returned object. `user.email.split("@")[0]` is safe without a bounds check — `email` is already validated non-empty at signup, so it always contains at least one character before any `@`
  - [x] New `updateDisplayName(db, userId, input: UpdateDisplayNameInput): Promise<MeResponse>` — validate via the shared schema at the route layer (Task 2's next bullet), `UPDATE users SET display_name = ..., updated_at = now(), version = version + 1 WHERE id = ...`, then return the same shape `getMe()` returns (re-fetch or reuse the update's `.returning()` row — developer's call) so the frontend can treat "save display name" and "load profile" as the same response contract, avoiding a second, subtly-different shape. **No CAS/step-order check needed** — same reasoning Story 1.4's `savePreferences` already established for a freely re-editable field with no ordering invariant
  - [x] New route `PUT /users/display-name` — **authenticated** via the existing `requireTrustedUser()` (this is its 7th/8th use point; keep reusing it, don't reintroduce a copy)
  - [x] Do **not** create a `GET /users/profile` endpoint — `GET /me` already carries every field Task 1 adds; a second endpoint returning an overlapping shape would be exactly the "second, divergent copy of data" AD-14/AD-13's module-boundary reasoning warns against elsewhere in this same architecture doc

- [x] **Task 3: `services/gateway` — proxy the new route** (AC: #3, #4)
  - [x] `PUT /users/display-name` → authenticated, same `requireAuth` `preHandler` + trusted-header forwarding pattern already used for every other `users/*` route in `authProxy.ts`
  - [x] `GET /me` already proxied since Story 1.1 — no gateway change needed for the extended response fields, since gateway does no response-shape validation of its own (validation lives at core's route layer per the established convention)

- [ ] **Task 4: `apps/web` — profile page** (AC: #1, #2, #3, #4)
  - [ ] New shared primitive `apps/web/src/shared/Avatar.tsx` — pure presentational, no new dependency: takes a `label: string` (the display name or email), renders a circle containing its first 1-2 initials (uppercased) on a background color deterministically derived from a simple string hash of `label` (so the same learner always sees the same color — no randomness, no external avatar service, no image upload/storage). Not modeled on `DESIGN.md`'s "Avatar Presence Indicator" token (that's the AI tutor's waveform mark on the Board, a different concept entirely) — this is a conventional profile-identity avatar, styled from the generic color tokens already in `components.css`, same as Story 1.3/1.4 did for their own unmatched-by-any-design-token controls
  - [ ] New route `/profile` (protected — no session → redirect to `/login`, same pattern as every other authenticated page). `ProfilePage.tsx` in `apps/web/src/modules/users/`: on mount, `getMe(accessToken)` (reuse `useAuth`'s existing `getMe` — the same call `HomePage`/`LoginPage`/`SignUpPage`/`VerifyEmailPage` already make; do **not** add a duplicate `/me` wrapper to `users/api.ts`, which currently only wraps `/users/*` routes)
  - [ ] Render the `Avatar` (labelled with `displayName`), the display name using the **existing shared `TextField` primitive** (`apps/web/src/shared/index.ts`) — do not hand-roll a new input, the exact mistake Story 1.4's own code review caught and patched for `speechRate` — with the same interaction shape as `PreferencesPage`'s `speechRate` field: local text state, commit via `PUT /users/display-name` on blur only if the (trimmed) value actually changed, optimistic update reverted with `TextField`'s `serverError` prop on a `400`/`VALIDATION_ERROR` failure, restoring the previously-displayed value — not a destructive clobber. And the member-since date formatted for display (`toLocaleDateString()`-equivalent — this is a read-only date, not a form input, so none of `AgeDeclarationPage`'s birthdate-parsing concerns apply)
  - [ ] Render four explicitly-labeled placeholder sections — **static text, no API calls, no fabricated numbers** — for stars, streak, courses, and certificates (e.g. "Stars & streaks will appear here once Epic 5 ships", "Courses in progress and completed will appear here once the catalog (Epic 2) and progress tracking (Epic 4) ship"), and one placeholder section for privacy captioned that real controls arrive with Story 1.6
  - [ ] A failed display-name save surfaces a small inline error (AD-17) without discarding the avatar/member-since data already successfully loaded

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8)
  - [ ] `services/core/tests/modules/users/service.test.ts` — `getMe` returns the email's local-part as `displayName` before any value is set, and the actual stored value after `updateDisplayName` is called; `memberSince` matches the user's `createdAt`; `updateDisplayName` updates only `displayName` (leaves every other `users` column untouched); rejects an empty string and an over-60-character string
  - [ ] `services/core/tests/modules/users/routes.test.ts` — `PUT /users/display-name` requires authentication (401 with no trusted headers); rejects invalid input with `VALIDATION_ERROR`; a valid request returns the updated `displayName` in the response body
  - [ ] `services/gateway/tests/authProxy.test.ts` — the new proxy route requires auth (401 with no token)
  - [ ] `apps/web/tests/shared/Avatar.test.tsx` (new) — renders the expected initials for a given label; the same label always produces the same rendered color/initials across two separate renders (determinism, not a snapshot of the literal color value which is an implementation detail)
  - [ ] `apps/web/tests/modules/users/ProfilePage.test.tsx` (new) — loads and displays `displayName`/`memberSince`/avatar initials from `getMe`; editing the display name and blurring fires `PUT /users/display-name` with the new value and updates the displayed value on success; a failed save reverts to the previous value and shows an inline error; all five placeholder sections render their static captions and make no additional network calls beyond the initial `GET /me`

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `displayName` extends `users`, already owned by `core` — no new entity, no new table, no new service. Stars/streak/badges/certificates genuinely belong to `engagement` (not yet scaffolded — Epic 5); courses/progress belong to `courses`/`plans-progress` (Epic 2/Epic 4). This story must not create shadow copies of those entities inside `core` just to have something to display.
- **AD-13 (module boundaries):** all new `core` code lives in the existing `modules/users/` folder (no new module) — `displayName` is a `users`-table concern, following `email`/`role`'s existing home rather than `learnerProfiles` (which Story 1.3 established as the learning-specific entity).
- **AD-7 (RBAC):** no new role/permission — every role manages their own profile, same reasoning as every prior `users/*` route.
- **AD-17 (no silent failures):** an invalid display name resolves to a specific `VALIDATION_ERROR`; a failed save on the frontend surfaces inline rather than silently discarding the edit or the rest of the page's already-loaded data.
- **AD-8 (test mirroring):** see Task 5.
- **Consistency Conventions:** the `displayName` write bumps `users.updatedAt`/`version`, same discipline as every other write to this table.

### Previous story intelligence (Stories 1.1–1.4 — read before starting, don't rediscover these)

- **Reuse, don't reinvent:** `requireTrustedUser()` (`services/core/src/modules/users/routes.ts`) for the new route. `useAuth()`'s existing `getMe` (`apps/web/src/modules/auth/useAuth.tsx`) for loading profile data on the frontend — **do not** add a second `/me`-calling wrapper into `users/api.ts`, which is scoped to `/users/*` routes only; `getMe` already lives in the `auth` module and every other page (`HomePage`, `LoginPage`, `SignUpPage`, `VerifyEmailPage`) calls it the same way.
- **The email-local-part fallback must be computed server-side, once, in `getMe()`** — not duplicated client-side. Story 1.2's `calculateAge` duplication (client + server, documented as a deliberate, narrow exception) is not a pattern to repeat here; there's no reason this particular derivation can't live in exactly one place.
- **Story 1.4's own Dev Notes already settled the "does this belong on `/me`?" question**: flat fields (`isMinor`, `onboardingComplete`) belong on `/me`; a "growing, nested shape" (preferences) warranted a dedicated endpoint instead. `displayName`/`memberSince` are flat fields — extend `/me`, don't create `GET /users/profile`.
- **The inline-edit-on-blur interaction pattern already exists**: `PreferencesPage`'s `speechRate` field (local text state, commits on blur, reverts + shows an inline error on failure). Reuse that shape for `displayName` rather than inventing a new one (e.g. a separate "Edit"/"Save"/"Cancel" button flow that nothing else in the app currently uses).
- **Cancellation guards are mandatory on every mount-time fetch** — `HomePage`, `OnboardingWizardPage`, and `PreferencesPage` all needed one added during their own code reviews (a stale response landing after the session changed or the component unmounted). Build `ProfilePage`'s mount-time `getMe` call with the guard from the start, not as a follow-up fix.
- **`ResizeObserver` stub already exists globally** in `apps/web/tests/setup.ts` (added during Story 1.4's review for Radix `Switch`) — no new test-infrastructure gap expected here since `Avatar` is a plain `<div>`/`<span>`, not a Radix primitive.
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass. Commits must **not** include a `Co-Authored-By` trailer (standing instruction as of the Story 1.4 patch round).

### Scope note: what's explicitly OUT of scope for this story

- **Photo/image avatar upload** — no such feature exists anywhere in Epic 1's 11-story backlog, no file-storage adapter is wired for user-uploaded images (only `SeaweedFS`/AD-11 for course-content uploads, a completely different data path owned by a later epic), and `DESIGN.md` explicitly forbids a photorealistic/cartoon avatar as a deliberate product decision, not a gap. A generated initials mark is this story's complete, permanent answer for Epic 1 — not a stopgap awaiting a future upload story.
- **Stars, streaks, badges** (owned by `engagement`, Epic 5) and **in-progress/completed courses** (owned by `courses`/Epic 2 catalog existing at all, plus `plans-progress`/Epic 4 tracking progress against a plan) — none of these services or their underlying entities exist yet. This story renders honest, explicitly-labeled placeholder text for each, never a fabricated `0` or an empty list styled to look like real (but currently-always-empty) data.
- **Certificates** (Epic 5 Story 5.5, "generate shareable verifiable non-accredited completion certificate") — same reasoning as above.
- **Privacy toggles with real persisted state** — that is the entirety of Story 1.6 (FR-A-6), the very next story in `sprint-status.yaml`'s backlog order, with its own specific default values (public-leaderboard sharing OFF, cohort display-name ON, uploads-for-training OFF) that this story must not guess at or half-implement. This story renders a placeholder section captioned that Story 1.6 will populate it — Story 1.6's own dev-story pass is expected to replace that placeholder with real controls on this same page, not build a second page.
- **No nav entry point wired into any chrome** — no primary nav/profile-menu exists anywhere in the app yet (the same gap Stories 1.3/1.4 each documented for themselves: `/` is still a bare landing page with no links to `/onboarding` or `/preferences` either). `/profile` is directly reachable, matching every other page added so far; wiring real navigation chrome is not this story's job.
- **FR-A-9's app-wide color-theme picker** — a separate, later, SHOULD-priority requirement under Preferences, unrelated to this story's identity/placeholder content.

### API response shape

| Route | Success shape |
| --- | --- |
| `GET /me` (extended) | `200 { id, email, emailVerified, role, birthdate, isMinor, parentalConsentStatus, onboardingComplete, displayName: string, memberSince: string }` — `displayName` is always a real, non-null string (falls back to the email's local-part server-side); `memberSince` is `createdAt` as ISO 8601 |
| `PUT /users/display-name` | same extended shape as `GET /me`, reflecting the row after the write |
| any failure | `{ error: { code, message, details? } }` — `400` validation (empty or >60-char `displayName`), `401` unauthenticated |

### Validation rules

- **`displayName`:** trimmed, `1`–`60` characters (a product judgment call — no AC/NFR specifies an exact bound; chosen shorter than `goal`'s 500 or `interests`' 100 since a display name is conventionally short, and long enough for any real name/handle).

### Project Structure Notes

```text
services/core/
  src/
    db/
      schema.ts                              # updated — users gains displayName column
    modules/
      users/
        service.ts                            # updated — getMe extended, updateDisplayName
        routes.ts                             # updated — PUT /users/display-name
  tests/
    modules/users/service.test.ts             # updated
    modules/users/routes.test.ts              # updated

services/gateway/
  src/
    authProxy.ts                              # updated — one new authenticated route
  tests/
    authProxy.test.ts                         # updated

packages/shared-types/
  src/
    auth.ts                                   # updated — meResponseSchema gains displayName, memberSince
    profile.ts                                # new — displayNameSchema, updateDisplayNameInputSchema
    index.ts                                   # updated — barrel

apps/web/
  src/
    shared/
      Avatar.tsx                              # new — initials + deterministic color
      index.ts                                # updated — barrel
    modules/
      users/
        ProfilePage.tsx                       # new
        index.ts                               # updated — barrel
    app/
      App.tsx                                 # updated — new /profile route
  tests/
    shared/Avatar.test.tsx                    # new
    modules/users/ProfilePage.test.tsx        # new
```

### Testing requirements

- Backend profile tests are integration-style against the real Postgres container, matching every prior story's precedent.
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.5, Epic 1 intro, FR-A-5]
- [Source: `_AI-Agile-Development/planning-artifacts/implementation-readiness-report-2026-08-04.md` — Major finding on Epic 1 Stories 1.1/1.4/1.5/1.7 asserting behavior owned by later epics; the basis for this story's rescoping]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-7, AD-8, AD-13, AD-14 (ownership table: `Note, StarTransaction, Badge, Streak | engagement`; `engagement/` "scaffolded when its epic starts"), AD-17, Consistency Conventions]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — "Avatar Presence Indicator" component token and its explicit "Don't render a photorealistic or cartoon face/avatar anywhere — this was a deliberate product decision (§19.1)" rule, informing this story's generated-initials interpretation of "avatar"]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Information Architecture ("Engagement (stars/streaks/badges), Certificate | 5 | Profile"), confirming those fields are Epic 5-owned content surfaced on the Profile screen, not Epic 1 data]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-3-onboarding-wizard.md` — the "out of scope, does not block" rescoping precedent this story follows for stars/streak/courses/certificates]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-4-learner-preferences.md` — established `requireTrustedUser`/`ensureLearnerProfile`-style reuse discipline, the `/me` flat-field vs. dedicated-endpoint reasoning, the inline-edit-on-blur pattern (`speechRate`), the cancellation-guard requirement, and its own code-review findings this story should not re-introduce]

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-3, backend) — `users.displayName` (nullable text, fallback to the email's local-part computed in `getMe`), `meResponseSchema` extended with `displayName`/`memberSince`, `PUT /users/display-name` reusing `requireTrustedUser`, gateway proxy route. 133 `services/core` tests (up from 121), 38 `services/gateway` tests (up from 36), 64 `shared-types` tests (up from 56).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Tasks 1-3 (backend):** `updateDisplayName` takes `role` as an explicit parameter (not hardcoded) so its final `getMe()` re-fetch performs the same `can(role, "read", "self")` permission check as a direct `GET /me` call would for that same user — passing a hardcoded role here would have silently bypassed that check.

### File List

**Task 1 (schema + shared contract):**
- `services/core/src/db/schema.ts` (updated — `users` gains nullable `displayName` column)
- `services/core/drizzle/0005_same_stark_industries.sql` (new — generated migration), `services/core/drizzle/meta/0005_snapshot.json` (new), `services/core/drizzle/meta/_journal.json` (updated)
- `packages/shared-types/src/profile.ts` (new — `displayNameSchema`, `updateDisplayNameInputSchema`)
- `packages/shared-types/src/auth.ts` (updated — `meResponseSchema` gains `displayName`, `memberSince`)
- `packages/shared-types/src/index.ts` (updated — barrel)
- `packages/shared-types/tests/profile.test.ts` (new), `packages/shared-types/tests/auth.test.ts` (updated)

**Task 2 (core users module):**
- `services/core/src/modules/users/service.ts` (updated — `getMe` extended, `updateDisplayName`)
- `services/core/src/modules/users/routes.ts` (updated — `PUT /users/display-name`)
- `services/core/tests/modules/users/service.test.ts` (updated), `services/core/tests/modules/users/routes.test.ts` (updated)

**Task 3 (gateway proxy):**
- `services/gateway/src/authProxy.ts` (updated — one new authenticated route)
- `services/gateway/tests/authProxy.test.ts` (updated)
