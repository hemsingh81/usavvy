import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { CheckpointQuestion, CourseCustomizationDepth, CourseStatus, DifficultyTier, ExplanationStyle } from "@usavvy/shared-types";

// Story 2.1 (FR-C-1). Same uuidv7() default every other service's tables use
// (Consistency Conventions) — verified live against the running container in Story 1.0.
const uuidv7Default = sql`uuidv7()`;

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().default(uuidv7Default),
  title: text("title").notNull(),
  description: text("description"),
  // Story 2.13 (FR-C-10): nullable, opaque cross-service reference (services/core owns the
  // real User row) — same convention as courseCustomizations.userId. Null means "shared
  // catalog content" (existing behavior, completely unchanged); set means "a learner's own
  // private custom course" — see getCourse's new ownership check and searchCourses' new
  // ownerId IS NULL condition, both added by this story.
  ownerId: text("owner_id"),
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
  // Story 2.3 (FR-C-3): detail-page fields, opaque strings — same convention as
  // concepts.objectives/sourceMaterialRefs/boardAssetRefs below.
  prerequisites: text("prerequisites").array(),
  outcomes: text("outcomes").array(),
  sampleBoardAssetRef: text("sample_board_asset_ref"),
  // Story 2.6 (FR-C-6): a new content version is a whole new row (see that story's Dev
  // Notes — no in-place content editing exists). `versionNumber` is deliberately NOT named
  // `version` — that column below is the pre-existing, unrelated optimistic-concurrency
  // bump counter (Consistency Conventions). NULL `versionGroupId` means "this row is the
  // root of its own version group" (its own `id` is the group key) — avoids an awkward
  // self-referential insert for a Course's very first version.
  versionGroupId: uuid("version_group_id").references((): AnyPgColumn => courses.id),
  versionNumber: integer("version_number").notNull().default(1),
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

// Story 2.4 (FR-C-4). userId is an opaque cross-service reference (services/core owns the
// real User row) — same pattern every cross-service id in this codebase already uses, not
// a real FK. One row per (userId, courseId): the composite unique index is the upsert
// target for saveCourseCustomization.
export const courseCustomizations = pgTable(
  "course_customizations",
  {
    id: uuid("id").primaryKey().default(uuidv7Default),
    userId: text("user_id").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    deselectedTopicIds: text("deselected_topic_ids").array(),
    priorityTopicIds: text("priority_topic_ids").array(),
    depth: text("depth").notNull().default("standard").$type<CourseCustomizationDepth>(),
    explanationStyle: text("explanation_style").notNull().default("concise").$type<ExplanationStyle>(),
    // Story 2.5 (FR-C-5): null until a placement check is confirmed or the learner
    // manually sets one — no DB-level default, unlike depth/explanationStyle above,
    // since "unset" is itself a meaningful state here (falls back to the Course's own
    // `level` at display time), not something with a sensible fixed default.
    startingDifficultyTier: text("starting_difficulty_tier").$type<DifficultyTier>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    version: integer("version").notNull().default(1),
  },
  (table) => [uniqueIndex("course_customizations_user_course_idx").on(table.userId, table.courseId)],
);

// Story 2.6 (FR-C-6). AC #1: one pin per learner per version group (versionGroupId is
// always a ROOT course id, never null — see the courses table's own versionGroupId note).
export const learnerCoursePins = pgTable(
  "learner_course_pins",
  {
    id: uuid("id").primaryKey().default(uuidv7Default),
    userId: text("user_id").notNull(),
    versionGroupId: uuid("version_group_id")
      .notNull()
      .references(() => courses.id),
    pinnedCourseId: uuid("pinned_course_id")
      .notNull()
      .references(() => courses.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("learner_course_pins_user_group_idx").on(table.userId, table.versionGroupId)],
);
