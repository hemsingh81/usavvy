import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { concepts, conceptPrerequisites, courseCustomizations, courses, modules, topics } from "../../../src/db/schema.js";
import { loadCoursesConfig } from "../../../src/config.js";
import {
  archiveModule,
  createConcept,
  createCourse,
  createCustomCourseFromOutline,
  createModule,
  createTopic,
  getCourseCustomization,
  saveCourseCustomization,
} from "../../../src/modules/courses/service.js";

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
    await db.delete(courseCustomizations).where(eq(courseCustomizations.courseId, courseId));
    const moduleRows = await db.select().from(modules).where(eq(modules.courseId, courseId));
    for (const moduleRow of moduleRows) {
      const topicRows = await db.select().from(topics).where(eq(topics.moduleId, moduleRow.id));
      for (const topicRow of topicRows) {
        const conceptRows = await db.select().from(concepts).where(eq(concepts.topicId, topicRow.id));
        for (const conceptRow of conceptRows) {
          await db.delete(conceptPrerequisites).where(eq(conceptPrerequisites.conceptId, conceptRow.id));
          await db.delete(conceptPrerequisites).where(eq(conceptPrerequisites.prerequisiteConceptId, conceptRow.id));
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

/** Two Topics, each with one Concept; the second Concept prerequisite-links to the first. */
async function seedCourseWithTwoDependentTopics(estimatedDurationHours: number | null = 12) {
  const course = await createCourse(db, "admin", {
    title: "Test Course",
    ...(estimatedDurationHours !== null ? { estimatedDurationHours } : {}),
  });
  createdCourseIds.push(course.id);
  const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
  const topicA = await createTopic(db, "admin", module_.id, { title: "Basics", position: 0 });
  const topicB = await createTopic(db, "admin", module_.id, { title: "Advanced", position: 1 });
  const conceptA = await createConcept(db, "admin", topicA.id, { title: "Concept A", position: 0 });
  await createConcept(db, "admin", topicB.id, { title: "Concept B", position: 0, prerequisiteConceptIds: [conceptA.id] });
  return { course, topicA, topicB };
}

describe("saveCourseCustomization", () => {
  it("saves a new customization and returns recalculated estimatedHours", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics(12);

    const result = await saveCourseCustomization(db, "user1", course.id, {
      deselectedTopicIds: [topicA.id],
      depth: "standard",
      force: true,
    });

    expect(result).toMatchObject({
      courseId: course.id,
      deselectedTopicIds: [topicA.id],
      depth: "standard",
      // 2 topics total, 1 deselected -> 1 remaining, 12h / 2 topics * 1 remaining * 1.0 = 6
      estimatedHours: 6,
    });
  });

  it("recalculates estimatedHours per depth multiplier (AC #2)", async () => {
    const { course } = await seedCourseWithTwoDependentTopics(12);

    const overview = await saveCourseCustomization(db, "user1", course.id, { depth: "overview" });
    const deepDive = await saveCourseCustomization(db, "user1", course.id, { depth: "deep-dive" });

    // no deselection: full 2 topics selected, 12h / 2 topics * 2 * multiplier
    expect(overview.estimatedHours).toBe(6); // 12 * 0.5
    expect(deepDive.estimatedHours).toBe(18); // 12 * 1.5
  });

  it("returns a null estimatedHours when the course has no estimatedDurationHours", async () => {
    const { course } = await seedCourseWithTwoDependentTopics(null);

    const result = await saveCourseCustomization(db, "user1", course.id, {});

    expect(result.estimatedHours).toBeNull();
  });

  it("blocks a deselection that would strand a still-selected dependent Topic without force (AC #3)", async () => {
    const { course, topicA, topicB } = await seedCourseWithTwoDependentTopics();

    await expect(saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id] })).rejects.toMatchObject({
      code: "DEPENDENCY_CONFLICT",
      statusCode: 409,
      details: [{ topicId: topicA.id, requiredByTopicId: topicB.id }],
    });
  });

  it("saves the same conflicting deselection when force is true (AC #3)", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();

    const result = await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    expect(result.deselectedTopicIds).toEqual([topicA.id]);
  });

  it("does not re-trigger the same conflict on a later save that doesn't touch deselectedTopicIds", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();
    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    const result = await saveCourseCustomization(db, "user1", course.id, { depth: "deep-dive" });

    expect(result).toMatchObject({ deselectedTopicIds: [topicA.id], depth: "deep-dive" });
  });

  it("does not re-trigger the same conflict when the caller resends the SAME already-confirmed deselectedTopicIds value explicitly (not just when omitted)", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();
    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    const result = await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], depth: "overview" });

    expect(result).toMatchObject({ deselectedTopicIds: [topicA.id], depth: "overview" });
  });

  it("does not re-block an already-force-confirmed conflict when the learner ALSO deselects a second, unrelated Topic with no conflict of its own (review finding)", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 2", position: 1 });
    const topicX = await createTopic(db, "admin", module_.id, { title: "Independent", position: 0 });
    await createConcept(db, "admin", topicX.id, { title: "Concept X", position: 0 });
    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    const result = await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id, topicX.id] });

    expect(result.deselectedTopicIds.sort()).toEqual([topicA.id, topicX.id].sort());
  });

  it("still blocks a genuinely NEW conflict introduced alongside an already-confirmed one", async () => {
    const { course, topicA, topicB } = await seedCourseWithTwoDependentTopics();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 2", position: 1 });
    const topicX = await createTopic(db, "admin", module_.id, { title: "Dependent on B", position: 0 });
    const conceptB = [...(await db.select({ id: concepts.id }).from(concepts).where(eq(concepts.topicId, topicB.id)))][0];
    await createConcept(db, "admin", topicX.id, { title: "Concept X", position: 0, prerequisiteConceptIds: conceptB ? [conceptB.id] : [] });
    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    await expect(saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id, topicB.id] })).rejects.toMatchObject({
      code: "DEPENDENCY_CONFLICT",
      details: [{ topicId: topicB.id, requiredByTopicId: topicX.id }],
    });
  });

  it("preserves untouched fields on a partial update", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();
    await saveCourseCustomization(db, "user1", course.id, {
      deselectedTopicIds: [topicA.id],
      force: true,
      explanationStyle: "detailed",
    });

    const result = await saveCourseCustomization(db, "user1", course.id, { depth: "overview" });

    expect(result).toMatchObject({ deselectedTopicIds: [topicA.id], explanationStyle: "detailed", depth: "overview" });
  });

  it("dedupes a duplicate topic id in deselectedTopicIds/priorityTopicIds", async () => {
    const { course, topicA, topicB } = await seedCourseWithTwoDependentTopics();

    const result = await saveCourseCustomization(db, "user1", course.id, {
      priorityTopicIds: [topicB.id, topicB.id],
      deselectedTopicIds: [],
    });

    expect(result.priorityTopicIds).toEqual([topicB.id]);
    void topicA;
  });

  it("excludes an archived Topic from the hours-weighting and rejects it as an invalid selection (review finding)", async () => {
    const { course, topicA, topicB } = await seedCourseWithTwoDependentTopics(12);
    const module_ = await createModule(db, "admin", course.id, { title: "Module 2", position: 1 });
    const topicC = await createTopic(db, "admin", module_.id, { title: "Extra", position: 0 });
    await archiveModule(db, "admin", module_.id);

    // 2 live topics (A, B) — archived Topic C must not count toward the denominator.
    const result = await saveCourseCustomization(db, "user1", course.id, {});
    expect(result.estimatedHours).toBe(12); // 12h / 2 live topics * 2 selected * 1.0

    await expect(saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicC.id] })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringContaining(topicC.id),
    });
    void topicA;
    void topicB;
  });

  it("rejects a topic id that does not belong to the Course, naming it", async () => {
    const { course } = await seedCourseWithTwoDependentTopics();

    await expect(
      saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: ["019fd200-0000-7000-8000-000000000000"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("019fd200-0000-7000-8000-000000000000") });
  });

  it("upserts: a second save for the same user+course updates the existing row rather than creating a new one", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();
    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [] });

    const rows = await db.select().from(courseCustomizations).where(eq(courseCustomizations.courseId, course.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deselectedTopicIds).toEqual([]);
  });

  it("404s for a privately-owned custom course when the caller isn't its owner (Story 2.13, AC #2)", async () => {
    const courseId = await createCustomCourseFromOutline(db, "owner-1", "My Notes", [{ title: "Topic A", concepts: [{ title: "Concept A" }] }]);
    createdCourseIds.push(courseId);

    await expect(saveCourseCustomization(db, "someone-else", courseId, { depth: "overview" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getCourseCustomization", () => {
  it("throws NOT_FOUND 'course not found' for a Course that doesn't exist, rather than silently returning null (review finding)", async () => {
    await expect(getCourseCustomization(db, "user1", "019fd200-0000-7000-8000-000000000000")).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "course not found",
    });
  });

  it("returns null when the learner has never saved a customization for this Course (AC #4)", async () => {
    const { course } = await seedCourseWithTwoDependentTopics();

    const result = await getCourseCustomization(db, "user1", course.id);

    expect(result).toBeNull();
  });

  it("returns the exact previously-saved selections, pre-loaded for further editing (AC #4)", async () => {
    const { course, topicA, topicB } = await seedCourseWithTwoDependentTopics();
    await saveCourseCustomization(db, "user1", course.id, {
      deselectedTopicIds: [topicA.id],
      priorityTopicIds: [topicB.id],
      depth: "deep-dive",
      explanationStyle: "example-first",
      force: true,
    });

    const result = await getCourseCustomization(db, "user1", course.id);

    expect(result).toMatchObject({
      deselectedTopicIds: [topicA.id],
      priorityTopicIds: [topicB.id],
      depth: "deep-dive",
      explanationStyle: "example-first",
    });
  });

  it("defaults startingDifficultyTier to null until explicitly set, then round-trips it (Story 2.5)", async () => {
    const { course } = await seedCourseWithTwoDependentTopics();
    const beforeSet = await saveCourseCustomization(db, "user1", course.id, {});
    expect(beforeSet.startingDifficultyTier).toBeNull();

    const afterSet = await saveCourseCustomization(db, "user1", course.id, { startingDifficultyTier: "advanced" });

    expect(afterSet.startingDifficultyTier).toBe("advanced");
    const reread = await getCourseCustomization(db, "user1", course.id);
    expect(reread?.startingDifficultyTier).toBe("advanced");
  });

  it("scopes customizations per user — a different user sees no customization", async () => {
    const { course, topicA } = await seedCourseWithTwoDependentTopics();
    await saveCourseCustomization(db, "user1", course.id, { deselectedTopicIds: [topicA.id], force: true });

    const result = await getCourseCustomization(db, "user2", course.id);

    expect(result).toBeNull();
  });

  it("404s for a privately-owned custom course when the caller isn't its owner (Story 2.13, AC #2)", async () => {
    const courseId = await createCustomCourseFromOutline(db, "owner-1", "My Notes", [{ title: "Topic A", concepts: [{ title: "Concept A" }] }]);
    createdCourseIds.push(courseId);

    await expect(getCourseCustomization(db, "someone-else", courseId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
