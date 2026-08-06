---
baseline_commit: e66ee8f52961b577a952633889fb6c7fd7b68237
---

# Story 3.12: Speed, Volume, and Voice Controls

Status: done

*(Epic 3, FR-B-10. A mixed story like 3.5-3.10: some ACs are already satisfied by the existing mock, one is genuinely buildable now (session persistence, no provider needed), and one is provider-blocked (real `VoicePort` voice selection). Assessed honestly per-AC rather than treated as one monolithic block. Read the CRITICAL SCOPE NOTE before starting any task.)*

## Story

As a learner,
I want to control narration speed, volume, mute, and voice,
so that I can tailor the listening experience to my preference.

## Acceptance Criteria

1. **Given** narration is available for playback **When** I adjust the speed control **Then** the playback rate changes to the selected value within 0.75x–1.5x, applied immediately to current and subsequent narration without needing to restart the Beat
2. **Given** narration is playing **When** I adjust the volume slider or select mute **Then** the audio volume changes accordingly, or audio is silenced, while board animation and text sync continue unaffected
3. **Given** at least 2 distinct voice options exist **When** I select a different voice **Then** subsequent narration, from the next played segment, uses the newly selected voice, requested from `VoicePort` with my locale
4. **Given** I change speed, volume, or voice mid-session **When** I navigate away and return, or reload **Then** my selected preferences persist for the remainder of the session

## CRITICAL SCOPE NOTE — read before starting any task

**Confirmed by reading `BoardPage.tsx` in full before starting.**

- **AC #1 (speed 0.75x-1.5x, applied immediately, no Beat restart) — already genuinely, fully satisfied by the existing mock, confirmed by reading the code, not assumed.** The speed `<select>` already offers exactly `0.75/1/1.25/1.5`, and the reveal-timer `useEffect` already has `speed` in its dependency array (`REVEAL_TICK_MS / speed`), so a change takes effect on the very next tick — no Beat restart, no other code change needed for this AC.
- **AC #2 (volume slider, mute silences audio, board/text sync unaffected) — partially satisfied, honestly.** A Mute toggle already exists (`aria-pressed`) and is already fully decoupled from the reveal timer (muting has zero effect on `revealedUnits`/the tick effect today) — the "board animation and text sync continue unaffected" half of this AC is trivially, genuinely true. There is no volume SLIDER (only a binary mute), and there is no real audio anywhere in this codebase for either mute or a slider to actually control — this half is the same provider-blocked limitation as Stories 3.5-3.10 (no real `VoicePort` audio stream exists to silence or attenuate). Don't build a volume slider that controls nothing real; note this honestly instead.
- **AC #3 (voice selection "requested from `VoicePort` with my locale") — NOT satisfied, provider-blocked.** The voice `<select>` exists (2 options) but changing it doesn't call anything — there is no `VoicePort` call site anywhere in `apps/web` (every prior Epic 3 story's own scope note has said the same). Note honestly; this is Stories 3.5-3.10's exact class of limitation, not a new one.
- **AC #4 (persist speed/volume/voice for the remainder of the session, across navigate-away/reload) — genuinely buildable now, and this story's actual new code.** This needs no `VoicePort`/provider at all — just `sessionStorage` (the correct browser API for "remainder of the session," as distinct from `localStorage`'s cross-session persistence or a bare in-memory `useState`, which loses state on reload). Persist `{ speed, muted, voice }` as one JSON blob under one storage key, restored on mount. This is this story's one real implementation task.
- **Don't build real volume attenuation, a real slider, or a real `VoicePort` voice-selection call** — all three need a real audio pipeline that doesn't exist yet; building UI for them now would be building controls for something that can't actually do anything, the same "don't build ahead of need" reasoning already applied repeatedly across Epic 3.

## Tasks / Subtasks

- [x] **Task 1: Persist speed/muted/voice preferences to `sessionStorage`** (AC: #4)
  - [x] `apps/web/src/modules/board/BoardPage.tsx`: on mount, read a single JSON blob from `sessionStorage` (a module-level constant key, e.g. `usavvy-board-preferences`) and use its `speed`/`muted`/`voice` values as the initial state for those three `useState` calls (falling back to today's defaults — `1`, `false`, `VOICES[0]` — if nothing is stored, the stored JSON is malformed, or `sessionStorage` itself throws, e.g. in a locked-down/private-browsing context). On every change to any of the three, write the updated `{ speed, muted, voice }` blob back to `sessionStorage` (a single `useEffect` keyed on all three is simplest — don't write three separate keys).
  - [x] Tests (extend `apps/web/tests/modules/board/BoardPage.test.tsx`): changing speed/mute/voice and then unmounting and re-rendering `BoardPage` (simulating "navigate away and return, or reload" within the same test's `sessionStorage`, which `jsdom` provides for real — this one, unlike several of Story 3.4/3.11's scroll/layout limitations, IS fully testable) restores the previously-selected values, not the defaults. A malformed/missing `sessionStorage` entry falls back to today's defaults without throwing.

## Dev Notes

### Scope note: what's explicitly OUT of scope for this story

- **A real volume slider or real audio attenuation** — no real audio pipeline exists; see CRITICAL SCOPE NOTE.
- **A real `VoicePort` call when the voice selector changes** — provider-blocked, same class of limitation as Stories 3.5-3.10.
- **Cross-session (beyond "remainder of the session") persistence** — the AC's own wording is explicit about session-scoped persistence; `localStorage`/profile-level persistence is a different, larger feature not asked for here.

### References

- [Source: `_AI-Agile-Development/planning-artifacts/epics.md` — Story 3.12, FR-B-10 (lines ~970-988)]
- [Source: `apps/web/src/modules/board/BoardPage.tsx` — the exact file this story extends]
- [Source: `_AI-Agile-Development/implementation-artifacts/deferred-work.md` — "Deferred from: Stories 3.5-3.10 mock assessment," the precedent for this story's own honest per-AC assessment style]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

None — no blocking failures. One test-isolation fix along the way: `jsdom`'s `sessionStorage` is shared across every test within this file (no real page reload between `it()` blocks), so without clearing it in `afterEach`, an earlier test's stored preferences would leak into a later test's `renderBoard()` — added `sessionStorage.clear()` alongside the existing `cleanup()`. Full `BoardPage.test.tsx` suite re-run twice for stability — 301/301 both times.

### Completion Notes List

- AC #1 required no code change — confirmed genuinely, fully satisfied by reading the existing speed `<select>`/tick-effect dependency array, not assumed. ACs #2/#3 are honestly documented as provider-blocked/partial in the CRITICAL SCOPE NOTE, matching Stories 3.5-3.10's own established assessment style — no volume slider or `VoicePort` call was built, since neither would control anything real yet.
- AC #4 is this story's one real implementation: `sessionStorage`-backed persistence for `{ speed, muted, voice }` as a single JSON blob, read once via a lazy `useState` initializer (avoiding a one-frame flash of defaults before the stored value applies) and written on every change via one `useEffect`. Both the read and write paths guard against `sessionStorage` throwing (malformed JSON, quota, private-browsing) by falling back to defaults rather than crashing the page — a best-effort convenience feature, not a case AD-17's "no silent failures" applies to (there's no user-facing operation being silently swallowed; a missing/corrupt preference blob just means starting from defaults, which is already the first-visit experience).
- Self-reviewed the diff directly (no separate adversarial-review agent, given the small, single-purpose, well-isolated scope — a pure `sessionStorage` read/write with defensive try/catch on both sides) and found one worth tightening on inspection: `loadStoredPreferences` validated `speed`'s TYPE (`number`) but not that it was one of the actual allowed options, unlike `voice`'s own stricter `VOICES.includes(...)` check right next to it — a stale/tampered speed value outside `[0.75, 1, 1.25, 1.5]` would have rendered the `<select>` with no visible selection. Added a matching `SPEED_OPTIONS.includes(...)` check and a test for it.
- Full validation: `pnpm -r typecheck` (9/9 clean, this story only touches `apps/web`), `BoardPage.test.tsx`/full `apps/web` suite re-run three times total for stability (302/302 every time after the speed-validation fix — up from 299; 3 new tests), `pnpm lint` (clean).

### File List

- `apps/web/src/modules/board/BoardPage.tsx` (modified — `PREFERENCES_STORAGE_KEY`/`BoardPreferences`/`DEFAULT_PREFERENCES`/`loadStoredPreferences`/`SPEED_OPTIONS`, lazy-initialized `speed`/`muted`/`voice` state, a persistence `useEffect`)
- `apps/web/tests/modules/board/BoardPage.test.tsx` (modified — `sessionStorage.clear()` added to `afterEach`; 3 new tests: persists-across-unmount-remount, falls-back-on-malformed-storage, falls-back-on-out-of-range-speed)
- `_AI-Agile-Development/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-08-06: Story implementation completed (Task 1): added `sessionStorage`-backed persistence for speed/mute/voice preferences (AC #4) — the one genuinely buildable piece of this story; ACs #1-#3 assessed honestly (AC #1 already satisfied, ACs #2/#3 provider-blocked/partial, matching Stories 3.5-3.10's established assessment style). Fixed a test-isolation gap (shared `jsdom` `sessionStorage` across tests) along the way. Full `pnpm -r typecheck`/`apps/web` test suite (×2)/`pnpm lint` verified clean. Status: done.
