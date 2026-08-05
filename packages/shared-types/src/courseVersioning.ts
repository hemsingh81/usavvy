import { z } from "zod";

// Story 2.6 (FR-C-6). AC #1: "access... first recorded" — idempotent, not a real learning
// session (Epic 3/4's future job).
export const startCourseResponseSchema = z.object({
  pinnedCourseId: z.string(),
  startedAt: z.string(),
});

export type StartCourseResponse = z.infer<typeof startCourseResponseSchema>;

// AC #4: a plain list of Topic titles that no longer exist in the new version and were
// therefore dropped from the learner's saved customisation — "flagged for review," not
// silently kept (would break future saves) or silently vanished.
export const updateToLatestVersionResponseSchema = z.object({
  pinnedCourseId: z.string(),
  flaggedTopicTitles: z.array(z.string()),
});

export type UpdateToLatestVersionResponse = z.infer<typeof updateToLatestVersionResponseSchema>;
