import { Router } from "express";
import multer from "multer";
import { AppError, correctionSchema, projectChannel, roomDimensionsSchema, validateWizardAnswers, wizardAnswersSchema } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { createSubscriber, enqueueAiJob } from "@werstakoff/queue";
import { deleteObject } from "@werstakoff/storage";
import { currentUser, requireUser } from "../auth.js";
import { normalizePhoto, saveBuffer } from "../files.js";

export const projectsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
});

async function getProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
  });
  if (!project) throw AppError.notFound("Проект не найден");
  return project;
}

function fileUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/api/files/${fileId}` : null;
}

projectsRouter.use(requireUser);

projectsRouter.get("/", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const projects = await prisma.project.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        photos: { where: { kind: "original" }, include: { file: true }, take: 1 },
        renders: { where: { kind: "preview" }, orderBy: { createdAt: "desc" }, take: 1, include: { file: true } },
        orders: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    res.json({
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        error: project.error,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        coverUrl: fileUrl(project.photos[0]?.fileId),
        previewUrl: fileUrl(project.renders[0]?.fileId),
        orderId: project.orders[0]?.id ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await prisma.project.create({
      data: {
        userId: user.id,
        title: `Проект от ${new Date().toLocaleDateString("ru-RU")}`,
        status: "draft",
      },
    });
    res.status(201).json({ project: { id: project.id, status: project.status } });
  } catch (error) {
    next(error);
  }
});

projectsRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);

    const photos = await prisma.projectPhoto.findMany({ where: { projectId: project.id }, include: { file: true } });
    const renders = await prisma.projectRender.findMany({ where: { projectId: project.id }, include: { file: true } });
    const files = [...photos.map((photo) => photo.file), ...renders.map((render) => render.file)];
    const hasOrders = (await prisma.order.count({ where: { projectId: project.id } })) > 0;

    if (hasOrders) {
      await prisma.projectRender.deleteMany({ where: { projectId: project.id } });
      await prisma.projectPhoto.deleteMany({ where: { projectId: project.id } });
      await prisma.correction.deleteMany({ where: { projectId: project.id } });
      await prisma.projectSelection.deleteMany({ where: { projectId: project.id } });
      await prisma.projectRoom.deleteMany({ where: { projectId: project.id } });
      await prisma.wizardAnswer.deleteMany({ where: { projectId: project.id } });
      await prisma.project.update({
        where: { id: project.id },
        data: { title: "Удалён по запросу", status: "deleted", deletedAt: new Date() },
      });
    } else {
      await prisma.project.delete({ where: { id: project.id } });
    }

    for (const file of files) {
      await deleteObject(file.key).catch(() => undefined);
      await prisma.fileObject.delete({ where: { id: file.id } }).catch(() => undefined);
    }

    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

projectsRouter.get("/:id", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      include: {
        photos: { include: { file: true }, orderBy: { createdAt: "asc" } },
        room: true,
        answers: true,
        selections: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            items: {
              include: {
                variant: { include: { model: { include: { category: true } }, imageFile: true } },
              },
            },
          },
        },
        renders: { include: { file: true }, orderBy: { createdAt: "desc" } },
        corrections: { orderBy: { createdAt: "desc" } },
        orders: { orderBy: { createdAt: "desc" }, include: { items: true, pdfFile: true } },
      },
    });

    if (!full) throw AppError.notFound("Проект не найден");

    const selection = full.selections[0];
    res.json({
      project: {
        id: full.id,
        title: full.title,
        status: full.status,
        error: full.error,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      },
      photos: full.photos.map((photo) => ({
        id: photo.id,
        kind: photo.kind,
        url: fileUrl(photo.fileId),
        width: photo.width,
        height: photo.height,
      })),
      room: full.room,
      answers: Object.fromEntries(
        full.answers.map((answer) => [answer.questionKey, answer.answerJson]),
      ),
      selection: selection
        ? {
            id: selection.id,
            version: selection.version,
            totalRub: selection.totalRub,
            layout: selection.layoutJson,
            items: selection.items.map((item) => ({
              id: item.id,
              variantId: item.variantId,
              qty: item.qty,
              unitPriceRub: item.unitPriceRub,
              totalRub: item.unitPriceRub * item.qty,
              name: item.variant.name,
              article: item.variant.article,
              category: item.variant.model.category.name,
              widthMm: item.variant.widthMm,
              depthMm: item.variant.depthMm,
              heightMm: item.variant.heightMm,
              imageUrl: fileUrl(item.variant.imageFileId),
            })),
          }
        : null,
      renders: [
        ...full.renders
          .filter((render) => render.kind === "preview")
          .filter((render) => !render.selectionId || render.selectionId === selection?.id)
          .filter((render, index, list) => list.findIndex((item) => item.variantIndex === render.variantIndex) === index)
          .map((render) => ({
            id: render.id,
            kind: render.kind,
            variantIndex: render.variantIndex,
            url: fileUrl(render.fileId),
            approved: render.approved,
            createdAt: render.createdAt,
          })),
        ...full.renders
          .filter((render) => render.kind === "final")
          .slice(0, 1)
          .map((render) => ({
            id: render.id,
            kind: render.kind,
            variantIndex: render.variantIndex,
            url: fileUrl(render.fileId),
            approved: render.approved,
            createdAt: render.createdAt,
          })),
      ],
      corrections: full.corrections.map((correction) => ({
        id: correction.id,
        text: correction.text,
        createdAt: correction.createdAt,
      })),
      order: full.orders[0]
        ? {
            id: full.orders[0].id,
            number: full.orders[0].number,
            totalRub: full.orders[0].totalRub,
            pdfUrl: fileUrl(full.orders[0].pdfFileId),
            items: full.orders[0].items,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/photo", upload.single("photo"), async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    if (!req.file) throw AppError.badRequest("Загрузите фотографию помещения");
    if (!req.file.mimetype.startsWith("image/")) {
      throw AppError.badRequest("Поддерживаются только изображения");
    }

    let normalized: { buffer: Buffer; mime: string; ext: string };
    try {
      normalized = await normalizePhoto(req.file.buffer);
    } catch {
      throw AppError.badRequest("Не удалось прочитать изображение. Загрузите JPG или PNG.");
    }

    const file = await saveBuffer(`projects/${project.id}`, normalized.buffer, normalized.mime, normalized.ext);
    await prisma.projectPhoto.deleteMany({ where: { projectId: project.id, kind: "original" } });
    await prisma.projectPhoto.create({
      data: {
        projectId: project.id,
        kind: "original",
        fileId: file.id,
        width: file.width,
        height: file.height,
      },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "validating", error: null },
    });
    await enqueueAiJob({ type: "validate-photo", projectId: project.id });

    res.status(202).json({ status: "validating" });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/dimensions", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    const data = roomDimensionsSchema.parse(req.body);

    await prisma.projectRoom.upsert({
      where: { projectId: project.id },
      update: {
        wallLengthMm: data.wallLengthMm,
        widthMm: data.widthMm,
        heightMm: data.heightMm,
        hasWindow: data.hasWindow,
        hasDoor: data.hasDoor,
        featuresJson: { features: data.features },
        confirmedByUser: true,
      },
      create: {
        projectId: project.id,
        wallLengthMm: data.wallLengthMm,
        widthMm: data.widthMm,
        heightMm: data.heightMm,
        hasWindow: data.hasWindow,
        hasDoor: data.hasDoor,
        featuresJson: { features: data.features },
        confirmedByUser: true,
      },
    });

    await prisma.project.update({ where: { id: project.id }, data: { status: "wizard" } });
    res.json({ status: "wizard" });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/wizard", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    const answers = wizardAnswersSchema.parse(req.body);
    const errors = validateWizardAnswers(answers);
    if (errors.length > 0) throw AppError.validation(errors[0]!, errors);

    for (const [key, value] of Object.entries(answers)) {
      await prisma.wizardAnswer.upsert({
        where: { projectId_questionKey: { projectId: project.id, questionKey: key } },
        update: { answerJson: value as object },
        create: { projectId: project.id, questionKey: key, answerJson: value as object },
      });
    }

    await prisma.project.update({ where: { id: project.id }, data: { status: "selecting" } });
    await enqueueAiJob({ type: "select", projectId: project.id });
    res.status(202).json({ status: "selecting" });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/select", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    await prisma.project.update({ where: { id: project.id }, data: { status: "selecting", error: null } });
    await enqueueAiJob({ type: "select", projectId: project.id });
    res.status(202).json({ status: "selecting" });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/render", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    const selection = await prisma.projectSelection.findFirst({
      where: { projectId: project.id },
      orderBy: { version: "desc" },
    });
    if (!selection) throw AppError.badRequest("Сначала подберите мебель");

    await prisma.project.update({ where: { id: project.id }, data: { status: "rendering", error: null } });
    await enqueueAiJob({
      type: "render",
      projectId: project.id,
      selectionId: selection.id,
      variantCount: 3,
      reason: "initial",
    });
    res.status(202).json({ status: "rendering" });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/corrections", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    const data = correctionSchema.parse(req.body);

    const approved = await prisma.projectRender.findFirst({
      where: { projectId: project.id, kind: "preview", approved: true },
      orderBy: { createdAt: "desc" },
    });
    const correction = await prisma.correction.create({
      data: { projectId: project.id, renderId: approved?.id ?? null, text: data.text },
    });

    await prisma.project.update({ where: { id: project.id }, data: { status: "rendering", error: null } });
    await enqueueAiJob({ type: "correct", projectId: project.id, correctionId: correction.id });
    res.status(202).json({ status: "rendering", correctionId: correction.id });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post("/:id/approve", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);
    const renderId = String(req.body?.renderId ?? "");
    if (!renderId) throw AppError.badRequest("Выберите вариант");

    const render = await prisma.projectRender.findFirst({
      where: { id: renderId, projectId: project.id, kind: "preview" },
    });
    if (!render) throw AppError.notFound("Вариант не найден");

    await prisma.projectRender.updateMany({
      where: { projectId: project.id, kind: "preview" },
      data: { approved: false },
    });
    await prisma.projectRender.update({ where: { id: render.id }, data: { approved: true } });
    await prisma.project.update({ where: { id: project.id }, data: { status: "finalizing", error: null } });
    await enqueueAiJob({ type: "finalize", projectId: project.id, renderId: render.id });

    res.status(202).json({ status: "finalizing" });
  } catch (error) {
    next(error);
  }
});

projectsRouter.get("/:id/events", async (req, res, next) => {
  try {
    const user = currentUser(req);
    const project = await getProject(String(req.params.id), user.id);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${JSON.stringify({ status: project.status, error: project.error })}\n\n`);

    const subscriber = createSubscriber();
    await subscriber.subscribe(projectChannel(project.id));
    subscriber.on("message", (_channel, message) => {
      res.write(`data: ${message}\n\n`);
    });

    const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
    req.on("close", () => {
      clearInterval(keepAlive);
      void subscriber.quit();
    });
  } catch (error) {
    next(error);
  }
});
