import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../../src/db/client.js";
import { customCourseConfirmations, proposedConcepts, proposedTopics, uploadedDocuments } from "../../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../../src/config.js";
import {
  confirmOutline,
  deleteProposedConcept,
  deleteProposedTopic,
  listProposedOutline,
  mergeProposedConcepts,
  recordOutlineConfirmation,
  renameProposedConcept,
  renameProposedTopic,
  reorderProposedTopics,
  setProposedConceptPriority,
  setProposedTopicPriority,
} from "../../../../src/modules/uploads/outline/service.js";

const config = loadIngestionConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-outline";
const OTHER_OWNER_ID = "test-owner-outline-other";

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  for (const ownerId of [OWNER_ID, OTHER_OWNER_ID]) {
    const docs = await db.select({ id: uploadedDocuments.id, customCourseId: uploadedDocuments.customCourseId }).from(uploadedDocuments).where(eq(uploadedDocuments.ownerId, ownerId));
    for (const doc of docs) {
      await db.delete(customCourseConfirmations).where(eq(customCourseConfirmations.customCourseId, doc.customCourseId));
    }
    await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, ownerId));
  }
});

afterAll(async () => {
  await sql.end();
});

async function insertDocument(ownerId: string, customCourseId: string, fileName = "notes.pdf"): Promise<string> {
  const [row] = await db
    .insert(uploadedDocuments)
    .values({ ownerId, customCourseId, fileName, fileType: "pdf", fileSizeBytes: 10, storageKey: `test/${randomUUID()}`, copyrightAttested: true, status: "outline ready" })
    .returning();
  if (!row) throw new Error("failed to insert test document");
  return row.id;
}

async function insertTopic(documentId: string, customCourseId: string, title: string, position: number): Promise<string> {
  const [row] = await db.insert(proposedTopics).values({ documentId, customCourseId, title, position }).returning();
  if (!row) throw new Error("failed to insert test topic");
  return row.id;
}

async function insertConcept(
  proposedTopicId: string,
  title: string,
  position: number,
  overrides: Partial<{ sourcePageRangeStart: number | null; sourcePageRangeEnd: number | null }> = {},
): Promise<string> {
  const [row] = await db.insert(proposedConcepts).values({ proposedTopicId, title, position, ...overrides }).returning();
  if (!row) throw new Error("failed to insert test concept");
  return row.id;
}

describe("listProposedOutline", () => {
  it("returns topics and concepts in position order, ownership-scoped (AC #1)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Chapter One", 0);
    await insertConcept(topicId, "Intro", 0, { sourcePageRangeStart: 1, sourcePageRangeEnd: 2 });

    const result = await listProposedOutline(db, OWNER_ID, customCourseId);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ title: "Chapter One", priority: false, concepts: [{ title: "Intro", sourcePageRangeStart: 1, sourcePageRangeEnd: 2 }] });
  });

  it("returns nothing for another owner's custom course (ownership scoping)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    await insertTopic(documentId, customCourseId, "Chapter One", 0);

    const result = await listProposedOutline(db, OTHER_OWNER_ID, customCourseId);

    expect(result).toHaveLength(0);
  });
});

describe("renameProposedTopic / renameProposedConcept", () => {
  it("renames a topic and a concept owned by the caller", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Old Title", 0);
    const conceptId = await insertConcept(topicId, "Old Concept", 0);

    await renameProposedTopic(db, OWNER_ID, topicId, "New Title");
    await renameProposedConcept(db, OWNER_ID, conceptId, "New Concept");

    const [outline] = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline).toMatchObject({ title: "New Title", concepts: [{ title: "New Concept" }] });
  });

  it("404s renaming another owner's topic/concept", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Title", 0);
    const conceptId = await insertConcept(topicId, "Concept", 0);

    await expect(renameProposedTopic(db, OTHER_OWNER_ID, topicId, "Hijacked")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(renameProposedConcept(db, OTHER_OWNER_ID, conceptId, "Hijacked")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setProposedTopicPriority / setProposedConceptPriority", () => {
  it("toggles priority independently at both levels (AC #1)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    const conceptId = await insertConcept(topicId, "Concept", 0);

    await setProposedTopicPriority(db, OWNER_ID, topicId, true);
    await setProposedConceptPriority(db, OWNER_ID, conceptId, true);

    const [outline] = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline).toMatchObject({ priority: true, concepts: [{ priority: true }] });
  });
});

describe("deleteProposedTopic / deleteProposedConcept", () => {
  it("deleting a topic cascades to its concepts", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    const conceptId = await insertConcept(topicId, "Concept", 0);

    await deleteProposedTopic(db, OWNER_ID, topicId);

    const rows = await db.select().from(proposedConcepts).where(eq(proposedConcepts.id, conceptId));
    expect(rows).toHaveLength(0);
    expect(await listProposedOutline(db, OWNER_ID, customCourseId)).toHaveLength(0);
  });

  it("deleting a concept leaves its sibling topic/concepts intact", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    const keepConceptId = await insertConcept(topicId, "Keep", 0);
    const deleteConceptId = await insertConcept(topicId, "Delete", 1);

    await deleteProposedConcept(db, OWNER_ID, deleteConceptId);

    const [outline] = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline?.concepts.map((c) => c.id)).toEqual([keepConceptId]);
  });
});

describe("reorderProposedTopics", () => {
  it("rewrites position to the exact requested order (AC #1)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const first = await insertTopic(documentId, customCourseId, "First", 0);
    const second = await insertTopic(documentId, customCourseId, "Second", 1);

    await reorderProposedTopics(db, OWNER_ID, customCourseId, [second, first]);

    const outline = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline.map((t) => t.id)).toEqual([second, first]);
  });

  it("rejects a list that doesn't exactly match the current topic set", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const first = await insertTopic(documentId, customCourseId, "First", 0);
    await insertTopic(documentId, customCourseId, "Second", 1);

    await expect(reorderProposedTopics(db, OWNER_ID, customCourseId, [first])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects a duplicate id even when the Set of ids still matches the current topic set (review finding)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const first = await insertTopic(documentId, customCourseId, "First", 0);
    const second = await insertTopic(documentId, customCourseId, "Second", 1);

    await expect(reorderProposedTopics(db, OWNER_ID, customCourseId, [first, first, second])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("mergeProposedConcepts", () => {
  it("unions source page ranges and deletes the merged-away concept (AC #4)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    const keepId = await insertConcept(topicId, "Keep", 0, { sourcePageRangeStart: 3, sourcePageRangeEnd: 3 });
    const mergeId = await insertConcept(topicId, "Merge", 1, { sourcePageRangeStart: 5, sourcePageRangeEnd: 6 });

    await mergeProposedConcepts(db, OWNER_ID, keepId, mergeId);

    const [outline] = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline?.concepts).toHaveLength(1);
    expect(outline?.concepts[0]).toMatchObject({ id: keepId, sourcePageRangeStart: 3, sourcePageRangeEnd: 6 });
  });

  it("a null page range on either side makes the merged range null (Dev Notes: no constraint from that side)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    const keepId = await insertConcept(topicId, "Keep", 0, { sourcePageRangeStart: null, sourcePageRangeEnd: null });
    const mergeId = await insertConcept(topicId, "Merge", 1, { sourcePageRangeStart: 5, sourcePageRangeEnd: 6 });

    await mergeProposedConcepts(db, OWNER_ID, keepId, mergeId);

    const [outline] = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline?.concepts[0]).toMatchObject({ sourcePageRangeStart: null, sourcePageRangeEnd: null });
  });

  it("rejects merging concepts from different proposed topics (Scope Note)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicA = await insertTopic(documentId, customCourseId, "Topic A", 0);
    const topicB = await insertTopic(documentId, customCourseId, "Topic B", 1);
    const conceptA = await insertConcept(topicA, "A", 0);
    const conceptB = await insertConcept(topicB, "B", 0);

    await expect(mergeProposedConcepts(db, OWNER_ID, conceptA, conceptB)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects merging a concept into itself, without deleting it (review finding)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    const conceptId = await insertConcept(topicId, "Solo", 0);

    await expect(mergeProposedConcepts(db, OWNER_ID, conceptId, conceptId)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [outline] = await listProposedOutline(db, OWNER_ID, customCourseId);
    expect(outline?.concepts.map((c) => c.id)).toEqual([conceptId]);
  });
});

describe("confirmOutline / recordOutlineConfirmation", () => {
  it("returns the ready-to-materialize outline with a title derived from the first document's fileName (AC #2)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId, "my-lecture-notes.pdf");
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    await insertConcept(topicId, "Concept", 0);

    const result = await confirmOutline(db, OWNER_ID, customCourseId);

    expect(result).toMatchObject({ alreadyConfirmed: false, title: "my-lecture-notes", topics: [{ title: "Topic" }] });
  });

  it("blocks confirmation with zero topics remaining (AC #3)", async () => {
    const customCourseId = randomUUID();
    await insertDocument(OWNER_ID, customCourseId);

    await expect(confirmOutline(db, OWNER_ID, customCourseId)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("blocks confirmation when a remaining Topic has zero Concepts (review finding, extends AC #3)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    await insertTopic(documentId, customCourseId, "Empty Topic", 0);

    await expect(confirmOutline(db, OWNER_ID, customCourseId)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // The rejected claim must roll back so a later, valid confirm attempt isn't stuck
    // behind a permanently-claimed row that will never get its courseId recorded.
    const rows = await db.select().from(customCourseConfirmations).where(eq(customCourseConfirmations.customCourseId, customCourseId));
    expect(rows).toHaveLength(0);
  });

  it("a second concurrent claim attempt for the same not-yet-confirmed outline gets a 409, not a duplicate materialization (review finding)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    await insertConcept(topicId, "Concept", 0);

    // Simulates confirmOutline's own first call having already claimed the row (e.g. a
    // concurrent request from a second tab) without yet calling recordOutlineConfirmation.
    await db.insert(customCourseConfirmations).values({ customCourseId, ownerId: OWNER_ID, courseId: null });

    await expect(confirmOutline(db, OWNER_ID, customCourseId)).rejects.toMatchObject({ code: "OUTLINE_CONFIRMATION_IN_PROGRESS", statusCode: 409 });
  });

  it("is idempotent — a second confirm call after recordOutlineConfirmation returns the existing courseId without re-validating (AC #2)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    await insertConcept(topicId, "Concept", 0);
    await confirmOutline(db, OWNER_ID, customCourseId);
    const realCourseId = randomUUID();
    await recordOutlineConfirmation(db, OWNER_ID, customCourseId, realCourseId);

    // Even after deleting every topic (simulating "nothing left to validate"), the
    // already-confirmed short-circuit must still return the recorded courseId, never
    // re-run the zero-topics check.
    await deleteProposedTopic(db, OWNER_ID, topicId);

    const result = await confirmOutline(db, OWNER_ID, customCourseId);
    expect(result).toEqual({ alreadyConfirmed: true, courseId: realCourseId });
  });

  it("a different owner's confirm attempt for the same (colliding) customCourseId never reveals the other owner's confirmation record (ownership scoping)", async () => {
    const customCourseId = randomUUID();
    const documentId = await insertDocument(OWNER_ID, customCourseId);
    const topicId = await insertTopic(documentId, customCourseId, "Topic", 0);
    await insertConcept(topicId, "Concept", 0);
    await confirmOutline(db, OWNER_ID, customCourseId);
    await recordOutlineConfirmation(db, OWNER_ID, customCourseId, randomUUID());

    // The claim row for this customCourseId already belongs to OWNER_ID — a different
    // owner's insert can't win the PK conflict, and the existing-row lookup is scoped to
    // their own ownerId, so they see NOT_FOUND, never OWNER_ID's confirmation.
    await expect(confirmOutline(db, OTHER_OWNER_ID, customCourseId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
