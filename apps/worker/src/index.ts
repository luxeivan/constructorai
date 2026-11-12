import { Worker, type Job } from "bullmq";
import { AI_QUEUE, type AiJobPayload } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { createRedis } from "@werstakoff/queue";
import { failProject } from "./lib.js";
import { processValidatePhoto } from "./processors/validatePhoto.js";
import { processCleanRoom } from "./processors/cleanRoom.js";
import { processRoomFeatures } from "./processors/roomFeatures.js";
import { processSelect } from "./processors/select.js";
import { processRender } from "./processors/render.js";
import { processCorrect } from "./processors/correct.js";
import { processFinalize } from "./processors/finalize.js";
import { processImportCatalog } from "./processors/importCatalog.js";
import { processRetention } from "./processors/retention.js";

async function run(payload: AiJobPayload): Promise<void> {
  switch (payload.type) {
    case "validate-photo":
      await processValidatePhoto(payload.projectId);
      break;
    case "clean-room":
      await processCleanRoom(payload.projectId);
      break;
    case "room-features":
      await processRoomFeatures(payload.projectId);
      break;
    case "select":
      await processSelect(payload.projectId);
      break;
    case "render":
      await processRender(payload);
      break;
    case "correct":
      await processCorrect(payload);
      break;
    case "finalize":
      await processFinalize(payload);
      break;
    case "import-catalog":
      await processImportCatalog(payload.options);
      break;
    case "retention":
      await processRetention();
      break;
    default: {
      const exhaustive: never = payload;
      throw new Error(`Неизвестный тип задачи: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function handle(job: Job<AiJobPayload>): Promise<void> {
  const payload = job.data;
  console.log(`[job ${job.id}] ${payload.type}`);
  const record = await prisma.aiJob.create({
    data: {
      projectId: "projectId" in payload ? payload.projectId : null,
      type: payload.type,
      status: "running",
      attempts: job.attemptsMade + 1,
      payloadJson: payload as unknown as object,
    },
  });

  try {
    await run(payload);
    await prisma.aiJob.update({ where: { id: record.id }, data: { status: "done", finishedAt: new Date() } });
  } catch (error) {
    await prisma.aiJob.update({
      where: { id: record.id },
      data: {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

const worker = new Worker<AiJobPayload>(AI_QUEUE, handle, {
  connection: createRedis(),
  concurrency: 1,
  lockDuration: 600_000,
});

worker.on("completed", (job) => {
  console.log(`[job ${job.id}] готово`);
});

worker.on("failed", async (job, error) => {
  console.error(`[job ${job?.id}] ошибка:`, error.message);
  const payload = job?.data;
  if (payload && "projectId" in payload && payload.projectId) {
    await failProject(payload.projectId, error);
  }
});

console.log("Worker запущен, очередь:", AI_QUEUE);

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  void processRetention().catch((error: unknown) => console.error("[retention] ошибка:", error));
}, RETENTION_INTERVAL_MS).unref();

async function shutdown(signal: string) {
  console.log(`Получен ${signal}, останавливаемся...`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
