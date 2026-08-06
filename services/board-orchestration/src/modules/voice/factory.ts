import type { VoicePort } from "./port.js";
import { createMockVoiceAdapter } from "./mock.js";

// Only "mock" today — no real TTS/ASR provider has been chosen yet (Deferred in
// ARCHITECTURE-SPINE.md), matching PubSubAdapterName's identical single-case precedent.
export type VoiceAdapterName = "mock";

/** AD-1/AD-12: the one place the mock/real VoicePort binding is selected, driven by config rather than hardcoded at each call site. */
export function createVoiceAdapter(adapter: VoiceAdapterName): VoicePort {
  switch (adapter) {
    case "mock":
      return createMockVoiceAdapter();
  }
}
