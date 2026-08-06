# Sprint Change Proposal — 2026-08-06

## 1. Issue Summary

**Trigger:** Not a bug in a specific story — a process observation raised after Story 2.12 (end of the ingestion pipeline's backend-heavy build). Categorized as a **strategic pivot in development approach**, not a technical failure or a misunderstood requirement.

**Problem statement:** Development has proceeded epic-by-epic, story-by-story, each story building its own backend + isolated UI page. No persistent application shell or navigation has ever been built — every page (15 routes across Epic 1 and Epic 2) is reachable only by typing its exact URL. There is no click-through user journey to demo, review, or course-correct against. Additionally, the current plan builds full backend depth for each epic (as it did for Epic 2's ingestion pipeline, Stories 2.7-2.12) before validating the user experience end-to-end — for Epic 3 (the Interactive Board, this project's largest and most architecturally complex epic), that risks real rework if the UX doesn't land right on the first pass.

**Evidence:**
- `apps/web/src/app/AppHeader.tsx`'s own code comment: *"No persistent header/nav exists anywhere else in this app — every page renders its own bare `<main>`... just enough chrome to host the bell icon, not a full site-wide nav."*
- Nearly every story's Dev Notes since Story 1.0 log "reachable only via direct URL" / "no persistent nav" as an explicitly *accepted* gap rather than a fixed one (Stories 1.0, 2.7, 2.11 all repeat this).
- The UX spec (`DESIGN.md`) already calls for "primary navigation" as a real, intended chrome element (color spec: *"Primary — Electric Indigo. App chrome, primary navigation, headers..."*) — so this isn't new scope, it's catching up on something the design always intended but implementation skipped every time.
- Epic 3 (Board) is explicitly this project's highest-risk epic per the PRD's own risk register (`ARCHITECTURE-SPINE.md` Deferred: *"Epic 3 (Board)... carries enough internal complexity... to warrant their own inherited epic-altitude spine before story-writing"*), making it the highest-value candidate for a mock-first UX pass before backend investment.

**User decisions already confirmed:**
1. Retrofit a real app shell/navigation across all already-built pages (Epic 1 + Epic 2) **now**, not just going forward.
2. Going forward, before building a new epic's backend, build a full click-through **mocked-data UI for the entire epic first**, get sign-off on the journey, then build real backend behind it story-by-story.

## 2. Impact Analysis

### Epic Impact
- **Epic 1 (User/Account, status: done):** Thematically owns this shell/nav work — persistent nav is a User-experience concern, not a Content-Ops one. Recommend **reopening Epic 1** to add one new story rather than inventing a disconnected new epic number or forcing this into Epic 2's Content-Ingestion theme.
- **Epic 2 (Content Ingestion & Catalog, status: in-progress):** No functional change to its remaining stories (2.13, 2.14) — they proceed exactly as planned. Once the new shell exists, `/catalog`, `/upload-content`, etc. simply become reachable through it instead of only by direct URL — no story rework needed for that, the shell links to fixed top-level routes that already exist.
- **Epic 3 onward (Board, and every future epic):** New process step inserted at the *start* of each future epic, before its first backend story: a mock-first, click-through UI pass covering that epic's full user journey with mocked data, followed by a sign-off checkpoint, then backend stories proceed story-by-story as today.
- No epic becomes obsolete; no epic needs removal. No resequencing of epic *order* (Epic 3 still follows Epic 2) — only a new story inserted into Epic 1 and a new recurring process step at each future epic's start.

### Story Impact
- **New Story 1.12 — "Application shell and persistent navigation."** Builds a real `apps/web` layout shell (header/nav chrome, matching `DESIGN.md`'s existing "primary navigation" color spec) and wires it to every already-shipped route, gated by auth state (e.g. catalog/profile/uploads only shown once logged in). This single story retrofits the entire existing app into one navigable journey — no changes needed to the 23 already-completed stories themselves.
- **Epic 3's first story** (whichever is sequenced first when Epic 3 starts) gets a new *preceding* task: build a mocked-data, click-through UI for the epic's core journey (the Interactive Board experience) before any real `board-orchestration`/`GenerationPort`/`VoicePort` backend work begins. This is a process addition to how Epic 3 kicks off, not a rewrite of Epic 3's existing story list in `epics.md`.

### Artifact Conflicts
- **PRD:** No conflict. This is a sequencing/process change, not a scope change — the MVP goals are unaffected, arguably de-risked (UX gets validated before expensive backend work).
- **Architecture:** No AD needs to change. Additive only: `ARCHITECTURE-SPINE.md`'s Structural Seed should note that `apps/web/src/app/` (already the home of `AppHeader.tsx`) hosts the shell/nav shared chrome, and record the new "mock-first epic kickoff" convention so it's discoverable, not just tribal knowledge.
- **UX/UI specs:** No conflict — `DESIGN.md` already specifies "primary navigation" as intended chrome; this proposal is building what was already designed, not designing something new. No wireframe/flow changes needed for the nav itself, though the mock-first pass for Epic 3 will produce its own UX artifacts (mocked screens) as it goes.
- **Other artifacts:** No CI/CD, deployment, or testing-strategy impact.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.** Add one story to Epic 1, and adopt a new recurring process convention for future epics. No rollback of existing work (all 23 completed stories remain valid and reusable exactly as built), no MVP scope reduction.

- **Effort:** Medium for Story 1.12 (one focused story: a shell component + route wiring, no new backend). Low ongoing overhead for the "mock-first epic kickoff" convention (it adds a step, but replaces time that would otherwise go into backend rework after a late UX pivot).
- **Risk:** Low. The shell retrofit touches presentation/routing only, not any of the 23 stories' business logic or tests. The mock-first convention is a sequencing change, easily reversible per-epic if it doesn't fit a particular epic's shape.
- **Rationale:** Rollback (Option 2) isn't warranted — nothing built is wrong, it's just been missing connective tissue. MVP review (Option 3) isn't warranted — no scope needs to shrink. This is purely "build the connective tissue now, and front-load UX validation for future epics" — a direct, additive adjustment.

## 4. Detailed Change Proposals

### 4.1 Sprint status (`sprint-status.yaml`)

```yaml
# OLD
epic-1: done
...
epic-1-retrospective: optional

# NEW
epic-1: in-progress   # reopened
  1-12-application-shell-and-navigation: ready-for-dev
...
epic-1-retrospective: optional   # unchanged position, now follows 1.12
```

Rationale: Epic 1 owns the User/Account experience (AD-14); persistent nav is that experience's connective tissue. Reopening it (rather than bolting this onto Epic 2, or minting a disconnected new epic number that would force renumbering Epics 3-9) keeps the existing epic structure intact.

### 4.2 New story stub — `1-12-application-shell-and-navigation.md`

```
Story: 1.12 — Application shell and persistent navigation
As a learner, I want a consistent header and navigation across every page,
so that I can move through the app as one connected experience instead of
only reaching pages by typing exact URLs.

Acceptance Criteria (draft, to be expanded by create-story):
1. A persistent shell (header/nav) wraps every authenticated route, styled
   per DESIGN.md's existing "primary navigation" spec.
2. Nav links to every already-shipped authenticated page (catalog, uploads,
   profile, preferences, activity history, account deletion, data export).
3. Nav visibility respects auth state (hidden/minimal on public routes:
   /login, /signup, /verify-email, etc.).
4. No existing route, test, or backend behavior changes — this is
   presentation/routing-only.
```

Rationale: gives `bmad-create-story` a concrete starting point; full AC/task detail gets fleshed out when that workflow actually runs against this stub, following the same process every other story has gone through.

### 4.3 `ARCHITECTURE-SPINE.md` — additive note under Structural Seed

```
OLD:
  apps/
    web/                       # React + Vite SPA
      src/
        modules/                # mirrors backend service boundaries in UI terms
        shared/                 # design system, layout, cross-module UI
        app/                    # routing, providers, entry

NEW:
  apps/
    web/                       # React + Vite SPA
      src/
        modules/                # mirrors backend service boundaries in UI terms
        shared/                 # design system, layout, cross-module UI
        app/                    # routing, providers, entry, persistent nav shell
                                 # (Story 1.12) — the one place app-wide chrome lives
```

Plus one new line under **Deferred** promoted to a working convention (not deferred — recorded as an active process note near AD-1's scaffold-on-demand rule):

```
Process convention (added 2026-08-06): before a new epic's first backend
story starts, build a click-through mocked-data UI covering that epic's
core journey and get sign-off, then proceed story-by-story with real
backend behind it. Applies starting with Epic 3.
```

### 4.4 `epics.md` — header note above Epic 3

A short callout (not a rewrite of Epic 3's existing stories) noting that Epic 3's kickoff now begins with a mock-first UX pass per the new convention, before its first backend story.

## 5. Implementation Handoff

**Scope classification: Moderate** — backlog reorganization (reopen Epic 1, add one story, document one new recurring process convention) with no PRD/architecture fundamentals changing. No PM/Architect escalation needed.

- **Immediate (now):** Apply the `sprint-status.yaml` and `ARCHITECTURE-SPINE.md` edits above, create the Story 1.12 stub, then run `bmad-create-story` against it for full AC/task detail, followed by `bmad-dev-story` to build it — same pipeline every other story has used.
- **At Epic 3 kickoff:** Apply the mock-first convention — build the click-through mocked UI pass before `create-story` runs for Epic 3's first real backend story.
- **Owner:** Continuing as Developer agent (this session) for both the immediate shell story and future epic kickoffs, per the existing autonomous dev-loop.

## 6. Approval

**Approved by HemLearner on 2026-08-06.** Proceeding directly to implementation per the Moderate-scope handoff above.
