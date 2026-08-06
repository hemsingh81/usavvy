import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { chunkEmbeddings, contentChunks, uploadedDocuments } from "../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../src/config.js";
import { createPgvectorAdapter } from "../../../src/modules/generation/vectorStorePgvector.js";

const config = loadIngestionConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-vectorstore-pgvector";

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID));
});

afterAll(async () => {
  await sql.end();
});

async function insertDocumentWithChunk(): Promise<{ documentId: string; chunkId: string }> {
  const [document] = await db
    .insert(uploadedDocuments)
    .values({
      ownerId: OWNER_ID,
      customCourseId: randomUUID(),
      fileName: "test.txt",
      fileType: "txt",
      fileSizeBytes: 10,
      storageKey: `test/${randomUUID()}.txt`,
      copyrightAttested: true,
      status: "parsed",
    })
    .returning();
  if (!document) throw new Error("failed to insert test document");
  const [chunk] = await db
    .insert(contentChunks)
    .values({ documentId: document.id, chunkIndex: 0, text: "chunk text", heading: null, safetyStatus: "clear" })
    .returning();
  if (!chunk) throw new Error("failed to insert test chunk");
  return { documentId: document.id, chunkId: chunk.id };
}

describe("createPgvectorAdapter", () => {
  it("persists an entry's chunkId/documentId/customCourseId/conceptId/embedding", async () => {
    const { documentId, chunkId } = await insertDocumentWithChunk();
    const adapter = createPgvectorAdapter(db);
    const embedding = Array.from({ length: 1536 }, (_, i) => i / 1536);

    const customCourseId = randomUUID();
    await adapter.upsert([{ chunkId, documentId, customCourseId, conceptId: null, embedding }]);

    const [row] = await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunkId));
    expect(row).toMatchObject({ documentId, customCourseId, conceptId: null });
    expect(row?.embedding).toHaveLength(1536);
    expect(row?.embedding[0]).toBeCloseTo(0, 5);
    expect(row?.embedding[1535]).toBeCloseTo(1535 / 1536, 5);
  });

  it("persists a null customCourseId alongside a real courseId, for a catalog-course-attached note (Story 2.14, AC #2)", async () => {
    const { documentId, chunkId } = await insertDocumentWithChunk();
    const adapter = createPgvectorAdapter(db);
    const courseId = randomUUID();

    await adapter.upsert([{ chunkId, documentId, customCourseId: null, courseId, conceptId: null, embedding: Array(1536).fill(0) }]);

    const [row] = await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunkId));
    expect(row).toMatchObject({ customCourseId: null, courseId });
  });

  it("updates in place on a repeat upsert for the same chunkId rather than duplicating", async () => {
    const { documentId, chunkId } = await insertDocumentWithChunk();
    const adapter = createPgvectorAdapter(db);

    await adapter.upsert([{ chunkId, documentId, customCourseId: randomUUID(), conceptId: null, embedding: Array(1536).fill(0) }]);
    await adapter.upsert([{ chunkId, documentId, customCourseId: randomUUID(), conceptId: null, embedding: Array(1536).fill(1) }]);

    const rows = await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunkId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.embedding[0]).toBeCloseTo(1, 5);
  });

  it("cascades delete from uploadedDocuments to the chunk_embeddings row", async () => {
    const { documentId, chunkId } = await insertDocumentWithChunk();
    const adapter = createPgvectorAdapter(db);
    await adapter.upsert([{ chunkId, documentId, customCourseId: randomUUID(), conceptId: null, embedding: Array(1536).fill(0) }]);

    await db.delete(uploadedDocuments).where(eq(uploadedDocuments.id, documentId));

    const rows = await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunkId));
    expect(rows).toHaveLength(0);
  });

  it("cascades delete from contentChunks directly (its own onDelete: cascade FK, independent of the documentId FK)", async () => {
    const { documentId, chunkId } = await insertDocumentWithChunk();
    const adapter = createPgvectorAdapter(db);
    await adapter.upsert([{ chunkId, documentId, customCourseId: randomUUID(), conceptId: null, embedding: Array(1536).fill(0) }]);

    await db.delete(contentChunks).where(eq(contentChunks.id, chunkId));

    const rows = await db.select().from(chunkEmbeddings).where(eq(chunkEmbeddings.chunkId, chunkId));
    expect(rows).toHaveLength(0);
  });
});
