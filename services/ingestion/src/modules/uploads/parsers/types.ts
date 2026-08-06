/**
 * Story 2.9 (FR-C-9). A plain `Error` subclass, not `AppError` — these cross a
 * JobQueuePort worker boundary, not an HTTP request/response cycle, so `AppError`'s
 * `statusCode` concept doesn't apply here. `.reason` carries AC #3/#4's exact required
 * failure-reason text ("encrypted file" / "corrupt file").
 */
export class EncryptedDocumentError extends Error {
  readonly reason = "encrypted file";
  constructor(message: string) {
    super(message);
    this.name = "EncryptedDocumentError";
  }
}

export class CorruptDocumentError extends Error {
  readonly reason = "corrupt file";
  constructor(message: string) {
    super(message);
    this.name = "CorruptDocumentError";
  }
}

export interface ParsedSection {
  heading: string | null;
  text: string;
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
  /** PDF only (Story 2.9, AC #2) — this section's page had no extractable text layer and needs OCR. */
  needsOcr?: boolean;
  /** PDF only — the 1-based page number, needed to splice OCR text back in after the fact. */
  pageNumber?: number;
}

export interface ParsedDocument {
  sections: ParsedSection[];
}
