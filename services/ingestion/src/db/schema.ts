import { boolean, integer, pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Story 2.7 (FR-C-7/FR-C-12). Same uuidv7() default every other service's tables use
// (Consistency Conventions).
const uuidv7Default = sql`uuidv7()`;

// Story 2.12 (FR-C-9), AC #1. 1536 chosen to match a plausible real embedding provider's
// dimensionality (e.g. OpenAI text-embedding-3-small) so no dimension migration is
// needed once a real GenerationPort adapter lands. Exported so the mock adapter
// (services/ingestion/src/modules/generation/mock.ts) produces vectors of the exact
// same width the DB column requires.
export const EMBEDDING_DIMENSIONS = 1536;

export const uploadedDocuments = pgTable("uploaded_documents", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  // Opaque cross-service reference to core's users (AD-13) — never a real DB FK.
  ownerId: text("owner_id").notNull(),
  // Groups a batch of uploads into one "custom course" (AD-1: not yet a real `courses`
  // row — see Story 2.7's Dev Notes on why that was deliberately deferred to Story 2.13).
  // Story 2.14: nullable — a document attached to an existing catalog course (courseId
  // below) has no customCourseId at all. Exactly one of customCourseId/courseId is ever
  // set, enforced in services/uploads/service.ts (finalizeUpload), not a DB constraint —
  // no table in this schema uses a CHECK constraint for a cross-column invariant.
  customCourseId: uuid("custom_course_id"),
  // Story 2.14 (FR-C-14). Opaque, non-FK reference to services/courses' courses.id (same
  // bare-cross-service-id convention as ownerId above; AD-14 forbids a real FK) — set
  // when this document is a personal note attached to an EXISTING catalog course rather
  // than part of a new custom course. See customCourseId's own comment for the
  // exactly-one-of invariant.
  courseId: uuid("course_id"),
  fileName: text("file_name").notNull(),
  // "pdf" | "docx" | "pptx" | "txt" | "md" — validated at the Zod boundary, not a DB
  // enum, matching this codebase's existing convention (e.g. courses.status).
  fileType: text("file_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  storageKey: text("storage_key").notNull(),
  copyrightAttested: boolean("copyright_attested").notNull(),
  // "queued" (Story 2.7) -> "parsed" | "failed" (Story 2.9) -> "blocked" (Story 2.10);
  // Story 2.11 adds more states (parsing, safety scan, embedding, outline ready) — a
  // plain text column so extending it needs no migration.
  status: text("status").notNull().default("queued"),
  // Story 2.9 (FR-C-9), AC #3/#4: "encrypted file" | "corrupt file" when status is
  // "failed". Story 2.10 (FR-C-13), AC #2: "blocked: <category>" when status is
  // "blocked" — null otherwise.
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Story 2.9 (FR-C-9). The second and last entity this service owns per AD-14's
// ownership table (UploadedDocument, ContentChunk -> ingestion).
export const contentChunks = pgTable("content_chunks", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  // Story 2.11 (FR-C-11), AC #3: cascade — a "blocked" document already has chunks
  // (Story 2.10 inserts them even for a blocked document), so removing a document must
  // remove its chunks too rather than fail on this FK.
  documentId: uuid("document_id")
    .notNull()
    .references(() => uploadedDocuments.id, { onDelete: "cascade" }),
  // Order within the document — chunking is sequential, not content-addressed.
  chunkIndex: integer("chunk_index").notNull(),
  text: text("text").notNull(),
  // The detected section heading this chunk falls under, if any (DOCX/MD have a real
  // signal for this; PDF/PPTX use a documented heuristic; TXT has none — see Dev Notes).
  heading: text("heading"),
  // PDF page / PPTX slide numbers; null for formats with no page concept (DOCX/TXT/MD).
  pageRangeStart: integer("page_range_start"),
  pageRangeEnd: integer("page_range_end"),
  // Story 2.10 (FR-C-13), AC #1: "clear" | "flagged" | "blocked" — a plain text column,
  // matching this codebase's existing status-column convention (no DB enum).
  safetyStatus: text("safety_status").notNull().default("clear"),
  // The policy category that matched; null when safetyStatus is "clear".
  safetyCategory: text("safety_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Story 2.12 (FR-C-9), AC #1. VectorStorePort's pgvector adapter owns this table — one
// embedding row per chunk, never queried outside that port (see
// modules/generation/vectorStorePgvector.ts).
export const chunkEmbeddings = pgTable("chunk_embeddings", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  chunkId: uuid("chunk_id")
    .notNull()
    .unique()
    .references(() => contentChunks.id, { onDelete: "cascade" }),
  // Denormalized from the chunk — a query path that doesn't need a join.
  documentId: uuid("document_id")
    .notNull()
    .references(() => uploadedDocuments.id, { onDelete: "cascade" }),
  // Same bare, non-FK convention as uploadedDocuments.customCourseId — see that column's
  // own comment for why (no real `courses` row exists yet). Story 2.14: nullable, same
  // exactly-one-of-customCourseId/courseId invariant as uploadedDocuments — denormalized
  // straight from whichever one the source document has set.
  customCourseId: uuid("custom_course_id"),
  // Story 2.14 (FR-C-14). Denormalized from uploadedDocuments.courseId — see that
  // column's own comment. Set instead of customCourseId when this embedding belongs to a
  // personal note attached to an existing catalog course, so a future board session's
  // retrieval query can filter by the real catalog courseId directly.
  courseId: uuid("course_id"),
  // AC #1's "conceptId placeholder" — always null until a future story creates real
  // Concepts (Story 2.13 or later; see this story's Scope Note).
  conceptId: uuid("concept_id"),
  embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Story 2.12 (FR-C-9), AC #2/#3. customCourseId is the aggregation key — a custom course
// can hold multiple UploadedDocuments (Stories 2.7/2.8), and each document's own
// ingestion job independently contributes its own Topics to the same growing pool for
// that custom course. No service/route layer exists yet for these tables (Story 2.13's
// job — see this story's Scope Note).
export const proposedTopics = pgTable("proposed_topics", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  customCourseId: uuid("custom_course_id").notNull(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => uploadedDocuments.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  // Insertion order within this document's own contribution — Story 2.13's reorder
  // endpoint rewrites this to a global order across the whole customCourseId the first
  // time a learner reorders, superseding the per-document-local meaning it starts with.
  position: integer("position").notNull(),
  // Story 2.13 (FR-C-10), AC #1: "mark any of them as priority" — learner-editable, set
  // by the outline review screen, never by the ingestion job itself.
  priority: boolean("priority").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposedConcepts = pgTable("proposed_concepts", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  proposedTopicId: uuid("proposed_topic_id")
    .notNull()
    .references(() => proposedTopics.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  // AC #2: "linked to the source page/section range it was derived from". Null for
  // formats with no page concept (DOCX/TXT/MD), matching contentChunks' own convention.
  sourcePageRangeStart: integer("source_page_range_start"),
  sourcePageRangeEnd: integer("source_page_range_end"),
  // AC #4: true if any contributing chunk's safetyStatus was "flagged".
  safetyFlagged: boolean("safety_flagged").notNull().default(false),
  // Story 2.13 (FR-C-10), AC #1: same learner-editable priority flag as proposedTopics,
  // independently settable at the Concept level.
  priority: boolean("priority").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Story 2.13 (FR-C-10), AC #2. Records the materialization of a customCourseId into a
// real courses.id (services/courses, via gateway's orchestration — ingestion never
// calls courses directly, AD-13). customCourseId is the primary key.
//
// Review finding: the original design only wrote this row AFTER `courses` successfully
// created the real row, checking for an existing row as the sole idempotency signal —
// two concurrent confirm calls could both observe "not yet confirmed" and both create a
// real, permanent, duplicate Course before either write ever landed here. `courseId` is
// now nullable specifically so `confirmOutline` can atomically CLAIM this row (insert
// with courseId still null, ON CONFLICT DO NOTHING) BEFORE any `courses` call happens —
// only the caller whose insert actually wins ever proceeds to materialize a course.
// `recordOutlineConfirmation` is now an UPDATE of the already-claimed row (setting
// courseId), not an insert. A claim that never gets its courseId recorded (gateway
// crashes between claiming and calling courses, or the courses call itself fails) leaves
// a permanently unconfirmable customCourseId — an accepted, documented gap of the same
// class this codebase already tolerates elsewhere (e.g. domain events' "at least once"
// framing), and vastly preferable to silently creating two real Courses for one outline.
export const customCourseConfirmations = pgTable("custom_course_confirmations", {
  customCourseId: uuid("custom_course_id").primaryKey(),
  // Same bare, non-FK convention as uploadedDocuments.ownerId.
  ownerId: text("owner_id").notNull(),
  // Null while claimed-but-not-yet-materialized; set once `courses` successfully
  // returns a real courseId. Opaque cross-service reference (AD-14 forbids cross-service
  // FKs).
  courseId: uuid("course_id"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
});
