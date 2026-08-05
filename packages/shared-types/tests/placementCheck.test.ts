import { describe, expect, it } from "vitest";
import {
  placementCheckAnswerInputSchema,
  placementCheckProposalSchema,
  placementCheckQuestionSchema,
  placementCheckQuestionsResponseSchema,
  scorePlacementCheckInputSchema,
} from "../src/placementCheck.js";

describe("placementCheckQuestionSchema / placementCheckQuestionsResponseSchema", () => {
  const VALID_QUESTION = { topicId: "t1", topicTitle: "Basics", conceptId: "c1", question: "What is a variable?" };

  it("accepts a fully-populated question", () => {
    expect(() => placementCheckQuestionSchema.parse(VALID_QUESTION)).not.toThrow();
  });

  it("accepts an array of questions, including an empty array (no placement check available)", () => {
    expect(() => placementCheckQuestionsResponseSchema.parse([VALID_QUESTION])).not.toThrow();
    expect(() => placementCheckQuestionsResponseSchema.parse([])).not.toThrow();
  });

  it("rejects a question missing topicTitle", () => {
    const { topicTitle, ...rest } = VALID_QUESTION;
    void topicTitle;
    expect(() => placementCheckQuestionSchema.parse(rest)).toThrow();
  });
});

describe("scorePlacementCheckInputSchema / placementCheckAnswerInputSchema", () => {
  it("accepts an empty answers array", () => {
    expect(() => scorePlacementCheckInputSchema.parse({ answers: [] })).not.toThrow();
  });

  it("accepts a fully-populated answer", () => {
    expect(() => placementCheckAnswerInputSchema.parse({ topicId: "t1", conceptId: "c1", masteryDemonstrated: true })).not.toThrow();
  });

  it("rejects an answer with a non-boolean masteryDemonstrated", () => {
    expect(() => placementCheckAnswerInputSchema.parse({ topicId: "t1", conceptId: "c1", masteryDemonstrated: "yes" })).toThrow();
  });
});

describe("placementCheckProposalSchema", () => {
  it.each(["beginner", "intermediate", "advanced"])("accepts proposedStartingDifficultyTier %s", (tier) => {
    expect(() => placementCheckProposalSchema.parse({ proposedDeselectedTopicIds: [], proposedStartingDifficultyTier: tier })).not.toThrow();
  });

  it("rejects an unrecognized tier", () => {
    expect(() =>
      placementCheckProposalSchema.parse({ proposedDeselectedTopicIds: [], proposedStartingDifficultyTier: "expert" }),
    ).toThrow();
  });
});
