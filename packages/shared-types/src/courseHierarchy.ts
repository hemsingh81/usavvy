import { z } from "zod";

// Story 2.1 (FR-C-1). Same 3-tier scale as LearnerLevel (packages/shared-types/src/users.ts)
// but kept as its own schema — a Concept's difficulty and a learner's own level are
// distinct domain concepts that happen to share a scale today.
export const difficultyTierSchema = z.enum(["beginner", "intermediate", "advanced"]);

export type DifficultyTier = z.infer<typeof difficultyTierSchema>;

// The minimal shape AC #1 actually names ("checkpoint questions") — no answer/grading
// shape invented here, that's Epic 6's (assignments) concern.
export const checkpointQuestionSchema = z.object({ question: z.string().min(1) });

export type CheckpointQuestion = z.infer<typeof checkpointQuestionSchema>;

// A prerequisite entry carries a computed `archived` flag (AC #3's "flagged rather than
// silently left dangling") — not a stored column, derived at read time from whether the
// referenced concept has been archived.
const conceptPrerequisiteSchema = z.object({
  conceptId: z.string(),
  archived: z.boolean(),
});

export const conceptResponseSchema = z.object({
  id: z.string(),
  topicId: z.string(),
  title: z.string(),
  position: z.number().int(),
  objectives: z.array(z.string()),
  sourceMaterialRefs: z.array(z.string()),
  boardAssetRefs: z.array(z.string()),
  checkpointQuestions: z.array(checkpointQuestionSchema),
  difficultyTier: difficultyTierSchema.nullable(),
  prerequisites: z.array(conceptPrerequisiteSchema),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ConceptResponse = z.infer<typeof conceptResponseSchema>;

export const topicResponseSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  title: z.string(),
  position: z.number().int(),
  archivedAt: z.string().nullable(),
  concepts: z.array(conceptResponseSchema),
});

export type TopicResponse = z.infer<typeof topicResponseSchema>;

export const moduleResponseSchema = z.object({
  id: z.string(),
  courseId: z.string(),
  title: z.string(),
  position: z.number().int(),
  archivedAt: z.string().nullable(),
  topics: z.array(topicResponseSchema),
});

export type ModuleResponse = z.infer<typeof moduleResponseSchema>;

// Story 2.2 (FR-C-2). No draft->review->published workflow with reviewer sign-off exists
// yet (that's a later Epic 9 story) — this is just enough to distinguish "appears in the
// catalog" from "doesn't." Defined here (not in catalog.ts) since catalog.ts already
// depends on this file for difficultyTierSchema — avoids a circular import.
export const courseStatusSchema = z.enum(["draft", "published"]);

export type CourseStatus = z.infer<typeof courseStatusSchema>;

export const courseResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  subject: z.string().nullable(),
  level: difficultyTierSchema.nullable(),
  estimatedDurationHours: z.number().nullable(),
  status: courseStatusSchema,
  // Story 2.3 (FR-C-3): opaque strings, same convention as Concept's own
  // objectives/sourceMaterialRefs/boardAssetRefs — no inter-course dependency graph, no
  // StoragePort-backed asset (see that story's Dev Notes for why).
  prerequisites: z.array(z.string()),
  outcomes: z.array(z.string()),
  sampleBoardAssetRef: z.string().nullable(),
  // Story 2.6 (FR-C-6): computed by resolveCourseForLearner per request, not stored —
  // whether the returned tree is the learner's pinned (older) version, and where the
  // group's latest version lives if a newer one exists (AC #2/#3).
  isPinnedToOlderVersion: z.boolean(),
  latestVersionId: z.string().nullable(),
  modules: z.array(moduleResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CourseResponse = z.infer<typeof courseResponseSchema>;

export const createCourseInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  subject: z.string().optional(),
  level: difficultyTierSchema.optional(),
  estimatedDurationHours: z.number().nonnegative().optional(),
  status: courseStatusSchema.optional(),
  // Review finding: a bare z.string() let an empty-string entry through, which rendered as
  // an invisible, unlabeled bullet on the detail page.
  prerequisites: z.array(z.string().min(1)).optional(),
  outcomes: z.array(z.string().min(1)).optional(),
  sampleBoardAssetRef: z.string().optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseInputSchema>;

export const createModuleInputSchema = z.object({
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export type CreateModuleInput = z.infer<typeof createModuleInputSchema>;

// Topics have the identical shape to modules (title + position) — a separate type alias,
// not a reused import, since they're distinct entities that happen to share a shape today.
export const createTopicInputSchema = z.object({
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export type CreateTopicInput = z.infer<typeof createTopicInputSchema>;

export const createConceptInputSchema = z.object({
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
  objectives: z.array(z.string()).optional(),
  sourceMaterialRefs: z.array(z.string()).optional(),
  boardAssetRefs: z.array(z.string()).optional(),
  checkpointQuestions: z.array(checkpointQuestionSchema).optional(),
  difficultyTier: difficultyTierSchema.optional(),
  prerequisiteConceptIds: z.array(z.string()).optional(),
});

export type CreateConceptInput = z.infer<typeof createConceptInputSchema>;

// Story 2.13 (FR-C-10). The nested tree `gateway`'s outline-confirmation orchestration
// sends to `courses`' internal-only `POST /courses/custom` — one call materializes an
// entire learner-confirmed outline (course + one default module + every topic/concept)
// rather than the multi-call shape createCourseInputSchema/createModuleInputSchema/etc.
// use for catalog-content authoring, since the caller here already has the whole tree.
export const createCustomCourseConceptInputSchema = z.object({
  title: z.string().min(1),
  priority: z.boolean(),
  sourcePageRangeStart: z.number().int().nullable(),
  sourcePageRangeEnd: z.number().int().nullable(),
});

export type CreateCustomCourseConceptInput = z.infer<typeof createCustomCourseConceptInputSchema>;

export const createCustomCourseTopicInputSchema = z.object({
  title: z.string().min(1),
  priority: z.boolean(),
  concepts: z.array(createCustomCourseConceptInputSchema).min(1),
});

export type CreateCustomCourseTopicInput = z.infer<typeof createCustomCourseTopicInputSchema>;

export const createCustomCourseInputSchema = z.object({
  title: z.string().min(1),
  topics: z.array(createCustomCourseTopicInputSchema).min(1),
});

export type CreateCustomCourseInput = z.infer<typeof createCustomCourseInputSchema>;

export const createCustomCourseResponseSchema = z.object({ courseId: z.string() });

export type CreateCustomCourseResponse = z.infer<typeof createCustomCourseResponseSchema>;
