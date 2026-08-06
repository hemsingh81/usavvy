export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/**
 * AD-15: any code that needs durable background work depends on this interface, never
 * on a concrete queue library.
 *
 * Story 2.9: `work()` is the first consumer-side method this port has ever needed —
 * Stories 2.7/2.8 only ever `enqueue`d jobs with nothing registered to process them.
 */
export interface JobQueuePort {
  enqueue(jobName: string, payload: Record<string, unknown>): Promise<string>;
  work(jobName: string, handler: JobHandler): Promise<void>;
}
