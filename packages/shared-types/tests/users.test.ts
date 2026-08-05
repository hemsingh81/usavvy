import { describe, expect, it } from "vitest";
import { ONBOARDING_STEPS, learnerProfileResponseSchema, onboardingStepInputSchema } from "../src/users.js";

describe("ONBOARDING_STEPS", () => {
  it("is the fixed 6-step order the wizard and resume-tracking both rely on", () => {
    expect(ONBOARDING_STEPS).toEqual(["goal", "interests", "availability", "sessionLength", "targetDate", "level"]);
  });
});

describe("learnerProfileResponseSchema", () => {
  it("accepts an all-null, not-yet-started shape", () => {
    expect(() =>
      learnerProfileResponseSchema.parse({
        goal: null,
        interests: null,
        availability: null,
        sessionLengthMinutes: null,
        targetCompletionDate: null,
        level: null,
        currentStep: 0,
        completedAt: null,
      }),
    ).not.toThrow();
  });

  it("accepts a fully completed shape", () => {
    expect(() =>
      learnerProfileResponseSchema.parse({
        goal: "learn calculus",
        interests: ["math", "physics"],
        availability: { monday: 1, tuesday: 0, wednesday: 1, thursday: 0, friday: 1, saturday: 2, sunday: 0 },
        sessionLengthMinutes: 45,
        targetCompletionDate: "2026-12-01",
        level: "beginner",
        currentStep: 6,
        completedAt: "2026-08-05T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects an invalid level value", () => {
    expect(() =>
      learnerProfileResponseSchema.parse({
        goal: null,
        interests: null,
        availability: null,
        sessionLengthMinutes: null,
        targetCompletionDate: null,
        level: "expert",
        currentStep: 0,
        completedAt: null,
      }),
    ).toThrow();
  });
});

describe("onboardingStepInputSchema", () => {
  it("accepts a valid goal step", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "goal", value: "learn calculus" })).not.toThrow();
  });

  it("rejects an empty goal", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "goal", value: "" })).toThrow();
  });

  it("accepts a valid interests step", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "interests", value: ["math", "physics"] })).not.toThrow();
  });

  it("rejects an empty interests array", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "interests", value: [] })).toThrow();
  });

  it("accepts a valid availability step with all 7 weekdays", () => {
    expect(() =>
      onboardingStepInputSchema.parse({
        step: "availability",
        value: { monday: 1, tuesday: 0, wednesday: 1, thursday: 0, friday: 1, saturday: 2, sunday: 0 },
      }),
    ).not.toThrow();
  });

  it("rejects an availability step missing a weekday", () => {
    expect(() =>
      onboardingStepInputSchema.parse({
        step: "availability",
        value: { monday: 1, tuesday: 0, wednesday: 1, thursday: 0, friday: 1, saturday: 2 },
      }),
    ).toThrow();
  });

  it("rejects an availability hour out of 0-24 bounds", () => {
    expect(() =>
      onboardingStepInputSchema.parse({
        step: "availability",
        value: { monday: 25, tuesday: 0, wednesday: 1, thursday: 0, friday: 1, saturday: 2, sunday: 0 },
      }),
    ).toThrow();
  });

  it("accepts a valid sessionLength step", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "sessionLength", value: 45 })).not.toThrow();
  });

  it("rejects a sessionLength below the minimum bound", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "sessionLength", value: 5 })).toThrow();
  });

  it("accepts a valid targetDate step", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "targetDate", value: "2999-01-01" })).not.toThrow();
  });

  it("accepts an explicit null targetDate (the skip action)", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "targetDate", value: null })).not.toThrow();
  });

  it("rejects a targetDate in the past", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "targetDate", value: "2000-01-01" })).toThrow();
  });

  it("rejects a missing targetDate value (must be an explicit choice)", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "targetDate" })).toThrow();
  });

  it("accepts a valid level step", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "level", value: "intermediate" })).not.toThrow();
  });

  it("rejects an unrecognized level value", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "level", value: "expert" })).toThrow();
  });

  it("rejects an unrecognized step key", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "not-a-real-step", value: "x" })).toThrow();
  });

  it("rejects a value shape that doesn't match its own step (e.g. a number for goal)", () => {
    expect(() => onboardingStepInputSchema.parse({ step: "goal", value: 123 })).toThrow();
  });
});
