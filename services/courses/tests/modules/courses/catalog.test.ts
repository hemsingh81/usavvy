import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { concepts, conceptPrerequisites, courses, modules, topics } from "../../../src/db/schema.js";
import { loadCoursesConfig } from "../../../src/config.js";
import { createConcept, createCourse, createModule, createTopic, searchCourses } from "../../../src/modules/courses/service.js";

const config = loadCoursesConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;
const createdCourseIds: string[] = [];

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  while (createdCourseIds.length > 0) {
    const courseId = createdCourseIds.pop();
    if (!courseId) continue;
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

async function seedCourse(overrides: Partial<Parameters<typeof createCourse>[2]> = {}) {
  const course = await createCourse(db, "admin", { title: "Test Course", status: "published", ...overrides });
  createdCourseIds.push(course.id);
  return course;
}

describe("searchCourses", () => {
  it("returns only published courses, never draft ones (AC #1)", async () => {
    await seedCourse({ title: "Published Course", status: "published" });
    await seedCourse({ title: "Draft Course", status: "draft" });

    const result = await searchCourses(db, {});

    expect(result.map((c) => c.title)).toContain("Published Course");
    expect(result.map((c) => c.title)).not.toContain("Draft Course");
  });

  it("narrows by subject alone", async () => {
    await seedCourse({ title: "Math Course", subject: "Math" });
    await seedCourse({ title: "Science Course", subject: "Science" });

    const result = await searchCourses(db, { subject: "Math" });

    expect(result.map((c) => c.title)).toEqual(["Math Course"]);
  });

  it("narrows by subject case-insensitively (review finding: exact match rejected differently-cased input)", async () => {
    await seedCourse({ title: "Math Course", subject: "Math" });
    await seedCourse({ title: "Science Course", subject: "Science" });

    const result = await searchCourses(db, { subject: "math" });

    expect(result.map((c) => c.title)).toEqual(["Math Course"]);
  });

  it("narrows by level alone", async () => {
    await seedCourse({ title: "Beginner Course", level: "beginner" });
    await seedCourse({ title: "Advanced Course", level: "advanced" });

    const result = await searchCourses(db, { level: "advanced" });

    expect(result.map((c) => c.title)).toEqual(["Advanced Course"]);
  });

  it("narrows by durationBucket alone (short < 5h, medium 5-15h, long > 15h)", async () => {
    await seedCourse({ title: "Short Course", estimatedDurationHours: 2 });
    await seedCourse({ title: "Medium Course", estimatedDurationHours: 10 });
    await seedCourse({ title: "Long Course", estimatedDurationHours: 20 });

    expect((await searchCourses(db, { durationBucket: "short" })).map((c) => c.title)).toEqual(["Short Course"]);
    expect((await searchCourses(db, { durationBucket: "medium" })).map((c) => c.title)).toEqual(["Medium Course"]);
    expect((await searchCourses(db, { durationBucket: "long" })).map((c) => c.title)).toEqual(["Long Course"]);
  });

  it("narrows by a combination of filters (AND, not OR)", async () => {
    await seedCourse({ title: "Match", subject: "Math", level: "beginner" });
    await seedCourse({ title: "Wrong level", subject: "Math", level: "advanced" });
    await seedCourse({ title: "Wrong subject", subject: "Science", level: "beginner" });

    const result = await searchCourses(db, { subject: "Math", level: "beginner" });

    expect(result.map((c) => c.title)).toEqual(["Match"]);
  });

  it("returns [] when a filter combination matches nothing (AC #5)", async () => {
    await seedCourse({ title: "Math Course", subject: "Math" });

    const result = await searchCourses(db, { subject: "History" });

    expect(result).toEqual([]);
  });

  it("ranks a title match above a syllabus-only match, and excludes a non-match (AC #4)", async () => {
    await seedCourse({ title: "Quadratic Equations" });
    const syllabusMatch = await seedCourse({ title: "General Math" });
    const module_ = await createModule(db, "admin", syllabusMatch.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    await createConcept(db, "admin", topic.id, { title: "Quadratic formula basics", position: 0 });
    await seedCourse({ title: "Unrelated History Course" });

    const result = await searchCourses(db, { q: "quadratic" });

    expect(result.map((c) => c.title)).toEqual(["Quadratic Equations", "General Math"]);
  });

  it("respects filters applied alongside a search term (AC #4)", async () => {
    await seedCourse({ title: "Quadratic Equations", subject: "Math" });
    await seedCourse({ title: "Quadratic Circuits", subject: "Physics" });

    const result = await searchCourses(db, { q: "quadratic", subject: "Math" });

    expect(result.map((c) => c.title)).toEqual(["Quadratic Equations"]);
  });
});
