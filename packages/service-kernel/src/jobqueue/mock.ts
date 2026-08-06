import type { JobQueuePort } from "./port.js";

export interface EnqueuedJob {
  jobName: string;
  payload: Record<string, unknown>;
}

export interface MockJobQueuePort extends JobQueuePort {
  enqueuedJobs: EnqueuedJob[];
}

/** In-memory JobQueuePort for tests — records enqueued jobs, never touches Postgres. */
export function createMockJobQueueAdapter(): MockJobQueuePort {
  const enqueuedJobs: EnqueuedJob[] = [];
  let jobIdCounter = 0;

  return {
    enqueuedJobs,
    async enqueue(jobName, payload) {
      enqueuedJobs.push({ jobName, payload });
      jobIdCounter += 1;
      return `mock-job-${jobIdCounter}`;
    },
  };
}
