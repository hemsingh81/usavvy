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
