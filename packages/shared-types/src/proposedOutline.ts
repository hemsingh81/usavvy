import { z } from "zod";

// Story 2.13 (FR-C-10). The learner-editable proposed outline Story 2.12 generated —
// `priority` is new in this story (AC #1's "mark any of them as priority"); everything
// else mirrors services/ingestion's proposedTopics/proposedConcepts columns directly.
export const proposedConceptResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  priority: z.boolean(),
  sourcePageRangeStart: z.number().int().nullable(),
  sourcePageRangeEnd: z.number().int().nullable(),
  safetyFlagged: z.boolean(),
});

export type ProposedConceptResponse = z.infer<typeof proposedConceptResponseSchema>;

export const proposedTopicResponseSchema = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  priority: z.boolean(),
  concepts: z.array(proposedConceptResponseSchema),
});

export type ProposedTopicResponse = z.infer<typeof proposedTopicResponseSchema>;

// Review finding: .trim() before .min(1) rejects a whitespace-only title (e.g. "   ")
// that a direct API call could send bypassing the UI's own onBlur .trim() guard.
export const renameProposedItemInputSchema = z.object({ title: z.string().trim().min(1) });

export type RenameProposedItemInput = z.infer<typeof renameProposedItemInputSchema>;

export const setProposedItemPriorityInputSchema = z.object({ priority: z.boolean() });

export type SetProposedItemPriorityInput = z.infer<typeof setProposedItemPriorityInputSchema>;

export const reorderProposedTopicsInputSchema = z.object({ orderedTopicIds: z.array(z.uuid()).min(1) });

export type ReorderProposedTopicsInput = z.infer<typeof reorderProposedTopicsInputSchema>;

export const mergeProposedConceptsInputSchema = z.object({ keepConceptId: z.uuid(), mergeConceptId: z.uuid() });

export type MergeProposedConceptsInput = z.infer<typeof mergeProposedConceptsInputSchema>;

// Story 2.13. `POST /uploads/outline/confirm`'s response — a discriminated union since
// `gateway`'s orchestration branches on it: an already-confirmed customCourseId returns
// the existing courseId with no further work (idempotent, AC #2), otherwise the full
// materialization-ready outline is returned for gateway to hand to `courses`.
export const confirmOutlineResponseSchema = z.discriminatedUnion("alreadyConfirmed", [
  z.object({ alreadyConfirmed: z.literal(true), courseId: z.string() }),
  z.object({
    alreadyConfirmed: z.literal(false),
    title: z.string(),
    topics: z.array(proposedTopicResponseSchema).min(1),
  }),
]);

export type ConfirmOutlineResponse = z.infer<typeof confirmOutlineResponseSchema>;
