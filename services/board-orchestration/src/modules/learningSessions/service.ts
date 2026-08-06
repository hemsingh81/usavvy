import { and, asc, desc, eq, ne } from "drizzle-orm";
import { AppError } from "@usavvy/service-kernel";
import type { Db } from "../../db/client.js";
import { beats, learningSessions, sessionEvents } from "../../db/schema.js";
import type { VoicePort } from "../voice/index.js";
import type { PubSubPort } from "../pubsub/index.js";

export interface BeatInput {
  narration: string;
  boardAction: Record<string, unknown>;
  audioRef?: string | null;
  sourceRef?: string | null;
}

export interface LearningSessionResponse {
  id: string;
  userId: string;
  conceptId: string;
  status: string;
  currentBeatId: string | null;
  narrationOffsetMs: number | null;
  boardRenderState: Record<string, unknown> | null;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  beats: BeatResponse[];
}

export interface BeatResponse {
  id: string;
  position: number;
  narration: string;
  boardAction: Record<string, unknown>;
  audioRef: string | null;
  sourceRef: string | null;
}

function toBeatResponse(row: typeof beats.$inferSelect): BeatResponse {
  return {
    id: row.id,
    position: row.position,
    narration: row.narration,
    boardAction: row.boardAction,
    audioRef: row.audioRef,
    sourceRef: row.sourceRef,
  };
}

// Code-review finding: the initial "is there already a session?" lookup had no
// ORDER BY and no status filter — with more than one historical row for the same
// (userId, conceptId) (an ended session from a prior completed lesson, plus a fresh one
// from relearning it later), which row got returned was whatever order Postgres
// happened to return, not necessarily the current one. Filtering to non-ended and
// taking the most recently started row makes this deterministic.
async function findActiveOrPausedSession(db: Db, userId: string, conceptId: string): Promise<typeof learningSessions.$inferSelect | undefined> {
  const [existing] = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.userId, userId), eq(learningSessions.conceptId, conceptId), ne(learningSessions.status, "ended")))
    .orderBy(desc(learningSessions.startedAt))
    .limit(1);
  return existing;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}

async function loadSessionOrThrow(db: Db, userId: string, sessionId: string): Promise<typeof learningSessions.$inferSelect> {
  const [session] = await db
    .select()
    .from(learningSessions)
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.userId, userId)));
  if (!session) {
    // Ownership-check-returns-404 convention (never 403) — matches this codebase's
    // established "hide existence" pattern everywhere else (services/core's
    // notification functions, services/ingestion's deleteUploadedDocument).
    throw new AppError("NOT_FOUND", "learning session not found", 404);
  }
  return session;
}

async function toResponse(db: Db, session: typeof learningSessions.$inferSelect): Promise<LearningSessionResponse> {
  const beatRows = await db.select().from(beats).where(eq(beats.sessionId, session.id)).orderBy(asc(beats.position), asc(beats.id));
  return {
    id: session.id,
    userId: session.userId,
    conceptId: session.conceptId,
    status: session.status,
    currentBeatId: session.currentBeatId,
    narrationOffsetMs: session.narrationOffsetMs,
    boardRenderState: session.boardRenderState ?? null,
    startedAt: session.startedAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    beats: beatRows.map(toBeatResponse),
  };
}

/**
 * AC #3: reopening the same lesson on the same or a different day/device restores the
 * exact paused Beat/offset with no separate mechanism — this idempotent lookup IS that
 * mechanism. An existing "active"/"paused" session for this exact (userId, conceptId)
 * pair is returned completely unchanged (the supplied `beats` are ignored in that case);
 * only when no such session exists is a new one created from the caller-supplied Beats.
 *
 * Code-review finding: the SELECT-then-INSERT above is not atomic by itself — two
 * concurrent calls for the same (userId, conceptId) can both miss the SELECT and both
 * attempt the INSERT. The `learning_sessions_user_concept_active_idx` partial unique
 * index (schema.ts) makes the DB the actual source of truth for "at most one non-ended
 * session per pair"; the loser of that race falls back to the winner's now-committed
 * session instead of erroring, matching `outline/service.ts`'s `confirmOutline()`
 * precedent for this exact race shape.
 */
export async function createOrResumeLearningSession(db: Db, userId: string, conceptId: string, beatInputs: BeatInput[]): Promise<LearningSessionResponse> {
  const existing = await findActiveOrPausedSession(db, userId, conceptId);
  if (existing) {
    return toResponse(db, existing);
  }

  if (beatInputs.length === 0) {
    throw new AppError("VALIDATION_ERROR", "at least one Beat is required to start a learning session", 400);
  }

  let session: typeof learningSessions.$inferSelect;
  try {
    session = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(learningSessions).values({ userId, conceptId, status: "active" }).returning();
      if (!inserted) {
        throw new AppError("INTERNAL_ERROR", "failed to create learning session", 500);
      }

      const insertedBeats = await tx
        .insert(beats)
        .values(
          beatInputs.map((input, index) => ({
            sessionId: inserted.id,
            position: index,
            narration: input.narration,
            boardAction: input.boardAction,
            audioRef: input.audioRef ?? null,
            sourceRef: input.sourceRef ?? null,
          })),
        )
        .returning();
      const firstBeat = insertedBeats[0];
      if (!firstBeat) {
        throw new AppError("INTERNAL_ERROR", "failed to create beats", 500);
      }

      const [withCurrentBeat] = await tx
        .update(learningSessions)
        .set({ currentBeatId: firstBeat.id })
        .where(eq(learningSessions.id, inserted.id))
        .returning();
      if (!withCurrentBeat) {
        throw new AppError("INTERNAL_ERROR", "failed to record the session's first Beat", 500);
      }

      await tx.insert(sessionEvents).values({ sessionId: inserted.id, type: "started" });

      return withCurrentBeat;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const winner = await findActiveOrPausedSession(db, userId, conceptId);
      if (winner) {
        return toResponse(db, winner);
      }
    }
    throw error;
  }

  return toResponse(db, session);
}

export async function getLearningSession(db: Db, userId: string, sessionId: string): Promise<LearningSessionResponse> {
  const session = await loadSessionOrThrow(db, userId, sessionId);
  return toResponse(db, session);
}

export interface PauseLearningSessionInput {
  currentBeatId: string;
  narrationOffsetMs: number;
  boardRenderState: Record<string, unknown>;
}

/**
 * AC #1: halts and persists the paused state — a single fast DB write with no
 * synchronous cross-service calls in its path (NFR-B-3's "must feel instant" budget,
 * architecturally).
 *
 * Code-review finding: this previously had no guard against pausing an already-`"ended"`
 * session — doing so silently resurrected it (`status: "paused"` with `endedAt` still
 * set, an internally inconsistent record), and a subsequent Resume would then reactivate
 * it. Rejected up front, and the write itself is additionally scoped to `status <>
 * "ended"` so a concurrent `end` landing between the check and the write can't be raced
 * past either.
 */
export async function pauseLearningSession(db: Db, userId: string, sessionId: string, input: PauseLearningSessionInput): Promise<LearningSessionResponse> {
  const session = await loadSessionOrThrow(db, userId, sessionId);
  if (session.status === "ended") {
    throw new AppError("VALIDATION_ERROR", "this learning session has already ended and cannot be paused", 400);
  }

  const [beat] = await db.select({ id: beats.id }).from(beats).where(and(eq(beats.id, input.currentBeatId), eq(beats.sessionId, sessionId)));
  if (!beat) {
    throw new AppError("VALIDATION_ERROR", `Beat ${input.currentBeatId} does not belong to this learning session`, 400);
  }

  const [updated] = await db
    .update(learningSessions)
    .set({
      status: "paused",
      currentBeatId: input.currentBeatId,
      narrationOffsetMs: input.narrationOffsetMs,
      boardRenderState: input.boardRenderState,
      updatedAt: new Date(),
    })
    .where(and(eq(learningSessions.id, sessionId), ne(learningSessions.status, "ended")))
    .returning();
  if (!updated) {
    throw new AppError("VALIDATION_ERROR", "this learning session has already ended and cannot be paused", 400);
  }

  await db.insert(sessionEvents).values({
    sessionId,
    type: "paused",
    payload: { currentBeatId: input.currentBeatId, narrationOffsetMs: input.narrationOffsetMs },
  });

  return toResponse(db, updated);
}

/**
 * AC #2/#4: resumes from the exact paused offset. Calls VoicePort BEFORE writing
 * anything — on failure, throws a distinguishable AppError and the persisted paused
 * state is left completely untouched (AC #4's "without losing the saved position"),
 * so a learner can retry Resume once VoicePort recovers.
 */
export async function resumeLearningSession(db: Db, userId: string, sessionId: string, voicePort: VoicePort): Promise<LearningSessionResponse & { streamRef: string }> {
  const session = await loadSessionOrThrow(db, userId, sessionId);
  if (session.status !== "paused") {
    throw new AppError("VALIDATION_ERROR", `learning session is "${session.status}", not "paused" — nothing to resume`, 400);
  }
  if (!session.currentBeatId || session.narrationOffsetMs === null) {
    throw new AppError("INTERNAL_ERROR", "paused learning session is missing its Beat/offset", 500);
  }

  let streamRef: string;
  try {
    const stream = await voicePort.reestablishStream(session.currentBeatId, session.narrationOffsetMs);
    streamRef = stream.streamRef;
  } catch (error) {
    throw new AppError("VOICE_UNAVAILABLE", "unable to reestablish the narration audio stream — try again", 503, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  // Code-review finding: this write was previously unconditional on `status`, so a
  // concurrent `end`/`recordBeatReached`-auto-end landing while the VoicePort call above
  // was in flight would get silently reversed by this blind write flipping the
  // now-ended session back to `"active"` (with `endedAt` still set — an inconsistent
  // record, and a lie about the already-published `learning_session.ended` event).
  // Re-checking `status = "paused"` at write time closes that window; the caller gets a
  // clear 409 to retry instead.
  const [updated] = await db
    .update(learningSessions)
    .set({ status: "active", updatedAt: new Date() })
    .where(and(eq(learningSessions.id, sessionId), eq(learningSessions.status, "paused")))
    .returning();
  if (!updated) {
    throw new AppError("SESSION_STATE_CHANGED", "this learning session's status changed while resuming — try again", 409);
  }

  await db.insert(sessionEvents).values({
    sessionId,
    type: "resumed",
    payload: { currentBeatId: session.currentBeatId, narrationOffsetMs: session.narrationOffsetMs },
  });

  const response = await toResponse(db, updated);
  return { ...response, streamRef };
}

async function endLearningSessionInternal(db: Db, session: typeof learningSessions.$inferSelect, pubSubPort: PubSubPort): Promise<typeof learningSessions.$inferSelect> {
  if (session.status === "ended") {
    return session;
  }

  // Scoping the write to `status <> "ended"` (rather than a bare id match) closes a
  // concurrent-double-end race: two callers (an explicit `end` and `recordBeatReached`'s
  // own auto-end branch racing in) could otherwise both pass the check above and both
  // write/publish. The loser here gets `!updated` and treats it as the no-op it actually
  // is, rather than erroring or double-publishing.
  const [updated] = await db
    .update(learningSessions)
    .set({ status: "ended", endedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(learningSessions.id, session.id), ne(learningSessions.status, "ended")))
    .returning();
  if (!updated) {
    const [current] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    if (current) {
      return current;
    }
    throw new AppError("INTERNAL_ERROR", "failed to end learning session", 500);
  }

  await db.insert(sessionEvents).values({ sessionId: session.id, type: "ended" });

  // AC #5/AD-18: the event Activity History (Story 1.11) will eventually key off —
  // matches services/core's own user.deletion_requested publish call exactly.
  await pubSubPort.publish({
    type: "learning_session.ended",
    payload: { sessionId: session.id, userId: session.userId, conceptId: session.conceptId },
  });

  return updated;
}

/** AC #5 (explicit-end branch). Idempotent — ending an already-ended session is a safe no-op, matching this codebase's established idempotent-write conventions. */
export async function endLearningSession(db: Db, userId: string, sessionId: string, pubSubPort: PubSubPort): Promise<LearningSessionResponse> {
  const session = await loadSessionOrThrow(db, userId, sessionId);
  const ended = await endLearningSessionInternal(db, session, pubSubPort);
  return toResponse(db, ended);
}

/**
 * AC #5 (last-Beat branch). Advances `currentBeatId`; if the reached Beat is the
 * session's last one by `position`, automatically ends the session via the same shared
 * helper `endLearningSession` uses, so both branches of AC #5 publish identically.
 *
 * Code-review finding: this previously had no guard against recording progress on an
 * already-`"ended"` session — a stray/late `reached` call after the session ended could
 * silently move `currentBeatId` on a record that should be immutable, and (if the
 * reached Beat happened to be the last one again) re-trigger the end path a second time.
 */
export async function recordBeatReached(db: Db, userId: string, sessionId: string, beatId: string, pubSubPort: PubSubPort): Promise<LearningSessionResponse> {
  const session = await loadSessionOrThrow(db, userId, sessionId);
  if (session.status === "ended") {
    throw new AppError("VALIDATION_ERROR", "this learning session has already ended", 400);
  }

  const sessionBeats = await db.select({ id: beats.id, position: beats.position }).from(beats).where(eq(beats.sessionId, sessionId)).orderBy(asc(beats.position), asc(beats.id));
  const reachedBeat = sessionBeats.find((b) => b.id === beatId);
  if (!reachedBeat) {
    throw new AppError("VALIDATION_ERROR", `Beat ${beatId} does not belong to this learning session`, 400);
  }

  const [updated] = await db
    .update(learningSessions)
    .set({ currentBeatId: beatId, updatedAt: new Date() })
    .where(and(eq(learningSessions.id, sessionId), ne(learningSessions.status, "ended")))
    .returning();
  if (!updated) {
    throw new AppError("VALIDATION_ERROR", "this learning session has already ended", 400);
  }

  const lastBeat = sessionBeats[sessionBeats.length - 1];
  if (lastBeat && lastBeat.id === beatId) {
    const ended = await endLearningSessionInternal(db, updated, pubSubPort);
    return toResponse(db, ended);
  }

  return toResponse(db, updated);
}
