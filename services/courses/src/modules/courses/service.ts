import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { AppError } from "@usavvy/service-kernel";
import { can, type Role } from "@usavvy/config";
import type {
  CatalogSearchParams,
  ConceptResponse,
  CourseCustomizationDepth,
  CourseCustomizationResponse,
  CourseResponse,
  CourseSummary,
  CreateConceptInput,
  CreateCourseInput,
  CreateModuleInput,
  CreateTopicInput,
  DependencyConflict,
  DifficultyTier,
  DurationBucket,
  ModuleResponse,
  PlacementCheckAnswerInput,
  PlacementCheckProposal,
  PlacementCheckQuestion,
  SaveCourseCustomizationInput,
  StartCourseResponse,
  TopicResponse,
  UpdateToLatestVersionResponse,
} from "@usavvy/shared-types";
import type { Db } from "../../db/client.js";
import { concepts, conceptPrerequisites, courseCustomizations, courses, learnerCoursePins, modules, topics } from "../../db/schema.js";

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
    .values({
      title: input.title,
      description: input.description ?? null,
      subject: input.subject ?? null,
      level: input.level ?? null,
      estimatedDurationHours: input.estimatedDurationHours ?? null,
      // Story 2.2: no AC calls for a separate publish-workflow endpoint — status is set
      // directly at creation time. Defaults to "draft" at the service layer (the DB
      // column's own DEFAULT 'draft' is defense-in-depth, not the source of truth).
      status: input.status ?? "draft",
      // Story 2.3: no separate course-editing endpoint exists — these are only ever set
      // via this same create call, same as subject/level/status above. Review finding:
      // deduped the same way createConcept already dedupes prerequisiteConceptIds — an
      // exact-duplicate entry otherwise collided on the frontend's React key.
      prerequisites: input.prerequisites ? [...new Set(input.prerequisites)] : null,
      outcomes: input.outcomes ? [...new Set(input.outcomes)] : null,
      sampleBoardAssetRef: input.sampleBoardAssetRef ?? null,
    })
    .returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to create course", 500);
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    level: row.level,
    estimatedDurationHours: row.estimatedDurationHours,
    status: row.status,
    prerequisites: row.prerequisites ?? [],
    outcomes: row.outcomes ?? [],
    sampleBoardAssetRef: row.sampleBoardAssetRef,
    // Story 2.6: createCourse has no learner context to resolve a pin against — only
    // resolveCourseForLearner (wrapping getCourse) computes real values for these.
    isPinnedToOlderVersion: false,
    latestVersionId: null,
    modules: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
    // Review finding: using the app server's `new Date()` here (matching core's own
    // convention elsewhere) makes `updatedAt` incomparable against `createdAt`/the
    // pre-archive `updatedAt` — both of which come from Postgres's own `defaultNow()` at
    // insert time. Any clock skew between the app process and the Postgres container
    // (even a few ms) could then make "updatedAt > createdAt" flip, as directly observed
    // in a real (if rare) test failure. Using the database's own `now()` for every
    // timestamp this table ever gets keeps all comparisons within one clock source.
    const now = sql`now()`;
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
    subject: course.subject,
    level: course.level,
    estimatedDurationHours: course.estimatedDurationHours,
    status: course.status,
    prerequisites: course.prerequisites ?? [],
    outcomes: course.outcomes ?? [],
    sampleBoardAssetRef: course.sampleBoardAssetRef,
    // Story 2.6: getCourse returns exactly the requested version, no learner context —
    // resolveCourseForLearner overrides these with real values afterward.
    isPinnedToOlderVersion: false,
    latestVersionId: null,
    modules: moduleResponses,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
  };
}

interface SearchRow extends Record<string, unknown> {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  level: string | null;
  estimated_duration_hours: number | null;
  status: string;
}

/**
 * Story 2.2 (FR-C-2). The first Postgres full-text search in this codebase — no
 * drizzle-orm query-builder helper exists for tsvector/ts_rank, so this uses drizzle's
 * raw sql escape hatch (already established by bumpVersion()'s sql`${col} + 1` elsewhere
 * in this codebase). Every user-supplied value is interpolated via drizzle's own sql
 * template (parameterized, never string-concatenated) — standard injection hygiene.
 *
 * AC #1: unconditionally scoped to status = 'published' — a draft Course never appears
 * here regardless of filters. AC #4: when `q` is given, results are ranked by ts_rank
 * against a weighted tsvector (title 'A' > description 'B' > syllabus content 'C', the
 * latter aggregated from this course's own Topic titles + Concept titles/objectives via
 * a join — a generated column can't be used here since it would need to reference
 * modules/topics/concepts, three other tables). Unfiltered/unsearched results order by
 * title, with `id` as a deterministic tiebreaker (Story 2.1's own review-round lesson).
 */
export async function searchCourses(db: Db, params: CatalogSearchParams): Promise<CourseSummary[]> {
  // Story 2.6 (FR-C-6): a version history must never multiply catalog listings — only the
  // highest-versionNumber published row within each version group (COALESCE(version_group_id,
  // id) is the group key — see that story's Dev Notes on why NULL means "root of its own
  // group") is ever returned.
  const conditions: SQL[] = [
    sql`c.status = 'published'`,
    sql`c.id = (
      SELECT c2.id FROM courses c2
      WHERE COALESCE(c2.version_group_id, c2.id) = COALESCE(c.version_group_id, c.id)
        AND c2.status = 'published'
      ORDER BY c2.version_number DESC, c2.id DESC
      LIMIT 1
    )`,
  ];
  if (params.subject !== undefined) {
    conditions.push(sql`lower(c.subject) = lower(${params.subject})`);
  }
  if (params.level !== undefined) {
    conditions.push(sql`c.level = ${params.level}`);
  }
  if (params.durationBucket !== undefined) {
    conditions.push(durationBucketCondition(params.durationBucket));
  }

  const hasQuery = params.q !== undefined && params.q.trim() !== "";
  const searchVector = sql`(
    setweight(to_tsvector('english', c.title), 'A') ||
    setweight(to_tsvector('english', coalesce(c.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(syllabus.text, '')), 'C')
  )`;
  if (hasQuery) {
    conditions.push(sql`${searchVector} @@ plainto_tsquery('english', ${params.q})`);
  }

  const whereClause = sql.join(conditions, sql` AND `);
  const orderClause = hasQuery
    ? sql`ORDER BY ts_rank(${searchVector}, plainto_tsquery('english', ${params.q})) DESC, c.title ASC, c.id ASC`
    : sql`ORDER BY c.title ASC, c.id ASC`;

  const result = await db.execute<SearchRow>(sql`
    SELECT c.id, c.title, c.description, c.subject, c.level, c.estimated_duration_hours, c.status
    FROM courses c
    LEFT JOIN (
      SELECT m.course_id AS course_id,
             string_agg(t.title || ' ' || co.title || ' ' || coalesce(array_to_string(co.objectives, ' '), ''), ' ') AS text
      FROM modules m
      JOIN topics t ON t.module_id = m.id
      JOIN concepts co ON co.topic_id = t.id
      GROUP BY m.course_id
    ) syllabus ON syllabus.course_id = c.id
    WHERE ${whereClause}
    ${orderClause}
  `);

  return [...result].map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    level: row.level as CourseSummary["level"],
    estimatedDurationHours: row.estimated_duration_hours,
    status: row.status as CourseSummary["status"],
  }));
}

function durationBucketCondition(bucket: DurationBucket): SQL {
  switch (bucket) {
    case "short":
      return sql`c.estimated_duration_hours < 5`;
    case "medium":
      return sql`c.estimated_duration_hours >= 5 AND c.estimated_duration_hours <= 15`;
    case "long":
      return sql`c.estimated_duration_hours > 15`;
  }
}

interface CourseTopicGraph {
  courseEstimatedDurationHours: number | null;
  topicIds: Set<string>;
  topicTitleById: Map<string, string>;
  conceptTopicId: Map<string, string>;
  prerequisiteEdges: { conceptId: string; prerequisiteConceptId: string }[];
}

/**
 * Story 2.4 (FR-C-4). Story 2.1 only modeled prerequisites at the Concept level
 * (concept_prerequisites, within the same Course) — there is no separate Topic-level
 * prerequisite store. This reads that same data to let saveCourseCustomization *derive*
 * Topic-level dependency conflicts (AC #3) at request time, rather than duplicating a
 * second prerequisite model.
 */
async function getCourseTopicGraph(db: Db, courseId: string): Promise<CourseTopicGraph> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) {
    throw new AppError("NOT_FOUND", "course not found", 404);
  }

  const moduleRows = await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId));
  const moduleIds = moduleRows.map((m) => m.id);
  // Review finding: an archived Topic (or one under an archived Module — archiveModule's
  // cascade sets the same archivedAt on both) must not remain selectable/deselectable, and
  // must not dilute the equal per-Topic hours weighting below.
  // Review finding (Story 2.6): no deterministic order previously meant that two Topics
  // sharing a title (used by updateCourseVersionPin's title-based reconciliation) resolved
  // to whichever row Postgres happened to return last — position/id matches this codebase's
  // own established tiebreaker convention (getCourse, getPlacementCheckQuestions).
  const topicRows =
    moduleIds.length > 0
      ? await db
          .select({ id: topics.id, title: topics.title })
          .from(topics)
          .where(and(inArray(topics.moduleId, moduleIds), isNull(topics.archivedAt)))
          .orderBy(topics.position, topics.id)
      : [];
  const topicIds = new Set(topicRows.map((t) => t.id));
  const topicTitleById = new Map(topicRows.map((t) => [t.id, t.title]));

  const conceptRows =
    topicIds.size > 0
      ? await db
          .select({ id: concepts.id, topicId: concepts.topicId })
          .from(concepts)
          .where(inArray(concepts.topicId, [...topicIds]))
      : [];
  const conceptTopicId = new Map(conceptRows.map((c) => [c.id, c.topicId]));
  const conceptIds = conceptRows.map((c) => c.id);

  const prerequisiteEdges =
    conceptIds.length > 0
      ? await db
          .select({ conceptId: conceptPrerequisites.conceptId, prerequisiteConceptId: conceptPrerequisites.prerequisiteConceptId })
          .from(conceptPrerequisites)
          .where(inArray(conceptPrerequisites.conceptId, conceptIds))
      : [];

  return { courseEstimatedDurationHours: course.estimatedDurationHours, topicIds, topicTitleById, conceptTopicId, prerequisiteEdges };
}

/**
 * AC #3: a conflict is a still-selected Topic that depends (via one of its Concepts'
 * prerequisites) on a Topic the caller is about to deselect. Deduped per (prerequisite
 * topic, dependent topic) pair — a Course with several Concepts sharing the same
 * cross-Topic prerequisite link should surface one warning per Topic pair, not one per
 * Concept.
 */
function computeDependencyConflicts(graph: CourseTopicGraph, deselectedTopicIds: string[]): DependencyConflict[] {
  const deselected = new Set(deselectedTopicIds);
  const seenPairs = new Set<string>();
  const conflicts: DependencyConflict[] = [];

  for (const edge of graph.prerequisiteEdges) {
    const dependentTopicId = graph.conceptTopicId.get(edge.conceptId);
    const prerequisiteTopicId = graph.conceptTopicId.get(edge.prerequisiteConceptId);
    if (!dependentTopicId || !prerequisiteTopicId || dependentTopicId === prerequisiteTopicId) {
      continue;
    }
    if (!deselected.has(prerequisiteTopicId) || deselected.has(dependentTopicId)) {
      continue;
    }
    const pairKey = `${prerequisiteTopicId}:${dependentTopicId}`;
    if (seenPairs.has(pairKey)) {
      continue;
    }
    seenPairs.add(pairKey);
    conflicts.push({
      topicId: prerequisiteTopicId,
      topicTitle: graph.topicTitleById.get(prerequisiteTopicId) ?? "",
      requiredByTopicId: dependentTopicId,
      requiredByTopicTitle: graph.topicTitleById.get(dependentTopicId) ?? "",
    });
  }

  return conflicts;
}

// Story 2.4 Dev Notes: documented product default — no FR names exact multiplier values.
const DEPTH_MULTIPLIER: Record<CourseCustomizationDepth, number> = { overview: 0.5, standard: 1, "deep-dive": 1.5 };

/**
 * AC #1/#2: no per-Topic duration exists (only the Course's single total), so each Topic
 * is weighted equally — a documented product default, same class of assumption as Story
 * 2.2's duration buckets. Guards: a Course with no estimatedDurationHours yet never
 * fabricates a number; a Course with zero Topics has nothing to weight or deselect, so its
 * own total passes through unchanged.
 */
function computeEstimatedHours(graph: CourseTopicGraph, deselectedTopicIds: string[], depth: CourseCustomizationDepth): number | null {
  if (graph.courseEstimatedDurationHours === null) {
    return null;
  }
  const totalTopicCount = graph.topicIds.size;
  if (totalTopicCount === 0) {
    return graph.courseEstimatedDurationHours;
  }
  // Review finding: clamp defensively — dedup + membership validation keep this unreachable
  // today (deselectedTopicIds can never exceed the live topic count), but nothing should
  // ever compute a negative "remaining hours".
  const selectedTopicCount = Math.max(0, totalTopicCount - deselectedTopicIds.length);
  const hoursPerTopic = graph.courseEstimatedDurationHours / totalTopicCount;
  return Math.round(hoursPerTopic * selectedTopicCount * DEPTH_MULTIPLIER[depth] * 10) / 10;
}

function toCourseCustomizationResponse(
  courseId: string,
  row: {
    deselectedTopicIds: string[] | null;
    priorityTopicIds: string[] | null;
    depth: CourseCustomizationDepth;
    explanationStyle: CourseCustomizationResponse["explanationStyle"];
    startingDifficultyTier: CourseCustomizationResponse["startingDifficultyTier"];
    updatedAt: Date;
  },
  graph: CourseTopicGraph,
): CourseCustomizationResponse {
  const deselectedTopicIds = row.deselectedTopicIds ?? [];
  return {
    courseId,
    deselectedTopicIds,
    priorityTopicIds: row.priorityTopicIds ?? [],
    depth: row.depth,
    explanationStyle: row.explanationStyle,
    startingDifficultyTier: row.startingDifficultyTier ?? null,
    estimatedHours: computeEstimatedHours(graph, deselectedTopicIds, row.depth),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * AC #4: null (mapped to 404 "no customization saved yet" by the route) when the learner
 * has never saved one for this Course. Review finding: this must be distinguished from a
 * Course that doesn't exist at all — `getCourseTopicGraph` is called FIRST (throwing its
 * own 404 "course not found") so both failure modes are never conflated into the same
 * misleading message, matching saveCourseCustomization's identical ordering.
 */
export async function getCourseCustomization(db: Db, userId: string, courseId: string): Promise<CourseCustomizationResponse | null> {
  const graph = await getCourseTopicGraph(db, courseId);
  const [row] = await db
    .select()
    .from(courseCustomizations)
    .where(and(eq(courseCustomizations.userId, userId), eq(courseCustomizations.courseId, courseId)));
  if (!row) {
    return null;
  }
  return toCourseCustomizationResponse(courseId, row, graph);
}

export async function saveCourseCustomization(
  db: Db,
  userId: string,
  courseId: string,
  input: SaveCourseCustomizationInput,
): Promise<CourseCustomizationResponse> {
  const graph = await getCourseTopicGraph(db, courseId);

  // Review-lesson from Story 2.3, applied proactively: dedupe id arrays at the write layer.
  const deselectedTopicIds = input.deselectedTopicIds !== undefined ? [...new Set(input.deselectedTopicIds)] : undefined;
  const priorityTopicIds = input.priorityTopicIds !== undefined ? [...new Set(input.priorityTopicIds)] : undefined;

  for (const topicId of [...(deselectedTopicIds ?? []), ...(priorityTopicIds ?? [])]) {
    if (!graph.topicIds.has(topicId)) {
      throw new AppError("VALIDATION_ERROR", `invalid topic reference: topic "${topicId}" does not exist in this Course`, 400);
    }
  }

  const [existing] = await db
    .select()
    .from(courseCustomizations)
    .where(and(eq(courseCustomizations.userId, userId), eq(courseCustomizations.courseId, courseId)));

  const effectiveDeselected = deselectedTopicIds ?? existing?.deselectedTopicIds ?? [];
  const effectivePriority = priorityTopicIds ?? existing?.priorityTopicIds ?? [];
  const effectiveDepth = input.depth ?? existing?.depth ?? "standard";
  const effectiveExplanationStyle = input.explanationStyle ?? existing?.explanationStyle ?? "concise";
  // Story 2.5: no DB-level default (unlike depth/explanationStyle) — falls through to null
  // (AC #3's Course-level fallback, applied by the caller) until explicitly set.
  const effectiveStartingDifficultyTier = input.startingDifficultyTier ?? existing?.startingDifficultyTier ?? null;

  // AC #3: only re-check conflicts when the EFFECTIVE deselected set actually changes from
  // what's already saved — comparing by value, not by whether the caller happened to
  // include the field in this request. A caller that always resends its full current state
  // (as apps/web's CustomizePage does) must not re-trigger an already-force-confirmed
  // conflict forever just because `deselectedTopicIds` is present again with the same value.
  const previousDeselected = new Set(existing?.deselectedTopicIds ?? []);
  const nextDeselected = new Set(effectiveDeselected);
  const deselectionChanged =
    previousDeselected.size !== nextDeselected.size || [...previousDeselected].some((topicId) => !nextDeselected.has(topicId));
  // Review finding: comparing the full set's conflicts against "changed at all" re-blocked
  // an ALREADY force-confirmed conflict whenever the learner touched the deselected set
  // again for any reason (e.g. deselecting one more, unrelated Topic) — every such edit
  // demanded a fresh "Save anyway" for a warning already agreed to. Only conflicts that are
  // NEW relative to what's already saved should ever block.
  function conflictKey(conflict: DependencyConflict): string {
    return `${conflict.topicId}:${conflict.requiredByTopicId}`;
  }
  const previouslyAcceptedConflictKeys = new Set(computeDependencyConflicts(graph, [...previousDeselected]).map(conflictKey));
  const conflicts = deselectionChanged
    ? computeDependencyConflicts(graph, effectiveDeselected).filter((conflict) => !previouslyAcceptedConflictKeys.has(conflictKey(conflict)))
    : [];
  if (conflicts.length > 0 && input.force !== true) {
    throw new AppError("DEPENDENCY_CONFLICT", "deselecting this would leave a dependent topic without its prerequisite", 409, conflicts);
  }

  const [row] = await db
    .insert(courseCustomizations)
    .values({
      userId,
      courseId,
      deselectedTopicIds: effectiveDeselected,
      priorityTopicIds: effectivePriority,
      depth: effectiveDepth,
      explanationStyle: effectiveExplanationStyle,
      startingDifficultyTier: effectiveStartingDifficultyTier,
    })
    .onConflictDoUpdate({
      target: [courseCustomizations.userId, courseCustomizations.courseId],
      set: {
        deselectedTopicIds: effectiveDeselected,
        priorityTopicIds: effectivePriority,
        depth: effectiveDepth,
        explanationStyle: effectiveExplanationStyle,
        startingDifficultyTier: effectiveStartingDifficultyTier,
        updatedAt: sql`now()`,
        version: sql`${courseCustomizations.version} + 1`,
      },
    })
    .returning();

  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to save course customization", 500);
  }
  return toCourseCustomizationResponse(courseId, row, graph);
}

const MAX_PLACEMENT_CHECK_QUESTIONS = 8;

/**
 * Story 2.5 (FR-C-5). AC #1: one representative question per live Topic (position order),
 * skipping any Topic with no checkpoint question on any of its Concepts — no question bank
 * or generation exists; this samples Story 2.1's existing checkpointQuestions as-is.
 */
export async function getPlacementCheckQuestions(db: Db, courseId: string): Promise<PlacementCheckQuestion[]> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) {
    throw new AppError("NOT_FOUND", "course not found", 404);
  }

  const moduleRows = await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, courseId));
  const moduleIds = moduleRows.map((m) => m.id);
  const topicRows =
    moduleIds.length > 0
      ? await db
          .select({ id: topics.id, title: topics.title })
          .from(topics)
          .where(and(inArray(topics.moduleId, moduleIds), isNull(topics.archivedAt)))
          .orderBy(topics.position, topics.id)
      : [];
  const topicIds = topicRows.map((t) => t.id);

  const conceptRows =
    topicIds.length > 0
      ? await db
          .select({ id: concepts.id, topicId: concepts.topicId, checkpointQuestions: concepts.checkpointQuestions })
          .from(concepts)
          .where(inArray(concepts.topicId, topicIds))
          .orderBy(concepts.position, concepts.id)
      : [];

  const firstQuestionByTopicId = new Map<string, { conceptId: string; question: string }>();
  for (const concept of conceptRows) {
    if (firstQuestionByTopicId.has(concept.topicId)) {
      continue;
    }
    const firstQuestion = concept.checkpointQuestions?.[0];
    if (!firstQuestion) {
      continue;
    }
    firstQuestionByTopicId.set(concept.topicId, { conceptId: concept.id, question: firstQuestion.question });
  }

  const questions: PlacementCheckQuestion[] = [];
  for (const topic of topicRows) {
    const found = firstQuestionByTopicId.get(topic.id);
    if (!found) {
      continue;
    }
    questions.push({ topicId: topic.id, topicTitle: topic.title, conceptId: found.conceptId, question: found.question });
    if (questions.length >= MAX_PLACEMENT_CHECK_QUESTIONS) {
      break;
    }
  }
  return questions;
}

/**
 * AC #4: 0 answers (or all `masteryDemonstrated: false`) resolves to "beginner", the
 * course's easiest tier, without error. AC #2: all-mastery resolves to "advanced". No FR
 * names these exact thresholds — a documented product default, same class as Story 2.2's
 * duration buckets and Story 2.4's depth multipliers.
 */
function difficultyTierFromMasteryRatio(masteryRatio: number): DifficultyTier {
  if (masteryRatio >= 1) {
    return "advanced";
  }
  if (masteryRatio <= 0) {
    return "beginner";
  }
  return "intermediate";
}

/**
 * Story 2.5 (FR-C-5). Pure, stateless — no database write. AC #2 requires the learner to
 * see and manually override any auto-deselection BEFORE confirming; persisting this result
 * directly would save an unwanted deselection before that review ever happens. The caller
 * applies (or discards) this proposal through the existing saveCourseCustomization
 * (Story 2.4) instead.
 */
export async function scorePlacementCheck(db: Db, courseId: string, answers: PlacementCheckAnswerInput[]): Promise<PlacementCheckProposal> {
  const graph = await getCourseTopicGraph(db, courseId);

  for (const answer of answers) {
    if (!graph.topicIds.has(answer.topicId)) {
      throw new AppError("VALIDATION_ERROR", `invalid topic reference: topic "${answer.topicId}" does not exist in this Course`, 400);
    }
    // Review finding: each check was previously independent — a conceptId genuinely in
    // this Course but under a DIFFERENT Topic than the one claimed passed both checks.
    if (graph.conceptTopicId.get(answer.conceptId) !== answer.topicId) {
      throw new AppError("VALIDATION_ERROR", `invalid concept reference: concept "${answer.conceptId}" does not exist in this Course`, 400);
    }
  }

  // Review finding: a duplicate answer for the same Topic previously padded the mastery-
  // ratio denominator (raw answer count), skewing the result toward whichever value was
  // repeated rather than reflecting the actual number of Topics assessed. Keyed by topicId
  // so the LAST answer for a given Topic wins, then scored over unique Topics only.
  const answerByTopicId = new Map(answers.map((answer) => [answer.topicId, answer]));
  const uniqueAnswers = [...answerByTopicId.values()];

  const masteryCount = uniqueAnswers.filter((answer) => answer.masteryDemonstrated).length;
  const masteryRatio = uniqueAnswers.length > 0 ? masteryCount / uniqueAnswers.length : 0;
  const proposedDeselectedTopicIds = uniqueAnswers.filter((answer) => answer.masteryDemonstrated).map((answer) => answer.topicId);

  return {
    proposedDeselectedTopicIds,
    proposedStartingDifficultyTier: difficultyTierFromMasteryRatio(masteryRatio),
  };
}

/** The group key is the root version's own id — NULL versionGroupId means "I am the root". */
function groupKeyOf(course: { id: string; versionGroupId: string | null }): string {
  return course.versionGroupId ?? course.id;
}

async function getCourseRowOrThrow(db: Db, courseId: string) {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId));
  if (!course) {
    throw new AppError("NOT_FOUND", "course not found", 404);
  }
  return course;
}

/** Highest versionNumber in the group regardless of status — createCourseVersion's own
 * numbering must stay monotonic across drafts too, not just published rows. */
async function getLatestVersionInGroup(db: Db, groupKey: string) {
  const rows = await db
    .select()
    .from(courses)
    .where(sql`coalesce(${courses.versionGroupId}, ${courses.id}) = ${groupKey}`)
    .orderBy(sql`${courses.versionNumber} DESC`, sql`${courses.id} DESC`)
    .limit(1);
  const [latest] = rows;
  if (!latest) {
    throw new AppError("INTERNAL_ERROR", "version group has no versions", 500);
  }
  return latest;
}

/**
 * Review finding: `getLatestVersionInGroup` has no status filter, so a still-`draft` new
 * version (created via createCourseVersion, mid-authoring) could be reported to a learner
 * as "the latest version, available to update to" and even served to them — leaking
 * unpublished content. `resolveCourseForLearner`/`updateCourseVersionPin` must only ever
 * consider PUBLISHED rows for that learner-facing "is there something newer" signal.
 * Returns `null` (not a throw) when the group has no published row yet — a legitimate
 * state for a course still being authored, matching the same case searchCourses already
 * excludes from the catalog.
 */
async function getLatestPublishedVersionInGroup(db: Db, groupKey: string) {
  const rows = await db
    .select()
    .from(courses)
    .where(sql`coalesce(${courses.versionGroupId}, ${courses.id}) = ${groupKey} AND ${courses.status} = 'published'`)
    .orderBy(sql`${courses.versionNumber} DESC`, sql`${courses.id} DESC`)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Story 2.6 (FR-C-6). "Publishing a new version" is a whole new courses row sharing the
 * source's group key — no in-place content editing exists (see that story's Dev Notes).
 * The new version's own Modules/Topics/Concepts are built afterward via the existing
 * createModule/createTopic/createConcept, pointed at this new id.
 */
export async function createCourseVersion(db: Db, role: Role, sourceCourseId: string, input: CreateCourseInput): Promise<CourseResponse> {
  requireCourseHierarchyWriteAccess(role, "create");
  const source = await getCourseRowOrThrow(db, sourceCourseId);
  const groupKey = groupKeyOf(source);
  const latest = await getLatestVersionInGroup(db, groupKey);

  const [row] = await db
    .insert(courses)
    .values({
      title: input.title,
      description: input.description ?? null,
      subject: input.subject ?? null,
      level: input.level ?? null,
      estimatedDurationHours: input.estimatedDurationHours ?? null,
      status: input.status ?? "draft",
      prerequisites: input.prerequisites ? [...new Set(input.prerequisites)] : null,
      outcomes: input.outcomes ? [...new Set(input.outcomes)] : null,
      sampleBoardAssetRef: input.sampleBoardAssetRef ?? null,
      versionGroupId: groupKey,
      versionNumber: latest.versionNumber + 1,
    })
    .returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to create course version", 500);
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subject: row.subject,
    level: row.level,
    estimatedDurationHours: row.estimatedDurationHours,
    status: row.status,
    prerequisites: row.prerequisites ?? [],
    outcomes: row.outcomes ?? [],
    sampleBoardAssetRef: row.sampleBoardAssetRef,
    isPinnedToOlderVersion: false,
    latestVersionId: null,
    modules: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * AC #1: "access... first recorded" — idempotent, and explicitly NOT a real Epic 3/4
 * learning session (see Dev Notes). A second start is a no-op, not an error.
 */
export async function startCourse(db: Db, userId: string, courseId: string): Promise<StartCourseResponse> {
  const course = await getCourseRowOrThrow(db, courseId);
  const groupKey = groupKeyOf(course);

  const [existing] = await db
    .select()
    .from(learnerCoursePins)
    .where(and(eq(learnerCoursePins.userId, userId), eq(learnerCoursePins.versionGroupId, groupKey)));
  if (existing) {
    return { pinnedCourseId: existing.pinnedCourseId, startedAt: existing.createdAt.toISOString() };
  }

  const [row] = await db.insert(learnerCoursePins).values({ userId, versionGroupId: groupKey, pinnedCourseId: courseId }).returning();
  if (!row) {
    throw new AppError("INTERNAL_ERROR", "failed to record course access", 500);
  }
  return { pinnedCourseId: row.pinnedCourseId, startedAt: row.createdAt.toISOString() };
}

/**
 * AC #2/#3: the `GET /courses/:id` resolution path — transparently returns the learner's
 * pinned version regardless of which version id was requested, with `isPinnedToOlderVersion`
 * only true when a pin exists AND it isn't already the group's latest (AC #3's literal
 * framing is about a learner already PINNED to an older version, not general old-version
 * browsing by someone who's never started).
 */
export async function resolveCourseForLearner(db: Db, userId: string, requestedCourseId: string): Promise<CourseResponse> {
  const requested = await getCourseRowOrThrow(db, requestedCourseId);
  const groupKey = groupKeyOf(requested);

  const [pin] = await db
    .select()
    .from(learnerCoursePins)
    .where(and(eq(learnerCoursePins.userId, userId), eq(learnerCoursePins.versionGroupId, groupKey)));
  // Review finding: only a PUBLISHED version can ever be "the latest available update" —
  // a still-draft version must never surface here (see getLatestPublishedVersionInGroup).
  const latestPublished = await getLatestPublishedVersionInGroup(db, groupKey);
  const effectiveCourseId = pin?.pinnedCourseId ?? requestedCourseId;
  const effectiveRow = effectiveCourseId === requested.id ? requested : await getCourseRowOrThrow(db, effectiveCourseId);

  const course = await getCourse(db, effectiveCourseId);
  // Compared by versionNumber, not id-equality: a pin sitting on something whose OWN
  // version number is already >= the latest published one (a rare case — e.g. pinned
  // directly to a draft ahead of any published release) must never be reported as
  // "older," which id-equality alone would have gotten backwards.
  const isNewerAvailable = latestPublished !== null && latestPublished.versionNumber > effectiveRow.versionNumber;
  return {
    ...course,
    isPinnedToOlderVersion: pin !== undefined && isNewerAvailable,
    latestVersionId: isNewerAvailable ? latestPublished.id : null,
  };
}

/**
 * AC #4: moves the learner's pin to the group's latest version, then reconciles their
 * existing customisation (Story 2.4) by Topic TITLE (the only stable signal across
 * versions — see Dev Notes on why id-matching can never work here). A title match carries
 * the reference forward under the new version's own Topic id; no match means the Topic was
 * removed or renamed — dropped from the persisted set (an id foreign to the new version
 * would fail every future save's own validation) and named in `flaggedTopicTitles` instead
 * of being silently lost.
 */
export async function updateCourseVersionPin(db: Db, userId: string, courseId: string): Promise<UpdateToLatestVersionResponse> {
  const requested = await getCourseRowOrThrow(db, courseId);
  const groupKey = groupKeyOf(requested);
  // Review finding: never move a learner's pin onto a still-draft version — same
  // published-only resolution as resolveCourseForLearner's "is there something newer" check.
  const latest = await getLatestPublishedVersionInGroup(db, groupKey);
  if (!latest) {
    throw new AppError("VALIDATION_ERROR", "no published version is available to update to", 400);
  }

  const [existingPin] = await db
    .select()
    .from(learnerCoursePins)
    .where(and(eq(learnerCoursePins.userId, userId), eq(learnerCoursePins.versionGroupId, groupKey)));
  const oldPinnedCourseId = existingPin?.pinnedCourseId ?? courseId;

  await db
    .insert(learnerCoursePins)
    .values({ userId, versionGroupId: groupKey, pinnedCourseId: latest.id })
    .onConflictDoUpdate({
      target: [learnerCoursePins.userId, learnerCoursePins.versionGroupId],
      set: { pinnedCourseId: latest.id, updatedAt: sql`now()` },
    });

  const [oldCustomization] = await db
    .select()
    .from(courseCustomizations)
    .where(and(eq(courseCustomizations.userId, userId), eq(courseCustomizations.courseId, oldPinnedCourseId)));
  if (!oldCustomization) {
    return { pinnedCourseId: latest.id, flaggedTopicTitles: [] };
  }

  const oldGraph = await getCourseTopicGraph(db, oldPinnedCourseId);
  const newGraph = await getCourseTopicGraph(db, latest.id);
  const newTopicIdByTitle = new Map<string, string>();
  for (const [topicId, title] of newGraph.topicTitleById) {
    newTopicIdByTitle.set(title, topicId);
  }

  // Review finding: getCourseTopicGraph excludes archived Topics, so a Topic the learner
  // deselected/prioritized that was LATER archived (in the old version) had no title to
  // report — its reference was dropped with no flag at all, unlike a genuinely
  // removed/renamed Topic. This unfiltered fallback lookup covers that case too, so
  // "flagged for review, not silently dropped" (AC #4) applies uniformly.
  const oldModuleRows = await db.select({ id: modules.id }).from(modules).where(eq(modules.courseId, oldPinnedCourseId));
  const oldModuleIds = oldModuleRows.map((m) => m.id);
  const allOldTopicRows =
    oldModuleIds.length > 0 ? await db.select({ id: topics.id, title: topics.title }).from(topics).where(inArray(topics.moduleId, oldModuleIds)) : [];
  const allOldTopicTitleById = new Map(allOldTopicRows.map((t) => [t.id, t.title]));

  const flaggedTopicTitles = new Set<string>();
  function remap(oldTopicIds: string[] | null): string[] {
    const remapped: string[] = [];
    for (const oldTopicId of oldTopicIds ?? []) {
      const title = oldGraph.topicTitleById.get(oldTopicId) ?? allOldTopicTitleById.get(oldTopicId);
      const newTopicId = title ? newTopicIdByTitle.get(title) : undefined;
      if (newTopicId) {
        remapped.push(newTopicId);
      } else if (title) {
        flaggedTopicTitles.add(title);
      }
    }
    return remapped;
  }

  const remappedDeselected = remap(oldCustomization.deselectedTopicIds);
  const remappedPriority = remap(oldCustomization.priorityTopicIds);

  // force: true — this is a system-driven migration, not a fresh learner-initiated
  // deselection; re-running AC #3 (Story 2.4)'s dependency-conflict prompt here would be a
  // confusing second layer of review on top of this story's own flaggedTopicTitles notice.
  await saveCourseCustomization(db, userId, latest.id, {
    deselectedTopicIds: remappedDeselected,
    priorityTopicIds: remappedPriority,
    depth: oldCustomization.depth,
    explanationStyle: oldCustomization.explanationStyle,
    ...(oldCustomization.startingDifficultyTier ? { startingDifficultyTier: oldCustomization.startingDifficultyTier } : {}),
    force: true,
  });

  return { pinnedCourseId: latest.id, flaggedTopicTitles: [...flaggedTopicTitles] };
}
