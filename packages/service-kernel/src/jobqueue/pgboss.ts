import { PgBoss } from "pg-boss";
import type { Logger } from "../logger.js";
import type { JobQueuePort } from "./port.js";

/**
 * AD-15's dev/default adapter — pg-boss, Postgres-native, no extra infra beyond the
 * database already running (Stack table). `start()` must resolve before `enqueue` is
 * ever called; `createPgBossJobQueueAdapter` does that once at boot, matching the
 * async-factory shape `createJobQueueAdapter` exposes.
 */
export async function createPgBossJobQueueAdapter(databaseUrl: string, logger: Logger): Promise<JobQueuePort> {
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (error: Error) => logger.error("job queue error", { reason: error.message }));
  await boss.start();

  return {
    async enqueue(jobName, payload) {
      const jobId = await boss.send(jobName, payload);
      if (!jobId) {
        throw new Error(`job queue failed to enqueue job "${jobName}"`);
      }
      return jobId;
    },
  };
}
