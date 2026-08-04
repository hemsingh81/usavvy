# Usavvy — Product Requirements Document

**Product:** Usavvy — Interactive, self-paced AI learning platform (Web)
**Tagline:** *Your pace. Your path. Your growth.*
**Document version:** 1.0 (Draft for stakeholder review)
**Date:** August 2026
**Author:** Business Analysis (Education Domain)
**Status:** For review — see §22 Open Decisions before engineering commits to estimates

---

## 1. Document control

| Item | Detail |
|---|---|
| Audience | Founder/Product Owner, Engineering Lead, AI/ML Lead, UX Lead, Content/Curriculum Lead, QA Lead |
| Scope of this version | Responsive web application only. No native mobile app, no offline mode, no LMS/SIS integrations. |
| Requirement notation | **MUST** (MVP-blocking), **SHOULD** (high value, deferrable), **MAY** (future) |
| Traceability ID format | `FR-<Epic>-<n>` for functional, `NFR-<n>` for non-functional |
| Related artifacts needed next | Wireframes, Pedagogy Design Doc, AI Prompt/Guardrail Spec, Data Protection Impact Assessment, Unit Cost Model |

---

## 2. Executive summary

Usavvy is a web-based learning platform where an **AI Avatar tutor teaches on a live digital board while speaking aloud**, and the learner stays in control of the session at all times — pause, rewind, "explain deeper", "give me a different example", "slow down", "skip this".

Three learning modes share one engine:

1. **Self-paced learning** — learner picks a catalog course or uploads their own material (PDF, notes, slides) and learns with the Avatar.
2. **Planned learning** — learner commits to a timeline; the system tracks actual vs. expected pace and forecasts a realistic completion date.
3. **Group learning (cohorts)** — learners queue for a catalog course, the system forms a cohort once minimum seats fill, computes a common schedule from everyone's availability, and runs live Avatar-led sessions where learners can also explain concepts to each other.

Assignments are auto-generated per topic, submitted by the learner, and evaluated by the system with rubric-based feedback. Stars, streaks and opt-in leaderboards sustain engagement.

**What makes this defensible is not the chat — it is the board.** Voice + synchronised visual board + learner-directed re-explanation is a materially better learning experience than a chat transcript, and it is the hardest part to build. This PRD treats the Interactive Board (Epic 3) as the product; everything else is scaffolding around it.

---

## 3. Business context and problem statement

### 3.1 The problem

| Learner pain | Evidence from the sector | How Usavvy answers it |
|---|---|---|
| Recorded video courses can't adapt. If the explanation doesn't land, the learner rewinds and hears *the same words again*. | MOOC completion rates sit in the 5–15% band industry-wide; "content didn't click" and "no support" are consistently top dropout reasons. | Avatar re-explains **differently** on demand — deeper, simpler, analogy, new example, worked solution. |
| Text-only AI chat is cognitively flat for procedural and visual subjects (maths, physics, code, diagrams). | Dual-coding and multimedia learning research: paired verbal + visual channels outperform either alone. | Synchronised speech + board writing, not a wall of text. |
| Self-paced learning has no accountability, so plans quietly die. | Self-paced completion is consistently lower than cohort-based completion. | Explicit plan, pace tracking, forecast date, nudges, and cohort mode for those who need social pressure. |
| Learners don't know if they actually understood. | Illusion-of-competence problem; passive review feels like learning but isn't. | Checkpoint questions inside sessions + graded assignments with rubric feedback. |

### 3.2 Business objectives (first 12 months post-launch)

| # | Objective | Target |
|---|---|---|
| BO-1 | Prove the learning experience is superior to chat-based study | ≥ 60% of activated users return in week 2 |
| BO-2 | Prove self-paced completion can beat the industry benchmark | ≥ 35% course completion for learners who set a plan |
| BO-3 | Establish a viable unit economics model | Gross margin ≥ 60% per paying learner at scale |
| BO-4 | Validate group learning as a differentiator | ≥ 25% of active learners join at least one cohort |
| BO-5 | Build a defensible content asset | 25 catalog courses live at launch, 100 by month 12 |

### 3.3 Non-goals for v1 (explicitly out of scope)

- Native iOS/Android apps (web must be fully responsive, but not packaged).
- Live human tutors or human-graded assignments.
- B2B/B2school admin consoles, seat management, institutional reporting.
- Certification with accreditation value; v1 issues **completion certificates only**, clearly non-accredited.
- Photorealistic 3D talking-head avatar (see §11.4 — deliberate decision).
- Multi-language content. English only at launch; architecture must not block Hindi + 2 more later.
- Offline access, downloadable video, printable course books.

---

## 4. Target users and personas

| Persona | Profile | Primary need | Success looks like |
|---|---|---|---|
| **P1 — Ananya, 21, undergraduate** | Exam-driven, uploads her own lecture PDFs, studies in 45-min bursts at night | "Explain this chapter until I actually get it, then test me" | Uploads a PDF, learns 3 topics, scores 80% on the assignment |
| **P2 — Ravi, 29, working professional upskilling** | Time-poor, 4 hrs/week, needs structure and accountability | "Give me a realistic plan and tell me if I'm falling behind" | Completes a 6-week plan; forecast date stays within ±1 week |
| **P3 — Meera, 34, career switcher** | Motivated but isolated; learns better with peers | "Learn with other people, on a fixed schedule" | Joins a cohort, attends 8/10 sessions, teaches one concept back |
| **P4 — Sameer, 17, school student** *(secondary, gated)* | Board-exam prep, parent pays | Curriculum-aligned practice and instant doubt-solving | See NFR-16 — minors require age gating and consent flow |
| **P5 — Content Ops (internal)** | Curriculum designer | Author and QA catalog courses efficiently | Publishes a 10-topic course in < 2 days |
| **P6 — Admin/Moderation (internal)** | Trust & safety, support | Handle abuse reports, copyright takedowns, refunds | < 24 hr resolution SLA |

**Assumption A1:** Primary launch market is India (English-medium), secondary global English. This drives pricing, latency targets (§10.6), and privacy law scope (DPDP Act 2023 + GDPR readiness). *Confirm before build.*

---

## 5. Product principles

These are the tie-breakers when requirements conflict. Engineering and design should cite them in decision records.

1. **The learner holds the remote.** Nothing auto-advances past a concept the learner hasn't acknowledged. Every session control is reachable in one click.
2. **Explain differently, never louder.** A repeat request must produce a genuinely different explanation — different framing, different example, different representation — never a paraphrase of the same words.
3. **Show, then say.** If a concept has a visual form, it goes on the board. The voice narrates the board; the board does not caption the voice.
4. **Honest progress.** Progress bars and forecasts reflect demonstrated understanding, not minutes elapsed or slides consumed.
5. **Engagement without anxiety.** Gamification rewards consistency and mastery. Nothing shames a learner, and competitive surfaces are opt-in.
6. **Cheap to be curious.** "Explain more" must feel free. Cost control happens in the architecture, never by rationing the learner's curiosity.

---

## 6. Brand and design system

*(Confirmed by stakeholder; recorded here so design and engineering share one source of truth.)*

### 6.1 Identity

- **Name:** Usavvy
- **Primary tagline:** *Your pace. Your path. Your growth.*
- **Positioning statement:** "Master any subject your own way and at your own speed with Usavvy, the interactive learning platform built entirely around you."
- **Voice & tone:** Encouraging, peer-like, never condescending. Short sentences. No exclamation-mark spam. Never says "As an AI…".

### 6.2 Colour palette

| Role | Colour | Ratio | Usage |
|---|---|---|---|
| Primary | Electric Indigo / Deep Blue | 60% | App chrome, board background, headers, primary surfaces |
| Secondary | Soft Teal / Mint | 30% | Panels, progress fills, calm/neutral states, cohort UI |
| Accent | Energetic Coral / Orange | 10% | Interactive elements only — CTA buttons, correct-answer states, milestone/star moments, "Explain more" controls |

**Design constraint DC-1:** Accent colour is reserved for interaction and reward. It must never be used for errors or warnings — use a distinct semantic red/amber outside the brand triad.
**Design constraint DC-2:** All colour pairs must pass WCAG 2.1 AA (4.5:1 body text, 3:1 large text and UI components). Indigo-on-teal combinations are the known risk — token set must be contrast-tested before build.
**Design constraint DC-3:** Board mode ships with **dark board (indigo) and light board (paper)** themes. Learner-selectable, persisted to profile. Dark is default.

### 6.3 App icon

- Shape: rounded-square tile.
- Symbol: stylised **"U"** whose right stroke resolves into either a lightning bolt (sharpness/interaction) or an upward-curving path/arrow (self-paced progress). Recommend producing both routes and testing at 32px, 64px, 192px, 512px.
- Vibe: minimalist, bold, high-contrast, legible as a favicon and as a browser tab icon at 16px.
- Deliverables: SVG master, PNG set, favicon set, maskable icon, OG/social share card, light and dark variants.

---

## 7. Scope: release plan

Building all of this at once is the fastest route to shipping nothing. Recommended sequencing:

### MVP (Release 1) — "One learner, one board, one plan"
Epics 1, 2, 3, 4, 7 (partial) and 8.
- Sign-up, onboarding, profile
- Upload own content (PDF/DOCX/TXT) + 10 seed catalog courses
- **Interactive Board with voice + learner controls** (the core bet)
- Learning plans, progress, pace forecast
- Stars, streaks, course completion certificate
- Admin/content-ops back office, analytics

### Release 2 — "Prove it stuck"
Epic 6 (assignments + auto-evaluation), Epic 7 (leaderboards, opt-in), catalog expansion, course customisation.

### Release 3 — "Learn together"
Epic 5 (cohorts, scheduling, live group sessions, peer explain-back), group leaderboards.

**BA recommendation R1:** Do not compress this into one release. Group learning (Epic 5) has scheduling, real-time infrastructure, and moderation complexity comparable to the entire MVP. Shipping it late also lets cohort courses be seeded from proven self-paced content.

**BA recommendation R2:** Run a 2-week technical spike on the Board (§10) *before* committing MVP dates. Voice-visual synchronisation latency is the single largest delivery risk in this product.

---

## 8. Epic 1 — Account, onboarding and profile

### 8.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-A-1 | Sign up / log in via email+password and Google OAuth. Email verification required before first session. | MUST |
| FR-A-2 | Age declaration at sign-up. Users under 18 enter the minor flow (NFR-16): parental email consent required before any account activity. | MUST |
| FR-A-3 | Onboarding wizard captures: learning goal (free text), subject interests, weekly time availability (hours/day by weekday), preferred session length, target completion date if any, prior level (beginner/intermediate/advanced). | MUST |
| FR-A-4 | Learner preferences: voice on/off default, speech rate, board theme, explanation style default (concise / detailed / example-first / analogy-first), captions on/off, reduced-motion. | MUST |
| FR-A-5 | Profile page: avatar, display name, stars, streak, courses in progress/completed, certificates, privacy toggles. | MUST |
| FR-A-6 | Privacy controls: "Share my scores on public leaderboards" (default **OFF**), "Allow my display name in cohorts" (default ON), "Use my uploads to improve Usavvy" (default **OFF**). | MUST |
| FR-A-7 | Account deletion — self-service, removes uploads and personal data within 30 days, with confirmation email. | MUST |
| FR-A-8 | Data export — learner can download their progress, notes and submissions as JSON + PDF. | SHOULD |

### 8.2 Onboarding acceptance criteria (sample)

```
AC-A-3.1  GIVEN a newly verified user
          WHEN they complete the onboarding wizard
          THEN a Learner Profile record is created with availability, goal and level
          AND they land on a Recommended Courses screen with ≥3 catalog matches
          AND time-to-first-board-session is ≤ 90 seconds from wizard start.

AC-A-3.2  GIVEN a user who abandons onboarding at any step
          WHEN they return
          THEN they resume at the abandoned step, and may skip to the catalog
          AND skipped fields are requested contextually later (before plan creation).
```

**BA note:** Onboarding is where most learning products lose 40%+ of signups. Keep it to ≤ 5 screens and make every question visibly change what happens next. Any question that doesn't drive the plan, the catalog ranking, or the Avatar's default style should be cut.

---

## 9. Epic 2 — Content: catalog courses and learner uploads

### 9.1 Catalog courses (Usavvy-authored)

| ID | Requirement | Priority |
|---|---|---|
| FR-C-1 | A Course is a structured hierarchy: Course → Module → Topic → Concept. Each Concept carries learning objectives, prerequisite links, source material, board assets, checkpoint questions, and difficulty tier. | MUST |
| FR-C-2 | Catalog browse and search with filters: subject, level, duration, cohort-available, rating. | MUST |
| FR-C-3 | Course detail page: syllabus, estimated hours, prerequisites, sample board session (30-sec preview), outcomes. | MUST |
| FR-C-4 | **Course customisation before start:** learner may deselect topics they already know, mark topics as priority, set depth (overview / standard / deep dive), and choose default explanation style. This regenerates the plan and estimated hours. | MUST |
| FR-C-5 | Placement check (optional, 5–8 questions) that auto-deselects mastered topics and sets starting difficulty. | SHOULD |
| FR-C-6 | Course versioning — learners in progress stay on the version they started unless they opt into an update. | SHOULD |

### 9.2 Learner-uploaded content

| ID | Requirement | Priority |
|---|---|---|
| FR-C-7 | Upload PDF, DOCX, PPTX, TXT, MD. Limits: 50 MB/file, 300 pages/file, 10 files per custom course. | MUST |
| FR-C-8 | Paste-text and public-URL import. | SHOULD |
| FR-C-9 | **Ingestion pipeline:** parse → OCR fallback for scanned pages → structure detection (headings, sections) → chunk → embed → generate a proposed Topic/Concept outline. | MUST |
| FR-C-10 | **Learner reviews and edits the proposed outline** before learning starts: rename, reorder, merge, delete, mark priority. Nothing is generated blind. | MUST |
| FR-C-11 | Ingestion status UI with progress and clear failure reasons (encrypted PDF, image-only with failed OCR, unsupported language, file corrupt). | MUST |
| FR-C-12 | Copyright attestation checkbox at upload: learner confirms they have the right to use the material. Uploads are private to the uploader and never surfaced to other learners in v1. | MUST |
| FR-C-13 | Content safety scan on ingestion; block and flag material violating policy. | MUST |
| FR-C-14 | Mixed courses — attach personal notes to a catalog course so the Avatar can reference both. | MAY |

### 9.3 Ingestion acceptance criteria (sample)

```
AC-C-9.1  GIVEN a 120-page text-based PDF
          WHEN uploaded
          THEN ingestion completes in ≤ 3 minutes (p90)
          AND a proposed outline of Topics and Concepts is presented for review
          AND every proposed Concept links to its source page range.

AC-C-9.2  GIVEN a scanned image-only PDF
          WHEN OCR confidence is below threshold on >30% of pages
          THEN ingestion halts with a specific message and the option to
              upload a text version or continue with reduced-accuracy mode.
```

**BA note (risk):** Grounding matters more than model quality here. Every Avatar statement in an uploaded-content session must be traceable to a source chunk; a "Where did this come from?" control on the board (§10.2, FR-B-14) is both a trust feature and a hallucination safety valve.

---

## 10. Epic 3 — The Interactive Board (core learning engine)

**This is the product.** Everything below should be treated as MUST unless marked.

### 10.1 Session anatomy

A **Session** teaches one or more Concepts. It runs as a sequence of **Board Beats**. A Beat is the atomic unit: a short spoken segment (15–40 seconds) paired with a synchronised board action (write, draw, highlight, reveal, animate).

```
Session
 └── Concept (learning objective)
      └── Beat 1 ... Beat N     ← pause/rewind/branch happen at Beat boundaries
           ├── narration script (text)
           ├── board action (typed instruction: write | draw | highlight | step | diagram | code | equation)
           └── optional checkpoint question
```

Generating explanations as **structured Beats rather than free prose** is the key architectural decision. It makes speech-visual sync deterministic, makes pause/rewind precise, makes captions free, and makes re-explanation a targeted regeneration of one Beat instead of a whole answer.

### 10.2 Learner controls

| ID | Control | Behaviour | Priority |
|---|---|---|---|
| FR-B-1 | **Pause / Resume** | Halts speech and board immediately at the current Beat; state fully preserved across page reload and across days. | MUST |
| FR-B-2 | **Replay Beat** | Replays the current Beat verbatim. | MUST |
| FR-B-3 | **Back / Forward** | Steps between Beats; the board rewinds to the exact visual state of that Beat. | MUST |
| FR-B-4 | **Explain more — deeper** | Regenerates the current Concept at higher depth: mechanism, derivation, edge cases. | MUST |
| FR-B-5 | **Explain more — simpler** | Regenerates at lower cognitive load: plain language, smaller steps, concrete before abstract. | MUST |
| FR-B-6 | **Different example** | Same concept, new example, guaranteed distinct from all examples already shown this session. | MUST |
| FR-B-7 | **More examples** | Adds 2–3 further worked examples of graded difficulty. | MUST |
| FR-B-8 | **Explain with an analogy** | Maps the concept to a familiar domain; may use the learner's stated interests. | MUST |
| FR-B-9 | **Ask anything** | Free-text or voice question, answered in context and grounded in course material; may branch into a sub-Beat sequence, then returns to the main thread with a visible "back to lesson" affordance. | MUST |
| FR-B-10 | **Speed / voice controls** | 0.75×–1.5× speech rate, volume, mute (board-only mode), voice selection (≥2 voices). | MUST |
| FR-B-11 | **Skip concept** | Marks concept skipped; excluded from mastery but flagged in the plan for later. | MUST |
| FR-B-12 | **Restart concept** | Clears the board and re-teaches from Beat 1, using a different explanation route than the first pass. | MUST |
| FR-B-13 | **Bookmark / Note** | Saves the Beat with the board snapshot and a learner note into "My Notes". | MUST |
| FR-B-14 | **Source ("Where's this from?")** | Shows the source page/section for the current Beat when learning from uploaded or catalog material. | MUST |
| FR-B-15 | **Transcript panel** | Full running transcript, searchable, jump-to-Beat on click, copyable, downloadable. | MUST |
| FR-B-16 | **Board export** | Download the completed board as PNG/PDF, and the session as a study summary. | SHOULD |
| FR-B-17 | **Voice input (push-to-talk)** | Speak questions instead of typing. Text input always available as fallback. | SHOULD |
| FR-B-18 | **"I'm confused" button** | One click, no need to articulate why. Avatar diagnoses with a short question and re-routes. | SHOULD |

**BA note:** FR-B-18 is small and high-leverage. Learners often can't name their confusion — requiring them to phrase a question is a real barrier. This is a differentiator worth keeping in MVP.

### 10.3 Re-explanation intelligence

| ID | Requirement | Priority |
|---|---|---|
| FR-B-19 | The system maintains a per-concept **Explanation History**: routes already used, examples already given, analogies already used, learner's demonstrated sticking points. | MUST |
| FR-B-20 | A repeat request MUST select a route not yet used for that concept. Repeating a used route is a defect, not a variation. | MUST |
| FR-B-21 | Explanation routes (minimum set): *formal definition · worked example · analogy · visual/diagram · step-by-step procedure · contrast with a near-miss concept · common misconception correction · real-world application*. | MUST |
| FR-B-22 | After two failed checkpoint attempts on a concept, the Avatar SHOULD auto-drop one difficulty tier and switch route without being asked. | SHOULD |
| FR-B-23 | Prerequisite backtrack: if the learner's confusion maps to a prerequisite concept, the Avatar offers a 2-minute refresher on it, then returns. | SHOULD |
| FR-B-24 | Checkpoint questions appear at concept boundaries (1–3 questions, MCQ or short answer). Results feed mastery, not grades. | MUST |

### 10.4 Board rendering capabilities

| ID | Capability | Priority |
|---|---|---|
| FR-B-25 | Progressive text writing with emphasis (bold, colour, underline), synced to narration | MUST |
| FR-B-26 | Mathematical notation (LaTeX/MathML), rendered progressively line by line for derivations | MUST |
| FR-B-27 | Syntax-highlighted code blocks with line-by-line highlight-as-explained | MUST |
| FR-B-28 | Diagrams: boxes/arrows/flowcharts/trees, drawn incrementally | MUST |
| FR-B-29 | Tables and comparison grids | MUST |
| FR-B-30 | Charts/plots for quantitative concepts | SHOULD |
| FR-B-31 | Board zoom, pan, and infinite vertical scroll with beat markers in the gutter | MUST |
| FR-B-32 | Highlight/spotlight — dim the board except the element currently being discussed | SHOULD |
| FR-B-33 | Learner annotation on the board (pen, highlighter, sticky note), saved to notes | MAY |

### 10.5 Session acceptance criteria (sample)

```
AC-B-1.1  GIVEN an active session at Beat 7
          WHEN the learner clicks Pause and closes the browser
          AND returns 3 days later on a different device
          THEN the session resumes at Beat 7 with the board restored to its
              exact visual state, and the transcript intact.

AC-B-6.1  GIVEN the learner has already seen 2 examples for concept X
          WHEN they request "Different example"
          THEN a third example is produced that shares no scenario, numbers
              or surface structure with the previous two
          AND the Explanation History records example #3.

AC-B-9.1  GIVEN the learner asks a free-text question mid-session
          WHEN the question is within course scope
          THEN the answer is grounded in course material with a visible source
          WHEN the question is outside course scope
          THEN the Avatar answers briefly, flags it as off-syllabus,
              and offers to return to the lesson or add it as a side topic.
```

### 10.6 Performance requirements for the Board

These are product requirements, not engineering preferences. Latency is the experience.

| ID | Metric | Target |
|---|---|---|
| NFR-B-1 | Time to first audio after "Start session" | ≤ 2.0 s (p90) |
| NFR-B-2 | Time to first audio after any "Explain more" control | ≤ 1.5 s (p90) |
| NFR-B-3 | Pause response | ≤ 150 ms — must feel instant |
| NFR-B-4 | Audio–board drift over a 10-minute session | ≤ 200 ms |
| NFR-B-5 | Free-text question → first audio token | ≤ 2.5 s (p90) |
| NFR-B-6 | Audio gap between consecutive Beats | ≤ 300 ms (no dead air) |

**BA recommendation R3:** Pre-generate and cache Beats for catalog courses at the standard depth. Catalog content is finite and repeated across thousands of learners — caching it converts the dominant runtime cost into a one-time authoring cost, and takes NFR-B-1 from "hard" to "trivial" for the majority of sessions. Only branches (deeper, simpler, different example, ad-hoc questions) need live generation, and the common branches can be pre-generated too.

---

## 11. Epic 4 — Learning plans, progress and forecasting

### 11.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-P-1 | **Predefined plan:** each catalog course ships with recommended plans (e.g. Relaxed 8 weeks / Standard 4 weeks / Intensive 2 weeks) stating hours/week required. | MUST |
| FR-P-2 | **Custom plan builder:** learner sets target end date OR weekly hours; the system computes the other and warns if infeasible. Learner picks study days, session length, and start date. | MUST |
| FR-P-3 | Plan generates a dated schedule of sessions mapped to topics, respecting prerequisites. | MUST |
| FR-P-4 | **Progress dashboard** showing: % complete, concepts mastered / in progress / not started, hours invested, current streak, and mastery by topic. | MUST |
| FR-P-5 | **Plan vs. actual:** expected position on today's date vs. actual position, with a clear "on track / slightly behind / behind" state. | MUST |
| FR-P-6 | **Pace-based forecast:** projected completion date from the learner's actual observed velocity over the trailing 14 days, with a confidence band. Displayed as: *"At your current pace (2.4 hrs/week) you'll finish on 18 Oct — 12 days later than planned."* | MUST |
| FR-P-7 | **Replan:** one-click adjustment when behind — extend end date, increase weekly hours, reduce depth, or drop optional topics. Show the impact of each option before the learner commits. | MUST |
| FR-P-8 | Calendar view of scheduled sessions; export to .ics. | SHOULD |
| FR-P-9 | Email/in-app reminders for scheduled sessions and streak-at-risk, respecting a quiet-hours setting. Frequency capped and one-click unsubscribable. | MUST |
| FR-P-10 | Catch-up mode: if the learner misses ≥ 3 scheduled sessions, offer a compressed recovery plan rather than letting the schedule silently rot. | SHOULD |

### 11.2 Progress definition — do this properly

**Progress MUST be mastery-weighted, not time-weighted or slide-weighted.**

```
Concept states:  not_started → in_progress → understood → mastered
                                                   ↓
                                              needs_review  (decay after N days
                                                             without retrieval)

Course progress % = Σ(concept_weight × mastery_score) / Σ(concept_weight)

mastery_score:  in_progress 0.3 | understood 0.7 | mastered 1.0 | skipped 0.0
```

Where mastery is evidenced by checkpoint performance and assignment scores, not by having sat through the audio.

**BA note:** This is the single most important integrity decision in the product. A learner who watches everything and understands nothing must not see 100%. If Principle 4 ("Honest progress") is compromised anywhere, it will be here under pressure to make the dashboard look encouraging — resist it.

### 11.3 Forecast algorithm (v1 — deliberately simple)

```
velocity      = concepts_mastered over trailing 14 active days ÷ 14
remaining     = Σ remaining concept_weights
forecast_days = remaining ÷ max(velocity, floor)
confidence    = f(consistency of daily velocity, sample size)

Display rules:
  < 5 active days of data → "Building your pace estimate — check back after a few sessions"
  velocity = 0 for 7+ days → dormant state; prompt replan, not a forecast
  Show a range, never a single false-precision date, when confidence is low
```

Ship the transparent version first. A learned model can replace it once there is real behavioural data — not before.

### 11.4 Sample acceptance criteria

```
AC-P-6.1  GIVEN a learner 3 concepts behind plan with 14 days of pace data
          WHEN they open the dashboard
          THEN the status reads "Behind" with the number of concepts behind
          AND a forecast date with confidence band is shown
          AND at least 2 concrete replan options are offered with their impact stated.

AC-P-2.1  GIVEN a learner sets a target date requiring > 25 hrs/week
          WHEN they submit the plan
          THEN a feasibility warning appears with a realistic alternative date
          AND the learner may still proceed after acknowledging it.
```

---

## 12. Epic 5 — Group learning (cohorts)

*Release 3. This epic carries the highest complexity-to-validated-demand ratio in the product — see BA recommendation R1.*

### 12.1 Cohort formation

| ID | Requirement | Priority |
|---|---|---|
| FR-G-1 | Cohort-enabled catalog courses declare: min seats, max seats, cadence options (daily / alternate days / weekends), session duration, cohort language, level. | MUST |
| FR-G-2 | Learner joins a **waiting list**, submitting weekly availability (timezone-aware) and preferred cadence. | MUST |
| FR-G-3 | Waiting-list UI shows seats filled, expected start window, and an honest "we'll notify you" state. | MUST |
| FR-G-4 | **Matching engine** forms a cohort when min seats are reached AND a common weekly slot pattern exists across ≥ 80% of members. It maximises overlap; members who can't fit the majority pattern are offered the next cohort or a self-paced fallback. | MUST |
| FR-G-5 | Cohort start requires member confirmation of the proposed schedule within 48 hrs; non-confirmers are returned to the waiting list. | MUST |
| FR-G-6 | **Anti-stall guarantee:** if a waiting list hasn't formed a cohort within X days, offer (a) a smaller cohort, (b) a different cadence, or (c) start self-paced now and join a cohort later with progress carried over. | MUST |
| FR-G-7 | Cohort size cap for interaction quality: recommend 6–15 learners. | MUST |
| FR-G-8 | Late-join window: learners may join within the first 2 sessions if seats remain. | SHOULD |

**BA note (critical):** The waiting-list model is the biggest cold-start risk in this product. With low early traffic, cohorts will not form, and every learner who waits and gets nothing is likely lost for good. FR-G-6 is not optional — it is the mitigation that makes this feature safe to ship.

### 12.2 Live cohort sessions

| ID | Requirement | Priority |
|---|---|---|
| FR-G-9 | Scheduled live session room: shared Avatar-led board, synchronised for all participants. | MUST |
| FR-G-10 | **Facilitator model:** the Avatar teaches; individual "explain more" requests go to a private side-panel so one learner cannot hijack the shared pace. Repeated requests on the same concept from ≥ 30% of the cohort trigger a shared re-explanation. | MUST |
| FR-G-11 | Text chat with threads; raise-hand queue. | MUST |
| FR-G-12 | Live polls / group checkpoint questions with anonymised aggregate results shown on the board. | MUST |
| FR-G-13 | **Peer explain-back:** the Avatar nominates a learner (rotating, opt-in) to explain a concept in their own words via text or voice; the Avatar then affirms, corrects gently, and adds nuance. Contributors earn stars. | SHOULD |
| FR-G-14 | Breakout pairs for practice problems. | MAY |
| FR-G-15 | Session recording (board + transcript, no learner audio by default) available to cohort members for 30 days. | SHOULD |
| FR-G-16 | Attendance tracking; missed-session catch-up as a self-paced replay of the same content. | MUST |
| FR-G-17 | Cohort progress board: attendance, collective mastery, group streak. | SHOULD |
| FR-G-18 | Moderation: report user, mute, remove from cohort; profanity/abuse filter on chat; all reports routed to admin queue with SLA. | MUST |
| FR-G-19 | Cohort lifecycle: if attendance drops below a floor for 3 consecutive sessions, offer merge with another cohort or graceful conversion to self-paced. | SHOULD |

**Open question OQ-5 (§22):** Peer explain-back (FR-G-13) is pedagogically the strongest element of group learning — teaching a concept is among the most effective ways to consolidate it. But it needs careful UX: unwilling learners must never be put on the spot. Recommend opt-in-per-session with a clear "pass" that carries no penalty or visibility.

---

## 13. Epic 6 — Assignments and evaluation

*Release 2.*

### 13.1 Generation and submission

| ID | Requirement | Priority |
|---|---|---|
| FR-E-1 | Auto-generate assignments per topic and per course, aligned to learning objectives and calibrated to the learner's demonstrated level. | MUST |
| FR-E-2 | Supported item types: MCQ, multi-select, short answer, long answer/essay, numerical with working, code, file upload (PDF/DOCX/image of handwritten work). | MUST |
| FR-E-3 | Every assignment carries a visible **rubric** before the learner starts. | MUST |
| FR-E-4 | Submission: in-browser editor for text/code; drag-drop upload (≤ 25 MB) for files; save draft; one resubmission allowed after feedback. | MUST |
| FR-E-5 | Practice mode (unlimited, unscored) vs. graded mode (counts toward mastery and leaderboards). | MUST |
| FR-E-6 | Handwritten submissions processed via OCR; learner sees the extracted text and confirms before grading. | SHOULD |

### 13.2 Evaluation

| ID | Requirement | Priority |
|---|---|---|
| FR-E-7 | Objective items auto-graded deterministically. | MUST |
| FR-E-8 | Open-ended items graded against the rubric criterion by criterion, each with a score, justification, and quoted evidence from the learner's own work. | MUST |
| FR-E-9 | Feedback structure: what was correct → what was missing/incorrect → why it matters → the specific concept to revisit → a link that opens a board session on that concept. | MUST |
| FR-E-10 | Grading confidence flag; low-confidence gradings are marked "review recommended" and queued for human spot-check. | MUST |
| FR-E-11 | **Learner appeal:** dispute a grade with a reason; triggers a second-pass evaluation and, if still disputed, a human review queue. | MUST |
| FR-E-12 | Assignment results update concept mastery and the progress model. | MUST |
| FR-E-13 | Turnaround: objective instant; open-ended ≤ 2 minutes (p90). Long-form ≤ 10 minutes with clear status. | MUST |
| FR-E-14 | Academic-integrity notice: v1 does **not** run plagiarism or AI-detection checks. Framed as learning, not certification. | MUST |

**BA note (risk R-EVAL):** Auto-evaluation of open-ended work is where learner trust is won or lost, and where a wrong grade does real harm. Three mitigations are mandatory: (1) always show reasoning and evidence, never a bare number; (2) never let an automated grade be terminal — FR-E-11 appeal is non-negotiable; (3) calibrate against 200+ human-graded samples per subject before launch and track agreement rate as a live quality metric (target ≥ 85% within ±1 rubric band).

---

## 14. Epic 7 — Engagement: stars, streaks, leaderboards

### 14.1 Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-R-1 | **Stars** awarded for: completing a concept with mastery, completing a topic, completing a course, assignment score bands, maintaining a streak, and (cohort) peer explain-back contributions. | MUST |
| FR-R-2 | Star values are published and stable. No hidden or arbitrary awards. | MUST |
| FR-R-3 | **Streaks** count active learning days, with 2 freeze days per month so illness or travel doesn't erase weeks of effort. | MUST |
| FR-R-4 | **Badges** for meaningful milestones: first course, 10-day streak, comeback (returned after 14+ days away), deep-diver (used "explain deeper" 25 times), helper (5 peer explain-backs). | SHOULD |
| FR-R-5 | **Completion certificate** — shareable, verifiable via URL, explicitly labelled non-accredited. | MUST |
| FR-R-6 | **Leaderboards** — per catalog course and global; **opt-in only** (FR-A-6), pseudonymous display name, weekly and all-time views. | MUST (R2) |
| FR-R-7 | Leaderboard ranking uses mastery + assignment scores + consistency — **never raw time spent**, which rewards inefficiency. | MUST |
| FR-R-8 | **Cohort leaderboard** — within-cohort only, visible to members, with a collective goal alongside individual ranks. | SHOULD (R3) |
| FR-R-9 | Anti-gaming: rate limits, minimum time-on-concept, duplicate-attempt detection, and exclusion of practice mode from scores. | MUST |
| FR-R-10 | Learner may hide themselves from all leaderboards at any time without losing stars or badges. | MUST |

**BA note:** Competitive leaderboards demotivate mid- and low-performing learners as reliably as they motivate the top few — this is well established in the education literature, and in a self-paced product the mid-pack *is* the business. Design rules: default OFF; show the learner's local neighbourhood rather than a global top-100 wall; foreground personal-best and streak framing over rank; and treat cohort leaderboards (small, familiar, collaborative) as the primary competitive surface rather than global ones.

---

## 15. Epic 8 — Back office and analytics

| ID | Requirement | Priority |
|---|---|---|
| FR-O-1 | Course authoring console: create/edit Course→Module→Topic→Concept, attach source material, define objectives, prerequisites, checkpoint questions, and pre-generate/review Beats. | MUST |
| FR-O-2 | Content QA workflow: draft → internal review → published, with version history and rollback. | MUST |
| FR-O-3 | Cohort admin: view waiting lists, force-form or cancel cohorts, reschedule sessions. | MUST (R3) |
| FR-O-4 | Moderation queue: abuse reports, flagged uploads, copyright takedown requests, low-confidence gradings, grade appeals. | MUST |
| FR-O-5 | User admin: search, view state, reset password, suspend, refund, delete on request. | MUST |
| FR-O-6 | Analytics: funnel (signup → onboarded → first session → plan created → topic 1 complete → course complete), retention cohorts, session-level telemetry, control usage, drop-off points by concept. | MUST |
| FR-O-7 | **Concept difficulty heatmap** — where learners pause, replay, request simpler explanations, or fail checkpoints, aggregated per concept. This is the feedback loop that improves the curriculum. | MUST |
| FR-O-8 | AI quality dashboard: hallucination flags, source-grounding rate, grading agreement rate, thumbs-down rate per concept, cost per learner-hour. | MUST |
| FR-O-9 | In-session feedback: thumbs up/down on any Beat or explanation, with an optional reason, routed to FR-O-7/8. | MUST |

**BA note:** FR-O-7 turns Usavvy from a content company into a learning-science company. Knowing that 62% of learners request a simpler explanation at Concept 4.3 is a curriculum insight no textbook publisher has. Instrument it from day one.

---

## 16. Non-functional requirements

### 16.1 Performance and scale

| ID | Requirement |
|---|---|
| NFR-1 | Page load (LCP) ≤ 2.5 s on a 4G connection; board interactive ≤ 3.5 s. |
| NFR-2 | Board session controls respond ≤ 150 ms. |
| NFR-3 | Support 5,000 concurrent self-paced sessions and 50 concurrent cohort sessions at launch scale; architecture must scale horizontally to 10×. |
| NFR-4 | Cohort session sync drift across participants ≤ 500 ms. |
| NFR-5 | Uptime 99.5% monthly; scheduled maintenance outside 18:00–23:00 IST (peak study hours). |
| NFR-6 | Graceful degradation: if TTS fails, the session continues in text-board mode with a visible notice rather than failing. |

### 16.2 Compatibility and accessibility

| ID | Requirement |
|---|---|
| NFR-7 | Browsers: latest 2 versions of Chrome, Edge, Safari, Firefox. Responsive 360 px → 2560 px; board usable on tablet, with a simplified mobile-web layout. |
| NFR-8 | **WCAG 2.1 AA compliance.** Full keyboard operation of the board, visible focus states, screen-reader labels for all controls. |
| NFR-9 | **Captions/transcript are always available and synchronised** — this is a hard requirement for deaf and hard-of-hearing learners, and doubles as a study feature for everyone. |
| NFR-10 | Respect `prefers-reduced-motion`; board animation must be disableable without losing content. |
| NFR-11 | Text scaling to 200% without loss of function. Dyslexia-friendly font option. |
| NFR-12 | i18n-ready: no hardcoded strings, locale-aware dates/numbers. Content is English-only in v1. |

### 16.3 Security, privacy and compliance

| ID | Requirement |
|---|---|
| NFR-13 | TLS 1.2+ in transit; AES-256 at rest. Uploads stored in private object storage with signed, expiring URLs. |
| NFR-14 | Learner uploads are private to the uploader; never used for training unless the learner explicitly opts in (FR-A-6), and never shared with other learners in v1. |
| NFR-15 | Compliance scope: India DPDP Act 2023; GDPR-ready (data export, erasure, consent records, DPA with processors). Data residency in-region where feasible. |
| NFR-16 | **Minors:** age gate at signup; under-18 requires verifiable parental consent; minors are excluded from public leaderboards and from open cohort chat by default; no behavioural profiling for advertising, ever. |
| NFR-17 | PII minimisation in AI prompts; no learner PII in third-party model calls beyond what is functionally required; logging redaction. |
| NFR-18 | Rate limiting and abuse protection on generation endpoints (cost and safety). |
| NFR-19 | Content safety filters on both learner input and Avatar output; escalation path for self-harm or crisis disclosures surfaced during a session — route to a static support-resources page, never an improvised AI response. |
| NFR-20 | Audit log for admin actions, grade changes, and data access. |
| NFR-21 | DMCA/copyright takedown process with a published contact and a defined response SLA. |

### 16.4 Cost and sustainability

| ID | Requirement |
|---|---|
| NFR-22 | **Cost per learner-hour must be measured and dashboarded from day one** (LLM tokens + TTS characters + ASR minutes + storage + egress). |
| NFR-23 | Target blended cost per learner-hour to support ≥ 60% gross margin at the intended price point. Caching (R3) and tiered model routing are the primary levers. |
| NFR-24 | Fair-use ceilings on generation-heavy actions, expressed generously and only enforced against abuse patterns — never in a way a genuine learner encounters (Principle 6). |

**BA note (business-critical):** This product's cost scales with engagement, which is the opposite of most SaaS. A learner who uses "explain more" forty times in an hour is your best learner and your most expensive one. The unit cost model must be built *before* pricing is set, not after. Pre-generated catalog Beats (R3) plus routing simple branches to smaller models are the two levers that make the economics work.

---

## 17. Key user journeys

**J1 — Ananya uploads a chapter and studies it (self-paced)**
Sign up → onboarding (goal, availability, level) → Upload PDF → review proposed outline, drop 2 known topics → start board session → listens + watches derivation appear on the board → clicks *Explain simpler* at the tricky step → clicks *Different example* → answers checkpoint questions (2/3) → Avatar auto-drops difficulty and re-routes → concept marked understood → bookmarks the board → session ends with a summary, 15 stars, and tomorrow's session pre-scheduled.

**J2 — Ravi builds a plan and falls behind**
Picks a catalog course → chooses Standard 4-week plan → adjusts to 5 weeks around his availability → studies 3 sessions → misses a week → receives a streak-at-risk nudge → opens dashboard → sees "Behind — 4 concepts; at your current pace you'll finish 12 days late" → chooses *Replan: extend to 6 weeks* → schedule rebuilds → back on track.

**J3 — Meera joins a cohort**
Browses cohort-enabled courses → joins waiting list with availability → sees "7 of 8 seats filled, expected start this week" → cohort forms; confirms the proposed Tue/Thu 8 pm slot → attends live session → asks a private "explain deeper" in the side panel → is nominated for peer explain-back, accepts, explains the concept in chat → Avatar affirms and adds nuance → earns helper badge → misses one session, catches up via self-paced replay.

**J4 — Assignment loop**
Topic completes → assignment unlocked → learner reads rubric → submits a long answer → graded in 90 seconds against 4 rubric criteria with quoted evidence → scores 6/10 → feedback links directly to the two weak concepts → learner opens a board session on each → resubmits → 9/10 → mastery updates → progress % rises → 30 stars.

---

## 18. Data model (key entities)

```
User ──1:1── LearnerProfile (goal, level, availability, preferences, privacy flags)
  │
  ├──1:N── Enrollment ──N:1── Course ──1:N── Module ──1:N── Topic ──1:N── Concept
  │            │                                                            │
  │            ├──1:1── LearningPlan (start, target, cadence, schedule)     │
  │            ├──1:N── ScheduledSession                                     │
  │            └──1:N── ConceptProgress ─────────────────────────────────────┘
  │                        (state, mastery_score, attempts, last_reviewed,
  │                         explanation_history[], time_spent)
  │
  ├──1:N── Session ──1:N── Beat (narration, board_action, audio_ref, source_ref)
  │            └──1:N── SessionEvent (pause, replay, explain_deeper, question, …)
  │
  ├──1:N── UploadedDocument ──1:N── ContentChunk (text, embedding, source_ref)
  ├──1:N── AssignmentSubmission ──1:1── Evaluation (rubric_scores, feedback, confidence)
  ├──1:N── Note / Bookmark
  ├──1:N── StarTransaction, Badge, Streak
  └──0:N── CohortMembership ──N:1── Cohort ──1:N── CohortSession ──1:N── CohortMessage
                                      └──1:N── WaitingListEntry (availability, cadence pref)
```

**Note:** `explanation_history` on ConceptProgress is what powers FR-B-19/20 and is easy to overlook in schema design. Flag it explicitly to the engineering lead.

---

## 19. High-level architecture considerations

*Indicative only — the architecture decision record is a separate artifact.*

| Layer | Consideration |
|---|---|
| Frontend | SPA with a dedicated Board renderer (canvas or SVG scene graph) driven by a Beat timeline. Board state must be serialisable so any Beat can be restored exactly (FR-B-3, AC-B-1.1). |
| Realtime | WebSocket/WebRTC data channel for streaming Beats and for cohort synchronisation. |
| Lesson orchestration | A service that owns the Beat state machine, learner controls, explanation-route selection, and Explanation History. This is the product's crown jewel — keep it server-side and model-agnostic. |
| Generation | LLM behind an abstraction layer with tiered routing (large model for authoring/deep branches, small for simple ones). Structured Beat output enforced by schema. |
| Voice | Streaming TTS with word-level timing for board sync; ASR for voice questions. Both must be swappable providers. |
| Retrieval | Vector store + chunk metadata; every Beat carries a source reference (FR-B-14). |
| Ingestion | Async pipeline with a job queue: parse → OCR → structure → chunk → embed → outline. |
| Caching | Pre-generated Beats and audio for catalog courses and their common branches (R3). |
| Data | Relational store for domain entities; object storage for uploads, audio and board snapshots; analytics warehouse for §15. |

### 19.1 The Avatar — a deliberate recommendation

Ship the Avatar in v1 as a **voice + expressive presence indicator** (a simple animated mark or waveform in the board corner, with speaking/thinking/listening states), **not** a photorealistic talking head.

Rationale: video avatars add cost, latency, and uncanny-valley risk, and add nothing to learning outcomes — the board is where the learner's attention should be. Every second spent on face rendering is a second not spent on NFR-B-2. Revisit only if user research shows a genuine trust or engagement gap.

**Assumption A2:** Stakeholder agrees with this. If a visual avatar is a firm brand requirement, it changes cost, latency budgets, and timeline materially, and must be raised now.

---

## 20. Success metrics

| Layer | Metric | Launch target |
|---|---|---|
| **North Star** | Weekly Mastered Concepts per Active Learner | ≥ 6 |
| Activation | % signups completing first board session within 24 hrs | ≥ 55% |
| Activation | % of first sessions reaching concept completion (not abandoned) | ≥ 70% |
| Engagement | Median session length | 18–30 min |
| Engagement | % of sessions using ≥ 1 "explain more" control | ≥ 50% *(this proves the core hypothesis)* |
| Retention | Week-2 return rate | ≥ 60% |
| Retention | 8-week retention | ≥ 30% |
| Outcome | Course completion (learners with a plan) | ≥ 35% |
| Outcome | Checkpoint first-attempt accuracy | 60–75% *(too high = too easy; too low = poor teaching)* |
| Quality | Beat thumbs-down rate | ≤ 3% |
| Quality | Source-grounding rate for uploaded-content sessions | ≥ 95% |
| Quality | Grading agreement with human raters (±1 rubric band) | ≥ 85% |
| Group | Waiting-list → cohort formation rate | ≥ 70% within 7 days |
| Group | Cohort session attendance | ≥ 65% |
| Business | Cost per learner-hour | Within model for ≥ 60% GM |

---

## 21. Risks and mitigations

| ID | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-1 | Voice–board synchronisation feels laggy or off; the core experience fails | Critical | Medium | 2-week spike before commitment (R2); word-timing-driven sync; pre-generated Beats; hard latency budgets in §10.6 as acceptance criteria |
| R-2 | Runtime AI cost outruns revenue as engagement grows | Critical | High | Cost dashboard from day one; catalog Beat caching; tiered model routing; measure before pricing |
| R-3 | Hallucination on uploaded content; learner is taught something false | Critical | Medium | Strict retrieval grounding; source reference on every Beat; refuse-and-flag when the source doesn't support an answer; thumbs-down loop |
| R-4 | Cohorts never form due to low early traffic | High | **High** | FR-G-6 anti-stall guarantee; seed cohorts with fixed published start dates rather than pure demand-matching; ship cohorts in R3 when the user base exists |
| R-5 | Auto-grading is wrong or perceived as unfair; trust collapses | High | Medium | Rubric transparency, evidence quoting, confidence flags, mandatory appeal path, human spot-checks, calibration set |
| R-6 | Scope: three products (self-paced, cohort, assessment) built at once, none finished | High | **High** | Phased release plan §7; MVP is the board and nothing else |
| R-7 | Copyright exposure from learner uploads | High | Medium | Attestation at upload, private-only storage, no redistribution, DMCA process, no training use without opt-in |
| R-8 | Minors using the platform without consent controls | High | Medium | Age gate, parental consent flow, restricted defaults (NFR-16) |
| R-9 | Leaderboards demotivate the mid-pack majority | Medium | Medium | Opt-in default OFF, local-neighbourhood ranking, personal-best framing, cohort-first competition |
| R-10 | Model/TTS vendor dependency (price, policy, or availability change) | Medium | Medium | Provider abstraction layer, no vendor-specific features in domain logic, evaluated fallback provider |
| R-11 | Progress inflation to make dashboards look good, destroying trust in mastery | Medium | Medium | Mastery-weighted progress (§11.2) locked as a product principle, protected in review |

---

## 22. Open decisions required from stakeholders

| # | Question | Why it blocks | Needed by |
|---|---|---|---|
| OQ-1 | Monetisation model — free tier limits, subscription price, per-course purchase, or credits? | Determines fair-use design (NFR-24), cost targets, and paywall placement in every flow | Before UX design |
| OQ-2 | Primary market and language confirmation (Assumption A1) | Drives privacy scope, latency/hosting region, pricing, and content strategy | Before architecture |
| OQ-3 | Avatar form: voice-only presence vs. visual talking head (Assumption A2, §19.1) | Materially changes cost, latency budget and timeline | Before spike |
| OQ-4 | Target subjects for the 10 seed catalog courses | Board capability priorities differ sharply (maths needs LaTeX + derivations; programming needs code execution; humanities needs argument mapping) | Before content build |
| OQ-5 | Peer explain-back: opt-in per session, or cohort-wide expectation? | Affects cohort UX, moderation load and star economy | Before R3 |
| OQ-6 | Is a human-in-the-loop grading capacity available for appeals and spot-checks (FR-E-10/11)? | If not, open-ended assignment scope must shrink | Before R2 |
| OQ-7 | Certificate positioning — is any accreditation partnership intended? | Affects marketing claims and legal review | Before R2 |
| OQ-8 | Do learners need to share uploaded content with a cohort? | Currently prohibited (NFR-14); changing it opens significant copyright and privacy work | Before R3 |

---

## 23. Glossary

| Term | Definition |
|---|---|
| **Beat** | The atomic unit of teaching: one short narration segment paired with one synchronised board action. |
| **Board** | The visual teaching surface where the Avatar writes, draws and highlights. |
| **Avatar** | The AI tutor persona — voice plus presence indicator, not a video character (v1). |
| **Explanation route** | A distinct pedagogical strategy for teaching a concept (definition, worked example, analogy, visual, procedure, contrast, misconception, application). |
| **Explanation History** | Per-learner, per-concept record of which routes and examples have already been used. |
| **Concept** | The smallest assessable learning unit, carrying one or more objectives. |
| **Mastery** | Demonstrated understanding evidenced by checkpoints and assignments — not time spent. |
| **Cohort** | A group of learners matched by course, availability and cadence, learning together on a schedule. |
| **Checkpoint** | A short in-session question used to gauge understanding, not to grade. |
| **Pace forecast** | Projected completion date derived from the learner's observed velocity. |

---

*End of document. Version 1.0 — circulate for review; §22 must be closed before engineering estimation.*