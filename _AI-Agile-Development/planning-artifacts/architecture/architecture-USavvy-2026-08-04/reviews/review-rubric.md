---
name: 'Usavvy Architecture Spine — Rubric Review'
type: review
target: '_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md'
driving-input: 'Doc/00-Requirement.md'
reviewer-lens: 'good-spine checklist (BMad architecture skill reviewer gate)'
date: '2026-08-04'
---

# Review: ARCHITECTURE-SPINE.md (Usavvy, initiative altitude)

## Overall verdict

This is a solidly-constructed spine — the 13 ADs are almost all genuinely load-bearing (they cite a specific PRD divergence risk, not a generic best practice), AD-10's Session/ScheduledSession/CohortSession disambiguation and AD-2/AD-3's "enforce once, at the port" pattern are the standout moves, and the Deferred list is honest about what a pre-funding, pre-provider-choice initiative genuinely cannot decide yet. It is not, however, tight enough to sign off as-is: two Deferred items actively contradict requirements the spine itself is supposed to be satisfying (NFR-3's launch-scale horizontal-scaling requirement is waved off by a "later" Redis decision, and NFR-18 rate-limiting is handed to per-epic spines despite AD-2 existing specifically to stop that kind of per-caller divergence for the identical port); one whole external-integration class (notifications/email) and one whole cross-cutting infrastructure class (async job processing, which the PRD's own indicative architecture calls out by name for ingestion) are missing entirely, not even flagged as Deferred; and several boundary-enforcing Rules (port-only imports, no-hardcoded-strings, module boundaries) assert a rule with no enforcement mechanism, right next to an AD (AD-9) that establishes mechanical enforcement is exactly what this team expects for rules of this kind. None of this requires a rewrite — most fixes are one or two sentences added to an existing AD or the Deferred list — but they should be closed before this spine is used to drive epic-altitude work, because the cost of an unenforced boundary rule or a silently-contradicted NFR compounds every story built on top of it.

## Findings

### 1. [HIGH] Deferred realtime fan-out contradicts NFR-3's launch-scale requirement
- **Section:** AD-5 (Realtime transport is WebSocket-only) / Deferred → "Redis pub/sub for multi-instance realtime fan-out"
- **What's wrong:** NFR-3 states "Support 5,000 concurrent self-paced sessions and 50 concurrent cohort sessions **at launch scale**; architecture must scale horizontally to 10×." That is an explicit launch requirement. AD-5 mandates single-instance in-memory pub/sub and defers the Redis adapter — the only sanctioned path to multi-instance fan-out — with the stated rationale "sufficient until NFR-3's concurrency targets are a real, not theoretical, constraint." But NFR-3's targets are not theoretical; they are the stated launch target, including horizontal scalability. As written, the Deferred rationale is factually inconsistent with the NFR it references.
- **Suggested fix:** Either (a) make an explicit, justified call that a single WebSocket-serving instance can meet 5,000 concurrent sessions at launch and that "horizontal to 10×" is a post-launch commitment (state this openly, don't leave it implicit in a "later" deferral), or (b) pull the Redis pub/sub adapter decision into a committed AD before this spine is used to plan launch-scope stories, since AD-5's own design already names it as the only sanctioned path.

### 2. [HIGH] NFR-18 rate-limiting ownership contradicts AD-2's own choke-point principle
- **Section:** Deferred → "Rate-limiting/abuse-protection implementation detail (NFR-18)" / AD-2 (Generation caching and tiered routing are GenerationPort responsibilities)
- **What's wrong:** AD-2 exists precisely so that a cross-cutting GenerationPort concern (caching, routing) is "enforced once, at the port, not per-caller," explicitly to prevent divergence between board-orchestration, ingestion, and assignments. NFR-18 rate-limiting/abuse-protection on generation endpoints is the same class of concern — but the Deferred section assigns its ownership to "whichever epic-altitude spine covers the generation endpoints," which invites exactly the divergence AD-2 was written to prevent: if Board's epic spine and a future Assignments epic spine each independently design throttling for the same GenerationPort, two callers diverge incompatibly on a port this spine already owns.
- **Suggested fix:** Extend AD-2 (or AD-3, which already owns another GenerationPort/VoicePort cross-cutting concern — safety) to state that rate-limiting/abuse-protection is also enforced at the port, leaving only the specific thresholds/algorithm — not the ownership — to epic-altitude tuning against the NFR-24 "generous ceiling" constraint already noted.

### 3. [MEDIUM-HIGH] AD-1's "every external integration boundary" claim omits Notification/Email entirely
- **Section:** AD-1 (Modular layering + hexagonal ports-and-adapters) / Design Paradigm
- **What's wrong:** The Design Paradigm states hexagonal ports-and-adapters apply "at every external integration boundary," and AD-1 lists GenerationPort/VoicePort/VectorStorePort/StoragePort. Email/notification delivery is a real external vendor boundary crossing at least three modules — FR-A-1 (email verification), FR-A-7 (deletion confirmation email), FR-P-9 (email/in-app reminders) — with the identical vendor-swap and duplication risk AD-1 names for LLM/TTS/ASR/storage. It is not in the port list, the Stack table, or the Deferred list — it simply doesn't exist in the spine, so nothing stops auth, plans-progress, and engagement each wiring a different email provider/SDK directly.
- **Suggested fix:** Add a `NotificationPort` (or `EmailPort`) to AD-1's port list with a `mock`/dev adapter, matching the pattern already used for generation/voice; or, if intentionally out of scope for this pass, add it to Deferred with rationale so the gap is visible rather than silent.

### 4. [MEDIUM] Async job/queue processing is undecided and unmentioned anywhere in the spine
- **Section:** Stack / Structural Seed / shared-kernel
- **What's wrong:** The PRD's own indicative architecture (§19) names an explicit requirement: "Ingestion | Async pipeline with a job queue: parse → OCR → structure → chunk → embed → outline." Assignments' long-form grading (FR-E-13, up to 10 minutes) and catalog Beat pre-generation caching (R3, BA recommendation) plausibly need the same. The spine's Stack table lists no queue technology, and shared-kernel names only `config, logging, db, event-bus` — an event bus for past-tense domain events (per Consistency Conventions), not a durable job queue with retry/DLQ semantics. Nothing in AD-1..13 or Deferred addresses this, so ingestion and a future assignments-evaluation pipeline are free to invent incompatible async patterns (DB-polling vs. ad hoc timers vs. a real queue).
- **Suggested fix:** Add an AD (or at minimum a Deferred entry naming the gap and a placeholder direction, e.g. "async job pattern — Postgres-backed job table + worker convention vs. a queue library — not yet chosen") so ingestion and assignments build against a shared contract rather than independently.

### 5. [MEDIUM] Boundary-enforcing Rules lack a stated enforcement mechanism, unlike the precedent AD-9 sets
- **Section:** AD-1 (port-only imports), AD-4 (no hardcoded strings), AD-13 (module boundaries) — contrast with AD-9 (No dead code, enforced mechanically)
- **What's wrong:** AD-9 explicitly earns its name by pairing a rule with a mechanism: TypeScript strict mode, ESLint rules as build-breaking errors, a Husky pre-commit hook, backed up by code review. AD-1 ("never imported directly by a feature module"), AD-4 ("no module concatenates or hardcodes a user-facing string inline"), and AD-13 ("never a direct import of another module's internal path") state comparably important cross-cutting rules with no mechanism at all — no lint rule (e.g. `eslint-plugin-boundaries`, `import/no-restricted-paths`, an i18n string-literal lint), just prose. AD-9's own stated rationale for mechanical enforcement — "accumulating silently" — applies with equal force to a stray adapter import or a hardcoded string, both of which are easy to miss in review and would only surface much later (a failed vendor swap, a blocked i18n rollout).
- **Suggested fix:** Either fold AD-1/AD-4/AD-13 enforcement into the same Husky/ESLint pipeline AD-9 sets up (a boundaries plugin config, an i18n lint rule) or state explicitly that these are review-time-only rules if that's a deliberate, accepted trade-off.

### 6. [MEDIUM] MVP-scope Epic 8 analytics has no data-path decision
- **Section:** Deferred → "Observability/APM tooling" / ER diagram (SESSION_EVENT)
- **What's wrong:** Epic 8 ships in Release 1/MVP per PRD §7, and its MUST requirements — FR-O-6 (funnel/retention/session telemetry), FR-O-7 (concept-difficulty heatmap), FR-O-8 (AI quality dashboard), FR-O-9 (thumbs feedback routing) — need somewhere to read aggregated event data from. The PRD's own §19 names a separate "analytics warehouse" as a layer; the spine's ER diagram includes a `SESSION_EVENT` entity (implying operational-Postgres querying instead) but never states this as a decision. The only analytics-adjacent Deferred entry is scoped narrowly to "NFR-22's cost-per-learner-hour dashboard," not the broader MVP-scope Epic 8 requirements — so a launch-blocking data-infrastructure question is effectively silent.
- **Suggested fix:** State the decision explicitly (e.g., "MVP analytics query the operational store directly via SESSION_EVENT/CONCEPT_PROGRESS; a dedicated warehouse is Deferred, revisit at [trigger]") or broaden the existing Deferred entry to cover FR-O-6/7/8/9, not just NFR-22.

### 7. [LOW] Monetization/payment integration has zero footprint, not even under Deferred
- **Section:** Deferred (absence)
- **What's wrong:** OQ-1 (monetization model) is explicitly unresolved in the PRD and blocks "before UX design," and ties directly to NFR-24's fair-use ceiling design. Given it's genuinely unresolved upstream, silence in the spine may be defensible for now — but per the reviewer gate's own instruction, a structural dimension left completely silent (not even acknowledged as blocked) reads as an oversight rather than a deliberate call.
- **Suggested fix:** Add one line to Deferred: "Payment/billing integration — blocked on OQ-1 (monetisation model); no port or vendor chosen."

### 8. [LOW] Stack versions look roughly one release cycle behind the spine's own dated context — qualitative flag only
- **Section:** Stack table
- **What's wrong:** As of the spine's stated date (2026-08-04): Node 22 LTS became Active LTS in Oct 2024 and would typically be superseded by Node 24 as Active LTS around Oct 2025; PostgreSQL 17.x shipped Sept 2024 and PG18 would typically ship ~Sept 2025. Neither is a functional defect, but both are plausibly one major behind "current" by the review date. Flagged qualitatively per instructions — a dedicated version-check reviewer should confirm and, if warranted, bump these.
- **Suggested fix:** N/A — pass to the deep version-check reviewer.

### 9. [LOW] AD-6's Binds list omits AssignmentSubmission file uploads
- **Section:** AD-6 (Object storage behind a StoragePort)
- **What's wrong:** AD-6 binds "UploadedDocument, board exports, session recordings" but not the FR-E-4 assignment-submission file uploads (≤25MB drag-drop), which are the same StoragePort concern. The Rule itself ("all file reads/writes go through StoragePort") would presumably still apply, but a developer skimming only the Binds field for "does this AD apply to me" could miss it.
- **Suggested fix:** Add "assignment submissions" to AD-6's Binds list.

### 10. [LOW] RBAC role list doesn't map explicitly to PRD personas P5/P6
- **Section:** AD-7 (RBAC module) / PRD §4 personas P5 (Content Ops), P6 (Admin/Moderation)
- **What's wrong:** AD-7 fixes the role set as SuperAdmin/Admin/Mentor/Student. The PRD names two distinct internal personas — Content Ops (curriculum authoring, FR-O-1) and Admin/Moderation (trust & safety, FR-O-4/5) — that presumably both fold under "Admin," but the spine never says so. Low risk since AD-7's `can(user, action, resource)` guard plus config-seeded permission matrix already gives a clean extension point if these personas turn out to need distinct permission tiers.
- **Suggested fix:** One-line note confirming Content Ops and Admin/Moderation share the `Admin` role (or split them now if their permission sets are expected to diverge materially).
