import { describe, expect, it } from "vitest";
import { listUploadsQuerySchema, optionalCourseIdSchema, pasteTextInputSchema, uploadedDocumentResponseSchema, urlImportInputSchema } from "../src/uploads.js";

describe("uploadedDocumentResponseSchema", () => {
  it("accepts a fully-populated response", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        courseId: null,
        fileName: "notes.pdf",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "queued",
        failureReason: null,
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  // Story 2.14 (FR-C-14): the mirror image of the case above — a personal note attached
  // to a catalog course has courseId set and customCourseId null.
  it("accepts a response with courseId set and customCourseId null (Story 2.14)", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: null,
        courseId: "019fd450-b7cb-7a32-b021-42788045c71f",
        fileName: "notes.pdf",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "embedded",
        failureReason: null,
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects a response missing fileName", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        courseId: null,
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "queued",
        failureReason: null,
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects a response missing courseId entirely (Story 2.14)", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        fileName: "notes.pdf",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "queued",
        failureReason: null,
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("accepts a failed response with a specific failureReason (Story 2.11, AC #2)", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        courseId: null,
        fileName: "notes.pdf",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "failed",
        failureReason: "corrupt file",
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).not.toThrow();
  });

  it("rejects a response missing failureReason entirely", () => {
    expect(() =>
      uploadedDocumentResponseSchema.parse({
        id: "d1",
        customCourseId: "cc1",
        courseId: null,
        fileName: "notes.pdf",
        fileType: "pdf",
        fileSizeBytes: 1024,
        status: "queued",
        createdAt: "2026-01-15T00:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("listUploadsQuerySchema", () => {
  it("accepts a valid uuid customCourseId alone", () => {
    expect(() => listUploadsQuerySchema.parse({ customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f" })).not.toThrow();
  });

  it("accepts a valid uuid courseId alone (Story 2.14)", () => {
    expect(() => listUploadsQuerySchema.parse({ courseId: "019fd450-b7cb-7a32-b021-42788045c71f" })).not.toThrow();
  });

  it("rejects a non-uuid customCourseId", () => {
    expect(() => listUploadsQuerySchema.parse({ customCourseId: "not-a-uuid" })).toThrow();
  });

  it("rejects when neither customCourseId nor courseId is provided (Story 2.14)", () => {
    expect(() => listUploadsQuerySchema.parse({})).toThrow();
  });

  it("rejects when both customCourseId and courseId are provided (Story 2.14)", () => {
    expect(() =>
      listUploadsQuerySchema.parse({
        customCourseId: "019fd450-b7cb-7a32-b021-42788045c71f",
        courseId: "019fd450-b7cb-7a32-b021-42788045c720",
      }),
    ).toThrow();
  });
});

describe("optionalCourseIdSchema (Story 2.14)", () => {
  it("accepts undefined", () => {
    expect(() => optionalCourseIdSchema.parse(undefined)).not.toThrow();
  });

  it("accepts a valid uuid", () => {
    expect(() => optionalCourseIdSchema.parse("019fd450-b7cb-7a32-b021-42788045c71f")).not.toThrow();
  });

  it("rejects a non-uuid string", () => {
    expect(() => optionalCourseIdSchema.parse("not-a-uuid")).toThrow();
  });
});

describe("pasteTextInputSchema", () => {
  it("accepts text with no customCourseId or courseId", () => {
    expect(() => pasteTextInputSchema.parse({ text: "hello world", copyrightAttested: true })).not.toThrow();
  });

  it("accepts a courseId alongside text (Story 2.14)", () => {
    expect(() =>
      pasteTextInputSchema.parse({ courseId: "019fd450-b7cb-7a32-b021-42788045c71f", text: "hello world", copyrightAttested: true }),
    ).not.toThrow();
  });

  it("rejects a non-boolean copyrightAttested", () => {
    expect(() => pasteTextInputSchema.parse({ text: "hello world", copyrightAttested: "true" })).toThrow();
  });
});

describe("urlImportInputSchema", () => {
  it("accepts a valid URL with no customCourseId or courseId", () => {
    expect(() => urlImportInputSchema.parse({ url: "https://example.com/article", copyrightAttested: true })).not.toThrow();
  });

  it("accepts a courseId alongside a valid URL (Story 2.14)", () => {
    expect(() =>
      urlImportInputSchema.parse({ courseId: "019fd450-b7cb-7a32-b021-42788045c71f", url: "https://example.com/article", copyrightAttested: true }),
    ).not.toThrow();
  });

  it("rejects a non-URL string", () => {
    expect(() => urlImportInputSchema.parse({ url: "not-a-url", copyrightAttested: true })).toThrow();
  });
});
