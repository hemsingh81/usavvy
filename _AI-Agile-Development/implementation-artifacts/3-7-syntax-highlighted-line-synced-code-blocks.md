---
baseline_commit: a31e8ff45982d2e1f138e34a709a61ea60cdde1f
---

# Story 3.7: Syntax-Highlighted, Line-Synced Code Blocks

Status: done

*(Epic 3, FR-B-27. Part of the Stories 3.5-3.10 block — see Story 3.5's header for the full context.)*

## Story

As a learner,
I want code examples to be syntax-highlighted and revealed line by line as they're explained,
so that I can connect narration to the exact code being discussed.

## Acceptance Criteria

1. **Given** a Beat contains a code block with a specified language **When** the code block renders **Then** it displays with language-appropriate syntax highlighting
2. **Given** narration is explaining a specific line or lines of the code block **When** that portion of narration plays **Then** the corresponding line(s) are visually highlighted in sync with narration, and de-emphasized once narration moves past them
3. **Given** the code block's language is unrecognized or unsupported by the highlighter **When** rendering is attempted **Then** the code still displays in a monospace block without highlighting, without breaking the layout

## Assessment against the existing mock

`BoardPage.tsx`'s `renderBlock`'s `"code"` case renders `mockBoardData.ts`'s Python code Beats inside a `<pre className="usavvy-board-block-code">`, revealing lines progressively and marking the most-recently-revealed line `data-active="true"` (`.usavvy-board-code-line[data-active="true"]` in `components.css`: a background highlight).

- **AC #1 (language-appropriate syntax highlighting) — NOT satisfied.** No syntax-highlighting library (e.g. Prism, Shiki) is wired in anywhere in this codebase; code renders as plain monospace text regardless of `block.language`. Like Story 3.6's math-typesetting gap, this is an addressable rendering-library integration, not something blocked on a real `GenerationPort`/`VoicePort` provider choice — logged separately in `deferred-work.md`.
- **AC #2 (line highlighted in sync with narration, de-emphasized after) — satisfied as a mock stand-in, same caveat as Story 3.5's ACs #1/#2.** The `data-active` mechanism genuinely highlights the currently-revealing line and removes the highlight once the timer moves past it — the *behavior* matches; the *sync source* is the mock's own reveal timer, not real narration, for the same reason as every other "synced to narration" AC in this block.
- **AC #3 (unrecognized language falls back to plain monospace, no layout break) — vacuously true today, not really exercised.** Every language currently renders as plain monospace (since no highlighter exists at all), so there's technically nothing to "fall back" from. This will become a real, testable AC only once AC #1's highlighter exists.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- No new code this story. AC #2 satisfied as a mock stand-in (same narration-source caveat as Story 3.5). AC #1 logged as an addressable gap (a syntax-highlighting library integration), distinct from the provider-funding-blocked items — grouped with Story 3.6's identical-shaped math-typesetting gap in `deferred-work.md`. AC #3 not meaningfully exercisable until AC #1 exists.

### File List

None — no files changed.

## Change Log

- 2026-08-06: Assessed against the existing mock; AC #2 satisfied as a mock stand-in, AC #1 (real syntax highlighting) logged as an addressable gap, AC #3 not yet meaningfully exercisable. Status: done.
