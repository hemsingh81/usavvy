import { describe, expect, it } from "vitest";
import { listUploadsQuerySchema, pasteTextInputSchema, uploadedDocumentResponseSchema, urlImportInputSchema } from "../src/uploads.js";

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

describe("pasteTextInputSchema", () => {
  it("accepts text with no customCourseId", () => {
    expect(() => pasteTextInputSchema.parse({ text: "hello world", copyrightAttested: true })).not.toThrow();
  });

  it("rejects a non-boolean copyrightAttested", () => {
    expect(() => pasteTextInputSchema.parse({ text: "hello world", copyrightAttested: "true" })).toThrow();
  });
});

describe("urlImportInputSchema", () => {
  it("accepts a valid URL with no customCourseId", () => {
    expect(() => urlImportInputSchema.parse({ url: "https://example.com/article", copyrightAttested: true })).not.toThrow();
  });

  it("rejects a non-URL string", () => {
    expect(() => urlImportInputSchema.parse({ url: "not-a-url", copyrightAttested: true })).toThrow();
  });
});
