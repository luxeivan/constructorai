import { enqueueAiJob } from "@werstakoff/queue";
import { validatePhoto } from "@werstakoff/ai";
import { prisma } from "@werstakoff/db";
import { getProject, readPhoto, setStatus, smallJpeg, toDataUrl } from "../lib.js";

export async function processValidatePhoto(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (project.status === "rejected") return;

  const photo = await readPhoto(projectId, "original");
  const small = await smallJpeg(photo.buffer, 900);
  const result = await validatePhoto({
    projectId,
    image: { type: "base64", data: toDataUrl(small.buffer, small.mime) },
  });

  if (!result.ok) {
    await prisma.projectRoom.upsert({
      where: { projectId },
      update: { roomType: result.validation.roomType, featuresJson: { validation: result.validation } },
      create: {
        projectId,
        roomType: result.validation.roomType,
        featuresJson: { validation: result.validation },
      },
    });
    await setStatus(projectId, "rejected", result.reason ?? "Фотография не подходит");
    return;
  }

  await prisma.projectRoom.upsert({
    where: { projectId },
    update: {
      roomType: result.validation.roomType,
      featuresJson: {
        validation: result.validation,
        ranges: {
          width: result.validation.widthRange,
          depth: result.validation.depthRange,
          height: result.validation.heightRange,
        },
      },
    },
    create: {
      projectId,
      roomType: result.validation.roomType,
      featuresJson: {
        validation: result.validation,
        ranges: {
          width: result.validation.widthRange,
          depth: result.validation.depthRange,
          height: result.validation.heightRange,
        },
      },
    },
  });

  await setStatus(projectId, "cleaning");
  await enqueueAiJob({ type: "clean-room", projectId });
}
