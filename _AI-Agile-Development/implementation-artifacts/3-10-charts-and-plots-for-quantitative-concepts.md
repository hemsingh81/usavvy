---
baseline_commit: a31e8ff45982d2e1f138e34a709a61ea60cdde1f
---

# Story 3.10: Charts and Plots for Quantitative Concepts

Status: done

*(Epic 3, FR-B-30. Part of the Stories 3.5-3.10 block — see Story 3.5's header for the full context. This is the one story in the block with NO mock coverage at all, not even a partial stand-in — documented as such rather than overstated.)*

## Story

As a learner,
I want quantitative concepts illustrated with charts and plots,
so that I can visualize data-driven ideas.

## Acceptance Criteria

1. **Given** a Beat contains chart-worthy quantitative content **When** the Beat renders **Then** a chart/plot appropriate to the data (e.g., line, bar, scatter) is rendered on the board with labeled axes and legend
2. **Given** the chart data cannot be rendered because it is invalid or missing **When** rendering is attempted **Then** a fallback tabular representation of the same data is shown instead of a blank chart, and the error is logged

## Assessment against the existing mock

Confirmed by reading `mockBoardData.ts`'s `BoardContentBlock` union in full: it has exactly five variants — `text | math | code | diagram | table` — **`chart` is not one of them.** No chart/plot content type, no charting library (e.g. Chart.js, Recharts, D3), and no chart-shaped mock Beat exist anywhere in this codebase.

- **AC #1 — NOT satisfied, not even partially.** Unlike Stories 3.5-3.9 (which all have at least a partial, honest mock stand-in to point to), there is genuinely nothing here yet. This is a real, unstarted feature — a future story's job (adding a `chart` variant to `BoardContentBlock`, a mock chart Beat, a charting library integration).
- **AC #2 — not applicable** (there's no chart-rendering path to fail in the first place).

Marked `done` per the same explicit user decision as Stories 3.5-3.9 (mark this block done rather than block Epic 3 on the unfunded real-provider question), but this one specifically should be read as "acknowledged and consciously deferred," not "satisfied in any form" — logged clearly in `deferred-work.md` as the block's one genuinely-zero-coverage item.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- No new code this story, and unlike Stories 3.5-3.9, no partial mock coverage to assess either — confirmed by reading `mockBoardData.ts`'s complete `BoardContentBlock` union, which has no `chart` variant at all. This is the honest outlier in the 3.5-3.10 block: not "mock stands in, real provider pending" but "nothing built yet, in any form."
- Logged to `deferred-work.md` distinctly from the rest of the block's items, flagged as the one with zero existing coverage rather than partial/behavioral coverage.

### File List

None — no files changed.

## Change Log

- 2026-08-06: Assessed against the existing mock and found zero coverage (no `chart` content type exists at all, unlike Stories 3.5-3.9's partial stand-ins) — logged distinctly in `deferred-work.md`. Status: done, per the same explicit user decision covering this story block, marked as fully deferred rather than partially satisfied.
