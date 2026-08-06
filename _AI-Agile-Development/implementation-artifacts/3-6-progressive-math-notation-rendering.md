---
baseline_commit: a31e8ff45982d2e1f138e34a709a61ea60cdde1f
---

# Story 3.6: Progressive Math Notation Rendering

Status: done

*(Epic 3, FR-B-26. Part of the Stories 3.5-3.10 block — see Story 3.5's header for the full context on why this is a mock-assessment story, not new code, per explicit user decision 2026-08-06.)*

## Story

As a learner,
I want math notation to render progressively as it's explained,
so that I can follow multi-step formulas without being overwhelmed.

## Acceptance Criteria

1. **Given** a Beat contains LaTeX/MathML content **When** the Beat renders **Then** the math notation is rendered as properly typeset math, not raw markup
2. **Given** a math expression has multiple lines or steps **When** narration explains it **Then** each line is revealed progressively, in sync with narration reaching that line, rather than showing the full expression at once
3. **Given** a math expression fails to parse or render **When** rendering is attempted **Then** a fallback plain-text representation of the expression is shown instead of a blank or broken element, and the error is logged

## Assessment against the existing mock

`BoardPage.tsx`'s `renderBlock`'s `"math"` case renders `mockBoardData.ts`'s math Beat (`MOCK_CONCEPT.beats[4]`, the factorial-growth Beat) inside a `<pre className="usavvy-board-block-math">`, revealing `block.lines.slice(0, revealedInBlock)` progressively.

- **AC #1 (properly typeset math, not raw markup) — NOT satisfied, even as a mock stand-in.** The mock's math lines are literal strings like `"n! = n \\times (n-1) \\times ..."`, rendered as plain monospace text — a learner sees the raw LaTeX-ish syntax (`\times`, `\cdots`), not typeset notation. No math-typesetting library (e.g. KaTeX, MathJax) is wired in anywhere in this codebase. This is a genuine gap, not a deferred-provider limitation — typesetting a given LaTeX string doesn't need a real `GenerationPort`/`VoicePort` provider at all, only a rendering library choice and integration work, which is squarely a future story's job (out of scope for this documentation-only pass per the user's decision, but worth flagging as the one AC here that ISN'T blocked on the funding question).
- **AC #2 (progressive line-by-line reveal) — genuinely satisfied.** Real, working behavior today, independent of any provider question.
- **AC #3 (fallback on parse failure, error logged) — not applicable/not satisfied.** There is no math-parsing/rendering step to fail (plain text can't fail to parse) — this AC only becomes meaningful once AC #1's real typesetting library exists.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- No new code this story. AC #2 is genuinely satisfied. AC #1 is a real, addressable gap (a rendering-library integration, not a funding-blocked provider decision) — logged to `deferred-work.md` distinctly from the audio/timing-dependent gaps in Stories 3.5/3.7, since this one doesn't actually need a chosen `GenerationPort`/`VoicePort` provider to fix. AC #3 depends on AC #1 existing first.

### File List

None — no files changed.

## Change Log

- 2026-08-06: Assessed against the existing mock; AC #2 satisfied, AC #1 (real math typesetting) logged as an addressable gap distinct from the provider-funding-blocked items, AC #3 not yet applicable. Status: done.
