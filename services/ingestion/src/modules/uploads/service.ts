import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AppError, type JobQueuePort, type StoragePort } from "@usavvy/service-kernel";
import type { Db } from "../../db/client.js";
import { uploadedDocuments } from "../../db/schema.js";

const urlSchema = z.url();

// Shared shape between the top-level Db and a transaction callback's `tx` handle —
// countExistingFiles runs inside both (a fast, non-authoritative pre-check outside any
// transaction, and the authoritative recheck inside the advisory-locked one below).
type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export const SUPPORTED_FILE_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md"] as const;
export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_PAGES = 300;
export const MAX_FILES_PER_CUSTOM_COURSE = 10;
// Story 2.8 (FR-C-8), AC #4: "a few words" has no numeric AC value — 10 is a documented,
// easily-tunable choice, not derived from any spec. Shared by pasted-text and (after
// HTML extraction) URL-import, since both converge on "is there enough text here."
export const MIN_PASTED_TEXT_WORDS = 10;
const URL_FETCH_TIMEOUT_MS = 10000;

export interface UploadDocumentInput {
  customCourseId: string | undefined;
  fileName: string;
  buffer: Buffer;
  copyrightAttested: boolean;
}

export interface PasteTextInput {
  customCourseId: string | undefined;
  text: string;
  copyrightAttested: boolean;
}

export interface UrlImportInput {
  customCourseId: string | undefined;
  url: string;
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

function contentTypeForFileType(fileType: string): string {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "md":
      return "text/markdown";
    case "txt":
    default:
      return "text/plain";
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

/**
 * Story 2.8: a cheap regex-based approximation of "the page's readable content" — strip
 * script/style blocks, then every remaining tag, then collapse whitespace. This is NOT a
 * real Readability-grade extractor (that's a real HTML-parsing dependency and design
 * decision on its own, out of scope for this story); good enough to prove "some text
 * exists here to build a course from," which is all AC #2 requires. Story 2.9's real
 * content-parsing pipeline can re-process the stored text later if quality ever matters.
 */
export function stripHtmlToReadableText(html: string): string {
  const withoutScriptsAndStyles = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const withoutTags = withoutScriptsAndStyles.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/\s+/g, " ").trim();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
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

async function countExistingFiles(db: DbOrTx, ownerId: string, customCourseId: string): Promise<number> {
  const rows = await db
    .select({ id: uploadedDocuments.id })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.ownerId, ownerId), eq(uploadedDocuments.customCourseId, customCourseId)));
  return rows.length;
}

interface FinalizeUploadInput {
  customCourseId: string | undefined;
  fileName: string;
  fileType: string;
  buffer: Buffer;
}

/**
 * The shared tail every input method (file upload, pasted text, URL import) converges
 * on once its OWN input-specific validation has passed and copyright attestation has
 * already been confirmed by the caller (this function does not re-check it — every
 * caller checks it as the very first thing it does, before its own input-specific
 * checks, per AC #4's "attestation gates everything" precedent from Story 2.7).
 *
 * Story 2.8 trade-off: file uploads' own fast pre-check (avoiding a page-count scan
 * when already at the 10-file limit) now runs AFTER that scan rather than before it,
 * since the pre-check lives here in the shared tail. A minor, accepted reordering for
 * the sake of one shared implementation across three entry points — not a correctness
 * concern, just a micro-optimization Story 2.7 had that doesn't generalize (pasted-text/
 * URL-import have no analogous "expensive check to avoid" before this point anyway).
 */
async function finalizeUpload(deps: UploadDeps, ownerId: string, input: FinalizeUploadInput): Promise<UploadedDocumentResponse> {
  const customCourseId = input.customCourseId ?? randomUUID();

  const existingCount = await countExistingFiles(deps.db, ownerId, customCourseId);
  if (existingCount >= MAX_FILES_PER_CUSTOM_COURSE) {
    throw new AppError("VALIDATION_ERROR", "10-file-per-course limit reached", 400);
  }

  const storageKey = `${ownerId}/${customCourseId}/${randomUUID()}.${input.fileType}`;
  await deps.storagePort.putObject(storageKey, input.buffer, contentTypeForFileType(input.fileType));

  // Review finding (Story 2.7): the pre-check above and the insert were two separate,
  // unsynchronized statements — two concurrent uploads to the same customCourseId
  // could both read a stale count and both insert, breaking the 10-file cap.
  // pg_advisory_xact_lock serializes concurrent attempts for the SAME customCourseId
  // (auto-released at transaction end) without blocking uploads to different ones —
  // the recount+insert inside it is the actual enforcement, not just the pre-check.
  const row = await deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${customCourseId}))`);

    const authoritativeCount = await countExistingFiles(tx, ownerId, customCourseId);
    if (authoritativeCount >= MAX_FILES_PER_CUSTOM_COURSE) {
      throw new AppError("VALIDATION_ERROR", "10-file-per-course limit reached", 400);
    }

    const [inserted] = await tx
      .insert(uploadedDocuments)
      .values({
        ownerId,
        customCourseId,
        fileName: input.fileName,
        fileType: input.fileType,
        fileSizeBytes: input.buffer.byteLength,
        storageKey,
        copyrightAttested: true,
        status: "queued",
      })
      .returning();
    if (!inserted) {
      throw new AppError("INTERNAL_ERROR", "failed to record uploaded document", 500);
    }
    return inserted;
  });

  await deps.jobQueuePort.enqueue("ingest-document", { uploadedDocumentId: row.id });

  return toResponse(row);
}

/**
 * AC #1/#2/#3/#4 (Story 2.7). Order matters: attestation is checked FIRST, before any
 * other validation or I/O — an unchecked attestation must never result in a stored
 * file, even a since-rejected one. Each call handles exactly one file; a "batch" of
 * files sharing one `customCourseId` is a client-side looping concept, not a single
 * multi-file server-side endpoint — so one rejected file here never prevents another
 * call for the same `customCourseId` from succeeding.
 */
export async function uploadDocument(deps: UploadDeps, ownerId: string, input: UploadDocumentInput): Promise<UploadedDocumentResponse> {
  if (!input.copyrightAttested) {
    throw new AppError("VALIDATION_ERROR", "copyright attestation is required", 400);
  }

  const extension = getExtension(input.fileName);
  if (!isSupportedExtension(extension)) {
    throw new AppError("VALIDATION_ERROR", "unsupported file type", 400);
  }

  if (input.buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new AppError("VALIDATION_ERROR", "file exceeds 50 MB limit", 400);
  }

  if (extension === ".pdf" && getPdfPageCount(input.buffer) > MAX_PAGES) {
    throw new AppError("VALIDATION_ERROR", "file exceeds 300 page limit", 400);
  }

  return finalizeUpload(deps, ownerId, {
    customCourseId: input.customCourseId,
    fileName: input.fileName,
    fileType: extension.slice(1),
    buffer: input.buffer,
  });
}

/** Story 2.8, AC #1/#4: attestation first, then the length check, then the shared tail. */
export async function importPastedText(deps: UploadDeps, ownerId: string, input: PasteTextInput): Promise<UploadedDocumentResponse> {
  if (!input.copyrightAttested) {
    throw new AppError("VALIDATION_ERROR", "copyright attestation is required", 400);
  }

  if (countWords(input.text) < MIN_PASTED_TEXT_WORDS) {
    throw new AppError("VALIDATION_ERROR", "not enough content to build a course from", 400);
  }

  return finalizeUpload(deps, ownerId, {
    customCourseId: input.customCourseId,
    fileName: "pasted-text.txt",
    fileType: "txt",
    buffer: Buffer.from(input.text, "utf-8"),
  });
}

/** Story 2.8, AC #2/#3: attestation first, then fetch-and-extract, each failure mode named distinctly. */
export async function importFromUrl(deps: UploadDeps, ownerId: string, input: UrlImportInput): Promise<UploadedDocumentResponse> {
  if (!input.copyrightAttested) {
    throw new AppError("VALIDATION_ERROR", "copyright attestation is required", 400);
  }

  if (!urlSchema.safeParse(input.url).success) {
    throw new AppError("VALIDATION_ERROR", "invalid URL", 400);
  }

  let response: Response;
  try {
    response = await fetch(input.url, { signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS) });
  } catch {
    throw new AppError("VALIDATION_ERROR", "URL is unreachable", 400);
  }

  if (response.status === 401 || response.status === 403) {
    throw new AppError("VALIDATION_ERROR", "access denied", 400);
  }
  if (!response.ok) {
    throw new AppError("VALIDATION_ERROR", "content could not be retrieved", 400);
  }

  const html = await response.text();
  const extractedText = stripHtmlToReadableText(html);
  if (countWords(extractedText) < MIN_PASTED_TEXT_WORDS) {
    throw new AppError("VALIDATION_ERROR", "not enough content to build a course from", 400);
  }

  let fileName: string;
  try {
    const parsed = new URL(input.url);
    fileName = `${parsed.hostname}${parsed.pathname}`.replace(/\/+$/, "").replace(/[^a-zA-Z0-9.-]+/g, "-") || parsed.hostname;
  } catch {
    fileName = "url-import";
  }

  return finalizeUpload(deps, ownerId, {
    customCourseId: input.customCourseId,
    fileName: `${fileName}.txt`,
    fileType: "txt",
    buffer: Buffer.from(extractedText, "utf-8"),
  });
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
