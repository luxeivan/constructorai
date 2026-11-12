import { extractRoomFeatures } from "@werstakoff/ai";
import { prisma } from "@werstakoff/db";
import { publishProjectEvent } from "@werstakoff/queue";
import { readPhoto, smallJpeg, toDataUrl } from "../lib.js";

export async function processRoomFeatures(projectId: string): Promise<void> {
  const cleaned = await readPhoto(projectId, "cleaned");
  const small = await smallJpeg(cleaned.buffer, 900);
  const features = await extractRoomFeatures({
    projectId,
    image: { type: "base64", data: toDataUrl(small.buffer, small.mime) },
  });

  const room = await prisma.projectRoom.findUnique({ where: { projectId } });
  const existing = (room?.featuresJson as Record<string, unknown> | null) ?? {};

  await prisma.projectRoom.upsert({
    where: { projectId },
    update: {
      hasWindow: features.hasWindow,
      hasDoor: features.hasDoor,
      featuresJson: {
        ...existing,
        features,
        ranges: {
          ...(existing.ranges as Record<string, unknown> | undefined),
          wallLength: features.wallLengthRange,
          height: features.heightRange,
        },
      },
    },
    create: {
      projectId,
      hasWindow: features.hasWindow,
      hasDoor: features.hasDoor,
      featuresJson: { features },
    },
  });

  await publishProjectEvent(projectId, {
    status: room?.confirmedByUser ? "wizard" : "dimensions",
    payload: { features },
  });
}
