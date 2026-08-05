import { eq, inArray, sql } from "drizzle-orm";
import { AppError } from "@usavvy/service-kernel";
import { can, type Role } from "@usavvy/config";
import type {
  ConceptResponse,
  CourseResponse,
  CreateConceptInput,
  CreateCourseInput,
  CreateModuleInput,
  CreateTopicInput,
  ModuleResponse,
  TopicResponse,
} from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { concepts, conceptPrerequisites, courses, modules, topics } from "../../db/schema.js";

// Review finding: every write function previously checked can(role, "create", ...)
// regardless of what it actually does — archiveModule is semantically a delete but never
// checked the "delete" permission. Only worked by coincidence because admin/superadmin
// get all three actions bundled in the same matrix entry today.
function requireCourseHierarchyWriteAccess(role: Role, action: "create" | "update" | "delete"): void {
  if (!can(role, action, "courseHierarchy")) {
    throw new AppError("FORBIDDEN", "not permitted", 403);
  }
}

export async function createCourse(db: Db, role: Role, input: CreateCourseInput): Promise<CourseResponse> {
  requireCourseHierarchyWriteAccess(role, "create");
  const [row] = await db
    .insert(courses)
    .values({ title: input.title, description: input.description ?? null })
    .returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to create course", 500);
  }
  return { id: row.id, title: row.title, description: row.description, modules: [], createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function createModule(db: Db, role: Role, courseId: string, input: CreateModuleInput): Promise<ModuleResponse> {
  requireCourseHierarchyWriteAccess(role, "create");
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) {
    throw new AppError("NOT_FOUND", "course not found", 404);
  }
  const [row] = await db.insert(modules).values({ courseId, title: input.title, position: input.position }).returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to create module", 500);
  }
  return { id: row.id, courseId: row.courseId, title: row.title, position: row.position, archivedAt: null, topics: [] };
}

export async function createTopic(db: Db, role: Role, moduleId: string, input: CreateTopicInput): Promise<TopicResponse> {
  requireCourseHierarchyWriteAccess(role, "create");
  const [module_] = await db.select().from(modules).where(eq(modules.id, moduleId));
  if (!module_) {
    throw new AppError("NOT_FOUND", "module not found", 404);
  }
  const [row] = await db.insert(topics).values({ moduleId, title: input.title, position: input.position }).returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to create topic", 500);
  }
  return { id: row.id, moduleId: row.moduleId, title: row.title, position: row.position, archivedAt: null, concepts: [] };
}

/**
 * Resolves the Course a Topic ultimately belongs to (topic -> module -> course), used
 * both to 404 an unknown topicId and to enforce AC #2's "same Course" prerequisite rule.
 */
async function getCourseIdForTopic(db: Db, topicId: string): Promise<string> {
  const [row] = await db
    .select({ courseId: modules.courseId })
    .from(topics)
    .innerJoin(modules, eq(topics.moduleId, modules.id))
    .where(eq(topics.id, topicId));
  if (!row) {
    throw new AppError("NOT_FOUND", "topic not found", 404);
  }
  return row.courseId;
}

export async function createConcept(db: Db, role: Role, topicId: string, input: CreateConceptInput): Promise<ConceptResponse> {
  requireCourseHierarchyWriteAccess(role, "create");
  const courseId = await getCourseIdForTopic(db, topicId);

  // Review finding (confirmed independently by Blind Hunter and Edge Case Hunter): the
  // same id listed twice must not produce two prerequisite rows/response entries.
  const prerequisiteConceptIds = [...new Set(input.prerequisiteConceptIds ?? [])];
  if (prerequisiteConceptIds.length > 0) {
    const prerequisiteRows = await db
      .select({ id: concepts.id, courseId: modules.courseId })
      .from(concepts)
      .innerJoin(topics, eq(concepts.topicId, topics.id))
      .innerJoin(modules, eq(topics.moduleId, modules.id))
      .where(inArray(concepts.id, prerequisiteConceptIds));
    const foundById = new Map(prerequisiteRows.map((r) => [r.id, r.courseId]));
    for (const prerequisiteId of prerequisiteConceptIds) {
      const prerequisiteCourseId = foundById.get(prerequisiteId);
      // AC #2: reject naming the specific invalid id — whether it doesn't exist at all,
      // or exists but belongs to a different Course, both fail this same check.
      if (prerequisiteCourseId === undefined || prerequisiteCourseId !== courseId) {
        throw new AppError(
          "VALIDATION_ERROR",
          `invalid prerequisite reference: concept "${prerequisiteId}" does not exist in this Course`,
          400,
        );
      }
    }
  }

  // Review finding (Blind Hunter): the concept insert and its prerequisite-link inserts
  // were two separate round-trips — a connection drop between them would silently leave
  // a Concept persisted without the prerequisites the caller asked for.
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(concepts)
      .values({
        topicId,
        title: input.title,
        position: input.position,
        objectives: input.objectives ?? null,
        sourceMaterialRefs: input.sourceMaterialRefs ?? null,
        boardAssetRefs: input.boardAssetRefs ?? null,
        checkpointQuestions: input.checkpointQuestions ?? null,
        difficultyTier: input.difficultyTier ?? null,
      })
      .returning();
    if (!inserted) {
      throw new AppError("INTERNAL_ERROR", "failed to create concept", 500);
    }
    if (prerequisiteConceptIds.length > 0) {
      await tx
        .insert(conceptPrerequisites)
        .values(prerequisiteConceptIds.map((prerequisiteConceptId) => ({ conceptId: inserted.id, prerequisiteConceptId })));
    }
    return inserted;
  });

  return {
    id: row.id,
    topicId: row.topicId,
    title: row.title,
    position: row.position,
    objectives: row.objectives ?? [],
    sourceMaterialRefs: row.sourceMaterialRefs ?? [],
    boardAssetRefs: row.boardAssetRefs ?? [],
    checkpointQuestions: row.checkpointQuestions ?? [],
    difficultyTier: row.difficultyTier,
    prerequisites: prerequisiteConceptIds.map((conceptId) => ({ conceptId, archived: false })),
    archivedAt: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * AC #3: archiving (not hard-deleting) a Module cascades the same timestamp to every
 * Topic beneath it and every Concept beneath those Topics, in one transaction — no
 * orphaned Topic/Concept remains reachable, and nothing here is physically removed
 * (dangling prerequisite links into this subtree are flagged by getCourse, not by
 * anything stored on this write path).
 *
 * Review finding (Edge Case Hunter): re-archiving an already-archived module used to
 * silently re-stamp `archivedAt` with a new timestamp on every call, corrupting the "when
 * was this actually archived" audit trail — now idempotent, a no-op once already archived.
 * Review finding (Blind Hunter): the cascade previously left `updatedAt`/`version`
 * untouched, unlike every other write in this codebase's Consistency Conventions.
 */
export async function archiveModule(db: Db, role: Role, moduleId: string): Promise<void> {
  requireCourseHierarchyWriteAccess(role, "delete");
  const [module_] = await db.select().from(modules).where(eq(modules.id, moduleId));
  if (!module_) {
    throw new AppError("NOT_FOUND", "module not found", 404);
  }
  if (module_.archivedAt !== null) {
    return;
  }

  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(modules)
      .set({ archivedAt: now, updatedAt: now, version: sql`${modules.version} + 1` })
      .where(eq(modules.id, moduleId));
    const affectedTopics = await tx
      .update(topics)
      .set({ archivedAt: now, updatedAt: now, version: sql`${topics.version} + 1` })
      .where(eq(topics.moduleId, moduleId))
      .returning({ id: topics.id });
    const topicIds = affectedTopics.map((t) => t.id);
    if (topicIds.length > 0) {
      await tx
        .update(concepts)
        .set({ archivedAt: now, updatedAt: now, version: sql`${concepts.version} + 1` })
        .where(inArray(concepts.topicId, topicIds));
    }
  });
}

/**
 * AC #4: returns the full nested tree. Each concept's prerequisites carry a computed
 * `archived` flag (AC #3) rather than a stored one — derived here from whether the
 * referenced concept (guaranteed, per AC #2, to be in this same course) is archived.
 */
export async function getCourse(db: Db, courseId: string): Promise<CourseResponse> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) {
    throw new AppError("NOT_FOUND", "course not found", 404);
  }

  // Review finding (Edge Case Hunter): `position` alone gives Postgres no ordering
  // guarantee when two siblings share the same value — `id` (uuidv7, time-ordered) as a
  // secondary sort key makes the result deterministic regardless of position collisions.
  const moduleRows = await db.select().from(modules).where(eq(modules.courseId, courseId)).orderBy(modules.position, modules.id);
  const moduleIds = moduleRows.map((m) => m.id);
  const topicRows =
    moduleIds.length > 0 ? await db.select().from(topics).where(inArray(topics.moduleId, moduleIds)).orderBy(topics.position, topics.id) : [];
  const topicIds = topicRows.map((t) => t.id);
  const conceptRows =
    topicIds.length > 0 ? await db.select().from(concepts).where(inArray(concepts.topicId, topicIds)).orderBy(concepts.position, concepts.id) : [];
  const conceptIds = conceptRows.map((c) => c.id);
  const prerequisiteRows =
    conceptIds.length > 0 ? await db.select().from(conceptPrerequisites).where(inArray(conceptPrerequisites.conceptId, conceptIds)) : [];

  const archivedByConceptId = new Map(conceptRows.map((c) => [c.id, c.archivedAt !== null]));
  const prerequisitesByConceptId = new Map<string, { conceptId: string; archived: boolean }[]>();
  for (const row of prerequisiteRows) {
    const list = prerequisitesByConceptId.get(row.conceptId) ?? [];
    list.push({ conceptId: row.prerequisiteConceptId, archived: archivedByConceptId.get(row.prerequisiteConceptId) ?? true });
    prerequisitesByConceptId.set(row.conceptId, list);
  }

  const conceptsByTopicId = new Map<string, ConceptResponse[]>();
  for (const row of conceptRows) {
    const list = conceptsByTopicId.get(row.topicId) ?? [];
    list.push({
      id: row.id,
      topicId: row.topicId,
      title: row.title,
      position: row.position,
      objectives: row.objectives ?? [],
      sourceMaterialRefs: row.sourceMaterialRefs ?? [],
      boardAssetRefs: row.boardAssetRefs ?? [],
      checkpointQuestions: row.checkpointQuestions ?? [],
      difficultyTier: row.difficultyTier,
      prerequisites: prerequisitesByConceptId.get(row.id) ?? [],
      archivedAt: row.archivedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
    conceptsByTopicId.set(row.topicId, list);
  }

  const topicsByModuleId = new Map<string, TopicResponse[]>();
  for (const row of topicRows) {
    const list = topicsByModuleId.get(row.moduleId) ?? [];
    list.push({
      id: row.id,
      moduleId: row.moduleId,
      title: row.title,
      position: row.position,
      archivedAt: row.archivedAt?.toISOString() ?? null,
      concepts: conceptsByTopicId.get(row.id) ?? [],
    });
    topicsByModuleId.set(row.moduleId, list);
  }

  const moduleResponses: ModuleResponse[] = moduleRows.map((row) => ({
    id: row.id,
    courseId: row.courseId,
    title: row.title,
    position: row.position,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    topics: topicsByModuleId.get(row.id) ?? [],
  }));

  return {
    id: course.id,
    title: course.title,
    description: course.description,
    modules: moduleResponses,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}
