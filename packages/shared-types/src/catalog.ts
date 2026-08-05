import { z } from "zod";
import { courseStatusSchema, difficultyTierSchema } from "./courseHierarchy.js";

// No exact bucket boundaries are specified anywhere in the PRD/epics/UX docs — a
// documented product default (see the story's own Dev Notes for the hour ranges each
// bucket maps to), not an invented-then-forgotten guess.
export const durationBucketSchema = z.enum(["short", "medium", "long"]);

export type DurationBucket = z.infer<typeof durationBucketSchema>;

// The lightweight per-entry shape the catalog LISTING needs (AC #1: "subject, level, and
// duration visible on each entry") — distinct from courseHierarchy.ts's courseResponseSchema,
// which returns the full nested Module/Topic/Concept tree for the detail/authoring path.
export const courseSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  subject: z.string().nullable(),
  level: difficultyTierSchema.nullable(),
  estimatedDurationHours: z.number().nullable(),
  status: courseStatusSchema,
});

export type CourseSummary = z.infer<typeof courseSummarySchema>;

export const catalogSearchParamsSchema = z.object({
  subject: z.string().optional(),
  level: difficultyTierSchema.optional(),
  durationBucket: durationBucketSchema.optional(),
  q: z.string().optional(),
});

export type CatalogSearchParams = z.infer<typeof catalogSearchParamsSchema>;

export const catalogListResponseSchema = z.array(courseSummarySchema);
