import { cleanRoom } from "@werstakoff/ai";
import { prisma } from "@werstakoff/db";
import { enqueueAiJob } from "@werstakoff/queue";
import { readPhoto, saveBuffer, setStatus, toDataUrl } from "../lib.js";

export async function processCleanRoom(projectId: string): Promise<void> {
  const original = await readPhoto(projectId, "original");
  const result = await cleanRoom({
    projectId,
    image: { type: "base64", data: toDataUrl(original.buffer, original.mime) },
    aspectRatio: "3:2",
  });

  const file = await saveBuffer(`projects/${projectId}`, result.buffer, result.mime, "jpg");
  await prisma.projectPhoto.deleteMany({ where: { projectId, kind: "cleaned" } });
  await prisma.projectPhoto.create({
    data: {
      projectId,
      kind: "cleaned",
      fileId: file.id,
      width: file.width,
      height: file.height,
    },
  });

  await setStatus(projectId, "dimensions");
  await enqueueAiJob({ type: "room-features", projectId });
}
