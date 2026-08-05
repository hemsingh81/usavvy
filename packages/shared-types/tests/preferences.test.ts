import { describe, expect, it } from "vitest";
import { DEFAULT_LEARNER_PREFERENCES, learnerPreferencesSchema, preferencesUpdateInputSchema } from "../src/preferences.js";

describe("DEFAULT_LEARNER_PREFERENCES", () => {
  it("is a fully-populated, valid LearnerPreferences object", () => {
    expect(() => learnerPreferencesSchema.parse(DEFAULT_LEARNER_PREFERENCES)).not.toThrow();
  });
});

describe("learnerPreferencesSchema", () => {
  it("accepts a fully-populated shape", () => {
    expect(() =>
      learnerPreferencesSchema.parse({
        voiceEnabled: true,
        speechRate: 1.25,
        boardTheme: "dark",
        explanationStyle: "detailed",
        captionsEnabled: false,
        reducedMotion: true,
        colorTheme: "midnight",
      }),
    ).not.toThrow();
  });

  it("rejects a missing field — every field is required in the response shape", () => {
    expect(() =>
      learnerPreferencesSchema.parse({
        voiceEnabled: true,
        speechRate: 1,
        boardTheme: "dark",
        explanationStyle: "concise",
        captionsEnabled: false,
        reducedMotion: false,
        // colorTheme omitted
      }),
    ).toThrow();
  });

  it("rejects an invalid boardTheme value", () => {
    expect(() =>
      learnerPreferencesSchema.parse({
        voiceEnabled: true,
        speechRate: 1,
        boardTheme: "neon",
        explanationStyle: "concise",
        captionsEnabled: false,
        reducedMotion: false,
        colorTheme: "indigo-focus",
      }),
    ).toThrow();
  });

  it("rejects an invalid explanationStyle value", () => {
    expect(() =>
      learnerPreferencesSchema.parse({
        voiceEnabled: true,
        speechRate: 1,
        boardTheme: "dark",
        explanationStyle: "sarcastic",
        captionsEnabled: false,
        reducedMotion: false,
        colorTheme: "indigo-focus",
      }),
    ).toThrow();
  });

  it("rejects an invalid colorTheme value", () => {
    expect(() =>
      learnerPreferencesSchema.parse({
        voiceEnabled: true,
        speechRate: 1,
        boardTheme: "dark",
        explanationStyle: "concise",
        captionsEnabled: false,
        reducedMotion: false,
        colorTheme: "neon",
      }),
    ).toThrow();
  });

  it.each(["indigo-focus", "midnight", "high-contrast", "warm-paper"] as const)("accepts colorTheme %s", (colorTheme) => {
    expect(() =>
      learnerPreferencesSchema.parse({
        voiceEnabled: true,
        speechRate: 1,
        boardTheme: "dark",
        explanationStyle: "concise",
        captionsEnabled: false,
        reducedMotion: false,
        colorTheme,
      }),
    ).not.toThrow();
  });
});

describe("preferencesUpdateInputSchema", () => {
  it("accepts a single-field partial update", () => {
    expect(() => preferencesUpdateInputSchema.parse({ voiceEnabled: false })).not.toThrow();
  });

  it("accepts a multi-field partial update", () => {
    expect(() => preferencesUpdateInputSchema.parse({ boardTheme: "paper", captionsEnabled: true })).not.toThrow();
  });

  it("rejects an empty update body", () => {
    expect(() => preferencesUpdateInputSchema.parse({})).toThrow();
  });

  it("rejects a speechRate below the minimum bound", () => {
    expect(() => preferencesUpdateInputSchema.parse({ speechRate: 0.25 })).toThrow();
  });

  it("rejects a speechRate above the maximum bound", () => {
    expect(() => preferencesUpdateInputSchema.parse({ speechRate: 3 })).toThrow();
  });

  it("accepts a speechRate at each bound", () => {
    expect(() => preferencesUpdateInputSchema.parse({ speechRate: 0.5 })).not.toThrow();
    expect(() => preferencesUpdateInputSchema.parse({ speechRate: 2 })).not.toThrow();
  });

  it("rejects an unrecognized boardTheme", () => {
    expect(() => preferencesUpdateInputSchema.parse({ boardTheme: "neon" })).toThrow();
  });

  it("rejects an unrecognized explanationStyle", () => {
    expect(() => preferencesUpdateInputSchema.parse({ explanationStyle: "sarcastic" })).toThrow();
  });

  it("accepts a colorTheme-only partial update", () => {
    expect(() => preferencesUpdateInputSchema.parse({ colorTheme: "midnight" })).not.toThrow();
  });

  it("rejects an unrecognized colorTheme", () => {
    expect(() => preferencesUpdateInputSchema.parse({ colorTheme: "neon" })).toThrow();
  });
});
