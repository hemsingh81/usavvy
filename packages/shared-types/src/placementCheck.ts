import { z } from "zod";
import { difficultyTierSchema } from "./courseHierarchy.js";

// Story 2.5 (FR-C-5). Sampled from Concept-level checkpointQuestions (Story 2.1) — no
// answer key exists for them (that story's own explicit design), so this is a self-rated
// mastery check, not a graded one.
export const placementCheckQuestionSchema = z.object({
  topicId: z.string(),
  topicTitle: z.string(),
  conceptId: z.string(),
  question: z.string(),
});

export type PlacementCheckQuestion = z.infer<typeof placementCheckQuestionSchema>;

export const placementCheckQuestionsResponseSchema = z.array(placementCheckQuestionSchema);

export const placementCheckAnswerInputSchema = z.object({
  topicId: z.string(),
  conceptId: z.string(),
  masteryDemonstrated: z.boolean(),
});

export type PlacementCheckAnswerInput = z.infer<typeof placementCheckAnswerInputSchema>;

export const scorePlacementCheckInputSchema = z.object({
  answers: z.array(placementCheckAnswerInputSchema),
});

export type ScorePlacementCheckInput = z.infer<typeof scorePlacementCheckInputSchema>;

// AC #2/#4: a reviewable proposal, not a saved result — the caller applies it (or not) via
// the existing PUT .../customization (Story 2.4).
export const placementCheckProposalSchema = z.object({
  proposedDeselectedTopicIds: z.array(z.string()),
  proposedStartingDifficultyTier: difficultyTierSchema,
});

export type PlacementCheckProposal = z.infer<typeof placementCheckProposalSchema>;
