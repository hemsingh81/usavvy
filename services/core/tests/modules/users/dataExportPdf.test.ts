import { describe, expect, it } from "vitest";
import { generateDataExportPdf } from "../../../src/modules/users/dataExportPdf.js";
import type { DataExport } from "@usavvy/shared-types";

const SAMPLE_EXPORT: DataExport = {
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
  },
  privacySettings: {
    publicLeaderboardSharing: false,
    cohortDisplayName: true,
    uploadsForTraining: false,
  },
};

describe("generateDataExportPdf", () => {
  it("returns a non-empty Buffer starting with the PDF magic bytes", async () => {
    const buffer = await generateDataExportPdf(SAMPLE_EXPORT);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
