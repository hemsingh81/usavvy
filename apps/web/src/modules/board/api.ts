import {
  learningSessionResponseSchema,
  resumeLearningSessionResponseSchema,
  type BeatInput,
  type LearningSessionResponse,
  type ResumeLearningSessionResponse,
} from "@usavvy/shared-types";
import { apiRequest } from "../../shared/apiClient.js";

/**
 * Story 3.1 (FR-B-1). Thin wrappers over gateway's learning-sessions routes — the
 * mocked BoardPage.tsx journey (Epic 3 mock-first UX pass) is NOT rewired onto these
 * yet, per the story's own CRITICAL SCOPE NOTE; this module exists so the real backend
 * is reachable and testable ahead of that future rewiring story.
 */
export function createOrResumeLearningSession(apiUrl: string, accessToken: string, conceptId: string, beats: BeatInput[]): Promise<LearningSessionResponse> {
  return apiRequest(apiUrl, "/learning-sessions", learningSessionResponseSchema, { method: "POST", body: { conceptId, beats }, accessToken });
}

export function getLearningSession(apiUrl: string, accessToken: string, sessionId: string): Promise<LearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}`, learningSessionResponseSchema, { method: "GET", accessToken });
}

export function pauseLearningSession(
  apiUrl: string,
  accessToken: string,
  sessionId: string,
  input: { currentBeatId: string; narrationOffsetMs: number; boardRenderState: Record<string, unknown> },
): Promise<LearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/pause`, learningSessionResponseSchema, { method: "POST", body: input, accessToken });
}

export function resumeLearningSession(apiUrl: string, accessToken: string, sessionId: string): Promise<ResumeLearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/resume`, resumeLearningSessionResponseSchema, { method: "POST", accessToken });
}

/** Story 3.2 (FR-B-2). */
export function replayCurrentBeat(apiUrl: string, accessToken: string, sessionId: string): Promise<ResumeLearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/replay`, resumeLearningSessionResponseSchema, { method: "POST", accessToken });
}

/** Story 3.3 (FR-B-3). */
export function stepBack(apiUrl: string, accessToken: string, sessionId: string): Promise<ResumeLearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/back`, resumeLearningSessionResponseSchema, { method: "POST", accessToken });
}

/** Story 3.3 (FR-B-3). */
export function stepForward(apiUrl: string, accessToken: string, sessionId: string): Promise<ResumeLearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/forward`, resumeLearningSessionResponseSchema, { method: "POST", accessToken });
}

export function recordBeatReached(apiUrl: string, accessToken: string, sessionId: string, beatId: string): Promise<LearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/beats/${beatId}/reached`, learningSessionResponseSchema, { method: "POST", accessToken });
}

export function endLearningSession(apiUrl: string, accessToken: string, sessionId: string): Promise<LearningSessionResponse> {
  return apiRequest(apiUrl, `/learning-sessions/${sessionId}/end`, learningSessionResponseSchema, { method: "POST", accessToken });
}
