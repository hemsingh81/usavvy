---
name: 'Adversarial Boundary Review — Usavvy Architecture Spine'
type: review
target: ARCHITECTURE-SPINE.md (architecture-USavvy-2026-08-04)
created: '2026-08-04'
---

# Adversarial Boundary Review

Method: for each pair of units, find a build that satisfies every AD to the letter yet is incompatible with a sibling unit's equally-compliant build. 12 holes found, ordered roughly by severity/blast-radius.

---

## 1. Root cause: the ERD has no entity-to-module ownership map

**Units:** every feature module pair that touches a shared ERD entity (board-orchestration / plans-progress / engagement / cohorts, etc.)

**Divergence:** AD-13's Rule ("no direct import of another module's internal path... only via public service API or event bus") is only checkable if an engineer can look up *which module owns the table*. The Structural Seed lists modules; the ERD (lines 180-206) lists entities — but nothing maps `CONCEPT_PROGRESS`, `STAR_TRANSACTION`, `LEARNING_SESSION`, `EVALUATION`, etc. to an owning module. Two engineers each reading the same ERD can each conclude their own module is the entity's owner, both write to it "through their own service layer" (technically satisfying the Convention row "DB writes only through a module's service layer, never from route handlers"), and end up with two services independently mutating the same conceptual entity — or, worse, each building a *separate* table for the same concept because neither believes the other already owns it.

**Why current ADs don't stop it:** AD-13 governs *how* cross-module access happens (API or event bus, never a raw import) but never says *who* the owner is for any given entity. The ERD is presented as one undifferentiated diagram with no module-boundary partitioning or swimlanes.

**Suggested fix:** Add an explicit entity-ownership table (or partition the ERD into module swimlanes) as a required artifact alongside the ERD — one row per entity: `entity → owning module → mutation path for every other module (API call vs event)`. Make AD-13's Rule reference it directly.

---

## 2. `CONCEPT_PROGRESS` mutation: board-orchestration vs plans-progress vs engagement

**Units:** `board-orchestration` module, `plans-progress` module, `engagement` module

**Divergence:** AD-13's Rule permits cross-module interaction via *either* "a module's public service API *or* the shared event bus" — it doesn't say which mechanism applies when. Engineer A on board-orchestration, on detecting concept mastery mid-Beat-stream, calls `plansProgressService.recordMastery()` synchronously (fully compliant with AD-13: it's a public service API call, not an internal import). Engineer B, building `engagement`'s star-award logic, subscribes to the `concept.mastered` domain event (also fully compliant: the event bus is the sanctioned path, and the naming convention even specifies `concept.mastered` as the exemplar past-tense event name). If board-orchestration never actually *emits* that event — because the Rule doesn't require emitting an event just because a synchronous call was also made — engagement's star logic silently never fires. Nothing forces "notify everyone who cares" to be one canonical mechanism; the two valid options can be chosen independently per caller and per event, and only one engineer will discover the gap, at integration time.

**Why current ADs don't stop it:** AD-13 Rule: *"Cross-module communication happens only via a module's public service API or the shared event bus."* The "or" is the hole — it authorizes either path per interaction without requiring that state-changing facts other modules depend on always also go out on the event bus.

**Suggested fix:** Tighten AD-13 (or add AD-14): any state transition that other modules are known to consume (mastery, submission-graded, session-completed) MUST be published as a domain event, regardless of whether a synchronous service call also occurred. Direct service-API calls are for synchronous reads/commands; state-fact propagation is event-bus-only.

---

## 3. RBAC permission overrides: `auth` module vs `admin` module

**Units:** `auth` module (owns the `can(user, action, resource)` guard), `admin` module (back-office role/permission management UI)

**Divergence:** AD-7's Rule says the permission *matrix* is versioned seed data in `packages/config`, and a user's assigned *role(s)* live in the DB — nothing else is DB-assigned. An `admin` engineer building the back-office naturally builds a "grant this specific user an extra permission" or "revoke this permission for this user" UI (a completely ordinary back-office feature) backed by a new DB table of per-user overrides, assuming `can()` will consult it. The `auth` engineer implements `can()` as a pure function of `permissionMatrix[role][action][resource]` pulled from `packages/config`, per the letter of AD-7, and never reads any override table because none is mentioned in the Rule. Both are AD-7-compliant; the admin UI silently does nothing.

**Why current ADs don't stop it:** AD-7 Rule only states roles are DB-assigned and permissions are config-seeded per role — it never states whether per-user/per-resource overrides exist at all, so it can't specify where they'd live or how `can()` would consult them.

**Suggested fix:** AD-7 should explicitly state whether per-user permission overrides are in scope for v1 (if not, say so and block the admin UI from being built until a follow-on AD covers it); if they are in scope, specify the override table and require `can()`'s Rule to name both sources it must check.

---

## 4. WebSocket wire contract: `apps/web/board` vs `api/board-orchestration`

**Units:** `apps/web/src/modules/board`, `apps/api/src/modules/board-orchestration`

**Divergence:** AD-5 mandates WebSocket-only transport and references reusing event names like `beat.played` (the same past-tense convention defined for the internal event bus). Nothing states whether the WS wire payload is a filtered, versioned DTO defined in `packages/shared-types`, or a straight serialization of the internal domain event/Beat entity. A `board-orchestration` engineer could stream the internal `Beat` entity as-is (including internal fields such as model-routing tier or per-call cost, relevant to NFR-22) because the Rule never forbids it; the `apps/web` engineer, working only from `packages/shared-types`, assumes a minimal `{ beatId, text, audioUrl }` contract. Either the FE silently receives (and must ignore) internal cost/routing data it was never meant to see, or the FE build breaks the moment the BE reshapes its internal entity — a payload-shape drift the Consistency Conventions table doesn't cover (it only defines the REST error envelope and event *naming*, not the WS message *envelope/schema*).

**Why current ADs don't stop it:** AD-5's Rule covers transport choice only. The Consistency Conventions "Data & formats" row defines REST error shape but is silent on a WS message envelope. AD-13's "apps/web imports only packages/shared-types" governs *code* imports, not *runtime* payload shape — a WS message can violate the spirit of that isolation without violating the letter.

**Suggested fix:** Add a Consistency Convention (or new AD) requiring every WS message type to be a named, versioned contract in `packages/shared-types`, structurally distinct from internal domain-event/entity shapes — never a raw serialization of an internal entity.

---

## 5. `VectorStorePort` data shape: `ingestion` vs `generation`

**Units:** `ingestion` module (writes `CONTENT_CHUNK`s to the vector store), `generation` module (reads chunks for RAG retrieval)

**Divergence:** AD-1's Rule says any module consuming retrieval capability "depends only on its Port interface" — it does not restrict `VectorStorePort` access to a single owning module, so both `ingestion` and `generation` are independently entitled to call it directly. `ingestion` writes chunks namespaced/metadata-tagged by `documentId` (natural from its own worldview: a document was uploaded and chunked); `generation` queries expecting chunks filterable by `courseId + conceptId` (natural from its worldview: "give me content relevant to this concept"). Both satisfy AD-1 to the letter — each calls only the port, never a vendor SDK, never each other's internals — yet retrieval returns nothing useful because the metadata schema was never agreed.

**Why current ADs don't stop it:** AD-1 governs *transport* (port vs adapter), never the *data contract* carried through the port. No AD specifies `VectorStorePort`'s metadata/filter schema.

**Suggested fix:** Define the `VectorStorePort` metadata contract (required fields: `documentId`, `courseId`, `conceptId`, `chunkId`, etc.) in `packages/shared-types` and reference it from AD-1, the same way the ERD anchors entity shape.

---

## 6. `CONTENT_CHUNK` ↔ `CONCEPT` linkage: `courses` vs `ingestion`

**Units:** `courses` module (owns `COURSE > MODULE > TOPIC > CONCEPT`), `ingestion` module (owns `UPLOADED_DOCUMENT > CONTENT_CHUNK`)

**Divergence:** The ERD (lines 180-206) has no relation at all between `CONTENT_CHUNK` and `CONCEPT`/`TOPIC` — yet RAG-scoped retrieval and content authoring clearly need one. A `courses`-side engineer could add a `concept_id` FK directly onto `ingestion`'s `CONTENT_CHUNK` table (a direct reach into another module's owned table, arguably breaking AD-13's spirit but not caught by any tooling); an `ingestion`-side engineer could instead build its own `concept_content_chunk` join table it owns and exposes only via its own service API. Both are locally defensible; they produce two incompatible ways of answering "which chunks relate to this concept," and nothing in the spine or the ERD forces a single answer.

**Why current ADs don't stop it:** No AD addresses missing ERD relations, and AD-13 only forbids *importing* another module's internals — it says nothing about one module writing a foreign-key column into a table it doesn't own, which is the more likely failure mode here.

**Suggested fix:** Add the missing ERD relation and state explicitly which module owns the linking entity; tighten AD-13 to forbid schema modification, not just code import, of another module's tables.

---

## 7. Crisis/self-harm escalation gap: `cohorts` (live chat) vs `engagement`/`admin` (moderation)

**Units:** `cohorts` module (`COHORT_MESSAGE`, human-to-human chat), `engagement`/`admin` modules (moderation, safety)

**Divergence:** AD-3's mandatory self-harm/crisis escalation (NFR-19, "never an improvised AI response") is scoped to `GenerationPort`/`VoicePort` only — i.e., AI-generated content. `COHORT_MESSAGE` is human-authored peer chat, never passing through either port, so AD-3's safety net structurally does not apply to it. A `cohorts` engineer, reading AD-3's Binds line ("GenerationPort, VoicePort"), correctly concludes chat messages are out of scope for that AD and ships cohort chat with no safety scanning. Nobody else is assigned this responsibility either — `admin`/`engagement` engineers, if asked, would likely point back at AD-3 and assume "safety is handled at the port boundary" covers it, since that's the only safety AD in the spine. A genuine self-harm disclosure typed into cohort chat — arguably the *most* likely place for one, given it's peer-to-peer and unmoderated by an AI — has no architectural owner.

**Why current ADs don't stop it:** AD-3 Binds explicitly names only `GenerationPort, VoicePort`; human-authored chat content never transits either port, so it is textually outside AD-3's scope, and no other AD names moderation/safety for user-to-user content.

**Suggested fix:** New AD (or extend AD-3's Binds) requiring human-authored real-time content (cohort chat, any future peer messaging) to pass through the same PII/safety/crisis-escalation logic — likely by routing chat messages through a lightweight call to the safety-filtering logic even when no generation call is being made, or by extracting AD-3's safety scanning into its own shared port independent of generation/voice.

---

## 8. Localization boundary: AI-generated Beat narration vs static UI copy — `generation` vs `apps/web/board`

**Units:** `generation` module, `apps/web/src/modules/board`

**Divergence:** AD-4's Rule, read literally, says "all user-facing text resolves through a locale layer via lookup key... no module concatenates or hardcodes a user-facing string inline." Beat narration is user-facing text, dynamically generated per learner query — it cannot possibly resolve through a static lookup-key bundle. AD-4 never carves out an exception for AI-generated content, so a `generation`-module engineer reasonably assumes AD-4 doesn't apply to them (it's not "hardcoded," it's generated) and never threads a target-language parameter through `GenerationPort` at all; a `board`-frontend engineer, reading AD-4's Binds line ("apps/web, apps/api ... UI copy, notifications, error messages") equally reasonably assumes generation output is someone else's problem and builds no language-selection UI for lesson content. Neither side ends up owning "what language does the AI actually generate the Beat in" — a functionally different, unaddressed problem from static-string i18n that AD-4's wording conflates with.

**Why current ADs don't stop it:** AD-4's Rule is written for static copy (lookup-key resolution) and doesn't distinguish "text that must be translated ahead of time" from "text that must be generated in the target language on demand," despite both being "user-facing text" under the Rule's own wording.

**Suggested fix:** Split AD-4 into two rules: static UI copy (locale-key lookup, as written) and dynamically generated content (a required `locale`/`language` parameter on `GenerationPort`/`VoicePort` calls, enforced at the port per AD-2/AD-3's pattern).

---

## 9. Feature-flag mutability: `admin` back office vs `shared-kernel/config`

**Units:** `admin` module (back-office UI), `shared-kernel`/`packages/config`

**Divergence:** AD-12's Rule states all runtime config, including feature flags, "is defined in `packages/config`... loaded and validated once at process boot." Taken literally, a flag cannot change without a process restart. An `admin` engineer building an ordinary "toggle this feature on/off" back-office control reasonably expects the toggle to take effect live (that's the entire point of a back-office flag UI) and builds it against a DB-backed or hot-reloadable config path; the `shared-kernel`/config engineer, implementing AD-12 to the letter, builds config as an immutable, boot-time-only snapshot. The admin UI's "Save" button either does nothing until the next deploy, or the config engineer is later forced to violate "loaded and validated once at process boot" to make it work — a rule that was satisfiable by one side alone but not by both sides' independently reasonable builds.

**Why current ADs don't stop it:** AD-12 bundles "feature flags" into the same boot-time-only sentence as static RBAC seed data, without addressing whether flags are meant to be operator-toggleable at runtime — a very different requirement from "typed config, no scattered `process.env` reads," which is AD-12's actual stated concern (Prevents line).

**Suggested fix:** Split AD-12: keep boot-time validated config for structural settings (adapter bindings, RBAC seed), and add an explicit sub-rule (or new AD) for operator-facing feature flags — e.g., DB-backed, polled or push-invalidated, still zod-validated on read, explicitly exempted from the "loaded once at boot" clause.

---

## 10. Cohort live playback state: `cohorts` vs `board-orchestration` — missing ERD relation

**Units:** `cohorts` module, `board-orchestration` module

**Divergence:** AD-5 groups "Beat streaming" and "cohort board sync" under the same WebSocket rule, implying a cohort session shares Beat-playback state across members. But the ERD shows `USER ||--o{ LEARNING_SESSION : runs` (a per-user entity) and, separately, `COHORT ||--o{ COHORT_SESSION : schedules` — with **no relation drawn between `COHORT_SESSION` and either `LEARNING_SESSION` or `BEAT`**. A `board-orchestration` engineer, owning `LEARNING_SESSION`/`BEAT`, could reasonably expect `cohorts` to attach a `cohort_id` to an existing `LEARNING_SESSION` and broadcast it; a `cohorts` engineer, owning `COHORT_SESSION`, could reasonably build its own parallel "current beat" state on `COHORT_SESSION` to avoid reaching into board-orchestration's table. Both comply with AD-13 (neither imports the other's internals) and both comply with AD-5 (both fan out over WebSocket) — but they've built two different, non-interoperable models of "what beat is currently playing for this cohort," and a mentor pausing playback in one model won't propagate to the other.

**Why current ADs don't stop it:** AD-5's Rule addresses transport only, not the shared entity model; the ERD, the one artifact that could resolve this, simply omits the relation.

**Suggested fix:** Add the missing ERD relation (e.g., `COHORT_SESSION ||--o| LEARNING_SESSION : drives`) and state explicitly in AD-10 or a new AD which module owns the canonical "current beat" pointer during a cohort session.

---

## 11. Voice delivery contract: `voice` module vs `board-orchestration`

**Units:** `voice` module, `board-orchestration` module

**Divergence:** Nothing in AD-1, AD-5, or AD-6 specifies *how* synthesized audio reaches the client. Two equally compliant designs: (a) `voice` synthesizes a full clip, writes it via `StoragePort` (sanctioned by AD-6 for "board exports, session recordings" — a `board-orchestration` engineer could reasonably read narration audio as covered by the same bucket category), and a Beat carries an `audioUrl` the client fetches separately; vs (b) `voice` streams binary audio frames interleaved on the same WebSocket connection AD-5 mandates for "Beat streaming," never touching `StoragePort` at all. These imply completely different client playback architectures (`<audio src>` vs a Web Audio API streaming buffer) and different latency profiles against NFR-B-1/B-2. A `board-orchestration` engineer building against model (a) and a `voice` engineer building against model (b) each fully satisfy AD-1/AD-5/AD-6's letter while producing a Beat payload the other side's client code cannot play.

**Why current ADs don't stop it:** AD-6's Binds list ("UploadedDocument, board exports, session recordings") doesn't clearly include or exclude live narration audio; AD-5's Rule doesn't state whether non-text realtime payloads (audio bytes) are in scope for the same WebSocket channel or out of scope by nature.

**Suggested fix:** New AD (or extend AD-5) specifying the audio delivery contract explicitly: streamed-over-WS vs URL-fetched-after-synthesis, and if the latter, that `StoragePort` usage for narration audio is short-lived/cache-only, distinct from durable exports/recordings.

---

## 12. Concurrency control on `PLANNED_SESSION`: `apps/web/plans` vs `api/plans-progress`

**Units:** `apps/web/src/modules/plans`, `apps/api/src/modules/plans-progress`

**Divergence:** A learner can presumably reschedule a `PLANNED_SESSION` from the UI; the system can also presumably auto-replan subsequent sessions server-side (e.g., after a missed session). The Consistency Conventions table defines ID format, timestamp format, error envelope, and monetary format — but no optimistic-concurrency convention (no `version`/`etag`/"last-write-wins with a warning" rule). A `plans-progress` engineer implementing the auto-replan job could reasonably do a blind overwrite of `PLANNED_SESSION` rows; a `plans` frontend engineer could reasonably build an optimistic-update PATCH flow assuming the server will preserve the user's edit. Both are silent-compliant with every AD — there's no Rule either one is violating — yet the two writers can race and silently clobber each other, and the Consistency Conventions section is exactly the place this should have been specified but wasn't.

**Why current ADs don't stop it:** No AD or Convention addresses concurrent-write resolution anywhere in the spine; it's a gap by omission rather than a vague Rule.

**Suggested fix:** Add a Consistency Convention row for concurrency control (e.g., `updated_at`-based optimistic locking on every mutable entity, mismatch returns a `409` via the central error-mapper) so every module inherits the same conflict-handling contract by default.

---

## Summary Table

| # | Units | Core failure mode |
| --- | --- | --- |
| 1 | (general) module pairs sharing an ERD entity | No entity→module ownership map; AD-13 unenforceable in practice |
| 2 | board-orchestration / plans-progress / engagement | AD-13's "API or event bus" lets state facts silently skip the event bus |
| 3 | auth / admin | AD-7 silent on permission overrides beyond role assignment |
| 4 | apps/web/board / api/board-orchestration | No WS message envelope/versioning convention |
| 5 | ingestion / generation | AD-1 governs port access, not the data shape carried through it |
| 6 | courses / ingestion | Missing ERD relation between CONTENT_CHUNK and CONCEPT |
| 7 | cohorts / engagement,admin | AD-3 safety net scoped to AI ports only; human chat uncovered |
| 8 | generation / apps/web/board | AD-4 conflates static-copy i18n with dynamic-content generation language |
| 9 | admin / shared-kernel-config | AD-12 boot-time-only wording conflicts with expected live flag toggling |
| 10 | cohorts / board-orchestration | Missing ERD relation between COHORT_SESSION and LEARNING_SESSION/BEAT |
| 11 | voice / board-orchestration | No audio-delivery-contract AD (streamed vs URL-fetched) |
| 12 | apps/web/plans / api/plans-progress | No concurrency-control convention anywhere in the spine |
