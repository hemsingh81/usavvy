export interface DomainEvent {
  // Past-tense per the Consistency Conventions' own naming rule, e.g.
  // "user.deletion_requested" (matching the spine's own examples concept.mastered,
  // beat.played).
  type: string;
  payload: Record<string, unknown>;
}

/**
 * AD-1/AD-13: any code that needs to announce a state change other services may depend
 * on depends on this interface, never a concrete pub/sub client. The mock binding is
 * the default until a real subscriber exists to receive it — swapping in a real
 * Redis-backed adapter is a config change (AD-12), not a call-site change.
 */
export interface PubSubPort {
  publish(event: DomainEvent): Promise<void>;
}
