# Validation Report — Usavvy PRD

- **PRD:** `Doc/00-Requirement.md`
- **Rubric:** `.claude/skills/bmad-prd/assets/prd-validation-checklist.md`
- **Run at:** 2026-08-04T10:58:40Z
- **Grade:** Poor

## Overall verdict

This is an unusually disciplined, thesis-driven PRD: it names a real bet ("the board, not the chat"), sequences scope around that bet, quantifies almost every NFR, and is upfront about what it hasn't decided (§22, 8 open questions, an explicit "before engineering commits to estimates" gate). On structure and rhetoric it reads as chain-top-ready — every rubric dimension came back strong or adequate, with zero thin or broken dimensions.

The grade is dragged down by what the adversarial pass found underneath that structure: two concrete, product-critical defects. The mastery/progress formula in §11.2 is internally broken — skipped concepts keep their weight in the denominator while scoring zero in the numerator, permanently capping achievable progress below 100% and contradicting FR-B-11's "excluded from mastery" language, with no defined completion threshold to fall back on. And FR-G-6's anti-stall guarantee — the BA's own words, "not optional... the mitigation that makes this feature safe to ship" against the highest-rated risk in the register (R-4, High/High) — ships with a literal undefined placeholder ("within X days"). Layered on top: a factual contradiction in the launch course count (25 in §3.2 vs. 10 in §7/OQ-4), a forecast algorithm with a unit mismatch, four of the eight "open" stakeholder decisions in §22 that are already answered elsewhere in the same document, and an inconsistently-applied MUST/MVP-blocking convention across Epic 5 and Epic 6 that will mislead whoever authors epics and stories next. None of this is a weak PRD — it's a strong PRD carrying two broken mechanisms and a batch of internal-consistency bugs that a decision-maker should not sign off on as-is.

## Dimension verdicts

- Decision-readiness — strong
- Substance over theater — strong
- Strategic coherence — strong
- Done-ness clarity — adequate
- Scope honesty — strong
- Downstream usability — adequate
- Shape fit — strong

## Findings by severity

### Critical (2)

**[Downstream defect]** Mastery/progress formula is internally broken (§11.2, FR-B-11)
Skipped concepts get mastery_score 0.0, but nothing removes their concept_weight from the denominator Σ(concept_weight) — a skipped concept counts as weight in the denominator and zero in the numerator, permanently capping achievable progress % below 100%, contradicting FR-B-11's "excluded from mastery." No completion threshold is defined to resolve what % triggers completion/certificate issuance — touches BO-2, FR-P-4, FR-R-5.
Fix: Exclude skipped concept_weight from the denominator, or define an explicit completion threshold that accounts for it.

**[Downstream defect]** FR-G-6's anti-stall threshold is a literal undefined placeholder (§12.1, R-4)
"If a waiting list hasn't formed a cohort within X days" leaves X undefined, even though the BA note calls this "not optional — the mitigation that makes this feature safe to ship" against R-4 (High/High, the highest-rated risk in the register).
Fix: Set X (even as an `[ASSUMPTION]`-tagged placeholder pending data) before this reaches architecture.

### High (9)

**[Downstream usability]** Glossary omits the structural nouns the rest of the PRD depends on (§23)
Course, Module, Topic, and Session are central, repeatedly-used terms (FR-C-1, §18, §10.1) but none appear in the Glossary.
Fix: Add Course, Module, Topic, and Session to §23.

**[Adversarial]** MUST = "MVP-blocking" is violated across Epic 5 and Epic 6 (§1, §7, Epic 5, Epic 6)
Epic 5 (Release 3) and Epic 6 (Release 2) tag nearly every requirement plain MUST with no release qualifier, despite §7 saying those epics ship after MVP.
Fix: Apply the release-qualifier convention consistently across every FR table.

**[Adversarial]** Launch course count contradicts itself (§3.2 BO-5 vs. §7 / OQ-4)
BO-5 states 25 catalog courses "at launch"; §7 and OQ-4 both say 10 seed catalog courses. No reconciling note.
Fix: Reconcile to one number.

**[Adversarial]** OQ-6's dependent MUST requirements have no fallback if capacity is unavailable (OQ-6, FR-E-10, FR-E-11)
If OQ-6 resolves to "no human-grading capacity," FR-E-10/11 and the ≥85% agreement-rate metric become unfulfillable as written, with no stated scope reduction.
Fix: State the fallback scope reduction for FR-E-10/11 if OQ-6 resolves negatively.

**[Adversarial]** needs_review concept state has no assigned mastery_score (§11.2)
Undefined how a decayed concept affects published progress % — in tension with Principle 4 ("Honest progress").
Fix: Assign needs_review a mastery_score or explicit decay function in the §11.2 formula.

**[Adversarial]** Forecast algorithm has a unit mismatch (§11.3)
forecast_days = remaining ÷ velocity divides concept_weight units by raw concepts-mastered-per-day — dimensionally inconsistent for non-uniform concept weights.
Fix: Express velocity in weight-per-day, or remaining in raw concept counts.

**[Adversarial]** Beat-caching mitigation doesn't cover the flagship MVP traffic it's meant to make latency targets credible for (R3, NFR-B-1/B-2, J1, FR-C-4)
J1 (uploaded content) and FR-C-4 (custom depth) fall outside the cacheable path by construction; NFR-B-1/B-2 are stated as blanket targets with no segmentation.
Fix: Segment NFR-B-1/B-2 by cacheable vs. live-generation paths.

**[Adversarial]** FR-A-8 is tagged SHOULD while NFR-15 asserts GDPR readiness depends on it (FR-A-8, NFR-15)
GDPR readiness cannot be claimed without the export function it depends on, yet the export mechanism itself is deferrable.
Fix: Promote FR-A-8 to MUST, or scope NFR-15's claim to exclude export until it ships.

**[Adversarial]** Age-gate verification method and consent sequencing are undefined (FR-A-1, FR-A-2, NFR-16)
No verification method for self-declared age; sequencing between email verification and parental-consent gating is never defined.
Fix: Define the verification method and explicit step order between FR-A-1 and the NFR-16 consent gate.

### Medium (12)

**[Strategic coherence]** No explicit counter-metrics named for the North Star or Business Objectives (§20, §3.2)
Fix: Add an explicit counter-metric row to §20.

**[Done-ness clarity]** FR-G-7 cohort size cap is advisory language under a MUST priority (§12.1)
Fix: State a hard bound or re-tag as SHOULD.

**[Done-ness clarity]** NFR-24 fair-use ceiling has no quantified bound (§16.4)
Fix: Specify a placeholder ceiling with `[ASSUMPTION]` tagging, or explicitly defer to the unit-cost model.

**[Done-ness clarity]** FR-A-2 minor/parental-consent flow is underspecified for its legal weight (§8.1)
Fix: Add acceptance criteria, or `[NOTE FOR PM]` it as deferred to the DPIA.

**[Done-ness clarity]** Relationship between onboarding "explanation style default" and "Explanation route" is unstated (FR-A-4 vs. FR-B-21)
Fix: Add one clarifying sentence to §10.3 or §8.1.

**[Downstream usability]** UJ J4 has no named protagonist (§17)
Fix: Reopen J4 with an existing persona.

**[Adversarial]** OQ-2 (market/language) is listed open but already load-bearing elsewhere (OQ-2, §10.6, NFR-15)
Fix: Close OQ-2 or caveat §10.6/§16.3 as provisional.

**[Adversarial]** OQ-3 (Avatar form) is listed open but the architecture is already written around the answer (OQ-3, §19.1, §23)
Fix: Close OQ-3 or caveat §19.1/§23 as provisional.

**[Adversarial]** NFR-23's cost/margin target has a circular dependency on the unresolved price point (NFR-23, OQ-1, §16.4)
Fix: State the sequencing explicitly (cost model → price → NFR-23 finalized).

**[Adversarial]** No fallback defined once a learner exhausts all explanation routes/examples (FR-B-6, FR-B-21)
Fix: Define fallback behavior once the route set is exhausted.

**[Adversarial]** FR-B-22 is tagged SHOULD but narrated as reliable flagship behavior in J1 (FR-B-22, §17 J1)
Fix: Promote to MUST for MVP, or rewrite J1.

**[Adversarial]** BO-4's 12-month measurement window isn't reconciled with cohorts shipping in Release 3 (BO-4, §7, R1)
Fix: Rebase BO-4's window to post-Release-3, or state the assumed R1/R2 duration.

### Low (7)

**[Substance over theater]** Persona count exceeds the theater threshold but is functionally anchored (§4)
Fix: Relabel P5/P6 as "internal roles" distinct from the learner-persona set.

**[Scope honesty]** No consolidated Assumptions Index (§4, §19.1)
Fix: Add a two-row index table or fold into §22.

**[Downstream usability]** NFR-B-* ID namespace isn't declared in the traceability legend (§1)
Fix: Extend the §1 legend to note the epic-scoped NFR variant.

**[Downstream usability]** Sections lean on section-number cross-references rather than glossary-term-only references (throughout)
Fix: No action required unless sections are sharded for downstream consumption.

**[Adversarial]** OQ-5 (peer explain-back) is listed open but already specified (OQ-5, FR-G-13, §12.1, FR-R-1)
Fix: Close OQ-5 or narrow it to whatever sliver is genuinely undecided.

**[Adversarial]** OQ-7 (certificate accreditation) is listed open but already answered (OQ-7, FR-R-5)
Fix: Close OQ-7 or narrow it to the marketing/legal-review sliver.

**[Adversarial]** Epic 7 leaderboard sub-requirements are scoped inconsistently with their own parent feature (FR-R-7, FR-R-9, FR-R-10, FR-R-6)
Fix: Tag FR-R-7/9/10 "(R2)" to match FR-R-6.

## Mechanical notes

- Glossary drift: otherwise consistent — "Board," "Beat," "Concept," "Mastery," "Cohort" used identically across FRs, the data model, and UJs. "Learner" vs. "User" is a deliberate distinction (§18), not drift.
- ID continuity: no gaps or duplicates in FR-A, FR-B, FR-C, FR-E, FR-G, FR-O, FR-P, FR-R, or NFR-1..24. AC IDs correctly key off their parent FR. The one legend gap is the undeclared `NFR-B-<n>` namespace.
- Assumptions Index roundtrip: only A1 (§4) and A2 (§19.1) exist inline, both referenced back in §22 — nothing orphaned, but no dedicated index section.
- UJ protagonist naming: J1/J2/J3 correctly anchored to named personas; J4 is a floating UJ with no protagonist.
- Required sections for stakes: for a launch-stakes, chain-top consumer PRD, all expected sections are present.

## Reviewer files

- `review-rubric.md`
- `review-adversarial-general.md`
