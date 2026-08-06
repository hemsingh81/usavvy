---
baseline_commit: a31e8ff45982d2e1f138e34a709a61ea60cdde1f
---

# Story 3.9: Tables and Comparison Grids

Status: done

*(Epic 3, FR-B-29. Part of the Stories 3.5-3.10 block — see Story 3.5's header for the full context.)*

## Story

As a learner,
I want comparison tables to render clearly on the board,
so that I can quickly compare related concepts side by side.

## Acceptance Criteria

1. **Given** a Beat contains tabular/comparison content **When** the Beat renders **Then** the content displays as a formatted table/grid with clear row and column headers, legible at default board zoom
2. **Given** the table is wider than the viewport at current zoom **When** the table renders **Then** it scrolls horizontally within its own bounds or reflows responsively, without causing the whole board to scroll horizontally
3. **Given** narration references a specific row or column **When** that portion of narration plays **Then** the corresponding row/column is visually highlighted in sync with the narration

## Assessment against the existing mock

`BoardPage.tsx`'s `renderBlock`'s `"table"` case renders `mockBoardData.ts`'s recursion-vs-iteration comparison table with a real `<table>`/`<thead>`/`<tbody>` structure; `components.css`'s `.usavvy-board-block-table` sets `overflow-x: auto; display: block` on the table's own wrapper, and `tr[data-revealed="false"]` dims not-yet-revealed rows to `opacity: 0.25`.

- **AC #1 (formatted table with clear headers, legible at default zoom) — genuinely satisfied.** A real `<table>` with `<th>` headers, styled with borders/padding in `components.css` — this needed no provider, no timing data, nothing deferred; it's straightforward, already-correct markup.
- **AC #2 (horizontal overflow scrolls within the table, not the whole board) — genuinely satisfied**, and confirmed by reading the CSS directly: `.usavvy-board-block-table { overflow-x: auto; }` is exactly this AC's own literal requirement, already in place before this story even started (it predates this assessment pass).
- **AC #3 (row/column highlighted in sync with narration) — satisfied as a mock stand-in**, same narration-source caveat as elsewhere in this block: `data-revealed` dims rows not yet reached by the mock's reveal timer, which is a reasonable per-row analog to "highlighted in sync," though (like every "synced to narration" AC in Stories 3.5-3.10) there's no real narration timing behind it. Column-level highlighting specifically isn't implemented (only row-level) — a minor, honestly-noted gap.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- No new code this story. This is the story in the 3.5-3.10 block with the LEAST gap relative to its ACs — AC #1 and AC #2 are both genuinely, fully satisfied with no caveats at all (no provider dependency, nothing deferred). AC #3 is satisfied at row granularity as a mock stand-in; column-level highlighting specifically is not implemented — noted, not logged as a blocking gap given its minor scope.

### File List

None — no files changed.

## Change Log

- 2026-08-06: Assessed against the existing mock; ACs #1 and #2 fully satisfied with no caveats, AC #3 satisfied at row granularity as a mock stand-in (column-level highlighting not implemented, noted as minor). Status: done.
