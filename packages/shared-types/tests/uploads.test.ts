import { describe, expect, it } from "vitest";
import { listUploadsQuerySchema, uploadedDocumentResponseSchema } from "../src/uploads.js";

describe("uploadedDocumentResponseSchema", () => {
  it("accepts a fully-populated response", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        fileName: "notes.pdf",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "queued",
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects a response missing fileName", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "queued",
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("listUploadsQuerySchema", () => {
  it("accepts a valid uuid customCourseId", () => {
    expect(() => listUploadsQuerySchema.parse({ customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f" })).not.toThrow();
  });

  it("rejects a non-uuid customCourseId", () => {
    expect(() => listUploadsQuerySchema.parse({ customCourseId: "not-a-uuid" })).toThrow();
  });
});
