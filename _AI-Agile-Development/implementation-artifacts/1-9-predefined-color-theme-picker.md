---
baseline_commit: 6e2ca55
---

# Story 1.9: Predefined Color Theme Picker

Status: ready-for-dev

*(Epic 1, FR-A-9. "Added post-launch-readiness at user request" per epics.md's own note — a small, well-specified addition, not a rescoped/ambiguous one like Stories 1.5/1.7/1.8. `DESIGN.md`'s own "Theme Presets (FR-A-9)" section gives the exact four presets and their exact hex values, so there is no design ambiguity to resolve here, unlike prior stories. The one real technical question this story answers is *mechanism*: how does "the app chrome re-renders in that theme immediately, with no page reload" actually happen, given nothing in this codebase currently varies any color token at runtime. This story adds that mechanism (a `data-color-theme` attribute on `<html>`, driven by CSS custom-property overrides already established in `tokens.css`) rather than inventing a new one.)*

## Story

As a learner,
I want to pick from a small set of predefined color themes,
so that the app looks and feels the way I prefer.

## Acceptance Criteria

1. **Given** a learner opens the theme picker in Preferences **When** they select one of the four predefined themes (Indigo Focus, Midnight, High Contrast, Warm Paper — exact hex values per `DESIGN.md`'s "Theme Presets (FR-A-9)" table) **Then** the app chrome re-renders in that theme immediately, with no page reload, and the choice is saved to their Learner Profile
2. **Given** a learner who previously selected a non-default theme **When** they load the app again (any page, not just Preferences) **Then** their chosen theme is applied on load, not just while they're on the Preferences page

## Tasks / Subtasks

- [x] **Task 1: Shared contract — `colorTheme` joins the existing preferences shape** (AC: #1)
  - [x] **This is a new field on the existing `learnerPreferencesSchema`/`GET|PUT /users/preferences` resource (Story 1.4) — do not create a new table, endpoint, or dedicated resource.** `colorTheme` is semantically a preference exactly like `boardTheme`/`explanationStyle`; the only reason it's a separate story is that it was added later, not because it's a different domain concept. Story 1.4's own Dev Notes explicitly warn against conflating `boardTheme` (the Board's own dark/paper toggle, DC-3) with this app-wide color theme — they remain two independent fields, both living on the same `learnerProfiles` row and the same preferences resource
  - [x] In `packages/shared-types/src/preferences.ts`: `colorThemeSchema` (`z.enum(["indigo-focus", "midnight", "high-contrast", "warm-paper"])`), add `colorTheme: colorThemeSchema` to `learnerPreferencesSchema`, add `colorTheme: "indigo-focus"` to `DEFAULT_LEARNER_PREFERENCES` (the one preset `DESIGN.md` itself calls "the default"), add `colorTheme: colorThemeSchema.optional()` to `preferencesUpdateInputSchema`
  - [x] Export `type ColorTheme = z.infer<typeof colorThemeSchema>` alongside the existing `BoardTheme`/`ExplanationStyle` type exports in the same file

- [x] **Task 2: `services/core` — extend the existing preferences columns + mapper** (AC: #1)
  - [x] Add one nullable column to the existing `learnerProfiles` table in `services/core/src/db/schema.ts` (same table Story 1.4's other 6 preference columns live on): `colorTheme: text("color_theme").$type<ColorTheme>()`. Nullable, not defaulted at the DB level — same "derive, don't snapshot" convention every other preference column here already uses
  - [x] Update `toLearnerPreferences()` in `services/core/src/modules/users/service.ts` to add `colorTheme: row.colorTheme ?? DEFAULT_LEARNER_PREFERENCES.colorTheme` — this is the **only** code change needed in `service.ts`; `getPreferences`/`savePreferences`/the routes are already fully generic over whatever fields `LearnerPreferences`/`PreferencesUpdateInput` contain, so they need **no changes** for a 7th field
  - [x] Generate + apply the migration (`pnpm --filter @usavvy/core db:generate` then `db:migrate`) — do not hand-write SQL

- [x] **Task 3: `services/gateway`** (AC: #1)
  - [x] **No changes needed.** `GET`/`PUT /users/preferences` are already proxied (Story 1.4); the gateway proxy layer is content-agnostic to which fields the JSON body contains

- [ ] **Task 4: `apps/web` — the actual theming mechanism** (AC: #1, #2)
  - [ ] `apps/web/src/shared/tokens.css`: the existing `:root` block's 5 color values (`--color-primary`, `--color-secondary`, `--color-background`, `--color-surface`, `--color-on-surface`) already *are* the Indigo Focus preset (verified against `DESIGN.md`'s table — they match exactly). Add three sibling override blocks, each scoped to a `data-color-theme` attribute on the root element, each overriding only those same 5 variables to the other three presets' exact hex values from `DESIGN.md`'s table (`:root[data-color-theme="midnight"] { --color-primary: #A5B4FC; --color-secondary: #5EEAD4; --color-background: #14123B; --color-surface: #1E1B4B; --color-on-surface: #E8E7FF; }`, and correspondingly for `high-contrast`/`warm-paper`). **Every other token (`accent`, `error`/`warning`/`success` and their container pairs, every Board-specific token) stays constant across presets** — `DESIGN.md` is explicit that those carry semantic meaning that must never shift with cosmetic preference; do not touch them
  - [ ] **Also add a base rule applying these tokens where nothing currently does**: today, no CSS rule anywhere in this codebase sets the page's actual background/text color from `--color-background`/`--color-on-surface` — verified by grep, only two narrow component-specific uses exist. Without a base rule, switching presets would have zero visible effect and this story's own AC would be silently unsatisfiable. Add to `tokens.css`: `body { background: var(--color-background); color: var(--color-on-surface); font-family: var(--font-family); }`. This is a necessary, in-scope fix for the feature to actually work end-to-end (the create-story workflow's own standing rule: a behavior required for the feature to function is a requirement whether or not the story text spells it out), not scope creep
  - [ ] New `apps/web/src/app/ColorThemeProvider.tsx`: a React context provider (mirroring `AuthProvider`'s existing shape) exposing `useColorTheme(): { setColorTheme: (theme: ColorTheme) => void }`. `setColorTheme` sets local state and, via a `useEffect` keyed on that state, sets `document.documentElement.dataset.colorTheme = theme`. On mount, if a session exists, fetch `getPreferences` once and call `setColorTheme(result.colorTheme)` — this is what satisfies AC #2 ("applied on load, not just while on Preferences"). Guard this mount-time fetch with the same cancellation pattern every other page's mount-time fetch already uses
  - [ ] Wire `ColorThemeProvider` into `apps/web/src/app/App.tsx`, nested **inside** `AuthProvider` (it needs `useAuth()`'s session) and **outside** `BrowserRouter` (it's session-scoped, not route-scoped): `<AuthProvider><ColorThemeProvider><BrowserRouter>...</BrowserRouter></ColorThemeProvider></AuthProvider>`
  - [ ] In `apps/web/src/modules/users/PreferencesPage.tsx`: add a theme-picker control rendering the 4 presets as swatches/buttons (labelled "Indigo Focus", "Midnight", "High Contrast", "Warm Paper"), each `onClick` calling the **existing, unmodified** `saveField("colorTheme", theme)` — identical shape to every other control on this page, no new save/error/revert logic needed. Add one `useEffect(() => { setColorTheme(preferences.colorTheme); }, [preferences.colorTheme])` (from `useColorTheme()`) — this is the entire mechanism for "instant, no-reload apply" **and** "revert to the old theme if the save fails": `saveField` already optimistically sets `preferences.colorTheme` and reverts it on failure (Story 1.4's own established pattern), so mirroring the DOM to that same state via this one effect handles both cases with no special-casing for this one field
  - [ ] Selected-state styling and swatch shape follow `DESIGN.md`'s own `theme-picker` component token (`selected-indicator: accent`, `swatch-radius: rounded-full`) — a small new `.usavvy-theme-swatch`/`.usavvy-theme-swatch--selected` class pair in `components.css`, the first component in this codebase with an actual matching design token to follow (unlike `Switch`/`Avatar`, which had none)

- [ ] **Task 5: Tests mirroring `src/` 1:1** (AD-8)
  - [ ] `packages/shared-types/tests/preferences.test.ts` (existing — extend) — `DEFAULT_LEARNER_PREFERENCES` includes `colorTheme: "indigo-focus"` and is still a valid `learnerPreferencesSchema`; `learnerPreferencesSchema` rejects an invalid `colorTheme` value; `preferencesUpdateInputSchema` accepts a `colorTheme`-only partial update and rejects an invalid value
  - [ ] `services/core/tests/modules/users/service.test.ts` (existing — extend) — `getPreferences` returns `colorTheme: "indigo-focus"` by default; `savePreferences` persists a new `colorTheme` value, leaving the other 6 preference fields untouched
  - [ ] `services/core/tests/modules/users/routes.test.ts` (existing — extend) — the existing "returns the default preferences" test's full-object assertion now includes `colorTheme`; a new test confirms `PUT /users/preferences` rejects an unrecognized `colorTheme` value through the real route
  - [ ] `apps/web/tests/app/ColorThemeProvider.test.tsx` (new) — applies the fetched `colorTheme` as `document.documentElement.dataset.colorTheme` once a session exists; `setColorTheme` updates the DOM attribute directly; a mount-time fetch failure doesn't crash the app (silently keeps the default, matching this being non-critical enrichment like `HomePage`'s own `getMe` call)
  - [ ] `apps/web/tests/modules/users/PreferencesPage.test.tsx` (existing — extend) — renders all four theme swatches; clicking one fires the identical partial-`PUT`-with-just-that-field pattern every other control already has; on success, `document.documentElement.dataset.colorTheme` reflects the new value (proving the `useEffect`-mirrors-`preferences.colorTheme` mechanism); on a failed save, the DOM attribute reverts back to the previous theme alongside the existing inline-error behavior

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-14 (ownership):** `colorTheme` extends `learnerProfiles`, already owned by `core` — same table, same resource, no new entity.
- **AD-7 (RBAC):** no new role/permission — identical reasoning to every other preferences field.
- **AD-17 (no silent failures):** an invalid `colorTheme` value resolves to a specific `VALIDATION_ERROR`; a failed theme save surfaces the existing per-control inline error, and now also visibly reverts the DOM to the previous theme (not just the underlying state) so the display never silently disagrees with what's actually persisted.
- **AD-8 (test mirroring):** see Task 5.
- **Consistency Conventions:** the write bumps `learnerProfiles.updatedAt`/`version`, automatically, since it goes through the existing generic `savePreferences`.

### Previous story intelligence (Story 1.4 — read before starting, don't rediscover this)

- **`savePreferences`/`getPreferences`/the preferences routes are already fully generic** over the fields in `LearnerPreferences`/`PreferencesUpdateInput` — adding `colorTheme` to the shared-types schemas and the DB row mapper is sufficient; do not add any `colorTheme`-specific branches to `service.ts` or `routes.ts` beyond the one line in `toLearnerPreferences`.
- **`PreferencesPage`'s `saveField` already does optimistic-update-with-merge-only-the-changed-field, revert-on-failure, and per-control inline errors** (Story 1.4's own code-review fix) — reuse it exactly as-is for the theme swatches; do not write a second save path.
- **`PreferencesPage`'s `saveField` does *not* have `ProfilePage`'s later per-field request-sequencing guard** (`requestIdRef`, added during Stories 1.5-1.7's reviews to a *different* page). This story does not backport that guard here — doing so would be fixing a pre-existing, out-of-scope gap under cover of an unrelated story. Follow `PreferencesPage`'s own existing pattern exactly as it stands today, for consistency with this page's other 6 controls.
- **Do not conflate `colorTheme` with `boardTheme`.** `boardTheme` (`"dark" | "paper"`) is the Board's own toggle (DC-3), already built, and stays completely independent — both fields end up on the same `preferences` object but control different things, exactly as `EXPERIENCE.md` describes.
- **`ResizeObserver` stub already exists globally** in `apps/web/tests/setup.ts` — no new test-infrastructure gap expected (theme swatches are plain buttons, not a new Radix primitive).
- **Git workflow convention carries forward:** commit at each logical checkpoint once its tests pass. Commits must **not** include a `Co-Authored-By` trailer.

### Scope note: what's explicitly OUT of scope for this story

- **Any change to the Board's own dark/paper toggle (`boardTheme`, DC-3).** Fully independent, untouched.
- **Persisting or applying the theme for a logged-out visitor.** A logged-out user sees the default Indigo Focus (`:root`'s own values, no `data-color-theme` attribute set) — there is no profile to read a preference from.
- **Any new design token beyond the 5 `DESIGN.md` already names as preset-varying** (`primary`, `secondary`, `background`, `surface`, `on-surface`). `accent`/`error`/`warning`/`success`/Board-specific tokens are explicitly constant across presets per `DESIGN.md` — do not vary them.
- **Backporting `ProfilePage`'s per-field request-sequencing guard to `PreferencesPage`.** See Previous Story Intelligence above — a deliberate consistency choice, not an oversight.
- **A live/animated theme-transition effect.** No AC/NFR asks for one; an instant, immediate re-render (a plain CSS custom-property change) is exactly what AC #1 specifies ("re-renders... immediately").

### API response shape (unchanged endpoint, one new field)

| Route | Success shape |
| --- | --- |
| `GET /users/preferences` | `200 { voiceEnabled, speechRate, boardTheme, explanationStyle, captionsEnabled, reducedMotion, colorTheme: "indigo-focus" \| "midnight" \| "high-contrast" \| "warm-paper" }` |
| `PUT /users/preferences` | same shape, reflecting the row after the (partial) write |
| any failure | `{ error: { code, message, details? } }` — `400` validation (unrecognized `colorTheme`), `401` unauthenticated |

### Project Structure Notes

```text
packages/shared-types/
  src/
    preferences.ts                          # updated — colorThemeSchema, LearnerPreferences gains colorTheme
  tests/
    preferences.test.ts                     # updated

services/core/
  src/
    db/
      schema.ts                              # updated — learnerProfiles gains colorTheme column
    modules/
      users/
        service.ts                            # updated — toLearnerPreferences gains one line
  tests/
    modules/users/service.test.ts             # updated
    modules/users/routes.test.ts              # updated

apps/web/
  src/
    app/
      ColorThemeProvider.tsx                # new
      App.tsx                                # updated — provider wiring
    modules/
      users/
        PreferencesPage.tsx                   # updated — theme-picker control
    shared/
      tokens.css                             # updated — 3 preset override blocks, base body rule
      components.css                         # updated — .usavvy-theme-swatch classes
  tests/
    app/ColorThemeProvider.test.tsx           # new
    modules/users/PreferencesPage.test.tsx    # updated
```

### Testing requirements

- Backend preferences tests are integration-style against the real Postgres container, matching every prior story's precedent.
- All tests pass locally via `docker-compose up` + `pnpm --filter @usavvy/core db:migrate` (re-run after this story's schema change) + native dev servers before this story is considered done.
- Verify the theme switch visually/live (not just via automated DOM-attribute assertions) — load `/preferences` in a real browser, click through all 4 presets, confirm the page's actual background/text colors change immediately with no reload, then reload the page and confirm the previously-selected theme persists.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 1.9, Epic 1 intro, FR-A-9]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — "Theme Presets (FR-A-9)" table (exact hex values for all 4 presets), the `theme-picker` component token, the explicit "which 5 tokens vary vs. which stay constant" rule]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md` — "Theme Picker (FR-A-9)... applied instantly on selection with no page reload, persisted to the Learner Profile. Independent of the Board's own dark/paper toggle"]
- [Source: `_AI-Agile-Development/implementation-artifacts/1-4-learner-preferences.md` — the exact `saveField`/optimistic-update/revert-on-failure pattern this story reuses unmodified, and its own explicit warning against conflating `boardTheme` with the app color theme]
- [Source: `apps/web/src/shared/tokens.css` — confirmed the existing `:root` values already match the Indigo Focus preset exactly, and confirmed no existing rule applies `--color-background`/`--color-on-surface` at the page level]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

### Completion Notes List

### File List
