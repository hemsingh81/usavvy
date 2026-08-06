---
name: 'Usavvy'
description: 'Interactive AI-tutor learning platform — a calm, credible study companion, not a chat app wearing a mascot.'
status: final
created: '2026-08-04'
updated: '2026-08-06'
sources: ['Doc/00-Requirement.md', '_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md', '_AI-Agile-Development/planning-artifacts/epics.md']
colors:
  primary: '#4338CA'
  on-primary: '#FFFFFF'
  primary-container: '#E0E7FF'
  on-primary-container: '#312E81'
  secondary: '#0F766E'
  on-secondary: '#FFFFFF'
  secondary-container: '#99F6E4'
  on-secondary-container: '#134E4A'
  accent: '#C2410C'
  on-accent: '#FFFFFF'
  accent-container: '#FFEDD5'
  on-accent-container: '#7C2D12'
  error: '#DC2626'
  on-error: '#FFFFFF'
  error-container: '#FEE2E2'
  on-error-container: '#7F1D1D'
  warning: '#D97706'
  on-warning: '#FFFFFF'
  warning-container: '#FEF3C7'
  on-warning-container: '#78350F'
  success: '#16A34A'
  on-success: '#FFFFFF'
  success-container: '#DCFCE7'
  on-success-container: '#14532D'
  focus-ring: '#4338CA'
  focus-ring-on-dark: '#E8E7FF'
  surface: '#FFFFFF'
  surface-dim: '#E7E5EF'
  surface-container-low: '#F7F6FB'
  surface-container: '#F0EEF7'
  surface-container-high: '#E7E4F1'
  on-surface: '#1B1B23'
  on-surface-variant: '#4B4A57'
  outline: '#79778A'
  outline-variant: '#CAC8D6'
  background: '#FAFAFC'
  on-background: '#1B1B23'
  board-dark-bg: '#14123B'
  board-dark-surface: '#1E1B4B'
  board-dark-on-surface: '#E8E7FF'
  board-light-bg: '#FAF9F4'
  board-light-surface: '#FFFFFF'
  board-light-on-surface: '#1E1B2E'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.25'
  headline-sm:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: '1.6'
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  button-label:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: '1.3'
    note: 'The size/weight button-primary and button-secondary text renders at — pinned explicitly since accent-fill contrast (Colors section) was verified against this exact size, not left to whichever role a component happened to inherit.'
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  board-narration:
    fontFamily: Inter
    fontSize: 19px
    fontWeight: '400'
    lineHeight: '1.65'
  code:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.55'
  dyslexia-alt:
    fontFamily: Atkinson Hyperlegible
    note: 'Full-family swap when the learner enables the dyslexia-friendly preference (NFR-11); applies to body/board-narration/label roles, not code or display.'
rounded:
  sm: 6px
  DEFAULT: 10px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
spacing:
  unit: 4px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '10': 40px
  '12': 48px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
components:
  button-primary:
    background: '{colors.accent}'
    color: '{colors.on-accent}'
    radius: '{rounded.DEFAULT}'
    padding: '{spacing.3} {spacing.6}'
  button-secondary:
    background: 'transparent'
    color: '{colors.primary}'
    border: '1px solid {colors.outline}'
    radius: '{rounded.DEFAULT}'
  board-control-bar:
    background: '{colors.board-dark-surface}'
    radius: '{rounded.lg}'
    elevation: 'floating'
  progress-disclosure:
    fill: '{colors.secondary}'
    track: '{colors.surface-dim}'
    skipped-indicator: '{colors.outline}'
  star-badge:
    fill: '{colors.accent}'
    icon-color: '{colors.on-accent}'
  streak-flame:
    fill: '{colors.accent}'
    frozen-state: '{colors.outline}'
  avatar-presence:
    idle-color: '{colors.secondary}'
    speaking-color: '{colors.accent}'
    listening-color: '{colors.primary}'
  cohort-seat-pill:
    filled: '{colors.secondary}'
    empty: '{colors.surface-dim}'
  source-control:
    text-color: '{colors.on-surface-variant}'
    icon-color: '{colors.secondary}'
    radius: '{rounded.sm}'
  board-gutter-marker:
    fill: '{colors.outline}'
    fill-active: '{colors.accent}'
  checkpoint-modal:
    background: '{colors.surface}'
    border: '{colors.outline-variant}'
    radius: '{rounded.lg}'
  confirm-dialog:
    background: '{colors.surface}'
    radius: '{rounded.md}'
    action-color: '{colors.accent}'
  assignment-evidence-block:
    background: '{colors.surface-container-low}'
    border-left: '{colors.secondary}'
    radius: '{rounded.sm}'
  review-recommended-badge:
    background: '{colors.warning-container}'
    color: '{colors.on-warning-container}'
    radius: '{rounded.full}'
  certificate-card:
    background: '{colors.surface}'
    border: '{colors.primary-container}'
    radius: '{rounded.lg}'
    disclosure-fill: '{colors.secondary}'
  cohort-waiting-list-card:
    background: '{colors.surface-container-low}'
    radius: '{rounded.md}'
  cohort-room-panel:
    background: '{colors.surface}'
    divider: '{colors.outline-variant}'
  leaderboard-you-row:
    background: '{colors.primary-container}'
    text: '{colors.on-primary-container}'
    radius: '{rounded.sm}'
  transcript-panel:
    background: '{colors.surface}'
    highlight: '{colors.accent-container}'
  minor-consent-gate:
    background: '{colors.surface}'
    accent: '{colors.primary}'
    note: 'Calm, informational tone -- never the error/warning palette; a minor waiting for consent is not in an error state.'
  safety-interstitial:
    background: '{colors.surface}'
    accent: '{colors.primary}'
    note: 'Deliberately never uses error/warning tokens — a crisis disclosure is not an error state; tone stays calm/primary, not alarmed/red.'
  theme-picker:
    selected-indicator: '{colors.accent}'
    swatch-radius: '{rounded.full}'
  notification-center:
    unread-dot: '{colors.accent}'
    background: '{colors.surface}'
    in-progress-lock-icon: '{colors.on-surface-variant}'
  activity-history:
    timeline-line: '{colors.outline-variant}'
    entry-icon-bg: '{colors.surface-container-low}'
---

## Brand & Style

Usavvy reads as a **calm, credible study companion** — closer to a well-designed notebook or a good teaching assistant's office hours than a chat app or a gamified consumer feed. The design language is **Focused Minimalism with Warm Confidence**: generous whitespace, one clear action at a time, and a restrained color system where every non-neutral color is doing a specific job, never decoration.

The defining posture, per the PRD's own thesis: **the board is the product, not the chat.** Every screen outside the Board exists to get the learner into a session or make sense of what happened in one — so app chrome stays quiet and gets out of the way, while the Board itself is the one place allowed to feel alive (progressive writing, incremental diagrams, a present, breathing Avatar indicator). Nothing about the interface should read as childish or gimmicky — persona P2 (Ravi, a working professional upskilling on his own time) needs to trust this with his career the same way persona P1 (Ananya, an undergrad) needs it to feel encouraging, not clinical.

## Colors

- **Primary — Electric Indigo (`#4338CA`).** App chrome, primary navigation, headers, general focus states. Deep enough to feel serious and trustworthy rather than playful; this is the "Usavvy is a real place" color.
- **Secondary — Deep Teal (`#0F766E`).** Calm/neutral surfaces, progress fills, cohort UI, secondary actions. This is the "you're safe here, take your time" color — used for anything that should feel supportive rather than urgent. (Deepened from an earlier draft's `#0D9488` — the lighter value failed 4.5:1 with white text; this shade holds the same "soft teal" identity while actually clearing AA.)
- **Accent — Energetic Coral/Orange (`#C2410C`).** Reserved *exclusively* for interaction and reward: primary CTA buttons, "Explain more" controls, correct-answer states, star/milestone moments. **Never used for errors or warnings** — that's what `error`/`warning` exist for. This separation is load-bearing: if accent ever means "something's wrong," the whole reward vocabulary breaks. (Deepened from an earlier draft's `#EA580C`, which measured ~3.56:1 with white text — below the 4.5:1 body-text floor for a control this frequently labeled with text, e.g. an "Explain more" button. This shade clears AA at normal button-label sizes.)
- **Error (`#DC2626`) / Warning (`#D97706`) / Success (`#16A34A`).** Fully separate semantic triad from the brand palette. A learner should never have to wonder whether an orange element is good news or bad news. `warning` and `success`, like `error`, carry `-container`/`on-*-container` pairs for any text use — the base tokens (`#D97706`, `#16A34A`) fail 4.5:1 as direct text on white and are for icons, borders, and fills only (see Do's and Don'ts).
- **Board Dark (default) — deep indigo canvas (`#14123B`/`#1E1B4B`).** The default teaching surface: a focused, low-glare "lecture hall at night" feel that makes progressively-written text and diagrams pop. `board-dark-on-surface` (`#E8E7FF`) against either board-dark token clears >10:1 — the safest pairing in the whole system, deliberately, since Board narration is the most continuously-read text in the product.
- **Board Light "Paper" — warm off-white (`#FAF9F4`)**, a learner-selectable alternate that reads like a physical notebook page. Persisted to profile per the PRD's own spec (DC-3).
- **Focus indicators are board-context-aware, not one global color.** `focus-ring` (`#4338CA`, same as `primary`) is used everywhere in general app chrome; but `primary` against either board-dark token computes to only ~2.0–2.25:1 — effectively invisible on the Board's own canvas, exactly where keyboard operability matters most (NFR-8). Inside the Board canvas and its control bar, focus uses `focus-ring-on-dark` (`#E8E7FF`) instead, which clears the same >10:1 as board narration text.
- All pairings are chosen to clear WCAG 2.1 AA (4.5:1 body text, 3:1 large text/UI) per DC-2 — indigo-on-teal, the PRD's own flagged risk case, never occurs as a direct text-on-background pairing; teal only appears as fills with dark-neutral or white text on top, never as a text color against indigo. `accent`/`on-accent` and `secondary`/`on-secondary` were both re-verified after the accessibility review caught the original shades falling short (see above) — every text-bearing pairing named in this document now clears its stated target at the sizes `typography` actually specifies.

### Theme Presets (FR-A-9)

The frontmatter `colors` block above is the **Indigo Focus** preset — the default and the one every other section in this document assumes unless a preset is named explicitly. Three more predefined app-wide themes are selectable from Preferences; all four are independent of the Board's own dark/paper toggle (DC-3), which stays a separate control. Only `primary`, `secondary`, `background`, `surface`, and `on-surface`/`on-background` vary by preset — `accent`, `error`/`warning`/`success` (and their container pairs), and every Board-specific token stay constant across presets, since those carry semantic meaning (reward, danger, caution) that must never shift with cosmetic preference.

| Preset | `primary` | `secondary` | `background` | `surface` | `on-surface` |
| --- | --- | --- | --- | --- | --- |
| **Indigo Focus** (default) | `#4338CA` | `#0F766E` | `#FAFAFC` | `#FFFFFF` | `#1B1B23` |
| **Midnight** — dark app chrome, not just the Board | `#A5B4FC` | `#5EEAD4` | `#14123B` | `#1E1B4B` | `#E8E7FF` |
| **High Contrast** — accessibility-first, maximum separation | `#312E81` | `#134E4A` | `#FFFFFF` | `#FFFFFF` | `#000000` |
| **Warm Paper** — sepia, reduced eye strain for long reading | `#4338CA` | `#0F766E` | `#FAF6ED` | `#FFFFFF` | `#2B2418` |

`Midnight` reuses the already-AA-verified `board-dark-on-surface` value for its `on-surface` (>10:1 against its dark backgrounds, per the Board Dark entry above) rather than inventing a new dark-mode text color. `High Contrast` uses pure black-on-white specifically to maximize the margin above the 4.5:1 floor, not just meet it. `Warm Paper` keeps `primary`/`secondary` identical to the default — only the neutral backdrop shifts warm — so brand color meaning never depends on which preset is active.

## Typography

**Inter** carries every UI role and the Board's narration text — one legible, well-hinted family across the whole product keeps the "calm" promise and gives strong language coverage for the Hindi-and-beyond i18n path the architecture already keeps open (NFR-12). Board narration (`board-narration`, 19px) sits a step larger than standard body text since it's read at a distance during progressive writing and needs to stay comfortable at 0.75×–1.5× speech rate scrubbing.

**JetBrains Mono** is the one deliberate typographic accent, reserved for code blocks (FR-B-27) — a genuine functional need (monospace alignment, ligature-friendly), not a style flourish.

**Atkinson Hyperlegible** is a full-family swap available as a learner preference (NFR-11, FR-A-4) — designed by the Braille Institute specifically to keep letterforms distinguishable at speed, applied everywhere except code and the largest display type.

## Layout & Spacing

A 4px base unit keeps every spacing decision a clean multiple, with `gutter` (24px) as the default rhythm between content blocks and generous 48px desktop margins that let the Board breathe at wide viewports (NFR-7, 360px–2560px). Mobile margins tighten to 16px — the simplified mobile-web layout should feel efficient, not cramped, since the Board itself gets a reduced control set on small screens rather than a shrunk-down version of the desktop layout.

The Board canvas itself is the one place that breaks from a fixed-width layout: it's an infinite vertical scroll (FR-B-31), so its internal spacing is beat-relative rather than page-relative — each Beat claims the vertical space its content actually needs.

**Responsive range and multi-monitor support (NFR-7).** The full 360px–2560px viewport range isn't just "doesn't break" — it must read as an intentionally-designed layout at every step along the way, including wide/ultra-wide desktop monitors and multi-monitor setups where the browser window itself may be maximized to an unusually wide or tall size. Four reflow steps, not a single fluid scale: **mobile** (360–599px, reduced Board control set per above), **tablet** (600–1023px), **desktop** (1024–1919px), and **wide desktop** (1920px+). Above `desktop`, content containers cap at a comfortable maximum reading/working width and center with generous side margins — text lines, forms, and the Board's own control bar never stretch edge-to-edge on a 2560px display just because the viewport got wider. Reflow (regroup, re-stack, change what's visible) at each step, don't just proportionally shrink or grow every element.

## Navigation

Primary navigation groups related destinations under a small number of clear, learner-facing categories — e.g., *Learn* (courses, uploads/notes), *Progress* (activity history, certificates), *Account* (profile, preferences, privacy/data, deletion) — rather than a flat list of every page the product has. A learner should be able to predict which group a destination lives in before clicking; group labels describe what the learner is trying to do, never an internal epic/module/story name. Deeper or less-frequent destinations (account deletion, data export, per-course customization) nest under their parent group rather than sitting at the same nav level as top-level sections — the top level should stay short enough to scan at a glance regardless of viewport width (see the responsive range above: grouped navigation is what makes collapsing to a mobile menu tractable in the first place, versus flattening an already-flat list further). The Board itself is deliberately **outside** this navigation entirely (per Brand & Style — app chrome, including the persistent nav, hides while on the Board) since it's the one screen meant to feel like a distinct, immersive mode, not one more navigable destination.

## Elevation & Depth

Depth stays minimal and purposeful. The app chrome is almost entirely flat — cards distinguish themselves from `surface` via the `surface-container` tonal steps, not shadows. The one place elevation earns its keep is the **Board control bar**, which floats above the canvas as a persistent, always-reachable strip (a soft, low-opacity indigo-tinted shadow, never a hard drop shadow) — and modals/side panels (cohort explain-more panel, checkpoint interstitial), which use a single consistent floating-panel treatment so a learner always knows what's "on top of" the lesson versus part of it.

## Shapes

A moderate `10px` default radius signals "friendly and approachable" without tipping into the rounded-pill, consumer-app playfulness that would undercut trust for a professional-upskilling use case. Larger containers (cards, modals, the Board control bar) step up to `16px`–`24px`; small interactive elements (chips, badges, the star/streak icons) can use `full` where a pill genuinely reads as a badge rather than a button.

## Iconography

Any control with a common, unambiguous icon convention gets one — play/pause/stop/replay, back/forward, speed, volume, save/cancel/delete/edit, search, close, and the like — never a bare text-only button when a recognizable icon already exists for that action. This applies everywhere in the product, not only the Board Control Bar: dialogs, forms, settings, notification actions, list-item actions. One icon set at one consistent stroke weight and corner-language across the whole product — icons are a single visual system, not a per-component grab-bag of whatever looked closest at the time (the exact library/asset format is an Architecture/implementation choice, not re-decided per screen).

- **Icon + label, except where space is genuinely constrained.** A visible text label sits alongside the icon by default (e.g., a "Save" button shows both a save icon and the word "Save"). Icon-only is reserved for tightly-packed control clusters where a label cannot fit (the Board Control Bar's transport controls) — and every icon-only control still carries an accessible name (`aria-label`/tooltip on hover and focus), never an icon with zero text equivalent anywhere in the DOM.
- **Icon color follows the same semantic rules as every other token in this document.** `on-surface`/`on-surface-variant` for neutral, non-primary controls; `accent` reserved for the one primary action in a given view/cluster (matching the accent-is-exclusive-to-interaction/reward rule in Colors) — never a bespoke one-off icon color chosen per component.
- **Icon size scales with its control's touch target**, not shrunk to fit a cramped layout: a minimum 24px icon inside a touch target of at least 44px, matching mobile touch-target guidance (NFR-8) — if an icon and its target can't both fit at those minimums, the layout is wrong, not the icon.

## Components

- **Buttons.** Primary = solid accent fill, reserved for the single most important action on a screen (per Principle 6, "Explain more" must feel free, not buried — it's always styled as a primary-weight action, never a secondary link). Secondary = outlined, primary-colored text.
- **Progress Disclosure.** Never a bare percentage. Always a fill (`secondary` color) plus the explicit "completed N of M studied, X skipped" text — this is a hard rule carried directly from the mastery-formula fix in Epic 4 (Story 4.5); the visual component and the underlying data contract are the same shared shape.
- **Avatar Presence Indicator.** A simple animated mark/waveform, never a face (per the PRD's own deliberate §19.1 decision) — three states (idle/listening = secondary teal, speaking = accent coral, a brief "thinking" pulse = primary indigo). It sits in the Board's corner, small and unobtrusive; it is a presence cue, not a character.
- **Star / Streak.** Accent-colored, celebratory but restrained — no confetti-burst animation by default (respects `prefers-reduced-motion`, NFR-10), a satisfying but quiet fill/pop.
- **Cohort Seat Pills.** Filled (teal) vs. empty (neutral outline) — used on waiting-list and cohort-formation screens to make "7 of 8 seats filled" legible at a glance without a progress bar competing with the actual course-progress bar's visual vocabulary.
- **Board Control Bar.** Always visible, always reachable, floats above the canvas — pause/resume, replay, back/forward, speed/volume/voice, and the transcript toggle live here permanently; "Explain more" and its sub-menu (deeper/simpler/different example/more examples/analogy/ask anything) is a single expandable cluster off the same bar, not a separate hunt-for-it menu. Focus rings inside this bar use `focus-ring-on-dark`, never the general `focus-ring` — see Colors.
- **Source Control.** A quiet icon-plus-label affordance (secondary-teal icon, `on-surface-variant` text) attached to every Beat — small enough not to compete with the lesson, but never hidden behind a menu.
- **Board Gutter Markers.** Small dots along the scroll gutter, neutral `outline` by default, `accent` when marking the currently-active Beat — lightweight wayfinding, not a second navigation system.
- **Checkpoint Modal / Confirm Dialogs.** One consistent floating-panel treatment (see Elevation & Depth) for checkpoints, skip/restart confirmation, and any other in-flow interrupt — `surface` background, `lg`/`md` radius, a single accent-colored primary action.
- **Assignment Evidence Block.** Quoted submission evidence renders in a distinct, left-bordered (`secondary`) block within feedback, visually separated from the grader's own commentary. The "review recommended" state is a small pill using `warning-container`/`on-warning-container` (never the alarming base `warning` fill) — flagged, not alarmed.
- **Certificate Card.** A restrained, primary-container-bordered card; its Progress Disclosure fill uses the same `secondary` token as the dashboard version — one visual language for "how much did you actually do," everywhere it appears.
- **Cohort Waiting-List Card / Cohort Room Panel.** Waiting-list cards sit on `surface-container-low` to read as a holding state, not a finished one. The live-room side panel is visually distinct from the main synchronized board (an `outline-variant` divider) so it's unambiguous that panel content is private to the viewer.
- **Leaderboard "You" Row.** The learner's own row is the only one styled with `primary-container` — every other row is neutral `surface`, so the learner's own position is the one thing that visually pops.
- **Transcript Panel.** Search-match highlighting uses `accent-container` (a quiet tint, not the loud accent fill) so highlighted text stays readable.
- **Minor/Parental-Consent Gate.** Styled like any other informational screen — `primary` accent only, full `surface` background, no warning/error coloring. A minor waiting on consent is a normal, expected state, not a flagged one.
- **Theme Picker.** Four swatches (one per preset), full-radius circular, the active preset marked with an `accent` ring — a lightweight, visual choice, not a settings form.
- **Notification Center.** An `accent`-colored unread dot (never a number badge competing with stars/streak's own accent-colored visual language elsewhere) on the bell icon; the panel itself sits on plain `surface`. A notification tied to an in-progress process shows a small locked-clear icon (`on-surface-variant`, not a warning color — this is a normal state, not a problem) instead of the usual clear affordance.
- **Activity History.** A vertical timeline (`outline-variant` line) with each entry's type icon on a quiet `surface-container-low` chip — deliberately unstyled/neutral, since this is a reference/lookup surface, not a celebratory one; stars and streaks keep their accent treatment, activity history does not borrow it.

## Do's and Don'ts

- **Do** keep accent color exclusive to interaction/reward. **Don't** ever use it for an error, warning, or destructive-action state — use the semantic error/warning tokens.
- **Do** show Progress Disclosure's full text everywhere a percentage appears. **Don't** ever render a bare "100%" or a bare percentage number with no studied/skipped breakdown.
- **Do** keep the Avatar a presence indicator. **Don't** render a photorealistic or cartoon face/avatar anywhere — this was a deliberate product decision (§19.1), not a placeholder waiting for a "real" avatar later.
- **Do** respect `prefers-reduced-motion` everywhere motion is used for delight (star pops, streak fills, spotlight/dim). **Don't** let reduced-motion mode drop any content — only the animation, never the information. For incremental diagrams specifically: **do** keep them manually steppable (click/arrow-key advances each stage) rather than instant-full-reveal, since the staged sequence is often the actual teaching content, not decoration; the Avatar presence indicator's idle motion is exempt from reduced-motion (it's status feedback, not delight).
- **Do** use `warning`/`success` for icons, borders, and fills. **Don't** use their base tokens as text color — use `warning-container`/`on-warning-container` or `success-container`/`on-success-container` for any text, matching the pattern already established for `error`.
- **Do** let the Board feel alive (progressive writing, incremental diagrams, spotlight/dim). **Don't** let app chrome outside the Board compete with it for visual energy — chrome stays quiet so the Board reads as the one "high-energy" surface in the product.
- **Do** pair a recognizable icon with every action that has one (play/pause/stop/speed/save/cancel/delete/etc.), everywhere in the product. **Don't** ship an icon-only control with no accessible text equivalent, or mix icon styles/weights from more than one visual language.
- **Do** design and verify every screen across the full 360px–2560px range, including wide/multi-monitor desktop widths. **Don't** let a layout merely "not break" at wide widths — cap content width and center it rather than stretching text or controls edge-to-edge on a large display.
- **Do** group primary navigation into a small number of learner-facing categories, with deeper destinations nested under them. **Don't** add a new top-level nav item for every page as the product grows — fit it into an existing group or it's a sign the grouping itself needs revisiting.
