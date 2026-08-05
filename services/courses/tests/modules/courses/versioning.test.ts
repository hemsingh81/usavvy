import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { createDb, type Db } from "../../../src/db/client.js";
import { concepts, conceptPrerequisites, courseCustomizations, courses, learnerCoursePins, modules, topics } from "../../../src/db/schema.js";
import { loadCoursesConfig } from "../../../src/config.js";
import {
  archiveModule,
  createCourse,
  createCourseVersion,
  createModule,
  createTopic,
  resolveCourseForLearner,
  saveCourseCustomization,
  searchCourses,
  startCourse,
  updateCourseVersionPin,
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

async function seedCourse(overrides: Partial<Parameters<typeof createCourse>[2]> = {}) {
  const course = await createCourse(db, "admin", { title: "Test Course", status: "published", ...overrides });
  createdCourseIds.push(course.id);
  return course;
}

describe("createCourseVersion", () => {
  it("creates a new courses row sharing the group key, with versionNumber incremented, leaving the original's own tree untouched", async () => {
    const v1 = await seedCourse({ title: "Algebra" });
    const module_ = await createModule(db, "admin", v1.id, { title: "Module 1", position: 0 });
    await createTopic(db, "admin", module_.id, { title: "Topic 1", position: 0 });

    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Algebra v2" });
    createdCourseIds.push(v2.id);

    expect(v2.id).not.toBe(v1.id);
    expect(v2.modules).toEqual([]);
    const v1Reread = await resolveCourseForLearner(db, "someone-not-pinned", v1.id);
    expect(v1Reread.modules).toHaveLength(1);
  });

  it("a third version increments to versionNumber 3 relative to the group's max", async () => {
    const v1 = await seedCourse({ title: "Chain" });
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Chain v2", status: "published" });
    createdCourseIds.push(v2.id);

    const v3 = await createCourseVersion(db, "admin", v2.id, { title: "Chain v3", status: "published" });
    createdCourseIds.push(v3.id);

    // Reachable indirectly: v3 becomes the group's latest, confirmed via resolution.
    const resolved = await resolveCourseForLearner(db, "no-pin-user", v1.id);
    expect(resolved.latestVersionId).toBe(v3.id);
  });

  it("rejects a non-admin role (403)", async () => {
    const v1 = await seedCourse();
    await expect(createCourseVersion(db, "student", v1.id, { title: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("startCourse", () => {
  it("pins the exact requested version on first start", async () => {
    const course = await seedCourse();

    const result = await startCourse(db, "user1", course.id);

    expect(result.pinnedCourseId).toBe(course.id);
  });

  it("is idempotent — a second start does not move the pin", async () => {
    const v1 = await seedCourse();
    await startCourse(db, "user1", v1.id);
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "v2" });
    createdCourseIds.push(v2.id);

    const result = await startCourse(db, "user1", v2.id);

    expect(result.pinnedCourseId).toBe(v1.id);
  });
});

describe("resolveCourseForLearner", () => {
  it("returns the requested version, unpinned, with isPinnedToOlderVersion false and no latestVersionId when it's already the latest (AC #2 new-learner case)", async () => {
    const course = await seedCourse();

    const result = await resolveCourseForLearner(db, "no-pin-user", course.id);

    expect(result).toMatchObject({ id: course.id, isPinnedToOlderVersion: false, latestVersionId: null });
  });

  it("transparently returns the learner's pinned version regardless of which version id was requested (AC #2)", async () => {
    const v1 = await seedCourse({ title: "Pinned Course" });
    await startCourse(db, "user1", v1.id);
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Pinned Course v2" });
    createdCourseIds.push(v2.id);

    const resolvedViaOld = await resolveCourseForLearner(db, "user1", v1.id);
    const resolvedViaNew = await resolveCourseForLearner(db, "user1", v2.id);

    expect(resolvedViaOld.id).toBe(v1.id);
    expect(resolvedViaNew.id).toBe(v1.id);
  });

  it("flags isPinnedToOlderVersion and names the latest version when a newer one exists (AC #3)", async () => {
    const v1 = await seedCourse();
    await startCourse(db, "user1", v1.id);
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "v2", status: "published" });
    createdCourseIds.push(v2.id);

    const result = await resolveCourseForLearner(db, "user1", v1.id);

    expect(result).toMatchObject({ isPinnedToOlderVersion: true, latestVersionId: v2.id });
  });

  it("never treats a still-draft version as 'the latest available' — a learner pinned to the only published version sees no update notice (review finding)", async () => {
    const v1 = await seedCourse();
    await startCourse(db, "user1", v1.id);
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "v2 (still drafting)" });
    createdCourseIds.push(v2.id);

    const result = await resolveCourseForLearner(db, "user1", v1.id);

    expect(result).toMatchObject({ isPinnedToOlderVersion: false, latestVersionId: null });
  });

  it("does not flag isPinnedToOlderVersion when the learner's pin already IS the latest", async () => {
    const v1 = await seedCourse();
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "v2" });
    createdCourseIds.push(v2.id);
    await startCourse(db, "user1", v2.id);

    const result = await resolveCourseForLearner(db, "user1", v2.id);

    expect(result).toMatchObject({ isPinnedToOlderVersion: false, latestVersionId: null });
  });
});

describe("updateCourseVersionPin", () => {
  it("moves the pin to the latest version", async () => {
    const v1 = await seedCourse();
    await startCourse(db, "user1", v1.id);
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "v2", status: "published" });
    createdCourseIds.push(v2.id);

    const result = await updateCourseVersionPin(db, "user1", v1.id);

    expect(result.pinnedCourseId).toBe(v2.id);
    const resolved = await resolveCourseForLearner(db, "user1", v1.id);
    expect(resolved.id).toBe(v2.id);
  });

  it("rejects with a clean error when no version in the group has ever been published (review finding)", async () => {
    const v1 = await seedCourse({ status: "draft" });
    await startCourse(db, "user1", v1.id);

    await expect(updateCourseVersionPin(db, "user1", v1.id)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("carries forward a customisation reference when the Topic title matches in the new version, and flags a removed/renamed Topic (AC #4)", async () => {
    const v1 = await seedCourse({ title: "Reconcile" });
    const v1Module = await createModule(db, "admin", v1.id, { title: "Module 1", position: 0 });
    const keptTopic = await createTopic(db, "admin", v1Module.id, { title: "Kept Topic", position: 0 });
    await createTopic(db, "admin", v1Module.id, { title: "Removed Topic", position: 1 });
    await startCourse(db, "user1", v1.id);
    await saveCourseCustomization(db, "user1", v1.id, { deselectedTopicIds: [keptTopic.id] });

    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Reconcile v2", status: "published" });
    createdCourseIds.push(v2.id);
    const v2Module = await createModule(db, "admin", v2.id, { title: "Module 1", position: 0 });
    const v2KeptTopic = await createTopic(db, "admin", v2Module.id, { title: "Kept Topic", position: 0 });
    await createTopic(db, "admin", v2Module.id, { title: "Renamed Topic", position: 1 });
    void keptTopic;

    const result = await updateCourseVersionPin(db, "user1", v1.id);

    expect(result.flaggedTopicTitles).toEqual([]);
    const newCustomization = await import("../../../src/modules/courses/service.js").then((m) => m.getCourseCustomization(db, "user1", v2.id));
    expect(newCustomization?.deselectedTopicIds).toEqual([v2KeptTopic.id]);
  });

  it("flags a Topic whose title no longer exists in the new version, and drops its now-foreign id from the customisation", async () => {
    const v1 = await seedCourse({ title: "Reconcile Dropped" });
    const v1Module = await createModule(db, "admin", v1.id, { title: "Module 1", position: 0 });
    const droppedTopic = await createTopic(db, "admin", v1Module.id, { title: "Will Be Removed", position: 0 });
    await startCourse(db, "user1", v1.id);
    await saveCourseCustomization(db, "user1", v1.id, { deselectedTopicIds: [droppedTopic.id] });

    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Reconcile Dropped v2", status: "published" });
    createdCourseIds.push(v2.id);
    const v2Module = await createModule(db, "admin", v2.id, { title: "Module 1", position: 0 });
    await createTopic(db, "admin", v2Module.id, { title: "A Totally Different Topic", position: 0 });

    const result = await updateCourseVersionPin(db, "user1", v1.id);

    expect(result.flaggedTopicTitles).toEqual(["Will Be Removed"]);
  });

  it("flags a Topic that was archived in the old version before updating, rather than silently dropping it with no notice (review finding)", async () => {
    const v1 = await seedCourse({ title: "Reconcile Archived" });
    const v1Module = await createModule(db, "admin", v1.id, { title: "Module 1", position: 0 });
    const archivedTopic = await createTopic(db, "admin", v1Module.id, { title: "Soon Archived", position: 0 });
    await startCourse(db, "user1", v1.id);
    await saveCourseCustomization(db, "user1", v1.id, { deselectedTopicIds: [archivedTopic.id] });
    await archiveModule(db, "admin", v1Module.id);

    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Reconcile Archived v2", status: "published" });
    createdCourseIds.push(v2.id);
    const v2Module = await createModule(db, "admin", v2.id, { title: "Module 1", position: 0 });
    await createTopic(db, "admin", v2Module.id, { title: "Something Else", position: 0 });

    const result = await updateCourseVersionPin(db, "user1", v1.id);

    expect(result.flaggedTopicTitles).toEqual(["Soon Archived"]);
  });

  it("updates cleanly with an empty flagged list when the learner has no saved customisation", async () => {
    const v1 = await seedCourse();
    await startCourse(db, "user1", v1.id);
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "v2", status: "published" });
    createdCourseIds.push(v2.id);

    const result = await updateCourseVersionPin(db, "user1", v1.id);

    expect(result).toEqual({ pinnedCourseId: v2.id, flaggedTopicTitles: [] });
  });
});

describe("searchCourses (Story 2.6 extension)", () => {
  it("returns only the latest published version within a version group, never the whole history", async () => {
    const v1 = await seedCourse({ title: "Multi Version Course", subject: "Math" });
    const v2 = await createCourseVersion(db, "admin", v1.id, { title: "Multi Version Course", subject: "Math", status: "published" });
    createdCourseIds.push(v2.id);
    const v3 = await createCourseVersion(db, "admin", v2.id, { title: "Multi Version Course", subject: "Math", status: "published" });
    createdCourseIds.push(v3.id);

    const result = await searchCourses(db, { subject: "Math" });

    const matches = result.filter((c) => c.title === "Multi Version Course");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(v3.id);
  });
});
