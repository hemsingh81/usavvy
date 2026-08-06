import type { VoicePort } from "./port.js";

export interface MockVoicePort extends VoicePort {
  /** Story 3.1 (FR-B-1), AC #4: makes the NEXT `reestablishStream` call reject once, simulating a VoicePort outage, then auto-resets — tests don't need a real TTS provider to exercise the Resume-failure path. */
  failNext(): void;
}

/** In-memory VoicePort for tests/dev — returns a fake opaque stream reference, never touches a real TTS provider. */
export function createMockVoiceAdapter(): MockVoicePort {
  let shouldFailNext = false;
  let streamIdCounter = 0;

  return {
    failNext() {
      shouldFailNext = true;
    },
    async reestablishStream(beatId, narrationOffsetMs) {
      if (shouldFailNext) {
        shouldFailNext = false;
        throw new Error("mock VoicePort: stream reestablishment failed");
      }
      streamIdCounter += 1;
      return { streamRef: `mock-stream-${beatId}-${narrationOffsetMs}-${streamIdCounter}` };
    },
  };
}
