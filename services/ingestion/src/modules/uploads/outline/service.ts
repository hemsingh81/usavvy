import { and, asc, eq, inArray } from "drizzle-orm";
import { AppError } from "@usavvy/service-kernel";
import type { ConfirmOutlineResponse, ProposedTopicResponse } from "@usavvy/shared-types";
import type { Db } from "../../../db/client.js";
import { customCourseConfirmations, proposedConcepts, proposedTopics, uploadedDocuments } from "../../../db/schema.js";

// Story 2.13 (FR-C-10). Outline editing is its own concern, distinct from uploads/'s
// upload-and-ingest job pipeline — a separate module folder, same service.

async function requireOwnedTopic(db: Db, ownerId: string, topicId: string): Promise<typeof proposedTopics.$inferSelect> {
  const [row] = await db
    .select({ topic: proposedTopics })
    .from(proposedTopics)
    .innerJoin(uploadedDocuments, eq(proposedTopics.documentId, uploadedDocuments.id))
    .where(and(eq(proposedTopics.id, topicId), eq(uploadedDocuments.ownerId, ownerId)))
    .then((rows) => rows.map((r) => r.topic));
  if (!row) {
    throw new AppError("NOT_FOUND", "proposed topic not found", 404);
  }
  return row;
}

async function requireOwnedConcept(
  db: Db,
  ownerId: string,
  conceptId: string,
): Promise<{ concept: typeof proposedConcepts.$inferSelect; topic: typeof proposedTopics.$inferSelect }> {
  const [row] = await db
    .select({ concept: proposedConcepts, topic: proposedTopics })
    .from(proposedConcepts)
    .innerJoin(proposedTopics, eq(proposedConcepts.proposedTopicId, proposedTopics.id))
    .innerJoin(uploadedDocuments, eq(proposedTopics.documentId, uploadedDocuments.id))
    .where(and(eq(proposedConcepts.id, conceptId), eq(uploadedDocuments.ownerId, ownerId)));
  if (!row) {
    throw new AppError("NOT_FOUND", "proposed concept not found", 404);
  }
  return row;
}

/** AC #1: the full outline for a custom course, ownership-scoped via the same join every function here uses. */
export async function listProposedOutline(db: Db, ownerId: string, customCourseId: string): Promise<ProposedTopicResponse[]> {
  const topicRows = await db
    .select({ topic: proposedTopics })
    .from(proposedTopics)
    .innerJoin(uploadedDocuments, eq(proposedTopics.documentId, uploadedDocuments.id))
    .where(and(eq(proposedTopics.customCourseId, customCourseId), eq(uploadedDocuments.ownerId, ownerId)))
    .orderBy(asc(proposedTopics.position), asc(proposedTopics.id))
    .then((rows) => rows.map((r) => r.topic));

  const topicIds = topicRows.map((t) => t.id);
  const conceptRows =
    topicIds.length > 0
      ? await db.select().from(proposedConcepts).where(inArray(proposedConcepts.proposedTopicId, topicIds)).orderBy(asc(proposedConcepts.position), asc(proposedConcepts.id))
      : [];

  const conceptsByTopicId = new Map<string, ProposedTopicResponse["concepts"]>();
  for (const row of conceptRows) {
    const list = conceptsByTopicId.get(row.proposedTopicId) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      position: row.position,
      priority: row.priority,
      sourcePageRangeStart: row.sourcePageRangeStart,
      sourcePageRangeEnd: row.sourcePageRangeEnd,
      safetyFlagged: row.safetyFlagged,
    });
    conceptsByTopicId.set(row.proposedTopicId, list);
  }

  return topicRows.map((row) => ({
    id: row.id,
    title: row.title,
    position: row.position,
    priority: row.priority,
    concepts: conceptsByTopicId.get(row.id) ?? [],
  }));
}

export async function renameProposedTopic(db: Db, ownerId: string, topicId: string, title: string): Promise<void> {
  await requireOwnedTopic(db, ownerId, topicId);
  await db.update(proposedTopics).set({ title }).where(eq(proposedTopics.id, topicId));
}

export async function renameProposedConcept(db: Db, ownerId: string, conceptId: string, title: string): Promise<void> {
  await requireOwnedConcept(db, ownerId, conceptId);
  await db.update(proposedConcepts).set({ title }).where(eq(proposedConcepts.id, conceptId));
}

export async function setProposedTopicPriority(db: Db, ownerId: string, topicId: string, priority: boolean): Promise<void> {
  await requireOwnedTopic(db, ownerId, topicId);
  await db.update(proposedTopics).set({ priority }).where(eq(proposedTopics.id, topicId));
}

export async function setProposedConceptPriority(db: Db, ownerId: string, conceptId: string, priority: boolean): Promise<void> {
  await requireOwnedConcept(db, ownerId, conceptId);
  await db.update(proposedConcepts).set({ priority }).where(eq(proposedConcepts.id, conceptId));
}

export async function deleteProposedTopic(db: Db, ownerId: string, topicId: string): Promise<void> {
  await requireOwnedTopic(db, ownerId, topicId);
  await db.delete(proposedTopics).where(eq(proposedTopics.id, topicId));
}

export async function deleteProposedConcept(db: Db, ownerId: string, conceptId: string): Promise<void> {
  await requireOwnedConcept(db, ownerId, conceptId);
  await db.delete(proposedConcepts).where(eq(proposedConcepts.id, conceptId));
}

/**
 * AC #1: a bulk "here's the new order" operation, not per-item drag-and-drop (Scope
 * Note). Rewrites `position` to a global 0..N-1 sequence across the whole
 * customCourseId — superseding Story 2.12's per-document-local meaning the first time a
 * learner reorders. Requires the given id list to be EXACTLY the current topic set for
 * this custom course (no silently dropping or ignoring an extra id).
 */
export async function reorderProposedTopics(db: Db, ownerId: string, customCourseId: string, orderedTopicIds: string[]): Promise<void> {
  const current = await db
    .select({ id: proposedTopics.id })
    .from(proposedTopics)
    .innerJoin(uploadedDocuments, eq(proposedTopics.documentId, uploadedDocuments.id))
    .where(and(eq(proposedTopics.customCourseId, customCourseId), eq(uploadedDocuments.ownerId, ownerId)));
  const currentIds = new Set(current.map((row) => row.id));
  const requestedIds = new Set(orderedTopicIds);
  // Review finding: comparing Sets alone let a duplicate id slip through as long as the
  // Set size still matched the current count (e.g. current {A,B}, request [A,A,B]) —
  // the array-length check catches that case too.
  if (
    orderedTopicIds.length !== currentIds.size ||
    currentIds.size !== requestedIds.size ||
    [...currentIds].some((id) => !requestedIds.has(id))
  ) {
    throw new AppError("VALIDATION_ERROR", "orderedTopicIds must contain exactly the custom course's current topics, each exactly once", 400);
  }

  await db.transaction(async (tx) => {
    for (const [index, topicId] of orderedTopicIds.entries()) {
      await tx.update(proposedTopics).set({ position: index }).where(eq(proposedTopics.id, topicId));
    }
  });
}

/**
 * AC #4: unions the two concepts' source page ranges. Scope Note: rejects a cross-Topic
 * merge (404, not a silent Topic pick) — merging is only defined within one Topic.
 * Deletes `mergeConceptId`, updates `keepConceptId` in place.
 */
export async function mergeProposedConcepts(db: Db, ownerId: string, keepConceptId: string, mergeConceptId: string): Promise<void> {
  // Review finding: merging a concept into itself would update it then immediately
  // delete that same row — silently destroying it while reporting success.
  if (keepConceptId === mergeConceptId) {
    throw new AppError("VALIDATION_ERROR", "cannot merge a concept into itself", 400);
  }
  const keep = await requireOwnedConcept(db, ownerId, keepConceptId);
  const merge = await requireOwnedConcept(db, ownerId, mergeConceptId);
  if (keep.topic.id !== merge.topic.id) {
    throw new AppError("VALIDATION_ERROR", "cannot merge concepts from different proposed topics", 400);
  }

  // Dev Notes: a null on either side means "no constraint from that side" — the merged
  // range is only as precise as its least-precise contributor, never fabricated.
  const sourcePageRangeStart =
    keep.concept.sourcePageRangeStart === null || merge.concept.sourcePageRangeStart === null
      ? null
      : Math.min(keep.concept.sourcePageRangeStart, merge.concept.sourcePageRangeStart);
  const sourcePageRangeEnd =
    keep.concept.sourcePageRangeEnd === null || merge.concept.sourcePageRangeEnd === null
      ? null
      : Math.max(keep.concept.sourcePageRangeEnd, merge.concept.sourcePageRangeEnd);

  await db.transaction(async (tx) => {
    await tx.update(proposedConcepts).set({ sourcePageRangeStart, sourcePageRangeEnd }).where(eq(proposedConcepts.id, keepConceptId));
    await tx.delete(proposedConcepts).where(eq(proposedConcepts.id, mergeConceptId));
  });
}

function deriveTitleFromFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
}

/**
 * AC #2/#3. Idempotent: an already-confirmed customCourseId returns its existing
 * courseId with no re-validation. Otherwise validates at least one Topic remains (AC
 * #3) and returns the materialization-ready outline — this function never calls
 * `courses` itself (AD-13: only `gateway` orchestrates across services) and does not
 * yet write the confirmation record (that's `recordOutlineConfirmation`, called only
 * after `courses` successfully returns a courseId).
 */
/**
 * Review finding: two concurrent confirm calls (a double-click, a client retry after an
 * ambiguous network response, two open tabs) previously both observed "not yet
 * confirmed" and both proceeded to have `gateway` create a real, permanent `courses`
 * row — no idempotency key ever reached the actual materialization call. This function
 * now atomically CLAIMS the confirmation slot first (an insert with `courseId` still
 * null, `ON CONFLICT DO NOTHING`) — only the caller whose insert actually wins ever
 * returns a ready-to-materialize outline; every other concurrent caller either gets the
 * already-completed result or a 409 asking them to retry shortly. See schema.ts's
 * `customCourseConfirmations` comment for the full reasoning, including the accepted gap
 * this leaves (an abandoned claim that never gets its `courseId` recorded).
 */
export async function confirmOutline(db: Db, ownerId: string, customCourseId: string): Promise<ConfirmOutlineResponse> {
  const [claimed] = await db.insert(customCourseConfirmations).values({ customCourseId, ownerId, courseId: null }).onConflictDoNothing().returning();

  if (!claimed) {
    const [existing] = await db
      .select()
      .from(customCourseConfirmations)
      .where(and(eq(customCourseConfirmations.customCourseId, customCourseId), eq(customCourseConfirmations.ownerId, ownerId)));
    if (!existing) {
      // The claim row exists but belongs to a different owner (an astronomically
      // unlikely customCourseId collision) — never reveal that to this caller.
      throw new AppError("NOT_FOUND", "no proposed outline found for this custom course", 404);
    }
    if (existing.courseId !== null) {
      return { alreadyConfirmed: true, courseId: existing.courseId };
    }
    throw new AppError("OUTLINE_CONFIRMATION_IN_PROGRESS", "this outline is already being confirmed — try again shortly", 409);
  }

  const topics = await listProposedOutline(db, ownerId, customCourseId);
  // AC #3: "at least one Topic must remain" — extended to require every remaining
  // Topic to itself have at least one Concept, matching `courses`' own downstream
  // requirement (createCustomCourseTopicInputSchema's concepts: .min(1)) so this is
  // caught here with a clear message, not as an opaque cross-service 400.
  if (topics.length === 0 || topics.some((topic) => topic.concepts.length === 0)) {
    // Roll back the claim — an outline that fails validation must remain confirmable
    // again later (e.g. once the learner adds a Concept back), not permanently stuck
    // behind a claim that will never get its courseId recorded.
    await db.delete(customCourseConfirmations).where(eq(customCourseConfirmations.customCourseId, customCourseId));
    throw new AppError("VALIDATION_ERROR", "at least one Topic, with at least one Concept each, must remain to confirm this outline", 400);
  }

  const [firstDocument] = await db
    .select({ fileName: uploadedDocuments.fileName })
    .from(uploadedDocuments)
    .where(and(eq(uploadedDocuments.customCourseId, customCourseId), eq(uploadedDocuments.ownerId, ownerId)))
    .orderBy(asc(uploadedDocuments.createdAt))
    .limit(1);
  const title = firstDocument ? deriveTitleFromFileName(firstDocument.fileName) : "My custom course";

  return { alreadyConfirmed: false, title, topics };
}

/** The second half of confirmation — called by `gateway` only after `courses` succeeds. An UPDATE of the row `confirmOutline` already claimed, never an insert. */
export async function recordOutlineConfirmation(db: Db, ownerId: string, customCourseId: string, courseId: string): Promise<void> {
  await db
    .update(customCourseConfirmations)
    .set({ courseId })
    .where(and(eq(customCourseConfirmations.customCourseId, customCourseId), eq(customCourseConfirmations.ownerId, ownerId)));
}
