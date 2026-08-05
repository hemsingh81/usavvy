import { describe, expect, it } from "vitest";
import { DEFAULT_PRIVACY_SETTINGS, learnerPrivacySettingsSchema, privacySettingsUpdateInputSchema } from "../src/privacy.js";

describe("DEFAULT_PRIVACY_SETTINGS", () => {
  it("is a fully-populated, valid LearnerPrivacySettings object", () => {
    expect(() => learnerPrivacySettingsSchema.parse(DEFAULT_PRIVACY_SETTINGS)).not.toThrow();
  });

  it("matches FR-A-6's literal defaults exactly", () => {
    expect(DEFAULT_PRIVACY_SETTINGS).toEqual({
      publicLeaderboardSharing: false,
      cohortDisplayName: true,
      uploadsForTraining: false,
    });
  });
});

describe("learnerPrivacySettingsSchema", () => {
  it("accepts a fully-populated shape", () => {
    expect(() =>
      learnerPrivacySettingsSchema.parse({ publicLeaderboardSharing: true, cohortDisplayName: false, uploadsForTraining: true }),
    ).not.toThrow();
  });

  it("rejects a missing field — every field is required in the response shape", () => {
    expect(() => learnerPrivacySettingsSchema.parse({ publicLeaderboardSharing: true, cohortDisplayName: false })).toThrow();
  });
});

describe("privacySettingsUpdateInputSchema", () => {
  it("accepts a single-field partial update", () => {
    expect(() => privacySettingsUpdateInputSchema.parse({ publicLeaderboardSharing: true })).not.toThrow();
  });

  it("accepts a multi-field partial update", () => {
    expect(() => privacySettingsUpdateInputSchema.parse({ cohortDisplayName: false, uploadsForTraining: true })).not.toThrow();
  });

  it("rejects an empty update body", () => {
    expect(() => privacySettingsUpdateInputSchema.parse({})).toThrow();
  });
});
