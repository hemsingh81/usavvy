import { describe, expect, it } from "vitest";
import { catalogSearchParamsSchema, courseSummarySchema, durationBucketSchema } from "../src/catalog.js";
import { courseStatusSchema } from "../src/courseHierarchy.js";

describe("courseStatusSchema", () => {
  it.each(["draft", "published"])("accepts %s", (status) => {
    expect(() => courseStatusSchema.parse(status)).not.toThrow();
  });

  it("rejects an unrecognized status", () => {
    expect(() => courseStatusSchema.parse("archived")).toThrow();
  });
});

describe("durationBucketSchema", () => {
  it.each(["short", "medium", "long"])("accepts %s", (bucket) => {
    expect(() => durationBucketSchema.parse(bucket)).not.toThrow();
  });

  it("rejects an unrecognized bucket", () => {
    expect(() => durationBucketSchema.parse("extra-long")).toThrow();
  });
});

describe("courseSummarySchema", () => {
  const VALID_SUMMARY = {
    id: "c1",
    title: "Intro to Algebra",
    description: "A beginner course",
    subject: "Math",
    level: "beginner",
    estimatedDurationHours: 10,
    status: "published",
  };

  it("accepts a fully-populated summary", () => {
    expect(() => courseSummarySchema.parse(VALID_SUMMARY)).not.toThrow();
  });

  it("accepts null description/subject/level/estimatedDurationHours (not yet set by content-ops)", () => {
    expect(() =>
      courseSummarySchema.parse({ ...VALID_SUMMARY, description: null, subject: null, level: null, estimatedDurationHours: null }),
    ).not.toThrow();
  });

  it("rejects a missing status", () => {
    const rest = Object.fromEntries(Object.entries(VALID_SUMMARY).filter(([k]) => k !== "status"));
    expect(() => courseSummarySchema.parse(rest)).toThrow();
  });
});

describe("catalogSearchParamsSchema", () => {
  it("accepts an empty object (no filters, no search)", () => {
    expect(() => catalogSearchParamsSchema.parse({})).not.toThrow();
  });

  it("accepts any combination of filters plus a search term", () => {
    expect(() => catalogSearchParamsSchema.parse({ subject: "Math", level: "beginner", durationBucket: "short", q: "algebra" })).not.toThrow();
  });

  it("rejects an invalid level or durationBucket", () => {
    expect(() => catalogSearchParamsSchema.parse({ level: "expert" })).toThrow();
    expect(() => catalogSearchParamsSchema.parse({ durationBucket: "extra-long" })).toThrow();
  });
});
