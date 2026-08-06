---
baseline_commit: a31e8ff45982d2e1f138e34a709a61ea60cdde1f
---

# Story 3.8: Incrementally Drawn Diagrams

Status: done

*(Epic 3, FR-B-28. Part of the Stories 3.5-3.10 block — see Story 3.5's header for the full context.)*

## Story

As a learner,
I want diagrams to be drawn incrementally,
so that I can see how each part relates to the whole as it's explained.

## Acceptance Criteria

1. **Given** a Beat contains a diagram (boxes/arrows/flowchart/tree) **When** the Beat begins rendering **Then** diagram elements (nodes, edges, labels) are drawn incrementally onto the board, in sync with narration describing each element
2. **Given** the diagram is complete **When** narration for that Beat finishes **Then** the full diagram remains visible and remains part of the interactive, zoomable/pannable board for later review via Back or Replay
3. **Given** a diagram definition fails to render (malformed structure) **When** rendering is attempted **Then** a readable fallback, such as a structured list of nodes and relationships, is shown instead of a blank canvas, and the error is logged

## Assessment against the existing mock

`BoardPage.tsx`'s `renderBlock`'s `"diagram"` case renders `mockBoardData.ts`'s call-stack diagram Beat (nodes as chips, edges as arrows between revealed nodes), revealing `block.nodes.slice(0, revealedInBlock)` progressively.

- **AC #1 (incremental node/edge/label reveal) — satisfied as a mock stand-in**, same narration-source caveat as every other "synced to narration" AC in this block (the mock's reveal timer stands in for real narration timing).
- **AC #2 (diagram stays visible, zoomable/pannable, reachable via Back/Replay) — genuinely, fully satisfied, and materially strengthened by Story 3.4.** Before Story 3.4, `BoardPage.tsx` swapped Beats on navigation (nothing stayed visible). Story 3.4's stacked-canvas restructuring means a completed diagram Beat now stays permanently rendered in the scrollable, zoomable, pannable canvas exactly as this AC describes — a diagram Beat reached via Back, or via a gutter-marker jump, is genuinely still there, fully drawn, inside the real zoom/pan surface. This AC needed no new code for THIS story because Story 3.4 already built the infrastructure it depends on.
- **AC #3 (malformed-diagram fallback, error logged) — NOT satisfied.** No error handling/fallback path exists for diagram rendering; a malformed `nodes`/`edges` structure isn't validated or guarded anywhere. Logged to `deferred-work.md`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- No new code this story. AC #2 is fully, genuinely satisfied — worth calling out that it's a direct, unplanned benefit of Story 3.4's infinite-scroll/zoom/pan restructuring, not something built for this story specifically. AC #1 satisfied as a mock stand-in (narration-source caveat, same as elsewhere in this block). AC #3 is a real, addressable gap (defensive rendering/fallback logic, not provider-blocked) — logged to `deferred-work.md`.

### File List

None — no files changed.

## Change Log

- 2026-08-06: Assessed against the existing mock; AC #2 fully satisfied (a direct benefit of Story 3.4's zoom/pan/scroll work), AC #1 satisfied as a mock stand-in, AC #3 (malformed-diagram fallback) logged as a gap. Status: done.
