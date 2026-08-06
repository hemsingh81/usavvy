import { z } from "zod";

// Story 2.7 (FR-C-7/FR-C-12).
export const uploadedDocumentResponseSchema = z.object({
  id: z.string(),
  customCourseId: z.string(),
  fileName: z.string(),
  fileType: z.string(),
  fileSizeBytes: z.number(),
  status: z.string(),
  // Story 2.11 (FR-C-11), AC #2: the specific reason behind a "failed"/"blocked"
  // status — null otherwise. Already populated in the DB by Stories 2.9/2.10; this was
  // the field's first exposure through the API.
  failureReason: z.string().nullable(),
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

// Story 2.8 (FR-C-8).
export const pasteTextInputSchema = z.object({
  customCourseId: z.uuid().optional(),
  text: z.string(),
  copyrightAttested: z.boolean(),
});

export type PasteTextInput = z.infer<typeof pasteTextInputSchema>;

export const urlImportInputSchema = z.object({
  customCourseId: z.uuid().optional(),
  url: z.url(),
  copyrightAttested: z.boolean(),
});

export type UrlImportInput = z.infer<typeof urlImportInputSchema>;
