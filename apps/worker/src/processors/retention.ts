import { PHOTO_RETENTION_DAYS } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { deleteObject } from "@werstakoff/storage";

export async function processRetention(): Promise<void> {
  const cutoff = new Date(Date.now() - PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const projects = await prisma.project.findMany({
    where: { createdAt: { lt: cutoff }, deletedAt: null },
    include: {
      photos: { include: { file: true } },
      renders: { include: { file: true } },
    },
  });

  for (const project of projects) {
    const files = [...project.photos.map((photo) => photo.file), ...project.renders.map((render) => render.file)];

    await prisma.projectRender.deleteMany({ where: { projectId: project.id } });
    await prisma.projectPhoto.deleteMany({ where: { projectId: project.id } });
    await prisma.correction.deleteMany({ where: { projectId: project.id } });
    await prisma.projectSelection.deleteMany({ where: { projectId: project.id } });
    await prisma.projectRoom.deleteMany({ where: { projectId: project.id } });
    await prisma.wizardAnswer.deleteMany({ where: { projectId: project.id } });

    await prisma.project.update({
      where: { id: project.id },
      data: { title: "Удалён по сроку хранения", status: "expired", deletedAt: new Date() },
    });

    for (const file of files) {
      await deleteObject(file.key).catch(() => undefined);
      await prisma.fileObject.delete({ where: { id: file.id } }).catch(() => undefined);
    }
  }

  console.log(`[retention] обработано проектов: ${projects.length}`);
}
