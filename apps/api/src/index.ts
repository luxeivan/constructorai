import { createApp } from "./app.js";
import { env } from "./env.js";
import { ensureBucket } from "@werstakoff/storage";
import { prisma } from "@werstakoff/db";
import { closeQueue } from "@werstakoff/queue";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`API слушает порт ${env.PORT}`);
});

ensureBucket()
  .then(() => console.log("MinIO bucket готов"))
  .catch((error) => console.error("MinIO недоступен:", error));

async function shutdown(signal: string) {
  console.log(`Получен ${signal}, останавливаемся...`);
  server.close();
  await closeQueue();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
