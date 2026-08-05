import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { can } from "@usavvy/config";
import { createDb, type Db } from "../../../src/db/client.js";
import { concepts, conceptPrerequisites, courses, modules, topics } from "../../../src/db/schema.js";
import { loadCoursesConfig } from "../../../src/config.js";
import { archiveModule, createConcept, createCourse, createModule, createTopic, getCourse } from "../../../src/modules/courses/service.js";

// Review finding (Blind Hunter): every write function checked can(role, "create", ...)
// regardless of what it actually does — archiveModule is semantically a delete but never
// checked the "delete" permission. Wraps the REAL can() (vi.fn(can), not a mock
// replacement) so every other test's actual allow/deny behavior is unaffected; only used
// to inspect which action string each operation passes.
vi.mock("@usavvy/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@usavvy/config")>();
  return { ...actual, can: vi.fn(actual.can) };
});

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
    const moduleIds = moduleRows.map((m) => m.id);
    for (const moduleId of moduleIds) {
      const topicRows = await db.select().from(topics).where(eq(topics.moduleId, moduleId));
      for (const topicRow of topicRows) {
        const conceptRows = await db.select().from(concepts).where(eq(concepts.topicId, topicRow.id));
        for (const conceptRow of conceptRows) {
          await db.delete(conceptPrerequisites).where(eq(conceptPrerequisites.conceptId, conceptRow.id));
          await db.delete(conceptPrerequisites).where(eq(conceptPrerequisites.prerequisiteConceptId, conceptRow.id));
        }
        await db.delete(concepts).where(eq(concepts.topicId, topicRow.id));
      }
      await db.delete(topics).where(eq(topics.moduleId, moduleId));
    }
    await db.delete(modules).where(eq(modules.courseId, courseId));
    await db.delete(courses).where(eq(courses.id, courseId));
  }
});

afterAll(async () => {
  await sql.end();
});

async function seedCourse(title = "Test Course") {
  const course = await createCourse(db, "admin", { title });
  createdCourseIds.push(course.id);
  return course;
}

describe("RBAC action checked per operation (review finding)", () => {
  it("createCourse checks the 'create' action", async () => {
    vi.mocked(can).mockClear();
    await seedCourse();
    expect(can).toHaveBeenCalledWith("admin", "create", "courseHierarchy");
  });

  it("archiveModule checks the 'delete' action, not 'create'", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "x", position: 0 });
    vi.mocked(can).mockClear();

    await archiveModule(db, "admin", module_.id);

    expect(can).toHaveBeenCalledWith("admin", "delete", "courseHierarchy");
    expect(can).not.toHaveBeenCalledWith("admin", "create", "courseHierarchy");
  });
});

describe("createCourse", () => {
  it("creates a course with the given title", async () => {
    const course = await seedCourse("Intro to Algebra");
    expect(course).toMatchObject({ title: "Intro to Algebra", description: null, modules: [] });
  });

  it("defaults prerequisites/outcomes to [] and sampleBoardAssetRef to null when omitted", async () => {
    const course = await seedCourse("No Detail Fields");
    expect(course).toMatchObject({ prerequisites: [], outcomes: [], sampleBoardAssetRef: null });
  });

  it("persists the Story 2.3 detail-page fields (prerequisites/outcomes/sampleBoardAssetRef)", async () => {
    const course = await createCourse(db, "admin", {
      title: "Detailed Course",
      prerequisites: ["Basic arithmetic"],
      outcomes: ["Solve linear equations"],
      sampleBoardAssetRef: "https://example.com/sample.mp4",
    });
    createdCourseIds.push(course.id);

    expect(course).toMatchObject({
      prerequisites: ["Basic arithmetic"],
      outcomes: ["Solve linear equations"],
      sampleBoardAssetRef: "https://example.com/sample.mp4",
    });
  });

  it("rejects a non-admin role (403)", async () => {
    await expect(createCourse(db, "student", { title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });
});

describe("createModule", () => {
  it("creates a module under an existing course, recording its position", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    expect(module_).toMatchObject({ courseId: course.id, title: "Module 1", position: 0, archivedAt: null });
  });

  it("returns 404 for a non-existent course", async () => {
    await expect(createModule(db, "admin", "019fd200-0000-7000-8000-000000000000", { title: "x", position: 0 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a non-admin role (403)", async () => {
    const course = await seedCourse();
    await expect(createModule(db, "student", course.id, { title: "x", position: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("createTopic", () => {
  it("creates a topic under an existing module", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    expect(topic).toMatchObject({ moduleId: module_.id, title: "Topic 1", position: 0, archivedAt: null });
  });

  it("returns 404 for a non-existent module", async () => {
    await expect(createTopic(db, "admin", "019fd200-0000-7000-8000-000000000000", { title: "x", position: 0 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects a non-admin role (403) (review finding: only createCourse/createModule/archiveModule had this test before)", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    await expect(createTopic(db, "student", module_.id, { title: "x", position: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("createConcept", () => {
  async function seedTopic() {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    return { course, module_, topic };
  }

  it("persists all Concept-level fields named in AC #1", async () => {
    const { topic } = await seedTopic();
    const concept = await createConcept(db, "admin", topic.id, {
      title: "Quadratics",
      position: 0,
      objectives: ["Factor a quadratic"],
      sourceMaterialRefs: ["doc-1"],
      boardAssetRefs: ["asset-1"],
      checkpointQuestions: [{ question: "What is the discriminant?" }],
      difficultyTier: "beginner",
    });

    expect(concept).toMatchObject({
      topicId: topic.id,
      title: "Quadratics",
      position: 0,
      objectives: ["Factor a quadratic"],
      sourceMaterialRefs: ["doc-1"],
      boardAssetRefs: ["asset-1"],
      checkpointQuestions: [{ question: "What is the discriminant?" }],
      difficultyTier: "beginner",
      prerequisites: [],
      archivedAt: null,
    });
  });

  it("accepts a prerequisite link to another Concept in the same Course", async () => {
    const { topic } = await seedTopic();
    const first = await createConcept(db, "admin", topic.id, { title: "Basics", position: 0 });

    const second = await createConcept(db, "admin", topic.id, { title: "Advanced", position: 1, prerequisiteConceptIds: [first.id] });

    expect(second.prerequisites).toEqual([{ conceptId: first.id, archived: false }]);
  });

  it("rejects (AC #2) a prerequisite referencing a Concept ID that does not exist at all, naming it", async () => {
    const { topic } = await seedTopic();

    await expect(
      createConcept(db, "admin", topic.id, { title: "Advanced", position: 0, prerequisiteConceptIds: ["019fd200-0000-7000-8000-000000000000"] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining("019fd200-0000-7000-8000-000000000000") });
  });

  it("rejects (AC #2) a prerequisite that exists but belongs to a DIFFERENT Course", async () => {
    const { topic } = await seedTopic();
    const otherCourseSetup = await seedTopic();
    const otherConcept = await createConcept(db, "admin", otherCourseSetup.topic.id, { title: "Other course concept", position: 0 });

    await expect(
      createConcept(db, "admin", topic.id, { title: "Advanced", position: 0, prerequisiteConceptIds: [otherConcept.id] }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", message: expect.stringContaining(otherConcept.id) });
  });

  it("does not persist a partial concept when prerequisite validation fails", async () => {
    const { topic, course } = await seedTopic();

    await expect(
      createConcept(db, "admin", topic.id, { title: "Should not exist", position: 0, prerequisiteConceptIds: ["019fd200-0000-7000-8000-000000000000"] }),
    ).rejects.toThrow();

    const result = await getCourse(db, course.id);
    expect(result.modules[0]?.topics[0]?.concepts).toEqual([]);
  });

  it("rejects a non-admin role (403)", async () => {
    const { topic } = await seedTopic();
    await expect(createConcept(db, "student", topic.id, { title: "x", position: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("dedupes a duplicate prerequisite id (review finding, confirmed independently by both Blind Hunter and Edge Case Hunter): the same id listed twice must not produce two prerequisite entries", async () => {
    const { topic } = await seedTopic();
    const first = await createConcept(db, "admin", topic.id, { title: "Basics", position: 0 });

    const second = await createConcept(db, "admin", topic.id, {
      title: "Advanced",
      position: 1,
      prerequisiteConceptIds: [first.id, first.id],
    });

    expect(second.prerequisites).toEqual([{ conceptId: first.id, archived: false }]);

    const rows = await db.select().from(conceptPrerequisites).where(eq(conceptPrerequisites.conceptId, second.id));
    expect(rows).toHaveLength(1);
  });
});

describe("archiveModule", () => {
  it("cascades archivedAt to child Topics and Concepts (AC #3)", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    await createConcept(db, "admin", topic.id, { title: "Concept 1", position: 0 });

    await archiveModule(db, "admin", module_.id);

    const result = await getCourse(db, course.id);
    const archivedModule = result.modules[0]!;
    expect(archivedModule.archivedAt).not.toBeNull();
    expect(archivedModule.topics[0]!.archivedAt).not.toBeNull();
    expect(archivedModule.topics[0]!.concepts[0]!.archivedAt).not.toBeNull();
  });

  it("bumps updatedAt/version on every level touched by the cascade (review finding: the archive cascade previously left both at their initial values, unlike every other write in this codebase's Consistency Conventions)", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    await createConcept(db, "admin", topic.id, { title: "Concept 1", position: 0 });

    await archiveModule(db, "admin", module_.id);

    const [moduleRow] = await db.select().from(modules).where(eq(modules.id, module_.id));
    const [topicRow] = await db.select().from(topics).where(eq(topics.id, topic.id));
    expect(moduleRow!.version).toBe(2);
    expect(moduleRow!.updatedAt.getTime()).toBeGreaterThan(moduleRow!.createdAt.getTime());
    expect(topicRow!.version).toBe(2);
    expect(topicRow!.updatedAt.getTime()).toBeGreaterThan(topicRow!.createdAt.getTime());
  });

  it("is idempotent — archiving an already-archived module a second time does not re-stamp archivedAt (review finding: Edge Case Hunter)", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });

    await archiveModule(db, "admin", module_.id);
    const [firstArchive] = await db.select().from(modules).where(eq(modules.id, module_.id));

    await new Promise((resolve) => setTimeout(resolve, 5));
    await archiveModule(db, "admin", module_.id);
    const [secondArchive] = await db.select().from(modules).where(eq(modules.id, module_.id));

    expect(secondArchive!.archivedAt?.getTime()).toBe(firstArchive!.archivedAt?.getTime());
    expect(secondArchive!.version).toBe(firstArchive!.version);
  });

  it("flags (does not silently drop) a prerequisite pointing into an archived subtree (AC #3)", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    const prerequisite = await createConcept(db, "admin", topic.id, { title: "Prereq", position: 0 });
    await createConcept(db, "admin", topic.id, { title: "Dependent", position: 1, prerequisiteConceptIds: [prerequisite.id] });

    await archiveModule(db, "admin", module_.id);

    const result = await getCourse(db, course.id);
    const dependent = result.modules[0]!.topics[0]!.concepts.find((c) => c.title === "Dependent")!;
    expect(dependent.prerequisites).toEqual([{ conceptId: prerequisite.id, archived: true }]);
  });

  it("returns 404 for a non-existent module", async () => {
    await expect(archiveModule(db, "admin", "019fd200-0000-7000-8000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-admin role (403)", async () => {
    const course = await seedCourse();
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    await expect(archiveModule(db, "student", module_.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("getCourse", () => {
  it("returns the full nested tree with all Concept-level fields intact (AC #4)", async () => {
    const course = await seedCourse("Full Course");
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    await createConcept(db, "admin", topic.id, { title: "Concept 1", position: 0, difficultyTier: "intermediate" });

    const result = await getCourse(db, course.id);

    expect(result).toMatchObject({
      title: "Full Course",
      modules: [
        {
          title: "Module 1",
          topics: [
            {
              title: "Topic 1",
              concepts: [{ title: "Concept 1", difficultyTier: "intermediate" }],
            },
          ],
        },
      ],
    });
  });

  it("returns every Concept-level field on the RETRIEVAL path, not just at creation time (review finding: the original AC #4 test only asserted title/difficultyTier on read)", async () => {
    const course = await seedCourse("Full Course 2");
    const module_ = await createModule(db, "admin", course.id, { title: "Module 1", position: 0 });
    const topic = await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });
    const prerequisite = await createConcept(db, "admin", topic.id, { title: "Prereq", position: 0 });
    await createConcept(db, "admin", topic.id, {
      title: "Full Concept",
      position: 1,
      objectives: ["Objective A", "Objective B"],
      sourceMaterialRefs: ["doc-1", "doc-2"],
      boardAssetRefs: ["asset-1"],
      checkpointQuestions: [{ question: "What is X?" }],
      difficultyTier: "advanced",
      prerequisiteConceptIds: [prerequisite.id],
    });

    const result = await getCourse(db, course.id);

    const fullConcept = result.modules[0]!.topics[0]!.concepts.find((c) => c.title === "Full Concept")!;
    expect(fullConcept).toMatchObject({
      objectives: ["Objective A", "Objective B"],
      sourceMaterialRefs: ["doc-1", "doc-2"],
      boardAssetRefs: ["asset-1"],
      checkpointQuestions: [{ question: "What is X?" }],
      difficultyTier: "advanced",
      prerequisites: [{ conceptId: prerequisite.id, archived: false }],
      archivedAt: null,
    });
  });

  it("returns the Story 2.3 detail-page fields on read (present and absent cases)", async () => {
    const withFields = await createCourse(db, "admin", {
      title: "With Detail Fields",
      prerequisites: ["Basic arithmetic"],
      outcomes: ["Solve linear equations"],
      sampleBoardAssetRef: "https://example.com/sample.mp4",
    });
    createdCourseIds.push(withFields.id);
    const withoutFields = await seedCourse("Without Detail Fields");

    const withResult = await getCourse(db, withFields.id);
    const withoutResult = await getCourse(db, withoutFields.id);

    expect(withResult).toMatchObject({
      prerequisites: ["Basic arithmetic"],
      outcomes: ["Solve linear equations"],
      sampleBoardAssetRef: "https://example.com/sample.mp4",
    });
    expect(withoutResult).toMatchObject({ prerequisites: [], outcomes: [], sampleBoardAssetRef: null });
  });

  it("orders siblings deterministically even when positions collide (review finding: Edge Case Hunter — no tiebreaker meant Postgres gave no ordering guarantee)", async () => {
    const course = await seedCourse();
    const first = await createModule(db, "admin", course.id, { title: "First", position: 0 });
    const second = await createModule(db, "admin", course.id, { title: "Second", position: 0 });

    const result = await getCourse(db, course.id);

    // uuidv7 ids are time-ordered, so ordering by (position, id) as a tiebreaker is
    // equivalent to insertion order here — proving the tiebreaker is actually applied.
    expect(result.modules.map((m) => m.id)).toEqual([first.id, second.id]);
  });

  it("returns 404 for a non-existent course", async () => {
    await expect(getCourse(db, "019fd200-0000-7000-8000-000000000000")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("is available to any role (read is not RBAC-gated)", async () => {
    const course = await seedCourse();
    await expect(getCourse(db, course.id)).resolves.toMatchObject({ id: course.id });
  });
});
