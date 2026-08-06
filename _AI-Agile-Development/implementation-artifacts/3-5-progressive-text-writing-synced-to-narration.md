---
baseline_commit: a31e8ff45982d2e1f138e34a709a61ea60cdde1f
---

# Story 3.5: Progressive Text Writing Synced to Narration

Status: done

*(Epic 3, FR-B-25. Per explicit user decision (2026-08-06): Stories 3.5-3.10 all require content the mock's own file header already names as a stand-in for exactly this — word/line/element-level narration-synced rendering — and all genuinely depend on a real `GenerationPort`/`VoicePort` provider, which `ARCHITECTURE-SPINE.md`'s Deferred section marks as "not yet chosen... not yet funded." Rather than block Epic 3 on an unfunded provider decision, or fabricate a fake provider choice unilaterally, the user chose to mark this block of stories done against the EXISTING mock stand-in, documented honestly — no new code this story, only this assessment.)*

## Story

As a learner,
I want lesson text to appear progressively with emphasis synced to narration,
so that I can visually follow along with what's being spoken.

## Acceptance Criteria

1. **Given** a Beat begins narrating text content **When** narration audio plays **Then** the corresponding text is written onto the board progressively — word by word or phrase by phrase — timed to the word-level timing supplied with the narration audio
2. **Given** a word or phrase is marked for emphasis in the Beat content **When** that word/phrase is narrated **Then** it is visually emphasized (highlight/bold/underline) in sync with the audio, then returns to normal style once narration moves on
3. **Given** the board is paused mid-text **When** paused **Then** only the text written up to the paused narration offset is visible; text beyond that point is not shown
4. **Given** narration audio fails to stream (VoicePort error) **When** the failure occurs **Then** the full Beat text is still rendered on the board without word-synced timing, and a non-blocking notice indicates audio is unavailable

## Assessment against the existing mock

`apps/web/src/modules/board/BoardPage.tsx`'s `renderTextBlock`/progressive-reveal timer (built in the Epic 3 mock-first UX pass, extended by Stories 3.1-3.4) already implements the *interaction shape* of ACs #1-#3 as a deliberate stand-in — the file's own header names this explicitly: *"narration is simulated by a plain progressive-reveal timer, not real audio."*

- **AC #1 (progressive word-by-word writing) — satisfied as a mock stand-in, not as the real thing.** `revealedUnits`/`REVEAL_TICK_MS` reveal text word-by-word on a fixed timer. This is genuinely NOT "timed to the word-level timing supplied with the narration audio" — there is no real narration audio anywhere in this codebase, and no `VoicePort` implementation returns word-level timing data (the mock adapter from Story 3.1 returns only an opaque `streamRef` placeholder). The visual *behavior* a learner sees (words appearing progressively) matches the AC's spirit; the actual timing *source* does not, and cannot, until a real TTS provider with word-level timestamps is chosen.
- **AC #2 (emphasis synced to narration) — partially satisfied.** `renderTextBlock` wraps emphasized phrases in `<mark>` once revealed (`mockBoardData.ts`'s `emphasis` field). This shows emphasis at the right moment relative to the mock's own reveal timer, but "synced to the audio" has no real audio to sync to, same caveat as AC #1.
- **AC #3 (paused mid-text shows only revealed-so-far) — genuinely satisfied**, independent of the real-audio caveat: `isPaused` freezes `revealedUnits`, and the render only ever shows `revealedUnits` worth of content (`BeatContent`/`renderBlock`). This behavior is real and correct regardless of what drives the reveal clock.
- **AC #4 (VoicePort failure → full text renders, non-blocking notice) — NOT satisfied, even as a mock stand-in.** `BoardPage.tsx` never calls `VoicePort` at all (it's 100% disconnected from `services/board-orchestration`, per every prior Epic 3 story's own CRITICAL SCOPE NOTE) — there is nothing to fail, and no failure-notice UI exists. Logged to `deferred-work.md`.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Completion Notes List

- No new code this story — an assessment against already-existing mock behavior, per explicit user decision to mark Stories 3.5-3.10 done-via-mock rather than block on an unfunded real-provider decision.
- AC #3 is genuinely, fully satisfied today. ACs #1/#2 are satisfied in *visual behavior* but not in *mechanism* (no real audio/word-timing exists to actually sync to) — this is an honest limitation, not a hidden gap; it will only be resolved once a real `GenerationPort`/`VoicePort` provider is chosen (unfunded, per `ARCHITECTURE-SPINE.md`'s Deferred section) and Beat content generation includes word-level timing metadata (a data-contract decision that hasn't been made yet either).
- AC #4 is a genuine, real gap — logged to `deferred-work.md` — since it requires a real `VoicePort` call site in the frontend, which doesn't exist at all today (a future rewiring story's job, same as every prior Epic 3 story's own deferred "rewire `BoardPage.tsx` onto real data" item).

### File List

None — no files changed.

## Change Log

- 2026-08-06: Assessed against the existing mock per explicit user decision; ACs #1-#3 satisfied as a mock stand-in (AC #3 fully, ACs #1/#2 in visual behavior only), AC #4 logged as a genuine gap in `deferred-work.md`. Status: done.
