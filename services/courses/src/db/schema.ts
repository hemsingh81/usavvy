import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CheckpointQuestion, CourseStatus, DifficultyTier } from "@usavvy/shared-types";

// Story 2.1 (FR-C-1). Same uuidv7() default every other service's tables use
// (Consistency Conventions) — verified live against the running container in Story 1.0.
const uuidv7Default = sql`uuidv7()`;

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  title: text("title").notNull(),
  description: text("description"),
  // Story 2.2 (FR-C-2): catalog-facet fields, added incrementally to this same table —
  // no AC in Story 2.1 named them, the same "don't pre-build for a story that hasn't
  // started" convention this table's own Concept-level fields already follow.
  subject: text("subject"),
  level: text("level").$type<DifficultyTier>(),
  estimatedDurationHours: integer("estimated_duration_hours"),
  // No draft->review->published workflow with reviewer sign-off exists yet (a later Epic
  // 9 story owns that) — this is just enough to distinguish "appears in the catalog" from
  // "doesn't." DB-level default is defense-in-depth for direct-DB-fixture rows in tests;
  // the service layer's own default is the actual source of truth (Story 1.4's convention).
  status: text("status").notNull().default("draft").$type<CourseStatus>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export const modules = pgTable("modules", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  courseId: uuid("course_id")
    .notNull()
    .references(() => courses.id),
  title: text("title").notNull(),
  // Position/order within its parent (AC #1) — stable sequencing, not a display-only hint.
  position: integer("position").notNull(),
  // Story 2.1's own archive rule (AC #3): a deleted Module is archived, not hard-deleted,
  // so its Topics/Concepts stay reachable for audit/dangling-prerequisite flagging rather
  // than disappearing via cascade delete.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  moduleId: uuid("module_id")
    .notNull()
    .references(() => modules.id),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

export const concepts = pgTable("concepts", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  topicId: uuid("topic_id")
    .notNull()
    .references(() => topics.id),
  title: text("title").notNull(),
  position: integer("position").notNull(),
  // Opaque reference arrays (AC #1) — the actual source material/board asset entities are
  // owned by other, not-yet-built services (ingestion, board-orchestration); this story
  // only persists the references, per its own Dev Notes scope note.
  objectives: text("objectives").array(),
  sourceMaterialRefs: text("source_material_refs").array(),
  boardAssetRefs: text("board_asset_refs").array(),
  checkpointQuestions: jsonb("checkpoint_questions").$type<CheckpointQuestion[]>(),
  difficultyTier: text("difficulty_tier").$type<DifficultyTier>(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(1),
});

// Many-to-many prerequisite links between Concepts within the same Course (AC #1/#2).
// No `archived` column here — whether a prerequisite is "flagged" (AC #3) is computed at
// read time from the referenced concept's own `archivedAt`, not duplicated onto this row.
export const conceptPrerequisites = pgTable("concept_prerequisites", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  conceptId: uuid("concept_id")
    .notNull()
    .references(() => concepts.id),
  prerequisiteConceptId: uuid("prerequisite_concept_id")
    .notNull()
    .references(() => concepts.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
