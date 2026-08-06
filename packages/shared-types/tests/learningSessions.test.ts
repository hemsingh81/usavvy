import { describe, expect, it } from "vitest";
import {
  beatInputSchema,
  createLearningSessionInputSchema,
  learningSessionResponseSchema,
  pauseLearningSessionInputSchema,
  recordCheckpointAnswerInputSchema,
  resumeLearningSessionResponseSchema,
} from "../src/learningSessions.js";

describe("beatInputSchema", () => {
  it("accepts a Beat with only the required fields", () => {
    expect(() => beatInputSchema.parse({ narration: "Recursion is...", boardAction: { kind: "write", text: "Recursion" } })).not.toThrow();
  });

  it("accepts a Beat with optional audioRef/sourceRef", () => {
    expect(() =>
      beatInputSchema.parse({
        narration: "Recursion is...",
        boardAction: { kind: "write", text: "Recursion" },
        audioRef: "audio-1",
        sourceRef: "source-1",
      }),
    ).not.toThrow();
  });

  it("rejects an empty narration", () => {
    expect(() => beatInputSchema.parse({ narration: "", boardAction: {} })).toThrow();
  });
});

describe("createLearningSessionInputSchema", () => {
  it("accepts a conceptId with at least one Beat", () => {
    expect(() =>
      createLearningSessionInputSchema.parse({
        conceptId: "concept-1",
        beats: [{ narration: "First Beat.", boardAction: { kind: "write", text: "First" } }],
      }),
    ).not.toThrow();
  });

  it("rejects an empty beats array", () => {
    expect(() => createLearningSessionInputSchema.parse({ conceptId: "concept-1", beats: [] })).toThrow();
  });

  it("accepts an optional checkpointQuestions array (Story 3.13)", () => {
    expect(() =>
      createLearningSessionInputSchema.parse({
        conceptId: "concept-1",
        beats: [{ narration: "First Beat.", boardAction: { kind: "write" } }],
        checkpointQuestions: [{ question: "What stops recursion?", options: ["A base case"], correctIndex: 0 }],
      }),
    ).not.toThrow();
  });
});

describe("learningSessionResponseSchema", () => {
  it("accepts a fully-populated active session with beats", () => {
    expect(() =>
      learningSessionResponseSchema.parse({
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
        beats: [
          { id: "beat-1", position: 0, narration: "First Beat.", boardAction: { kind: "write" }, audioRef: null, sourceRef: null },
        ],
        checkpointQuestions: null,
        checkpointAnswers: null,
      }),
    ).not.toThrow();
  });

  it("accepts checkpointQuestions/checkpointAnswers populated (Story 3.13)", () => {
    expect(() =>
      learningSessionResponseSchema.parse({
        id: "session-1",
        userId: "user-1",
        conceptId: "concept-1",
        status: "ended",
        currentBeatId: "beat-1",
        narrationOffsetMs: 0,
        boardRenderState: null,
        startedAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
        endedAt: "2026-01-15T00:10:00.000Z",
        beats: [],
        checkpointQuestions: [{ question: "What stops recursion?", options: ["A base case"], correctIndex: 0 }],
        checkpointAnswers: [{ questionIndex: 0, selectedOptionIndex: 0, isCorrect: true }],
      }),
    ).not.toThrow();
  });

  it("rejects a session missing status", () => {
    expect(() =>
      learningSessionResponseSchema.parse({
        id: "session-1",
        userId: "user-1",
        conceptId: "concept-1",
        currentBeatId: null,
        narrationOffsetMs: null,
        boardRenderState: null,
        startedAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
        endedAt: null,
        beats: [],
      }),
    ).toThrow();
  });
});

describe("pauseLearningSessionInputSchema", () => {
  it("accepts a valid pause payload", () => {
    expect(() =>
      pauseLearningSessionInputSchema.parse({
        currentBeatId: "019fd450-b7cb-7a32-b021-42788045c71f",
        narrationOffsetMs: 1200,
        boardRenderState: { scrollTop: 100 },
      }),
    ).not.toThrow();
  });

  it("rejects a non-UUID currentBeatId", () => {
    expect(() =>
      pauseLearningSessionInputSchema.parse({ currentBeatId: "not-a-uuid", narrationOffsetMs: 0, boardRenderState: {} }),
    ).toThrow();
  });

  it("rejects a negative narrationOffsetMs", () => {
    expect(() =>
      pauseLearningSessionInputSchema.parse({
        currentBeatId: "019fd450-b7cb-7a32-b021-42788045c71f",
        narrationOffsetMs: -1,
        boardRenderState: {},
      }),
    ).toThrow();
  });
});

describe("resumeLearningSessionResponseSchema", () => {
  it("accepts a learningSessionResponse extended with a streamRef", () => {
    expect(() =>
      resumeLearningSessionResponseSchema.parse({
        id: "session-1",
        userId: "user-1",
        conceptId: "concept-1",
        status: "active",
        currentBeatId: "beat-1",
        narrationOffsetMs: 1200,
        boardRenderState: null,
        startedAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
        endedAt: null,
        beats: [],
        checkpointQuestions: null,
        checkpointAnswers: null,
        streamRef: "stream-1",
      }),
    ).not.toThrow();
  });

  it("rejects a response missing streamRef", () => {
    expect(() =>
      resumeLearningSessionResponseSchema.parse({
        id: "session-1",
        userId: "user-1",
        conceptId: "concept-1",
        status: "active",
        currentBeatId: null,
        narrationOffsetMs: null,
        boardRenderState: null,
        startedAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
        endedAt: null,
        beats: [],
      }),
    ).toThrow();
  });
});

describe("recordCheckpointAnswerInputSchema", () => {
  it("accepts a valid answer payload", () => {
    expect(() => recordCheckpointAnswerInputSchema.parse({ questionIndex: 0, selectedOptionIndex: 1, isCorrect: false })).not.toThrow();
  });

  it("rejects a negative questionIndex", () => {
    expect(() => recordCheckpointAnswerInputSchema.parse({ questionIndex: -1, selectedOptionIndex: 0, isCorrect: true })).toThrow();
  });

  it("rejects a missing isCorrect", () => {
    expect(() => recordCheckpointAnswerInputSchema.parse({ questionIndex: 0, selectedOptionIndex: 0 })).toThrow();
  });
});
