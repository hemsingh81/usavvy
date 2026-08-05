import { z } from "zod";

// Story 1.11 (FR-A-11). Deliberately NOT a discriminated union with hardcoded
// "board_session"/"assignment"/"cohort_session" variants — those concrete shapes belong
// to Epic 3/6/7's own future stories, none of which exist yet. This generic shape is the
// full extent of this story's contract; whatever those epics actually need is their own
// design decision, not this one's to guess at now.
export const activityHistoryEntrySchema = z.object({
  type: z.string(),
  occurredAt: z.string(),
  label: z.string().min(1),
  // Review finding: rendered directly into an <a href> (ActivityHistoryPage.tsx) with no
  // other validation anywhere in the pipeline — confirmed independently by both Blind
  // Hunter and Edge Case Hunter that an unconstrained value would let a javascript: URI
  // or an external URL pass through and render as a live, clickable link. Every entry
  // this AC describes ("links to that session's Transcript"/"its feedback"/"its
  // recording") is an in-app path, so constraining to a relative path is the real
  // contract, not an arbitrary tightening.
  sourceUrl: z.string().min(1).refine((value) => value.startsWith("/"), { message: "sourceUrl must be a relative in-app path" }),
});

export type ActivityHistoryEntry = z.infer<typeof activityHistoryEntrySchema>;

export const activityHistoryResponseSchema = z.array(activityHistoryEntrySchema);
