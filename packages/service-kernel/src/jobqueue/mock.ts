import type { JobHandler, JobQueuePort } from "./port.js";

export interface EnqueuedJob {
  jobName: string;
  payload: Record<string, unknown>;
}

export interface MockJobQueuePort extends JobQueuePort {
  enqueuedJobs: EnqueuedJob[];
  /** Story 2.9: manually invokes a registered handler — tests don't need a real pg-boss instance to exercise a `work()` consumer. */
  trigger(jobName: string, payload: Record<string, unknown>): Promise<void>;
}

/** In-memory JobQueuePort for tests — records enqueued jobs, never touches Postgres. */
export function createMockJobQueueAdapter(): MockJobQueuePort {
  const enqueuedJobs: EnqueuedJob[] = [];
  const handlers = new Map<string, JobHandler>();
  let jobIdCounter = 0;

  return {
    enqueuedJobs,
    async enqueue(jobName, payload) {
      enqueuedJobs.push({ jobName, payload });
      jobIdCounter += 1;
      return `mock-job-${jobIdCounter}`;
    },
    async work(jobName, handler) {
      handlers.set(jobName, handler);
    },
    async trigger(jobName, payload) {
      const handler = handlers.get(jobName);
      if (!handler) {
        throw new Error(`no handler registered for job "${jobName}" — call work() first`);
      }
      await handler(payload);
    },
  };
}
