import { Router } from "express";
import { AppError } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { getAuthUser, getAdmin } from "../auth.js";
import { readFileBuffer } from "../files.js";

export const filesRouter = Router();

filesRouter.get("/:id", async (req, res, next) => {
  try {
    const fileId = String(req.params.id);
    const [user, admin] = await Promise.all([getAuthUser(req), getAdmin(req)]);
    if (!user && !admin) throw AppError.unauthorized();

    const file = await prisma.fileObject.findUnique({
      where: { id: fileId },
      include: {
        catalogImages: { select: { id: true } },
        projectPhotos: { include: { project: { select: { userId: true } } } },
        renders: { include: { project: { select: { userId: true } } } },
        orders: { select: { userId: true } },
      },
    });
    if (!file) throw AppError.notFound("Файл не найден");

    const ownerIds = new Set<string>();
    for (const photo of file.projectPhotos) ownerIds.add(photo.project.userId);
    for (const render of file.renders) ownerIds.add(render.project.userId);
    for (const order of file.orders) ownerIds.add(order.userId);

    const isCatalog = file.catalogImages.length > 0;
    const isOwner = user ? ownerIds.has(user.id) : false;
    if (!admin && !isCatalog && !isOwner) throw AppError.forbidden();

    const { buffer } = await readFileBuffer(fileId);
    res.setHeader("Content-Type", file.mime);
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (file.mime === "application/pdf") {
      res.setHeader("Content-Disposition", `inline; filename="order-${fileId}.pdf"`);
    }
    res.send(buffer);
  } catch (error) {
    next(error);
  }
});
