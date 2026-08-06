/**
 * Story 3.1 (FR-B-1), AD-1/AD-2/AD-3/AD-4. This story's first, and today only,
 * consumer of `VoicePort` — lives here in `board-orchestration`, not in
 * `packages/service-kernel` or a scaffolded `services/voice`, since neither exists yet
 * for a first real caller to justify (mirrors `GenerationPort`'s own "lives inside its
 * first consumer" precedent, `services/ingestion/src/modules/generation/port.ts`).
 *
 * Deliberately minimal: real narration audio streaming (AD-5's WebSocket channel with
 * word-level timing) is out of scope for this story — no real TTS/ASR provider is
 * chosen yet (ARCHITECTURE-SPINE.md's own Deferred section). This is just enough
 * surface for AC #4's "VoicePort error on Resume" behavior to be real and testable:
 * re-establishing playback for an already-generated Beat at a given narration offset,
 * not generating new narration.
 */
export interface VoicePort {
  reestablishStream(beatId: string, narrationOffsetMs: number): Promise<{ streamRef: string }>;
}
