import { asc, eq } from "drizzle-orm";
import type { Logger, StoragePort } from "@usavvy/service-kernel";
import type { Db } from "../../../db/client.js";
import { contentChunks, proposedConcepts, proposedTopics, uploadedDocuments } from "../../../db/schema.js";
import { chunkSections } from "../chunking.js";
import { aggregateDocumentOutcome, scanChunks } from "../contentSafety.js";
import type { GenerationPort } from "../../generation/port.js";
import type { VectorStorePort } from "../../generation/vectorStorePort.js";
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
  generationPort: GenerationPort;
  vectorStorePort: VectorStorePort;
}

// Story 2.12 (FR-C-9): only these are terminal now — "parsed" has somewhere further to
// go (embedding + outline proposal), so it moved out of this set (it was terminal as of
// Story 2.11, before this story existed). Story 2.14 (FR-C-14) adds "embedded" — the
// terminal status for a personal note attached to an existing catalog course, which
// skips outline proposal entirely and never reaches "outline ready" (see
// embedAndProposeOutline's courseId branch below).
const TERMINAL_STATUSES = new Set(["outline ready", "embedded", "blocked", "failed"]);

// A document at either of these statuses already has its ContentChunk rows committed
// (the parse/chunk/safety-scan transaction below already ran successfully) — resuming
// means going straight to embedding+outline using those existing rows, never
// re-parsing/re-chunking, which would duplicate ContentChunk rows (the exact bug
// Story 2.9/2.11's idempotency guard exists to prevent).
const CHUNKS_ALREADY_COMMITTED_STATUSES = new Set(["parsed", "embedding"]);

interface EmbeddableChunk {
  id: string;
  text: string;
  heading: string | null;
  pageRangeStart: number | null;
  pageRangeEnd: number | null;
  // Never "blocked" for a chunk reachable here — aggregateDocumentOutcome (Story 2.10)
  // guarantees a single blocked chunk forces the whole document to "blocked" status,
  // which never reaches this function (see the TERMINAL_STATUSES/status-guard above).
  safetyStatus: "clear" | "flagged";
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

async function loadEmbeddableChunks(db: Db, documentId: string): Promise<EmbeddableChunk[]> {
  // Review finding: no ORDER BY means Postgres gives no ordering guarantee — the
  // resume path (a document parked at "parsed"/"embedding") must reproduce the same
  // chunkIndex order the from-scratch path already inserted in, or the outline's
  // Topic/Concept grouping and position values become nondeterministic across runs.
  const rows = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId)).orderBy(asc(contentChunks.chunkIndex));
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    heading: row.heading,
    pageRangeStart: row.pageRangeStart,
    pageRangeEnd: row.pageRangeEnd,
    safetyStatus: row.safetyStatus as "clear" | "flagged",
  }));
}

/**
 * Story 2.12 (FR-C-9), AC #1-4. Embeds every chunk and proposes a Topic/Concept outline,
 * then persists both. Crash-safety: `vectorStorePort.upsert` is a keyed upsert (safe to
 * redo — an interrupted retry just overwrites the same rows with the same values, since
 * `embed`/`proposeOutline` are deterministic for the same input), and the
 * proposedTopics/proposedConcepts/terminal-status write is one transaction — nothing
 * about the outline itself is ever partially persisted.
 */
async function embedAndProposeOutline(
  deps: IngestJobDeps,
  document: { id: string; customCourseId: string | null; courseId: string | null },
  chunks: EmbeddableChunk[],
): Promise<void> {
  if (chunks.length === 0) {
    // Review finding (AC #3/AD-17): a document with zero extractable ContentChunk rows
    // (e.g. a whitespace-only .txt/.md upload) has nothing to embed or build an outline
    // from — reaching a hollow "outline ready" with zero Topics/Concepts would be a
    // silent, misleading success. An honest "failed" outcome, matching how the parser
    // step already reports other unprocessable-content cases.
    await deps.db.update(uploadedDocuments).set({ status: "failed", failureReason: "no extractable content" }).where(eq(uploadedDocuments.id, document.id));
    return;
  }

  // Review finding: checked AFTER vectorStorePort.upsert previously ran — an invariant
  // violation would have already persisted an orphaned chunk_embeddings row before this
  // ever threw. Checked symmetrically (both set is exactly as invalid as neither) and
  // up front now, before any embedding work starts, matching AD-17's "fail fast, don't
  // do partial work first" discipline. `resolveUploadGroupKey` (uploads/service.ts)
  // already prevents "both" at upload time and `finalizeUpload` always sets exactly
  // one, so neither branch is reachable via any real route today — this guards against
  // a future bug (a manual DB edit, a new write path that bypasses `finalizeUpload`)
  // the same way the "neither" case was already guarded, not a case expected in practice.
  if ((document.customCourseId === null) === (document.courseId === null)) {
    await deps.db
      .update(uploadedDocuments)
      .set({ status: "failed", failureReason: "internal error" })
      .where(eq(uploadedDocuments.id, document.id));
    deps.logger.error("document has an invalid customCourseId/courseId combination — exactly one must be set", {
      documentId: document.id,
      customCourseId: document.customCourseId,
      courseId: document.courseId,
    });
    return;
  }

  await deps.db.update(uploadedDocuments).set({ status: "embedding" }).where(eq(uploadedDocuments.id, document.id));

  try {
    const embeddings = await Promise.all(chunks.map((chunk) => deps.generationPort.embed(chunk.text)));

    await deps.vectorStorePort.upsert(
      chunks.map((chunk, index) => ({
        chunkId: chunk.id,
        documentId: document.id,
        customCourseId: document.customCourseId,
        courseId: document.courseId,
        conceptId: null,
        embedding: embeddings[index] as number[],
      })),
    );

    // Story 2.14 (FR-C-14), AC #2: a personal note attached to an existing catalog
    // Course has nothing to propose an outline FOR — that Course already has its own
    // official Topic/Concept structure (Story 2.1). Embedding alone (above) already
    // satisfies AC #2; skip straight to the terminal status rather than generating and
    // persisting a Topic/Concept structure no screen will ever show.
    if (document.courseId !== null) {
      await deps.db.update(uploadedDocuments).set({ status: "embedded" }).where(eq(uploadedDocuments.id, document.id));
      return;
    }
    // The guard above already ensured exactly one of customCourseId/courseId is set,
    // and the branch just above returned for the courseId case — so customCourseId is
    // non-null here. Narrows the type for proposedTopics' still-NOT-NULL column below.
    const customCourseId = document.customCourseId as string;

    const outline = await deps.generationPort.proposeOutline({
      chunks: chunks.map((chunk) => ({
        chunkId: chunk.id,
        text: chunk.text,
        heading: chunk.heading,
        pageRangeStart: chunk.pageRangeStart,
        pageRangeEnd: chunk.pageRangeEnd,
        safetyStatus: chunk.safetyStatus,
      })),
    });

    await deps.db.transaction(async (tx) => {
      for (const [topicIndex, topic] of outline.entries()) {
        const [topicRow] = await tx
          .insert(proposedTopics)
          .values({ customCourseId, documentId: document.id, title: topic.title, position: topicIndex })
          .returning();
        if (!topicRow) continue;
        for (const [conceptIndex, concept] of topic.concepts.entries()) {
          await tx.insert(proposedConcepts).values({
            proposedTopicId: topicRow.id,
            title: concept.title,
            position: conceptIndex,
            sourcePageRangeStart: concept.sourcePageRangeStart,
            sourcePageRangeEnd: concept.sourcePageRangeEnd,
            safetyFlagged: concept.safetyFlagged,
          });
        }
      }
      await tx.update(uploadedDocuments).set({ status: "outline ready" }).where(eq(uploadedDocuments.id, document.id));
    });
  } catch (error) {
    // Review finding (AD-17): unlike the parser step a few lines up (typed errors ->
    // "failed" with a reason), embedding/outline generation had no failure path at all
    // — any error (a future real GenerationPort adapter's network failure, a real
    // VectorStorePort/pgvector DB error) left the document stranded at "embedding"
    // forever with no explanation. Logs full detail; the persisted reason stays generic
    // since neither port surfaces a typed, learner-facing error today.
    deps.logger.error("embedding/outline generation failed", {
      documentId: document.id,
      reason: error instanceof Error ? error.message : String(error),
    });
    await deps.db.update(uploadedDocuments).set({ status: "failed", failureReason: "embedding failed" }).where(eq(uploadedDocuments.id, document.id));
  }
}

/**
 * Story 2.9 (FR-C-9), AC #1/#2/#3/#4; Story 2.12 (FR-C-9), AC #1-4. Looks up the
 * `UploadedDocument`, fetches its bytes, parses by file type, runs OCR for any PDF pages
 * flagged `needsOcr` (AC #2), chunks the result, and inserts `ContentChunk` rows — or, on
 * a typed parser error, marks the document `failed` (AC #3/#4) and inserts NO chunks at
 * all. If the document passes the safety scan (Story 2.10), continues in the same job
 * run to embed every chunk and propose a Topic/Concept outline (Story 2.12).
 *
 * A document already at "parsed" or "embedding" (its chunks already committed by an
 * earlier run of this same job — a crash/redelivery mid-embedding, or simply a fresh
 * invocation for a document that finished parsing in a previous run) skips straight to
 * the embedding/outline step using the already-committed chunks, never re-parsing.
 */
export async function ingestDocument(deps: IngestJobDeps, payload: Record<string, unknown>): Promise<void> {
  const uploadedDocumentId = payload.uploadedDocumentId;
  if (typeof uploadedDocumentId !== "string") {
    deps.logger.error("ingest-document job payload missing uploadedDocumentId", { payload });
    return;
  }

  const [document] = await deps.db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, uploadedDocumentId));
  if (!document) {
    deps.logger.error("ingest-document job references a document that no longer exists", { uploadedDocumentId });
    return;
  }

  if (TERMINAL_STATUSES.has(document.status)) {
    deps.logger.info("ingest-document job skipped — document already processed", { uploadedDocumentId, status: document.status });
    return;
  }

  if (CHUNKS_ALREADY_COMMITTED_STATUSES.has(document.status)) {
    const chunks = await loadEmbeddableChunks(deps.db, document.id);
    await embedAndProposeOutline(deps, document, chunks);
    return;
  }

  await deps.db.update(uploadedDocuments).set({ status: "parsing" }).where(eq(uploadedDocuments.id, document.id));

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

  await deps.db.update(uploadedDocuments).set({ status: "safety scan" }).where(eq(uploadedDocuments.id, document.id));

  const scannedChunks = scanChunks(chunks);
  const safetyOutcome = aggregateDocumentOutcome(scannedChunks);

  const insertedChunks = await deps.db.transaction(async (tx) => {
    let inserted: (typeof contentChunks.$inferSelect)[] = [];
    if (scannedChunks.length > 0) {
      inserted = await tx
        .insert(contentChunks)
        .values(
          scannedChunks.map((chunk, index) => ({
            documentId: document.id,
            chunkIndex: index,
            text: chunk.text,
            heading: chunk.heading,
            pageRangeStart: chunk.pageRangeStart,
            pageRangeEnd: chunk.pageRangeEnd,
            safetyStatus: chunk.safetyStatus,
            safetyCategory: chunk.safetyCategory,
          })),
        )
        .returning();
    }
    await tx
      .update(uploadedDocuments)
      .set({ status: safetyOutcome.status, failureReason: safetyOutcome.failureReason })
      .where(eq(uploadedDocuments.id, document.id));
    return inserted;
  });

  // Story 2.12 (FR-C-9), AC #1: embedding/outline only ever runs for a document that
  // passed the safety scan — a "blocked" outcome stops here, exactly as it did before
  // this story existed.
  if (safetyOutcome.status !== "parsed") {
    return;
  }

  const embeddableChunks: EmbeddableChunk[] = insertedChunks.map((row) => ({
    id: row.id,
    text: row.text,
    heading: row.heading,
    pageRangeStart: row.pageRangeStart,
    pageRangeEnd: row.pageRangeEnd,
    safetyStatus: row.safetyStatus as "clear" | "flagged",
  }));
  await embedAndProposeOutline(deps, document, embeddableChunks);
}
