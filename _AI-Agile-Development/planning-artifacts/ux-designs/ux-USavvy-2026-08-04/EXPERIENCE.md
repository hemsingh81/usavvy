---
name: 'Usavvy'
status: final
created: '2026-08-04'
updated: '2026-08-04'
sources: ['Doc/00-Requirement.md', '_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md', '_AI-Agile-Development/planning-artifacts/epics.md']
---

## Foundation

**Form factor:** Responsive web SPA, 360px–2560px (NFR-7). Desktop/laptop and tablet are first-class surfaces — the Board must be genuinely usable on a tablet, not a squeezed-down desktop view. Phone-width gets a simplified mobile-web layout: a reduced Board control set (core pause/replay/back-forward/explain-more stay; export/annotation tools move behind a "more" affordance) rather than a native app. No offline mode, no packaged app (PRD §3.3 non-goal).

**Component base — `[ASSUMPTION]`:** Radix UI primitives (unstyled, accessible-by-default: focus management, ARIA roles, keyboard nav built in), styled entirely from `DESIGN.md` tokens. This is a UX-driven recommendation, not an architecture mandate — the spine names no UI system, and this product's accessibility floor (WCAG 2.1 AA, full keyboard operation, screen-reader labels on *every* board control — NFR-8) is unusually demanding for a canvas-heavy interactive app. Building that from scratch invites gaps; inheriting it from a primitives library doesn't. Flagged for engineering confirmation.

**Realtime UI expectations:** the Board streams Beats over WebSocket (architecture AD-5) with word-level narration timing — UI must render progressively as data arrives, not wait for a complete payload. Every generation-backed control (Explain more, Ask anything, Different example) has a hard latency budget (NFR-B-1/B-2, ≤1.5–2.0s to first audio) — the UI's loading state design has to make that wait feel purposeful, not like a stall (see State Patterns).

## Information Architecture

**Primary nav** (persistent, quiet — indigo-on-white, no competing color): Home/Dashboard · Catalog · My Learning · Cohorts · Assignments · Notes, plus a profile menu (Profile, Preferences, Privacy, Certificates, Sign out).

**The Board is not nested in this chrome.** Starting or resuming a session takes the learner into a full-bleed focus view — Board canvas + its own persistent control bar — with a single, deliberate "exit to My Learning" affordance, never the main nav bar competing for attention mid-session. This is a direct expression of Principle 1 ("the learner holds the remote") and Principle 3 ("show, then say") — nothing else should be visually competing with the lesson.

**Admin console is a separate shell**, role-gated to SuperAdmin/Admin/Mentor (architecture AD-7), reached via a distinct entry point rather than folded into the learner nav — course authoring (Epic 9), moderation queues, user admin, and analytics dashboards live here.

Surface map (every stated PRD need → a surface, every surface → a journey that lands there):

| Surface | Epic | Reached from |
|---|---|---|
| Sign up / Onboarding wizard | 1 | First-run |
| Age declaration + parental-consent flow (minors) | 1 | Sign-up, before onboarding |
| Profile, Preferences, Privacy | 1 | Profile menu |
| Theme picker | 1 | Preferences |
| Notification Center | 1 | Bell icon, persistent in chrome (not inside the Board's full-bleed view) |
| Activity History | 1 | Profile menu |
| Catalog browse/search, Course detail, Customisation | 2 | Nav → Catalog |
| Upload flow, Ingestion status, Outline review | 2 | Catalog → "Upload your own" |
| **The Board** (session, full-bleed) | 3 | My Learning / Catalog "Start" |
| Transcript panel, My Notes | 3 | Board control bar |
| Plan builder, Progress dashboard, Calendar | 4 | Nav → My Learning |
| Engagement (stars/streaks/badges), Certificate | 5 | Profile |
| Assignment attempt, Feedback, Appeal | 6 | My Learning → topic |
| Waiting list, Cohort live room, Cohort progress board | 7 | Nav → Cohorts |
| Leaderboard (course/global/cohort) | 8 | My Learning / Cohorts |
| Course authoring, QA, moderation, user admin, analytics | 9 | Admin console |

## Voice and Tone

Carried directly from PRD §6.1 (stakeholder-confirmed): **encouraging, peer-like, never condescending.** Short sentences. No exclamation-mark spam. **Never says "As an AI…"** — the Avatar speaks as a tutor, not a disclaimer generator. Applies everywhere: board narration, feedback copy, empty states, error messages, even admin-console microcopy (tone can be more neutral/operational there, but never cold or blaming — a failed ingestion job's error message reads like a helpful colleague, not a stack trace).

## Component Patterns

*Visual reference: [`mockups/board-session.html`](mockups/board-session.html) (Board Control Bar, Source, Board Navigation, Avatar Presence), [`mockups/progress-dashboard.html`](mockups/progress-dashboard.html) (Progress Disclosure, plan-vs-actual, forecast), [`mockups/cohort-live-room.html`](mockups/cohort-live-room.html) (Live Cohort Room Layout). Spines win on conflict with any mock.*

- **Board Control Bar** — persistent, floating, always reachable: Pause/Resume, Replay, Back/Forward, Speed/Volume/Voice, Transcript toggle, and "I'm confused" (FR-B-18) — a single one-click affordance that needs no articulated reason, distinct from the Explain-more cluster because it exists precisely for when the learner can't yet name what's wrong. A single "Explain more" cluster expands to deeper / simpler / different example / more examples (graded difficulty, FR-B-7 — distinct from "different example," which swaps rather than adds) / analogy / ask-anything — one click to open, never a hunt (Principle 6, "cheap to be curious"). Ask-anything sub-Beats always carry a visible "back to lesson" affordance (FR-B-9) returning to the exact branch point.
- **Source ("Where's this from?")** — a persistent, always-visible control on every Beat (FR-B-14), not buried in a menu: shows the source page/section a Beat was grounded in for catalog or uploaded material. Per the PRD's own framing this is both a trust feature and a hallucination safety valve, so it never requires more than one click to reach.
- **Board Navigation** — zoom, pan, and infinite vertical scroll (FR-B-31) with a beat-marker gutter along one edge; clicking a gutter marker jumps the viewport to that Beat without leaving the session.
- **Checkpoint Interstitial** — a non-blocking modal within the Board flow (1–3 questions), dismissible only by answering or explicitly skipping; never silently auto-advances.
- **Skip / Restart Confirmation** — a lightweight confirm dialog naming the concept and, for Skip, stating explicitly it can be revisited later (per epics.md Story 4.13's AC) — prevents an accidental tap from silently dropping content from the plan.
- **Assignment Feedback & Evidence** — feedback always renders in the PRD's fixed structure (correct → missing/incorrect → why it matters → concept to revisit → board-session link, FR-E-9), with every open-ended criterion's quoted evidence shown inline, never collapsed by default — trust here depends on the evidence being seen, not just claimed. A "review recommended" grading carries a visible, non-alarming badge (FR-E-10) and the Appeal action is always present on a graded result, framed as a normal next step, not a rare escape hatch (FR-E-11) — this pairing (visible evidence + non-terminal appeal) is the PRD's own named mitigation for auto-grading trust risk (R-EVAL) and gets the same explicit component treatment as Progress Disclosure and the Leaderboard, not just an IA row.
- **Progress Disclosure** — the shared component named in `DESIGN.md`, backing every progress surface (dashboard, certificate): fill + "completed N of M studied, X skipped" text, per Epic 4 Story 4.5's data contract. UX and the data model share one shape by design.
- **Certificate Card + Verification Page** — the certificate always renders its Progress Disclosure breakdown alongside the completion statement and an unmissable "non-accredited" notice; the public verification page is read-only, no edit affordances, matches the certificate's disclosure exactly.
- **Cohort Waiting-List Card** — built from **Cohort Seat Pills** (`DESIGN.md`: filled teal vs. empty outline) plus an honest expected-start-window ("not yet estimable" is a real, displayed state, not a placeholder), never a fabricated countdown.
- **Live Cohort Room Layout** — main shared board (≈70% width) + a **Cohort Room Panel** (≈30%) tabbed between private "Explain more," chat/raise-hand, and poll results; the panel is explicitly *not* synchronized across participants (each learner's panel is theirs alone), while the main board is.
- **Leaderboard Local-Neighborhood Strip** — built from the **Leaderboard "You" Row** treatment (`DESIGN.md`): the learner's own row highlighted, personal-best and streak shown more prominently than numeric rank, with an explicit "see top ranks" expand action that is never the default view (carries forward the PRD's own R-9 mitigation design).
- **Transcript Panel** — a searchable side drawer, jump-to-Beat on click, always available (not just on request) since it doubles as the caption surface for NFR-9.
- **Theme Picker (FR-A-9)** — four swatches (Indigo Focus, Midnight, High Contrast, Warm Paper, per `DESIGN.md`), applied instantly on selection with no page reload, persisted to the Learner Profile. Independent of the Board's own dark/paper toggle — changing one never changes the other, and both are visible together in Preferences so the distinction is legible, not hidden.
- **Notification Center (FR-A-10)** — a bell icon in the persistent app chrome (not shown inside the Board's full-bleed session view, consistent with nothing competing with the lesson) opens a panel listing notifications newest-first. Each notification can be marked read independent of clearing. **Clear is disabled, with an explanatory tooltip ("still in progress"), for any notification referencing a process that hasn't resolved** (per architecture AD-18 — the notification record links directly to the triggering process, so this is a lookup, not a guess) — reading it is always allowed, removing it isn't until the underlying thing finishes.
- **Activity History (FR-A-11)** — a reverse-chronological timeline of board sessions, assignment attempts, and cohort sessions attended, each entry linking back to its source (a board session entry opens Transcript/My Notes for that session; an assignment entry opens its feedback). This is a read-only reference surface — no re-ordering, no editing, no deletion — since its entire purpose is an honest, unmodifiable record the learner can trust.
- **Minor / Parental-Consent Gate (FR-A-2, NFR-16)** — a self-declared age check at sign-up; a birthdate indicating under 18 routes to a distinct, plainly-worded "waiting for parental consent" state before any other account activity is reachable — no onboarding, no catalog browse, nothing until consent lands. Once active, a minor's account carries visibly restricted defaults (no public leaderboard participation, no open cohort chat) surfaced as calm, factual notices at the exact moments those features would otherwise appear — not hidden silently, so the learner understands why something's unavailable rather than assuming it's broken.
- **Avatar Presence Indicator** — transitions between idle, listening, speaking, and thinking states are driven directly by the session's real state (audio playing = speaking, awaiting voice/text input = listening, generation in flight = thinking); never a decorative loop disconnected from what's actually happening. Each transition also fires a polite ARIA status update ("Avatar is speaking" / "listening" / "thinking") so the state is available non-visually, not carried by color alone (see Accessibility Floor).
- **Star / Streak** — a star fires its pop animation exactly once per `StarTransaction` (never re-plays on a page revisit) and always accompanies the same explanation text the transaction ledger stores (per epics.md Story 5.1's "no hidden awards" guarantee) — the animation is celebration, the linked reason is what actually earns trust. A frozen streak day (FR-R-3) renders visibly distinct from a broken one — a muted "freeze used" mark, not the same treatment as an active or broken streak.

## State Patterns

- **Generation-backed loading** (Explain more, Ask anything, assignment generation): a purposeful skeleton/shimmer scoped to where the new content will land — never a full-screen spinner that blanks the existing lesson. Budget-aware: if a response exceeds its NFR-B target, the loading state itself changes tone (subtle "still working" reassurance) rather than looking identically "fine" at 1s and 8s.
- **Empty states** exist everywhere data can legitimately be zero: no notes yet, no badges yet, "0 of 0 concepts studied" (course with no content), empty leaderboard scope, empty moderation queue. Every empty state explains *why* it's empty and, where relevant, what action fills it — never a bare blank panel.
- **Ingestion status** surfaces the exact stage (queued → parsing → safety scan → embedding → outline ready) and, on failure, the specific human-readable reason from FR-C-11 (encrypted file, failed OCR, unsupported language, corrupt file) with a relevant next step — never a generic "something went wrong."
- **Grading in-progress** (long-form assignments) is a persistent, visible status with elapsed time, not a spinner the learner has to remember to check back on; an SLA breach changes its copy to "taking longer than expected" rather than staying silently identical.
- **Retry, never a dead end** — any failed generation, upload, or submission action gets an explicit retry affordance in place, with user-entered content (a typed question, a draft answer) preserved, never lost on failure.
- **No silent failures (NFR-25)** — this is the general principle "retry, never a dead end" is one instance of: every error state in this document (ingestion failure, generation timeout, grading SLA breach, safety-filter block, etc.) is exhaustive by design, not by accident. If a future feature's failure mode isn't covered by an existing pattern here, it needs its own explicit state before it ships — a spinner that can fail silently and never resolve is a defect, not an omission to fix later.
- **Long-running work is checkable later, not just in the moment (NFR-26)** — ingestion, grading, and cohort matching already have in-the-moment status (their own State Patterns above); each of those also lands a Notification Center entry when it resolves and an Activity History entry once it's part of the record, so a learner who isn't watching when something finishes still finds out, and can always look back at what happened.
- **Safety escalation interrupt (NFR-19)** — a self-harm or crisis disclosure, detected in either AI-generated content or human-authored cohort chat (architecture AD-3), triggers a distinct, calm, full-attention interstitial that pauses the current activity and routes to a static support-resources page. This is never rendered as an improvised chat response, never styled as an error or warning state, and never dismissible with a casual "close" — it's a deliberate, separate interaction from every other interrupt in the product, sober in tone rather than urgent-red, consistent with the voice guidance of never leaving a vulnerable learner facing something that reads as a system malfunction.
- **TTS graceful degradation (NFR-6)** — if voice synthesis fails, the session does not stop: the Board switches to text-board mode with a visible, calm notice ("voice is unavailable right now — continuing in text mode"), and every control that assumed audio (speed/volume/voice selection) disables gracefully rather than erroring. This is a MUST for the Board, the product's core surface, and gets the same non-alarming treatment as any other fallback — never framed as a failure the learner caused.
- **Cohort anti-stall guarantee (FR-G-6)** — the PRD's own highest-emphasis waiting-list mitigation gets an explicit state: once the configurable stall threshold is reached, the waiting-list card (not a separate screen) transitions to present three concrete options side by side — smaller cohort, different cadence, self-paced-now-with-carryover — framed as "here's what we can do right now," never as an apology for the wait. This state supersedes the plain "not yet estimable" waiting card once triggered.
- **Onboarding resume-at-abandoned-step (AC-A-3.2)** — a learner who leaves onboarding mid-wizard and returns lands back on the exact step they left, with prior answers intact; the wizard never restarts from step 1, and skipped-then-returned-to fields are asked contextually later rather than re-blocking progress.
- **Pace-forecast display rules (§11.3)** — the forecast surface (Progress Dashboard) has three distinct states beyond the normal confidence-banded forecast: fewer than 5 active days of data shows "Building your pace estimate — check back after a few sessions" (no forecast rendered at all); 7+ days of zero velocity shows a dormant state prompting replan, not a forecast; and any low-confidence forecast renders as a date *range*, never a single falsely-precise date.
- **Admin/back-office states (Epic 9)** — content moves through visibly distinct draft → in-review → published states with a rollback affordance always reachable from version history (FR-O-2); the moderation queue distinguishes flagged-upload, copyright-takedown, low-confidence-grading, and grade-appeal items by type rather than one undifferentiated list (FR-O-4); each queue item shows age and an SLA-breach flag once overdue.
- **Catalog/upload validation states** — catalog search with no matches shows an explicit empty-with-clear-filters state (not a blank grid); an upload exceeding the stated limits (50MB/300 pages/10 files, FR-C-7) is rejected client-side with the specific limit named, before it ever reaches the ingestion pipeline's own failure-reason states.

## Interaction Primitives

- **Keyboard-first on the Board.** Every control in the Board control bar is reachable and operable via keyboard alone (NFR-8):

  | Control | Keyboard trigger | Accessible name |
  |---|---|---|
  | Pause / Resume | Space | "Pause lesson" / "Resume lesson" |
  | Replay Beat | `R` | "Replay this Beat" |
  | Back / Forward | `←` / `→` | "Previous Beat" / "Next Beat" |
  | Speed / Volume / Voice | Tab into control bar, arrow keys adjust | "Narration speed", "Volume", "Voice selection" |
  | Explain more (opens cluster) | `E` | "Explain more options" |
  | └ deeper / simpler / more examples / different example / analogy / ask anything | Tab within opened cluster | Each item labeled by its own action |
  | I'm confused | `C` | "I'm confused — help me differently" |
  | Source | `S` | "Where's this from?" |
  | Skip / Restart | Tab to control, Enter opens confirm | "Skip this concept" / "Restart this concept" |
  | Bookmark / Note | `B` | "Bookmark this Beat" |
  | Transcript toggle | `T` | "Show/hide transcript" |
  | Shortcut list | `?` | "Keyboard shortcuts" |

  This table is the checkable form of "every control is keyboard-operable" — a story implementing any Board control cites its row here rather than the general principle alone.
- **Live-region announcements — Beat text.** The progressively-written Beat text does **not** fire a live-region update per word (that produces overlapping, unintelligible screen-reader speech at typical narration speed). Instead: the always-available **Transcript panel** is the primary screen-reader channel for full narration content — a screen-reader user reads along there, avoiding any conflict with the Avatar's simultaneous audio narration. The Board canvas itself fires a single `polite` live-region status update per Beat boundary only ("New Beat: [Concept name]" / "Checkpoint reached"), not per word or per sentence — sparse orientation cues, not a duplicate narration channel.
- **Focus management.** Modals (checkpoint, skip/restart confirm, cohort side panel, keyboard-shortcut list) trap focus while open and return it to the triggering control on close; nothing strands keyboard focus off-screen.
- **Skip-to-content.** Every page with the persistent primary nav (all surfaces outside the Board) carries a standard bypass-blocks skip link ("Skip to main content") as the first focusable element; the Board's own full-bleed session view has no repeated nav to skip past in the first place.
- **Push-to-talk.** Explicit press-and-hold or toggle (learner preference) for voice input; text entry is always visible and available as a parallel path, never hidden behind a voice-only mode.

## Accessibility Floor

WCAG 2.1 AA across the product (NFR-8). Specifically: every Board control has a screen-reader label and visible focus state per the keyboard table above; captions/transcript are always synchronized and available, never an opt-in add-on (NFR-9); all progressive-writing and spotlight/dim animation respects `prefers-reduced-motion` by disabling the *animation* while keeping the *content* fully present (NFR-10) — incremental diagrams specifically stay manually steppable rather than instant-reveal (see `DESIGN.md` Do's and Don'ts), since the staged sequence can itself be teaching content; text scales to 200% without breaking layout or hiding functionality, and the Atkinson Hyperlegible font swap (`DESIGN.md`) is available from Preferences (NFR-11, FR-A-4). At the 360px viewport floor with 200% text zoom simultaneously active, the Board control bar reflows to a condensed icon-only row (labels still reachable via long-press/focus) rather than clipping or forcing double-axis scrolling — the two zoom mechanisms (OS text zoom and the Board's own FR-B-31 zoom/pan) are independent and neither assumes the other is at its default. Color contrast follows `DESIGN.md`'s tokens exactly — no ad hoc color choices in implementation. Avatar state changes (idle/listening/speaking/thinking) are exposed non-visually per the Avatar Presence Indicator's Component Pattern entry above, not carried by color alone.

## Responsive & Platform

Desktop/laptop and tablet share the full Board experience (multi-modal rendering, annotation tools, full control bar). Phone-width simplifies but never strips core learner controls (pause/replay/back-forward/explain-more/checkpoints all remain); export, annotation, and board-zoom-heavy features move behind a secondary "more" affordance rather than disappearing. No native app, no offline mode (PRD non-goal) — the responsive web experience is the only surface.

## Inspiration & Anti-patterns

**Rejected — reading like a chat app.** The PRD's own thesis is explicit — "what makes this defensible is not the chat, it is the board." Any UI decision that turns the Board into a scrolling message thread with occasional visuals (rather than a genuine incremental teaching surface where voice and visual are locked together) undermines the entire product bet. When in doubt, the Board should look and feel more like a well-run whiteboard lecture with a remote control than like a messaging app.

**Rejected — gamification-forward dashboards.** Streaks, stars, and badges are real (Epic 5) but never the visual headline of a screen the way a consumer habit-app makes them the whole point. Progress and mastery lead; engagement rewards are a footer, not a hero banner — consistent with Principle 5 ("engagement without anxiety") and the deliberate restraint on leaderboard visibility (R-9).

**Lifted from — well-designed reference/documentation readers** (the calm, focused reading experience of a good technical-docs site): generous whitespace, one idea per screen-width of content, minimal chrome competing with the material. Applied to the Board's non-session surfaces (course detail, notes) more than to the Board itself.

**Lifted from — video-conferencing side-panel patterns** (a familiar "main stage + private panel" layout): directly informs the Live Cohort Room Layout's 70/30 split — learners already have a mental model for "the shared thing is big, my private controls are a side rail," so the cohort room borrows that convention rather than inventing a new one.

## Key Flows

*(Inherited verbatim from PRD §17 — protagonists and beats are the PRD's own, not re-elicited.)*

### J1 — Ananya uploads a chapter and studies it (self-paced)
1. Sign up → onboarding (goal, availability, level)
2. Upload PDF → reviews the proposed outline, drops 2 known topics
3. Starts a Board session — listens + watches the derivation appear
4. Clicks *Explain simpler* at the tricky step
5. Clicks *Different example*
6. Answers checkpoint questions (2/3)
7. **Climax beat:** the Avatar auto-drops difficulty and re-routes unprompted — the moment the product's core promise (adapts to you, doesn't just repeat itself louder) becomes visible
8. Concept marked understood; bookmarks the board
9. Session ends with a summary, 15 stars, tomorrow's session pre-scheduled

**Failure branch:** if Ananya declines the proposed outline entirely at step 2 (Story 2.13's "at least one Topic must remain" floor), she's returned to the upload screen to try different material rather than forced into a course built from an outline she rejected.

### J2 — Ravi builds a plan and falls behind
1. Picks a catalog course, chooses the Standard 4-week plan, adjusts to 5 weeks around his availability
2. Studies 3 sessions, misses a week
3. Receives a streak-at-risk nudge
4. Opens the dashboard: "Behind — 4 concepts; at your current pace you'll finish 12 days late"
5. **Climax beat:** chooses *Replan: extend to 6 weeks* — the schedule visibly rebuilds around his real pace instead of shaming him for missing it
6. Back on track

**Failure branch:** if none of the four replan options (extend date / increase hours / reduce depth / drop topics) produces a feasible schedule within the feasibility threshold (Story 4.2), the dashboard is honest about it — offers the closest feasible option with the shortfall named, rather than silently accepting an unrealistic plan.

### J3 — Meera joins a cohort
1. Browses cohort-enabled courses, joins the waiting list with availability
2. Sees "7 of 8 seats filled, expected start this week"
3. Cohort forms; confirms the proposed Tue/Thu 8pm slot
4. Attends the live session, asks a private "explain deeper" in the side panel
5. **Climax beat:** is nominated for peer explain-back, accepts, explains the concept in chat — the Avatar affirms and adds nuance in front of the group
6. Earns a helper badge; misses one session later, catches up via self-paced replay

**Failure branch — decline path (OQ-5):** when nominated, Meera can just as easily tap *Pass* — a single, low-friction action that carries no visible penalty, no note to the group, and no exclusion from future rotations. The PRD is explicit that "unwilling learners must never be put on the spot" — Pass is exactly as fast as Accept, never a secondary/apologetic-feeling option. Separately, if the cohort itself dissolves before a scheduled session (FR-G-7's confirm-within-48-hours falling through), Meera's progress carries over to self-paced automatically rather than leaving her account in limbo.

### J4 — Ananya's assignment loop
*(The PRD's own J4 names no protagonist — attaching Ananya since the self-paced-upload + assignment combination is already her established context from J1, giving the flow the same concreteness as J1–J3 rather than leaving it a generic "the learner.")*
1. Topic completes → assignment unlocks
2. Reads the rubric, submits a long answer
3. Graded in ~90 seconds against 4 rubric criteria with quoted evidence
4. Scores 6/10; feedback links directly to the two weak concepts
5. Opens a Board session on each weak concept
6. **Climax beat:** resubmits and scores 9/10 — the loop from "wrong" to "understood and proven" closes visibly, not just numerically
7. Mastery updates, progress rises, 30 stars

**Failure branch:** if Ananya's second grading pass (her one allowed resubmission) still scores low and she disagrees with it, Appeal is still available and reads as a normal next step, not a dead end — second-pass evaluation, then human review queue if still disputed (FR-E-11), with the same evidence-forward feedback treatment throughout.
