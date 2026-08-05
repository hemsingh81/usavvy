import type { Logger } from "@usavvy/service-kernel";
import type { PubSubPort } from "./port.js";
import { createMockPubSubAdapter } from "./mock.js";

export type PubSubAdapterName = "mock";

/**
 * AD-1/AD-12: the one place the mock/real PubSubPort binding is selected, driven by
 * config rather than hardcoded at each call site.
 */
export function createPubSubAdapter(adapter: PubSubAdapterName, logger: Logger): PubSubPort {
  switch (adapter) {
    case "mock":
      return createMockPubSubAdapter(logger);
  }
}
