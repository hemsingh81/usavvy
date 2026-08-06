import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createOrResumeLearningSession,
  endLearningSession,
  getLearningSession,
  pauseLearningSession,
  recordBeatReached,
  replayCurrentBeat,
  resumeLearningSession,
} from "../../../src/modules/board/api.js";

const SESSION = {
  id: "session-1",
  userId: "user-1",
  conceptId: "concept-1",
  status: "active",
  currentBeatId: "beat-1",
  narrationOffsetMs: 0,
  boardRenderState: null,
  startedAt: "2026-01-15T00:00:00.000Z",
  updatedAt: "2026-01-15T00:00:00.000Z",
  endedAt: null,
  beats: [{ id: "beat-1", position: 0, narration: "First Beat.", boardAction: { kind: "write" }, audioRef: null, sourceRef: null }],
};

describe("board api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("createOrResumeLearningSession posts conceptId and beats", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(SESSION) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await createOrResumeLearningSession("http://localhost:3000", "a-token", "concept-1", [
      { narration: "First Beat.", boardAction: { kind: "write" } },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/learning-sessions",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ conceptId: "concept-1", beats: [{ narration: "First Beat.", boardAction: { kind: "write" } }] }) }),
    );
    expect(result).toEqual(SESSION);
  });

  it("getLearningSession fetches GET /learning-sessions/:id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(SESSION) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await getLearningSession("http://localhost:3000", "a-token", "session-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/learning-sessions/session-1", expect.objectContaining({ method: "GET" }));
    expect(result).toEqual(SESSION);
  });

  it("pauseLearningSession posts the paused-state fields", async () => {
    const paused = { ...SESSION, status: "paused", narrationOffsetMs: 1200 };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(paused) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const input = { currentBeatId: "beat-1", narrationOffsetMs: 1200, boardRenderState: { scrollTop: 10 } };
    const result = await pauseLearningSession("http://localhost:3000", "a-token", "session-1", input);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/learning-sessions/session-1/pause",
      expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
    );
    expect(result).toEqual(paused);
  });

  it("resumeLearningSession posts with no body and returns the streamRef", async () => {
    const resumed = { ...SESSION, streamRef: "stream-1" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(resumed) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await resumeLearningSession("http://localhost:3000", "a-token", "session-1");

    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions.method).toBe("POST");
    expect(callOptions).not.toHaveProperty("body");
    expect(result).toEqual(resumed);
  });

  it("replayCurrentBeat posts with no body and returns the streamRef", async () => {
    const replayed = { ...SESSION, narrationOffsetMs: 0, boardRenderState: null, streamRef: "stream-2" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(replayed) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await replayCurrentBeat("http://localhost:3000", "a-token", "session-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/learning-sessions/session-1/replay", expect.objectContaining({ method: "POST" }));
    const [, callOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(callOptions).not.toHaveProperty("body");
    expect(result).toEqual(replayed);
  });

  it("recordBeatReached posts to the beat's reached endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(SESSION) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await recordBeatReached("http://localhost:3000", "a-token", "session-1", "beat-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/learning-sessions/session-1/beats/beat-1/reached", expect.objectContaining({ method: "POST" }));
  });

  it("endLearningSession posts to the end endpoint", async () => {
    const ended = { ...SESSION, status: "ended", endedAt: "2026-01-15T00:10:00.000Z" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(ended) } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await endLearningSession("http://localhost:3000", "a-token", "session-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3000/learning-sessions/session-1/end", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(ended);
  });
});
