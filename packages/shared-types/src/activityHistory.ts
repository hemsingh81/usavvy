import { z } from "zod";

// Story 1.11 (FR-A-11). Deliberately NOT a discriminated union with hardcoded
// "board_session"/"assignment"/"cohort_session" variants — those concrete shapes belong
// to Epic 3/6/7's own future stories, none of which exist yet. This generic shape is the
// full extent of this story's contract; whatever those epics actually need is their own
// design decision, not this one's to guess at now.
export const activityHistoryEntrySchema = z.object({
  type: z.string(),
  occurredAt: z.string(),
  label: z.string(),
  sourceUrl: z.string(),
});

export type ActivityHistoryEntry = z.infer<typeof activityHistoryEntrySchema>;

export const activityHistoryResponseSchema = z.array(activityHistoryEntrySchema);
