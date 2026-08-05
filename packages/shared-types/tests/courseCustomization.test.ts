import { describe, expect, it } from "vitest";
import {
  courseCustomizationDepthSchema,
  courseCustomizationResponseSchema,
  dependencyConflictSchema,
  saveCourseCustomizationInputSchema,
} from "../src/courseCustomization.js";

describe("courseCustomizationDepthSchema", () => {
  it.each(["overview", "standard", "deep-dive"])("accepts %s", (depth) => {
    expect(() => courseCustomizationDepthSchema.parse(depth)).not.toThrow();
  });

  it("rejects an unrecognized depth", () => {
    expect(() => courseCustomizationDepthSchema.parse("expert")).toThrow();
  });
});

describe("saveCourseCustomizationInputSchema", () => {
  it("accepts an empty object (partial update, all fields optional)", () => {
    expect(() => saveCourseCustomizationInputSchema.parse({})).not.toThrow();
  });

  it("accepts a fully-populated input", () => {
    expect(() =>
      saveCourseCustomizationInputSchema.parse({
        deselectedTopicIds: ["t1"],
        priorityTopicIds: ["t2"],
        depth: "deep-dive",
        explanationStyle: "analogy-first",
        force: true,
      }),
    ).not.toThrow();
  });

  it("rejects an invalid explanationStyle", () => {
    expect(() => saveCourseCustomizationInputSchema.parse({ explanationStyle: "verbose" })).toThrow();
  });
});

describe("courseCustomizationResponseSchema", () => {
  const VALID_RESPONSE = {
    courseId: "course1",
    deselectedTopicIds: ["t1"],
    priorityTopicIds: ["t2"],
    depth: "standard",
    explanationStyle: "concise",
    estimatedHours: 7.5,
    updatedAt: "2026-01-15T00:00:00.000Z",
  };

  it("accepts a fully-populated response", () => {
    expect(() => courseCustomizationResponseSchema.parse(VALID_RESPONSE)).not.toThrow();
  });

  it("accepts a null estimatedHours (course has no estimatedDurationHours)", () => {
    expect(() => courseCustomizationResponseSchema.parse({ ...VALID_RESPONSE, estimatedHours: null })).not.toThrow();
  });

  it("rejects a response missing depth", () => {
    const rest = Object.fromEntries(Object.entries(VALID_RESPONSE).filter(([k]) => k !== "depth"));
    expect(() => courseCustomizationResponseSchema.parse(rest)).toThrow();
  });
});

describe("dependencyConflictSchema", () => {
  it("accepts a fully-populated conflict", () => {
    expect(() =>
      dependencyConflictSchema.parse({
        topicId: "t1",
        topicTitle: "Basics",
        requiredByTopicId: "t2",
        requiredByTopicTitle: "Advanced",
      }),
    ).not.toThrow();
  });

  it("rejects a conflict missing requiredByTopicTitle", () => {
    expect(() => dependencyConflictSchema.parse({ topicId: "t1", topicTitle: "Basics", requiredByTopicId: "t2" })).toThrow();
  });
});
