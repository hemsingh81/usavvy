# Accessibility Review — Usavvy UX Spec (DESIGN.md + EXPERIENCE.md)

**Reviewed:** `DESIGN.md`, `EXPERIENCE.md` (ux-USavvy-2026-08-04)
**Bar being checked against:** WCAG 2.1 AA (NFR-8), full keyboard operation of the Board with SR labels on every control, always-synced captions/transcript (NFR-9), `prefers-reduced-motion` without content loss (NFR-10), 200% text scaling + dyslexia font toggle (NFR-11), AA color contrast on every token pairing (PRD flags indigo-on-teal as a known risk).

**Verdict:** Not yet AA-safe as specified. The spec is unusually accessibility-literate in its *stated intentions* (live regions, focus management, reduced-motion, Radix-primitives recommendation, minor-consent gating) — but several token pairings the spec asserts as AA-safe are not, by direct calculation from the published hex values, and the coverage of the full Board control set is stated as a blanket principle rather than demonstrated per-control. Highest-priority gap: the specified keyboard-focus color collapses to near-invisibility on the Board's own dark surface — a failure on exactly the interaction (keyboard operation of the Board) the PRD treats as non-negotiable.

All contrast ratios below were computed directly from the hex values in `DESIGN.md`'s `colors:` block using the WCAG relative-luminance formula (not estimated).

---

### 1. [CRITICAL] Keyboard-focus color collapses to ~2:1 on the Board's own dark surface

- **Location:** `DESIGN.md` colors block (`primary: #4338CA`, `board-dark-surface: #1E1B4B`, `board-dark-bg: #14123B`, lines 9, 41-42); Colors section line 164 ("Primary — ... focus states"); `EXPERIENCE.md` Interaction Primitives, "Focus management" (line 76).
- **Note:** `DESIGN.md` names `primary` (#4338CA) as the product's focus-state color with no board-specific override. Computed contrast of `primary` against `board-dark-surface` (#1E1B4B) is **~2.0:1**, and against `board-dark-bg` (#14123B) is **~2.25:1** — both far below the 3:1 minimum WCAG 1.4.11 requires for UI-component/focus-indicator visibility. Both colors are dark, saturated indigos with very similar luminance, so a focus ring styled in `primary` against the Board's default dark canvas would be effectively invisible. This is precisely the surface where NFR-8 ("full keyboard operation of a canvas-heavy interactive Board") is hardest and most safety-critical, and where the spec's own emphasis on keyboard-first operation (space to pause, arrows to step Beats) depends on the learner being able to *see* where focus currently is on the floating control bar (which itself sits on `board-dark-surface`, per the `board-control-bar` component token).
- **Fix:** Define a distinct, board-specific focus-indicator token (e.g., a light/white-based ring, or the existing `board-dark-on-surface` #E8E7FF, which clears >10:1 against both board-dark tokens) for use whenever focus lands inside the Board canvas or control bar, and reference it explicitly in the `board-control-bar` component spec rather than inheriting the global `primary` focus token. Verify the Board Light "Paper" mode's focus color separately (not checked here, but should not be assumed safe by extension).

### 2. [HIGH] Accent-orange button text fails 4.5:1 body-text contrast; the doc's own AA claim is not accurate for this pairing

- **Location:** `DESIGN.md` colors block (`accent: #EA580C`, `on-accent: #FFFFFF`, lines 17-18); Components > `button-primary` (lines 119-123); Colors section's compliance claim (line 170: "All pairings are chosen to clear WCAG 2.1 AA... 4.5:1 body text, 3:1 large text/UI").
- **Note:** White text on `accent` (#EA580C) computes to **~3.56:1** — it clears the 3:1 large-text/UI-component floor but fails the 4.5:1 body-text floor. `button-primary` is explicitly the styling for "Explain more" (Components line 196: "always styled as a primary-weight action"), the single most emphasized, most-frequently-clicked control in the product per Principle 6 — and nothing in the spec puts its label at the 18.66px-bold/24px-normal size that would qualify as "large text." At any normal button-label size (13-17px per the type scale), this pairing fails AA. The doc's blanket claim that "all pairings... clear WCAG 2.1 AA" is therefore not true as written.
- **Fix:** Either shift `accent` toward a darker orange (orange-700-equivalent) that clears 4.5:1 with white text, or explicitly mandate large-text sizing/weight for any text rendered directly on an `accent` fill, and correct the blanket compliance claim to name the actual constraint.

### 3. [HIGH] `warning` and `success` have no safe-text container pairing and fail 4.5:1 as direct text — unlike every other semantic/brand color

- **Location:** `DESIGN.md` colors block, lines 21-28 (`error`/`error-container` has a container pair; `warning` and `success` do not).
- **Note:** `primary`, `secondary`, `accent`, and `error` all get `-container`/`on-*-container` pairs verified safe for text use (computed 7.5-9.3:1 range). `warning` (#D97706) and `success` (#16A34A) do not get container pairs, and computed directly against white/surface they measure **~3.19:1** and **~3.30:1** respectively — both fail 4.5:1 body text, only clearing the 3:1 large-text/graphical-object floor. Nothing in either doc restricts `warning`/`success` to icon/border/fill-only usage, so as specified, an implementer is free to use either as inline text color (e.g., a field warning message, a "criterion met" label) and produce a contrast failure.
- **Fix:** Add `warning-container`/`on-warning-container` and `success-container`/`on-success-container` pairs mirroring `error`'s pattern, or explicitly restrict the base `warning`/`success` tokens to non-text usage in the Do's/Don'ts section.

### 4. [HIGH] Live-region strategy for progressively-written Beat text is unspecified at the level that determines whether it's usable

- **Location:** `EXPERIENCE.md` Interaction Primitives, "Live-region announcements" (line 75); Foundation, word-level narration timing (line 15).
- **Note:** The spec states only that Beat text is "exposed to screen readers via an ARIA live region synced to the visual reveal — not just present in the DOM after the fact." Given the Foundation section describes "word-level narration timing" as the streaming granularity, a literal implementation (live region mutating on every word) would cause most screen readers to re-announce the growing text block on each mutation — producing overlapping, queued, or truncated speech, not an intelligible reading-along experience. This is compounded by an unaddressed second problem: the Avatar simultaneously narrates via audio (per Foundation), so a screen-reader user would potentially hear the SR voice and the Avatar's TTS/audio talking over each other with no mention of how (or whether) that's resolved. Neither the live-region's ARIA politeness setting (`polite`/`assertive`/`off`), nor its update granularity (per-word vs. per-sentence vs. per-Beat), nor its relationship to the "always-available" Transcript panel as an alternative channel is specified.
- **Fix:** Specify update granularity (e.g., announce per completed sentence or per Beat, not per word), specify politeness level, and explicitly resolve the dual-audio-source problem — e.g., treat the Transcript panel (already correctly named as the caption surface for NFR-9) as the primary screen-reader channel, with the live region limited to sparse status updates (Beat started/completed) rather than word-by-word text.

### 5. [MEDIUM] Full Board control set's keyboard/SR coverage is asserted at the "every control" blanket level, not demonstrated per control

- **Location:** `EXPERIENCE.md` Component Patterns (lines 49-61, naming Pause/Resume, Replay, Back/Forward, Speed/Volume/Voice, Transcript toggle, "I'm confused," Explain-more cluster + sub-items, Source, Checkpoint, Skip/Restart); Interaction Primitives (lines 72-77); Accessibility Floor (line 81).
- **Note:** Only two mappings are concrete: space to pause/resume, arrow keys to step Beats (line 74). Everything else — speed/volume/voice, the Explain-more cluster (deeper/simpler/different example/more examples/analogy/ask-anything), "I'm confused," Source, Skip/Restart confirm, bookmark, checkpoint interaction, Transcript toggle — is named as an existing control in Component Patterns but its keyboard trigger and accessible-name content are never stated. Coverage rests entirely on two generic sentences ("every control... reachable and operable via keyboard alone," "every Board control has a screen-reader label") rather than being traceable to each control. A "documented shortcut list" is referenced (line 74) but not enumerated anywhere in the spec itself, so there's no way to verify from this document that the full set is actually covered.
- **Fix:** Add a control-by-control accessibility table (control → keyboard trigger → accessible name/role → focus behavior) covering at minimum: pause/resume, replay, back/forward, speed/volume/voice, explain-more cluster + each sub-item, I'm confused, source, skip/restart, bookmark, checkpoint, transcript — before this reaches implementation, so "every control" is a checkable claim rather than an assertion.

### 6. [MEDIUM] Reduced-motion guidance omits incremental diagrams, whose staged reveal may itself be pedagogical content, not decoration

- **Location:** `DESIGN.md` Brand & Style (line 160) and Do's/Don'ts (line 209) both list "progressive writing, incremental diagrams, spotlight/dim" as the Board's three "alive" behaviors; but the reduced-motion rule (Do's/Don'ts line 208, and `EXPERIENCE.md` Accessibility Floor line 81) only names progressive-writing, spotlight/dim, star pops, and streak fills — incremental diagrams are never mentioned in either reduced-motion statement.
- **Note:** For progressive text, "disable animation, keep content" is unambiguous (show the full text). For an incremental diagram, it's genuinely ambiguous: does reduced-motion mean instantly rendering the finished diagram (which may silently drop the step-by-step derivation sequence that, on a "board is the product" platform, is arguably the actual teaching content, not mere motion flourish), or does it require a non-animated but still learner-steppable reveal (e.g., click/arrow-key advances each stage)? The "never drop content" principle is in real tension with "disable animation" here in a way it isn't for text, and the spec doesn't pick a resolution.
- **Fix:** State explicitly how incremental diagrams behave under `prefers-reduced-motion` — most likely a manually-steppable, non-animated reveal that preserves stage order rather than an instant full-reveal. Also confirm whether the Avatar presence indicator's idle motion is exempt as essential status feedback rather than decorative motion (currently unaddressed).

### 7. [MEDIUM] Progress Disclosure text placement relative to its teal fill is unspecified, and one placement fails AA

- **Location:** `DESIGN.md` Components > `progress-disclosure` (lines 133-136); Colors section line 170 ("teal only appears as fills with dark-neutral or white text on top"); Components section line 197.
- **Note:** The required "completed N of M studied, X skipped" text (a hard rule per Epic 4 Story 4.5) is never pinned to a location relative to the `secondary` (teal) fill bar. If rendered as normal-size white text overlaid directly on the fill (a common progress-bar pattern, and one the Colors section's own "white text on top" language seems to invite), computed contrast is **~3.75:1** — below 4.5:1 for body text, only clearing the 3:1 large-text/UI floor. If instead rendered beside/below the bar on a neutral surface, it's safe by a wide margin.
- **Fix:** Specify that the disclosure text renders beside or below the fill (on `surface`/`surface-dim`, not overlaid on `secondary`), or if overlay is intended, mandate large-text sizing sufficient to clear the 3:1 floor.

### 8. [LOW/MEDIUM] Avatar Presence Indicator has no accessible-state model for its idle/listening/speaking/thinking states

- **Location:** `DESIGN.md` `avatar-presence` tokens (lines 143-146) and Components (line 198); absent from `EXPERIENCE.md` Accessibility Floor or Interaction Primitives entirely.
- **Note:** The indicator is defined purely as a color/motion swap (teal/coral/indigo) and is deliberately "never a face" (a good decision on its own terms per PRD §19.1) — but that also means there's no specified way for a screen-reader or low-vision user to know the Avatar's current state, since color alone carries the signal.
- **Fix:** Add an accessible-name or polite-live-region status pattern for Avatar state transitions (e.g., "Avatar is speaking" / "listening" / "thinking") so the state is available non-visually.

### 9. [LOW/MEDIUM] 200% text scaling isn't walked through against the Board's own zoom/pan at the 360px floor

- **Location:** `EXPERIENCE.md` Accessibility Floor (line 81, "text scales to 200% without breaking layout"); Foundation (line 11, 360px floor and simplified mobile control set).
- **Note:** The Board already has its own zoom/pan mechanism (FR-B-31) independent of browser/OS text zoom. At the narrow end of the supported viewport range (360px) with a persistent floating control bar, stacking 200% OS-level text zoom on top of the Board's own zoom is a specific hard case the spec asserts is handled but never demonstrates (does the control bar reflow or clip, do the two zoom mechanisms conflict, does content require double-scrolling).
- **Fix:** Add a concrete statement of Board layout behavior at 360px + 200% text zoom, including control-bar reflow behavior.

### 10. [LOW] No bypass-blocks / skip-to-Board-canvas mechanism specified

- **Location:** `EXPERIENCE.md` Information Architecture (lines 19-21).
- **Note:** The persistent primary nav (Home/Catalog/My Learning/Cohorts/Assignments/Notes + profile menu) sits ahead of the Board on every entry into a session; WCAG 2.4.1 (bypass blocks) expects a way to skip repeated navigation, which isn't mentioned anywhere in either document.
- **Fix:** Add a skip-to-board-canvas / skip-to-main-content affordance to the IA or Accessibility Floor section.

### 11. [LOW] Keyboard-shortcut-list ("?") affordance omitted from the focus-trap modal list

- **Location:** `EXPERIENCE.md` Interaction Primitives, "Focus management" (line 76, names checkpoint, skip/restart confirm, and cohort side panel only) vs. the "?" shortcut list referenced in the same section (line 74).
- **Note:** Minor but easy to lose in implementation — the shortcut-list overlay is itself presumably a modal/panel and should get the same trap-and-return focus treatment as the three named ones.
- **Fix:** Add it explicitly to the focus-trap list.

---

## Summary table

| # | Severity | Title |
|---|---|---|
| 1 | Critical | Focus color ~2:1 on Board dark surface |
| 2 | High | Accent-on-white button text ~3.56:1, fails body-text AA |
| 3 | High | warning/success lack safe-text container pairs, fail 4.5:1 as text |
| 4 | High | Beat-text live region strategy unspecified / likely unusable as described |
| 5 | Medium | Board control keyboard/SR coverage stated as principle, not itemized |
| 6 | Medium | Reduced-motion rule omits incremental diagrams |
| 7 | Medium | Progress Disclosure text-on-fill placement unspecified, one placement fails AA |
| 8 | Low/Medium | No accessible-state model for Avatar presence indicator |
| 9 | Low/Medium | 200% zoom vs. Board's own zoom/pan at 360px not walked through |
| 10 | Low | No skip-to-Board-canvas bypass mechanism |
| 11 | Low | "?" shortcut overlay omitted from focus-trap list |
