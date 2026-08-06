/**
 * AD-15: any code that needs durable background work depends on this interface, never
 * on a concrete queue library. Producer-only for now — nothing in this codebase
 * consumes a job yet; the first `work()`-style consumer lands with the first story that
 * actually needs one.
 */
export interface JobQueuePort {
  enqueue(jobName: string, payload: Record<string, unknown>): Promise<string>;
}
