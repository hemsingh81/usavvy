import type { GenerationPort } from "./port.js";
import { createMockGenerationAdapter } from "./mock.js";

// Story 2.12 (FR-C-9). Only "mock" exists today — no real LLM/embedding provider is
// chosen or funded yet (ARCHITECTURE-SPINE.md Deferred). Matches jobqueue/factory.ts's
// shape so adding a real adapter later is a one-line switch-case addition.
export type GenerationAdapterName = "mock";

export function createGenerationAdapter(adapter: GenerationAdapterName): GenerationPort {
  switch (adapter) {
    case "mock":
      return createMockGenerationAdapter();
  }
}
