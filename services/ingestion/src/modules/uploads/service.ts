import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { AppError, type JobQueuePort, type StoragePort } from "@usavvy/service-kernel";
import type { Db } from "../../db/client.js";
import { uploadedDocuments } from "../../db/schema.js";

export const SUPPORTED_FILE_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md"] as const;
export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 300;
export const MAX_FILES_PER_CUSTOM_COURSE = 10;

export interface UploadDocumentInput {
  customCourseId: string | undefined;
  fileName: string;
  buffer: Buffer;
  copyrightAttested: boolean;
}

export interface UploadedDocumentResponse {
  id: string;
  customCourseId: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  status: string;
  createdAt: string;
}

export interface UploadDeps {
  db: Db;
  storagePort: StoragePort;
  jobQueuePort: JobQueuePort;
}

function getExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? "" : fileName.slice(dotIndex).toLowerCase();
}

function isSupportedExtension(extension: string): extension is SupportedFileExtension {
  return (SUPPORTED_FILE_EXTENSIONS as readonly string[]).includes(extension);
}

function contentTypeFor(extension: SupportedFileExtension): string {
  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
  }
}

/**
 * Cheap approximation good enough for a 300-page upload-time ceiling check — counts
 * `/Type /Page` (not `/Type /Pages`) object markers in the raw bytes. This is NOT a
 * real PDF parse (Story 2.9 adds that, for actual content extraction); adding a full
 * PDF-parsing dependency now just to check a number would be built-ahead-of-need.
 * Applies to PDF only — DOCX/PPTX/TXT/MD have no literal, cheaply-readable page count
 * at upload time (a real one would require rendering); the 50 MB size ceiling alone is
 * the enforced limit for those formats.
 */
export function getPdfPageCount(buffer: Buffer): number {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!s)/g);
  return matches ? matches.length : 0;
}

function toResponse(row: typeof uploadedDocuments.$inferSelect): UploadedDocumentResponse {
  return {
    id: row.id,
    customCourseId: row.customCourseId,
    fileName: row.fileName,
    fileType: row.fileType,
    fileSizeBytes: row.fileSizeBytes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

async function countExistingFiles(db: Db, ownerId: string, customCourseId: string): Promise<number> {
  const rows = await db
    .select({ id: uploadedDocuments.id })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.ownerId, ownerId), eq(uploadedDocuments.customCourseId, customCourseId)));
  return rows.length;
}

/**
 * AC #1/#2/#3/#4. Order matters: attestation (AC #4) is checked FIRST, before any
 * storage/DB write — an unchecked attestation must never result in a stored file, even
 * a since-rejected one. Each call handles exactly one file; a "batch" of files sharing
 * one `customCourseId` is a client-side looping concept (see this story's Dev Notes),
 * not a single multi-file server-side endpoint — so one rejected file here never
 * prevents another call for the same `customCourseId` from succeeding (AC #2).
 */
export async function uploadDocument(deps: UploadDeps, ownerId: string, input: UploadDocumentInput): Promise<UploadedDocumentResponse> {
  if (!input.copyrightAttested) {
    throw new AppError("VALIDATION_ERROR", "copyright attestation is required", 400);
  }

  const customCourseId = input.customCourseId ?? randomUUID();

  const extension = getExtension(input.fileName);
  if (!isSupportedExtension(extension)) {
    throw new AppError("VALIDATION_ERROR", "unsupported file type", 400);
  }

  if (input.buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new AppError("VALIDATION_ERROR", "file exceeds 50 MB limit", 400);
  }

  const existingCount = await countExistingFiles(deps.db, ownerId, customCourseId);
  if (existingCount >= MAX_FILES_PER_CUSTOM_COURSE) {
    throw new AppError("VALIDATION_ERROR", "10-file-per-course limit reached", 400);
  }

  if (extension === ".pdf" && getPdfPageCount(input.buffer) > MAX_PAGES) {
    throw new AppError("VALIDATION_ERROR", "file exceeds 300 page limit", 400);
  }

  const storageKey = `${ownerId}/${customCourseId}/${randomUUID()}${extension}`;
  await deps.storagePort.putObject(storageKey, input.buffer, contentTypeFor(extension));

  const [row] = await deps.db
    .insert(uploadedDocuments)
    .values({
      ownerId,
      customCourseId,
      fileName: input.fileName,
      fileType: extension.slice(1),
      fileSizeBytes: input.buffer.byteLength,
      storageKey,
      copyrightAttested: true,
      status: "queued",
    })
    .returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to record uploaded document", 500);
  }

  await deps.jobQueuePort.enqueue("ingest-document", { uploadedDocumentId: row.id });

  return toResponse(row);
}

/** Scoped to the caller's own `ownerId` — a `customCourseId` the caller doesn't own returns `[]`, never a 403 leaking existence. */
export async function listUploadedDocuments(db: Db, ownerId: string, customCourseId: string): Promise<UploadedDocumentResponse[]> {
  const rows = await db
    .select()
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.ownerId, ownerId), eq(uploadedDocuments.customCourseId, customCourseId)))
    .orderBy(uploadedDocuments.createdAt);
  return rows.map(toResponse);
}
