---
baseline_commit: 1cb9894a6ef1d9f8d0a008540d096e1b188f1076
---

# Story 3.11: Highlight/Spotlight Dimming

Status: done

*(Epic 3, FR-B-32. Unlike Stories 3.5-3.10, this story is genuinely buildable now — it's a visual-attention mechanism layered over content that already exists (text/math/diagram/table/code blocks, all already rendered by Stories 3.5-3.9's mock), not something that needs a real `GenerationPort`/`VoicePort` provider to exist in any form. 100% frontend, on top of Story 3.4's stacked/scrollable canvas. Read the CRITICAL SCOPE NOTE before starting any task.)*

## Story

As a learner,
I want the board to spotlight the current element and dim everything else,
so that I can focus on exactly what's being explained without visual clutter.

## Acceptance Criteria

1. **Given** a Beat is actively narrating a specific board element (text block, diagram node, table row, code line, etc.) **When** narration reaches that element **Then** that element remains at full visual prominence while all other rendered board elements are dimmed
2. **Given** narration moves to the next element **When** the transition occurs **Then** the spotlight moves to the new element and the previous element returns to dimmed styling
3. **Given** I manually pan/scroll away from the spotlighted element, or pause **When** I do so **Then** dimming is suspended and full board visibility is restored, resuming when I return to active playback

## CRITICAL SCOPE NOTE — read before starting any task

**Confirmed by reading `BoardPage.tsx`/`mockBoardData.ts` in full (as restructured by Story 3.4) before starting. Read every bullet before writing code.**

- **"Narration reaches that element" is, once again, satisfied via the mock's existing progressive-reveal timer, not real audio — same honest caveat as Stories 3.5/3.7/3.8's identical "synced to narration" ACs.** There is still no real `VoicePort`/word-level-timing source anywhere in this codebase. The reveal timer already advances element-by-element within a Beat (words for text, lines for code/math, nodes for diagrams, rows for tables) — this story spotlights whichever element is CURRENTLY receiving new reveal progress and dims everything else. Note this honestly in Dev Notes; this is the exact same class of limitation as the immediately preceding stories, not a new gap this story introduces.
- **Spotlight granularity matches the AC's own literal examples — one unit per block type, not sub-word.** "Text block" (the AC's own words) is the unit for text/math blocks (the whole block is the spotlighted element while any of it is actively receiving reveal progress — no word-level sub-spotlighting, since the progressive reveal itself already visually distinguishes "written" from "not yet written" within a text block). "Diagram node," "table row," "code line" are each their own existing per-element concept already in `BoardPage.tsx`/`components.css` (code already has `data-active` per line; tables already have `data-revealed` per row; diagrams reveal nodes one at a time) — reuse these, generalized into one shared dimming mechanism, don't invent parallel one-off logic per block type.
- **Dimming applies board-wide, not just within the active Beat.** Every OTHER rendered element — other blocks within the active Beat not currently receiving reveal progress, AND every block in every OTHER stacked Beat (Story 3.4's permanent stack) — gets dimmed while the spotlight is active. This is the one place this story's scope is bigger than a single Beat's own content, because Story 3.4 made the canvas a permanent multi-Beat stack.
- **AC #3's "manually pan/scroll away" needs to distinguish a learner's own scroll from this component's own programmatic `scrollIntoView` calls (Story 3.4's gutter-marker jump).** Track a ref flag set immediately before any programmatic scroll and cleared right after, so the canvas's native `scroll` event handler can tell "I did this" apart from "the learner did this" — only a learner-initiated scroll suspends dimming.
- **"Resuming when I return to active playback" — defined here as: the manual-scroll suspension clears on the next reveal tick** (the next time `revealedUnits` actually advances — i.e., the learner is visibly following along with playback again), and the pause-based suspension clears the moment `isPaused` flips back to `false`. Both are simple, deterministic, testable conditions — don't build a time-based idle-timeout heuristic instead; it would be unfalsifiable in this test suite and isn't what the AC actually asks for.
- **Dimming is a CSS `opacity`/filter treatment on non-spotlighted elements, not a re-render/remeasure of the whole canvas.** Should compose cleanly with Story 3.4's zoom/scroll — a dimmed element is still exactly where it was, just visually de-emphasized (`opacity: 0.35` or similar, chosen to keep dimmed content legible enough to still visually locate, matching `DESIGN.md`'s existing `tr[data-revealed="false"] { opacity: 0.25 }` precedent for the same kind of treatment).
- **`prefers-reduced-motion` (`DESIGN.md`'s own Do's and Don'ts): dimming itself is a static opacity STATE change, not an animation** — no fade transition is required to satisfy this story's ACs, so there's nothing to gate behind `prefers-reduced-motion` here (a future polish pass could add a transition and would need to respect it then, but this story doesn't need to add one to satisfy its own ACs).

## Tasks / Subtasks

- [x] **Task 1: Spotlight/dimming state and CSS treatment** (AC: #1, #2)
  - [x] `apps/web/src/modules/board/BoardPage.tsx`: compute which element is "currently spotlighted" from existing reveal state — for the active Beat's currently-revealing block (the block whose cumulative revealed-units range includes the current `revealedUnits` value, mirroring `BeatContent`'s own existing per-block `revealedInBlock` math), determine the specific sub-element: the block itself for `text`/`math`; the line index for `code` (reuse the existing `data-active` index math); the node index for `diagram`; the row index for `table`.
  - [x] Add a `data-dimmed="true"` (or similar) attribute to every rendered block/element that is NOT the current spotlight target, applied board-wide (every stacked Beat section, every block within them) whenever spotlighting is active (see Task 2 for when that is). Add the corresponding CSS rule (`opacity` reduction) to `apps/web/src/shared/components.css`.
  - [x] Tests (extend `apps/web/tests/modules/board/BoardPage.test.tsx`): while playing, the block/line/node/row currently receiving reveal progress does NOT have the dimmed attribute, while a different, already-revealed block/line/node/row (in the same Beat or an earlier stacked Beat) DOES have it. As the reveal timer advances to a new element, the dimmed attribute moves accordingly (the previously-spotlighted element becomes dimmed, the new one doesn't).

- [x] **Task 2: Suspend dimming on manual scroll or pause** (AC: #3)
  - [x] Add an `isProgrammaticScroll` ref flag, set immediately before any `scrollIntoView`/`canvasRef.current.scrollTo(...)` call (Story 3.4's gutter-marker-click and Restart-concept paths) and cleared right after. Add a native `onScroll` handler on the canvas: if `isProgrammaticScroll.current` is false, set a `dimmingSuspended` state to `true`.
  - [x] Dimming is active only when `!isPaused && !dimmingSuspended` (both this story's own state and the existing `isPaused` state suspend it). Clear `dimmingSuspended` back to `false` on the next successful reveal-timer tick (inside the existing tick `useEffect`'s `setRevealedUnits` callback, or a small follow-up effect keyed on `revealedUnits` changing while not suspended-by-pause) — see CRITICAL SCOPE NOTE for why this specific trigger, not a timeout.
  - [x] Tests: firing a native scroll event on the canvas suspends dimming (no element carries the dimmed attribute); the NEXT reveal tick (advance fake/real time by one `REVEAL_TICK_MS`) restores dimming. Toggling Pause suspends dimming; toggling back to Resume restores it on the next tick.

## Dev Notes

### Previous story intelligence — read before starting, don't rediscover this

- **`apps/web/src/modules/board/BoardPage.tsx`** (Story 3.4's stacked-canvas restructuring) — read the current full file; this story's spotlight computation reuses `totalUnitsFor`/`countUnits`/the existing per-block `revealedInBlock` math from `BeatContent`, and its scroll-suspension logic sits alongside Story 3.4's own `canvasRef`/`scrollTargetId`/`handleGutterMarkerClick`/`handleRestartConcept` — don't duplicate those, extend them.
- **`apps/web/src/shared/components.css`** — `tr[data-revealed="false"] { opacity: 0.25 }` and `.usavvy-board-code-line[data-active="true"]` are the two existing per-element visual-state precedents already in this file; this story's new `data-dimmed`-driven rule should read as a natural sibling to these, not a redesign.
- **Story 3.4's own code-review lesson on test speed**: a real-click loop with many iterations flaked under heavy system load and its timeout bled into later tests. If this story's tests need to simulate several reveal ticks in a row, prefer advancing state directly/via `fireEvent` over long `userEvent` loops, and give any genuinely slow test an explicit generous timeout up front rather than discovering the need for one after a flake.

### Scope note: what's explicitly OUT of scope for this story

- **Real narration-timing-driven spotlighting** — same provider-funding-blocked limitation as Stories 3.5/3.7/3.8; the mock's reveal timer stands in for it, honestly noted, not solved here.
- **An idle-timeout-based dimming-resume heuristic** — deliberately not built; see CRITICAL SCOPE NOTE for the simpler, deterministic trigger actually used.
- **A fade/transition animation for the dim/spotlight change** — a static opacity state change satisfies the ACs; nothing here needs to respect `prefers-reduced-motion` because nothing here animates.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 3.11, FR-B-32 (lines ~954-968)]
- [Source: `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` — Do's and Don'ts (`prefers-reduced-motion`), the `tr[data-revealed="false"]` opacity precedent]
- [Source: `apps/web/src/modules/board/BoardPage.tsx`, `components.css`, `BoardPage.test.tsx` — the exact files this story extends]
- [Source: `_AI-Agile-Development/implementation-artifacts/3-4-board-zoom-pan-and-infinite-scroll-with-beat-gutter-markers.md` — the direct predecessor this story builds directly on top of]

## Review Findings

One adversarial review ran against the diff. One genuine defect found and patched; one minor, narrow-window gap found, judged not worth a more complex fix, and logged to `deferred-work.md` rather than silently dropped.

### Patched

- **MEDIUM — `computeSpotlight` gave math blocks per-line sub-spotlighting like code, contradicting the story's own explicit spec** (Task 1: "the block itself for `text`/`math`... the line index for `code`"). The ternary only excluded `"text"`, so a math block's own already-revealed earlier lines got dimmed relative to its newest line — the opposite of the intended whole-block treatment. Masked by the mock's own data: its one math block is always the LAST block of its one Beat, so by the time a 2nd line reveals, the whole Beat is already fully revealed and `computeSpotlight`'s own early-return hides the symptom before it's visible. Fixed by including `"math"` in the whole-block exclusion. Since the existing mock data structurally can't exercise a math block that ISN'T a Beat's last block, `computeSpotlight` was exported and unit-tested directly against a locally-constructed multi-block Beat — verified to genuinely catch the regression by temporarily reverting the fix and confirming the new tests fail, then restoring it.

### Deferred (see `deferred-work.md`, "Deferred from: code review of story-3-11")

- `markProgrammaticScroll`'s fixed 500ms window can, in a narrow race, treat a learner's genuine manual scroll (landing within that window right after a gutter-marker click) as non-manual, leaving dimming active slightly longer than AC #3 ideally wants. Judged not worth a more precise scroll-completion-detection mechanism for this narrow a window.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no blocking failures. One test-writing fix along the way: the first version of the "text block is dimmed" assertion queried by a text fragment (`/base case, which stops/`), which failed because `<mark>` emphasis wrapping splits that sentence across multiple text nodes — fixed by querying the block wrapper directly (`.usavvy-board-block`) instead of by text. Full `BoardPage.test.tsx` re-run twice for stability (timer/scroll-heavy new tests) — 296/296 both times.

### Completion Notes List

- Both tasks implemented: `computeSpotlight` derives the currently-narrating element from the existing reveal-progress math (reusing `countUnits`/`totalUnitsFor` unchanged), returning `{ blockIndex, subIndex }` — `subIndex` is `null` for `text`/`math` blocks (whole-block spotlight, per the AC's own literal example) and a line/node/row index for `code`/`diagram`/`table`. A single shared `data-dimmed`/`[data-dimmed="true"]` mechanism (one CSS rule) handles all four dimming levels: whole non-active stacked Beats, whole non-spotlighted blocks within the active Beat, and individual lines/nodes/rows within the spotlighted block itself.
- AC #3's two suspension paths (manual scroll, pause) both resolve to the single `spotlight` computation being `null` — no separate "dimming on/off" boolean needed beyond `spotlight !== null` itself. Manual-vs-programmatic scroll detection uses a ref flag set around the existing `scrollIntoView`/`scrollTo` call sites from Story 3.4 — honestly noted as untestable in `jsdom` (which never fires a real `scroll` event from a `scrollIntoView` call in the first place), matching Story 3.4's own already-accepted marker-position-measurement limitation; the test suite instead verifies the "genuine native scroll suspends dimming" behavior via a direct synthetic `scroll` event, which doesn't go through the programmatic-flag path at all.
- "Resuming when I return to active playback" (AC #3) is implemented as a deterministic condition (the next reveal tick, or `isPaused` flipping back to `false`) rather than a time-based idle heuristic, per the story's own explicit instruction — both are directly tested via `waitFor`, not simulated with fake timers.
- Zero regressions: all 22 pre-existing `BoardPage.test.tsx` tests (12 original + 10 added across Stories 3.4's implementation and code-review rounds) continued passing unmodified throughout.
- Full validation: `pnpm -r typecheck` (9/9 clean, this story only touches `apps/web`), `BoardPage.test.tsx` re-run four times total across the implementation and patch rounds (299/299 every time after the patch — up from 292; 7 new tests), `pnpm lint` (clean).
- Code review found a real bug the mock's own data happened to mask (math blocks getting per-line dimming instead of whole-block) — fixed, and `computeSpotlight` exported specifically so a direct unit test against a constructed multi-block Beat could exercise the exact shape `mockBoardData.ts` doesn't have, rather than leaving the fix unverifiable against the existing mock. Confirmed the new test genuinely catches the regression by temporarily reverting the fix.

### File List

- `apps/web/src/modules/board/BoardPage.tsx` (modified — `computeSpotlight` (exported), `Spotlight` type (exported), `dimmingSuspendedByScroll` state, `isProgrammaticScrollRef`/`markProgrammaticScroll`, `handleCanvasScroll`, threaded `dimmingActive`/`spotlight` props through `BeatContent`/`renderBlock`; patched during code review — math blocks now correctly get whole-block spotlight, not per-line)
- `apps/web/src/shared/components.css` (modified — new shared `[data-dimmed="true"] { opacity: 0.35; }` rule)
- `apps/web/tests/modules/board/BoardPage.test.tsx` (modified — 4 new `BoardPage`-level tests: spotlight-dims-others, spotlight-moves-with-reveal, manual-scroll-suspends-and-tick-restores, pause-suspends-and-resume-restores; 3 new direct `computeSpotlight` unit tests added during code review)
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (modified)
- `_AI-Agile-Development/implementation-artifacts/deferred-work.md` (modified — new "Deferred from: code review of story-3-11" section)

## Change Log

- 2026-08-06: Story implementation completed (Tasks 1-2): added board-wide spotlight/dimming driven by the existing mock reveal-progress state, generalizing the code block's own pre-existing `data-active` concept into one shared mechanism across all block types. Manual-scroll and pause both suspend dimming per AC #3, resuming on deterministic triggers (next tick / un-pausing), not a time-based heuristic. Zero regressions to the 22 pre-existing tests. Full `pnpm -r typecheck`/`BoardPage.test.tsx` (×2)/`pnpm lint` verified clean. Status moved to review.
- 2026-08-06: Code review patch round — fixed a MEDIUM bug (math blocks incorrectly got per-line dimming instead of the spec'd whole-block treatment; masked by the mock's own data structure), exporting `computeSpotlight` so a direct unit test could exercise a scenario the mock data can't. Logged one minor, narrow-window gap (`markProgrammaticScroll`'s fixed 500ms) to `deferred-work.md` rather than over-engineering a fix for it. Full `pnpm -r typecheck`/`BoardPage.test.tsx` (×2 more)/`pnpm lint` reverified clean. Status moved to done.
