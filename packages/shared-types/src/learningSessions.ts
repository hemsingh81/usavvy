import { z } from "zod";

// Story 3.1 (FR-B-1). PRD §14's exact minimal Beat field list — caller-supplied at
// session-creation time, not generated here (see the story's CRITICAL SCOPE NOTE).
export const beatInputSchema = z.object({
  narration: z.string().min(1),
  boardAction: z.record(z.string(), z.unknown()),
  audioRef: z.string().optional(),
  sourceRef: z.string().optional(),
});

export type BeatInput = z.infer<typeof beatInputSchema>;

export const beatResponseSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  narration: z.string(),
  boardAction: z.record(z.string(), z.unknown()),
  audioRef: z.string().nullable(),
  sourceRef: z.string().nullable(),
});

export type BeatResponse = z.infer<typeof beatResponseSchema>;

export const createLearningSessionInputSchema = z.object({
  conceptId: z.string().min(1),
  beats: z.array(beatInputSchema).min(1),
});

export type CreateLearningSessionInput = z.infer<typeof createLearningSessionInputSchema>;

export const learningSessionResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  conceptId: z.string(),
  status: z.string(),
  currentBeatId: z.string().nullable(),
  narrationOffsetMs: z.number().int().nullable(),
  boardRenderState: z.record(z.string(), z.unknown()).nullable(),
  startedAt: z.string(),
  updatedAt: z.string(),
  endedAt: z.string().nullable(),
  beats: z.array(beatResponseSchema),
});

export type LearningSessionResponse = z.infer<typeof learningSessionResponseSchema>;

// Story 3.1, AC #1: the paused-state fields the client persists on Pause.
export const pauseLearningSessionInputSchema = z.object({
  currentBeatId: z.uuid(),
  narrationOffsetMs: z.number().int().nonnegative(),
  boardRenderState: z.record(z.string(), z.unknown()),
});

export type PauseLearningSessionInput = z.infer<typeof pauseLearningSessionInputSchema>;

// Story 3.1, AC #2: the paused state plus a new opaque stream reference to resume playback with.
export const resumeLearningSessionResponseSchema = learningSessionResponseSchema.extend({
  streamRef: z.string(),
});

export type ResumeLearningSessionResponse = z.infer<typeof resumeLearningSessionResponseSchema>;
