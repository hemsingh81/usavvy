# Epic 3 mock-first UX pass — the Interactive Board

Status: presented for sign-off

*(Process step per `ARCHITECTURE-SPINE.md`'s "Mock-first epic kickoff" convention and `sprint-change-proposal-2026-08-06.md` — not an AC-bearing story with its own FR, a prerequisite gate before Story 3.1 and any other Epic 3 backend work starts. Deliverable: a click-through, mocked-data UI covering the Board's core learner journey, presented for explicit sign-off before backend work begins.)*

## Scope: what this pass covers

Epic 3 has 32 stories. Mocking every control at full fidelity before any sign-off would defeat the point of a fast UX-validation pass. This mock covers the **core journey** — the loop a learner actually lives in most of the time — and represents the rest more lightly or not at all, noted below.

**In scope (click-through, interactive, mocked data — no backend, no real AI/audio):**
- Landing on a Concept's board (Story 3.1's entry point)
- Progressive text reveal synced to a simulated narration timer, with emphasis (3.5)
- Multi-modal content on the same board: text, math, a code block, a diagram, a table (3.6-3.9, approximated with plain HTML/CSS — no new npm dependency; a real KaTeX/Prism/diagram library is a decision for those stories' own backend work, not this mock)
- Board Control Bar (per `DESIGN.md`): Pause/Resume, Replay, Back/Forward between Beats, Speed/Volume/Voice controls, Transcript toggle (3.1-3.3, 3.12)
- The "Explain more" expandable cluster: Explain deeper, Explain simpler, Different example, More examples, Explain with an analogy, Ask anything, "I'm confused" (3.15-3020, 3.22) — each swaps in a mocked alternate Beat
- Concept-boundary checkpoint questions with immediate mocked feedback (3.13)
- Searchable transcript panel (3.30)
- Source-for-this-Beat affordance (3.29)
- Bookmark-with-note and Restart-concept controls, as reachable actions (3.28, 3.27)

**Represented lightly (present but simplified — not full-fidelity in this pass):**
- Board zoom/pan/infinite-scroll (3.4) — a simple linear scroll with gutter markers, not true infinite-canvas zoom/pan
- Spotlight/dimming (3.11) — a lightweight highlight on the active element, not full canvas dimming
- Avatar presence indicator — a simple animated waveform mark (per `DESIGN.md`'s explicit "never a face" instruction), 3 states

**Out of scope for this pass** (no AC-bearing behavior to mock yet, or purely backend-logic stories with no distinct visual journey):
- Voice input push-to-talk (3.21) — a mic button is present, no real audio capture
- Per-concept explanation history, auto-drop-difficulty, confusion-to-prerequisite-refresher (3.23-3.26) — backend-logic-heavy, revisit once their own stories start
- Export as PNG/PDF/study summary (3.31) — a button is present, no real export
- Learner annotation (3.32)

## Deliverable

- `apps/web/src/modules/board/mockBoardData.ts` — one sample Concept, several Beats mixing every content type above, plus checkpoint questions and transcript entries.
- `apps/web/src/modules/board/BoardPage.tsx` (+ supporting components) — the interactive mock, reachable at `/courses/:id/board` via a new entry link on `CourseDetailPage`.
- Component tests for the interactive behaviors that have real client-side logic (pause/resume state, back/forward navigation, explain-more swapping the active Beat, checkpoint submission feedback).
- Live browser walkthrough (screenshots) presented to the user, who then explicitly signs off before Story 3.1's real backend work begins.

## Verification

- `pnpm -r typecheck`, `pnpm lint`, and the full `apps/web` test suite (277 tests, including 12 new `BoardPage` tests exercising real client-side reveal/pause/resume/replay/navigation/explain-more/checkpoint/transcript/bookmark logic) all pass clean.
- Verified live in the browser end-to-end: logged in, browsed to a (test-fixture) published catalog course, clicked through from `CourseDetailPage` into the board, and walked the full core journey — progressive text/code/diagram/table/math rendering, pause/resume, replay, back/forward between Beats, the "Explain more" cluster (analogy detour, with a working "back to lesson"), the concept-boundary checkpoint (both questions, immediate feedback, completion), and the Progress Disclosure count staying accurate (an "explain more" detour no longer inflates it — caught and fixed during this verification pass).
- A test-fixture published course ("Intro to Recursion") was inserted directly into the dev DB to reach the flow through the real `CourseDetailPage` entry point — harmless mock catalog data, left in place so it's immediately clickable for review; remove it later if it's not wanted.

## Sign-off

Presented to the user 2026-08-06 — awaiting explicit go-ahead before Story 3.1 and Epic 3's real backend work begins.
