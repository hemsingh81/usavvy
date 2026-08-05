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
