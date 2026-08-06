import { z } from "zod";

// Story 2.7 (FR-C-7/FR-C-12).
export const uploadedDocumentResponseSchema = z.object({
  id: z.string(),
  customCourseId: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSizeBytes: z.number(),
  status: z.string(),
  createdAt: z.string(),
});

export type UploadedDocumentResponse = z.infer<typeof uploadedDocumentResponseSchema>;

export const listUploadsQuerySchema = z.object({
  customCourseId: z.uuid(),
});

export type ListUploadsQuery = z.infer<typeof listUploadsQuerySchema>;

// Review finding: POST /uploads accepted an unvalidated customCourseId form field,
// letting a malformed value reach the DB layer as a raw, unhandled Postgres type error
// (500) instead of a clean 400 — GET already validated it via listUploadsQuerySchema,
// POST didn't. Optional here (unlike GET's), since the first file of a new batch omits
// it and the server mints one.
export const optionalCustomCourseIdSchema = z.uuid().optional();
