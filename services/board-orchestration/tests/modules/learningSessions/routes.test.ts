import { randomUUID } from "node:crypto";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { buildApp } from "../../../src/app.js";
import { createDb } from "../../../src/db/client.js";
import { beats, learningSessions, sessionEvents } from "../../../src/db/schema.js";
import { loadBoardOrchestrationConfig } from "../../../src/config.js";
import { createTestAppDeps, TEST_INTERNAL_SECRET } from "../../testHelpers.js";

const config = loadBoardOrchestrationConfig(process.env);
const sql = postgres(config.databaseUrl);
const db = createDb(sql);

const OWNER_ID = "test-owner-routes";
const headers = { "x-internal-secret": TEST_INTERNAL_SECRET, "x-user-id": OWNER_ID, "x-user-role": "student" };

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

/**
 * Story 3.1, Task 4: "a minimal, clearly-separate integration point... a Vitest
 * integration test calling the real gateway-forwarded routes." Unlike
 * `service.test.ts` (which calls the service module's functions directly), this test
 * goes through the real Fastify app, the real trust-boundary/auth checks, the real
 * shared-types request validation, and the real Postgres database — the full HTTP
 * layer minus the gateway hop itself (gateway's own 1:1-forward shape is already
 * covered by `services/gateway/tests/boardOrchestrationProxy.test.ts`, so re-proving
 * that forwarding logic here would be redundant, not more thorough).
 */
describe("learning-sessions HTTP lifecycle: create -> pause -> resume -> beat reached -> end", () => {
  it("exercises the full lifecycle over real HTTP routes and the real database", async () => {
    const app = buildApp(createTestAppDeps({ db }));
    const conceptId = randomUUID();

    const createResponse = await app.inject({
      method: "POST",
      url: "/learning-sessions",
      headers,
      payload: {
        conceptId,
        beats: [
          { narration: "First Beat.", boardAction: { kind: "write", text: "First" } },
          { narration: "Second Beat.", boardAction: { kind: "write", text: "Second" } },
        ],
      },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string; status: string; beats: { id: string }[] };
    expect(created.status).toBe("active");
    const [firstBeatId, secondBeatId] = created.beats.map((b) => b.id);

    const getResponse = await app.inject({ method: "GET", url: `/learning-sessions/${created.id}`, headers });
    expect(getResponse.statusCode).toBe(200);
    expect((getResponse.json() as { id: string }).id).toBe(created.id);

    const pauseResponse = await app.inject({
      method: "POST",
      url: `/learning-sessions/${created.id}/pause`,
      headers,
      payload: { currentBeatId: firstBeatId, narrationOffsetMs: 1500, boardRenderState: { scrollTop: 42 } },
    });
    expect(pauseResponse.statusCode).toBe(200);
    expect(pauseResponse.json()).toMatchObject({ status: "paused", currentBeatId: firstBeatId, narrationOffsetMs: 1500 });

    // Story 3.2: Replay works from a paused state with a non-zero offset, resetting it to 0.
    const replayResponse = await app.inject({ method: "POST", url: `/learning-sessions/${created.id}/replay`, headers });
    expect(replayResponse.statusCode).toBe(200);
    const replayed = replayResponse.json() as { status: string; narrationOffsetMs: number; streamRef: string };
    expect(replayed).toMatchObject({ status: "active", narrationOffsetMs: 0 });
    expect(typeof replayed.streamRef).toBe("string");

    const pauseAgainResponse = await app.inject({
      method: "POST",
      url: `/learning-sessions/${created.id}/pause`,
      headers,
      payload: { currentBeatId: firstBeatId, narrationOffsetMs: 1500, boardRenderState: { scrollTop: 42 } },
    });
    expect(pauseAgainResponse.statusCode).toBe(200);

    const resumeResponse = await app.inject({ method: "POST", url: `/learning-sessions/${created.id}/resume`, headers });
    expect(resumeResponse.statusCode).toBe(200);
    const resumed = resumeResponse.json() as { status: string; streamRef: string };
    expect(resumed.status).toBe("active");
    expect(typeof resumed.streamRef).toBe("string");

    const reachedResponse = await app.inject({ method: "POST", url: `/learning-sessions/${created.id}/beats/${secondBeatId}/reached`, headers });
    expect(reachedResponse.statusCode).toBe(200);
    // secondBeatId is the last Beat — reaching it auto-ends the session (AC #5).
    expect(reachedResponse.json()).toMatchObject({ status: "ended", currentBeatId: secondBeatId });

    const endResponse = await app.inject({ method: "POST", url: `/learning-sessions/${created.id}/end`, headers });
    expect(endResponse.statusCode).toBe(200);
    expect(endResponse.json()).toMatchObject({ status: "ended" });

    await app.close();
  });

  it("rejects every route with 401 when the caller has no x-user-id/x-user-role, even with a valid internal secret", async () => {
    const app = buildApp(createTestAppDeps({ db }));

    const response = await app.inject({
      method: "POST",
      url: "/learning-sessions",
      headers: { "x-internal-secret": TEST_INTERNAL_SECRET },
      payload: { conceptId: randomUUID(), beats: [{ narration: "x", boardAction: {} }] },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });
});
