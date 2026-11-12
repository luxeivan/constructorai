import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { AI_QUEUE, projectChannel, type AiJobPayload, type ProjectEvent } from "@werstakoff/core";

export function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://localhost:6379";
}

export function createRedis(): Redis {
  return new Redis(redisUrl(), { maxRetriesPerRequest: null });
}

let queue: Queue<AiJobPayload> | null = null;
let publisher: Redis | null = null;

export function aiQueue(): Queue<AiJobPayload> {
  if (!queue) {
    queue = new Queue<AiJobPayload>(AI_QUEUE, { connection: createRedis() });
  }
  return queue;
}

export async function enqueueAiJob(payload: AiJobPayload): Promise<string> {
  const job = await aiQueue().add(payload.type, payload, {
    attempts: 1,
    removeOnComplete: 200,
    removeOnFail: 200,
  });
  return job.id ?? "";
}

export async function publishProjectEvent(projectId: string, event: ProjectEvent): Promise<void> {
  if (!publisher) publisher = createRedis();
  await publisher.publish(projectChannel(projectId), JSON.stringify(event));
}

export function createSubscriber(): Redis {
  return createRedis();
}

export async function closeQueue(): Promise<void> {
  await queue?.close();
  queue = null;
  if (publisher) {
    await publisher.quit();
    publisher = null;
  }
}
