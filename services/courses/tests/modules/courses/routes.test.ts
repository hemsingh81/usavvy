import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb } from "../../../src/db/client.js";
import { concepts, conceptPrerequisites, courseCustomizations, courses, learnerCoursePins, modules, topics } from "../../../src/db/schema.js";
import { loadCoursesConfig } from "../../../src/config.js";
import { createTestAppDeps, TEST_INTERNAL_SECRET } from "../../testHelpers.js";

const config = loadCoursesConfig(process.env);
const sql = postgres(config.databaseUrl);
const db = createDb(sql);
const createdCourseIds: string[] = [];
const internalHeaders = { "x-internal-secret": TEST_INTERNAL_SECRET };
const adminHeaders = { ...internalHeaders, "x-user-id": "u1", "x-user-role": "admin" };

afterEach(async () => {
  while (createdCourseIds.length > 0) {
    const courseId = createdCourseIds.pop();
    if (!courseId) continue;
    await db.delete(learnerCoursePins).where(eq(learnerCoursePins.pinnedCourseId, courseId));
    await db.delete(learnerCoursePins).where(eq(learnerCoursePins.versionGroupId, courseId));
    await db.delete(courseCustomizations).where(eq(courseCustomizations.courseId, courseId));
    const moduleRows = await db.select().from(modules).where(eq(modules.courseId, courseId));
    for (const moduleRow of moduleRows) {
      const topicRows = await db.select().from(topics).where(eq(topics.moduleId, moduleRow.id));
      for (const topicRow of topicRows) {
        const conceptRows = await db.select().from(concepts).where(eq(concepts.topicId, topicRow.id));
        for (const conceptRow of conceptRows) {
          await db.delete(conceptPrerequisites).where(eq(conceptPrerequisites.conceptId, conceptRow.id));
        }
        await db.delete(concepts).where(eq(concepts.topicId, topicRow.id));
      }
      await db.delete(topics).where(eq(topics.moduleId, moduleRow.id));
    }
    await db.delete(modules).where(eq(modules.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
  }
});

afterAll(async () => {
  await sql.end();
});

describe("POST /courses", () => {
  it("requires the internal secret (401 without it)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/courses", payload: { title: "x" } });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("creates a course as admin", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "Intro to Algebra" } });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { id: string };
    createdCourseIds.push(body.id);
    expect(body).toMatchObject({ title: "Intro to Algebra" });
    await app.close();
  });

  it("rejects a non-admin role with 403", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "POST",
      url: "/courses",
      headers: { ...internalHeaders, "x-user-id": "u1", "x-user-role": "student" },
      payload: { title: "x" },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});

describe("full hierarchy round trip", () => {
  it("create course -> module -> topic -> concept, then GET returns the full tree", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const courseResponse = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "Round Trip Course" } });
    const course = courseResponse.json() as { id: string };
    createdCourseIds.push(course.id);

    const moduleResponse = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/modules`,
      headers: adminHeaders,
      payload: { title: "Module 1", position: 0 },
    });
    const module_ = moduleResponse.json() as { id: string };

    const topicResponse = await app.inject({
      method: "POST",
      url: `/modules/${module_.id}/topics`,
      headers: adminHeaders,
      payload: { title: "Topic 1", position: 0 },
    });
    const topic = topicResponse.json() as { id: string };

    const conceptResponse = await app.inject({
      method: "POST",
      url: `/topics/${topic.id}/concepts`,
      headers: adminHeaders,
      payload: { title: "Concept 1", position: 0, difficultyTier: "beginner" },
    });
    expect(conceptResponse.statusCode).toBe(200);

    const getResponse = await app.inject({ method: "GET", url: `/courses/${course.id}`, headers: adminHeaders });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({
      title: "Round Trip Course",
      modules: [{ title: "Module 1", topics: [{ title: "Topic 1", concepts: [{ title: "Concept 1", difficultyTier: "beginner" }] }] }],
    });
    await app.close();
  });
});

describe("DELETE /modules/:id", () => {
  it("archives the module through the real route", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const courseResponse = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "x" } });
    const course = courseResponse.json() as { id: string };
    createdCourseIds.push(course.id);
    const moduleResponse = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/modules`,
      headers: adminHeaders,
      payload: { title: "Module 1", position: 0 },
    });
    const module_ = moduleResponse.json() as { id: string };

    const response = await app.inject({ method: "DELETE", url: `/modules/${module_.id}`, headers: adminHeaders });

    expect(response.statusCode).toBe(204);
    const getResponse = await app.inject({ method: "GET", url: `/courses/${course.id}`, headers: adminHeaders });
    expect((getResponse.json() as { modules: { archivedAt: string | null }[] }).modules[0]?.archivedAt).not.toBeNull();
    await app.close();
  });
});

describe("path-param validation (mirrors Story 1.10's own review-round fix)", () => {
  it("rejects a malformed, non-UUID id with a clean 400", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/courses/not-a-uuid", headers: adminHeaders });

    expect(response.statusCode).toBe(400);
    await app.close();
  });
});

describe("GET /courses (catalog search)", () => {
  it("requires the internal secret and trusted user headers", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/courses" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns only published courses through the real route, filterable by query params", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const published = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "Published", status: "published", subject: "Math" } });
    createdCourseIds.push((published.json() as { id: string }).id);
    const draft = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "Draft", status: "draft" } });
    createdCourseIds.push((draft.json() as { id: string }).id);

    const response = await app.inject({ method: "GET", url: "/courses?subject=Math", headers: adminHeaders });

    expect(response.statusCode).toBe(200);
    const titles = (response.json() as { title: string }[]).map((c) => c.title);
    expect(titles).toContain("Published");
    expect(titles).not.toContain("Draft");
    await app.close();
  });
});

describe("GET/PUT /courses/:id/customization", () => {
  it("requires the internal secret and trusted user headers (GET)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/courses/019fd200-0000-7000-8000-000000000000/customization" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("requires the internal secret and trusted user headers (PUT)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "PUT", url: "/courses/019fd200-0000-7000-8000-000000000000/customization", payload: {} });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("GET returns 404 before any save, then the saved customization after PUT", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const courseResponse = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "x", estimatedDurationHours: 10 } });
    const course = courseResponse.json() as { id: string };
    createdCourseIds.push(course.id);

    const before = await app.inject({ method: "GET", url: `/courses/${course.id}/customization`, headers: adminHeaders });
    expect(before.statusCode).toBe(404);

    const putResponse = await app.inject({
      method: "PUT",
      url: `/courses/${course.id}/customization`,
      headers: adminHeaders,
      payload: { depth: "deep-dive", explanationStyle: "detailed" },
    });
    expect(putResponse.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: `/courses/${course.id}/customization`, headers: adminHeaders });
    expect(after.statusCode).toBe(200);
    expect(after.json()).toMatchObject({ depth: "deep-dive", explanationStyle: "detailed" });
    await app.close();
  });
});

describe("GET /courses/:id/placement-check and POST /courses/:id/placement-check/score", () => {
  it("requires the internal secret and trusted user headers (GET)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({ method: "GET", url: "/courses/019fd200-0000-7000-8000-000000000000/placement-check" });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("requires the internal secret and trusted user headers (POST score)", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "POST",
      url: "/courses/019fd200-0000-7000-8000-000000000000/placement-check/score",
      payload: { answers: [] },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns a real question sample, and scoring it proposes deselections without persisting anything", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const courseResponse = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "x" } });
    const course = courseResponse.json() as { id: string };
    createdCourseIds.push(course.id);
    const moduleResponse = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/modules`,
      headers: adminHeaders,
      payload: { title: "Module 1", position: 0 },
    });
    const module_ = moduleResponse.json() as { id: string };
    const topicResponse = await app.inject({
      method: "POST",
      url: `/modules/${module_.id}/topics`,
      headers: adminHeaders,
      payload: { title: "Topic 1", position: 0 },
    });
    const topic = topicResponse.json() as { id: string };
    const conceptResponse = await app.inject({
      method: "POST",
      url: `/topics/${topic.id}/concepts`,
      headers: adminHeaders,
      payload: { title: "Concept 1", position: 0, checkpointQuestions: [{ question: "What is X?" }] },
    });
    const concept = conceptResponse.json() as { id: string };

    const questionsResponse = await app.inject({ method: "GET", url: `/courses/${course.id}/placement-check`, headers: adminHeaders });
    expect(questionsResponse.statusCode).toBe(200);
    expect(questionsResponse.json()).toEqual([{ topicId: topic.id, topicTitle: "Topic 1", conceptId: concept.id, question: "What is X?" }]);

    const scoreResponse = await app.inject({
      method: "POST",
      url: `/courses/${course.id}/placement-check/score`,
      headers: adminHeaders,
      payload: { answers: [{ topicId: topic.id, conceptId: concept.id, masteryDemonstrated: true }] },
    });
    expect(scoreResponse.statusCode).toBe(200);
    expect(scoreResponse.json()).toEqual({ proposedDeselectedTopicIds: [topic.id], proposedStartingDifficultyTier: "advanced" });

    const customizationResponse = await app.inject({ method: "GET", url: `/courses/${course.id}/customization`, headers: adminHeaders });
    expect(customizationResponse.statusCode).toBe(404);
    await app.close();
  });
});

describe("Story 2.6: versioning, pinning, and GET /courses/:id resolution", () => {
  it("requires the internal secret and trusted user headers on all three new routes", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const id = "019fd200-0000-7000-8000-000000000000";

    const versions = await app.inject({ method: "POST", url: `/courses/${id}/versions`, payload: { title: "x" } });
    const start = await app.inject({ method: "POST", url: `/courses/${id}/start` });
    const update = await app.inject({ method: "POST", url: `/courses/${id}/update-to-latest` });

    expect(versions.statusCode).toBe(401);
    expect(start.statusCode).toBe(401);
    expect(update.statusCode).toBe(401);
    await app.close();
  });

  it("GET /courses/:id transparently resolves to the caller's pinned version, and flags when a newer one exists", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const v1Response = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "Pin Route Course" } });
    const v1 = v1Response.json() as { id: string };
    createdCourseIds.push(v1.id);

    await app.inject({ method: "POST", url: `/courses/${v1.id}/start`, headers: adminHeaders });

    const v2Response = await app.inject({
      method: "POST",
      url: `/courses/${v1.id}/versions`,
      headers: adminHeaders,
      payload: { title: "v2", status: "published" },
    });
    const v2 = v2Response.json() as { id: string };
    createdCourseIds.push(v2.id);

    const getResponse = await app.inject({ method: "GET", url: `/courses/${v2.id}`, headers: adminHeaders });

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({ id: v1.id, isPinnedToOlderVersion: true, latestVersionId: v2.id });
    await app.close();
  });

  it("update-to-latest moves the pin and reports flagged Topics through the real route", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const v1Response = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "Update Route Course" } });
    const v1 = v1Response.json() as { id: string };
    createdCourseIds.push(v1.id);
    const moduleResponse = await app.inject({
      method: "POST",
      url: `/courses/${v1.id}/modules`,
      headers: adminHeaders,
      payload: { title: "Module 1", position: 0 },
    });
    const module_ = moduleResponse.json() as { id: string };
    const topicResponse = await app.inject({
      method: "POST",
      url: `/modules/${module_.id}/topics`,
      headers: adminHeaders,
      payload: { title: "Old Topic", position: 0 },
    });
    const topic = topicResponse.json() as { id: string };
    await app.inject({ method: "POST", url: `/courses/${v1.id}/start`, headers: adminHeaders });
    await app.inject({
      method: "PUT",
      url: `/courses/${v1.id}/customization`,
      headers: adminHeaders,
      payload: { deselectedTopicIds: [topic.id] },
    });

    const v2Response = await app.inject({
      method: "POST",
      url: `/courses/${v1.id}/versions`,
      headers: adminHeaders,
      payload: { title: "v2", status: "published" },
    });
    const v2 = v2Response.json() as { id: string };
    createdCourseIds.push(v2.id);
    const v2ModuleResponse = await app.inject({
      method: "POST",
      url: `/courses/${v2.id}/modules`,
      headers: adminHeaders,
      payload: { title: "Module 1", position: 0 },
    });
    const v2Module = v2ModuleResponse.json() as { id: string };
    await app.inject({
      method: "POST",
      url: `/modules/${v2Module.id}/topics`,
      headers: adminHeaders,
      payload: { title: "A Different Topic", position: 0 },
    });

    const updateResponse = await app.inject({ method: "POST", url: `/courses/${v1.id}/update-to-latest`, headers: adminHeaders });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toEqual({ pinnedCourseId: v2.id, flaggedTopicTitles: ["Old Topic"] });
    await app.close();
  });

  it("rejects a non-admin role creating a version (403)", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const v1Response = await app.inject({ method: "POST", url: "/courses", headers: adminHeaders, payload: { title: "RBAC Version Course" } });
    const v1 = v1Response.json() as { id: string };
    createdCourseIds.push(v1.id);

    const response = await app.inject({
      method: "POST",
      url: `/courses/${v1.id}/versions`,
      headers: { ...internalHeaders, "x-user-id": "u1", "x-user-role": "student" },
      payload: { title: "v2" },
    });

    expect(response.statusCode).toBe(403);
    await app.close();
  });
});
