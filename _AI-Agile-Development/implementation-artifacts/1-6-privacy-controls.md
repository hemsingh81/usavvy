---
baseline_commit: 2bafda0
---

# Story 1.6: Privacy Controls

Status: ready-for-dev

*(Epic 1, FR-A-6. Structurally near-identical to Story 1.4 (Preferences): three booleans nested inside the same `learnerProfiles` row per the PRD's own data model (§18: `User ──1:1── LearnerProfile (goal, level, availability, preferences, privacy flags)`), each with a real default from the start, freely re-editable at any time via a `GET`/`PUT`-with-computed-defaults pair — same shape, same reasoning, same "no CAS needed" conclusion Story 1.4 already established for exactly this kind of field. The one difference: these three controls render on the `ProfilePage` Story 1.5 already built, replacing the exact placeholder div Story 1.5 left for this story — `EXPERIENCE.md`'s IA map lists "Privacy" as its own profile-menu entry, but epics.md's own Story 1.5 AC places privacy toggles directly on the profile page and this project's established precedent is that epics.md is authoritative over the UX doc's navigation framing where they disagree (Stories 1.3/1.4 both used this same precedent) — so no new route is created.)*

## Story

As a learner,
I want privacy controls over my visibility,
so that I control what's shared about me.

## Acceptance Criteria

1. **Given** a learner views privacy settings **Then** defaults are: public-leaderboard sharing OFF, cohort display-name ON, uploads-for-training OFF — "views" means `GET /users/privacy-settings` always returns a fully-populated object (every field has a real boolean value, never `null`), matching Story 1.4's identical `GET /users/preferences` contract
2. **Given** they change any toggle **Then** the change saves and takes effect immediately — "takes effect" means persisted and correctly read back; there is no leaderboard (Epic 8), cohort (Epic 7), or training-data pipeline consuming these flags yet, so this story's scope ends at persisting and exposing them correctly, per the identical "buildable form" reasoning Story 1.4 used for its own not-yet-built downstream consumers

## Tasks / Subtasks

- [x] **Task 1: Extend `learnerProfiles` schema + shared privacy contract** (AC: #1)
  - [x] Add 3 nullable boolean columns to the existing `learnerProfiles` table in `services/core/src/db/schema.ts` (same row Stories 1.3/1.4/1.5 already extend — do **not** create a new table, per AD-14): `publicLeaderboardSharing`, `cohortDisplayName`, `uploadsForTraining`. Nullable, not defaulted at the DB level — defaults are computed at the service layer (next bullet), the identical "derive, don't snapshot" convention Story 1.4 established for `learnerPreferences`
  - [x] In `packages/shared-types` (new file `privacy.ts`, kept separate from `preferences.ts`/`profile.ts` — a distinct concern on the same row, matching how `preferences.ts` was kept separate from `users.ts`'s onboarding types): `learnerPrivacySettingsSchema` (`z.object({ publicLeaderboardSharing: z.boolean(), cohortDisplayName: z.boolean(), uploadsForTraining: z.boolean() })` — all 3 fields non-nullable, this is the response shape, always fully populated), `DEFAULT_PRIVACY_SETTINGS` (a `LearnerPrivacySettings` constant, the exact literal defaults FR-A-6 specifies: `{ publicLeaderboardSharing: false, cohortDisplayName: true, uploadsForTraining: false }` — unlike Story 1.4's `speechRate`/`boardTheme` defaults, these are not product judgment calls, they're the AC's own literal values), `privacySettingsUpdateInputSchema` (all 3 fields optional, `.refine()`d to reject an empty object — identical shape to `preferencesUpdateInputSchema`)
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 2: `services/core`'s `users` module — privacy-settings endpoints** (AC: #1, #2)
  - [x] `GET /users/privacy-settings` — **authenticated** (`requireTrustedUser()`, reused). Reuse `ensureLearnerProfile()` (Story 1.3) to load the row, then map each of the 3 columns through `value ?? DEFAULT_PRIVACY_SETTINGS[field]` — the response is **always** fully populated, identical contract shape to `getPreferences`
  - [x] `PUT /users/privacy-settings` `Partial<LearnerPrivacySettings>` (validated via `privacySettingsUpdateInputSchema`) — **authenticated**. Reuse `ensureLearnerProfile()`, `UPDATE` only the columns present in the request body (genuine partial update), bump `updatedAt`/`version`. Return the same fully-populated shape as `GET`. **No CAS/step-order check needed** — identical reasoning `savePreferences` already established: every privacy toggle is freely, repeatedly re-editable with no invariant a concurrent write could violate
  - [x] Do **not** touch `GET /me` or `meResponseSchema` — privacy settings are a nested, growing-shape concern living on `learnerProfiles`, not a flat field like Story 1.5's `displayName`; a dedicated endpoint matches Story 1.4's own `GET/PUT /users/preferences` precedent

- [x] **Task 3: `services/gateway` — proxy the two new routes** (AC: #1, #2)
  - [x] `GET /users/privacy-settings` and `PUT /users/privacy-settings` → both authenticated, identical `requireAuth` `preHandler` + trusted-header forwarding pattern as every other `users/*` route in `authProxy.ts`

- [ ] **Task 4: `apps/web` — wire real privacy controls into the existing `ProfilePage`** (AC: #1, #2)
  - [ ] **Do not create a new page or route.** `apps/web/src/modules/users/ProfilePage.tsx` currently renders a static placeholder div (`"Privacy controls will appear here once Story 1.6 ships."`, the last of four `.usavvy-profile-placeholder` divs) — replace **only that one div** with three real `Switch` controls (`apps/web/src/shared/Switch.tsx`, already built by Story 1.4 — reuse it, do not build a second toggle primitive). Leave the other three placeholder divs (stars/streak, courses, certificates) untouched — they remain genuinely out of this story's scope (Epic 5/Epic 2/Epic 4)
  - [ ] On mount, alongside the existing `getMe` call, also fetch `GET /users/privacy-settings` (via a new `getPrivacySettings`/`savePrivacySettings` pair added to `apps/web/src/modules/users/api.ts`'s `createUsersApi`, matching the existing `getPreferences`/`savePreferences` pattern exactly) — a second independent fetch, not bolted onto `me`'s response shape, since the two are genuinely different resources at different endpoints
  - [ ] Each `Switch` auto-saves independently on change — `PUT /users/privacy-settings` with just that one field, matching `PreferencesPage`'s established per-control auto-save pattern **exactly**, including its optimistic update + revert-on-failure + inline error behavior and its request-sequencing guard (`ProfilePage`'s own `displayName` save just added this exact guard during Story 1.5's code review — generalize it to a per-field request-id map, e.g. `useRef<Record<string, number>>({})`, so an in-flight `publicLeaderboardSharing` save can never be clobbered by a `cohortDisplayName` save's response or vice versa, and a field's own overlapping saves are sequenced correctly too)
  - [ ] A failed toggle save surfaces a small per-control inline error (AD-17) without discarding the other two controls' or the display-name field's current values

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8)
  - [ ] `services/core/tests/modules/users/service.test.ts` — `getPrivacySettings` returns `DEFAULT_PRIVACY_SETTINGS` verbatim before any write; a partial `savePrivacySettings` updates only the given field(s), leaving the rest at their previous (or still-default) values; rejects an empty update body
  - [ ] `services/core/tests/modules/users/routes.test.ts` — both routes require authentication (401 with no trusted headers); `GET` returns the exact 3-field default shape through the real route
  - [ ] `services/gateway/tests/authProxy.test.ts` — both new proxy routes require auth (401 with no token)
  - [ ] `packages/shared-types/tests/privacy.test.ts` (new) — `DEFAULT_PRIVACY_SETTINGS` is a valid `learnerPrivacySettingsSchema`; `privacySettingsUpdateInputSchema` accepts single/multi-field partial updates and rejects an empty body
  - [ ] `apps/web/tests/modules/users/ProfilePage.test.tsx` (updated) — loads and displays the fetched privacy settings as three switches with their correct on/off state; toggling one fires a partial `PUT /users/privacy-settings` with just that field and doesn't disturb the other two switches' or the display-name field's displayed values; a failed toggle save reverts and shows an inline error; a race between an in-flight privacy-field save and a display-name save (or between two different privacy fields) resolves correctly regardless of response order

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** the 3 new columns extend `learnerProfiles`, already owned by `core` — same table Stories 1.3/1.4/1.5 already extend, no new entity, no new service.
- **AD-7 (RBAC):** no new role/permission — every role manages their own privacy settings, identical reasoning to every prior `users/*` route.
- **AD-17 (no silent failures):** an empty update body resolves to a specific `VALIDATION_ERROR`; a failed per-control save on the frontend surfaces inline rather than disappearing.
- **AD-8 (test mirroring):** see Task 5.
- **AD-13 (module boundaries):** all new `core` code lives in the existing `modules/users/` folder (no new module).
- **Consistency Conventions:** every write bumps `learnerProfiles.updatedAt`/`version`, same discipline as every other write to this table.

### Previous story intelligence (Stories 1.3–1.5 — read before starting, don't rediscover these)

- **This story is Story 1.4 with 3 booleans instead of 6 mixed-type preferences.** Copy `getPreferences`/`savePreferences`/`toLearnerPreferences`'s exact shape in `services/core/src/modules/users/service.ts` for `getPrivacySettings`/`savePrivacySettings`/`toPrivacySettings`. Copy `preferences.ts`'s exact shape for the new `privacy.ts`. Copy `PreferencesPage`'s per-control auto-save pattern for the three new `Switch`es.
- **Reuse, don't reinvent:** `ensureLearnerProfile()`, `requireTrustedUser()`, the shared `Switch` primitive (`apps/web/src/shared/Switch.tsx`, Story 1.4), `useAuth`'s `getMe` (already used by `ProfilePage`).
- **`ProfilePage.tsx`'s exact current placeholder line to replace** (`apps/web/src/modules/users/ProfilePage.tsx`, near the end of the render): `<div className="usavvy-profile-placeholder">Privacy controls will appear here once Story 1.6 ships.</div>` — this is the only line Task 4 removes; the other three `.usavvy-profile-placeholder` divs (stars/streak, courses, certificates) stay exactly as Story 1.5 left them.
- **The request-sequencing race-guard pattern to generalize**: `ProfilePage`'s `handleDisplayNameBlur` (added during Story 1.5's own code review, after Blind Hunter and Edge Case Hunter independently found the exact same race) uses a single `useRef(0)` counter because there was only one editable field. With four independently-saving controls now on the same page (`displayName` + 3 privacy toggles), a single shared counter would be wrong — one field's save could invalidate another field's in-flight save's request id even though they don't actually conflict. Use a `Record<string, number>` (or per-field `useRef`s) keyed by field name instead, mirroring how `PreferencesPage`'s optimistic-update fix (Story 1.4's own review) merges only the one changed field into state rather than replacing the whole object.
- **Story 1.4's own code review found and fixed the identical optimistic-update race** for its 6-field preferences page — the fix (merge only the corresponding field from the response, never replace the whole object) applies identically here across `displayName` + the 3 new privacy fields, all living in the same `ProfilePage` component's state.
- **`DEFAULT_PRIVACY_SETTINGS`'s values are not a developer judgment call** — they are FR-A-6's own literal, explicit defaults (public-leaderboard OFF, cohort display-name ON, uploads-for-training OFF). Do not invent different defaults the way Story 1.4 had to for `speechRate`/`boardTheme` (which had no AC-specified defaults).
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass. Commits must **not** include a `Co-Authored-By` trailer (standing instruction as of the Story 1.4 patch round).

### Scope note: what's explicitly OUT of scope for this story

- **No leaderboard, cohort, or training-data-consumption logic** — Epic 8 (leaderboards), Epic 7 (cohorts), and any ML/training pipeline don't exist yet. This story ends at correctly persisting and exposing the three flags, per AC #2's own "buildable form" scope, matching Story 1.4's identical reasoning for its own not-yet-consumed preferences.
- **No new page, route, or nav entry** — the three toggles are added to the existing `/profile` route Story 1.5 built. `EXPERIENCE.md`'s "Privacy" profile-menu entry is a navigation-IA detail, not a routing requirement; no nav chrome exists anywhere in the app yet regardless (the same gap every prior Epic 1 story has documented for itself).
- **Epic 8 Story 8.5** ("self-hide from all leaderboards without losing stars or badges") is a distinct, later, more specific control than this story's `publicLeaderboardSharing` toggle — do not conflate the two or try to anticipate Epic 8's exact data shape here.

### API response shape

| Route | Success shape |
| --- | --- |
| `GET /users/privacy-settings` | `200 { publicLeaderboardSharing: boolean, cohortDisplayName: boolean, uploadsForTraining: boolean }` (always fully populated) |
| `PUT /users/privacy-settings` | same shape as `GET`, reflecting the row after the (partial) write |
| any failure | `{ error: { code, message, details? } }` — `400` validation (empty body), `401` unauthenticated |

### Project Structure Notes

```text
services/core/
  src/
    db/
      schema.ts                              # updated — learnerProfiles gains 3 privacy columns
    modules/
      users/
        service.ts                            # updated — getPrivacySettings, savePrivacySettings, toPrivacySettings
        routes.ts                             # updated — GET/PUT /users/privacy-settings
  tests/
    modules/users/service.test.ts             # updated
    modules/users/routes.test.ts              # updated

services/gateway/
  src/
    authProxy.ts                              # updated — two new authenticated routes
  tests/
    authProxy.test.ts                         # updated

packages/shared-types/
  src/
    privacy.ts                                # new — learnerPrivacySettingsSchema, DEFAULT_PRIVACY_SETTINGS, privacySettingsUpdateInputSchema
    index.ts                                   # updated — barrel
  tests/
    privacy.test.ts                           # new

apps/web/
  src/
    modules/
      users/
        ProfilePage.tsx                       # updated — real Switch controls replace the privacy placeholder
        api.ts                                 # updated — getPrivacySettings, savePrivacySettings
  tests/
    modules/users/ProfilePage.test.tsx        # updated
```

### Testing requirements

- Backend privacy-settings tests are integration-style against the real Postgres container, matching every prior story's precedent.
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.6, Epic 1 intro, FR-A-6, FR-A-5 (Story 1.5's AC placing privacy toggles on the profile page), Epic 8 Story 8.5 (the distinct later leaderboard-hide control)]
- [Source: `Doc/00-Requirement.md` §18 — data model nesting privacy flags inside `LearnerProfile`]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — Information Architecture listing "Privacy" as its own profile-menu entry (navigation framing only, does not override epics.md's routing)]
- [Source: `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` — AD-7, AD-8, AD-13, AD-14, AD-17, Consistency Conventions]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-4-learner-preferences.md` — the exact `GET`/`PUT`-with-computed-defaults pattern, the optimistic-update race and its merge-only-the-changed-field fix, the `Switch` primitive]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-5-profile-page.md` — `ProfilePage`'s current structure, the exact placeholder div this story replaces, the request-sequencing race-guard pattern to generalize to multiple fields]

## Dev Agent Record

## Change Log

- 2026-08-05: Checkpoint 1 (Tasks 1-3, backend) — 3 nullable privacy columns on `learnerProfiles`, `GET`/`PUT /users/privacy-settings` reusing `ensureLearnerProfile`/`requireTrustedUser`, gateway proxy routes. 144 `services/core` tests (up from 133), 42 `services/gateway` tests (up from 38), 71 `shared-types` tests (up from 64).

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

- **Tasks 1-3 (backend):** near-identical copy of Story 1.4's `getPreferences`/`savePreferences` shape — `toPrivacySettings` maps each nullable column through `?? DEFAULT_PRIVACY_SETTINGS[field]`, and `savePrivacySettings` spreads the validated partial input directly into Drizzle's `.set()`, same as `savePreferences`.

### File List

**Task 1 (schema + shared contract):**
- `services/core/src/db/schema.ts` (updated — `learnerProfiles` gains 3 nullable privacy columns)
- `services/core/drizzle/0006_furry_azazel.sql` (new — generated migration), `services/core/drizzle/meta/0006_snapshot.json` (new), `services/core/drizzle/meta/_journal.json` (updated)
- `packages/shared-types/src/privacy.ts` (new — `learnerPrivacySettingsSchema`, `DEFAULT_PRIVACY_SETTINGS`, `privacySettingsUpdateInputSchema`)
- `packages/shared-types/src/index.ts` (updated — barrel), `packages/shared-types/tests/privacy.test.ts` (new)

**Task 2 (core users module):**
- `services/core/src/modules/users/service.ts` (updated — `getPrivacySettings`, `savePrivacySettings`, `toPrivacySettings`)
- `services/core/src/modules/users/routes.ts` (updated — `GET/PUT /users/privacy-settings`)
- `services/core/tests/modules/users/service.test.ts` (updated), `services/core/tests/modules/users/routes.test.ts` (updated)

**Task 3 (gateway proxy):**
- `services/gateway/src/authProxy.ts` (updated — two new authenticated routes)
- `services/gateway/tests/authProxy.test.ts` (updated)
