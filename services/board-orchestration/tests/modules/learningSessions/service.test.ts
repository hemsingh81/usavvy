import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { createLogger } from "@usavvy/service-kernel";
import { createDb, type Db } from "../../../src/db/client.js";
import { beats, learningSessions, sessionEvents } from "../../../src/db/schema.js";
import { loadBoardOrchestrationConfig } from "../../../src/config.js";
import {
  createOrResumeLearningSession,
  endLearningSession,
  getLearningSession,
  pauseLearningSession,
  recordBeatReached,
  recordCheckpointAnswer,
  replayCurrentBeat,
  resumeLearningSession,
  stepBeat,
  type BeatInput,
} from "../../../src/modules/learningSessions/service.js";
import { createMockVoiceAdapter } from "../../../src/modules/voice/index.js";
import { createMockPubSubAdapter } from "../../../src/modules/pubsub/index.js";

const config = loadBoardOrchestrationConfig(process.env);
const sql = postgres(config.databaseUrl);
let db: Db;

const OWNER_ID = "test-owner-learning-sessions";

beforeAll(() => {
  db = createDb(sql);
});

afterEach(async () => {
  const sessions = await db.select({ id: learningSessions.id }).from(learningSessions).where(eq(learningSessions.userId, OWNER_ID));
  for (const session of sessions) {
    await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    await db.delete(beats).where(eq(beats.sessionId, session.id));
  }
  await db.delete(learningSessions).where(eq(learningSessions.userId, OWNER_ID));
});

afterAll(async () => {
  await sql.end();
});

function voicePort() {
  return createMockVoiceAdapter();
}

function pubSubPort() {
  const logger = createLogger("test");
  const port = createMockPubSubAdapter(logger);
  const published: { type: string; payload: Record<string, unknown> }[] = [];
  return {
    port: { publish: (event: { type: string; payload: Record<string, unknown> }) => { published.push(event); return port.publish(event); } },
    published,
  };
}

const SAMPLE_BEATS: BeatInput[] = [
  { narration: "First Beat narration.", boardAction: { kind: "write", text: "First" } },
  { narration: "Second Beat narration.", boardAction: { kind: "write", text: "Second" } },
];

describe("createOrResumeLearningSession", () => {
  it("creates a new session with its Beats in order, currentBeatId set to the first, and a 'started' event (AC #1)", async () => {
    const conceptId = randomUUID();

    const session = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);

    expect(session.status).toBe("active");
    expect(session.beats.map((b) => b.narration)).toEqual(["First Beat narration.", "Second Beat narration."]);
    expect(session.currentBeatId).toBe(session.beats[0]?.id);
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started"]);
  });

  it("returns the SAME session unchanged for a repeat call with the same (userId, conceptId) — AC #3's cross-day/cross-device reopen mechanism", async () => {
    const conceptId = randomUUID();
    const first = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);

    const second = await createOrResumeLearningSession(db, OWNER_ID, conceptId, [{ narration: "different beats entirely", boardAction: {} }]);

    expect(second.id).toBe(first.id);
    expect(second.beats.map((b) => b.narration)).toEqual(first.beats.map((b) => b.narration));
  });

  it("gives a different userId or conceptId its own independent session", async () => {
    const conceptId = randomUUID();
    const mine = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);
    const theirs = await createOrResumeLearningSession(db, "someone-else", conceptId, SAMPLE_BEATS);
    const otherConcept = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);

    expect(theirs.id).not.toBe(mine.id);
    expect(otherConcept.id).not.toBe(mine.id);

    await db.delete(sessionEvents).where(eq(sessionEvents.sessionId, theirs.id));
    await db.delete(beats).where(eq(beats.sessionId, theirs.id));
    await db.delete(learningSessions).where(eq(learningSessions.id, theirs.id));
  });

  it("rejects a session with zero Beats", async () => {
    await expect(createOrResumeLearningSession(db, OWNER_ID, randomUUID(), [])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  // Code review finding: the lookup had no status filter/ordering — once an ended
  // session and a fresh one both exist for the same (userId, conceptId) (the normal
  // "relearn this concept later" shape), an unordered/unfiltered SELECT could return
  // either one non-deterministically.
  it("ignores a prior ended session for the same (userId, conceptId) and returns the new active one (AC #3)", async () => {
    const conceptId = randomUUID();
    const { port } = pubSubPort();
    const first = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);
    await endLearningSession(db, OWNER_ID, first.id, port);

    const relearned = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);

    expect(relearned.id).not.toBe(first.id);
    expect(relearned.status).toBe("active");

    const again = await createOrResumeLearningSession(db, OWNER_ID, conceptId, [{ narration: "ignored", boardAction: {} }]);
    expect(again.id).toBe(relearned.id);
  });

  // Code review finding: createOrResumeLearningSession's idempotent lookup was a plain
  // SELECT-then-INSERT with no DB-level enforcement — two concurrent calls for a
  // brand-new (userId, conceptId) could both miss the SELECT and both INSERT. The
  // partial unique index (schema.ts) plus the unique-violation fallback in service.ts
  // should make both calls converge on the SAME session, with only one row in the DB.
  it("converges concurrent create-or-resume calls for a new (userId, conceptId) onto a single session", async () => {
    const conceptId = randomUUID();

    const [a, b] = await Promise.all([
      createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS),
      createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS),
    ]);

    expect(a.id).toBe(b.id);
    const rows = await db.select().from(learningSessions).where(and(eq(learningSessions.userId, OWNER_ID), eq(learningSessions.conceptId, conceptId)));
    expect(rows).toHaveLength(1);
  });
});

describe("pauseLearningSession", () => {
  it("persists all three paused-state fields plus a 'paused' event (AC #1)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;

    const paused = await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 4200, boardRenderState: { scrollY: 120 } });

    expect(paused).toMatchObject({ status: "paused", currentBeatId: beatId, narrationOffsetMs: 4200, boardRenderState: { scrollY: 120 } });
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "paused"]);
  });

  it("rejects a currentBeatId that belongs to a different session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const otherSession = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const foreignBeatId = otherSession.beats[0]?.id as string;

    await expect(
      pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: foreignBeatId, narrationOffsetMs: 0, boardRenderState: {} }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("404s for another learner's session, without leaking whether it exists", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;

    await expect(
      pauseLearningSession(db, "someone-else", session.id, { currentBeatId: beatId, narrationOffsetMs: 0, boardRenderState: {} }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  // Code review finding: pausing an already-ended session previously resurrected it
  // (status flipped back to "paused" while endedAt stayed set) — asserted directly
  // against the DB, not just the thrown error, since the bug was a silent write.
  it("rejects pausing an already-ended session, leaving it unchanged in the database", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    const { port } = pubSubPort();
    await endLearningSession(db, OWNER_ID, session.id, port);

    await expect(
      pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 999, boardRenderState: {} }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "ended", narrationOffsetMs: null });
    expect(row?.endedAt).not.toBeNull();
  });
});

describe("resumeLearningSession", () => {
  it("flips to 'active' and returns the paused state plus a streamRef on VoicePort success (AC #2)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 3000, boardRenderState: { x: 1 } });

    const resumed = await resumeLearningSession(db, OWNER_ID, session.id, voicePort());

    expect(resumed).toMatchObject({ status: "active", currentBeatId: beatId, narrationOffsetMs: 3000, boardRenderState: { x: 1 } });
    expect(resumed.streamRef).toEqual(expect.stringContaining(beatId));
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "paused", "resumed"]);
  });

  it("on VoicePort failure, throws VOICE_UNAVAILABLE and leaves the persisted paused state byte-for-byte unchanged (AC #4)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 5500, boardRenderState: { y: 2 } });
    const voice = voicePort();
    voice.failNext();

    await expect(resumeLearningSession(db, OWNER_ID, session.id, voice)).rejects.toMatchObject({ code: "VOICE_UNAVAILABLE", statusCode: 503 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "paused", currentBeatId: beatId, narrationOffsetMs: 5500, boardRenderState: { y: 2 } });
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "paused"]);
  });

  it("rejects resuming a session that's already 'active' (never paused)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);

    await expect(resumeLearningSession(db, OWNER_ID, session.id, voicePort())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects resuming a session that has already ended", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const { port } = pubSubPort();
    await endLearningSession(db, OWNER_ID, session.id, port);

    await expect(resumeLearningSession(db, OWNER_ID, session.id, voicePort())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  // Code review finding: the final "flip to active" write was unconditional on status,
  // so a concurrent end landing while VoicePort was in flight got silently reversed.
  // JS's single-threaded event loop lets this be simulated deterministically: the
  // "concurrent" end runs from inside the VoicePort call, strictly before resume's own
  // write, without needing real parallel connections.
  it("rejects with SESSION_STATE_CHANGED, and does not reverse an end that lands while VoicePort is in flight", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 700, boardRenderState: {} });
    const { port } = pubSubPort();
    const raceyVoicePort = {
      async reestablishStream(reachedBeatId: string, offset: number) {
        await endLearningSession(db, OWNER_ID, session.id, port);
        return { streamRef: `mock-stream-${reachedBeatId}-${offset}` };
      },
    };

    await expect(resumeLearningSession(db, OWNER_ID, session.id, raceyVoicePort)).rejects.toMatchObject({ code: "SESSION_STATE_CHANGED", statusCode: 409 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "ended" });
    expect(row?.endedAt).not.toBeNull();
  });
});

describe("replayCurrentBeat", () => {
  it("succeeds from 'active' status: resets narrationOffsetMs to 0, boardRenderState to null, returns a streamRef, records a 'replayed' event (AC #1)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;

    const replayed = await replayCurrentBeat(db, OWNER_ID, session.id, voicePort());

    expect(replayed).toMatchObject({ status: "active", currentBeatId: beatId, narrationOffsetMs: 0, boardRenderState: null });
    expect(replayed.streamRef).toEqual(expect.stringContaining(beatId));
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "replayed"]);
  });

  // The one behavior that actually distinguishes Replay from Resume — would fail if
  // replayCurrentBeat were accidentally implemented as a call to resumeLearningSession.
  it("succeeds from 'paused' status with a non-zero offset, resetting it to 0 rather than restoring the paused offset (AC #1)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 8000, boardRenderState: { scrollY: 99 } });

    const replayed = await replayCurrentBeat(db, OWNER_ID, session.id, voicePort());

    expect(replayed).toMatchObject({ status: "active", currentBeatId: beatId, narrationOffsetMs: 0, boardRenderState: null });
    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "active", narrationOffsetMs: 0 });
  });

  it("on VoicePort failure, throws VOICE_UNAVAILABLE and leaves the persisted state byte-for-byte unchanged", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 4400, boardRenderState: { z: 3 } });
    const voice = voicePort();
    voice.failNext();

    await expect(replayCurrentBeat(db, OWNER_ID, session.id, voice)).rejects.toMatchObject({ code: "VOICE_UNAVAILABLE", statusCode: 503 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "paused", currentBeatId: beatId, narrationOffsetMs: 4400, boardRenderState: { z: 3 } });
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "paused"]);
  });

  // Code review finding (post-implementation): resumeLearningSession's own test suite
  // (Story 3.1's code review) has a deterministic test that actually drives the
  // `!updated` -> SESSION_STATE_CHANGED branch by racing a concurrent end from inside
  // the mock VoicePort call; replayCurrentBeat's WHERE-clause guard had no equivalent,
  // leaving that branch unexercised. Mirrors that exact test shape.
  it("rejects with SESSION_STATE_CHANGED, and does not reverse an end that lands while VoicePort is in flight", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const beatId = session.beats[0]?.id as string;
    await pauseLearningSession(db, OWNER_ID, session.id, { currentBeatId: beatId, narrationOffsetMs: 700, boardRenderState: {} });
    const { port } = pubSubPort();
    const raceyVoicePort = {
      async reestablishStream(reachedBeatId: string, offset: number) {
        await endLearningSession(db, OWNER_ID, session.id, port);
        return { streamRef: `mock-stream-${reachedBeatId}-${offset}` };
      },
    };

    await expect(replayCurrentBeat(db, OWNER_ID, session.id, raceyVoicePort)).rejects.toMatchObject({ code: "SESSION_STATE_CHANGED", statusCode: 409 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "ended" });
    expect(row?.endedAt).not.toBeNull();
  });

  it("rejects replaying an already-ended session, leaving it unchanged in the database", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const { port } = pubSubPort();
    await endLearningSession(db, OWNER_ID, session.id, port);

    await expect(replayCurrentBeat(db, OWNER_ID, session.id, voicePort())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "ended" });
  });

  it("404s for another learner's session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);

    await expect(replayCurrentBeat(db, "someone-else", session.id, voicePort())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("stepBeat", () => {
  const THREE_BEATS: BeatInput[] = [
    { narration: "First Beat narration.", boardAction: { kind: "write", text: "First" } },
    { narration: "Second Beat narration.", boardAction: { kind: "write", text: "Second" } },
    { narration: "Third Beat narration.", boardAction: { kind: "write", text: "Third" } },
  ];

  it("back from the second Beat moves to the first, resets narrationOffsetMs/boardRenderState, returns a streamRef, records 'stepped_back' (AC #1)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const [firstBeatId, secondBeatId] = session.beats.map((b) => b.id);
    await recordBeatReached(db, OWNER_ID, session.id, secondBeatId as string, pubSubPort().port);

    const stepped = await stepBeat(db, OWNER_ID, session.id, "back", voicePort());

    expect(stepped).toMatchObject({ status: "active", currentBeatId: firstBeatId, narrationOffsetMs: 0, boardRenderState: null });
    expect(stepped.streamRef).toEqual(expect.stringContaining(firstBeatId as string));
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "stepped_back"]);
  });

  it("rejects back from the first Beat, leaving the session unchanged (AC #3's backend boundary)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const firstBeatId = session.beats[0]?.id as string;

    await expect(stepBeat(db, OWNER_ID, session.id, "back", voicePort())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ currentBeatId: firstBeatId, narrationOffsetMs: null });
  });

  it("forward from the first Beat moves to the second, records 'stepped_forward' (AC #2)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const secondBeatId = session.beats[1]?.id as string;

    const stepped = await stepBeat(db, OWNER_ID, session.id, "forward", voicePort());

    expect(stepped).toMatchObject({ status: "active", currentBeatId: secondBeatId, narrationOffsetMs: 0, boardRenderState: null });
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "stepped_forward"]);
  });

  it("rejects forward from the LAST Beat with NO_FURTHER_BEATS, and does NOT end the session (AC #4's boundary)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const lastBeatId = session.beats[2]?.id as string;
    await recordBeatReached(db, OWNER_ID, session.id, session.beats[1]?.id as string, pubSubPort().port);
    await stepBeat(db, OWNER_ID, session.id, "forward", voicePort());

    await expect(stepBeat(db, OWNER_ID, session.id, "forward", voicePort())).rejects.toMatchObject({ code: "NO_FURTHER_BEATS", statusCode: 404 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "active", currentBeatId: lastBeatId });
  });

  // Distinguishes stepBeat from recordBeatReached: manually navigating to the last Beat
  // is browsing, not "this Beat just finished" — must NOT auto-end (Story 3.1's AC #5
  // only fires from recordBeatReached).
  it("forward onto the last Beat succeeds and does NOT end the session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const lastBeatId = session.beats[2]?.id as string;
    await stepBeat(db, OWNER_ID, session.id, "forward", voicePort());

    const stepped = await stepBeat(db, OWNER_ID, session.id, "forward", voicePort());

    expect(stepped).toMatchObject({ status: "active", currentBeatId: lastBeatId });
  });

  it("on VoicePort failure, throws VOICE_UNAVAILABLE and leaves the persisted state byte-for-byte unchanged", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const firstBeatId = session.beats[0]?.id as string;
    const voice = voicePort();
    voice.failNext();

    await expect(stepBeat(db, OWNER_ID, session.id, "forward", voice)).rejects.toMatchObject({ code: "VOICE_UNAVAILABLE", statusCode: 503 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "active", currentBeatId: firstBeatId, narrationOffsetMs: null });
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started"]);
  });

  it("rejects stepping (both directions) on an already-ended session, leaving it unchanged", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const { port } = pubSubPort();
    await endLearningSession(db, OWNER_ID, session.id, port);

    await expect(stepBeat(db, OWNER_ID, session.id, "forward", voicePort())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(stepBeat(db, OWNER_ID, session.id, "back", voicePort())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "ended" });
  });

  it("rejects with SESSION_STATE_CHANGED, and does not reverse an end that lands while VoicePort is in flight", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);
    const { port } = pubSubPort();
    const raceyVoicePort = {
      async reestablishStream(beatId: string, offset: number) {
        await endLearningSession(db, OWNER_ID, session.id, port);
        return { streamRef: `mock-stream-${beatId}-${offset}` };
      },
    };

    await expect(stepBeat(db, OWNER_ID, session.id, "forward", raceyVoicePort)).rejects.toMatchObject({ code: "SESSION_STATE_CHANGED", statusCode: 409 });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row).toMatchObject({ status: "ended" });
    expect(row?.endedAt).not.toBeNull();
  });

  it("404s for another learner's session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), THREE_BEATS);

    await expect(stepBeat(db, "someone-else", session.id, "forward", voicePort())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("recordBeatReached", () => {
  it("reaching a non-last Beat just advances currentBeatId, without ending the session", async () => {
    const threeBeats: BeatInput[] = [...SAMPLE_BEATS, { narration: "Third Beat narration.", boardAction: { kind: "write", text: "Third" } }];
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), threeBeats);
    const { port, published } = pubSubPort();
    const secondBeatId = session.beats[1]?.id as string;

    const result = await recordBeatReached(db, OWNER_ID, session.id, secondBeatId, port);

    expect(result).toMatchObject({ status: "active", currentBeatId: secondBeatId });
    expect(published).toEqual([]);
  });

  it("reaching the LAST Beat auto-ends the session and publishes learning_session.ended exactly once (AC #5)", async () => {
    const conceptId = randomUUID();
    const session = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);
    const { port, published } = pubSubPort();
    const lastBeatId = session.beats[1]?.id as string;

    const result = await recordBeatReached(db, OWNER_ID, session.id, lastBeatId, port);

    expect(result).toMatchObject({ status: "ended", currentBeatId: lastBeatId });
    expect(published).toEqual([{ type: "learning_session.ended", payload: { sessionId: session.id, userId: OWNER_ID, conceptId } }]);
    const events = await db.select().from(sessionEvents).where(eq(sessionEvents.sessionId, session.id));
    expect(events.map((e) => e.type)).toEqual(["started", "ended"]);
  });

  it("rejects a beatId that doesn't belong to this session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const otherSession = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const { port } = pubSubPort();

    await expect(recordBeatReached(db, OWNER_ID, session.id, otherSession.beats[0]?.id as string, port)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  // Code review finding: recordBeatReached had no guard against an already-ended
  // session — a stray/late call could silently move currentBeatId on an immutable
  // record. Asserted directly against the DB that currentBeatId is untouched.
  it("rejects recording a reached Beat on an already-ended session, leaving currentBeatId unchanged", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const firstBeatId = session.beats[0]?.id as string;
    const secondBeatId = session.beats[1]?.id as string;
    const { port } = pubSubPort();
    await endLearningSession(db, OWNER_ID, session.id, port);

    await expect(recordBeatReached(db, OWNER_ID, session.id, secondBeatId, port)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row?.currentBeatId).toBe(firstBeatId);
  });
});

describe("endLearningSession", () => {
  it("publishes learning_session.ended with the right payload (AC #5)", async () => {
    const conceptId = randomUUID();
    const session = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS);
    const { port, published } = pubSubPort();

    const ended = await endLearningSession(db, OWNER_ID, session.id, port);

    expect(ended.status).toBe("ended");
    expect(published).toEqual([{ type: "learning_session.ended", payload: { sessionId: session.id, userId: OWNER_ID, conceptId } }]);
  });

  it("is a safe no-op when called twice — only one 'ended' event and one publish call", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const { port, published } = pubSubPort();

    await endLearningSession(db, OWNER_ID, session.id, port);
    await endLearningSession(db, OWNER_ID, session.id, port);

    expect(published).toHaveLength(1);
    const events = await db.select().from(sessionEvents).where(and(eq(sessionEvents.sessionId, session.id), eq(sessionEvents.type, "ended")));
    expect(events).toHaveLength(1);
  });
});

describe("getLearningSession", () => {
  it("404s for another learner's session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);

    await expect(getLearningSession(db, "someone-else", session.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("recordCheckpointAnswer", () => {
  const SAMPLE_QUESTIONS = [
    { question: "What stops recursion?", options: ["A base case", "A loop"], correctIndex: 0 },
    { question: "What builds the call stack?", options: ["Pending calls", "Nothing"], correctIndex: 0 },
  ];

  // Code review finding: the original version had no locking around the
  // read-merge-write, so two DIFFERENT questions submitted at the exact same instant
  // could each read the same starting array and overwrite each other — a genuine lost
  // update. `SELECT ... FOR UPDATE` inside a transaction should serialize these.
  it("does not lose either answer when two different questions are submitted concurrently", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port } = pubSubPort();

    await Promise.all([
      recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port),
      recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 1, selectedOptionIndex: 1, isCorrect: false }, port),
    ]);

    const [row] = await db.select().from(learningSessions).where(eq(learningSessions.id, session.id));
    expect(row?.checkpointAnswers).toHaveLength(2);
    expect(row?.checkpointAnswers).toEqual(
      expect.arrayContaining([
        { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true },
        { questionIndex: 1, selectedOptionIndex: 1, isCorrect: false },
      ]),
    );
  });

  it("records an answer and returns it in the response (AC #2)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port } = pubSubPort();

    const result = await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port);

    expect(result.checkpointAnswers).toEqual([{ questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }]);
    const events = await db.select().from(sessionEvents).where(and(eq(sessionEvents.sessionId, session.id), eq(sessionEvents.type, "checkpoint_answered")));
    expect(events).toHaveLength(1);
  });

  it("publishes concept.checkpoint_completed exactly once, with every result, once the last question is answered (AC #3)", async () => {
    const conceptId = randomUUID();
    const session = await createOrResumeLearningSession(db, OWNER_ID, conceptId, SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port, published } = pubSubPort();

    await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port);
    expect(published).toEqual([]);
    await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 1, selectedOptionIndex: 1, isCorrect: false }, port);

    expect(published).toEqual([
      {
        type: "concept.checkpoint_completed",
        payload: {
          sessionId: session.id,
          userId: OWNER_ID,
          conceptId,
          results: [
            { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true },
            { questionIndex: 1, selectedOptionIndex: 1, isCorrect: false },
          ],
        },
      },
    ]);
  });

  it("re-submitting an already-answered question overwrites it without re-publishing completion (code-review-lesson-applied-up-front)", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port, published } = pubSubPort();
    await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port);
    await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 1, selectedOptionIndex: 1, isCorrect: false }, port);
    expect(published).toHaveLength(1);

    const result = await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 1, selectedOptionIndex: 0, isCorrect: true }, port);

    expect(result.checkpointAnswers).toEqual([
      { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true },
      { questionIndex: 1, selectedOptionIndex: 0, isCorrect: true },
    ]);
    expect(published).toHaveLength(1);
  });

  it("a partially-answered checkpoint's response contains exactly the answered subset, proving AC #4's resume mechanism has what it needs", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port } = pubSubPort();

    await recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port);
    const fetched = await getLearningSession(db, OWNER_ID, session.id);

    expect(fetched.checkpointQuestions).toEqual(SAMPLE_QUESTIONS);
    expect(fetched.checkpointAnswers).toEqual([{ questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }]);
  });

  it("rejects an out-of-range questionIndex", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port } = pubSubPort();

    await expect(
      recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 5, selectedOptionIndex: 0, isCorrect: true }, port),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects when the session has no checkpoint questions", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS);
    const { port } = pubSubPort();

    await expect(
      recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects on an already-ended session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port } = pubSubPort();
    await endLearningSession(db, OWNER_ID, session.id, port);

    await expect(
      recordCheckpointAnswer(db, OWNER_ID, session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("404s for another learner's session", async () => {
    const session = await createOrResumeLearningSession(db, OWNER_ID, randomUUID(), SAMPLE_BEATS, SAMPLE_QUESTIONS);
    const { port } = pubSubPort();

    await expect(
      recordCheckpointAnswer(db, "someone-else", session.id, { questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }, port),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
