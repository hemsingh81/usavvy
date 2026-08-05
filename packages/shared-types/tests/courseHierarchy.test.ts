import { describe, expect, it } from "vitest";
import {
  checkpointQuestionSchema,
  conceptResponseSchema,
  courseResponseSchema,
  createConceptInputSchema,
  createCourseInputSchema,
  createModuleInputSchema,
  createTopicInputSchema,
  difficultyTierSchema,
  moduleResponseSchema,
  topicResponseSchema,
} from "../src/courseHierarchy.js";

const VALID_CONCEPT = {
  id: "c1",
  topicId: "t1",
  title: "Solving quadratics",
  position: 0,
  objectives: ["Factor a quadratic", "Use the quadratic formula"],
  sourceMaterialRefs: ["doc-1"],
  boardAssetRefs: ["asset-1"],
  checkpointQuestions: [{ question: "What is the discriminant?" }],
  difficultyTier: "beginner",
  prerequisites: [{ conceptId: "c0", archived: false }],
  archivedAt: null,
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

const VALID_TOPIC = {
  id: "t1",
  moduleId: "m1",
  title: "Quadratic Equations",
  position: 0,
  archivedAt: null,
  concepts: [VALID_CONCEPT],
};

const VALID_MODULE = {
  id: "m1",
  courseId: "course1",
  title: "Algebra Basics",
  position: 0,
  archivedAt: null,
  topics: [VALID_TOPIC],
};

const VALID_COURSE = {
  id: "course1",
  title: "Intro to Algebra",
  description: "A beginner course",
  subject: "Math",
  level: "beginner",
  estimatedDurationHours: 10,
  status: "published",
  modules: [VALID_MODULE],
  createdAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
};

describe("difficultyTierSchema", () => {
  it.each(["beginner", "intermediate", "advanced"])("accepts %s", (tier) => {
    expect(() => difficultyTierSchema.parse(tier)).not.toThrow();
  });

  it("rejects an unrecognized tier", () => {
    expect(() => difficultyTierSchema.parse("expert")).toThrow();
  });
});

describe("checkpointQuestionSchema", () => {
  it("accepts a valid question", () => {
    expect(() => checkpointQuestionSchema.parse({ question: "What is x?" })).not.toThrow();
  });

  it("rejects an empty question", () => {
    expect(() => checkpointQuestionSchema.parse({ question: "" })).toThrow();
  });
});

describe("conceptResponseSchema", () => {
  it("accepts a fully-populated concept", () => {
    expect(() => conceptResponseSchema.parse(VALID_CONCEPT)).not.toThrow();
  });

  it("accepts a concept with no prerequisites and a null difficultyTier", () => {
    expect(() => conceptResponseSchema.parse({ ...VALID_CONCEPT, prerequisites: [], difficultyTier: null })).not.toThrow();
  });

  it("rejects a prerequisite entry missing the archived flag", () => {
    expect(() => conceptResponseSchema.parse({ ...VALID_CONCEPT, prerequisites: [{ conceptId: "c0" }] })).toThrow();
  });
});

describe("topicResponseSchema / moduleResponseSchema / courseResponseSchema", () => {
  it("accepts a fully-nested course tree", () => {
    expect(() => courseResponseSchema.parse(VALID_COURSE)).not.toThrow();
  });

  it("accepts a module/topic with no children yet", () => {
    expect(() => moduleResponseSchema.parse({ ...VALID_MODULE, topics: [] })).not.toThrow();
    expect(() => topicResponseSchema.parse({ ...VALID_TOPIC, concepts: [] })).not.toThrow();
  });

  it("rejects a course missing modules", () => {
    const rest = Object.fromEntries(Object.entries(VALID_COURSE).filter(([k]) => k !== "modules"));
    expect(() => courseResponseSchema.parse(rest)).toThrow();
  });
});

describe("create*InputSchema", () => {
  it("createCourseInputSchema accepts a title-only input (description optional)", () => {
    expect(() => createCourseInputSchema.parse({ title: "New Course" })).not.toThrow();
  });

  it("createCourseInputSchema rejects an empty title", () => {
    expect(() => createCourseInputSchema.parse({ title: "" })).toThrow();
  });

  it("createCourseInputSchema accepts the Story 2.2 catalog fields (subject/level/estimatedDurationHours/status), all optional", () => {
    expect(() =>
      createCourseInputSchema.parse({ title: "New Course", subject: "Math", level: "beginner", estimatedDurationHours: 10, status: "published" }),
    ).not.toThrow();
  });

  it("createCourseInputSchema rejects a negative estimatedDurationHours", () => {
    expect(() => createCourseInputSchema.parse({ title: "x", estimatedDurationHours: -1 })).toThrow();
  });

  it("createModuleInputSchema and createTopicInputSchema require a non-negative position", () => {
    expect(() => createModuleInputSchema.parse({ title: "Module 1", position: -1 })).toThrow();
    expect(() => createTopicInputSchema.parse({ title: "Topic 1", position: 0 })).not.toThrow();
  });

  it("createConceptInputSchema accepts a minimal input (all extras optional)", () => {
    expect(() => createConceptInputSchema.parse({ title: "Concept 1", position: 0 })).not.toThrow();
  });

  it("createConceptInputSchema accepts a fully-populated input with prerequisites", () => {
    expect(() =>
      createConceptInputSchema.parse({
        title: "Concept 1",
        position: 0,
        objectives: ["Learn X"],
        sourceMaterialRefs: ["doc-1"],
        boardAssetRefs: ["asset-1"],
        checkpointQuestions: [{ question: "What is X?" }],
        difficultyTier: "advanced",
        prerequisiteConceptIds: ["c0"],
      }),
    ).not.toThrow();
  });
});
