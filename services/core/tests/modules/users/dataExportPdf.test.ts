import { describe, expect, it } from "vitest";
import { formatFieldValue, generateDataExportPdf } from "../../../src/modules/users/dataExportPdf.js";
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
    colorTheme: "indigo-focus",
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

  it("renders a populated availability document successfully (regression: previously produced no error but silently rendered [object Object])", async () => {
    const buffer = await generateDataExportPdf({
      ...SAMPLE_EXPORT,
      learnerProfile: {
        ...SAMPLE_EXPORT.learnerProfile,
        availability: { monday: 1, tuesday: 0, wednesday: 1, thursday: 0, friday: 1, saturday: 2, sunday: 0 },
      },
    });

    expect(buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});

describe("formatFieldValue (review finding: naive String(value) rendered a nested object as the literal text \"[object Object]\")", () => {
  it("renders null/undefined as an em dash", () => {
    expect(formatFieldValue(null)).toBe("—");
    expect(formatFieldValue(undefined)).toBe("—");
  });

  it("renders a plain value via String()", () => {
    expect(formatFieldValue("learn calculus")).toBe("learn calculus");
    expect(formatFieldValue(30)).toBe("30");
  });

  it("renders an availability-shaped object as readable key: value pairs, not [object Object]", () => {
    const result = formatFieldValue({ monday: 1, tuesday: 0 });

    expect(result).not.toContain("[object Object]");
    expect(result).toBe("monday: 1, tuesday: 0");
  });

  it("renders an array joined with semicolons, not commas (so a comma inside one item isn't mistaken for an item boundary)", () => {
    expect(formatFieldValue(["math", "physics"])).toBe("math; physics");
    expect(formatFieldValue(["a, b", "c"])).toBe("a, b; c");
  });

  it("renders an empty array as an em dash", () => {
    expect(formatFieldValue([])).toBe("—");
  });
});
