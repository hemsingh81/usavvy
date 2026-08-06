---
stepsCompleted: [1, 2, 3, 4]
inputDocuments: ['Doc/00-Requirement.md', '_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md', '_AI-Agile-Development/party-mode/memories/installed/.memlog.md']
---

# Usavvy - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Usavvy, decomposing the requirements from the PRD, Architecture spine, and party-mode review notes into implementable stories.

## Requirements Inventory

### Functional Requirements

**Epic A — Account, onboarding and profile**
- FR-A-1: Support sign-up/login via email+password and Google OAuth, with email verification required before first session. MUST
- FR-A-2: Capture age declaration at sign-up; users under 18 enter a minor flow requiring parental email consent before any account activity. MUST
- FR-A-3: Onboarding wizard captures learning goal, subject interests, weekly availability, preferred session length, target completion date, and prior level. MUST
- FR-A-4: Capture learner preferences — voice on/off, speech rate, board theme, default explanation style, captions on/off, reduced-motion. MUST
- FR-A-5: Provide a profile page showing avatar, display name, stars, streak, courses in progress/completed, certificates, and privacy toggles. MUST
- FR-A-6: Provide privacy controls for public leaderboard sharing (default OFF), display name in cohorts (default ON), and use of uploads to improve Usavvy (default OFF). MUST
- FR-A-7: Support self-service account deletion, removing uploads and personal data within 30 days with a confirmation email. MUST
- FR-A-8: Allow the learner to export their progress, notes and submissions as JSON + PDF. SHOULD
- FR-A-9: Color theme picker — learner selects from predefined app-wide color themes in Preferences, separate from the Board's own dark/paper toggle. SHOULD
- FR-A-10: Notification Center — view, mark-as-read, and clear in-app notifications; a notification tied to an in-progress process cannot be cleared until it resolves. MUST
- FR-A-11: Activity History — every board session, assignment attempt, and cohort session is logged and browsable chronologically, anytime. SHOULD

**Epic C — Content: catalog courses and learner uploads**
- FR-C-1: Model a Course as a Course→Module→Topic→Concept hierarchy, with each Concept carrying objectives, prerequisites, source material, board assets, checkpoints, and difficulty tier. MUST
- FR-C-2: Provide catalog browse and search with filters for subject, level, duration, cohort-availability, and rating. MUST
- FR-C-3: Provide a course detail page with syllabus, estimated hours, prerequisites, a 30-second sample board session, and outcomes. MUST
- FR-C-4: Allow course customisation before start — deselect known topics, mark priority topics, set depth, choose default explanation style — regenerating the plan and estimated hours. MUST
- FR-C-5: Offer an optional 5–8 question placement check that auto-deselects mastered topics and sets starting difficulty. SHOULD
- FR-C-6: Version catalog courses so learners in progress stay on their started version unless they opt into an update. SHOULD
- FR-C-7: Support upload of PDF, DOCX, PPTX, TXT, MD with limits of 50 MB/file, 300 pages/file, 10 files per custom course. MUST
- FR-C-8: Support paste-text and public-URL import of content. SHOULD
- FR-C-9: Run an ingestion pipeline (parse → OCR fallback → structure detection → chunk → embed → propose Topic/Concept outline). MUST
- FR-C-10: Require the learner to review and edit the proposed outline (rename, reorder, merge, delete, mark priority) before learning starts. MUST
- FR-C-11: Show ingestion status with progress and clear failure reasons (encrypted PDF, failed OCR, unsupported language, corrupt file). MUST
- FR-C-12: Require a copyright attestation checkbox at upload; uploads remain private to the uploader and are never surfaced to other learners in v1. MUST
- FR-C-13: Run a content safety scan on ingestion that blocks and flags policy-violating material. MUST
- FR-C-14: Allow mixed courses — attaching personal notes to a catalog course so the Avatar can reference both. MAY

**Epic B — The Interactive Board**
- FR-B-1: Pause/Resume halts speech and board immediately at the current Beat, with state preserved across reload and across days. MUST
- FR-B-2: Replay Beat replays the current Beat verbatim. MUST
- FR-B-3: Back/Forward steps between Beats, restoring the board to that Beat's exact visual state. MUST
- FR-B-4: "Explain more — deeper" regenerates the current Concept at higher depth (mechanism, derivation, edge cases). MUST
- FR-B-5: "Explain more — simpler" regenerates at lower cognitive load (plain language, smaller steps, concrete before abstract). MUST
- FR-B-6: "Different example" produces a new example guaranteed distinct from all examples already shown that session. MUST
- FR-B-7: "More examples" adds 2–3 further worked examples of graded difficulty. MUST
- FR-B-8: "Explain with an analogy" maps the concept to a familiar domain, optionally using the learner's stated interests. MUST
- FR-B-9: "Ask anything" answers a free-text or voice question in context, grounded in course material, branching into sub-Beats with a visible return-to-lesson affordance. MUST
- FR-B-10: Provide speed/voice controls — 0.75x–1.5x rate, volume, mute (board-only mode), and ≥2 voice selections. MUST
- FR-B-11: "Skip concept" marks a concept skipped, excluding it from mastery but flagging it in the plan for later. MUST — *un-skip transition undefined, see Additional Requirements (party-mode)*
- FR-B-12: "Restart concept" clears the board and re-teaches from Beat 1 via a different explanation route than the first pass. MUST
- FR-B-13: "Bookmark/Note" saves the Beat with a board snapshot and learner note into "My Notes". MUST
- FR-B-14: "Source" shows the source page/section for the current Beat when learning from uploaded or catalog material. MUST
- FR-B-15: Provide a full, searchable transcript panel with jump-to-Beat, copy, and download. MUST
- FR-B-16: Allow board export as PNG/PDF and the session as a study summary. SHOULD
- FR-B-17: Support voice input (push-to-talk) for questions, with text input always available as fallback. SHOULD
- FR-B-18: Provide an "I'm confused" button that lets the Avatar diagnose via a short question and re-route, without requiring the learner to articulate the issue. SHOULD
- FR-B-19: Maintain a per-concept Explanation History of routes used, examples given, analogies used, and demonstrated sticking points. MUST
- FR-B-20: Require a repeat explanation request to select a route not yet used for that concept. MUST
- FR-B-21: Support a minimum set of explanation routes — formal definition, worked example, analogy, visual/diagram, step-by-step procedure, contrast with a near-miss concept, misconception correction, real-world application. MUST
- FR-B-22: After two failed checkpoint attempts, the Avatar should auto-drop one difficulty tier and switch route unprompted. SHOULD
- FR-B-23: On confusion mapping to a prerequisite concept, offer a 2-minute refresher on it before returning. SHOULD
- FR-B-24: Present 1–3 checkpoint questions (MCQ or short answer) at concept boundaries, feeding mastery rather than grades. MUST
- FR-B-25: Support progressive text writing with emphasis (bold, colour, underline) synced to narration. MUST
- FR-B-26: Support mathematical notation (LaTeX/MathML) rendered progressively line by line for derivations. MUST
- FR-B-27: Support syntax-highlighted code blocks with line-by-line highlight-as-explained. MUST
- FR-B-28: Support incrementally drawn diagrams (boxes/arrows/flowcharts/trees). MUST
- FR-B-29: Support tables and comparison grids. MUST
- FR-B-30: Support charts/plots for quantitative concepts. SHOULD
- FR-B-31: Support board zoom, pan, and infinite vertical scroll with beat markers in the gutter. MUST
- FR-B-32: Support highlight/spotlight that dims the board except the currently discussed element. SHOULD
- FR-B-33: Support learner annotation on the board (pen, highlighter, sticky note), saved to notes. MAY

**Epic P — Learning plans, progress and forecasting**
- FR-P-1: Ship each catalog course with predefined plans (e.g. Relaxed/Standard/Intensive) stating hours/week required. MUST
- FR-P-2: Provide a custom plan builder where the learner sets target end date or weekly hours, computing the other and warning if infeasible. MUST
- FR-P-3: Generate a dated schedule of sessions mapped to topics, respecting prerequisites. MUST
- FR-P-4: Provide a progress dashboard showing % complete, concept states, hours invested, streak, and mastery by topic. MUST — *needs "N of M, X skipped" disclosure, see Additional Requirements (party-mode)*
- FR-P-5: Show plan-vs-actual position with an on-track/slightly-behind/behind state. MUST
- FR-P-6: Provide a pace-based forecast of completion date from trailing-14-day observed velocity, with a confidence band. MUST
- FR-P-7: Provide one-click replan options (extend date, increase hours, reduce depth, drop optional topics) showing impact before commit. MUST
- FR-P-8: Provide a calendar view of scheduled sessions exportable to .ics. SHOULD
- FR-P-9: Send email/in-app reminders for scheduled sessions and streak-at-risk, respecting quiet hours, capped frequency, and one-click unsubscribe. MUST
- FR-P-10: Offer a compressed catch-up recovery plan when a learner misses ≥3 scheduled sessions. SHOULD

**Epic G — Group learning (cohorts)**
- FR-G-1: Let cohort-enabled courses declare min/max seats, cadence options, session duration, cohort language, and level. MUST
- FR-G-2: Let a learner join a timezone-aware waiting list, submitting weekly availability and preferred cadence. MUST
- FR-G-3: Show waiting-list UI with seats filled, expected start window, and an honest "we'll notify you" state. MUST
- FR-G-4: Run a matching engine that forms a cohort once min seats are reached and a common weekly slot pattern exists across ≥80% of members, maximising overlap and offering fallback to non-fitting members. MUST
- FR-G-5: Require member confirmation of the proposed schedule within 48 hrs to start a cohort; non-confirmers return to the waiting list. MUST
- FR-G-6: Provide an anti-stall guarantee — if a waiting list hasn't formed a cohort within 14 days `[ASSUMPTION]`, offer a smaller cohort, different cadence, or self-paced start with progress carried over. MUST — *see Additional Requirements (party-mode)*
- FR-G-7: Cap cohort size for interaction quality, recommending 6–15 learners. MUST
- FR-G-8: Allow late-join within the first 2 sessions if seats remain. SHOULD
- FR-G-9: Provide a scheduled live session room with a shared, synchronised Avatar-led board. MUST
- FR-G-10: Route individual "explain more" requests to a private side-panel under a facilitator model; trigger shared re-explanation when ≥30% of the cohort repeats the same request. MUST
- FR-G-11: Provide text chat with threads and a raise-hand queue. MUST
- FR-G-12: Provide live polls/group checkpoint questions with anonymised aggregate results on the board. MUST
- FR-G-13: Support peer explain-back — Avatar nominates an opt-in rotating learner to explain a concept, then affirms/corrects/adds nuance; contributors earn stars. SHOULD
- FR-G-14: Support breakout pairs for practice problems. MAY
- FR-G-15: Make session recordings (board + transcript, no learner audio by default) available to cohort members for 30 days. SHOULD
- FR-G-16: Track attendance and offer missed-session catch-up as a self-paced replay. MUST
- FR-G-17: Provide a cohort progress board showing attendance, collective mastery, and group streak. SHOULD
- FR-G-18: Provide moderation (report/mute/remove), a chat profanity/abuse filter, and admin-queued reports with SLA. MUST
- FR-G-19: On attendance dropping below a floor for 3 consecutive sessions, offer cohort merge or graceful conversion to self-paced. SHOULD

**Epic E — Assignments and evaluation**
- FR-E-1: Auto-generate assignments per topic/course, aligned to learning objectives and calibrated to demonstrated level. MUST
- FR-E-2: Support item types — MCQ, multi-select, short answer, long answer/essay, numerical with working, code, file upload. MUST
- FR-E-3: Show a visible rubric before the learner starts every assignment. MUST
- FR-E-4: Support in-browser editor submission, drag-drop file upload (≤25 MB), draft save, and one resubmission after feedback. MUST
- FR-E-5: Distinguish practice mode (unlimited, unscored) from graded mode (counts toward mastery and leaderboards). MUST
- FR-E-6: Process handwritten submissions via OCR, with learner confirmation of extracted text before grading. SHOULD
- FR-E-7: Auto-grade objective items deterministically. MUST
- FR-E-8: Grade open-ended items against the rubric criterion by criterion with score, justification, and quoted evidence. MUST
- FR-E-9: Structure feedback as correct → missing/incorrect → why it matters → concept to revisit → link to a board session on that concept. MUST
- FR-E-10: Flag low-confidence gradings as "review recommended" and queue them for human spot-check. MUST
- FR-E-11: Support learner grade appeal, triggering a second-pass evaluation and, if still disputed, a human review queue. MUST
- FR-E-12: Feed assignment results into concept mastery and the progress model. MUST
- FR-E-13: Meet turnaround targets — objective instant, open-ended ≤2 min (p90), long-form ≤10 min with status. MUST
- FR-E-14: Display an academic-integrity notice that v1 runs no plagiarism/AI-detection checks. MUST

**Epic R — Engagement: stars, streaks, leaderboards**
- FR-R-1: Award stars for concept mastery, topic/course completion, assignment score bands, streaks, and peer explain-back contributions. MUST
- FR-R-2: Publish stable star values with no hidden/arbitrary awards. MUST
- FR-R-3: Count streaks as active learning days, with 2 freeze days per month. MUST
- FR-R-4: Award badges for milestones (first course, 10-day streak, comeback, deep-diver, helper). SHOULD
- FR-R-5: Issue a shareable, URL-verifiable, explicitly non-accredited completion certificate. MUST — *interacts with §11.2 completion threshold, see Additional Requirements (party-mode)*
- FR-R-6: Provide opt-in-only leaderboards per catalog course and global, pseudonymous, weekly and all-time views. MUST (R2)
- FR-R-7: Rank leaderboards on mastery + assignment scores + consistency, never raw time spent. MUST
- FR-R-8: Provide a within-cohort leaderboard visible to members with a collective goal alongside individual ranks. SHOULD (R3)
- FR-R-9: Apply anti-gaming measures — rate limits, minimum time-on-concept, duplicate-attempt detection, exclusion of practice mode. MUST
- FR-R-10: Let a learner hide from all leaderboards at any time without losing stars or badges. MUST

**Epic O — Back office and analytics**
- FR-O-1: Provide a course authoring console to build the Course→Module→Topic→Concept hierarchy, attach materials, define objectives/prerequisites/checkpoints, and pre-generate/review Beats. MUST
- FR-O-2: Run a content QA workflow (draft → internal review → published) with version history and rollback. MUST
- FR-O-3: Provide cohort admin — view waiting lists, force-form/cancel cohorts, reschedule sessions. MUST (R3)
- FR-O-4: Provide a moderation queue for abuse reports, flagged uploads, copyright takedowns, low-confidence gradings, and grade appeals. MUST
- FR-O-5: Provide user admin — search, view state, reset password, suspend, refund, delete on request. MUST
- FR-O-6: Provide analytics — signup-to-completion funnel, retention cohorts, session telemetry, control usage, drop-off points by concept. MUST
- FR-O-7: Provide a concept difficulty heatmap of pauses, replays, simpler-explanation requests, and checkpoint failures, aggregated per concept. MUST
- FR-O-8: Provide an AI quality dashboard — hallucination flags, source-grounding rate, grading agreement rate, thumbs-down rate, cost per learner-hour. MUST
- FR-O-9: Provide in-session thumbs up/down feedback on any Beat/explanation with optional reason, routed to FR-O-7/8. MUST

### NonFunctional Requirements

- NFR-1: Page load (LCP) ≤ 2.5 s on 4G; board interactive ≤ 3.5 s.
- NFR-2: Board session controls respond ≤ 150 ms.
- NFR-3: Support 5,000 concurrent self-paced sessions and 50 concurrent cohort sessions at launch, scaling horizontally to 10x.
- NFR-4: Cohort session sync drift across participants ≤ 500 ms.
- NFR-5: Uptime 99.5% monthly; scheduled maintenance outside 18:00–23:00 IST.
- NFR-6: Degrade gracefully to text-board mode with a visible notice if TTS fails.
- NFR-7: Support latest 2 versions of Chrome/Edge/Safari/Firefox, responsive 360px–2560px, tablet-usable board with simplified mobile-web layout.
- NFR-8: Achieve WCAG 2.1 AA compliance with full keyboard operation, visible focus states, and screen-reader labels for all board controls.
- NFR-9: Keep captions/transcript always available and synchronised.
- NFR-10: Respect `prefers-reduced-motion`; board animation must be disableable without losing content.
- NFR-11: Support text scaling to 200% without loss of function, plus a dyslexia-friendly font option.
- NFR-12: Be i18n-ready with no hardcoded strings and locale-aware dates/numbers; content is English-only in v1.
- NFR-13: Enforce TLS 1.2+ in transit and AES-256 at rest; uploads in private object storage with signed, expiring URLs.
- NFR-14: Keep learner uploads private to the uploader, never used for training without explicit opt-in, never shared with other learners in v1.
- NFR-15: Meet compliance scope of India DPDP Act 2023 and GDPR-readiness (export, erasure, consent records, DPAs), with in-region data residency where feasible.
- NFR-16: Enforce minor protections — age gate, verifiable parental consent, exclusion from public leaderboards and open cohort chat by default, no ad-driven behavioural profiling.
- NFR-17: Minimise PII in AI prompts; no learner PII in third-party model calls beyond functional need; redact logs.
- NFR-18: Apply rate limiting and abuse protection on generation endpoints.
- NFR-19: Apply content safety filters on learner input and Avatar output, with mandatory self-harm/crisis escalation to a static support-resources page (never an improvised AI response).
- NFR-20: Maintain an audit log for admin actions, grade changes, and data access.
- NFR-21: Maintain a DMCA/copyright takedown process with published contact and defined response SLA.
- NFR-22: Measure and dashboard cost per learner-hour (LLM tokens, TTS characters, ASR minutes, storage, egress) from day one.
- NFR-23: Target a blended cost per learner-hour supporting ≥60% gross margin at the intended price point.
- NFR-24: Apply fair-use ceilings on generation-heavy actions, generous and enforced only against abuse, never encountered by a genuine learner.
- NFR-25: No silent failures — every error is surfaced to the user or logged with traceable context; a swallowed exception with neither is a defect.
- NFR-26: Every long-running/background action (ingestion, grading, cohort matching) has a durable status the learner can check later, not just in the moment.
- NFR-B-1: Time to first audio after "Start session" ≤ 2.0 s (p90).
- NFR-B-2: Time to first audio after any "Explain more" control ≤ 1.5 s (p90).
- NFR-B-3: Pause response ≤ 150 ms (must feel instant).
- NFR-B-4: Audio–board drift over a 10-minute session ≤ 200 ms.
- NFR-B-5: Free-text question → first audio token ≤ 2.5 s (p90).
- NFR-B-6: Audio gap between consecutive Beats ≤ 300 ms (no dead air).

### Additional Requirements

**From Architecture (ARCHITECTURE-SPINE.md):**

- **Stack/paradigm:** Node.js 24 LTS + TypeScript 6.x (strict) + Fastify 5.x backend, React 19 + Vite 8 frontend, pnpm 11 workspaces monorepo, PostgreSQL 18 + pgvector, Drizzle ORM. Built from the paradigm spec in the spine — explicitly not a pre-built starter template. Dev-only object storage adapter is SeaweedFS; job queue is pg-boss.
- **Module boundaries (AD-14):** auth/users, courses, plans-progress, board-orchestration, ingestion, assignments, engagement, cohorts — each owns a fixed set of entities; cross-module access only via public service API or subscribed domain events, never direct schema/FK reach-around (AD-13, AD-14).
- **Ports needing mock adapters before real ones:** GenerationPort, VoicePort, VectorStorePort, StoragePort, NotificationPort, PubSubPort, JobQueuePort (AD-1). `mock` is the default binding for generation/voice/notification until a real provider is configured — early stories must be buildable and demoable with zero API spend. GenerationPort centrally owns Beat caching, tiered routing, and rate-limiting (AD-2) — no module implements its own. VectorStorePort carries a required metadata contract (documentId, courseId, conceptId, chunkId) shared by ingestion and generation.
- **RBAC (AD-7):** Roles SuperAdmin/Admin/Mentor/Student; role→permission matrix is versioned config, per-user role assignment in DB; one `can(user, action, resource)` guard; no per-user overrides in v1. Mentor's actual permission scope is undefined — flag to whichever epic first exercises it.
- **Walking-skeleton delivery direction:** first phase is auth+RBAC wired end to end, empty shells for every module, one hardcoded course, board rendering static content against the mock generation adapter — FE+BE built together, phased, visually demoable at each phase.
- **Other binding ADs:** AD-3 (safety/PII enforcement centralized at GenerationPort/VoicePort, reused for cohort chat via shared SafetyFilter); AD-4 (static copy via locale keys vs. generated-content locale parameter — two distinct rules); AD-5 (WebSocket-only realtime via PubSubPort, versioned WS message contracts in shared-types, narration audio streamed not stored); AD-6 (all files through StoragePort); AD-8 (tests/ mirrors src/ 1:1); AD-9 (strict TS + ESLint + eslint-plugin-boundaries + i18n lint, Husky-enforced); AD-10 (Session naming disambiguation: LearningSession / PlannedSession / CohortSession); AD-11 (local-only dev, docker-compose for Postgres+pgvector+SeaweedFS only); AD-12 (boot-time structural config vs. DB-backed live feature flags); AD-13 (state-changing facts must hit the event bus even alongside a sync call); AD-15 (JobQueuePort/pg-boss for ingestion, long-form grading, Beat pre-generation); AD-16 (Epic 8 analytics reads operational tables directly in v1, no warehouse).
- **Explicitly Deferred — do not build against these yet:** cloud provider/staging/CI-CD/secrets; Redis PubSubPort activation; dedicated vector DB; real LLM/TTS/ASR provider selection; per-user permission overrides; observability/APM tooling; locale library; payment/billing (blocked on OQ-1). Epic 3 (Board) and Epic 7 (Cohorts) each warrant their own epic-altitude architecture spine before their stories are finalized. *(Corrected during Implementation Readiness review — this originally read "Epic 5 (Cohorts)," a stale numbering artifact; Cohorts is Epic 7 in this document's epic list. The CohortSession↔LearningSession relationship question this note exists to flag is resolved directly in Story 7.9 below pending a fuller epic-altitude spine.)*

**From party-mode review notes (`.memlog.md`, installed room):**

1. **FR-G-6's 14-day anti-stall window is an unconfirmed assumption** (tagged `[ASSUMPTION]` in the PRD itself). John pushed on its origin in party-mode; unresolved. Cohort-formation stories must make the window configurable, not hardcode 14 — or get explicit stakeholder confirmation first.
2. **§11.2's progress-formula fix has an unaddressed gaming risk.** Excluding skipped concepts from both numerator and denominator means a learner can skip the harder half of a course and still show 100% on what's left. Mary flagged this; unresolved. Needs a disclosure/UX treatment ("completed N of M, X skipped") wherever progress or completion is surfaced (FR-P-4, FR-R-5).
3. **FR-B-11's skip/un-skip transition is architecturally undefined.** Amelia flagged that whether a learner can later un-skip a concept — and how that interacts with ConceptProgress state and the §11.2 formula — is unspecified. Must be resolved before FR-B-11/FR-B-12 or FR-P-4/§11.2-touching stories are finalized.

### UX Design Requirements

*(No UX design contract exists yet — no `bmad-ux` run found in planning-artifacts. Proceeding without one; Board-related stories will lean on PRD §6 brand/design system and §10.2 learner controls in its place.)*

### FR Coverage Map

| Epic | FR Range | Count |
| --- | --- | --- |
| 1 — Account, Onboarding & Profile | FR-A-1 – FR-A-11 | 11 |
| 2 — Content: Catalog & Learner Uploads | FR-C-1 – FR-C-14 | 14 |
| 3 — The Interactive Board | FR-B-1 – FR-B-33 (excl. FR-B-11, moved to Epic 4) | 32 |
| 4 — Learning Plans, Progress & Forecasting | FR-P-1 – FR-P-10, FR-B-11 | 11 |
| 5 — Engagement: Stars, Streaks & Certificates | FR-R-1 – FR-R-5 | 5 |
| 6 — Assignments & Evaluation | FR-E-1 – FR-E-14 | 14 |
| 7 — Group Learning: Cohorts | FR-G-1 – FR-G-19 | 19 |
| 8 — Leaderboards | FR-R-6 – FR-R-10 | 5 |
| 9 — Back Office & Analytics | FR-O-1 – FR-O-9 | 9 |
| **Total** | | **120** |

All 120 FRs mapped, no gaps (117 from the original PRD extraction + FR-A-9/10/11 added post-readiness at user request).

## Epic List

### Epic 1: Account, Onboarding & Profile

Users can sign up, verify identity, complete onboarding, and manage their profile/privacy settings. Standalone — nothing else needs to exist first. First stories build `NotificationPort` (mock adapter, per architecture AD-1) as a prerequisite for FR-A-1's email verification; every later epic's notifications (FR-A-7 deletion confirmation, FR-P-9 reminders, etc.) consume this port rather than each inventing their own. Also owns the Theme Picker (FR-A-9), Notification Center (FR-A-10), and Activity History (FR-A-11) — Activity History reads other epics' data incrementally as they ship (AD-18), rather than depending on them existing first.

**FRs covered:** FR-A-1, FR-A-2, FR-A-3, FR-A-4, FR-A-5, FR-A-6, FR-A-7, FR-A-8, FR-A-9, FR-A-10, FR-A-11

### Epic 2: Content — Catalog & Learner Uploads

Users can browse/search the course catalog, customize a course before starting, or upload their own material and get a reviewable AI-proposed outline. Depends on Epic 1.

**FRs covered:** FR-C-1, FR-C-2, FR-C-3, FR-C-4, FR-C-5, FR-C-6, FR-C-7, FR-C-8, FR-C-9, FR-C-10, FR-C-11, FR-C-12, FR-C-13, FR-C-14

### Epic 3: The Interactive Board

Users learn via the AI-avatar-led board — pause/rewind/replay, "explain deeper/simpler," different examples, ask-anything, checkpoints, full multi-modal rendering (text/math/code/diagrams). This is the product's core bet. Depends on Epic 1 + 2. **FR-B-11 (Skip concept) is delivered entirely by Epic 4**, not here — final validation caught that a Board-local story calling Epic 4's not-yet-built service was a forward dependency; since Epic 4 owns the underlying state machine and already depends on Epic 3 existing, Epic 4 delivers the whole capability, board control included (see Epic 4 → Story 4.13).

**FRs covered:** FR-B-1, FR-B-2, FR-B-3, FR-B-4, FR-B-5, FR-B-6, FR-B-7, FR-B-8, FR-B-9, FR-B-10, FR-B-12, FR-B-13, FR-B-14, FR-B-15, FR-B-16, FR-B-17, FR-B-18, FR-B-19, FR-B-20, FR-B-21, FR-B-22, FR-B-23, FR-B-24, FR-B-25, FR-B-26, FR-B-27, FR-B-28, FR-B-29, FR-B-30, FR-B-31, FR-B-32, FR-B-33 (FR-B-11 moved to Epic 4)

### Epic 4: Learning Plans, Progress & Forecasting

Users can build a plan, see honest mastery-weighted progress, get a pace forecast, and replan when behind. Depends on Epic 2 + 3. Owns the `ConceptProgress` state machine end to end, including the full FR-B-11 skip/un-skip capability — both the state machine (Story 4.4) and the Board-facing control itself (Story 4.13, extending the Epic-3-built Board UI; moved here during final validation to remove a forward dependency) — and the skip-gaming disclosure ("completed N of M concepts, X skipped") on the progress dashboard (FR-P-4) — which Epic 5's certificate story (FR-R-5) must read from, not re-derive independently. Also owns publishing `concept.mastered`/`topic.completed`/`course.completed` events (Story 4.14, added during Implementation Readiness review) — Epic 5's star/badge stories consume these but nothing previously produced them.

**FRs covered:** FR-P-1, FR-P-2, FR-P-3, FR-P-4, FR-P-5, FR-P-6, FR-P-7, FR-P-8, FR-P-9, FR-P-10, FR-B-11 (moved from Epic 3)

### Epic 5: Engagement — Stars, Streaks & Certificates

Users earn stars, keep streaks, unlock badges, and get a verifiable, non-accredited completion certificate. Depends on Epic 3 + 4. Kept separate from leaderboards (Epic 8) deliberately: leaderboard psychology is a distinct design risk (PRD risk R-9: demotivates the mid-pack majority), not just a later release tag, and needs its own dedicated design pass rather than inheriting whatever attention is left after stars/streaks ship.

**FRs covered:** FR-R-1, FR-R-2, FR-R-3, FR-R-4, FR-R-5

### Epic 6: Assignments & Evaluation

Users get auto-generated, rubric-graded assignments with structured feedback and an appeal path. Depends on Epic 3 + 4 (links back to board sessions, feeds the mastery model).

**FRs covered:** FR-E-1, FR-E-2, FR-E-3, FR-E-4, FR-E-5, FR-E-6, FR-E-7, FR-E-8, FR-E-9, FR-E-10, FR-E-11, FR-E-12, FR-E-13, FR-E-14

### Epic 7: Group Learning — Cohorts

Users can join a waiting list, get matched into a cohort, and attend live Avatar-led group sessions with peer explain-back. Highest complexity in the product; ships last per the PRD's own R1 recommendation. Depends on Epic 1–4. FR-G-6's 14-day anti-stall window is still an unconfirmed `[ASSUMPTION]` — build it configurable, do not hardcode.

**FRs covered:** FR-G-1, FR-G-2, FR-G-3, FR-G-4, FR-G-5, FR-G-6, FR-G-7, FR-G-8, FR-G-9, FR-G-10, FR-G-11, FR-G-12, FR-G-13, FR-G-14, FR-G-15, FR-G-16, FR-G-17, FR-G-18, FR-G-19

### Epic 8: Leaderboards

Users can opt in to course and global leaderboards, ranked honestly on mastery + consistency, never raw time spent, with full self-hide control at any time. Depends on Epic 5. This is where the leaderboard design risk noted in Epic 5 actually gets designed for — default-off, local-neighborhood ranking, cohort-first competition per the PRD's own §14 guidance.

**FRs covered:** FR-R-6, FR-R-7, FR-R-8, FR-R-9, FR-R-10

### Epic 9: Back Office & Analytics

Internal staff (Content-Ops, Admin/Moderation personas) can author and QA courses, moderate reports, administer users, and see funnel/heatmap/AI-quality analytics. Mixed readiness inside one epic: authoring/moderation/user-admin stories are buildable early in parallel with other epics; the analytics dashboards (FR-O-6, FR-O-7, FR-O-8, FR-O-9) need other epics' events flowing first. Per-story "buildable now / blocked on X" sequencing is assigned when this epic's stories are written (step 3), not at this level.

**FRs covered:** FR-O-1, FR-O-2, FR-O-3, FR-O-4, FR-O-5, FR-O-6, FR-O-7, FR-O-8, FR-O-9

## Epic 1: Account, Onboarding & Profile

Users can sign up, verify identity, complete onboarding, and manage their profile/privacy settings. Standalone. First stories build `NotificationPort` (mock adapter, per architecture AD-1) as a prerequisite for FR-A-1's email verification; every later epic's notifications consume this port rather than each inventing their own.

### Story 1.0: Environment Walking Skeleton & Health Check
*(Sprint 0 — infrastructure, no FR mapping; foundation for everything else)*

As a developer, I want a working frontend + backend skeleton wired together locally, with a health-check, so that I can verify the environment is correctly set up before building real features.

**Acceptance Criteria:**
**Given** `docker-compose` is run locally (Postgres+pgvector, SeaweedFS)
**When** `apps/api` and `apps/web` are started
**Then** `GET /health` on the backend returns 200 with service status (DB connection ok, storage adapter ok)
**And** the frontend home page calls `/health` and visibly displays "System OK"
**And** this works with zero external API keys configured — mock adapters only (AD-1)

**Given** the walking skeleton is running
**When** a developer inspects the repo
**Then** the structure matches the architecture spine's Structural Seed (`apps/web`, `apps/api`, `packages/shared-types`, `packages/config`) with empty module shells for every module in AD-14's ownership table

**Given** the walking skeleton's module shells
**When** `NotificationPort` is wired
**Then** its `mock` adapter is bound and callable (logs to console/file, no real email sent) — added here rather than in Story 1.1 because Story 1.1 already assumes the port exists; this closes that gap explicitly

### Story 1.1: Sign Up & Log In with Email Verification — FR-A-1
As a learner, I want to sign up with email+password or Google OAuth and verify my email, so that I can securely access my account before starting to learn.

**Acceptance Criteria:**
**Given** a new visitor registers with email+password
**When** they submit the form
**Then** a verification email sends via `NotificationPort` (mock adapter in dev)
**And** they cannot start a board session until verified

**Given** a visitor chooses "Sign up with Google"
**When** OAuth completes
**Then** the account is created and treated as pre-verified

**Given** an unverified user clicks the verification link
**Then** their account becomes verified and they're redirected to onboarding

### Story 1.2: Age Declaration & Minor Consent — FR-A-2
As a new user, I want to declare my age at sign-up, so that the platform applies the right protections if I'm a minor.

**Acceptance Criteria:**
**Given** a new user's birthdate indicates under 18
**Then** the account enters a minor flow requiring parental email consent before any account activity

**Given** a minor-flagged account awaiting consent
**Then** the learner sees a clear "waiting for parental consent" state and cannot access learning features

**Given** a parent clicks the consent link
**Then** the account activates and normal onboarding proceeds

### Story 1.3: Onboarding Wizard — FR-A-3

*Fixed during Implementation Readiness review: the original AC landed the learner on a "Recommended Courses screen," which requires Epic 2's catalog and contradicts Epic 1's own standalone claim. Rescoped to what Epic 1 can actually deliver alone; Epic 2 owns turning this into real recommendations once the catalog exists.*

As a newly verified learner, I want a short onboarding wizard, so that the system knows my goals, availability, and level before recommending courses.

**Acceptance Criteria:**
**Given** a newly verified user completes the wizard (goal, interests, availability, session length, target date, level)
**Then** a Learner Profile record is created and they land on an onboarding-complete screen with a generic "Browse the catalog" call to action

**Given** a user abandons onboarding partway
**When** they return later
**Then** they resume at the abandoned step

**Given** the Learner Profile record created here
**When** Epic 2's catalog exists
**Then** Epic 2 owns rendering a "Recommended Courses" surface driven by this profile's goal/interests/level — that surface is out of scope for this story and does not block it

### Story 1.4: Learner Preferences — FR-A-4
As a learner, I want to set voice/board/explanation-style preferences, so that my sessions match how I like to learn.

**Acceptance Criteria:**
**Given** a learner sets voice on/off, speech rate, board theme, explanation style, captions, reduced-motion
**Then** these are saved and applied as defaults on their next board session

### Story 1.5: Profile Page — FR-A-5
As a learner, I want a profile page showing my progress and achievements, so that I can see my learning identity at a glance.

**Acceptance Criteria:**
**Given** a logged-in learner opens their profile
**Then** they see avatar, display name, stars, streak, in-progress/completed courses, certificates, and privacy toggles

### Story 1.6: Privacy Controls — FR-A-6
As a learner, I want privacy controls over my visibility, so that I control what's shared about me.

**Acceptance Criteria:**
**Given** a learner views privacy settings
**Then** defaults are: public-leaderboard sharing OFF, cohort display-name ON, uploads-for-training OFF

**Given** they change any toggle
**Then** the change saves and takes effect immediately

### Story 1.7: Account Deletion — FR-A-7
As a learner, I want to delete my account, so that I can exercise my right to be forgotten.

**Acceptance Criteria:**
**Given** a learner confirms account deletion
**Then** a confirmation email sends via `NotificationPort`
**And** all uploads and personal data are removed within 30 days

### Story 1.8: Data Export — FR-A-8

*Fixed during Implementation Readiness review: the original AC promised progress (Epic 4), notes (Epic 3), and submissions (Epic 6) — none of which exist when Epic 1 ships. Rescoped to Epic 1's own data; later epics extend the same export rather than this story depending on them.*

As a learner, I want to export my data, so that I have a personal copy of my account.

**Acceptance Criteria:**
**Given** a logged-in learner requests an export
**Then** they receive their account and profile data (Learner Profile, preferences, privacy settings) as JSON + PDF

**Given** Epic 3, Epic 4, and/or Epic 6 have shipped and the learner has notes, progress, or submissions recorded
**When** the export is generated
**Then** each of those epics' own data is included as an additional section, added incrementally as each epic lands — this story defines the export mechanism and the account-data section only; it does not block on or require the other epics to exist

### Story 1.9: Predefined Color Theme Picker — FR-A-9

*Added post-launch-readiness at user request.*

As a learner, I want to pick from a small set of predefined color themes, so that the app looks and feels the way I prefer.

**Acceptance Criteria:**
**Given** a learner opens the theme picker in Preferences
**When** they select one of the four predefined themes (Indigo Focus, Midnight, High Contrast, Warm Paper — per `DESIGN.md`)
**Then** the app chrome re-renders in that theme immediately, with no page reload, and the choice is saved to their Learner Profile

**Given** a learner has not yet chosen a theme
**Then** Indigo Focus applies by default

**Given** a learner is inside a live Board session
**When** they change their app theme
**Then** the Board's own dark/paper theme (a separate control, FR-A-4) is unaffected — the two settings never override each other

### Story 1.10: Notification Center — FR-A-10

As a learner, I want to see, mark as read, and clear my notifications, so that I know what needs my attention without losing track of things still in progress.

**Acceptance Criteria:**
**Given** a domain event that should notify the learner in-app occurs (e.g., a reminder, a completed ingestion, a graded assignment)
**When** it is processed
**Then** a `Notification` record is created via `NotificationPort`'s in-app channel (mock adapter per Story 1.0 in dev), referencing the source process/event it came from
**And** the bell icon in the app chrome shows an unread indicator

**Given** a learner opens the Notification Center
**When** they select a notification
**Then** it is marked read, independent of whether it is cleared

**Given** a learner attempts to clear a notification
**When** its referenced source process has already resolved (completed, failed, or cancelled)
**Then** it is cleared/removed from the list

**Given** a learner attempts to clear a notification
**When** its referenced source process is still in progress
**Then** the clear action is disabled with an explanatory tooltip ("still in progress") — the notification can still be marked read, just not cleared, until the process resolves

### Story 1.11: Activity History — FR-A-11

*This story defines the Activity History surface and reads from data Epic 1 already owns (login/account events); as Epic 3, Epic 6, and Epic 7 ship, each contributes its own entries via their own already-existing events/records (Story 3.1's `learning_session.ended`, Story 6.12's `assignment.graded`, Story 7.19's attendance records) rather than this story depending on those epics existing first.*

As a learner, I want to review a chronological history of my board sessions, assignment attempts, and cohort sessions, so that I can look back at anything I've done, anytime.

**Acceptance Criteria:**
**Given** a logged-in learner opens Activity History
**Then** they see a reverse-chronological timeline of their recorded activity, each entry showing its type, date, and a link back to its source (a board session entry links to that session's Transcript; an assignment entry links to its feedback; a cohort session entry links to its recording if available)

**Given** a learner has no recorded activity yet
**Then** an explicit empty state is shown, not a blank panel

**Given** Epic 3/6/7 have not yet shipped
**When** a learner opens Activity History
**Then** only the activity types from currently-shipped epics appear — the timeline never errors or shows a placeholder for a type that doesn't exist yet

### Story 1.12: Application shell and persistent navigation

*Added 2026-08-06 via Sprint Change Proposal (`sprint-change-proposal-2026-08-06.md`) — retrofits a real navigation shell across every page Epic 1/Epic 2 already shipped. Every route so far (login, signup, profile, preferences, activity history, catalog, course detail, upload-content, etc.) has only ever been reachable by typing its exact URL — no persistent header/nav has ever existed (`AppHeader.tsx`'s own comment confirms this was a deliberate, explicitly-scoped-out gap since Story 1.10). `DESIGN.md` already specifies "primary navigation" as an intended chrome element (its color spec names it directly) — this story builds what was designed but never wired up, and touches presentation/routing only, with zero changes to any of the 23 already-completed stories' backend or business logic.*

As a learner, I want a consistent header and navigation across every page, so that I can move through the app as one connected experience instead of only reaching pages by typing exact URLs.

**Acceptance Criteria:**
**Given** a logged-in learner is on any authenticated page
**Then** a persistent shell (header/nav) is visible, styled per `DESIGN.md`'s existing "primary navigation" spec, and stays present across navigation between pages

**Given** the persistent nav
**Then** it links to every already-shipped authenticated page (catalog, upload-content, profile, preferences, activity history, account deletion, data export) so each is reachable without knowing its URL

**Given** a visitor is on a public route (`/login`, `/signup`, `/verify-email`, `/age-declaration`, `/waiting-for-consent`, `/parental-consent`)
**Then** the nav is hidden or shown in a minimal, logged-out state — never showing links to authenticated-only pages

**Given** this story ships
**When** any existing route, test, or backend behavior is exercised
**Then** nothing about it changes — this story is additive presentation/routing only

## Epic 2: Content — Catalog & Learner Uploads

Users can browse/search the course catalog, customize a course before starting, or upload their own material and get a reviewable AI-proposed outline. Depends on Epic 1.

### Story 2.1: Model the Course→Module→Topic→Concept hierarchy — FR-C-1
As a content operations user, I want catalog content stored as a Course→Module→Topic→Concept hierarchy where each Concept carries its objectives, prerequisites, source material, board assets, checkpoints, and difficulty tier, so that catalog courses can be authored and later browsed, customised, and taught with a consistent structure.

**Acceptance Criteria:**
**Given** the courses module's data store
**When** a Course is created with nested Modules, Topics, and Concepts
**Then** each Concept persists its learning objectives, prerequisite links to other Concepts, source material references, board asset references, checkpoint questions, and a difficulty tier
**And** each Module, Topic, and Concept records its position/order within its parent for stable sequencing

**Given** a Concept being created with a prerequisite link
**When** the prerequisite references a Concept ID that does not exist in the same Course
**Then** the create/update operation is rejected with a validation error naming the invalid prerequisite reference

**Given** an existing Course with Modules, Topics, and Concepts
**When** a Module is deleted
**Then** its child Topics and Concepts are deleted or archived consistently (no orphaned Topic/Concept records remain reachable through the catalog)
**And** any other Concept's prerequisite link pointing into the deleted subtree is flagged rather than silently left dangling

**Given** a fully populated Course hierarchy
**When** it is retrieved by ID
**Then** the full Course→Module→Topic→Concept tree is returned with all Concept-level fields intact, suitable for rendering a syllabus

### Story 2.2: Catalog browse and search with filters — FR-C-2

*Fixed during Implementation Readiness review: "cohort-availability" referenced Epic 7 data that doesn't exist for 5 more epics, and "rating" had no producing mechanism anywhere in the 117 FRs — neither is buildable as originally scoped. Cohort-availability is deferred to an Epic 7 follow-on story; rating is dropped from v1 scope entirely (no FR authorizes collecting it).*

As a learner, I want to browse and search the course catalog with filters for subject, level, and duration, so that I can quickly find a course that fits what and how I want to learn.

**Acceptance Criteria:**
**Given** the catalog contains multiple published Courses spanning different subjects and levels
**When** a learner opens the catalog without any filters
**Then** all published Courses are listed with subject, level, and duration visible on each entry

**Given** the catalog listing
**When** a learner applies any combination of subject, level, and duration filters
**Then** only Courses matching all selected filters are returned
**And** the active filters remain visible and individually removable

**Given** Epic 7 has shipped and a Course is cohort-enabled (FR-G-1)
**When** this story's filter set is extended
**Then** a follow-on Epic 7 story adds the cohort-availability filter on top of this one — out of scope here, not blocking

**Given** a learner enters a free-text search term
**When** the search is submitted
**Then** results are ranked by relevance against course title, description, and syllabus content
**And** search results respect any filters currently applied

**Given** a filter combination that matches no Courses
**When** the search/filter is applied
**Then** an empty-state message is shown explaining no matches were found, with an option to clear filters

### Story 2.3: Course detail page — FR-C-3
As a learner, I want a course detail page showing the syllabus, estimated hours, prerequisites, a short sample board session, and outcomes, so that I can decide whether this course is right for me before starting.

**Acceptance Criteria:**
**Given** a published Course with a full Module/Topic/Concept hierarchy
**When** a learner opens its detail page
**Then** the syllabus is rendered showing Modules and Topics in order, the total estimated hours are shown, prerequisite courses/knowledge are listed, and stated learning outcomes are displayed

**Given** a Course detail page with an available sample board asset
**When** the learner plays the sample
**Then** a 30-second preview of a board session plays, representative of the Avatar's teaching style for that course

**Given** a Course that has no sample board asset configured
**When** the learner opens its detail page
**Then** the sample session section is omitted or shows a "sample not yet available" state rather than an error, and the rest of the page renders normally

**Given** a Course detail page
**When** the learner has not yet started the course
**Then** primary calls to action for "Start course" and "Customise before starting" are both visible

### Story 2.4: Course customisation before start — FR-C-4
As a learner, I want to customise a catalog course before starting — deselecting topics I already know, marking priority topics, setting depth, and choosing my default explanation style — so that my plan and estimated hours reflect what I actually need to learn.

**Acceptance Criteria:**
**Given** a learner on the customisation screen for a Course
**When** they deselect one or more Topics they already know
**Then** those Topics are excluded from the regenerated plan and the estimated hours recalculate to reflect only the remaining Topics

**Given** the customisation screen
**When** the learner marks one or more Topics as priority and sets a depth (overview / standard / deep dive) and a default explanation style
**Then** the selections are saved against the learner's course customisation and the estimated hours recalculate to reflect the chosen depth

**Given** a learner deselects a Topic that is a prerequisite for another Topic still selected
**When** the deselection is applied
**Then** the system warns the learner that a dependent Topic requires it, and either blocks the deselection or requires explicit confirmation before proceeding

**Given** a learner has saved customisation choices and returns later before starting the course
**When** they reopen the customisation screen
**Then** their previous deselections, priorities, depth, and explanation style are pre-loaded for further editing

### Story 2.5: Optional placement check — FR-C-5
As a learner, I want an optional 5–8 question placement check before starting a course, so that topics I've already mastered are automatically deselected and my starting difficulty is set appropriately.

**Acceptance Criteria:**
**Given** a learner on the course customisation screen
**When** they choose to take the placement check
**Then** they are presented with 5–8 questions covering a representative sample of the course's Topics

**Given** the learner has completed the placement check
**When** their answers are scored
**Then** Topics corresponding to demonstrated mastery are automatically deselected in the course customisation, and a starting difficulty tier is set for the remaining Topics
**And** the learner can see and manually override any auto-deselection before confirming

**Given** a learner who skips the placement check
**When** they proceed to customisation or start
**Then** no Topics are auto-deselected and the course's default starting difficulty is used

**Given** a learner who scores at the minimum on every placement question
**When** results are applied
**Then** no Topics are deselected and the starting difficulty defaults to the course's easiest tier, without error

### Story 2.6: Version catalog courses — FR-C-6
As a learner in progress on a course, I want to stay on the version I started unless I choose to update, so that content and progress I've already engaged with doesn't shift under me unexpectedly.

**Acceptance Criteria:**
**Given** a learner starts a Course
**When** their access to that course is first recorded
**Then** the specific Course version they started is pinned to them, independent of later edits to the catalog Course

**Given** a catalog Course that a learner has pinned to an earlier version
**When** the content-ops team publishes a new version of that Course
**Then** the learner continues to see and study the version they started, while new learners starting the course see the latest published version

**Given** a learner pinned to an older Course version
**When** they view the course and a newer version is available
**Then** they see a clear, dismissible notice offering to update, without the update happening automatically

**Given** a learner who opts into updating to the latest version
**When** the update is applied
**Then** their pin moves to the new version, and any of their prior customisation selections (Story 2.4) referencing Topics removed or renamed in the new version are flagged for review rather than silently dropped

### Story 2.7: Upload learner content with copyright attestation — FR-C-7, FR-C-12
As a learner, I want to upload my own PDF, DOCX, PPTX, TXT, or MD files after confirming I have the right to use them, so that I can turn my own material into a custom course that stays private to me.

**Acceptance Criteria:**
**Given** a learner starting a custom course upload
**When** they select files of type PDF, DOCX, PPTX, TXT, or MD, each under 50 MB and 300 pages, with attestation checkbox checked confirming they have rights to use the material
**Then** each file is accepted, stored in the ingestion module as an UploadedDocument owned by that learner, marked private to the uploader, and queued for ingestion

**Given** a learner attempts to upload a file exceeding 50 MB, exceeding 300 pages, or of an unsupported file type
**When** the upload is submitted
**Then** that specific file is rejected with a message stating which limit was violated, while any other valid files in the same batch are still accepted

**Given** a learner has already added 10 files to a custom course
**When** they attempt to add an 11th file
**Then** the upload is blocked with a message stating the 10-file-per-course limit has been reached

**Given** a learner attempts to upload without checking the copyright attestation checkbox
**When** they submit the upload
**Then** the upload is blocked until the attestation is checked, and no file is stored or queued for ingestion

### Story 2.8: Paste-text and public-URL import — FR-C-8
As a learner, I want to paste text or import content from a public URL, so that I can build a custom course without needing a file to upload.

**Acceptance Criteria:**
**Given** a learner on the custom course creation screen
**When** they paste text content and submit it
**Then** the pasted text is stored as an UploadedDocument in the ingestion module, attributed to the learner as private, subject to the same copyright attestation requirement as file uploads, and queued for ingestion

**Given** a learner provides a public URL
**When** they submit it for import
**Then** the page's readable content is fetched and stored as an UploadedDocument, and counts toward the 10-files-per-course limit

**Given** a learner submits a URL that is unreachable, returns an error, or disallows automated fetching
**Then** the import is rejected with a specific reason (unreachable, access denied, or content not retrievable) and no partial document is stored

**Given** a learner pastes text below a minimal usable length (e.g. a few words)
**When** they submit it
**Then** the import is rejected with a message that there isn't enough content to build a course from

### Story 2.9: Ingestion pipeline — parse, OCR fallback, structure detection, and chunking — FR-C-9
As a learner, I want my uploaded content parsed, OCR-processed if scanned, and broken into structured chunks, so that the system has the raw material it needs to propose a course outline.

**Acceptance Criteria:**
**Given** an UploadedDocument queued for ingestion via JobQueuePort
**When** the ingestion job runs on a text-based file
**Then** the document's text is parsed, headings and sections are detected to form a structure map, and the text is split into ContentChunks each linked to the source document and its page/section range

**Given** an UploadedDocument containing scanned image-only pages
**When** those pages are parsed and no extractable text layer is found
**Then** OCR is run as a fallback on those pages, and the OCR output is used to produce ContentChunks in the same way as extracted text

**Given** an UploadedDocument that is password-encrypted
**When** the parse step attempts to open it
**Then** the ingestion job fails immediately with a recorded failure reason of "encrypted file", and no ContentChunks are produced

**Given** an UploadedDocument that is corrupt or unreadable
**When** the parse step attempts to open it
**Then** the ingestion job fails with a recorded failure reason of "corrupt file", and no ContentChunks are produced

### Story 2.10: Content safety scan during ingestion — FR-C-13
As a platform operator, I want every ingested document scanned for policy-violating content, so that unsafe or non-compliant material is blocked or flagged before it reaches a learning session.

**Acceptance Criteria:**
**Given** ContentChunks produced by the parsing step (Story 2.9) for an UploadedDocument
**When** the content safety scan runs against those chunks
**Then** each chunk is checked against policy categories, and the scan result (clear, flagged, or blocked) is recorded against the UploadedDocument

**Given** a document where the safety scan finds content that clearly violates policy (e.g. content in a blocked category)
**When** the scan completes
**Then** the document's ingestion is halted, its status is set to blocked, and no further chunks proceed to embedding or outline proposal

**Given** a document where only a minority of chunks are flagged as borderline
**When** the scan completes
**Then** the document proceeds through ingestion with the flagged chunks marked, and the flag is recorded for downstream review rather than blocking the whole document

**Given** a document that passes the safety scan cleanly
**When** the scan completes
**Then** the document's status advances to allow embedding and outline proposal to proceed with no learner-visible interruption

### Story 2.11: Ingestion status with progress and failure reasons — FR-C-11
As a learner, I want to see the status and progress of my document while it's being processed, and a clear reason if something goes wrong, so that I know what's happening and what to do next.

**Acceptance Criteria:**
**Given** a learner has an UploadedDocument queued or running through ingestion
**When** they view their custom course's upload screen
**Then** each document shows its current stage (queued, parsing, safety scan, embedding, outline ready) and a progress indicator that updates as the job advances through JobQueuePort

**Given** an UploadedDocument whose ingestion job failed due to an encrypted PDF, failed OCR, unsupported language, corrupt file, or a safety-scan block
**When** the learner views that document's status
**Then** a specific, human-readable failure reason matching the actual cause is shown, distinct from a generic error message

**Given** an UploadedDocument that failed ingestion
**When** the learner views its status
**Then** they are offered a relevant next step (e.g. "upload a text version", "remove this file") appropriate to the failure reason, and can remove the failed file without affecting the other files in the same custom course

**Given** a document successfully completes every ingestion stage
**When** the learner views its status
**Then** the status shows "outline ready" and links to the outline review screen (Story 2.13)

### Story 2.12: Embedding and AI-proposed Topic/Concept outline — FR-C-9
As a learner, I want the system to embed my content and propose a Topic/Concept outline from it, so that I have a structured starting point instead of a raw pile of pages.

**Acceptance Criteria:**
**Given** ContentChunks for an UploadedDocument that passed the content safety scan
**When** the embedding step runs
**Then** each chunk is embedded and written to the vector store with the required metadata contract (documentId, courseId, conceptId placeholder, chunkId)

**Given** a document's chunks have been embedded
**When** outline proposal runs
**Then** a proposed Topic/Concept outline is generated, with every proposed Concept linked to the source page/section range it was derived from

**Given** a very short document (e.g. a single page or a few paragraphs)
**When** outline proposal runs
**Then** a minimal viable outline of at least one Topic and Concept is produced rather than failing, with source links intact

**Given** a document flagged as safety-borderline in Story 2.10
**When** outline proposal runs
**Then** proposed Concepts derived from flagged chunks are marked so the review step (Story 2.13) can surface them distinctly

### Story 2.13: Review and edit the proposed outline — FR-C-10
As a learner, I want to review and edit the AI-proposed outline of my uploaded content before I start learning, so that nothing generated blind becomes part of my course without my approval.

**Acceptance Criteria:**
**Given** a document with a completed proposed outline (Story 2.12)
**When** the learner opens the outline review screen
**Then** all proposed Topics and Concepts are listed with their source references, and the learner can rename, reorder, merge, delete, or mark any of them as priority

**Given** the learner edits the outline (rename/reorder/merge/delete/mark priority)
**When** they save their changes
**Then** the edited outline replaces the proposed one as the working Topic/Concept structure for that custom course, and no learning session can start against the unreviewed proposal

**Given** a learner attempts to delete every proposed Topic in the outline
**When** they try to confirm the outline
**Then** confirmation is blocked with a message that at least one Topic must remain

**Given** a learner merges two proposed Concepts
**When** the merge is saved
**Then** the resulting Concept retains the union of source page/section references from both original Concepts

### Story 2.14: Mixed courses — attach personal notes to a catalog course — FR-C-14
As a learner, I want to attach my own personal notes to a catalog course, so that the Avatar can reference both my notes and the official course material during our session.

**Acceptance Criteria:**
**Given** a learner enrolled in a catalog Course
**When** they upload a personal notes file (subject to the same format, size, and copyright attestation rules as Story 2.7)
**Then** the file is stored as a private UploadedDocument tagged with that Course's ID, and queued through the standard ingestion pipeline (Stories 2.9–2.10)

**Given** a personal notes document successfully ingested and embedded against a catalog Course
**When** its ContentChunks are written to the vector store
**Then** each chunk's metadata includes the catalog courseId alongside its documentId and chunkId, so retrieval during a board session can draw on both catalog material and the learner's notes

**Given** a learner's personal notes file fails ingestion (any failure reason from Story 2.11)
**When** the failure occurs
**Then** the catalog course and its official material are unaffected, and the learner sees the same failure status and reason as for a standalone custom-course upload

**Given** personal notes attached to a catalog Course by one learner
**When** any other learner accesses that same catalog Course
**Then** the notes remain private and are never visible or referenced in that other learner's session

## Epic 3: The Interactive Board

> **Process note (added 2026-08-06, Sprint Change Proposal `sprint-change-proposal-2026-08-06.md`):** this is the first epic to kick off under the new "mock-first epic" convention — before Story 3.1 or any other backend work starts, build a click-through mocked-data UI covering this epic's core journey and get sign-off, then proceed story-by-story with real backend behind it. See `ARCHITECTURE-SPINE.md`'s Process Conventions section.

Users learn via the AI-avatar-led board — pause/rewind/replay, "explain deeper/simpler," different examples, ask-anything, checkpoints, full multi-modal rendering (text/math/code/diagrams). This is the product's core bet. Depends on Epic 1 + 2. FR-B-11 (Skip concept) is delivered entirely by Epic 4, not here — see Epic 4 → Story 4.13.

### Story 3.1: Pause and Resume the Board — FR-B-1
As a learner, I want to pause and resume the lesson board at any moment, so that I can step away without losing my place.

**Acceptance Criteria:**
**Given** a Beat is actively narrating and rendering on the board
**When** I select Pause
**Then** narration audio and board animation halt immediately at the current word/element position within the current Beat
**And** the paused state (Beat id, narration offset, board render state) is persisted to the session

**Given** the board is paused
**When** I select Resume
**Then** narration resumes from the exact paused offset and board rendering continues from where it stopped, without replaying or skipping content

**Given** I paused a session and closed the app, or the session sat idle overnight
**When** I reopen the same lesson on the same or a different day or device
**Then** the board restores to the exact paused Beat and offset, in the paused state, ready for Resume

**Given** the narration audio stream cannot be reestablished when I select Resume (e.g., VoicePort error)
**When** the failure occurs
**Then** the system shows a retry affordance without losing the saved position, and the board visual (text/diagram/etc.) remains at the paused state

**Given** a LearningSession reaches its last Beat, or the learner explicitly ends the session
**When** that occurs
**Then** a `learning_session.ended` domain event is published per AD-13, giving Epic 1's Activity History (Story 1.11) and NFR-26's "checkable later" requirement a defined completion signal — added per architecture AD-18

### Story 3.2: Replay Current Beat — FR-B-2
As a learner, I want to replay the current Beat, so that I can re-hear and re-watch content I missed the first time.

**Acceptance Criteria:**
**Given** the board is displaying/narrating any Beat, whether playing or paused
**When** I select Replay
**Then** the board visual state resets to the start of the current Beat and narration restarts from the beginning of that Beat's audio, verbatim, using the same content and locale as originally generated

**Given** I select Replay while narration is mid-sentence
**When** the replay is triggered
**Then** any in-flight audio stream is stopped cleanly before the replay stream starts, with no overlapping audio

**Given** the Beat's narration audio was previously generated and cached by GenerationPort
**When** I select Replay
**Then** the cached version is reused rather than regenerated, so the wording is identical to the original playback

### Story 3.3: Step Back and Forward Between Beats — FR-B-3
As a learner, I want to step back or forward between Beats, so that I can review or move ahead through the lesson at my own pace.

**Acceptance Criteria:**
**Given** the board is on any Beat other than the first in the session
**When** I select Back
**Then** the board navigates to the previous Beat and restores that Beat's exact visual state — all rendered text, diagrams, math, code, tables, and charts as they appeared when that Beat finished rendering

**Given** the board is on any Beat other than the last generated Beat
**When** I select Forward
**Then** the board navigates to the next Beat and restores or renders that Beat's content

**Given** I am on the first Beat of the session
**When** I select Back
**Then** the control is disabled or no-ops, and no error is shown

**Given** I am on the last known Beat and later Beats have not yet been generated
**When** I select Forward
**Then** the system requests the next Beat via PubSubPort and shows a loading state until it streams in, or an error state with retry if generation fails

### Story 3.4: Board Zoom, Pan, and Infinite Scroll with Beat Gutter Markers — FR-B-31
As a learner, I want to zoom, pan, and scroll through the board with visible Beat markers, so that I can navigate a long lesson visually and orient myself.

**Acceptance Criteria:**
**Given** the board contains one or more rendered Beats
**When** I use zoom controls or pinch/scroll-wheel gestures
**Then** board content scales smoothly between a minimum and maximum zoom level without loss of legibility or layout breakage

**Given** board content exceeds the viewport
**When** I drag/pan or scroll vertically
**Then** the board pans/scrolls on an infinite vertical canvas, loading additional rendered Beat content as needed without blocking interaction

**Given** multiple Beats have been rendered in the session
**When** I view the board's gutter
**Then** a marker for each Beat is shown, positioned to reflect that Beat's location on the board, and each marker is clickable to jump the viewport to that Beat

**Given** I click a Beat marker in the gutter
**When** the jump completes
**Then** the viewport centers on that Beat's rendered content at a readable zoom level

### Story 3.5: Progressive Text Writing Synced to Narration — FR-B-25
As a learner, I want lesson text to appear progressively with emphasis synced to narration, so that I can visually follow along with what's being spoken.

**Acceptance Criteria:**
**Given** a Beat begins narrating text content
**When** narration audio plays
**Then** the corresponding text is written onto the board progressively — word by word or phrase by phrase — timed to the word-level timing supplied with the narration audio

**Given** a word or phrase is marked for emphasis in the Beat content
**When** that word/phrase is narrated
**Then** it is visually emphasized (highlight/bold/underline) in sync with the audio, then returns to normal style once narration moves on

**Given** the board is paused mid-text
**When** paused
**Then** only the text written up to the paused narration offset is visible; text beyond that point is not shown

**Given** narration audio fails to stream (VoicePort error)
**When** the failure occurs
**Then** the full Beat text is still rendered on the board without word-synced timing, and a non-blocking notice indicates audio is unavailable

### Story 3.6: Progressive Math Notation Rendering — FR-B-26
As a learner, I want math notation to render progressively as it's explained, so that I can follow multi-step formulas without being overwhelmed.

**Acceptance Criteria:**
**Given** a Beat contains LaTeX/MathML content
**When** the Beat renders
**Then** the math notation is rendered as properly typeset math, not raw markup

**Given** a math expression has multiple lines or steps
**When** narration explains it
**Then** each line is revealed progressively, in sync with narration reaching that line, rather than showing the full expression at once

**Given** a math expression fails to parse or render
**When** rendering is attempted
**Then** a fallback plain-text representation of the expression is shown instead of a blank or broken element, and the error is logged

### Story 3.7: Syntax-Highlighted, Line-Synced Code Blocks — FR-B-27
As a learner, I want code examples to be syntax-highlighted and revealed line by line as they're explained, so that I can connect narration to the exact code being discussed.

**Acceptance Criteria:**
**Given** a Beat contains a code block with a specified language
**When** the code block renders
**Then** it displays with language-appropriate syntax highlighting

**Given** narration is explaining a specific line or lines of the code block
**When** that portion of narration plays
**Then** the corresponding line(s) are visually highlighted in sync with narration, and de-emphasized once narration moves past them

**Given** the code block's language is unrecognized or unsupported by the highlighter
**When** rendering is attempted
**Then** the code still displays in a monospace block without highlighting, without breaking the layout

### Story 3.8: Incrementally Drawn Diagrams — FR-B-28
As a learner, I want diagrams to be drawn incrementally, so that I can see how each part relates to the whole as it's explained.

**Acceptance Criteria:**
**Given** a Beat contains a diagram (boxes/arrows/flowchart/tree)
**When** the Beat begins rendering
**Then** diagram elements (nodes, edges, labels) are drawn incrementally onto the board, in sync with narration describing each element

**Given** the diagram is complete
**When** narration for that Beat finishes
**Then** the full diagram remains visible and remains part of the interactive, zoomable/pannable board for later review via Back or Replay

**Given** a diagram definition fails to render (malformed structure)
**When** rendering is attempted
**Then** a readable fallback, such as a structured list of nodes and relationships, is shown instead of a blank canvas, and the error is logged

### Story 3.9: Tables and Comparison Grids — FR-B-29
As a learner, I want comparison tables to render clearly on the board, so that I can quickly compare related concepts side by side.

**Acceptance Criteria:**
**Given** a Beat contains tabular/comparison content
**When** the Beat renders
**Then** the content displays as a formatted table/grid with clear row and column headers, legible at default board zoom

**Given** the table is wider than the viewport at current zoom
**When** the table renders
**Then** it scrolls horizontally within its own bounds or reflows responsively, without causing the whole board to scroll horizontally

**Given** narration references a specific row or column
**When** that portion of narration plays
**Then** the corresponding row/column is visually highlighted in sync with the narration

### Story 3.10: Charts and Plots for Quantitative Concepts — FR-B-30
As a learner, I want quantitative concepts illustrated with charts and plots, so that I can visualize data-driven ideas.

**Acceptance Criteria:**
**Given** a Beat contains chart-worthy quantitative content
**When** the Beat renders
**Then** a chart/plot appropriate to the data (e.g., line, bar, scatter) is rendered on the board with labeled axes and legend

**Given** the chart data cannot be rendered because it is invalid or missing
**When** rendering is attempted
**Then** a fallback tabular representation of the same data is shown instead of a blank chart, and the error is logged

### Story 3.11: Highlight/Spotlight Dimming — FR-B-32
As a learner, I want the board to spotlight the current element and dim everything else, so that I can focus on exactly what's being explained without visual clutter.

**Acceptance Criteria:**
**Given** a Beat is actively narrating a specific board element (text block, diagram node, table row, code line, etc.)
**When** narration reaches that element
**Then** that element remains at full visual prominence while all other rendered board elements are dimmed

**Given** narration moves to the next element
**When** the transition occurs
**Then** the spotlight moves to the new element and the previous element returns to dimmed styling

**Given** I manually pan/scroll away from the spotlighted element, or pause
**When** I do so
**Then** dimming is suspended and full board visibility is restored, resuming when I return to active playback

### Story 3.12: Speed, Volume, and Voice Controls — FR-B-10
As a learner, I want to control narration speed, volume, mute, and voice, so that I can tailor the listening experience to my preference.

**Acceptance Criteria:**
**Given** narration is available for playback
**When** I adjust the speed control
**Then** the playback rate changes to the selected value within 0.75x–1.5x, applied immediately to current and subsequent narration without needing to restart the Beat

**Given** narration is playing
**When** I adjust the volume slider or select mute
**Then** the audio volume changes accordingly, or audio is silenced, while board animation and text sync continue unaffected

**Given** at least 2 distinct voice options exist
**When** I select a different voice
**Then** subsequent narration, from the next played segment, uses the newly selected voice, requested from VoicePort with my locale

**Given** I change speed, volume, or voice mid-session
**When** I navigate away and return, or reload
**Then** my selected preferences persist for the remainder of the session

### Story 3.13: Concept-Boundary Checkpoint Questions — FR-B-24
As a learner, I want short checkpoint questions at the end of a concept, so that the system can gauge my understanding without it feeling like a graded test.

**Acceptance Criteria:**
**Given** a Concept has reached its final Beat
**When** the Concept boundary is reached
**Then** between 1 and 3 checkpoint questions related to that Concept's content are presented on the board

**Given** I answer a checkpoint question
**When** I submit my answer
**Then** I receive immediate feedback and the result is recorded as a mastery signal for that concept, presented as feedback rather than a graded score

**Given** all checkpoint questions for a Concept are answered
**When** the last one is submitted
**Then** a domain event carrying the mastery signal is published to the shared event bus per AD-13, for consumption by other modules, and the board proceeds to the next Beat/Concept

**Given** I close the session mid-checkpoint
**When** I return
**Then** the checkpoint resumes at the unanswered question rather than restarting

### Story 3.14: Minimum Explanation-Route Set — FR-B-21
As a learner, I want each concept to be explainable through a consistent set of teaching approaches, so that whichever way I need it explained, that route is available.

**Acceptance Criteria:**
**Given** a Concept is being taught or re-explained on the board
**When** the system selects or generates an explanation
**Then** it draws from a defined minimum set of 8 route types: formal definition, worked example, analogy, visual/diagram, step-by-step procedure, contrast, misconception correction, and real-world application

**Given** a specific route type is requested for a Concept by any explanation-control feature
**When** content is generated
**Then** it is generated via GenerationPort with the requested route type and the learner's locale, and the resulting content is tagged/stored with its route type so it can later be identified as used

**Given** a route type has never been generated for a given Concept in this session
**When** it is requested
**Then** GenerationPort produces new content for that route rather than reusing a different route's content

### Story 3.15: Explain Deeper — FR-B-4
As a learner, I want to ask for a deeper explanation of the current concept, so that I can get more rigorous or advanced detail when the basic explanation isn't enough.

**Acceptance Criteria:**
**Given** the board is displaying an explanation for the current Concept
**When** I select "Explain more — deeper"
**Then** the system requests a regenerated explanation of the same Concept at a higher depth/rigor level via GenerationPort, with locale, and renders it as new Beat(s) appended after the current position

**Given** I select "Explain more — deeper" multiple times in the same session
**When** each request is made
**Then** each successive explanation is generated at a further-increased depth relative to the previous one, not a repeat of the prior depth level

**Given** the deeper explanation has finished rendering
**When** it completes
**Then** a return/continue affordance lets me proceed to the next Concept, and the original explanation remains accessible via Back

### Story 3.16: Explain Simpler — FR-B-5
As a learner, I want to ask for a simpler explanation of the current concept, so that I can reduce cognitive load when the current explanation is too advanced.

**Acceptance Criteria:**
**Given** the board is displaying an explanation for the current Concept
**When** I select "Explain more — simpler"
**Then** the system requests a regenerated explanation of the same Concept at a lower cognitive-load level via GenerationPort, with locale, and renders it as new Beat(s)

**Given** I select "Explain more — simpler" repeatedly
**When** each request is made
**Then** each successive explanation reduces complexity further relative to the previous one, down to a defined minimum simplicity floor

**Given** the simplicity floor has already been reached
**When** I select "Explain more — simpler" again
**Then** the board informs me no simpler version is available and suggests an alternative route, such as analogy or visual, instead of silently repeating the same content

### Story 3.17: Different Example — FR-B-6
As a learner, I want a different example than the one just shown, so that I can see the concept applied in a way that clicks for me.

**Acceptance Criteria:**
**Given** the board has shown one or more examples for the current Concept in this session
**When** I select "Different example"
**Then** the system generates a new example via GenerationPort that is distinct in scenario/content from every example already shown for this Concept this session

**Given** the example is generated
**When** it renders
**Then** it is rendered as a new Beat with full multi-modal support appropriate to the example content

**Given** the system cannot produce a further distinct example because the domain is exhausted
**When** I select "Different example" again
**Then** the board informs me no further distinct examples are available and offers "More examples" or another route instead

### Story 3.18: More Examples — FR-B-7
As a learner, I want several additional worked examples of increasing difficulty, so that I can practice and build confidence progressively.

**Acceptance Criteria:**
**Given** the board is displaying the current Concept
**When** I select "More examples"
**Then** the system generates 2 to 3 additional worked examples via GenerationPort, graded from easier to harder, and renders them as sequential new Beats

**Given** the additional examples are generated
**When** they are produced
**Then** none duplicates an example already shown for this Concept this session

**Given** I select "More examples" again after already receiving a batch
**When** the new request is made
**Then** the next batch continues the difficulty progression from where the prior batch left off rather than restarting from the easiest level

### Story 3.19: Explain With an Analogy — FR-B-8
As a learner, I want the concept mapped to a familiar analogy, so that I can anchor an unfamiliar idea to something I already understand.

**Acceptance Criteria:**
**Given** the board is displaying the current Concept
**When** I select "Explain with an analogy"
**Then** the system generates an analogy explanation via GenerationPort mapping the Concept to a familiar real-world domain, and renders it as a new Beat

**Given** I request an analogy more than once for the same Concept in a session
**When** each subsequent request is made
**Then** a different familiar domain is used than any analogy already shown for that Concept this session

**Given** no further distinct analogy domain can reasonably be generated
**When** I request another analogy
**Then** the board informs me and offers a different explanation route instead

### Story 3.20: Ask Anything — FR-B-9
As a learner, I want to ask a free-text question at any point and get an answer grounded in the course material, so that I can resolve my specific confusion without derailing the lesson.

**Acceptance Criteria:**
**Given** I am viewing any Beat on the board
**When** I open "Ask anything" and submit a free-text question
**Then** the system generates a grounded answer via GenerationPort, constrained to course material with locale applied, and renders it as one or more sub-Beats branching from my current position

**Given** the answer sub-Beat(s) are rendered
**When** I finish reviewing them
**Then** a clearly visible "Return to lesson" affordance takes me back to the exact Beat and position I branched from

**Given** my question is outside the scope of the course material
**When** the system cannot ground an answer in course content
**Then** it responds indicating the question is outside this lesson's scope rather than fabricating an ungrounded answer, and still offers Return to lesson

**Given** the question submission or generation fails
**When** the failure occurs
**Then** an error state with a retry option is shown, and my original question text is preserved so I don't have to retype it

### Story 3.21: Voice Input for Ask Anything — FR-B-17
As a learner, I want to ask a question by voice using push-to-talk, so that I can interact hands-free while still being able to type if I prefer.

**Acceptance Criteria:**
**Given** the "Ask anything" input is open
**When** I press and hold, or toggle, the push-to-talk control and speak
**Then** my speech is captured and transcribed into the question text field, feeding into the same ask-anything flow as typed text

**Given** voice capture fails, such as microphone permission denied or a transcription service error
**When** the failure occurs
**Then** a clear error is shown and the text input remains fully available as a fallback with no loss of functionality

**Given** I have partially spoken a question
**When** I release or cancel push-to-talk before finishing
**Then** the transcribed-so-far text remains editable in the text field rather than being discarded or auto-submitted

### Story 3.22: "I'm Confused" Diagnostic and Re-route — FR-B-18
As a learner, I want to flag that I'm confused and have the avatar ask me a quick diagnostic question, so that the lesson can adapt to my specific difficulty instead of me having to self-diagnose.

**Acceptance Criteria:**
**Given** I am viewing an explanation on the board
**When** I select "I'm confused"
**Then** the avatar asks me a short diagnostic question, such as multiple choice or brief free text, intended to localize where my understanding broke down

**Given** I answer the diagnostic question
**When** my answer is submitted
**Then** the system re-routes the explanation, selecting a different explanation route from the minimum route set or a different difficulty level appropriate to the diagnosed gap, and renders it as new Beat(s)

**Given** I decline to answer or dismiss the diagnostic question
**When** I do so
**Then** the system falls back to offering the explanation-control options — deeper, simpler, different example, analogy — directly, without forcing an answer

**And** the confusion event and its diagnosis outcome are recorded for later reference by that Concept's explanation history

### Story 3.23: Confusion Mapped to Prerequisite Refresher — FR-B-23
As a learner, I want to be offered a quick refresher if my confusion traces back to a prerequisite concept I'm shaky on, so that I can fill the gap without losing my place in the current lesson.

**Acceptance Criteria:**
**Given** an "I'm confused" diagnosis determines the root cause maps to a specific prerequisite Concept
**When** the diagnosis completes
**Then** the board offers a short, approximately 2-minute, refresher on that prerequisite Concept, clearly presented as optional

**Given** I accept the refresher offer
**When** the refresher plays
**Then** it branches from my current position, similar to the Ask Anything sub-Beat pattern, and on completion I am returned to the exact Beat/position in the current Concept where I left off

**Given** I decline the refresher offer
**When** I decline
**Then** the board proceeds directly to the standard "I'm confused" re-route without the detour

**Given** no mapped prerequisite Concept can be identified for the diagnosed confusion
**When** the diagnosis completes
**Then** no refresher offer is shown and the standard re-route applies instead

### Story 3.24: Per-Concept Explanation History — FR-B-19
As a learner, I want to see the history of explanation routes, examples, and analogies I've used for a concept along with where I got stuck, so that I understand my own learning journey and can revisit what worked.

**Acceptance Criteria:**
**Given** I have requested one or more explanation-route actions — deeper, simpler, different example, more examples, analogy, or a confusion re-route — for a Concept in this or a prior session
**When** I open that Concept's Explanation History
**Then** I see a chronological list of every route/example/analogy used, each labeled with its route type and timestamp

**Given** a checkpoint attempt or "I'm confused" event occurred for that Concept
**When** I view the Explanation History
**Then** sticking points, such as failed checkpoint questions or confusion triggers, are shown alongside the routes, associated with the point in the history where they occurred

**Given** the Concept has no explanation-route activity yet
**When** I open its Explanation History
**Then** an empty state is shown indicating no alternate explanations have been requested yet

### Story 3.25: Repeat Explanation Selects an Unused Route — FR-B-20
As a learner, I want a generic "explain again" request to try an approach I haven't seen yet, so that I'm not shown the same explanation again when I ask for help.

**Acceptance Criteria:**
**Given** a Concept has one or more explanation routes already used, per its Explanation History, and at least one of the 8 minimum routes has not yet been used
**When** I make a generic "explain again" / repeat request for that Concept
**Then** the system selects and generates content using a route type not yet present in that Concept's Explanation History

**Given** all 8 minimum route types have already been used for that Concept in this session
**When** I make another repeat request
**Then** the system selects the least-recently-used route and regenerates a fresh instance of it, such as a new worked example rather than the exact one already shown, rather than erroring or repeating verbatim content

**Given** the repeat request completes
**When** the new explanation renders
**Then** it is recorded in the Explanation History with its route type

### Story 3.26: Auto-Drop Difficulty After Repeated Checkpoint Failures — FR-B-22
As a learner, I want the system to automatically simplify and change approach if I keep failing checkpoints, so that I'm not stuck repeating a level that isn't working for me.

**Acceptance Criteria:**
**Given** I have failed 2 checkpoint questions in a row for the same Concept
**When** the second consecutive failure is recorded
**Then** the system automatically drops the explanation to a lower difficulty tier and selects a different explanation route than the one most recently used, without requiring me to request it

**Given** the auto-drop occurs
**When** the new, simpler explanation renders
**Then** the board surfaces a brief, non-alarming notice that it adjusted the approach, and the event is recorded in the Concept's Explanation History

**Given** the auto-drop and route switch is applied
**When** I subsequently attempt the checkpoint again
**Then** a fresh checkpoint attempt, using new or re-shuffled questions where the content bank allows, is offered rather than the identical failed questions

**Given** the difficulty is already at the lowest tier when a second consecutive failure occurs
**When** the auto-drop would trigger
**Then** the system switches route without lowering difficulty further, and still surfaces the adjustment notice

### Story 3.27: Restart Concept via a Different Route — FR-B-12
As a learner, I want to restart a concept from the beginning via a different teaching route, so that I can get a fresh explanation when nothing so far has worked.

**Acceptance Criteria:**
**Given** I am viewing any Beat within a Concept
**When** I select "Restart concept"
**Then** the board shows a confirmation that all Beats for this Concept in the current session will be cleared and re-taught

**Given** I confirm the restart
**When** confirmed
**Then** the board clears the current Concept's rendered Beats from view, and re-teaching begins at Beat 1 using a different overall explanation route than the one originally used for Beat 1, generated via GenerationPort

**Given** the Concept had prior Explanation History entries, such as routes, examples, or checkpoint attempts, before the restart
**When** the restart occurs
**Then** the prior history is retained, not deleted, and the new Beat 1 route is recorded as a new entry

**Given** I cancel the restart confirmation
**When** I cancel
**Then** no content is cleared and the board remains exactly as it was

### Story 3.28: Bookmark a Beat With a Note — FR-B-13
As a learner, I want to bookmark the current Beat with a note, so that I can quickly find and recall important moments later in "My Notes."

**Acceptance Criteria:**
**Given** I am viewing any Beat on the board
**When** I select "Bookmark/Note" and optionally enter a note
**Then** a bookmark is saved capturing the Beat identifier, a snapshot of the board's rendered visual state at that Beat, my note text if any, and a timestamp

**Given** a bookmark has been saved
**When** I open "My Notes"
**Then** the bookmark appears in the list showing the note text or a default label, the source Concept/Beat, and the timestamp, and selecting it navigates back to that exact Beat on the board

**Given** I bookmark the same Beat again
**When** I save
**Then** I can either update the existing bookmark's note or create an additional bookmark, with duplicates clearly distinguished rather than silently overwritten

**Given** the bookmark save fails, such as a network error
**When** the failure occurs
**Then** an error is shown and my entered note text is preserved so I don't lose it

### Story 3.29: View Source for the Current Beat — FR-B-14
As a learner, I want to see the source material behind the current Beat, so that I can verify or dig deeper into the original content.

**Acceptance Criteria:**
**Given** I am viewing any Beat that was generated from course source material
**When** I select "Source"
**Then** the board shows the source page/section reference — document title and page/section number or heading — that the current Beat's content was derived from

**Given** the source reference includes a viewable/linkable location
**When** I select it
**Then** I am taken to, or shown a preview of, that page/section within the source material

**Given** a Beat has no directly traceable source, such as a generated example or analogy without a single source page
**When** I select "Source"
**Then** the board indicates no direct source is available for this generated content, rather than showing an incorrect or blank reference

### Story 3.30: Searchable Transcript Panel — FR-B-15
As a learner, I want a full searchable transcript of the lesson, so that I can scan, search, copy, or download everything that's been said and shown.

**Acceptance Criteria:**
**Given** the session has one or more Beats with narration/text content
**When** I open the Transcript panel
**Then** it shows the full text transcript of all Beats generated so far, in order, each entry associated with its Beat

**Given** I enter a search term in the transcript panel
**When** I search
**Then** matching text is highlighted and I can navigate between matches

**Given** I select a transcript entry or its "jump to Beat" affordance
**When** I select it
**Then** the board navigates to that Beat's position, consistent with Back/Forward navigation behavior

**Given** I select "Copy" or "Download"
**When** I do so
**Then** the full, or currently filtered/searched, transcript text is copied to the clipboard or downloaded as a file, respectively

### Story 3.31: Export Board as PNG/PDF and Study Summary — FR-B-16
As a learner, I want to export the board and get a study summary, so that I can review my lesson offline or share it.

**Acceptance Criteria:**
**Given** the session has one or more rendered Beats on the board
**When** I select "Export as PNG"
**Then** a rendered image of the selected board view is generated and downloaded as a PNG file

**Given** I select "Export as PDF"
**When** I do so
**Then** a paginated PDF capturing the board's content — text, diagrams, math, code, tables, and charts as rendered — is generated and downloaded

**Given** I select "Study summary"
**When** I do so
**Then** a generated summary document covering key concepts, examples used, and checkpoint/mastery signals for the session is produced via GenerationPort and made available for download

**Given** export generation fails, such as for a very large board or a service error
**When** the failure occurs
**Then** an error is shown with a retry option, and no partial or corrupt file is left for me to download

### Story 3.32: Learner Annotation on the Board — FR-B-33
As a learner, I want to draw, highlight, or add sticky notes directly on the board, so that I can mark it up the way I would a physical notebook.

**Acceptance Criteria:**
**Given** I am viewing any Beat on the board
**When** I select the pen or highlighter tool and draw on the board
**Then** my strokes are rendered as an overlay on the board content at the position drawn, without altering the underlying generated content

**Given** I select the sticky-note tool, type text into it, and place it
**When** I place it
**Then** the sticky note is anchored to that board position and remains visible when I revisit that Beat

**Given** I have created pen, highlighter, or sticky-note annotations
**When** I navigate away and return, including across sessions
**Then** my annotations are saved to "My Notes," per the bookmark/note system, and persist, reappearing at their original board positions

**Given** I want to remove an annotation
**When** I select an eraser/delete action on a specific annotation
**Then** only that annotation is removed, leaving other annotations and the underlying board content intact

## Epic 4: Learning Plans, Progress & Forecasting

Users can build a plan, see honest mastery-weighted progress, get a pace forecast, and replan when behind. Depends on Epic 2 + 3. Owns the `ConceptProgress` state machine end to end, including the full FR-B-11 skip/un-skip capability (state machine in Story 4.4, Board-facing control in Story 4.13) and the skip-gaming disclosure on the progress dashboard — which Epic 5's certificate story must read from, not re-derive independently.

### Story 4.1: Predefined Course Plans (Relaxed/Standard/Intensive) — FR-P-1
As a learner, I want each catalog course to ship with three predefined plans (Relaxed/Standard/Intensive) stating weekly hour commitments, so that I can pick a pace that fits my schedule without building a plan from scratch.
**Acceptance Criteria:**
**Given** a published catalog course
**When** I view its plan options
**Then** I see three predefined plans labeled Relaxed, Standard, and Intensive, each showing weekly hours and estimated completion date
**And** each plan's total estimated hours equals the course's total content hours (sum of topic/concept estimates), consistent across all three tiers
**And** selecting a predefined plan creates a LearningPlan record scoped to my user and the course, with planType=PREDEFINED and the chosen tier stored
**And** if the course has zero schedulable content (no topics/concepts), predefined plans are not offered and the UI shows a "content not yet available" message instead

### Story 4.2: Custom Plan Builder — FR-P-2
As a learner, I want to build a custom plan by setting either a target completion date or my available weekly hours, so that the system computes the other value for me and warns me if my choice isn't realistic.
**Acceptance Criteria:**
**Given** I am creating a custom LearningPlan for a course
**When** I enter a target completion date
**Then** the system computes and displays the required weekly hours based on the course's total estimated hours and remaining calendar days
**And** when I instead enter weekly hours, the system computes and displays the resulting target completion date
**And** if the computed weekly hours exceed a configurable feasibility threshold (e.g., >20 hrs/week) or the target date is in the past, the system displays an infeasibility warning explaining why and requires explicit confirmation before saving
**And** the saved LearningPlan record stores planType=CUSTOM, the user-chosen input field, and the computed output field, so the two stay consistent on later reload

### Story 4.3: Generate Dated Session Schedule Respecting Prerequisites — FR-P-3
As a learner, I want my chosen plan to generate a dated schedule of study sessions mapped to specific topics, so that I know what to study and when, in an order that respects prerequisites.
**Acceptance Criteria:**
**Given** I have selected or saved a LearningPlan (predefined or custom) for a course
**When** the plan is activated
**Then** the system generates PlannedSession records, each with a scheduled date, one or more mapped topics/concepts, and estimated duration, distributed to match the plan's weekly hours
**And** no PlannedSession schedules a topic before all its prerequisite topics are scheduled on earlier dates
**And** session dates skip the learner's configured non-study days (default: none) and never schedule more total hours in a calendar week than the plan specifies
**And** if course content changes (a topic is added/removed) after schedule generation, the existing schedule is left intact until the learner explicitly regenerates it, and regeneration preserves completed-session history unchanged

### Story 4.4: ConceptProgress Skip/Un-skip State Machine and Mastery Scope — FR-P-11 (synthetic — resolves the undefined un-skip transition gap left by Board's FR-B-11; this epic owns and builds the service API that Board's Skip-concept UI calls)
As a learner, I want to skip a concept I don't need and later un-skip it if I change my mind, so that my mastery percentage always reflects only the concepts I'm actually accountable for, without ever getting corrupted.
**Acceptance Criteria:**
**Given** a ConceptProgress record in state NOT_STARTED, IN_PROGRESS, or MASTERED
**When** the skip API is called (by Board's Skip-concept UI or directly)
**Then** the record transitions to SKIPPED, its prior state is retained internally as `stateBeforeSkip`, and it is excluded from both the numerator and denominator of the course's mastery-weighted progress %
**And** a domain event `ConceptProgressSkipped` (courseId, conceptId, learnerId, timestamp) is published on the shared bus even though the synchronous call also returns success
**Given** a ConceptProgress record in state SKIPPED
**When** the un-skip API is called
**Then** the record transitions back to its `stateBeforeSkip` (or NOT_STARTED if none recorded, or NOT_STARTED if its prerequisites are no longer satisfied even when `stateBeforeSkip` was IN_PROGRESS/MASTERED), re-enters both the numerator and denominator of mastery calculation, and `stateBeforeSkip` is cleared
**And** a domain event `ConceptProgressUnskipped` is published on the shared bus
**And** un-skipping never retroactively rewrites any already-persisted historical progress snapshot (e.g., a stored daily progress-history entry) — only current and future progress calculations include the un-skipped concept
**And** skipping an already-SKIPPED concept, or un-skipping a concept that is not SKIPPED, returns a 409 conflict with no state change and no event published
**And** a concept with unmet prerequisites can still be skipped (skip is independent of prerequisite gating)

### Story 4.5: Skip-Disclosure Shared Component and Data Shape — FR-P-13 (synthetic — resolves the progress-integrity gap where skipping hard concepts could show a misleading 100%; designed as a shared component/data shape reusable by Epic 5's certificate story)
As a learner, I want any displayed progress percentage to always be accompanied by a clear breakdown of studied vs. skipped concepts, so that a high percentage can never hide the fact that I skipped the harder material.
**Acceptance Criteria:**
**Given** a course with N total concepts, of which S are SKIPPED and C of the remaining (N−S) are MASTERED/completed
**When** any surface in the system renders that course's progress percentage
**Then** it renders via a shared `ProgressDisclosure` data shape containing at minimum: `percent` (C / (N−S)), `completedCount` (C), `studiedTotal` (N−S), `skippedCount` (S), and a human-readable string of the form "completed {C} of {N−S} concepts studied, {S} skipped"
**And** the shape/component rejects rendering a bare percentage with no counts — omitting `completedCount`/`studiedTotal`/`skippedCount` is a type-level/build-time error, not just a UI convention
**And** when `skippedCount` is 0, the disclosure text omits the skipped clause (e.g., "completed 12 of 15 concepts studied") rather than showing "0 skipped"
**And** the `ProgressDisclosure` shape is exported from this epic's shared module so Epic 5's certificate-generation story can consume the identical shape without redefining it
**And** when `studiedTotal` is 0 (all concepts skipped, or course has no concepts yet), `percent` is null rather than divide-by-zero, and the text reads "0 concepts studied, {S} skipped" (or "no concepts in this course yet" when N is also 0)

### Story 4.6: Progress Dashboard — FR-P-4
As a learner, I want a dashboard showing my percent complete, concept states, hours invested, streak, and mastery by topic, so that I can see an honest, at-a-glance picture of where I stand in a course.
**Acceptance Criteria:**
**Given** I have an active LearningPlan with at least one ConceptProgress record
**When** I open the progress dashboard for that course
**Then** I see overall progress rendered via the `ProgressDisclosure` component from Story 4.5 (never a bare %), a breakdown of concept counts by state (NOT_STARTED/IN_PROGRESS/MASTERED/SKIPPED), total hours invested (sum of logged session time), current streak (consecutive days with logged study activity), and mastery % per topic using the same skip-aware scoping as the course-level figure
**And** concept states and hours reflect any study session logged elsewhere in the app within one page refresh
**And** if I have no logged activity yet, the dashboard shows explicit zero-states (0% via `ProgressDisclosure`, 0 hours, streak 0) rather than hiding the sections
**And** streak resets to 0 the day after a calendar day passes with no logged study activity, timezone-anchored to my profile timezone

### Story 4.7: Plan-vs-Actual Position — FR-P-5
As a learner, I want to see whether I'm on-track, slightly-behind, or behind relative to my plan's schedule, so that I know early whether I need to adjust.
**Acceptance Criteria:**
**Given** an active LearningPlan with generated PlannedSessions and a mix of completed/missed/upcoming sessions
**When** the system computes my plan-vs-actual position
**Then** it compares cumulative planned hours-to-date against cumulative actual logged hours-to-date and classifies the result as ON_TRACK (actual ≥ planned), SLIGHTLY_BEHIND (actual within a configurable tolerance band below planned, e.g. 80–99%), or BEHIND (actual below the tolerance band)
**And** the classification and underlying numbers (planned hours-to-date vs actual hours-to-date) are shown on the progress dashboard
**And** a domain event `PlanPositionChanged` (learnerId, planId, previous state, new state) is published on the shared bus whenever the classification transitions between states
**And** on the first day of a plan, with zero elapsed scheduled hours, the position is reported as ON_TRACK by definition rather than BEHIND from a zero-over-zero comparison
**And** the classification recomputes at least once daily and immediately after any session is logged complete

### Story 4.8: Pace-Based Forecast with Confidence Band — FR-P-6
As a learner, I want a forecasted completion date based on my recent study pace, so that I can see a realistic projection rather than just the original plan date.
**Acceptance Criteria:**
**Given** a learner whose plan has been active for at least 3 days
**When** the forecast is computed
**Then** it calculates trailing-14-day velocity (hours logged / min(14, days since activation), clearly labeled as a partial-window estimate when under 14 days), projects remaining required hours at that velocity, and displays a forecasted completion date with an optimistic/likely/pessimistic confidence band derived from the variance in daily logged hours over that window
**And** if the learner has zero logged hours in the trailing window, the forecast displays "not enough recent activity to forecast" instead of an infinite or nonsensical date
**And** if the plan is younger than 3 days, the forecast is suppressed with an "insufficient history" message rather than shown with a misleadingly wide band
**And** the forecasted date and confidence band recompute at least daily and are shown alongside the plan-vs-actual position (Story 4.7) on the dashboard

### Story 4.9: One-Click Replan Options — FR-P-7
As a learner who is behind, I want one-click options to extend my target date, increase weekly hours, reduce depth, or drop topics, so that I can see the impact of each choice before committing to a new schedule.
**Acceptance Criteria:**
**Given** my plan-vs-actual position is SLIGHTLY_BEHIND or BEHIND (Story 4.7)
**When** I open the replan panel
**Then** I see four selectable options — extend target date, increase weekly hours, reduce depth (fewer practice reps per concept), and drop topics — each showing a live preview of the resulting new target date and/or weekly hours before I commit
**And** selecting "drop topics" requires me to choose from non-prerequisite-required topics only, and the preview lists exactly which topics will be removed
**And** committing a replan option regenerates future (not-yet-completed) PlannedSessions accordingly while leaving already-completed sessions and their logged history untouched
**And** a domain event `LearningPlanReplanned` (planId, chosen option, old and new target date/hours) is published on the shared bus on commit
**And** backing out of the panel without committing leaves LearningPlan and PlannedSession data unmodified

### Story 4.10: Calendar View with .ics Export — FR-P-8
As a learner, I want a calendar view of my scheduled study sessions that I can export to my personal calendar app, so that my study time shows up alongside my other commitments.
**Acceptance Criteria:**
**Given** an active LearningPlan with generated PlannedSessions
**When** I open the calendar view
**Then** I see PlannedSessions rendered on a month/week grid, each showing its mapped topic(s) and duration
**And** clicking "Export to .ics" downloads a valid .ics file with one VEVENT per upcoming PlannedSession, correct start/end times in my profile timezone, a summary naming the topic, and a stable UID per session
**And** re-exporting after a replan (Story 4.9) reflects only the current post-replan schedule, excluding previously completed sessions
**And** if the plan has zero remaining PlannedSessions, the export button is disabled with an explanatory tooltip rather than producing an empty file

### Story 4.11: Session and Streak-at-Risk Reminders — FR-P-9
As a learner, I want email and in-app reminders for upcoming sessions and when my streak is at risk, so that I stay on track without being spammed, and I want a one-click way to unsubscribe.
**Acceptance Criteria:**
**Given** I have upcoming PlannedSessions and notification preferences enabled
**When** a session is due within my configured reminder lead time (default 1 hour before, or a daily digest option)
**Then** a reminder is sent via NotificationPort (email and/or in-app per my preference), and no reminder is sent for sessions I've already completed early
**And** when my current streak (Story 4.6) is at risk of breaking — no logged activity yet today, past a configurable local-time threshold (e.g. 8pm) — a streak-at-risk reminder is sent at most once per day
**And** no notification is sent during my configured quiet hours; a reminder that would fire during quiet hours is deferred to the next allowed window per my preference
**And** total reminders per learner per day are capped at a configurable maximum (e.g., 3), with session reminders dropped before streak-at-risk reminders when the cap is reached
**And** every reminder includes a one-click unsubscribe action that immediately disables that reminder category for that learner without requiring login, confirmed by an acknowledgment shown after clicking

### Story 4.12: Compressed Catch-Up Recovery Plan — FR-P-10
As a learner who has fallen significantly behind, I want the system to offer a compressed catch-up plan when I've missed several sessions, so that I have a concrete, realistic path back on track instead of an ever-growing backlog.
**Acceptance Criteria:**
**Given** a learner has ≥3 scheduled PlannedSessions with a past date and no corresponding completed activity
**When** the missed-session count crosses the threshold of 3
**Then** the system surfaces a "Catch-up plan available" prompt on the progress dashboard, distinct from the standard replan panel (Story 4.9)
**And** accepting the prompt generates a compressed schedule that redistributes the missed topics' remaining hours across the upcoming period at an increased weekly-hours rate, bounded by the same feasibility threshold used in Story 4.2, showing the new weekly hours and revised target date before commit
**And** the catch-up flow reuses the replan engine from Story 4.9 (same regeneration and `LearningPlanReplanned` event) rather than a separate code path, tagging the replan reason as CATCH_UP
**And** declining or dismissing the prompt leaves the existing schedule untouched and does not re-prompt for at least 7 days or until 3 additional sessions are missed, whichever comes first
**And** if the learner completes enough sessions to drop back below the 3-missed threshold before accepting, the prompt is automatically withdrawn

### Story 4.13: Skip Concept — Board Control — FR-B-11

*Relocated here from Epic 3 during final validation: as originally written it called Epic 4 Story 4.4's service API from within Epic 3, a forward dependency on an epic that ships later — forbidden by the story-dependency rules. Since Epic 4 already depends on Epic 3 (the Board exists by the time Epic 4 is built), and this epic owns the underlying skip/un-skip state machine (Story 4.4) per AD-14, the full capability — including the Board-facing control — is delivered here instead. This story extends the Board UI built in Epic 3 with the Skip-concept control; it depends only on this epic's own Story 4.4, no forward dependency remains.*

As a learner, I want to skip the current concept from the board, so that I can move past material I already know or want to return to later.

**Acceptance Criteria:**
**Given** I am viewing any Beat within a Concept on the Board (built in Epic 3)
**When** I select "Skip concept"
**Then** the board shows a brief confirmation, including the concept name and a note that it can be revisited later, before proceeding

**Given** I confirm the skip
**When** confirmed
**Then** the board calls this epic's own concept-skip service API (Story 4.4) for the current concept, and upon a successful response navigates forward to the first Beat of the next Concept

**Given** the skip-service call fails or times out
**When** the failure occurs
**Then** the board shows an error with a retry option and does not advance, leaving the current Concept displayed

**Given** a Concept has already been marked skipped, as reported by Story 4.4's service
**When** I view that Concept's board entry point
**Then** the board displays a "skipped" indicator and offers a resume/un-skip trigger that likewise calls Story 4.4's existing API, rather than inferring or storing skip state locally

### Story 4.14: Publish Mastery and Completion Events — synthetic (resolves an Implementation Readiness critical finding: Epic 5's Stories 5.2–5.5 subscribe to `concept.mastered`/`topic.completed`/`course.completed`, but no story anywhere published them)

*This is the missing producer side of Epic 5's consumer-only stories. This epic owns `ConceptProgress` (AD-14), so it owns the mastery transition and the events that announce it — not Epic 3 (which only reports raw checkpoint signals) and not Epic 5 (which only reacts).*

As the plans-progress module, I want to consume checkpoint signals and drive concept/topic/course completion state, publishing a domain event at each transition, so that Epic 5's star/badge system (and any other future subscriber) can react without knowing this module's internals.

**Acceptance Criteria:**
**Given** a checkpoint-result domain event from Story 3.13 (Board) indicating a Concept's checkpoint was passed
**When** this module processes it
**Then** the corresponding `ConceptProgress` record transitions to MASTERED (if not already), and a `concept.mastered` event is published per AD-13 with `{learnerId, courseId, topicId, conceptId, timestamp}`

**Given** every Concept within a Topic reaches MASTERED or SKIPPED state (per Story 4.4's skip/un-skip scoping)
**When** the last one transitions
**Then** a `topic.completed` event is published with `{learnerId, courseId, topicId, timestamp}`

**Given** every Topic within a Course reaches completion by the same rule
**When** the last one transitions
**Then** a `course.completed` event is published with `{learnerId, courseId, timestamp}`, and this is the same event Epic 5's certificate story (5.5) and the `ProgressDisclosure` completion threshold (Story 4.5) key off

**Given** a `concept.mastered` event was already published for a given learner/concept
**When** a duplicate checkpoint-passed signal is processed (e.g. retry, replay)
**Then** no duplicate event is published — idempotent per learner/concept, matching the dedup pattern Epic 5 Story 5.3 already expects on the consumer side

## Epic 5: Engagement — Stars, Streaks & Certificates

Users earn stars, keep streaks, unlock badges, and get a verifiable, non-accredited completion certificate. Depends on Epic 3 + 4. Kept separate from leaderboards (Epic 8) deliberately — leaderboard psychology is a distinct design risk (PRD risk R-9), not just a later release tag.

### Story 5.1: Publish Stable, Versioned Star Value Table — FR-R-2

As a learner, I want to see exactly how many stars every action is worth, so that I can trust the system never hands out hidden or arbitrary rewards.

**Acceptance Criteria:**
**Given** the engagement module defines a `StarValueRule` for each award-triggering action type (concept mastery, topic completion, course completion, assignment score band, streak milestone, peer explain-back)
**When** a learner or client calls the public reference endpoint `GET /engagement/star-values`
**Then** the response returns every currently active action type with its exact integer star value, a rule version number, and the date the version became effective
**And** calling the endpoint repeatedly with no state change returns byte-identical values (no randomization, no per-user variance, no A/B variance)

**Given** an admin needs to change a star value (e.g., raise concept-mastery from 5 to 6 stars)
**When** the change is submitted
**Then** the system creates a new `StarValueRule` version with a future-or-present effective date rather than mutating the prior version's value in place
**And** the previous version remains queryable via `GET /engagement/star-values?asOf={date}` so historical awards can always be explained by the rule that was active when they were earned

**Given** an action type has no `StarValueRule` defined yet (e.g., a trigger not yet implemented)
**When** the star-values reference is requested
**Then** that action type is simply absent from the response rather than returned with a null, zero, or placeholder value — the table only ever lists real, active rules
**And** there is no code path anywhere in the engagement module that writes a star award without reading its value from an active `StarValueRule`, so no award can be arbitrary or off-table

### Story 5.2: Track Daily Learning Streaks With Monthly Freeze Days — FR-R-3

As a learner, I want my consecutive active-learning days to count as a streak that tolerates up to two missed days per month, so that an occasional busy day doesn't erase my progress.

**Acceptance Criteria:**
**Given** a learner has a `Streak` record with a current count and no activity logged yet today
**When** the engagement module receives a qualifying learning-activity domain event for that learner (e.g., `concept.mastered`, `topic.progress.recorded`) with today's date
**Then** the learner's local calendar day is marked active, and if the previous local day was also active (or was covered by a freeze) the streak count increments by one; if today is the first activity ever, the streak count is set to one

**Given** a learner's `Streak` had activity yesterday (learner's local timezone) but has zero qualifying activity events for the current day by end of that day
**When** the daily streak-evaluation job runs and the learner has fewer than 2 freeze days used in the current calendar month
**Then** a freeze day is consumed, the missed day is recorded as frozen (not active, not broken), and the streak count is preserved unchanged

**Given** a learner has already used both freeze days in the current calendar month and has zero qualifying activity for the current day
**When** the daily streak-evaluation job runs
**Then** the streak breaks: the streak count resets to zero and a `streak.broken` domain event is published with the final pre-break count
**And** on the learner's next qualifying activity event, a new streak begins at one

**Given** the calendar rolls over to a new month
**When** the daily streak-evaluation job runs for the first day of that month
**Then** the learner's freeze-day usage counter resets to 0 available-to-use-2, independent of streak count, which is unaffected by the month rollover

**Given** a learner's streak count crosses a defined milestone threshold (e.g., 10 days) as a result of an increment
**Then** the engagement module publishes a `streak.milestone_reached` event containing the learner id and milestone value, for later stories in this epic to consume
**And** re-running the evaluation job idempotently for a day already processed does not increment the streak or re-publish the milestone event a second time

### Story 5.3: Award Stars Generically via Domain Event Subscription — FR-R-1

As a learner, I want to automatically earn stars whenever I master a concept, finish a topic/course, keep a streak, or complete other qualifying actions, so that my effort is recognized without me having to do anything extra — and so future course types keep working the same way.

**Acceptance Criteria:**
**Given** the engagement module maintains a subscriber registry mapping domain event types to `StarValueRule` action types (per Story 5.1), including `concept.mastered`, `topic.completed`, `course.completed`, `streak.milestone_reached` (per Story 5.2), `assignment.graded`, and `peer.explainback.completed`
**When** any subscribed domain event is published on the event bus, per AD-13, by whichever module owns it
**Then** the engagement module creates one `StarTransaction` for the learner referencing the event's source id, the matched action type, and the exact star value from the currently active `StarValueRule`
**And** a linked `Note` is created on that transaction recording the human-readable reason (trigger type, source event id, rule version) so the award is fully explainable, satisfying the no-hidden-awards guarantee from FR-R-2

**Given** `assignment.graded` and `peer.explainback.completed` have no publisher yet because Assignments (Epic 6) and Cohorts (Epic 7) have not shipped
**When** this story is implemented and deployed
**Then** the subscriber registrations for those event types exist and require zero code changes in the engagement module once Epic 6/7 begin publishing them — the star-award logic depends only on event shape, not on which module or epic emits it

**Given** an `assignment.graded` event carries a score-band field (e.g., `band: "excellent"`)
**When** the engagement module processes it
**Then** it looks up the star value for the specific `assignment.<band>` action type rather than a single flat assignment value, so different score bands award different, published star amounts

**Given** the same domain event is delivered more than once (e.g., at-least-once redelivery from the event bus)
**When** the engagement module processes the duplicate
**Then** it detects the existing `StarTransaction` for that exact source event id and learner, and does not create a second transaction or award duplicate stars

**Given** a learner views their star history
**When** they call `GET /engagement/star-transactions`
**Then** every transaction lists its trigger type, star value, date, and linked `Note` explanation, and the sum of all transactions matches the learner's total displayed star balance exactly

### Story 5.4: Award Milestone Badges — FR-R-4

As a learner, I want to unlock recognizable badges for meaningful milestones like finishing my first course or bouncing back after a break, so that my progress feels celebrated beyond just stars.

**Acceptance Criteria:**
**Given** the engagement module defines five badge types — First Course, 10-Day Streak, Comeback, Deep-Diver, Helper — each with a one-time-per-learner award rule
**When** a learner's first-ever `course.completed` domain event is received
**Then** a `Badge` record of type "first_course" is created for that learner, and a subsequent `course.completed` event for a second course does not create another "first_course" badge

**Given** a learner's `Streak` (Story 5.2) publishes a `streak.milestone_reached` event with value 10
**When** the engagement module processes it
**Then** a "10_day_streak" `Badge` is created; if the same learner later reaches 20 days, no duplicate "10_day_streak" badge is created since the milestone was already awarded

**Given** a learner's `Streak` breaks (`streak.broken` event) and the learner later logs a new qualifying activity event after a gap of 7 or more calendar days with no activity
**When** that first return activity is processed
**Then** a "comeback" `Badge` is created for that learner, awarded at most once per calendar quarter to avoid trivial repeat awards

**Given** `concept.mastered` events for a learner carry a `topicId`, and the learner has mastered 15 or more distinct concepts within the same topic
**When** the 15th such event for that topic is processed
**Then** a "deep_diver" `Badge` is created, scoped per topic (a learner can earn it again for a different topic, but not twice for the same topic)

**Given** `peer.explainback.completed` events are subscribed to using the same forward-compatible pattern as Story 5.3, and no publisher exists yet because Cohorts (Epic 7) has not shipped
**When** a learner accumulates 5 such events after Epic 7 ships
**Then** a "helper" `Badge` is created with no code change required in this story's logic at that future time
**And** until then, the subscription exists but simply never fires, which is expected and correct

**Given** a learner earns a badge
**When** they call `GET /engagement/badges`
**Then** the response lists each earned badge with its type and the date it was awarded, and never lists a badge type more than the maximum allowed count defined above

### Story 5.5: Generate Shareable, Verifiable, Non-Accredited Completion Certificate — FR-R-5

As a learner who has completed a course, I want a shareable certificate with a public verification link that honestly discloses any concepts I skipped, so that I can showcase my achievement without overstating what I actually completed.

**Acceptance Criteria:**
**Given** a learner has a `course.completed` domain event on record and requests a certificate for that course
**When** the certificate is generated
**Then** the engagement module calls the skip-disclosure component/data built in Epic 4 (Story 4.5, synthetic FR-P-13) to retrieve the learner's actual completion breakdown for that course, rather than computing or re-deriving its own progress-percentage or skipped-concept logic
**And** the resulting `Certificate` record stores a reference to that skip-disclosure snapshot (not a duplicated recomputation) so the disclosed data can never drift from the source of truth

**Given** the Epic 4 skip-disclosure data shows the learner skipped one or more concepts
**When** the certificate is rendered (web view and any downloadable form)
**Then** it displays the list of skipped concepts (or skipped-concept count with detail link) alongside the completion statement, and it never renders a bare "100% Complete" claim when skipped concepts exist

**Given** the Epic 4 skip-disclosure data shows zero skipped concepts
**When** the certificate is rendered
**Then** it shows full completion with no skip disclosure section, since there is nothing to disclose

**Given** a generated `Certificate` has a unique verification id
**When** anyone (authenticated or not) opens `GET /certificates/verify/{id}`
**Then** the page publicly confirms validity and shows the learner's display name, course title, completion date, and the same skip-disclosure summary as the original certificate, without exposing any other private learner data (email, internal ids, other course progress)

**Given** every certificate represents non-accredited learning
**When** a certificate is rendered in any form (web, share link, verification page)
**Then** it displays an explicit, unmissable statement that the certificate is not an accredited credential

**Given** a learner shares their certificate URL externally
**When** the link is opened by a third party
**Then** the verification page loads read-only with no ability to edit, regenerate, or forge the underlying record, and requesting a nonexistent or malformed certificate id returns a clear "not found/invalid" response rather than a partial or misleading page

## Epic 6: Assignments & Evaluation

Users get auto-generated, rubric-graded assignments with structured feedback and an appeal path. Depends on Epic 3 + 4.

### Story 6.1: Auto-generate calibrated assignments — FR-E-1
As a learner, I want an assignment auto-generated for a topic or course that is aligned to its learning objectives and calibrated to my demonstrated mastery level, so that I get right-sized practice without a tutor manually authoring it.
**Acceptance Criteria:**
**Given** a topic with defined learning objectives and my current mastery level for that topic
**When** I request a new assignment (or one is triggered after a board session)
**Then** the system generates an assignment via GenerationPort whose items each map to at least one stated objective and whose difficulty distribution matches my demonstrated level (e.g., low mastery → majority foundational items)
**And** the generated assignment records the objective IDs and calibration level used, for later audit/traceability

**Given** I have no prior mastery signal for the topic
**When** an assignment is generated for me
**Then** it defaults to a baseline calibration and is flagged "diagnostic" so grading treats it as a calibration point

**Given** a generation request to GenerationPort fails or times out
**When** the assignment would otherwise be created
**Then** I see an explicit error state and a retry option rather than receiving a partially-formed assignment

### Story 6.2: Support the full range of item types — FR-E-2
As a course author/system, I want assignments composed from the defined set of item types (MCQ, multi-select, short answer, long answer/essay, numerical with working, code, file upload), so that assessments can match how mastery is actually demonstrated for a given objective.
**Acceptance Criteria:**
**Given** the assignment generator is producing items for a topic
**When** it selects an item type for a given objective
**Then** the item is created as exactly one of the seven supported types with the schema/fields required for grading that type (e.g., numerical items capture an expected value and tolerance; code items capture language and expected test cases)
**And** an assignment may mix item types within a single assignment

**Given** a learner opens a generated assignment
**When** each item renders
**Then** the correct input control is shown for its type (single-select radio, multi-select checkboxes, rich text editor, code editor, numeric field with a "show your working" text area, file drop zone)

**Given** a learner attempts to submit an item whose response doesn't match its type's expected shape (e.g., no option selected for MCQ, empty code block)
**When** submission is attempted
**Then** it is rejected client-side with a type-specific validation message before submission reaches the server

### Story 6.3: Visible rubric before starting an assignment — FR-E-3
As a learner, I want to see the grading rubric before I begin an assignment, so that I understand how I'll be evaluated before investing time in it.
**Acceptance Criteria:**
**Given** an assignment has been generated with rubric criteria attached to its open-ended items
**When** I open the assignment's start screen
**Then** I see the full rubric (criteria, weight/points, and a plain-language description of what each score level requires) before any item is presented, and must acknowledge it before the first item becomes interactive
**And** the rubric shown matches exactly the rubric used later at grading time, with no drift between preview and actual grading criteria

**Given** an assignment contains only objective items (MCQ, multi-select, numerical) with no open-ended criteria
**When** I open the start screen
**Then** the rubric screen instead shows the scoring basis (points per item, pass threshold)

### Story 6.4: Submit via in-browser editor with drafts, uploads, and one resubmission — FR-E-4
As a learner, I want to answer assignment items in-browser, upload files by drag-and-drop, save drafts, and resubmit once after feedback, so that I can work at my own pace and correct mistakes without losing progress.
**Acceptance Criteria:**
**Given** I am partway through an assignment
**When** I navigate away or close the browser
**Then** my in-progress answers are auto-saved as a draft and restored when I return

**Given** a file-upload item
**When** I drag a file onto it
**Then** it uploads if ≤25MB and an allowed type, showing progress and a success state
**And** a file over 25MB is rejected client-side with a clear size-limit message and no partial upload occurs

**Given** I have submitted an assignment and received feedback
**When** I choose to resubmit
**Then** I am offered exactly one resubmission, which replaces my answers and is graded like the original
**And** a second resubmission attempt after the first is used is blocked with an explanation that the limit has been reached

### Story 6.5: Practice mode vs graded mode — FR-E-5
As a learner, I want to choose between unlimited unscored practice attempts and a graded attempt that counts toward my mastery and leaderboard standing, so that I can rehearse safely before an attempt that matters.
**Acceptance Criteria:**
**Given** I open an assignment
**When** I choose "practice mode"
**Then** I can attempt and resubmit unlimited times, receive full feedback each time, and none of these attempts write to my mastery model or leaderboard standing

**Given** I choose "graded mode"
**When** I attempt the assignment
**Then** standard submission rules apply (draft save, one resubmission) and the result is the one eligible to feed mastery, progress, and leaderboards per FR-E-12
**And** the mode is clearly labeled throughout the attempt UI and results view, and cannot be switched retroactively once a graded attempt has started

### Story 6.6: OCR handwritten submissions with learner confirmation — FR-E-6
As a learner, I want to submit a photo/scan of handwritten work and confirm the OCR-extracted text before it's graded, so that grading is based on an accurate transcription rather than a misread of my handwriting.
**Acceptance Criteria:**
**Given** I upload an image or PDF of handwritten work to a short/long-answer or numerical item
**When** OCR processing completes
**Then** I am shown the extracted text side-by-side with my original image and asked to confirm or edit it before submission proceeds
**And** if I edit the extracted text, the edited version (not the raw OCR output) is what gets graded

**Given** OCR confidence for a region of the extracted text is low
**When** the confirmation screen renders
**Then** that region is visually highlighted as "please verify"

**Given** I leave the confirmation screen without confirming
**When** I return later
**Then** the item remains in draft state and grading has not started

### Story 6.7: Deterministically auto-grade objective items — FR-E-7
As a learner, I want MCQ, multi-select, and numerical items graded instantly and deterministically, so that I get an unambiguous, reproducible score the moment I submit.
**Acceptance Criteria:**
**Given** I submit an assignment containing only objective item types
**When** the submission is processed
**Then** each item is scored by exact comparison against its stored answer key (numerical items within their defined tolerance) with no GenerationPort/LLM call involved
**And** I see my objective score immediately, with no processing/waiting state

**Given** the same submission is graded twice (e.g., re-run for audit)
**When** each grading executes
**Then** it produces an identical score both times

**Given** a numerical item includes "show your working" text
**When** the item is scored
**Then** that text is stored but does not affect the deterministic score

### Story 6.8: Grade open-ended items criterion by criterion — FR-E-8
As a learner, I want short-answer, essay, and code items graded against each rubric criterion individually with a score, justification, and quoted evidence from my own submission, so that I understand exactly why I earned the score I got.
**Acceptance Criteria:**
**Given** I submit an open-ended item tied to a rubric with multiple criteria
**When** grading runs via GenerationPort
**Then** each criterion receives its own score within its defined point range, a written justification, and at least one verbatim quote from my submission supporting that judgment
**And** the item's total score is the sum of criterion scores, verifiable from the stored per-criterion results
**And** the request goes through GenerationPort so caching/rate-limiting/routing and safety/PII filtering apply as for any other generation call

**Given** my submission does not address a given criterion
**When** that criterion is scored
**Then** it receives the minimum score for that criterion and the justification explicitly states the criterion was not addressed, rather than fabricating a quote

### Story 6.9: Structured feedback with concept link-back — FR-E-9
As a learner, I want feedback organized as what I got right, what's missing or incorrect, why it matters, the concept to revisit, and a link to a relevant board session, so that I know exactly what to do next instead of just seeing a score.
**Acceptance Criteria:**
**Given** a graded open-ended item with per-criterion results
**When** I view my feedback
**Then** it is presented in the fixed structure: correct → missing/incorrect → why it matters → concept to revisit → link to a board session covering that concept
**And** the "concept to revisit" names a specific concept tag associated with the item's objective, not a generic restatement of the rubric

**Given** the named concept has an existing board session
**When** the feedback link is resolved
**Then** it links to that actual board session

**Given** no board session exists yet for the named concept
**When** the feedback is displayed
**Then** the link is replaced with a clearly labeled "no session available yet" state rather than a broken link

**Given** an item is graded fully correct
**When** feedback is generated
**Then** the "correct" section is still populated describing what was done well, even though nothing is missing/incorrect

### Story 6.10: Flag low-confidence gradings for human spot-check — FR-E-10
As a course operator, I want gradings the model was not confident about automatically flagged "review recommended" and queued for human spot-check, so that uncertain auto-grades get a second set of eyes before being treated as final.
**Acceptance Criteria:**
**Given** an open-ended item is graded via GenerationPort and returns a confidence score with the grading
**When** any criterion's confidence falls below the configured threshold
**Then** the result is labeled "review recommended" and an entry is added to the human spot-check queue with the submission, the flagged criterion(s), and the grading rationale attached

**Given** an item is flagged "review recommended"
**When** the learner views their result
**Then** they still see their score and feedback immediately (the flag does not block the FR-E-13 turnaround SLA), with a visible "review recommended" badge

**Given** a human reviewer resolves a spot-check queue entry with a score change
**When** the resolution is saved
**Then** the learner's score is updated and they are notified their result was adjusted after review

**Given** an item's confidence is above the threshold
**When** grading completes
**Then** it never appears in the spot-check queue

### Story 6.11: Grade appeal with second-pass evaluation and human escalation — FR-E-11
As a learner, I want to appeal a grade I disagree with and have it automatically re-evaluated, escalating to a human if I'm still not satisfied, so that I have recourse against a wrong or unfair auto-grade without every disagreement requiring a human from the start.
**Acceptance Criteria:**
**Given** I have a graded submission I disagree with
**When** I submit an appeal with my stated reason
**Then** a second-pass evaluation is triggered via GenerationPort using a distinct grading pass (not a cached repeat of the original) against the same rubric

**Given** the second-pass score differs from the original
**When** the second pass completes
**Then** my result is updated to the second-pass outcome and I'm shown both scores with an explanation of the change

**Given** I dispute the second-pass result by submitting a second appeal on the same item
**When** that appeal is submitted
**Then** the item is placed in the human review queue instead of triggering a third automated pass, and I'm shown an expected review turnaround
**And** I cannot trigger more than one automated re-evaluation per graded item, preventing an unbounded automated appeal loop

### Story 6.12: Publish assignment results to the mastery/progress model — FR-E-12
As the assignments module, I want to publish a domain event when a graded assignment result is finalized, so that the mastery model owned by Epic 4 (and downstream consumers like Epic 5 leaderboards) can update without assignments needing to know about their internals.
**Acceptance Criteria:**
**Given** a graded-mode assignment attempt reaches a final state (initial grade, or updated grade after spot-check/appeal resolution)
**When** the final score is committed
**Then** an `assignment.graded` domain event is published per AD-13 containing learner ID, objective IDs, per-objective/per-criterion scores, and the assignment's calibration level, with no direct write from assignments into Epic 4's or Epic 5's data

**Given** an assignment attempt was made in practice mode
**When** it is graded
**Then** no `assignment.graded` event is published for it

**Given** a grade later changes due to spot-check adjustment or appeal outcome
**When** the change is committed
**Then** a follow-up `assignment.graded` (or explicit correction) event is published so consumers can reconcile rather than double-count

**Given** the event publish attempt transiently fails
**When** grading would otherwise be marked complete
**Then** grading is not marked "complete" until the event is durably enqueued, so a mastery update is never silently dropped

### Story 6.13: Meet turnaround SLAs across item types, with status for long-form — FR-E-13
As a learner, I want objective items graded instantly, open-ended items graded within about 2 minutes 90% of the time, and long-form items within 10 minutes with visible status, so that I know what to expect and am never left wondering if my submission was lost.
**Acceptance Criteria:**
**Given** I submit an assignment containing only objective items
**When** grading completes
**Then** I see my score with no perceptible processing delay, per FR-E-7's synchronous scoring

**Given** I submit a short-answer/code item
**When** it is queued to GenerationPort for grading
**Then** it completes and I see results within 2 minutes for at least 90% of submissions, measured over a rolling window

**Given** I submit a long-form/essay item
**When** grading is dispatched as an async job via JobQueuePort (AD-15)
**Then** I see a persistent "grading in progress" status with elapsed time, the job completes within 10 minutes, and I'm notified in-app the moment results are ready

**Given** a long-form job exceeds the 10-minute SLA
**When** I check its status
**Then** the UI surfaces an explicit "taking longer than expected" state instead of a normal in-progress spinner, and the breach is logged for operational monitoring

### Story 6.14: Academic-integrity notice for v1 — FR-E-14
As a learner, I want to be clearly told that this version of the platform runs no plagiarism or AI-content detection on my submissions, so that I have accurate expectations about what is and isn't being checked.
**Acceptance Criteria:**
**Given** I am about to submit any assignment for grading
**When** I reach the submission confirmation step
**Then** I see a clearly worded, visibly rendered notice stating that v1 performs no plagiarism or AI-generated-content detection on submissions, not hidden behind a collapsed/truncated element by default

**Given** the notice text is defined once centrally
**When** it is displayed across different item types and assignments
**Then** the same source content is reused rather than duplicated per item type, so it can be updated in one place if this changes in a future version

**Given** I am submitting in either practice or graded mode
**When** I reach submission
**Then** the notice appears in both cases, since the absence of integrity checking applies regardless of mode
**And** dismissing/acknowledging the notice is not required to gate submission — it is informational, not a consent blocker

## Epic 7: Group Learning — Cohorts

Users can join a waiting list, get matched into a cohort, and attend live Avatar-led group sessions with peer explain-back. Highest complexity in the product; ships last per the PRD's own R1 recommendation. Depends on Epic 1–4. FR-G-6's 14-day anti-stall window is still an unconfirmed `[ASSUMPTION]` — built configurable, never hardcoded.

### Story 7.1: Configure Cohort-Enabled Course Offering — FR-G-1
As a course admin, I want to declare cohort parameters (min/max seats, cadence options, session duration, language, level) on a course, so that the matching engine and waiting list have the constraints they need to form valid cohorts.
**Acceptance Criteria:**
**Given** a course marked eligible for cohort delivery
**When** an admin sets min seats, max seats, cadence options (e.g., weekly, biweekly), session duration, language, and level
**Then** the course record persists these cohort parameters and the course is flagged cohort-enabled
**And** if min seats exceeds max seats, or any required field is missing, the system rejects the save with a validation error identifying the invalid field
**And** if max seats is set outside the recommended range of 6-15, the system displays a warning but allows the admin to override with justification

### Story 7.2: Join Timezone-Aware Cohort Waiting List — FR-G-2
As a learner, I want to join a course's waiting list with my timezone, weekly availability, and cadence preference, so that I get matched into a cohort that fits my schedule.
**Acceptance Criteria:**
**Given** a cohort-enabled course with an active waiting list
**When** a learner submits their timezone, weekly availability slots, and preferred cadence
**Then** a WaitingListEntry is created linking the learner, course, timezone-normalized availability, and cadence preference
**And** if the learner has an existing active WaitingListEntry for the same course, the new submission updates it instead of creating a duplicate
**And** if the learner submits zero availability slots, the system rejects the submission and prompts for at least one slot
**And** availability is stored normalized to UTC so cross-timezone matching in FR-G-4 can compare slots directly

### Story 7.3: Waiting-List Status Display — FR-G-3
As a waitlisted learner, I want to see how many seats are filled, an expected start window, and an honest "we'll notify you" message, so that I know what to expect without false promises.
**Acceptance Criteria:**
**Given** a learner has an active WaitingListEntry for a course
**When** they view the waiting-list status
**Then** the UI shows current seats filled toward the course minimum, an expected start window derived from historical fill rates (or "not yet estimable" if insufficient data), and a "we'll notify you when matched" message
**And** the UI never displays a specific start date/time before a cohort is actually proposed
**And** if the waiting list has zero other members, the UI states the learner is first and no estimate is available yet

### Story 7.4: Matching Engine Forms Cohort from Waiting List — FR-G-4
As a waitlisted learner, I want the system to automatically group me with enough learners who share a common weekly slot, so that a viable cohort can be scheduled.
**Acceptance Criteria:**
**Given** a course's waiting list has reached at least the course's min seats
**When** the matching engine runs
**Then** it evaluates candidate groupings and forms a Cohort only when a group of at least min-seats learners shares ≥80% overlap on at least one weekly slot pattern, choosing the grouping that maximizes total overlap
**And** each matched learner receives a CohortMembership record with status "proposed" referencing the winning shared slot pattern and cadence
**And** if no subset of waitlisted learners meets the 80% overlap threshold at min seats, no cohort is formed and all learners remain on the waiting list
**And** the engine re-evaluates automatically whenever a new WaitingListEntry is added or an existing one changes availability

### Story 7.5: Fallback Handling for Non-Fitting Waiting-List Members — FR-G-4
As a waitlisted learner whose availability didn't fit the matched cohort, I want to be kept on the waiting list with a clear reason, so that I can still be matched into a future cohort.
**Acceptance Criteria:**
**Given** the matching engine has formed a cohort from a subset of a course's waiting list
**When** learners are not included in the winning grouping
**Then** their WaitingListEntry remains active and unchanged, and they are shown the reason "not enough schedule overlap with the current group"
**And** these learners are automatically included in the next matching run
**And** if a leftover group of non-fitting learners itself reaches min seats with ≥80% overlap, a second cohort is formed from them in the same matching run

### Story 7.6: Enforce Cohort Size Cap During Formation — FR-G-7
As a course admin, I want cohort formation to respect the configured max-seat cap, so that no cohort exceeds a size that facilitation quality can support.
**Acceptance Criteria:**
**Given** a course's cohort parameters define min and max seats within the recommended 6-15 range (or an admin override)
**When** the matching engine selects the grouping that maximizes overlap
**Then** it never proposes a cohort with more members than the course's max seats, preferring the highest-overlap subset that fits within the cap
**And** if more than max-seats learners share ≥80% overlap, the excess learners are treated as fallback per FR-G-4 and remain eligible for late-join or the next cohort
**And** the cap is read from the course's configured max seats, never hardcoded

### Story 7.7: Member Confirms Proposed Cohort Schedule Within 48 Hours — FR-G-5
As a matched learner, I want to confirm my proposed cohort schedule within 48 hours, so that the cohort can be finalized with committed members.
**Acceptance Criteria:**
**Given** a learner has a CohortMembership with status "proposed" and a proposed schedule
**When** the learner confirms within 48 hours of the proposal
**Then** their CohortMembership status changes to "confirmed"
**And** if the learner does not respond within 48 hours, their CohortMembership is automatically cancelled and they are returned to the course's waiting list with their original availability intact
**And** if enough members fail to confirm such that the cohort drops below min seats, the cohort is dissolved, remaining confirmed members are returned to the waiting list, and the matching engine is re-triggered
**And** the learner receives a notification at proposal time and a reminder before the 48-hour window expires

### Story 7.8: Anti-Stall Guarantee for Long-Waiting Learners — FR-G-6
As a learner who has waited without being matched, I want the system to offer alternatives after a configurable stall period, so that I'm not stuck indefinitely on the waiting list.
**Acceptance Criteria:**
**Given** a learner's WaitingListEntry has been active without a cohort match for the configured anti-stall threshold
**When** the threshold is reached
**Then** the system offers the learner a choice of a smaller cohort (down to course min seats), a different cadence option, or self-paced conversion with progress carryover
**And** the anti-stall threshold reads from packages/config (AD-12) as a configurable value, never a literal 14 hardcoded in code, and changing the config value changes the offer timing without a code change
**And** if the learner chooses self-paced conversion, their WaitingListEntry is closed and their course progress carries over to a self-paced enrollment
**And** if the learner chooses a smaller cohort or different cadence, their WaitingListEntry is updated accordingly and re-enters the matching engine immediately

### Story 7.9: Scheduled Live Cohort Session Room with Synchronized Avatar Board — FR-G-9

*Fixed during Implementation Readiness review: the relationship between a multi-learner CohortSession and the single-learner-shaped LearningSession/Beat state machine (AD-10) was previously undefined. Resolved here: a CohortSession owns exactly one facilitator-driven LearningSession — a system/Avatar-owned playback, not any individual member's. Members are synchronized read-only followers of its Beat progression; nobody's personal pause/rewind (FR-B-1/B-3, individual-learner controls) applies to this shared LearningSession. Individual "explain more" (Story 7.11) branches into private content that never forks or mutates the shared LearningSession. A full epic-altitude architecture spine for Cohorts may still refine this; this is the load-bearing rule stories can build against until then.*

As a confirmed cohort member, I want to join a scheduled live session room where the Avatar-led board is synchronized for everyone, so that the whole cohort sees the same content at the same time.
**Acceptance Criteria:**
**Given** a Cohort has confirmed members and a scheduled session time
**When** the CohortSession activates at the scheduled time
**Then** it creates and owns exactly one facilitator-driven LearningSession (owned by board-orchestration per AD-14, but not attributed to any individual member) whose Beat progression is system/Avatar-controlled, not member-controlled
**And** when a member joins the room, the room displays the shared board driven by that LearningSession's canonical current-beat pointer, not a separate cohort-local playback state and not any member's own LearningSession

**Given** the shared LearningSession is progressing
**When** board state changes
**Then** they broadcast to all connected members via PubSubPort with a versioned message contract (AD-5) so every client renders the same beat — no member has an individual pause/rewind/replay control over this shared session (those FR-B-1/B-2/B-3 controls are self-paced-only; the cohort UX for pacing input is FR-G-10's shared re-explanation threshold, not personal playback control)

**Given** a member's connection drops and reconnects
**When** they rejoin
**Then** their client resyncs to the shared LearningSession's current beat pointer rather than replaying missed state, exactly as a single-learner Board reconnect would (Story 3.1) — same resync pattern, applied to the shared session instead of a personal one

**Given** no member joins within a configurable grace period after the scheduled start
**When** the grace period elapses
**Then** the session is marked "no-show," its LearningSession is not created, and it does not block the next scheduled session

### Story 7.10: Late-Join a Cohort in Its First Two Sessions — FR-G-8
As a waiting learner, I want to join an already-started cohort if seats remain and it's still within the first two sessions, so that I don't have to wait for a brand-new cohort to form.
**Acceptance Criteria:**
**Given** a Cohort has completed fewer than 2 sessions and its current member count is below the course's max seats
**When** a waitlisted learner with compatible availability requests to join
**Then** a new CohortMembership with status "confirmed" is created and the cohort's seat count updates
**And** if the cohort has already completed 2 or more sessions, the late-join option is not offered and the learner remains on the waiting list
**And** if the cohort is already at max seats, the late-join option is not offered
**And** the late-joining learner is shown a note that they'll need to catch up on missed session content via self-paced replay

### Story 7.11: Individual "Explain More" to Private Side Panel — FR-G-10
As a cohort learner in a live session, I want to request a deeper explanation privately without interrupting the group, so that I can get help matched to my pace without disrupting others.
**Acceptance Criteria:**
**Given** a learner is in an active CohortSession viewing the shared board
**When** the learner triggers "explain more" on the current beat
**Then** a private side panel opens for that learner only, showing an Avatar-generated elaboration on the current beat content
**And** other members' shared board view is unaffected by this request
**And** the request and elaboration are logged against the learner's CohortMembership for later shared-repeat threshold counting

### Story 7.12: Shared Re-Explanation When Repeat Requests Cross Threshold — FR-G-10
As a facilitator Avatar, I want to detect when a significant share of the cohort independently requests the same explanation, so that the group gets a shared re-explanation instead of everyone waiting on individual panels.
**Acceptance Criteria:**
**Given** multiple learners in the same active CohortSession have triggered "explain more" on the same current beat within the same session
**When** the count of distinct learners requesting it reaches ≥30% of currently connected session participants
**Then** the Avatar delivers a shared re-explanation on the main synchronized board for all participants, not just the requesters
**And** the 30% threshold is computed against currently connected participants at the time of the check, not the cohort's total membership
**And** after the shared re-explanation is delivered, further individual requests on that same beat in that session continue to open private side panels rather than re-triggering the shared broadcast

### Story 7.13: Threaded Text Chat in Live Session — FR-G-11
As a cohort learner, I want to send threaded text chat messages during a live session, so that discussion stays organized and I can reply to specific points.
**Acceptance Criteria:**
**Given** a learner is connected to an active CohortSession
**When** they post a chat message or a reply to an existing message
**Then** a CohortMessage is created, associated with the session and, if a reply, with its parent thread, and broadcast to all connected members via PubSubPort with a versioned message contract
**And** every human-authored message is passed through the same safety-filter logic used for AI content (AD-3) before being broadcast
**And** if the safety filter flags a self-harm disclosure, the message triggers the same escalation path as an AI-generated disclosure, regardless of whether it is also blocked from the room
**And** messages persist for the session's participants to view for the remainder of the live session

### Story 7.14: Raise-Hand Queue — FR-G-11
As a cohort learner, I want to raise my hand and see my position in a queue, so that the facilitator flow can address questions in order without talking over each other.
**Acceptance Criteria:**
**Given** a learner is connected to an active CohortSession
**When** they raise their hand
**Then** they are added to an ordered raise-hand queue visible to all participants, showing their queue position
**And** when a learner's turn is resolved (acknowledged or withdrawn), they are removed from the queue and remaining positions renumber
**And** a learner can withdraw their own raised hand at any time before being acknowledged
**And** if a learner disconnects while queued, they are automatically removed from the queue

### Story 7.15: Live Polls and Group Checkpoints with Anonymized Results — FR-G-12
As a cohort learner, I want to answer live polls during a session and see the group's anonymized results, so that I can gauge how the cohort is doing without exposing individual answers.
**Acceptance Criteria:**
**Given** a facilitator Avatar launches a poll or checkpoint question on the shared board during an active CohortSession
**When** connected members submit their responses
**Then** each response is recorded against the CohortSession without displaying the responder's identity to other participants
**And** once the poll closes, the board shows aggregate results (e.g., percentage per option) with no per-learner attribution visible to any participant
**And** if a member does not respond before the poll closes, their non-response is excluded from the aggregate rather than counted as an answer
**And** poll results broadcast to all connected clients via PubSubPort with a versioned message contract so the board stays synchronized

### Story 7.16: Peer Explain-Back with Rotating Nomination — FR-G-13
As a cohort learner, I want to opt in to occasionally explain a concept back to the group with the Avatar affirming or correcting me, so that I reinforce my understanding and get recognized for contributing.
**Acceptance Criteria:**
**Given** a learner has opted in to peer explain-back for their cohort
**When** the facilitator flow selects a nominee for the current beat
**Then** it rotates fairly among opted-in members who haven't recently been nominated, and the nominee is prompted to explain the concept to the group
**And** after the learner's explanation, the Avatar responds by affirming correct parts, correcting inaccuracies, and adding nuance, visible to the whole session
**And** upon the Avatar's response completing, a `peer.explainback.completed` domain event is published per AD-13 (learner ID, cohort ID, concept ID) — this story does not write a `StarTransaction` directly; star-awarding is Epic 5 Story 5.3's subscriber, consistent with engagement's AD-14 ownership of that data
**And** if no opted-in members remain who haven't been recently nominated, the rotation resets to include all opted-in members again
**And** a learner can opt out at any time, removing them from future nominations without affecting stars already earned

### Story 7.17: Breakout Pairs for Practice Problems — FR-G-14
As a cohort learner, I want to be paired with one other learner in a breakout for a practice problem, so that I get focused practice with a peer before rejoining the group.
**Acceptance Criteria:**
**Given** an active CohortSession reaches a practice-problem beat with connected participants
**When** the facilitator flow starts a breakout
**Then** connected participants are split into pairs (with one group of three if the count is odd), each pair getting an isolated chat/work space scoped to their pairing
**And** the main shared board pauses advancing for the group until the breakout ends or its time limit expires
**And** when the breakout ends, all participants are returned to the synchronized main board at the same current beat
**And** if only one participant is connected when the breakout would start, breakout is skipped and the learner proceeds with the individual explain-more flow instead

### Story 7.18: Session Recordings Available for 30 Days — FR-G-15
As a cohort learner, I want to review a recording of the board and transcript from a past session for 30 days, so that I can revisit content I missed or want to reinforce, without exposing anyone's voice.
**Acceptance Criteria:**
**Given** a CohortSession has ended
**When** the recording is generated
**Then** it captures the board state progression and text transcript (chat and Avatar dialogue) but excludes learner audio by default
**And** the recording is available to that cohort's members for 30 days from the session end date, after which it is no longer accessible
**And** if a learner requests the recording after the 30-day window, the system responds that it has expired rather than erroring silently
**And** access is restricted to members of that specific cohort session, not the wider course

### Story 7.19: Attendance Tracking with Missed-Session Catch-Up Replay — FR-G-16
As a cohort learner who missed a session, I want my attendance recorded accurately and a self-paced replay offered for what I missed, so that I can catch up without falling behind the group.
**Acceptance Criteria:**
**Given** a CohortSession occurs
**When** a member's connection is present for at least the session's configured minimum attendance duration
**Then** their attendance is recorded as "present" against their CohortMembership; otherwise it is recorded as "absent"
**And** an absent learner is offered a self-paced replay of that session's board content and transcript, marked distinctly from live attendance
**And** a learner who completes the self-paced replay has that session marked "caught up" separately from "present", so live-attendance-based metrics (e.g., the FR-G-19 floor) are not conflated with catch-up completion
**And** attendance records are visible to the learner for their own history

### Story 7.20: Cohort Progress Board — FR-G-17
As a cohort learner, I want to see our cohort's attendance, collective mastery, and group streak, so that I stay motivated and aware of how the group is progressing together.
**Acceptance Criteria:**
**Given** a Cohort has completed at least one session
**When** a member views the cohort progress board
**Then** it shows aggregate attendance rate across sessions, collective mastery derived from checkpoint/poll performance, and the current group streak of consecutive sessions meeting the attendance floor
**And** individual learner performance is not singled out on the shared board beyond what's already anonymized in FR-G-12
**And** if the cohort has zero completed sessions, the board shows a "no sessions yet" state instead of zeros that could be misread as poor performance
**And** the streak resets to zero the first time a scheduled session falls below the attendance floor

### Story 7.21: Chat Profanity Filter and Safety Escalation — FR-G-18
As a cohort learner, I want chat messages to be filtered for profanity and unsafe content before others see them, so that the session stays respectful and safety concerns are handled consistently.
**Acceptance Criteria:**
**Given** a learner submits a CohortMessage in an active session
**When** the message passes through the shared safety-filter logic used for AI content (AD-3)
**Then** profane content is blocked or masked per the filter's configured policy before broadcast to other participants
**And** a self-harm or crisis disclosure is escalated through the same path as an AI-generated disclosure of the same category, regardless of the profanity outcome
**And** the sender is shown a clear notice when their own message was blocked or masked, without exposing filter internals
**And** filtered/escalated messages are retained for moderation review even when not shown to other participants

### Story 7.22: Report, Mute, Remove, and Admin Moderation Queue with SLA — FR-G-18
As a cohort learner or facilitator flow, I want to report, mute, or remove a disruptive participant, and have admins act on queued reports within an SLA, so that abusive behavior is handled promptly.
**Acceptance Criteria:**
**Given** a learner is participating in an active CohortSession
**When** they report another participant's message or behavior
**Then** a moderation report is created, queued for admin review, and the reported message/context is retained as evidence
**And** a facilitator flow or admin can immediately mute (block further chat from) or remove (end session access for) a participant, effective immediately for that session
**And** each queued report shows its age and is flagged as overdue once it exceeds the configured SLA window
**And** if the same participant accumulates multiple reports within a configurable window, the queue surfaces this as a repeat-offender pattern for admin prioritization
**And** a muted or removed participant's prior messages remain visible to others unless separately redacted by an admin

### Story 7.23: Attendance Floor Breach Offers Merge or Self-Paced Conversion — FR-G-19
As a cohort learner in a struggling cohort, I want to be offered a merge into another cohort or self-paced conversion when our attendance has been consistently too low, so that I'm not stuck in a group that isn't meeting.
**Acceptance Criteria:**
**Given** a Cohort's live attendance rate (excluding self-paced catch-up) falls below the configured attendance floor for 3 consecutive scheduled sessions
**When** the third consecutive breach is recorded
**Then** all current members are offered a choice between merging into a compatible cohort (matching cadence/level with available seats) or converting to self-paced with progress carryover
**And** if no compatible cohort is available to merge into, only the self-paced conversion option is offered
**And** a member who does not respond within a configurable window defaults to self-paced conversion so they are not left in limbo
**And** the 3-consecutive-session breach count resets to zero the first time attendance meets the floor again

## Epic 8: Leaderboards

Users can opt in to course and global leaderboards, ranked honestly on mastery + consistency, never raw time spent, with full self-hide control. Depends on Epic 5. This is where the leaderboard design risk noted in Epic 5 actually gets designed for — default-off, local-neighborhood ranking, cohort-first competition per the PRD's own §14 guidance.

### Story 8.1: Anti-Gaming Validation of Leaderboard Scoring Signals — FR-R-9
As a learner competing honestly, I want gamed or padded activity filtered out of leaderboard scoring, so that my genuine mastery and consistency aren't outranked by exploited shortcuts.
**Acceptance Criteria:**
**Given** a learner's assignment submissions, concept completions, and star-earning events are candidates for leaderboard scoring
**When** the leaderboard scoring pipeline evaluates that learner's events for a scoring window
**Then** only events that pass all anti-gaming checks — non-duplicate, at or above the configured minimum time-on-concept threshold, within rate limits, and from graded (not practice) mode — are marked leaderboard-eligible and contribute to the learner's score
**And** a concept completed faster than the configured minimum time-on-concept threshold is excluded from leaderboard scoring even though it still awards stars and updates mastery/progress normally
**And** when a learner resubmits the same assignment, only the single attempt already counted toward mastery (per FR-E-4's one-resubmission rule) is counted for leaderboard scoring — the superseded attempt is never double-counted
**And** a learner who exceeds the configured rate limit (more scoring-eligible events than plausible in elapsed time) has the excess events flagged and excluded from that scoring window, while the underlying star/mastery award is unaffected
**And** all practice-mode assignment submissions (FR-E-5) are excluded from leaderboard scoring regardless of score
**And** exclusion from leaderboard scoring is silent to the learner — it never appears as an error or penalty and never reduces their stars, streak, or badges, it only limits what counts toward rank

### Story 8.2: Mastery + Consistency Ranking Engine via Engagement Module API — FR-R-7
As a learner, I want my leaderboard rank to reflect my mastery, assignment scores, and consistency rather than how much time I spend, so that efficient learning is rewarded instead of penalized.
**Acceptance Criteria:**
**Given** a learner has leaderboard-eligible engagement events (per Story 8.1's validation) recorded as StarTransaction data owned by the engagement module
**When** the leaderboard ranking engine computes that learner's composite score for a course or global scope
**Then** the score is calculated as a weighted combination of mastery level, assignment score bands, and a consistency measure (streak length / active-day regularity), reading engagement data exclusively through the engagement module's public service API per AD-13/AD-14, never via a direct StarTransaction table read
**And** raw time-on-platform or session duration is never read, stored, or used as a scoring input anywhere in the computation, including as a tiebreaker
**And** two learners with identical mastery, assignment scores, and consistency but different total time spent receive the identical composite score and rank
**And** ties in composite score are broken by a documented, published rule (e.g., most recent mastery gain), never by time spent
**And** if the engagement module's public service API is unavailable, the ranking engine serves the learner's last successfully computed rank with a visible "last updated" timestamp rather than falling back to a direct table read

### Story 8.3: Opt-In Enrollment and Pseudonymous Display Name for Leaderboards — FR-R-6
As a learner, I want to explicitly opt in to leaderboards under a pseudonymous name, so that I only appear ranked if and how I choose to.
**Acceptance Criteria:**
**Given** a learner has never enabled leaderboard participation, so their FR-A-6 "share my scores on public leaderboards" setting is OFF by default
**When** the learner opens leaderboard settings and turns participation on for a specific catalog course, globally, or both
**Then** the system generates (or lets the learner pick from generated options) a pseudonymous display name that is never their real name or email, and this pseudonym — not their profile name — is what other learners see on any leaderboard
**And** the learner can independently opt in or out of the global leaderboard versus any individual catalog-course leaderboard — enabling one does not enable the other
**And** if the learner's account is flagged as a minor (NFR-16), the public/global leaderboard opt-in control is disabled with an explanatory message, consistent with minors being excluded from public leaderboards by default
**And** until the learner explicitly opts in, they never appear on any course or global leaderboard and no pseudonym is generated or shown
**And** the learner can regenerate their pseudonym at any time; the change takes effect on all leaderboards immediately with no history linking the old pseudonym to the new one exposed to other learners

### Story 8.4: Local-Neighborhood Course and Global Leaderboard Views — FR-R-6
As an opted-in learner, I want to see my standing among learners near my own rank rather than a global top-100 wall, so that leaderboards stay motivating instead of just showing me how far behind the top performers I am.
**Acceptance Criteria:**
**Given** a learner has opted in to a catalog-course and/or global leaderboard (Story 8.3) and has at least one leaderboard-eligible score (Story 8.2)
**When** the learner opens that leaderboard
**Then** the default view shows the learner's local neighborhood — a small window of ranks immediately above and below their own position — rather than a global top-100 list, with the learner's own row visually highlighted
**And** the learner's personal-best score/rank and current streak are displayed more prominently than their numeric rank, foregrounding "your best" and "current streak" ahead of "you are #N"
**And** the learner can toggle between a weekly view (resets on a fixed weekly boundary, scored on that week's activity only) and an all-time view (cumulative), with the toggle state persisted per leaderboard
**And** the learner can optionally expand to see the full top-of-leaderboard ranks, but this expanded top view is never the default landing state
**And** a learner with zero leaderboard-eligible events for the selected scope sees an empty/not-yet-ranked explanatory state, never a blank error or an implied last-place rank
**And** only pseudonyms of other opted-in learners are ever displayed; a learner who has not opted in for that scope never appears in any neighborhood, top list, or search on that leaderboard

### Story 8.5: Self-Hide from All Leaderboards Without Losing Stars or Badges — FR-R-10
As a learner, I want to hide myself from every leaderboard at any time, so that I can step back from competition without losing anything I've earned.
**Acceptance Criteria:**
**Given** a learner is currently opted in and visible on one or more course leaderboards and/or the global leaderboard
**When** the learner turns off leaderboard visibility from a single control in their privacy/leaderboard settings that applies everywhere, not per course
**Then** the learner is removed from all course leaderboards, the global leaderboard, and every neighborhood/top view within one refresh cycle, and no other learner can find or view their pseudonym or rank afterward
**And** the learner's stars, streaks, badges, and completion certificates remain completely unchanged — hiding affects only leaderboard visibility, never any earned record
**And** the learner's own private settings still show their last-known rank/personal-best to them alone, even though it is hidden from everyone else, until they choose to clear it
**And** if the learner later re-opts in, their leaderboard-eligible mastery/consistency history from before hiding still counts toward their score, but no notification or "welcome back" broadcast is shown to other learners
**And** hiding takes effect immediately regardless of whether it happens mid-week or mid-scoring-cycle; it is never delayed to the next weekly reset

### Story 8.6: Within-Cohort Leaderboard with Collective Goal — FR-R-8

*Note: this story additionally depends on Epic 7 (Group Learning — Cohorts) for the cohort-membership data it ranks against, on top of this epic's own Story 8.2 ranking engine — it is the only story in Epic 8 with that extra cross-epic dependency; every other story in this epic depends only on Epic 5.*

As a cohort member, I want a leaderboard visible only to my cohort with a shared group goal alongside individual ranks, so that competition stays small, familiar, and collaborative rather than facing the whole platform.
**Acceptance Criteria:**
**Given** a learner is an active, confirmed member of a formed cohort (Epic 7) and at least one member of that cohort has a leaderboard-eligible score (Story 8.2)
**When** any member of that cohort opens the cohort leaderboard
**Then** it shows individual ranks for cohort members using the same mastery + assignment score + consistency computation as Story 8.2, restricted to that cohort only — no cross-cohort or global data is shown
**And** it displays a collective cohort goal (e.g., aggregate/average mastery or completion percentage toward a published target) alongside the individual ranks, updated as members progress
**And** a learner who has hidden from leaderboards (Story 8.5) does not appear on their cohort's individual-rank list either — the hide control is honored consistently across course, global, and cohort scopes per FR-R-10's "all leaderboards" requirement — though their mastery still contributes to the cohort's aggregate collective-goal number, since that is a group metric rather than an individual rank exposure
**And** a learner who leaves or is removed from the cohort (FR-G-18 moderation) is removed from that cohort's leaderboard and collective-goal calculation immediately and does not appear on it retroactively in historical views
**And** the cohort leaderboard is visible only to confirmed members of that specific cohort — no other learner, including members of a different cohort in the same course, can view it
**And** a cohort with no members yet holding a leaderboard-eligible score shows an explanatory not-yet-ranked state for individual ranks while still displaying the collective goal at 0% progress, rather than an error

## Epic 9: Back Office & Analytics

Internal staff (Content-Ops, Admin/Moderation personas — both map to the "Admin" RBAC role) can author/QA courses, moderate reports, administer users, and see funnel/heatmap/AI-quality analytics. Mixed readiness inside one epic: authoring/moderation/user-admin stories are buildable early in parallel with other epics; the analytics dashboards need other epics' events flowing first — each story below carries its own explicit Sequencing note.

### Story 9.1: Course hierarchy builder — FR-O-1
Sequencing: buildable now (parallel to other epics)

*Fixed during Implementation Readiness review: this story's delete rule ("blocks the deletion") directly conflicted with Epic 2 Story 2.1's rule for the same Course/Module/Topic/Concept entities (archive with dangling-reference flagging). Epic 2 Story 2.1 is the entity/CRUD owner per AD-14 (courses module); this story is the authoring console UI on top of that same rule, not a second, competing implementation of it.*

As a Content-Ops admin, I want to create and organize a Course's Module→Topic→Concept hierarchy in an authoring console, so that I can structure real catalog content beyond the Epic-1 hardcoded course.
**Acceptance Criteria:**
**Given** I am an authenticated Admin-role user on the course authoring console
**When** I create a new Course and add Modules, Topics, and Concepts beneath it in nested order
**Then** the hierarchy is persisted via Epic 2 Story 2.1's courses-module service API with parent-child links, and rendered as an editable tree with each node in "draft" status
**And** I can reorder siblings via drag-or-move and the new order persists on reload

**Given** a Module that has one or more Topics beneath it
**When** I attempt to delete that Module
**Then** the console shows a confirmation naming the dependent Topics/Concepts that will be archived (not blocked) — consistent with Story 2.1's rule — and on confirmation calls that same service API rather than implementing a separate delete path
**And** no orphaned Topic or Concept records are created, and any dangling prerequisite reference into the archived subtree is flagged, exactly as Story 2.1 specifies

### Story 9.2: Attach source materials to hierarchy nodes — FR-O-1
Sequencing: buildable now (parallel to other epics)
As a Content-Ops admin, I want to attach source materials (documents, links, media) to a Topic or Concept, so that Beat generation and learner-facing references have grounded source content.
**Acceptance Criteria:**
**Given** an existing Topic or Concept in draft status
**When** I upload a file or add a link as a material and save
**Then** the material is stored, associated with that node, and listed with filename/type/size and uploaded-by/date
**And** I can remove a material, which detaches it from the node without deleting sibling materials

**Given** I attempt to upload a file exceeding the configured size limit or an unsupported file type
**When** I submit the upload
**Then** the system rejects it with a specific error naming the limit or allowed types
**And** no partial material record is created

### Story 9.3: Define objectives, prerequisites, and checkpoints — FR-O-1
Sequencing: buildable now (parallel to other epics)
As a Content-Ops admin, I want to define learning objectives, prerequisite links, and checkpoints on a hierarchy node, so that authored content carries the structure the learning engine needs to sequence and assess learners.
**Acceptance Criteria:**
**Given** an existing Topic or Concept
**When** I add one or more learning objectives and mark another Concept in the same Course as a prerequisite
**Then** the objectives and prerequisite link are saved and shown on the node's detail view
**And** the prerequisite selector only offers Concepts that already exist in the Course, excluding the node itself

**Given** a Concept with no checkpoint defined
**When** I define a checkpoint (question/pass-criteria) for it
**Then** the checkpoint is saved and the Concept is flagged as "checkpoint-ready"
**And** attempting to select a prerequisite that would create a circular dependency (A requires B, B requires A) is rejected with an explanatory error

### Story 9.4: Pre-generate and review AI Beats — FR-O-1
Sequencing: buildable now (parallel to other epics)
As a Content-Ops admin, I want to trigger AI generation of candidate Beats for a Concept and review them before they're eligible for publishing, so that learners never see unreviewed AI content.
**Acceptance Criteria:**
**Given** a Concept that has objectives and at least one attached material
**When** I trigger "pre-generate Beats"
**Then** the system produces a set of candidate Beats tied to that Concept's materials, each in "pending review" status
**And** each candidate Beat shows which source material(s) it was grounded in

**Given** a Concept with no attached materials
**When** I attempt to trigger "pre-generate Beats"
**Then** the action is blocked with a message that materials are required first
**And** reviewing a candidate Beat lets me approve, edit inline, or reject it, with rejected Beats excluded from any published version

### Story 9.5: Content QA review workflow — FR-O-2
Sequencing: buildable now (parallel to other epics)
As a Content-Ops admin, I want draft content to move through a draft → internal review → published workflow with explicit reviewer sign-off, so that only vetted content reaches learners.
**Acceptance Criteria:**
**Given** a Course/Module/Topic/Concept in "draft" status with all required fields (objectives, at least one approved Beat) complete
**When** I submit it for internal review
**Then** its status changes to "in review" and it becomes visible in a reviewer queue with the submitting author noted
**And** the original author cannot also approve their own submission for publish

**Given** an item in "in review" status
**When** a second Admin user approves it
**Then** its status changes to "published" and it becomes eligible for learner-facing surfacing
**And** if the reviewer instead rejects it with comments, the status reverts to "draft" and the comments are attached and visible to the author

### Story 9.6: Content version history and rollback — FR-O-2
Sequencing: buildable now (parallel to other epics)
As a Content-Ops admin, I want every publish of a Course-hierarchy node to be versioned with the ability to roll back, so that a bad publish can be reverted without losing prior authoring work.
**Acceptance Criteria:**
**Given** a node that has been published two or more times
**When** I open its version history
**Then** I see a chronological list of versions with publish timestamp, publishing Admin, and a diff-viewable snapshot of content
**And** the currently-live version is clearly marked

**Given** a node with a prior published version
**When** I select "rollback to this version"
**Then** that version's content becomes the live published version immediately, a new version-history entry records the rollback and who performed it
**And** rollback is unavailable for a node that has only ever had one published version, with the control disabled rather than erroring

### Story 9.7: Cohort admin console — FR-O-3
Sequencing: blocked on: Epic 7's cohort entities
As an Admin, I want to view a cohort's waiting list and force-form, cancel, or reschedule its sessions, so that I can intervene when a cohort under- or over-fills or a scheduling conflict arises.
**Acceptance Criteria:**
**Given** a cohort below its minimum enrollment threshold with learners on its waiting list
**When** I select "force-form cohort"
**Then** the cohort transitions to "forming" using currently enrolled/waitlisted learners and each affected learner is notified
**And** the waiting-list view updates to reflect the now-enrolled learners

**Given** a scheduled cohort session
**When** I reschedule it to a new date/time or cancel it
**Then** the change is persisted, all enrolled learners are notified of the new time or cancellation
**And** attempting to reschedule a session that has already completed is blocked with an explanatory error

### Story 9.8: Flagged uploads and copyright moderation — FR-O-4
Sequencing: buildable now (parallel to other epics)
As an Admin, I want a moderation queue for flagged uploads and copyright takedown requests, so that inappropriate or infringing material submitted through Epic 2's upload flows can be reviewed and removed.
**Acceptance Criteria:**
**Given** a learner upload has been auto-flagged or a copyright takedown request has been filed against a piece of content
**When** I open the moderation queue
**Then** I see the item with its flag/takedown reason, the associated content, and the submitting user
**And** items are sortable by age and filterable by type (flagged upload vs. copyright)

**Given** an item in the moderation queue
**When** I resolve it as "remove" or "dismiss"
**Then** removal deletes/hides the content and notifies the affected user with a reason, dismissal keeps the content live and closes the queue item
**And** each resolution records the acting Admin and timestamp for audit purposes

### Story 9.9: Grading-appeal and low-confidence grading moderation — FR-O-4
Sequencing: blocked on: Epic 6's grading events
As an Admin, I want a queue of low-confidence AI gradings and learner-submitted grade appeals, so that borderline or disputed grades get human review before they stand.
**Acceptance Criteria:**
**Given** a graded submission whose AI confidence score fell below the review threshold, or a learner has filed an appeal on their grade
**When** I open the moderation queue
**Then** I see the submission, the AI's grade and rationale, and (for appeals) the learner's stated reason
**And** low-confidence items and appeals are visually distinguishable within the same queue

**Given** a queued item
**When** I uphold or override the AI's grade
**Then** the final grade is recorded with the acting Admin noted, the learner is notified of the outcome
**And** overriding a grade after the related course/cohort has been marked archived is blocked with an explanatory error

### Story 9.10: Abuse-report moderation — FR-O-4
Sequencing: blocked on: Epic 7's chat events
As an Admin, I want a queue of learner-submitted abuse reports from cohort chat, so that harassment or policy-violating messages can be reviewed and actioned.
**Acceptance Criteria:**
**Given** a learner has reported a chat message as abusive
**When** I open the moderation queue
**Then** I see the reported message, its author, the reporter, and surrounding context messages
**And** the reported message remains visible to other cohort members unless I take action

**Given** a reported message
**When** I resolve it as "remove message," "warn user," or "dismiss"
**Then** removal hides the message from the cohort chat and logs the action, warn/dismiss update the queue item's status without hiding the message
**And** resolving the same report twice is prevented — the queue item is locked to "resolved" after the first resolution

### Story 9.11: User search and profile view — FR-O-5
Sequencing: buildable now (parallel to other epics)
As an Admin, I want to search for a user and view their account state, so that I can answer support inquiries and locate the right account before taking any administrative action.
**Acceptance Criteria:**
**Given** the user admin console
**When** I search by email, name, or user ID
**Then** matching users are listed with name, email, account status (active/suspended/deleted), and signup date
**And** selecting a user shows their detail view including plan/subscription status and last-login date

**Given** a search query that matches no users
**When** I submit the search
**Then** the console shows a clear "no results" state rather than an empty table
**And** searching by a partial email still returns matching results (substring match)

### Story 9.12: User account actions — reset, suspend, delete — FR-O-5
Sequencing: buildable now (parallel to other epics)

*Fixed during Implementation Readiness review: refund was originally bundled into this story and tagged "buildable now," but refund requires payment/billing infrastructure that the architecture spine explicitly defers pending OQ-1 (monetisation model) — it cannot be built or tested today. Split out to Story 9.19.*

As an Admin, I want to reset a user's password, suspend, or delete their account, so that I can resolve account issues and honor user requests without engineering involvement.
**Acceptance Criteria:**
**Given** a user's detail view
**When** I trigger a password reset
**Then** a reset link/token is issued to the user's registered email and the action is logged with the acting Admin and timestamp

**Given** an active user's detail view
**When** I suspend the account
**Then** the user is immediately unable to log in, sees a suspension message on attempted login, and the suspension reason is recorded
**And** when I instead select "delete on request," the system requires a confirmation step before permanently deleting the account and its personal data, and a deleted account cannot be un-deleted from this console

### Story 9.13: Signup-to-completion funnel and retention cohorts — FR-O-6
Sequencing: blocked on: Epic 1 through 4's learner-journey events
As an Admin, I want a dashboard showing the signup-to-completion funnel and retention by signup cohort, so that I can see where learners drop off across the full journey and how retention trends over time.
**Acceptance Criteria:**
**Given** learners have signed up and progressed through onboarding, active learning, and course completion (per Epic 1-4 events)
**When** I open the funnel dashboard for a date range
**Then** I see stage-by-stage counts and conversion rates (signup → onboarded → first-session → completion)
**And** I can filter the funnel by course

**Given** the retention cohort view
**When** I select a signup week/month cohort
**Then** I see that cohort's retention percentage at each subsequent period (e.g., week 1, week 2, week 4)
**And** a cohort period with fewer than a configured minimum sample size is flagged as low-confidence rather than shown as a bare percentage

### Story 9.14: Session telemetry and control-usage dashboard — FR-O-6
Sequencing: blocked on: Epic 1 through 4's learner-journey events
As an Admin, I want a dashboard of session telemetry and Board control usage, so that I can see how actively and in what ways learners are using the product.
**Acceptance Criteria:**
**Given** learners have run study sessions on the Board
**When** I open the session telemetry dashboard for a date range
**Then** I see aggregate metrics: session count, average session duration, and sessions per active learner
**And** I can break the view down by day within the selected range

**Given** the same dashboard
**When** I view the control-usage panel
**Then** I see usage counts per Board control type (e.g., pause, replay, simpler-explanation) across the selected range
**And** selecting a date range with no sessions shows an explicit empty state rather than a zeroed chart that looks like real data

### Story 9.15: Drop-off points by concept — FR-O-6
Sequencing: blocked on: Epic 1 through 4's learner-journey events
As an Admin, I want to see where in the concept sequence learners most often stop or abandon a session, so that I can identify structurally weak points in the course content.
**Acceptance Criteria:**
**Given** learners have progressed through a Course's Concept sequence with some sessions ending before completion
**When** I open the drop-off report for that Course
**Then** I see each Concept with its drop-off rate (sessions that ended at that Concept without advancing) ordered from highest to lowest
**And** I can drill into a Concept to see the count of sessions that dropped off there

**Given** a Concept with zero recorded sessions
**When** it appears in the drop-off report
**Then** it is shown with an explicit "no data" indicator rather than a 0% drop-off rate, so it isn't misread as a strong concept

### Story 9.16: Concept difficulty heatmap — FR-O-7
Sequencing: blocked on: Epic 3's Board session events
As an Admin, I want a heatmap of per-Concept difficulty signals (pauses, replays, simpler-explanation requests, checkpoint failures), so that I can prioritize which content needs authoring attention.
**Acceptance Criteria:**
**Given** the Board has emitted pause, replay, simpler-explanation-request, and checkpoint-failure events tied to Concepts
**When** I open the difficulty heatmap for a Course
**Then** each Concept is shown as a cell colored by a composite difficulty score, with the four underlying signal counts visible on hover/click
**And** Concepts are sortable by any single signal or by the composite score

**Given** a Concept with very few sessions (below a configured minimum sample size)
**When** it appears on the heatmap
**Then** it is marked as low-confidence/insufficient-data rather than colored as if it were a reliable high- or low-difficulty result

### Story 9.17: AI quality dashboard — FR-O-8
Sequencing: blocked on: Epic 3's generation events and Epic 6's grading events
As an Admin, I want a dashboard of AI quality metrics — hallucination flags, source-grounding rate, grading agreement rate, thumbs-down rate, and cost per learner-hour — so that I can monitor whether the AI tutor and grader are performing safely and cost-effectively.
**Acceptance Criteria:**
**Given** Epic 3 has emitted Beat-generation events (including grounding/hallucination-flag data) and Epic 6 has emitted grading events
**When** I open the AI quality dashboard for a date range
**Then** I see hallucination-flag count, source-grounding rate, grading agreement rate (AI vs. human-reviewed grades), and thumbs-down rate, each as a trend over the selected range
**And** each metric can be filtered by Course

**Given** the same dashboard
**When** I view the cost panel
**Then** I see cost per learner-hour computed from generation/grading spend divided by tracked learner session time
**And** a date range with no qualifying generation or grading events shows an explicit "insufficient data" state for that panel rather than a misleading zero

### Story 9.18: In-session thumbs up/down feedback — FR-O-9
Sequencing: blocked on: Epic 3's Beat UI existing
As a learner, I want to give thumbs up/down feedback with an optional reason on any Beat or explanation, so that I can flag content quality issues as I encounter them.
**Acceptance Criteria:**
**Given** I am viewing a Beat or explanation on the Board
**When** I tap thumbs up or thumbs down
**Then** the feedback is recorded against that specific Beat, the learner, and the session, with a visual confirmation shown
**And** I can optionally add a short reason before or after submitting the thumbs-down, without it being required to submit

**Given** I have already submitted feedback on a given Beat in the current session
**When** I tap the opposite thumb
**Then** the feedback record updates to the new value rather than creating a duplicate entry
**And** thumbs-down events with their reasons are made available to the FR-O-7 heatmap and FR-O-8 AI quality dashboard as an input signal

### Story 9.19: Issue Refunds — FR-O-5

Sequencing: blocked on: OQ-1 (monetisation model / billing infrastructure) — added during Implementation Readiness review, split out of Story 9.12 where it was incorrectly tagged "buildable now"

*Refund cannot be built or tested until a payment/billing system exists, which the architecture spine explicitly defers pending OQ-1. This story exists as a placeholder so FR-O-5's refund requirement isn't lost, not as work to schedule yet.*

As an Admin, I want to issue a refund to a user, so that I can resolve billing disputes without engineering involvement.

**Acceptance Criteria:**
**Given** OQ-1 has been resolved and a billing/payment system exists
**When** an Admin selects "issue refund" on a user's detail view
**Then** the refund is processed through that billing system, the amount and reason are logged with the acting Admin and timestamp, and the user is notified

**Given** OQ-1 is not yet resolved
**Then** this story is not started — no partial or stubbed refund UI ships ahead of real billing infrastructure existing
