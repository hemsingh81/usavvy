import { eq } from "drizzle-orm";
import type { Logger, StoragePort } from "@usavvy/service-kernel";
import type { Db } from "../../../db/client.js";
import { contentChunks, uploadedDocuments } from "../../../db/schema.js";
import { chunkSections } from "../chunking.js";
import { parseDocx } from "../parsers/docx.js";
import { ocrPdfPages } from "../parsers/ocr.js";
import { parsePdf } from "../parsers/pdf.js";
import { parsePlainText } from "../parsers/plainText.js";
import { parsePptx } from "../parsers/pptx.js";
import { CorruptDocumentError, EncryptedDocumentError, type ParsedDocument } from "../parsers/types.js";

export interface IngestJobDeps {
  db: Db;
  storagePort: StoragePort;
  logger: Logger;
}

async function parseByFileType(fileType: string, buffer: Buffer): Promise<ParsedDocument> {
  switch (fileType) {
    case "pdf":
      return parsePdf(buffer);
    case "docx":
      return parseDocx(buffer);
    case "pptx":
      return parsePptx(buffer);
    case "txt":
      return parsePlainText(buffer, "txt");
    case "md":
      return parsePlainText(buffer, "md");
    default:
      throw new CorruptDocumentError(`unsupported file type: ${fileType}`);
  }
}

/**
 * Story 2.9 (FR-C-9), AC #1/#2/#3/#4. The first `JobQueuePort` consumer this codebase
 * has ever registered (Stories 2.7/2.8 only ever enqueued). Looks up the
 * `UploadedDocument`, fetches its bytes, parses by file type, runs OCR for any
 * PDF pages flagged `needsOcr` (AC #2), chunks the result, and inserts `ContentChunk`
 * rows — or, on a typed parser error, marks the document `failed` with the specific
 * reason (AC #3/#4) and inserts NO chunks at all.
 */
export async function ingestDocument(deps: IngestJobDeps, payload: Record<string, unknown>): Promise<void> {
  const uploadedDocumentId = payload.uploadedDocumentId;
  if (typeof uploadedDocumentId !== "string") {
    deps.logger.error("ingest-document job payload missing uploadedDocumentId", { payload });
    return;
  }

  const [document] = await deps.db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, uploadedDocumentId));
  if (!document) {
    // AD-17: a job for a document that no longer exists (no deletion feature exists
    // yet, but the handler must not crash the whole worker over a theoretical race)
    // logs and returns cleanly rather than throwing.
    deps.logger.error("ingest-document job references a document that no longer exists", { uploadedDocumentId });
    return;
  }

  const buffer = await deps.storagePort.getObject(document.storageKey);

  let parsed: ParsedDocument;
  try {
    parsed = await parseByFileType(document.fileType, buffer);
  } catch (error) {
    if (error instanceof EncryptedDocumentError || error instanceof CorruptDocumentError) {
      await deps.db.update(uploadedDocuments).set({ status: "failed", failureReason: error.reason }).where(eq(uploadedDocuments.id, document.id));
      return;
    }
    throw error;
  }

  const ocrPageNumbers = parsed.sections.filter((section) => section.needsOcr && section.pageNumber !== undefined).map((section) => section.pageNumber as number);
  if (ocrPageNumbers.length > 0) {
    const ocrResults = await ocrPdfPages(buffer, ocrPageNumbers);
    for (const section of parsed.sections) {
      if (section.needsOcr && section.pageNumber !== undefined) {
        section.text = ocrResults.get(section.pageNumber) ?? "";
      }
    }
  }

  const chunks = chunkSections(parsed.sections);
  if (chunks.length > 0) {
    await deps.db.insert(contentChunks).values(
      chunks.map((chunk, index) => ({
        documentId: document.id,
        chunkIndex: index,
        text: chunk.text,
        heading: chunk.heading,
        pageRangeStart: chunk.pageRangeStart,
        pageRangeEnd: chunk.pageRangeEnd,
      })),
    );
  }

  await deps.db.update(uploadedDocuments).set({ status: "parsed" }).where(eq(uploadedDocuments.id, document.id));
}
