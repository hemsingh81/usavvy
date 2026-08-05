import { z } from "zod";
import { explanationStyleSchema } from "./preferences.js";
import { difficultyTierSchema } from "./courseHierarchy.js";

// Story 2.4 (FR-C-4). No exact depth levels/multipliers are named anywhere in the
// PRD/epics beyond these three labels — the multiplier values applied to them are a
// documented product default (see that story's Dev Notes), the same "invent and
// document" precedent Story 2.2 set for duration buckets.
export const courseCustomizationDepthSchema = z.enum(["overview", "standard", "deep-dive"]);

export type CourseCustomizationDepth = z.infer<typeof courseCustomizationDepthSchema>;

// A genuine partial update, matching updatePreferencesInputSchema's (Story 1.4) identical
// all-optional convention. `force` lets the caller override AC #3's dependency-conflict
// block after the learner has been warned and explicitly confirmed.
export const saveCourseCustomizationInputSchema = z.object({
  deselectedTopicIds: z.array(z.string()).optional(),
  priorityTopicIds: z.array(z.string()).optional(),
  depth: courseCustomizationDepthSchema.optional(),
  explanationStyle: explanationStyleSchema.optional(),
  // Story 2.5 (FR-C-5): settable manually (AC #2's "can... manually override") or via an
  // applied placement-check proposal — both go through this same save path.
  startingDifficultyTier: difficultyTierSchema.optional(),
  force: z.boolean().optional(),
});

export type SaveCourseCustomizationInput = z.infer<typeof saveCourseCustomizationInputSchema>;

export const courseCustomizationResponseSchema = z.object({
  courseId: z.string(),
  deselectedTopicIds: z.array(z.string()),
  priorityTopicIds: z.array(z.string()),
  depth: courseCustomizationDepthSchema,
  explanationStyle: explanationStyleSchema,
  // Story 2.5 (FR-C-5): null until a placement check is confirmed or the learner manually
  // sets one — AC #3's Course-level fallback is applied by the caller (apps/web), which is
  // the one place that already has both this value and the Course's own `level` in hand.
  startingDifficultyTier: difficultyTierSchema.nullable(),
  estimatedHours: z.number().nullable(),
  updatedAt: z.string(),
});

export type CourseCustomizationResponse = z.infer<typeof courseCustomizationResponseSchema>;

// AC #3's structured warning payload — one entry per Topic that's still selected but
// depends (via its Concepts' prerequisites) on a Topic the learner just deselected.
export const dependencyConflictSchema = z.object({
  topicId: z.string(),
  topicTitle: z.string(),
  requiredByTopicId: z.string(),
  requiredByTopicTitle: z.string(),
});

export type DependencyConflict = z.infer<typeof dependencyConflictSchema>;
