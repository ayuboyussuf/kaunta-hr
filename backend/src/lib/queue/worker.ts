/**
 * Inline BullMQ worker. Started from index.ts when REDIS_URL is set, so the free
 * Render web process both serves requests and drains the queues. No-op without
 * Redis (jobs then run inline at enqueue time instead).
 */
import { Worker } from "bullmq";
import { processors, newConnection, redisEnabled, type QueueName } from "./index";

let started = false;

export function startWorkers(): void {
  if (started || !redisEnabled()) return;
  started = true;
  const names = Object.keys(processors) as QueueName[];
  for (const name of names) {
    const worker = new Worker(
      name,
      async (job) => {
        await (processors[name] as (d: unknown) => Promise<void>)(job.data);
      },
      { connection: newConnection(), concurrency: 3 }
    );
    worker.on("failed", (job, err) => {
      console.error(`[queue:${name}] job ${job?.id} failed:`, err?.message);
    });
  }
  console.log(`[queue] workers started: ${names.join(", ")}`);
}
