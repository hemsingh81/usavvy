import { describe, expect, it } from "vitest";
import { activityHistoryEntrySchema, activityHistoryResponseSchema } from "../src/activityHistory.js";

const VALID_ENTRY = {
  type: "board_session",
  occurredAt: "2026-01-15T00:00:00.000Z",
  label: "Studied: Quadratic Equations",
  sourceUrl: "/sessions/abc123/transcript",
};

describe("activityHistoryEntrySchema", () => {
  it("accepts a fully-populated entry", () => {
    expect(() => activityHistoryEntrySchema.parse(VALID_ENTRY)).not.toThrow();
  });

  it.each(["type", "occurredAt", "label", "sourceUrl"] as const)("rejects a shape missing %s", (key) => {
    const rest = Object.fromEntries(Object.entries(VALID_ENTRY).filter(([k]) => k !== key));
    expect(() => activityHistoryEntrySchema.parse(rest)).toThrow();
  });
});

describe("activityHistoryResponseSchema", () => {
  it("accepts an empty array (the only real case today — no Epic 3/6/7 source data exists yet)", () => {
    expect(() => activityHistoryResponseSchema.parse([])).not.toThrow();
  });

  it("accepts an array of valid entries", () => {
    expect(() => activityHistoryResponseSchema.parse([VALID_ENTRY, { ...VALID_ENTRY, type: "assignment" }])).not.toThrow();
  });

  it("rejects an array containing an invalid entry", () => {
    expect(() => activityHistoryResponseSchema.parse([VALID_ENTRY, { bad: "shape" }])).toThrow();
  });
});
