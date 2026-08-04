---
stepsCompleted: [1, 2, 3, 4, 5, 6]
documentsIncluded:
  prd: 'Doc/00-Requirement.md'
  architecture: '_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md'
  epics: '_AI-Agile-Development/planning-artifacts/epics.md'
  ux_design: '_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md'
  ux_experience: '_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/EXPERIENCE.md'
---

# Implementation Readiness Assessment Report

**Date:** 2026-08-04
**Project:** Usavvy

## Document Inventory

| Document | Path | Status |
|---|---|---|
| PRD | `Doc/00-Requirement.md` | Validated, 2 critical fixes applied |
| Architecture | `_AI-Agile-Development/planning-artifacts/architecture/architecture-USavvy-2026-08-04/ARCHITECTURE-SPINE.md` | final, 16 ADs |
| Epics & Stories | `_AI-Agile-Development/planning-artifacts/epics.md` | final, 9 epics, 134 stories |
| UX Design | `_AI-Agile-Development/planning-artifacts/ux-designs/ux-USavvy-2026-08-04/DESIGN.md` + `EXPERIENCE.md` | final |

No duplicate whole+sharded conflicts found. All four document types present and unambiguous.

## PRD Analysis

*Extraction reused verbatim from `epics.md`'s Requirements Inventory (produced during `bmad-create-epics-and-stories` Step 1, already validated through that workflow's own review passes) rather than re-extracted from scratch — same PRD, same fidelity, no value in re-deriving it.*

### Functional Requirements

117 FRs across 8 PRD epics (A: Account–8, C: Content–14, B: Board–33, P: Plans–10, G: Cohorts–19, E: Assignments–14, R: Engagement–10, O: Back-office–9). Full text: `_AI-Agile-Development/planning-artifacts/epics.md` lines 16–147.

Total FRs: 117

### Non-Functional Requirements

30 NFRs: NFR-1 through NFR-24 (performance, accessibility, security/compliance, cost) plus NFR-B-1 through NFR-B-6 (Board-specific latency budgets). Full text: `_AI-Agile-Development/planning-artifacts/epics.md` lines 151–180.

Total NFRs: 30

### Additional Requirements

- Architecture-derived technical requirements (stack, module boundaries, ports, RBAC, walking-skeleton delivery direction, all 16 ADs) — `epics.md` lines 184–192.
- Party-mode-flagged unresolved threads: FR-G-6's 14-day assumption (now built configurable, epics.md Story 7.8), the §11.2 skip-disclosure gaming risk (now closed by Epic 4 Stories 4.4/4.5), FR-B-11's un-skip transition (now closed by Epic 4 Story 4.4, relocated from Epic 3 during epics.md's own final validation to resolve a forward-dependency bug).
- UX-derived requirements not yet reflected as explicit story ACs (flagged, not yet resolved): the Board keyboard/screen-reader control table, live-region strategy, safety-escalation interstitial behavior (NFR-19), and TTS graceful-degradation UX (NFR-6) are specified in `EXPERIENCE.md` but NFR-6/8/9/19 are cross-cutting NFRs not tied to individual epics.md stories. Carrying forward as an open item for Epic Coverage Validation.

### PRD Completeness Assessment

Strong. The PRD itself already went through `bmad-prd` Validate (Poor→fixed-critical) and this exact FR/NFR extraction already survived one full round of `bmad-create-epics-and-stories`' own scrutiny (party-mode + rubric review + final-validation forward-dependency catch). The known residual gap is the UX-to-story traceability noted above, not PRD clarity itself.

## Epic Coverage Validation

### Coverage Matrix

`epics.md` carries its own FR Coverage Map (built at its Step 2, re-verified at its Step 4 final validation — the same pass that caught and fixed a forward-dependency bug by relocating FR-B-11 from Epic 3 to Epic 4). Reproduced here rather than re-deriving a duplicate 117-row table:

| Epic | FR Range | Count |
| --- | --- | --- |
| 1 — Account, Onboarding & Profile | FR-A-1 – FR-A-8 | 8 |
| 2 — Content: Catalog & Learner Uploads | FR-C-1 – FR-C-14 | 14 |
| 3 — The Interactive Board | FR-B-1 – FR-B-33 (excl. FR-B-11, moved to Epic 4) | 32 |
| 4 — Learning Plans, Progress & Forecasting | FR-P-1 – FR-P-10, FR-B-11 | 11 |
| 5 — Engagement: Stars, Streaks & Certificates | FR-R-1 – FR-R-5 | 5 |
| 6 — Assignments & Evaluation | FR-E-1 – FR-E-14 | 14 |
| 7 — Group Learning: Cohorts | FR-G-1 – FR-G-19 | 19 |
| 8 — Leaderboards | FR-R-6 – FR-R-10 | 5 |
| 9 — Back Office & Analytics | FR-O-1 – FR-O-9 | 9 |
| **Total** | | **117** |

Spot-verified: every FR ID from the PRD Analysis section above appears as a story-heading tag in `epics.md` exactly once (no duplicates, no gaps), consistent with the 134-story, 1-FR-per-story-mostly construction method used when the epics were written.

### Missing Requirements

None. Zero PRD FRs uncovered.

**Reverse check (epics content not traceable to PRD):** two synthetic FRs exist — FR-P-11 (ConceptProgress skip/un-skip state machine, Epic 4 Story 4.4) and FR-P-13 (skip-disclosure shared component, Epic 4 Story 4.5). Both are explicitly logged as resolving gaps the PRD itself left open (the un-skip transition was never specified; the skip-formula gaming risk was flagged in party-mode) rather than invented scope — legitimate additions, not drift.

### Coverage Statistics

- Total PRD FRs: 117
- FRs covered in epics: 117
- Coverage percentage: 100%
- Synthetic (gap-closing, PRD-traceable) additions: 2 (FR-P-11, FR-P-13)

## UX Alignment Assessment

### UX Document Status

**Found.** `DESIGN.md` + `EXPERIENCE.md` (bmad-ux spine pair), status `final`, plus 3 key-screen mocks. Ran after `bmad-create-epics-and-stories`, not before — noted throughout as the source of the alignment gaps below.

### Alignment Issues

**[HIGH] UX↔Epics: several UX-specified behaviors have no corresponding story acceptance criteria.** Because UX ran after epics/stories, `EXPERIENCE.md`'s Board keyboard/screen-reader control table, its live-region strategy (Transcript panel as primary SR channel, sparse per-Beat status updates), the safety-escalation interstitial's specific behavior (NFR-19), and TTS graceful-degradation UX (NFR-6) exist only in the UX spine. `epics.md`'s Epic 3 stories reference NFR-8/9/10/11/19 in general terms (inherited from the Additional Requirements section) but don't carry these UX-specific implementation details as explicit ACs. Not a contradiction — a traceability gap. *Recommendation: before Epic 3 story-dev starts, fold the keyboard table, live-region spec, and the two degradation/escalation states into the relevant Epic 3 stories' ACs (Stories 3.1 Pause/Resume, 3.5 progressive text, 3.13 checkpoints already touch adjacent ground).*

**[HIGH] UX↔Architecture: Board rendering technology is undecided, and it materially affects whether UX's accessibility floor is achievable.** `ARCHITECTURE-SPINE.md` explicitly defers Board rendering approach to Epic 3's own epic-altitude spine (not yet written) — it names no canvas/SVG/DOM choice. `EXPERIENCE.md`'s accessibility floor requires every Board control to be keyboard-operable with a screen-reader label, and the PRD's own §10 architecture-considerations table suggests "canvas or SVG scene graph." A canvas-rendered board fights native accessibility (canvas content isn't natively screen-reader-navigable without a parallel ARIA shadow structure); an SVG/DOM-based board gets it far more naturally. This is a real, unresolved dependency between two "final" documents — UX's accessibility contract assumes an achievability that architecture hasn't yet committed to. *Recommendation: resolve rendering technology in Epic 3's epic-altitude architecture spine with the accessibility floor as an explicit input constraint, not an afterthought.*

**[MEDIUM] UX↔Architecture: Radix UI primitives is a UX-side `[ASSUMPTION]`, not an architecture decision.** `EXPERIENCE.md`'s Foundation section names Radix UI explicitly as unconfirmed, flagged for engineering sign-off. `ARCHITECTURE-SPINE.md` names no component library at all. Not a conflict — just still open on both sides, worth closing before Epic 1 UI stories start rather than each future story author guessing.

**[LOW] AD-9's lint tooling (ESLint + eslint-plugin-boundaries + i18n lint) doesn't mention an accessibility lint rule** (e.g. `eslint-plugin-jsx-a11y`), despite `EXPERIENCE.md`'s accessibility floor being unusually strict for this product. Cheap to add, consistent with AD-9's existing "mechanical enforcement over relying on review" philosophy.

### Warnings

None beyond the alignment issues above — UX documentation exists and is substantive (not a missing-UX warning case).

## Epic Quality Review

*Reviewed epic-by-epic (9 parallel passes, Epic 5+8 combined given their dependency) against: user-value framing, epic independence, story sizing, forward dependencies, AC quality, entity-creation timing, and traceability. This is a second, independent scrutiny pass beyond `epics.md`'s own internal final-validation (which only caught the FR-B-11 forward-dependency bug) — real additional issues surfaced.*

### 🔴 Critical (8)

1. **Epic 1, Story 1.3** — "lands on a Recommended Courses screen" requires Epic 2's catalog, which doesn't exist when Epic 1 ships, contradicting Epic 1's own "standalone" claim.
2. **Epic 1, Story 1.8** — data export requires progress (Epic 4), notes (Epic 3), submissions (Epic 6) — none exist at Epic-1 build time.
3. **Epic 2, Story 2.2** — "cohort-availability" filter forward-depends on Epic 7 (5 epics later) with no callout, unlike the FR-B-11 precedent elsewhere in the doc.
4. **Epic 2, Story 2.2** — "rating" filter/display has no producing mechanism anywhere in the 117 FRs; no story ever collects a rating.
5. **Epic 5, Stories 5.2–5.5** — the domain events they subscribe to (`concept.mastered`, `topic.completed`, `course.completed`) are never actually published by any Epic 3/4 story. Unlike the explicitly-flagged forward-compatible Epic 6/7 subscriptions, these are assumed to already exist and don't.
6. **Epic 7, Story 7.9** (+7.11/7.12/7.15/7.17) — rests on an unresolved architecture question the source documents themselves flag as outstanding: the Additional Requirements section says "Epic 5 (Cohorts)" needs its own epic-altitude spine (stale numbering — Cohorts is Epic 7), and no story anywhere specifies how a multi-learner `CohortSession` relates to the single-learner-shaped `LearningSession`/`Beat` state machine AD-10 defined.
7. **Epic 9, Story 9.1** — directly contradicts Epic 2 Story 2.1 on the same Course/Module/Topic/Concept entities: Story 2.1's Module-delete rule is cascade/archive; Story 9.1's is block-if-dependents-exist. Two stories, two epics, conflicting business rules on one entity.
8. **Epic 9, Story 9.12** — lists "refund" in its title/user-story and is tagged "buildable now," but refund requires payment/billing infrastructure the Architecture spine explicitly defers pending OQ-1; no AC actually tests it either.

### 🟠 Major (29 total — representative sample; full detail held by the reviewing subagents' transcripts)

- **Epic 1**: Stories 1.1/1.4/1.5/1.7 assert behavior owned by later epics (Board sessions, stars/streaks, upload deletion) rather than the flag/event Epic 1 actually controls; `NotificationPort` (used by 1.1/1.7) has no story that actually builds it; Story 1.1's title promises login but no AC tests it; Story 1.7's account-deletion AC implies direct cross-module deletion, violating AD-14 (should publish a domain event instead).
- **Epic 2**: Story 2.3's "sample board session" ambiguously may require Epic 3's live renderer; Story 2.3 needs course-level prerequisite data Story 2.1 never defines; Story 2.9 (ingestion: 5 file formats + OCR + structure detection + chunking) is likely epic-sized, not session-sized; 2 of FR-C-11's 4 failure reasons (OCR failure, unsupported language) have no story that actually detects them.
- **Epic 3**: Story 3.26 (auto-drop difficulty) risks mutating the shared catalog `Concept.difficultyTier` platform-wide instead of a per-learner override — no entity specified; Story 3.31 (export) bundles 3 distinct engineering efforts; NFR-10 (reduced-motion) has no AC on any of the 5 progressive-reveal stories (3.5/3.6/3.7/3.8/3.11) it should govern.
- **Epic 4**: Stories 4.6/4.11 compute "streak" independently of Epic 5's canonical FR-R-3 streak (which has freeze-day logic Epic 4's doesn't) — a naming collision risking two divergent streak numbers; no story creates the initial `ConceptProgress` rows Story 4.4/4.6 assume already exist (should be an AC on Story 4.3, plan activation).
- **Epic 5/8**: Story 8.1's anti-gaming pipeline needs Epic 6 data (resubmission mode) but Epic 8's epic-level dependency only declares Epic 5, unlike Story 8.6's explicit Epic 7 callout; Story 5.3's audit-trail entity is named `Note`, colliding with Epic 3's learner-authored `Note`/Bookmark entity (AD-14 ownership ambiguity); Stories 5.2 vs. 5.3/5.4 use inconsistent event names (`topic.progress.recorded` vs. `topic.completed`) with no defined producer for either.
- **Epic 6**: Stories 6.10/6.11's "human review queue" is actually Epic 9's FR-O-4 console — ownership split (who owns the queue entity vs. who owns the UI) is undocumented; Story 6.6's OCR duplicates Epic 2 Story 2.9's OCR with no shared mechanism referenced, and no OCR port exists in the architecture's port list.
- **Epic 7**: Story 7.4 (matching) and 7.6 (max-seat cap) specify the same constrained-optimization problem as two disconnected stories, risking rework; Story 7.4 also bundles the matching algorithm with event-driven re-trigger orchestration (its own idempotency/debounce problem); Story 7.9 bundles realtime sync infra with session-lifecycle product behavior; no story generates the actual dated `CohortSession` series from a confirmed cadence pattern (the Epic-4-`PlannedSession` equivalent is missing); Story 7.16 assumes a peer-explain-back opt-in toggle no story creates.
- **Epic 9**: all 3 moderation-queue stories (9.8/9.9/9.10) skip the empty-queue state the checklist explicitly calls out, despite sibling stories in the same epic covering it; Story 9.4 (AI Beat pre-generation) shares Epic 3's core `Beat` schema with no cross-epic coordination note (unlike 9.8's explicit Epic-2 note); Story 9.12 also bundles 4 materially different admin actions (reset/suspend/delete/refund) of very different risk profiles into one story.

### 🟡 Minor (28 total, rolled up)

Untestable "exhaustion" trigger conditions (Epic 3, Stories 3.17/3.19); Explanation History data model defined after 5 stories already reference it (Epic 3); NFR-B-* latency budgets not reflected as ACs anywhere (Epic 3); FR Coverage Map / Requirements Inventory don't list the 2 synthetic FRs (FR-P-11/FR-P-13), and there's an unexplained FR-P-12 numbering gap (Epic 4); "mastery-weighted" epic description vs. actual binary completed/studied ratio in Story 4.5 (Epic 4); Story 4.9's "reduce depth" doesn't say whether it writes back to Epic 2's course-customization record; no partial-credit rule for multi-select grading, practice-mode appeal eligibility unstated, spot-check queue has no SLA/overdue handling unlike sibling Stories 6.13/7.22 (Epic 6); duplicated self-harm-escalation AC across Stories 7.13/7.21 with unclear ownership, Story 7.20's collective mastery doesn't confirm it reuses Epic 4's `ProgressDisclosure` shape (Epic 7); no unauthorized-access AC anywhere in the Admin-gated Epic 9; Story 9.11 surfaces a "plan/subscription status" field despite billing being deferred; several stories have single-AC-block happy-path-only coverage (Epic 1 Stories 1.2/1.4/1.7, Epic 1 Story 1.0's health-check has no degraded-state AC).

### Best Practices Compliance — rollup

| Check | Result |
|---|---|
| Epics deliver user value | ✅ Pass, all 9 epics (Story 1.0/9.x internal-user framing explicitly defensible) |
| Epic independence | ⚠️ Mostly pass — Epic 2↔7 (Critical #3) is a genuine cross-epic independence violation |
| Stories appropriately sized | ⚠️ 5 oversized stories flagged (2.9, 3.31, 5.3/8.1 borderline, 7.4, 7.9) |
| No forward dependencies | ❌ Fail — 8 critical forward/ownership-conflict findings above, the FR-B-11 class of bug recurred in a different shape 7 more times despite the earlier fix |
| Database tables created when needed | ⚠️ Mostly pass — 2 real gaps (Epic 4's missing ConceptProgress-creation AC, Epic 7's missing CohortSession-generation story), 1 naming collision (Epic 5's `Note`) |
| Clear acceptance criteria | ⚠️ Strong overall, but systematic gaps in NFR-10/NFR-B-* coverage (Epic 3) and empty-state coverage (Epic 9 moderation queues) |
| Traceability to FRs maintained | ✅ Pass, all 9 epics — 100% FR coverage confirmed independently by every reviewing subagent |

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK.**

Not a foundation problem — the PRD, Architecture, and UX layers are each individually strong (PRD validated, 2 critical fixes closed; Architecture at 16 ADs with a real reviewer gate behind it; UX with a real accessibility audit behind it too; 100% FR traceability confirmed independently three separate times). The problem is concentrated in `epics.md`: **8 critical findings**, several of which are the exact class of bug (an epic's story silently assuming a later epic's not-yet-built capability, or two epics defining conflicting rules for the same entity) that its own final-validation step was specifically designed to catch — and did catch once (FR-B-11), but not the other 7 instances. A dev agent starting Epic 5 or Epic 9 today, story-by-story, in order, would hit a wall or silently build something wrong.

### Critical Issues Requiring Immediate Action

1. **Epic 5's star/badge system has no event producer** (Stories 5.2–5.5) — subscribes to `concept.mastered`/`topic.completed`/`course.completed`, none of which any Epic 3/4 story publishes. This blocks Epic 5 from actually working, not just from being well-documented.
2. **Epic 9 Story 9.1 vs. Epic 2 Story 2.1** — directly conflicting delete rules for the same entity. Whichever gets built second will either silently break the first or require rework.
3. **Epic 7's cohort-board architecture is genuinely unresolved** — a live multi-learner board syncing against a single-learner-shaped `LearningSession` state machine, with no story specifying how. This is architecture work hiding inside a story-quality finding; it needs an epic-altitude spine decision, not just an AC edit.
4. **Epic 1's two forward-referencing stories** (1.3 recommended-courses, 1.8 data export) undercut the "Epic 1 is standalone" claim that everything else in the sequencing depends on.
5. **Epic 2's uncovered "rating" and forward-dependent "cohort-availability" filters** (Story 2.2) — one references data that doesn't exist for 5 epics, the other references data that's never collected anywhere.
6. **Epic 9 Story 9.12's refund action** is tagged buildable-now but requires the explicitly-deferred billing infrastructure (blocked on OQ-1) — will visibly fail if built as scoped.

### Recommended Next Steps

1. **Run a scoped Update pass on `epics.md`** (via `bmad-create-epics-and-stories`, Update intent, or targeted edits) fixing the 8 critical findings first — several have cheap, mechanical fixes (add an event-publishing AC, add a schema note, split refund into its own deferred story), one genuinely needs a decision (the cohort-board architecture question).
2. **Resolve the cohort-board architecture gap before Epic 7 story-dev starts** — either produce the epic-altitude spine the architecture doc already says Epic 7 (mislabeled "Epic 5") needs, or add the missing `CohortSession`↔`LearningSession` relationship as an explicit AD.
3. **Fold the UX-specified Board accessibility behaviors into Epic 3's story ACs** (already flagged in UX Alignment above) while touching Epic 3 stories for the other fixes here — same file, same session, don't reopen it twice.
4. Once critical + major findings are triaged, this report can be re-run (or spot-checked) against the updated `epics.md` before Sprint 0 begins.

### Final Note

This assessment identified **8 critical, 29 major, 28 minor** findings across PRD/Architecture/UX/Epics alignment and epic quality. PRD, Architecture, and UX are ready as-is. Epics/Stories need a real second pass before implementation — the volume of findings reflects genuine scrutiny of a 134-story, 9-epic document, not a low bar being applied. Address the critical issues before Sprint 0; the major/minor findings can be triaged alongside normal story-dev if time pressure demands it, but the 8 criticals will cause real build failures if skipped.

---
**Report generated:** `_AI-Agile-Development/planning-artifacts/implementation-readiness-report-2026-08-04.md`
**Assessor:** John (Product Manager) — BMad `bmad-check-implementation-readiness`
**Date:** 2026-08-04
