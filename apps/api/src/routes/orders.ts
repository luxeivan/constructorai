import { Router } from "express";
import { AppError } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { currentUser, requireUser } from "../auth.js";

export const ordersRouter = Router();

ordersRouter.use(requireUser);

ordersRouter.get("/", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const orders = await prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { project: { select: { id: true, title: true } } },
    });

    res.json({
      orders: orders.map((order) => ({
        id: order.id,
        number: order.number,
        status: order.status,
        totalRub: order.totalRub,
        createdAt: order.createdAt,
        projectId: order.projectId,
        projectTitle: order.project.title,
        pdfUrl: order.pdfFileId ? `/api/files/${order.pdfFileId}` : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

ordersRouter.get("/:id", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const order = await prisma.order.findFirst({
      where: { id: String(req.params.id), userId: user.id },
      include: {
        items: true,
        project: { include: { renders: { where: { kind: "final" }, take: 1, include: { file: true } } } },
      },
    });
    if (!order) throw AppError.notFound("Заказ не найден");

    const finalRender = order.project.renders[0];
    res.json({
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        totalRub: order.totalRub,
        createdAt: order.createdAt,
        pdfUrl: order.pdfFileId ? `/api/files/${order.pdfFileId}` : null,
        imageUrl: finalRender ? `/api/files/${finalRender.fileId}` : null,
        items: order.items,
      },
    });
  } catch (error) {
    next(error);
  }
});
