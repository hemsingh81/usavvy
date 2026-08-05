import { describe, expect, it } from "vitest";
import { dataExportSchema } from "../src/dataExport.js";

const VALID_EXPORT = {
  account: {
    id: "u1",
    email: "ananya@example.com",
    displayName: "Ananya",
    memberSince: "2026-01-15T00:00:00.000Z",
    birthdate: "1995-01-01",
    role: "student",
  },
  learnerProfile: {
    goal: "learn calculus",
    interests: ["math"],
    availability: null,
    sessionLengthMinutes: 30,
    targetCompletionDate: null,
    level: "beginner",
    currentStep: 6,
    completedAt: "2026-01-16T00:00:00.000Z",
  },
  preferences: {
    voiceEnabled: true,
    speechRate: 1,
    boardTheme: "dark",
    explanationStyle: "concise",
    captionsEnabled: false,
    reducedMotion: false,
    colorTheme: "indigo-focus",
  },
  privacySettings: {
    publicLeaderboardSharing: false,
    cohortDisplayName: true,
    uploadsForTraining: false,
  },
};

describe("dataExportSchema", () => {
  it("accepts a fully-populated shape combining all four sections", () => {
    expect(() => dataExportSchema.parse(VALID_EXPORT)).not.toThrow();
  });

  it.each(["account", "learnerProfile", "preferences", "privacySettings"] as const)(
    "rejects a shape missing the %s section",
    (key) => {
      const rest = Object.fromEntries(Object.entries(VALID_EXPORT).filter(([k]) => k !== key));
      expect(() => dataExportSchema.parse(rest)).toThrow();
    },
  );
});
