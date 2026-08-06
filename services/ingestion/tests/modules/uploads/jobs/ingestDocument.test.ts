import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createLogger, createMockStorageAdapter } from "@usavvy/service-kernel";
import { createDb, type Db } from "../../../../src/db/client.js";
import { contentChunks, proposedConcepts, proposedTopics, uploadedDocuments } from "../../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../../src/config.js";
import { ingestDocument } from "../../../../src/modules/uploads/jobs/ingestDocument.js";
import { createMockGenerationAdapter } from "../../../../src/modules/generation/mock.js";
import { createMockVectorStoreAdapter } from "../../../../src/modules/generation/vectorStoreMock.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");
const fixture = (name: string) => readFileSync(join(fixturesDir, name));

const config = loadIngestionConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-ingest-job";

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  const rows = await db.select({ id: uploadedDocuments.id }).from(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID));
  for (const row of rows) {
    await db.delete(contentChunks).where(eq(contentChunks.documentId, row.id));
  }
  await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID));
});

afterAll(async () => {
  await sql.end();
});

async function insertDocument(fileType: string, storageKey: string): Promise<string> {
  const [row] = await db
    .insert(uploadedDocuments)
    .values({
      ownerId: OWNER_ID,
      customCourseId: randomUUID(),
      fileName: `test.${fileType}`,
      fileType,
      fileSizeBytes: 100,
      storageKey,
      copyrightAttested: true,
      status: "queued",
    })
    .returning();
  if (!row) throw new Error("failed to insert test document");
  return row.id;
}

// Story 2.14 (FR-C-14): a personal note attached to an existing catalog course — courseId
// set, customCourseId null, mirroring finalizeUpload's own exactly-one-of invariant.
async function insertCourseNoteDocument(fileType: string, storageKey: string, courseId: string = randomUUID()): Promise<string> {
  const [row] = await db
    .insert(uploadedDocuments)
    .values({
      ownerId: OWNER_ID,
      courseId,
      fileName: `test.${fileType}`,
      fileType,
      fileSizeBytes: 100,
      storageKey,
      copyrightAttested: true,
      status: "queued",
    })
    .returning();
  if (!row) throw new Error("failed to insert test document");
  return row.id;
}

// Story 2.12 (FR-C-9): every IngestJobDeps call site now needs a GenerationPort and a
// VectorStorePort — mocks here, matching storagePort's own mock-by-default test
// convention. Real-adapter coverage lives in vectorStorePgvector.test.ts instead.
function generationDeps() {
  return { generationPort: createMockGenerationAdapter(), vectorStorePort: createMockVectorStoreAdapter() };
}

async function depsWithStoredFixture(storageKey: string, buffer: Buffer) {
  const storagePort = createMockStorageAdapter();
  await storagePort.putObject(storageKey, buffer, "application/octet-stream");
  return { db, storagePort, logger: createLogger("test"), ...generationDeps() };
}

describe("ingestDocument", () => {
  it(
    "parses a valid PDF, inserts ContentChunks, embeds them, and reaches outline ready with a Topic/Concept per heading (AC #1, #2)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const deps = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c) => c.heading === "Chapter One" && c.pageRangeStart === 1)).toBe(true);
      expect(chunks.some((c) => c.heading === "Chapter Two" && c.pageRangeStart === 2)).toBe(true);
      expect(chunks.every((c) => c.safetyStatus === "clear" && c.safetyCategory === null)).toBe(true);

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "outline ready", failureReason: null });

      // deps.vectorStorePort is the in-memory mock — assert against its own entries
      // map, not the real chunk_embeddings table (that's vectorStorePgvector.test.ts's
      // job, against the real pgvector adapter).
      expect(deps.vectorStorePort.entries.size).toBe(chunks.length);
      expect([...deps.vectorStorePort.entries.values()].every((e) => e.embedding.length === 1536 && e.conceptId === null && e.customCourseId)).toBe(true);

      const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
      expect(topics.map((t) => t.title).sort()).toEqual(["Chapter One", "Chapter Two"]);
      for (const topic of topics) {
        const concepts = await db.select().from(proposedConcepts).where(eq(proposedConcepts.proposedTopicId, topic.id));
        expect(concepts).toHaveLength(1);
        expect(concepts[0]?.safetyFlagged).toBe(false);
      }
    },
    30_000,
  );

  it(
    "marks an encrypted PDF failed with the AC #3 reason and inserts zero ContentChunks",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const deps = await depsWithStoredFixture(storageKey, fixture("encrypted.pdf"));

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(0);

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "failed", failureReason: "encrypted file" });
    },
    30_000,
  );

  it(
    "marks a corrupt PDF failed with the AC #4 reason and inserts zero ContentChunks",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const deps = await depsWithStoredFixture(storageKey, fixture("corrupt.pdf"));

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(0);

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "failed", failureReason: "corrupt file" });
    },
    30_000,
  );

  it(
    "runs OCR for a scanned PDF page with no text layer, stores the OCR text as a chunk, and reaches outline ready (AC #2)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const deps = await depsWithStoredFixture(storageKey, fixture("scanned-no-text.pdf"));

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]?.text.toUpperCase()).toContain("HELLO WORLD");

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("outline ready");
    },
    30_000,
  );

  it("logs and returns cleanly for a job referencing a document that no longer exists, rather than throwing (AD-17)", async () => {
    const storagePort = createMockStorageAdapter();
    const logger = createLogger("test");

    await expect(ingestDocument({ db, storagePort, logger, ...generationDeps() }, { uploadedDocumentId: randomUUID() })).resolves.toBeUndefined();
  });

  it("parses a valid DOCX end-to-end through the real job handler and reaches outline ready", async () => {
    const storageKey = `test/${randomUUID()}.docx`;
    const documentId = await insertDocument("docx", storageKey);
    const deps = await depsWithStoredFixture(storageKey, fixture("valid-structured.docx"));

    await ingestDocument(deps, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks.some((c) => c.heading === "Introduction")).toBe(true);
    expect(chunks.every((c) => c.safetyStatus === "clear" && c.safetyCategory === null)).toBe(true);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document?.status).toBe("outline ready");
  });

  it("parses a valid PPTX end-to-end through the real job handler and reaches outline ready", async () => {
    const storageKey = `test/${randomUUID()}.pptx`;
    const documentId = await insertDocument("pptx", storageKey);
    const deps = await depsWithStoredFixture(storageKey, fixture("valid-structured.pptx"));

    await ingestDocument(deps, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks.some((c) => c.heading === "Slide One Title" && c.pageRangeStart === 1)).toBe(true);
    expect(chunks.every((c) => c.safetyStatus === "clear" && c.safetyCategory === null)).toBe(true);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document?.status).toBe("outline ready");
  });

  it("parses a plain TXT document end-to-end and produces the minimal viable one-Topic-one-Concept outline (AC #3)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const documentId = await insertDocument("txt", storageKey);
    const deps = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

    await ingestDocument(deps, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ heading: null, text: "Just plain content for this test document." });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document?.status).toBe("outline ready");

    const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
    expect(topics).toHaveLength(1);
    const concepts = await db.select().from(proposedConcepts).where(eq(proposedConcepts.proposedTopicId, topics[0]?.id ?? ""));
    expect(concepts).toHaveLength(1);
    expect(concepts[0]).toMatchObject({ sourcePageRangeStart: null, sourcePageRangeEnd: null, safetyFlagged: false });
  });

  it(
    "is idempotent under redelivery — running the job twice for the same document does not duplicate ContentChunk or proposed-outline rows (review finding)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const deps = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));

      await ingestDocument(deps, { uploadedDocumentId: documentId });
      const firstRunChunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      const firstRunTopics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));

      // Simulates pg-boss's at-least-once delivery redelivering a job whose earlier
      // attempt already committed — the document is now "outline ready", a terminal
      // status, so this second call must be a pure no-op skip.
      await ingestDocument(deps, { uploadedDocumentId: documentId });
      const secondRunChunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      const secondRunTopics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));

      expect(secondRunChunks).toHaveLength(firstRunChunks.length);
      expect(secondRunChunks.map((c) => c.id).sort()).toEqual(firstRunChunks.map((c) => c.id).sort());
      expect(secondRunTopics.map((t) => t.id).sort()).toEqual(firstRunTopics.map((t) => t.id).sort());
    },
    30_000,
  );

  it(
    "marks only the blocked chunk 'blocked' in a multi-chunk document, halts the document, and never runs embedding/outline (AC #1, #2)",
    async () => {
      const storageKey = `test/${randomUUID()}.md`;
      const documentId = await insertDocument("md", storageKey);
      const text = [
        "# Section One",
        "This is ordinary clean content for the first section.",
        "",
        "# Section Two",
        "Here is how to kill yourself using household items.",
      ].join("\n");
      const deps = await depsWithStoredFixture(storageKey, Buffer.from(text));

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(2);
      const sectionOne = chunks.find((c) => c.heading === "Section One");
      const sectionTwo = chunks.find((c) => c.heading === "Section Two");
      expect(sectionOne).toMatchObject({ safetyStatus: "clear", safetyCategory: null });
      expect(sectionTwo).toMatchObject({ safetyStatus: "blocked", safetyCategory: "self-harm-instructions" });

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "blocked", failureReason: "blocked: self-harm-instructions" });

      // AC #1: embedding/outline only ever runs for a document that passed the safety
      // scan — a "blocked" document must produce neither embeddings nor a proposed outline.
      expect(deps.vectorStorePort.entries.size).toBe(0);
      const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
      expect(topics).toHaveLength(0);
    },
    30_000,
  );

  it(
    "proceeds to outline ready when only a minority of chunks are flagged as borderline, and marks only that Concept safetyFlagged (AC #3, #4)",
    async () => {
      const storageKey = `test/${randomUUID()}.md`;
      const documentId = await insertDocument("md", storageKey);
      const text = [
        "# Section One",
        "This is ordinary clean content for the first section.",
        "",
        "# Section Two",
        "This is a damn good example.",
      ].join("\n");
      const deps = await depsWithStoredFixture(storageKey, Buffer.from(text));

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(2);
      const sectionOne = chunks.find((c) => c.heading === "Section One");
      const sectionTwo = chunks.find((c) => c.heading === "Section Two");
      expect(sectionOne).toMatchObject({ safetyStatus: "clear", safetyCategory: null });
      expect(sectionTwo).toMatchObject({ safetyStatus: "flagged", safetyCategory: "profanity" });

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "outline ready", failureReason: null });

      const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
      const topicOne = topics.find((t) => t.title === "Section One");
      const topicTwo = topics.find((t) => t.title === "Section Two");
      const conceptsOne = await db.select().from(proposedConcepts).where(eq(proposedConcepts.proposedTopicId, topicOne?.id ?? ""));
      const conceptsTwo = await db.select().from(proposedConcepts).where(eq(proposedConcepts.proposedTopicId, topicTwo?.id ?? ""));
      expect(conceptsOne[0]?.safetyFlagged).toBe(false);
      expect(conceptsTwo[0]?.safetyFlagged).toBe(true);
    },
    30_000,
  );

  it("marks every chunk 'clear' and reaches outline ready for a document with no safety concerns (AC #4)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const documentId = await insertDocument("txt", storageKey);
    const deps = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

    await ingestDocument(deps, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ safetyStatus: "clear", safetyCategory: null });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "outline ready", failureReason: null });
  });

  it(
    "resumes straight to embedding for a document already at 'parsed' with committed chunks, without re-touching storage (AC #1, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      // Simulates a document whose parse/chunk/safety-scan transaction already
      // committed in an earlier run — insert real ContentChunk rows directly and park
      // the document at "parsed", bypassing the parse step entirely.
      await db.insert(contentChunks).values([
        { documentId, chunkIndex: 0, text: "First section text.", heading: "First", pageRangeStart: 1, pageRangeEnd: 1, safetyStatus: "clear" },
        { documentId, chunkIndex: 1, text: "Second section text.", heading: "Second", pageRangeStart: 2, pageRangeEnd: 2, safetyStatus: "clear" },
      ]);
      await db.update(uploadedDocuments).set({ status: "parsed" }).where(eq(uploadedDocuments.id, documentId));
      const storagePort = createMockStorageAdapter();
      const getObjectSpy = vi.spyOn(storagePort, "getObject");
      const logger = createLogger("test");
      const { generationPort, vectorStorePort } = generationDeps();

      await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).not.toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("outline ready");
      expect(vectorStorePort.entries.size).toBe(2);
      const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
      expect(topics.map((t) => t.title).sort()).toEqual(["First", "Second"]);
    },
    30_000,
  );

  it(
    "reprocesses a document stuck at 'embedding' after an interrupted prior run, without re-touching storage or duplicating proposed-outline rows (AC #1, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      await db.insert(contentChunks).values([{ documentId, chunkIndex: 0, text: "Only section text.", heading: "Only", pageRangeStart: 1, pageRangeEnd: 1, safetyStatus: "clear" }]);
      await db.update(uploadedDocuments).set({ status: "embedding" }).where(eq(uploadedDocuments.id, documentId));
      const storagePort = createMockStorageAdapter();
      const getObjectSpy = vi.spyOn(storagePort, "getObject");
      const logger = createLogger("test");
      const { generationPort, vectorStorePort } = generationDeps();

      await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).not.toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("outline ready");
      const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
      expect(topics).toHaveLength(1);
      expect(vectorStorePort.entries.size).toBe(1);
    },
    30_000,
  );

  it("marks a document 'failed' with 'no extractable content' instead of a hollow outline ready when it has zero ContentChunk rows (AC #3, review finding)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertDocument("pdf", storageKey);
    // Simulates a document that parsed successfully but produced zero chunks (e.g. a
    // whitespace-only upload) — chunks already "committed" (there are none), parked at
    // "parsed" per the resume path.
    await db.update(uploadedDocuments).set({ status: "parsed" }).where(eq(uploadedDocuments.id, documentId));
    const storagePort = createMockStorageAdapter();
    const getObjectSpy = vi.spyOn(storagePort, "getObject");
    const logger = createLogger("test");

    await ingestDocument({ db, storagePort, logger, ...generationDeps() }, { uploadedDocumentId: documentId });

    expect(getObjectSpy).not.toHaveBeenCalled();
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "failed", failureReason: "no extractable content" });
    const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
    expect(topics).toHaveLength(0);
  });

  it("marks a document 'failed' rather than stranding it at 'embedding' forever when embedding/outline generation throws (AD-17, review finding)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertDocument("pdf", storageKey);
    await db.insert(contentChunks).values([{ documentId, chunkIndex: 0, text: "Only section text.", heading: "Only", pageRangeStart: 1, pageRangeEnd: 1, safetyStatus: "clear" }]);
    await db.update(uploadedDocuments).set({ status: "parsed" }).where(eq(uploadedDocuments.id, documentId));
    const storagePort = createMockStorageAdapter();
    const logger = createLogger("test");
    const generationPort = createMockGenerationAdapter();
    vi.spyOn(generationPort, "embed").mockRejectedValue(new Error("provider unavailable"));
    const vectorStorePort = createMockVectorStoreAdapter();

    await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: documentId });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "failed", failureReason: "embedding failed" });
    const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
    expect(topics).toHaveLength(0);
  });

  it(
    "makes 'parsing' observable via a real DB read before storage is fetched, and still reaches outline ready (AC #1)",
    async () => {
      const storageKey = `test/${randomUUID()}.txt`;
      const documentId = await insertDocument("txt", storageKey);
      const storagePort = createMockStorageAdapter();
      await storagePort.putObject(storageKey, Buffer.from("Just plain content for this test document."), "application/octet-stream");
      const logger = createLogger("test");

      const getObjectSpy = vi.spyOn(storagePort, "getObject").mockImplementation(async () => {
        const [midFlightDocument] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
        expect(midFlightDocument).toMatchObject({ status: "parsing" });
        return Buffer.from("Just plain content for this test document.");
      });

      await ingestDocument({ db, storagePort, logger, ...generationDeps() }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).toHaveBeenCalledTimes(1);
      const [finalDocument] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(finalDocument).toMatchObject({ status: "outline ready" });
    },
    30_000,
  );

  it(
    "writes 'parsing' then 'safety scan' then 'embedding' via standalone db.update calls, in order, before the final transaction (AC #1)",
    async () => {
      const storageKey = `test/${randomUUID()}.txt`;
      const documentId = await insertDocument("txt", storageKey);
      const deps = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

      const statusUpdates: string[] = [];
      const originalUpdate = db.update.bind(db);
      const updateSpy = vi.spyOn(db, "update").mockImplementation((table: Parameters<typeof db.update>[0]) => {
        const builder = originalUpdate(table);
        const originalSet = builder.set.bind(builder);
        return Object.assign(builder, {
          set: (values: { status?: string }) => {
            if (values?.status) statusUpdates.push(values.status);
            return originalSet(values);
          },
        });
      });

      try {
        await ingestDocument(deps, { uploadedDocumentId: documentId });
      } finally {
        updateSpy.mockRestore();
      }

      expect(statusUpdates).toEqual(["parsing", "safety scan", "embedding"]);
    },
    30_000,
  );

  it(
    "reprocesses a document stuck at 'parsing' after an interrupted prior run, rather than skipping it forever (AC #1, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      await db.update(uploadedDocuments).set({ status: "parsing" }).where(eq(uploadedDocuments.id, documentId));
      const deps = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));
      const getObjectSpy = vi.spyOn(deps.storagePort, "getObject");

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      expect(getObjectSpy).toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("outline ready");
    },
    30_000,
  );

  it(
    "reprocesses a document stuck at 'safety scan' after an interrupted prior run, rather than skipping it forever (AC #1, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      await db.update(uploadedDocuments).set({ status: "safety scan" }).where(eq(uploadedDocuments.id, documentId));
      const deps = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));
      const getObjectSpy = vi.spyOn(deps.storagePort, "getObject");

      await ingestDocument(deps, { uploadedDocumentId: documentId });

      expect(getObjectSpy).toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("outline ready");
    },
    30_000,
  );

  it("skips a document that is already 'failed' without touching storage or re-processing (review finding)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertDocument("pdf", storageKey);
    await db.update(uploadedDocuments).set({ status: "failed", failureReason: "corrupt file" }).where(eq(uploadedDocuments.id, documentId));
    const storagePort = createMockStorageAdapter();
    const getObjectSpy = vi.spyOn(storagePort, "getObject");
    const logger = createLogger("test");

    await ingestDocument({ db, storagePort, logger, ...generationDeps() }, { uploadedDocumentId: documentId });

    expect(getObjectSpy).not.toHaveBeenCalled();
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "failed", failureReason: "corrupt file" });
  });

  it("skips a document that is already 'blocked' without touching storage or re-scanning (review finding)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertDocument("pdf", storageKey);
    await db.update(uploadedDocuments).set({ status: "blocked", failureReason: "blocked: self-harm-instructions" }).where(eq(uploadedDocuments.id, documentId));
    const storagePort = createMockStorageAdapter();
    const getObjectSpy = vi.spyOn(storagePort, "getObject");
    const logger = createLogger("test");

    await ingestDocument({ db, storagePort, logger, ...generationDeps() }, { uploadedDocumentId: documentId });

    expect(getObjectSpy).not.toHaveBeenCalled();
    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(0);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "blocked", failureReason: "blocked: self-harm-instructions" });
  });

  it("skips a document that is already 'outline ready' without touching storage, re-embedding, or duplicating proposed-outline rows (Story 2.12)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertDocument("pdf", storageKey);
    await db.update(uploadedDocuments).set({ status: "outline ready" }).where(eq(uploadedDocuments.id, documentId));
    const storagePort = createMockStorageAdapter();
    const getObjectSpy = vi.spyOn(storagePort, "getObject");
    const { generationPort, vectorStorePort } = generationDeps();
    const embedSpy = vi.spyOn(generationPort, "embed");
    const logger = createLogger("test");

    await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: documentId });

    expect(getObjectSpy).not.toHaveBeenCalled();
    expect(embedSpy).not.toHaveBeenCalled();
    const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
    expect(topics).toHaveLength(0);
  });

  it("reaches 'embedded' (not 'outline ready') for a personal note attached to a catalog course, with zero proposed-outline rows and the real courseId on its embeddings (Story 2.14, AC #1, #2)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const courseId = randomUUID();
    const documentId = await insertCourseNoteDocument("txt", storageKey, courseId);
    const deps = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

    await ingestDocument(deps, { uploadedDocumentId: documentId });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "embedded", failureReason: null, courseId, customCourseId: null });

    const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
    expect(topics).toHaveLength(0);

    expect(deps.vectorStorePort.entries.size).toBeGreaterThan(0);
    expect([...deps.vectorStorePort.entries.values()].every((e) => e.courseId === courseId && e.customCourseId === null)).toBe(true);
  });

  it("fails a catalog-course-attached note exactly like a standalone custom-course upload on the same failure reason (Story 2.14, AC #3)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertCourseNoteDocument("pdf", storageKey);
    const deps = await depsWithStoredFixture(storageKey, fixture("encrypted.pdf"));

    await ingestDocument(deps, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(0);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "failed", failureReason: "encrypted file" });
  });

  it(
    "resumes straight to embedding for a courseId-scoped document already at 'parsed' with committed chunks, reaching 'embedded' with zero proposed-outline rows (Story 2.14, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const courseId = randomUUID();
      const documentId = await insertCourseNoteDocument("pdf", storageKey, courseId);
      await db.insert(contentChunks).values([{ documentId, chunkIndex: 0, text: "Only section text.", heading: "Only", pageRangeStart: 1, pageRangeEnd: 1, safetyStatus: "clear" }]);
      await db.update(uploadedDocuments).set({ status: "parsed" }).where(eq(uploadedDocuments.id, documentId));
      const storagePort = createMockStorageAdapter();
      const getObjectSpy = vi.spyOn(storagePort, "getObject");
      const logger = createLogger("test");
      const { generationPort, vectorStorePort } = generationDeps();

      await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).not.toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "embedded", courseId, customCourseId: null });
      expect(vectorStorePort.entries.size).toBe(1);
      const topics = await db.select().from(proposedTopics).where(eq(proposedTopics.documentId, documentId));
      expect(topics).toHaveLength(0);
    },
    30_000,
  );

  it("fails cleanly with no chunk_embeddings written when a document somehow has BOTH customCourseId and courseId set (review finding: symmetric invariant guard)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const [row] = await db
      .insert(uploadedDocuments)
      .values({
        ownerId: OWNER_ID,
        customCourseId: randomUUID(),
        courseId: randomUUID(),
        fileName: "test.txt",
        fileType: "txt",
        fileSizeBytes: 100,
        storageKey,
        copyrightAttested: true,
        status: "parsed",
      })
      .returning();
    if (!row) throw new Error("failed to insert test document");
    await db.insert(contentChunks).values([{ documentId: row.id, chunkIndex: 0, text: "text", heading: null, safetyStatus: "clear" }]);
    const storagePort = createMockStorageAdapter();
    const logger = createLogger("test");
    const { generationPort, vectorStorePort } = generationDeps();

    await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: row.id });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, row.id));
    expect(document).toMatchObject({ status: "failed", failureReason: "internal error" });
    expect(vectorStorePort.entries.size).toBe(0);
  });

  it("fails cleanly with no chunk_embeddings written when a document has NEITHER customCourseId nor courseId set (review finding: symmetric invariant guard)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const [row] = await db
      .insert(uploadedDocuments)
      .values({
        ownerId: OWNER_ID,
        fileName: "test.txt",
        fileType: "txt",
        fileSizeBytes: 100,
        storageKey,
        copyrightAttested: true,
        status: "parsed",
      })
      .returning();
    if (!row) throw new Error("failed to insert test document");
    await db.insert(contentChunks).values([{ documentId: row.id, chunkIndex: 0, text: "text", heading: null, safetyStatus: "clear" }]);
    const storagePort = createMockStorageAdapter();
    const logger = createLogger("test");
    const { generationPort, vectorStorePort } = generationDeps();

    await ingestDocument({ db, storagePort, logger, generationPort, vectorStorePort }, { uploadedDocumentId: row.id });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, row.id));
    expect(document).toMatchObject({ status: "failed", failureReason: "internal error" });
    expect(vectorStorePort.entries.size).toBe(0);
  });
});
