import { describe, expect, it } from "vitest";
import { startCourseResponseSchema, updateToLatestVersionResponseSchema } from "../src/courseVersioning.js";

describe("startCourseResponseSchema", () => {
  it("accepts a fully-populated response", () => {
    expect(() => startCourseResponseSchema.parse({ pinnedCourseId: "c1", startedAt: "2026-01-15T00:00:00.000Z" })).not.toThrow();
  });

  it("rejects a response missing startedAt", () => {
    expect(() => startCourseResponseSchema.parse({ pinnedCourseId: "c1" })).toThrow();
  });
});

describe("updateToLatestVersionResponseSchema", () => {
  it("accepts an empty flaggedTopicTitles list", () => {
    expect(() => updateToLatestVersionResponseSchema.parse({ pinnedCourseId: "c2", flaggedTopicTitles: [] })).not.toThrow();
  });

  it("accepts a populated flaggedTopicTitles list", () => {
    expect(() => updateToLatestVersionResponseSchema.parse({ pinnedCourseId: "c2", flaggedTopicTitles: ["Old Topic"] })).not.toThrow();
  });

  it("rejects a response missing pinnedCourseId", () => {
    expect(() => updateToLatestVersionResponseSchema.parse({ flaggedTopicTitles: [] })).toThrow();
  });
});
