import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Story 2.7 (FR-C-7/FR-C-12). Same uuidv7() default every other service's tables use
// (Consistency Conventions).
const uuidv7Default = sql`uuidv7()`;

export const uploadedDocuments = pgTable("uploaded_documents", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  // Opaque cross-service reference to core's users (AD-13) — never a real DB FK.
  ownerId: text("owner_id").notNull(),
  // Groups a batch of uploads into one "custom course" (AD-1: not yet a real `courses`
  // row — see this story's Dev Notes on why that's deliberately deferred to Story 2.13).
  customCourseId: uuid("custom_course_id").notNull(),
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
