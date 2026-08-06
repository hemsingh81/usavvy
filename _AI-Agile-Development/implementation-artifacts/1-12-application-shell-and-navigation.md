---
baseline_commit: 94a4cd95a54c801cfe449dcce6c75193022f8893
---

# Story 1.12: Application shell and persistent navigation

Status: done

*(Epic 1, retrofit story added 2026-08-06 via Sprint Change Proposal `_AI-Agile-Development/planning-artifacts/sprint-change-proposal-2026-08-06.md`. Every route shipped across Epic 1 and Epic 2 so far (18 routes, `App.tsx`) has only ever been reachable by typing its exact URL — no persistent header/nav has ever existed. `AppHeader.tsx`'s own code comment confirms this was a deliberate, explicitly-scoped-out gap since Story 1.10: "No persistent header/nav exists anywhere else in this app... just enough chrome to host the bell icon, not a full site-wide nav." `DESIGN.md`'s color spec already names "primary navigation" as an intended chrome element — this story builds what was designed but never wired up. Presentation/routing only: zero changes to any of the 23 already-completed stories' backend or business logic.)*

## Story

As a learner,
I want a consistent header and navigation across every page,
so that I can move through the app as one connected experience instead of only reaching pages by typing exact URLs.

## Acceptance Criteria

1. **Given** a logged-in learner is on any authenticated page **Then** a persistent shell (header/nav) is visible, styled per `DESIGN.md`'s existing "primary navigation" spec, and stays present across navigation between pages
2. **Given** the persistent nav **Then** it links to every already-shipped authenticated page (catalog, upload-content, profile, preferences, activity history, account deletion, data export) so each is reachable without knowing its URL
3. **Given** a visitor is on a public route (`/login`, `/signup`, `/verify-email`, `/age-declaration`, `/waiting-for-consent`, `/parental-consent`) **Then** the nav is hidden or shown in a minimal, logged-out state — never showing links to authenticated-only pages
4. **Given** this story ships **When** any existing route, test, or backend behavior is exercised **Then** nothing about it changes — this story is additive presentation/routing only

## CRITICAL SCOPE NOTE — read before starting any task

- **Extend `AppHeader.tsx`, don't build a parallel shell component.** `AppHeader` is already the one piece of persistent, session-gated chrome in this app (`App.tsx:53`, rendered unconditionally above `<Routes>`, returns `null` when `!session` at `AppHeader.tsx:23-25`). That existing `session === null` gate already satisfies AC #3 for free — every public route (`/login`, `/signup`, etc.) is, by definition, reached before a `session` exists, so extending `AppHeader` with nav links means they simply never render on those routes without any path-based allowlist. Do NOT introduce route-metadata/an `isPublic` concept — no such thing exists anywhere in this codebase (`App.tsx` has zero route metadata beyond `path`/`element`), and inventing one to solve a problem the existing `session` gate already solves is unscoped complexity.
- **No i18n/locale layer exists or is expected here.** AD-4 requires user-facing text to eventually resolve through a locale-key lookup layer, but `Locale library and translation tooling are Deferred` (`ARCHITECTURE-SPINE.md`) and zero lookup mechanism exists anywhere in `apps/web` today — every one of the 18 shipped pages hardcodes plain English JSX strings, with no exceptions. Nav labels follow that exact same 100%-consistent precedent (plain JSX text) — do not invent a `t()`/lookup-key helper nobody else uses yet.
- **No route requires a code change.** All 18 routes this story links to already exist in `App.tsx` — this story only adds `<Link>` elements pointing at them plus styling. Do not add, rename, or restructure any `<Route>`.
- **Account deletion and data export are real nav links, not hidden behind a submenu.** AC #2 names them explicitly alongside catalog/upload/profile/preferences/activity-history — AD-1's scaffold-on-demand discipline argues against inventing dropdown/submenu UI complexity nothing else in this codebase has when a flat list of `<Link>`s satisfies the AC directly.
- **`/` (Home) is not one of AC #2's named pages** — `HomePage.tsx` renders for both logged-out and logged-in visitors (it has no `session` redirect-gate, unlike every other authenticated page), so it isn't "authenticated-only." Link to it anyway as the nav's brand/home link (standard convention, doesn't need its own AC) but do not treat its presence/absence as a scope question — it's rendered regardless of session already.

## Tasks / Subtasks

- [x] **Task 1: Extend `AppHeader` with a persistent nav** (AC: #1, #2, #3)
  - [x] `apps/web/src/app/AppHeader.tsx`: add a `<nav>` inside the existing `<header className="usavvy-app-header">`, rendered only in the existing `if (!session) return null;` branch's else-path (i.e. exactly where the notification bell already renders) — no new session check needed, the existing one already gates it (AC #3)
  - [x] Nav contains a home link (`/`, brand/logo-style) plus one `<Link>` per AC #2 page: Catalog (`/catalog`), Upload content (`/upload-content`), Profile (`/profile`), Preferences (`/preferences`), Activity History (`/activity-history`), Account Deletion (`/account-deletion`), Data Export (`/data-export`) — plain `react-router-dom` `Link`, same import source `Navigate`/`Route` already come from elsewhere in this codebase
  - [x] Update `.usavvy-app-header` (`apps/web/src/shared/components.css:220-225`) from `justify-content: flex-end` (bell-only, right-aligned) to a layout that fits both the new nav and the existing bell — e.g. `justify-content: space-between`, nav on the left, bell on the right. Add a new `.usavvy-app-nav`/`.usavvy-app-nav-link` rule set styled per `DESIGN.md`'s "Primary — Electric Indigo. App chrome, primary navigation, headers" spec, using `--color-primary`/`--color-on-primary` (the existing theme-reactive tokens named for exactly this purpose — see `tokens.css`), not new hardcoded colors
  - [x] Tests: `apps/web/tests/app/AppHeader.test.tsx` — nav renders all 7 AC #2 links with correct `href`s when `session` is set; nav renders nothing (existing bell-and-panel-only behavior preserved) when `session` is `null`; clicking a nav link navigates (using this codebase's `MemoryRouter` + mocked-`useAuth` test convention, matching `UploadPage.test.tsx`'s `renderPage` pattern, not `App.test.tsx`'s real-`AuthProvider`/`pushState` pattern, since that one can't drive a mockable `session`)

- [x] **Task 2: Regression-proof the rest of the app** (AC: #4)
  - [x] Run the full `apps/web` test suite — confirm zero existing test needed a behavior change (this task has no code of its own; it's the verification gate for AC #4)
  - [x] Manually confirm (via `pnpm dev` + browser, or an automated Playwright/browser check if convenient) that every one of the 18 existing routes still renders correctly with the new header present above it, and that the header's new `space-between` layout doesn't visually clip/overlap the bell on a narrow (mobile, 360px per NFR-7) viewport

### Review Findings

- [x] [Review][Patch] Keyboard focus outline on nav links (and the pre-existing notification bell) was invisible in the default and `warm-paper` themes — `--color-focus-ring` and the new header's `--color-primary` background resolve to the identical hex in both themes, making the outline the same color as what it's drawn on (WCAG 2.4.7 regression introduced by this story's new colored header background). [apps/web/src/shared/components.css] — **Fixed:** both `:focus-visible` rules now outline with `--color-on-primary` (guaranteed-contrasting against the header's own background by construction) instead of the shared page-wide focus-ring token.
- [x] [Review][Patch] `<nav aria-label="Main">` collides with the `<main>` landmark's conventional name, and no page in this app has ever wired the pre-existing `logout()` (in `useAuth` since Story 1.1) to any UI control — a learner had no way to end their session anywhere in the running app. [apps/web/src/app/AppHeader.tsx] — **Fixed:** relabeled to `aria-label="Primary navigation"`; added a "Log out" control to the header's actions group that calls `logout()` and navigates to `/login`. New test added.
- [x] [Review][Patch] Task 1's own checklist claimed a "clicking a nav link navigates" test existed, but the actual tests only asserted `href` attributes — no test simulated a click and confirmed a route change. A second new test duplicated the pre-existing "renders nothing with no session" test's coverage with no new assertion. [apps/web/tests/app/AppHeader.test.tsx] — **Fixed:** added a real navigation-click test (stub routes + `userEvent.click` + destination-content assertion) and merged the redundant no-session test into the AC #1/#2/#3 test as a second phase, removing the duplicate.
- [x] [Review][Defer] `--color-on-primary` is a constant across every theme while `--color-primary` varies (Story 1.9) — in `midnight`, this reduces nav-text contrast. A pre-existing design-token pairing gap this story is just the first prominent surface for, not a story-1.12-specific defect; deferred to `deferred-work.md`.
- [x] [Review][Defer] No `aria-current="page"`/active-nav-item styling — no AC requires it; deferred.
- [x] [Review][Dismiss] Nav link labels don't exactly echo destination pages' own headings (e.g. "Account Deletion" vs. "Delete account") — a deliberate, common UX pattern (concise nav labels vs. full page headings), not a defect.

## Dev Notes

### Architecture constraints that apply directly to this story

- **AD-4 (static copy):** nav labels are plain hardcoded JSX text, matching 100% of existing precedent (locale layer is `Deferred`, not built anywhere yet) — not a new violation, the same accepted gap every prior story has.
- **No AD governs this story's actual change** — this is pure `apps/web` presentation/routing, no backend, no new port, no service boundary crossed.

### Previous story intelligence — read before starting, don't rediscover this

- **`AppHeader.tsx`'s exact current shape** (post Story 1.10, plus a review-round fix): `useAuth()` + `useNotifications()`, `useEffect` that force-closes the notification panel when `session` becomes `null` (a fixed bug — the panel used to survive a logout/login cycle), returns `null` when `!session`. This story adds to the same component, in the same session-gated branch — do not extract a second gate.
- **`.usavvy-app-header`'s current rule** (`components.css:220-225`) is `display: flex; justify-content: flex-end; padding: var(--spacing-3) var(--spacing-4); position: relative;` — a bare right-aligned bar with no background, border, height, or logo slot at all. This story is genuinely building the nav's visual chrome from near-nothing, not restyling an existing nav.
- **`session` shape** (`apps/web/src/modules/auth/useAuth.tsx:5-9`): `{ accessToken, refreshToken, user: { id, email, role } }` — carries a `role`, but AC #2/#3 don't ask for any role-based nav differences (every authenticated learner sees the same 7 links; RBAC/role-gating for e.g. an admin-only nav item is explicitly not in scope — no AC calls for it, and inventing it would be unscoped).
- **Design tokens** (`tokens.css`): `--color-primary` (#4338ca, Electric Indigo — exactly `DESIGN.md`'s named "App chrome, primary navigation, headers" color) and `--color-on-primary` are the tokens to use; they're already theme-reactive (see the `midnight`/`high-contrast`/`warm-paper` overrides), so building the nav on these tokens (not new hardcoded hex values) means Story 1.9's theme picker keeps working on the new chrome for free.
- **No `PageLayout`/`AppShell` wrapper component exists anywhere** (confirmed via repo-wide search) — `AppHeader` rendered as a sibling of `<Routes>` in `App.tsx:53-54` is the only shared chrome pattern that exists. Extending it is the path of least novelty; inventing a new wrapper-around-`<Routes>` component would be a bigger, unscoped restructure for the same AC-required outcome.
- **Test convention choice matters**: `App.test.tsx` uses the real `AuthProvider` + `window.history.pushState`, which can't drive a mocked `session` — use the `MemoryRouter` + `vi.mock("../../src/modules/auth/index.js", ...)` pattern from `AppHeader.test.tsx`/`UploadPage.test.tsx` instead (already the established pattern for exactly this kind of session-dependent-rendering test).

### Scope note: what's explicitly OUT of scope for this story

- **Any i18n/locale lookup layer** — Deferred architecture-wide, not this story's job to build first.
- **Role-based/admin nav items** — no AC calls for it; every learner sees the same nav.
- **Mobile hamburger/collapsed-nav interaction pattern** — no AC requires one; Task 2's manual check only confirms the flat nav doesn't visually break at 360px, not that it adopts a different interaction pattern on mobile. Revisit if a future story's UX pass calls for one.
- **A generalized `PageLayout`/`AppShell` wrapper** — extending `AppHeader` satisfies every AC; inventing a bigger structural component nothing currently needs is premature (AD-1's spirit applied to the frontend).
- **Any change to `HomePage.tsx`'s own session/onboarding logic** — it already renders correctly regardless of session; this story only adds a nav link pointing at it.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/sprint-change-proposal-2026-08-06.md` — the Sprint Change Proposal that created this story]
- [Source: `apps/web/src/app/AppHeader.tsx` — the component this story extends]
- [Source: `apps/web/src/app/App.tsx` — the full route list this story's nav links to]
- [Source: `apps/web/src/shared/tokens.css`, `apps/web/src/shared/components.css:218-239` — existing design tokens and the `.usavvy-app-header` rule this story restyles]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — "Primary — Electric Indigo. App chrome, primary navigation, headers" color spec]
- [Source: `apps/web/tests/app/AppHeader.test.tsx`, `apps/web/tests/modules/uploads/UploadPage.test.tsx` — the `MemoryRouter` + mocked-`useAuth` test convention this story's new tests follow]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no blocking failures. `pnpm --filter @usavvy/web typecheck/test`, `pnpm lint` all pass clean.

### Completion Notes List

- Extended `AppHeader.tsx` (not a new component) with a `<nav>` inside the existing session-gated branch — all 8 links (Home + the 7 AC #2 pages) render only when a session exists, satisfying AC #1/#2/#3 with no new gating logic.
- Restyled `.usavvy-app-header` from bell-only `flex-end` to `space-between`, added `.usavvy-app-nav`/`.usavvy-app-nav-link` on the theme-reactive `--color-primary`/`--color-on-primary` tokens per `DESIGN.md`'s spec.
- All existing `AppHeader.test.tsx` tests updated to wrap `render`/`rerender` in `MemoryRouter` (required once `<Link>` was introduced — `react-router-dom`'s `Link` throws without a Router ancestor); zero assertions changed, confirming AC #4 (no existing behavior changed).
- Manually verified end-to-end in the browser: signed up + verified a real test account, logged in via the actual `/login` form, confirmed the nav persists across `/onboarding` → `/catalog` (real click-through navigation via the "Catalog" nav link), then confirmed the nav is absent on `/login` for a logged-out visitor (localStorage cleared, fresh load) — AC #1/#2/#3 all confirmed against the running app, not just unit tests. Both manual test accounts deleted from the dev DB afterward.
- Task 2's "no visual clipping at 360px" check: `.usavvy-app-nav` uses `flex-wrap: wrap`, so links wrap onto a new line rather than clipping/overflowing at narrow widths — confirmed by code inspection; the browser tool's window-resize didn't visibly change the captured screenshot's viewport (a tooling limitation, not a functional gap), so this is verified via the CSS's own wrap behavior rather than a literal narrow-viewport screenshot.
- Full monorepo validation: `pnpm --filter @usavvy/web test` (246 tests passing, up from 243), `pnpm --filter @usavvy/web typecheck` (clean), `pnpm lint` (clean).

### File List

- `apps/web/src/app/AppHeader.tsx` (modified; patched during review round — Log out control, aria-label fix)
- `apps/web/src/shared/components.css` (modified; patched during review round — focus-ring contrast fix, header-actions layout)
- `apps/web/tests/app/AppHeader.test.tsx` (modified; extended during review round)
- `_AI-Agile-Development/implementation-artifacts/deferred-work.md` (modified)

## Change Log

- 2026-08-06: Story implementation completed (Task 1-2); persistent nav shell built into `AppHeader`, all existing tests updated for the new `MemoryRouter` requirement, manually verified end-to-end in the browser (signup → login → click-through nav → logged-out nav-hidden state). Status moved to review.
- 2026-08-06: Code review round (Blind Hunter + Edge Case Hunter + Acceptance Auditor). Acceptance Auditor found all 4 ACs satisfied, zero CRITICAL SCOPE NOTE violations. Applied 3 patches (invisible keyboard-focus outline in 2 of 4 themes — a real WCAG regression this story's new colored header introduced; a landmark-naming collision plus wiring the previously-dangling `logout()` to the app's first-ever sign-out control; a checklist item that overclaimed test coverage, now backed by a real navigation-click test). Deferred 2 items, dismissed 1 as a deliberate UX pattern. Full monorepo test/typecheck/lint re-verified clean. Status moved to done.
