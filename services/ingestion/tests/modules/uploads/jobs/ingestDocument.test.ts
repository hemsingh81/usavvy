import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createLogger, createMockStorageAdapter } from "@usavvy/service-kernel";
import { createDb, type Db } from "../../../../src/db/client.js";
import { contentChunks, uploadedDocuments } from "../../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../../src/config.js";
import { ingestDocument } from "../../../../src/modules/uploads/jobs/ingestDocument.js";

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

async function depsWithStoredFixture(storageKey: string, buffer: Buffer) {
  const storagePort = createMockStorageAdapter();
  await storagePort.putObject(storageKey, buffer, "application/octet-stream");
  return { db, storagePort, logger: createLogger("test") };
}

describe("ingestDocument", () => {
  it(
    "parses a valid PDF, inserts ContentChunks linked to the document with page ranges, and marks it parsed (AC #1)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.some((c) => c.heading === "Chapter One" && c.pageRangeStart === 1)).toBe(true);
      expect(chunks.some((c) => c.heading === "Chapter Two" && c.pageRangeStart === 2)).toBe(true);
      expect(chunks.every((c) => c.safetyStatus === "clear" && c.safetyCategory === null)).toBe(true);

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "parsed", failureReason: null });
    },
    30_000,
  );

  it(
    "marks an encrypted PDF failed with the AC #3 reason and inserts zero ContentChunks",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("encrypted.pdf"));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

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
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("corrupt.pdf"));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(0);

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "failed", failureReason: "corrupt file" });
    },
    30_000,
  );

  it(
    "runs OCR for a scanned PDF page with no text layer and stores the OCR text as a chunk (AC #2)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("scanned-no-text.pdf"));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]?.text.toUpperCase()).toContain("HELLO WORLD");

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("parsed");
    },
    30_000,
  );

  it("logs and returns cleanly for a job referencing a document that no longer exists, rather than throwing (AD-17)", async () => {
    const storagePort = createMockStorageAdapter();
    const logger = createLogger("test");

    await expect(ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: randomUUID() })).resolves.toBeUndefined();
  });

  it("parses a valid DOCX end-to-end through the real job handler", async () => {
    const storageKey = `test/${randomUUID()}.docx`;
    const documentId = await insertDocument("docx", storageKey);
    const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("valid-structured.docx"));

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks.some((c) => c.heading === "Introduction")).toBe(true);
    expect(chunks.every((c) => c.safetyStatus === "clear" && c.safetyCategory === null)).toBe(true);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document?.status).toBe("parsed");
  });

  it("parses a valid PPTX end-to-end through the real job handler", async () => {
    const storageKey = `test/${randomUUID()}.pptx`;
    const documentId = await insertDocument("pptx", storageKey);
    const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("valid-structured.pptx"));

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks.some((c) => c.heading === "Slide One Title" && c.pageRangeStart === 1)).toBe(true);
    expect(chunks.every((c) => c.safetyStatus === "clear" && c.safetyCategory === null)).toBe(true);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document?.status).toBe("parsed");
  });

  it("parses a plain TXT document end-to-end (no headings, one chunk)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const documentId = await insertDocument("txt", storageKey);
    const { storagePort, logger } = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ heading: null, text: "Just plain content for this test document." });
  });

  it(
    "is idempotent under redelivery — running the job twice for the same document does not duplicate ContentChunk rows (review finding)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });
      const firstRunChunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));

      // Simulates pg-boss's at-least-once delivery redelivering a job whose earlier
      // attempt already committed — the document is now "parsed", not "queued".
      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });
      const secondRunChunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));

      expect(secondRunChunks).toHaveLength(firstRunChunks.length);
      expect(secondRunChunks.map((c) => c.id).sort()).toEqual(firstRunChunks.map((c) => c.id).sort());
    },
    30_000,
  );

  it(
    "marks only the blocked chunk 'blocked' in a multi-chunk document, leaves the other chunk's own status intact, and halts the document (AC #1, #2)",
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
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, Buffer.from(text));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(2);
      const sectionOne = chunks.find((c) => c.heading === "Section One");
      const sectionTwo = chunks.find((c) => c.heading === "Section Two");
      expect(sectionOne).toMatchObject({ safetyStatus: "clear", safetyCategory: null });
      expect(sectionTwo).toMatchObject({ safetyStatus: "blocked", safetyCategory: "self-harm-instructions" });

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "blocked", failureReason: "blocked: self-harm-instructions" });
    },
    30_000,
  );

  it(
    "proceeds to 'parsed' when only a minority of chunks in a multi-chunk document are flagged as borderline, marking only that chunk (AC #3)",
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
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, Buffer.from(text));

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
      expect(chunks).toHaveLength(2);
      const sectionOne = chunks.find((c) => c.heading === "Section One");
      const sectionTwo = chunks.find((c) => c.heading === "Section Two");
      expect(sectionOne).toMatchObject({ safetyStatus: "clear", safetyCategory: null });
      expect(sectionTwo).toMatchObject({ safetyStatus: "flagged", safetyCategory: "profanity" });

      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document).toMatchObject({ status: "parsed", failureReason: null });
    },
    30_000,
  );

  it("marks every chunk 'clear' and status 'parsed' for a document with no safety concerns (AC #4)", async () => {
    const storageKey = `test/${randomUUID()}.txt`;
    const documentId = await insertDocument("txt", storageKey);
    const { storagePort, logger } = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ safetyStatus: "clear", safetyCategory: null });

    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "parsed", failureReason: null });
  });

  it("skips a document that isn't 'queued' without touching storage or re-parsing (review finding)", async () => {
    const storageKey = `test/${randomUUID()}.pdf`;
    const documentId = await insertDocument("pdf", storageKey);
    await db.update(uploadedDocuments).set({ status: "parsed" }).where(eq(uploadedDocuments.id, documentId));
    const storagePort = createMockStorageAdapter();
    const getObjectSpy = vi.spyOn(storagePort, "getObject");
    const logger = createLogger("test");

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

    expect(getObjectSpy).not.toHaveBeenCalled();
    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(0);
  });

  it(
    "makes 'parsing' observable via a real DB read before storage is fetched (AC #1)",
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

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).toHaveBeenCalledTimes(1);
      const [finalDocument] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(finalDocument).toMatchObject({ status: "parsed" });
    },
    30_000,
  );

  it(
    "writes 'parsing' then 'safety scan' via standalone db.update calls, in order, before the final transaction (AC #1)",
    async () => {
      const storageKey = `test/${randomUUID()}.txt`;
      const documentId = await insertDocument("txt", storageKey);
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, Buffer.from("Just plain content for this test document."));

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
        await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });
      } finally {
        updateSpy.mockRestore();
      }

      expect(statusUpdates).toEqual(["parsing", "safety scan"]);
    },
    30_000,
  );

  it(
    "reprocesses a document stuck at 'parsing' after an interrupted prior run, rather than skipping it forever (AC #1, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      await db.update(uploadedDocuments).set({ status: "parsing" }).where(eq(uploadedDocuments.id, documentId));
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));
      const getObjectSpy = vi.spyOn(storagePort, "getObject");

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("parsed");
    },
    30_000,
  );

  it(
    "reprocesses a document stuck at 'safety scan' after an interrupted prior run, rather than skipping it forever (AC #1, crash-recovery)",
    async () => {
      const storageKey = `test/${randomUUID()}.pdf`;
      const documentId = await insertDocument("pdf", storageKey);
      await db.update(uploadedDocuments).set({ status: "safety scan" }).where(eq(uploadedDocuments.id, documentId));
      const { storagePort, logger } = await depsWithStoredFixture(storageKey, fixture("valid-text.pdf"));
      const getObjectSpy = vi.spyOn(storagePort, "getObject");

      await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

      expect(getObjectSpy).toHaveBeenCalled();
      const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
      expect(document?.status).toBe("parsed");
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

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

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

    await ingestDocument({ db, storagePort, logger }, { uploadedDocumentId: documentId });

    expect(getObjectSpy).not.toHaveBeenCalled();
    const chunks = await db.select().from(contentChunks).where(eq(contentChunks.documentId, documentId));
    expect(chunks).toHaveLength(0);
    const [document] = await db.select().from(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));
    expect(document).toMatchObject({ status: "blocked", failureReason: "blocked: self-harm-instructions" });
  });
});
