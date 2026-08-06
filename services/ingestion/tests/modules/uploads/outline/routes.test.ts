import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../../src/app.js";
import { createDb, type Db } from "../../../../src/db/client.js";
import { proposedConcepts, proposedTopics, uploadedDocuments } from "../../../../src/db/schema.js";
import { loadIngestionConfig } from "../../../../src/config.js";
import { createTestAppDeps, TEST_INTERNAL_SECRET } from "../../../testHelpers.js";

const config = loadIngestionConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-outline-routes";
const internalHeaders = { "x-internal-secret": TEST_INTERNAL_SECRET };
const learnerHeaders = { ...internalHeaders, "x-user-id": OWNER_ID, "x-user-role": "student" };
const otherLearnerHeaders = { ...internalHeaders, "x-user-id": "test-owner-outline-routes-other", "x-user-role": "student" };

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  await db.delete(uploadedDocuments).where(eq(uploadedDocuments.ownerId, OWNER_ID));
});

afterAll(async () => {
  await sql.end();
});

async function seedOutline(): Promise<{ customCourseId: string; topicId: string; conceptId: string }> {
  const customCourseId = randomUUID();
  const [document] = await db
    .insert(uploadedDocuments)
    .values({ ownerId: OWNER_ID, customCourseId, fileName: "notes.pdf", fileType: "pdf", fileSizeBytes: 10, storageKey: `test/${randomUUID()}`, copyrightAttested: true, status: "outline ready" })
    .returning();
  const [topic] = await db.insert(proposedTopics).values({ documentId: document!.id, customCourseId, title: "Topic", position: 0 }).returning();
  const [concept] = await db.insert(proposedConcepts).values({ proposedTopicId: topic!.id, title: "Concept", position: 0 }).returning();
  return { customCourseId, topicId: topic!.id, conceptId: concept!.id };
}

describe("GET /uploads/outline", () => {
  it("requires auth", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const response = await app.inject({ method: "GET", url: `/uploads/outline?customCourseId=${randomUUID()}`, headers: internalHeaders });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns the seeded outline for its owner", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { customCourseId } = await seedOutline();

    const response = await app.inject({ method: "GET", url: `/uploads/outline?customCourseId=${customCourseId}`, headers: learnerHeaders });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject([{ title: "Topic", concepts: [{ title: "Concept" }] }]);
    await app.close();
  });
});

describe("PATCH /uploads/outline/topics/:id", () => {
  it("renames and 404s for another owner", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { topicId } = await seedOutline();

    const ok = await app.inject({ method: "PATCH", url: `/uploads/outline/topics/${topicId}`, headers: learnerHeaders, payload: { title: "Renamed" } });
    const forbidden = await app.inject({ method: "PATCH", url: `/uploads/outline/topics/${topicId}`, headers: otherLearnerHeaders, payload: { title: "Hijack" } });

    expect(ok.statusCode).toBe(204);
    expect(forbidden.statusCode).toBe(404);
    await app.close();
  });
});

describe("DELETE /uploads/outline/concepts/:id", () => {
  it("removes the concept", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { conceptId } = await seedOutline();

    const response = await app.inject({ method: "DELETE", url: `/uploads/outline/concepts/${conceptId}`, headers: learnerHeaders });

    expect(response.statusCode).toBe(204);
    await app.close();
  });
});

describe("PUT /uploads/outline/topics/reorder", () => {
  it("rejects a list that doesn't match the current topic set", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { customCourseId } = await seedOutline();

    const response = await app.inject({
      method: "PUT",
      url: "/uploads/outline/topics/reorder",
      headers: learnerHeaders,
      payload: { customCourseId, orderedTopicIds: [randomUUID()] },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /uploads/outline/confirm", () => {
  it("blocks confirmation with zero topics (AC #3)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { customCourseId, topicId } = await seedOutline();
    await app.inject({ method: "DELETE", url: `/uploads/outline/topics/${topicId}`, headers: learnerHeaders });

    const response = await app.inject({ method: "POST", url: "/uploads/outline/confirm", headers: learnerHeaders, payload: { customCourseId } });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns the ready-to-materialize outline for a valid custom course", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const { customCourseId } = await seedOutline();

    const response = await app.inject({ method: "POST", url: "/uploads/outline/confirm", headers: learnerHeaders, payload: { customCourseId } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ alreadyConfirmed: false, topics: [{ title: "Topic" }] });
    await app.close();
  });
});
