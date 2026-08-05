import type { Logger } from "@usavvy/service-kernel";
import type { DomainEvent, PubSubPort } from "./port.js";

export function createMockPubSubAdapter(logger: Logger): PubSubPort {
  return {
    async publish(event: DomainEvent): Promise<void> {
      logger.info("mock domain event published", { type: event.type, payload: event.payload });
    },
  };
}
