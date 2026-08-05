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
  createModule,
  createTopic,
  getPlacementCheckQuestions,
  scorePlacementCheck,
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

async function seedCourseWithQuestions() {
  const course = await createCourse(db, "admin", { title: "Test Course" });
  createdCourseIds.push(course.id);
  const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
  const topicA = await createTopic(db, "admin", module_.id, { title: "Basics", position: 0 });
  const topicB = await createTopic(db, "admin", module_.id, { title: "Advanced", position: 1 });
  const topicC = await createTopic(db, "admin", module_.id, { title: "No Questions", position: 2 });
  const conceptA = await createConcept(db, "admin", topicA.id, {
    title: "Concept A",
    position: 0,
    checkpointQuestions: [{ question: "What is a variable?" }],
  });
  const conceptB = await createConcept(db, "admin", topicB.id, {
    title: "Concept B",
    position: 0,
    checkpointQuestions: [{ question: "What is a closure?" }],
  });
  await createConcept(db, "admin", topicC.id, { title: "Concept C (no questions)", position: 0 });
  return { course, topicA, topicB, topicC, conceptA, conceptB };
}

describe("getPlacementCheckQuestions", () => {
  it("returns a representative, position-ordered sample, one per Topic, skipping Topics with no checkpoint questions (AC #1)", async () => {
    const { course, topicA, topicB, conceptA, conceptB } = await seedCourseWithQuestions();

    const questions = await getPlacementCheckQuestions(db, course.id);

    expect(questions).toEqual([
      { topicId: topicA.id, topicTitle: "Basics", conceptId: conceptA.id, question: "What is a variable?" },
      { topicId: topicB.id, topicTitle: "Advanced", conceptId: conceptB.id, question: "What is a closure?" },
    ]);
  });

  it("returns an empty array when no Concept in the course has any checkpoint question", async () => {
    const course = await createCourse(db, "admin", { title: "No Questions Course" });
    createdCourseIds.push(course.id);
    const module_ = await createModule(db, "admin", course.id, { title: "M1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "T1", position: 0 });
    await createConcept(db, "admin", topic.id, { title: "C1", position: 0 });

    const questions = await getPlacementCheckQuestions(db, course.id);

    expect(questions).toEqual([]);
  });

  it("excludes an archived Topic's questions", async () => {
    const { course, topicA, topicB } = await seedCourseWithQuestions();
    const moduleRows = await db.select().from(modules).where(eq(modules.courseId, course.id));
    // Archive the module containing topicB by finding its module and archiving it via the
    // service's own archiveModule (topicB belongs to the same module as topicA here, so
    // instead create a second module for topicB to archive it independently).
    void moduleRows;
    const module2 = await createModule(db, "admin", course.id, { title: "Module 2", position: 1 });
    const topicD = await createTopic(db, "admin", module2.id, { title: "Archived Topic", position: 0 });
    await createConcept(db, "admin", topicD.id, { title: "Concept D", position: 0, checkpointQuestions: [{ question: "Archived question?" }] });
    await archiveModule(db, "admin", module2.id);

    const questions = await getPlacementCheckQuestions(db, course.id);

    expect(questions.map((q) => q.topicId)).not.toContain(topicD.id);
    expect(questions.map((q) => q.topicId)).toEqual([topicA.id, topicB.id]);
  });

  it("caps the sample at 8 questions", async () => {
    const course = await createCourse(db, "admin", { title: "Many Topics Course" });
    createdCourseIds.push(course.id);
    const module_ = await createModule(db, "admin", course.id, { title: "M1", position: 0 });
    for (let i = 0; i < 10; i += 1) {
      const topic = await createTopic(db, "admin", module_.id, { title: `Topic ${i}`, position: i });
      await createConcept(db, "admin", topic.id, { title: `Concept ${i}`, position: 0, checkpointQuestions: [{ question: `Question ${i}?` }] });
    }

    const questions = await getPlacementCheckQuestions(db, course.id);

    expect(questions).toHaveLength(8);
  });
});

describe("scorePlacementCheck", () => {
  it("proposes deselecting every Topic where mastery was demonstrated, and 'advanced' when all answers demonstrate mastery (AC #2)", async () => {
    const { course, topicA, topicB, conceptA, conceptB } = await seedCourseWithQuestions();

    const proposal = await scorePlacementCheck(db, course.id, [
      { topicId: topicA.id, conceptId: conceptA.id, masteryDemonstrated: true },
      { topicId: topicB.id, conceptId: conceptB.id, masteryDemonstrated: true },
    ]);

    expect(proposal.proposedDeselectedTopicIds.sort()).toEqual([topicA.id, topicB.id].sort());
    expect(proposal.proposedStartingDifficultyTier).toBe("advanced");
  });

  it("proposes NO deselections and 'beginner' when every answer scores at the minimum (AC #4)", async () => {
    const { course, topicA, topicB, conceptA, conceptB } = await seedCourseWithQuestions();

    const proposal = await scorePlacementCheck(db, course.id, [
      { topicId: topicA.id, conceptId: conceptA.id, masteryDemonstrated: false },
      { topicId: topicB.id, conceptId: conceptB.id, masteryDemonstrated: false },
    ]);

    expect(proposal.proposedDeselectedTopicIds).toEqual([]);
    expect(proposal.proposedStartingDifficultyTier).toBe("beginner");
  });

  it("proposes 'intermediate' for a mixed answer set", async () => {
    const { course, topicA, topicB, conceptA, conceptB } = await seedCourseWithQuestions();

    const proposal = await scorePlacementCheck(db, course.id, [
      { topicId: topicA.id, conceptId: conceptA.id, masteryDemonstrated: true },
      { topicId: topicB.id, conceptId: conceptB.id, masteryDemonstrated: false },
    ]);

    expect(proposal.proposedDeselectedTopicIds).toEqual([topicA.id]);
    expect(proposal.proposedStartingDifficultyTier).toBe("intermediate");
  });

  it("resolves to 'beginner' with no error when given zero answers", async () => {
    const { course } = await seedCourseWithQuestions();

    const proposal = await scorePlacementCheck(db, course.id, []);

    expect(proposal).toEqual({ proposedDeselectedTopicIds: [], proposedStartingDifficultyTier: "beginner" });
  });

  it("never writes to the database — no course_customizations row exists after scoring", async () => {
    const { course, topicA, conceptA } = await seedCourseWithQuestions();

    await scorePlacementCheck(db, course.id, [{ topicId: topicA.id, conceptId: conceptA.id, masteryDemonstrated: true }]);

    const rows = await db.select().from(courseCustomizations).where(eq(courseCustomizations.courseId, course.id));
    expect(rows).toEqual([]);
  });

  it("rejects a topic id that does not belong to the Course, naming it", async () => {
    const { course, conceptA } = await seedCourseWithQuestions();

    await expect(
      scorePlacementCheck(db, course.id, [{ topicId: "019fd200-0000-7000-8000-000000000000", conceptId: conceptA.id, masteryDemonstrated: true }]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("019fd200-0000-7000-8000-000000000000") });
  });

  it("rejects an answer whose conceptId doesn't actually belong to the claimed topicId (review finding)", async () => {
    const { course, topicA, conceptB } = await seedCourseWithQuestions();

    await expect(
      scorePlacementCheck(db, course.id, [{ topicId: topicA.id, conceptId: conceptB.id, masteryDemonstrated: true }]),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining(conceptB.id) });
  });

  it("dedupes duplicate answers for the same topic, keeping only the last one, before computing the mastery ratio (review finding)", async () => {
    const { course, topicA, conceptA } = await seedCourseWithQuestions();

    const proposal = await scorePlacementCheck(db, course.id, [
      { topicId: topicA.id, conceptId: conceptA.id, masteryDemonstrated: true },
      { topicId: topicA.id, conceptId: conceptA.id, masteryDemonstrated: false },
    ]);

    // A single real topic was answered (contradictorily) — the ratio must be computed
    // over 1 unique topic, not 2 raw answers padding the denominator.
    expect(proposal.proposedStartingDifficultyTier).toBe("beginner");
    expect(proposal.proposedDeselectedTopicIds).toEqual([]);
  });
});
