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
  // "queued" today; Story 2.9/2.11 add more states (parsing, safety scan, embedding,
  // outline ready, failed reasons) — a plain text column so extending it needs no
  // migration.
  status: text("status").notNull().default("queued"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
