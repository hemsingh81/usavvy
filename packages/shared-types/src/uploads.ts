import { z } from "zod";

// Story 2.7 (FR-C-7/FR-C-12).
export const uploadedDocumentResponseSchema = z.object({
  id: z.string(),
  // Story 2.14 (FR-C-14): both nullable — exactly one is ever set, mirroring
  // uploadedDocuments' own exactly-one-of invariant (services/ingestion's schema.ts).
  customCourseId: z.string().nullable(),
  courseId: z.string().nullable(),
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

// Story 2.14 (FR-C-14): generalized from a required `customCourseId` to accept either
// grouping key — exactly one, never zero, never both (unlike POST /uploads' own optional
// fields below, GET has no "mint a new one" default to fall back to on omission).
export const listUploadsQuerySchema = z
  .object({
    customCourseId: z.uuid().optional(),
    courseId: z.uuid().optional(),
  })
  .refine((value) => Boolean(value.customCourseId) !== Boolean(value.courseId), {
    message: "exactly one of customCourseId or courseId is required",
  });

export type ListUploadsQuery = z.infer<typeof listUploadsQuerySchema>;

// Review finding: POST /uploads accepted an unvalidated customCourseId form field,
// letting a malformed value reach the DB layer as a raw, unhandled Postgres type error
// (500) instead of a clean 400 — GET already validated it via listUploadsQuerySchema,
// POST didn't. Optional here (unlike GET's), since the first file of a new batch omits
// it and the server mints one.
export const optionalCustomCourseIdSchema = z.uuid().optional();

// Story 2.14 (FR-C-14): the multipart-form sibling of optionalCustomCourseIdSchema —
// POST /uploads parses each multipart field individually (not as one Zod object), so
// this validates the new `courseId` field the same way. The "both provided" rejection
// for this route lives server-side in `resolveUploadGroupKey` (services/ingestion),
// same place the existing "neither provided -> mint one" default already lives.
export const optionalCourseIdSchema = z.uuid().optional();

// Story 2.8 (FR-C-8). Story 2.14 adds `courseId` alongside `customCourseId` — unlike the
// query schema above, "neither set" is valid here (mints a new custom course), so this
// intentionally has no `.refine()` rejecting "both set"; that rejection lives server-side
// in `resolveUploadGroupKey`, matching where the "neither set" default already lives.
export const pasteTextInputSchema = z.object({
  customCourseId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  text: z.string(),
  copyrightAttested: z.boolean(),
});

export type PasteTextInput = z.infer<typeof pasteTextInputSchema>;

export const urlImportInputSchema = z.object({
  customCourseId: z.uuid().optional(),
  courseId: z.uuid().optional(),
  url: z.url(),
  copyrightAttested: z.boolean(),
});

export type UrlImportInput = z.infer<typeof urlImportInputSchema>;
