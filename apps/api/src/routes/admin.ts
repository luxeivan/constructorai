import { Router } from "express";
import { adminLoginSchema, AppError, settingsSchema } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { enqueueAiJob } from "@werstakoff/queue";
import {
  createAdminSession,
  destroyAdminSession,
  getAdmin,
  requireAdmin,
  verifyPassword,
} from "../auth.js";

export const adminRouter = Router();

adminRouter.post("/login", async (req, res, next) => {
  try {
    const data = adminLoginSchema.parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { login: data.login } });
    if (!admin) throw AppError.unauthorized("Неверный логин или пароль");
    const valid = await verifyPassword(admin.passwordHash, data.password);
    if (!valid) throw AppError.unauthorized("Неверный логин или пароль");
    await createAdminSession(admin.id, res);
    res.json({ admin: { id: admin.id, login: admin.login } });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/logout", async (req, res, next) => {
  try {
    await destroyAdminSession(req, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/me", async (req, res, next) => {
  try {
    res.json({ admin: await getAdmin(req) });
  } catch (error) {
    next(error);
  }
});

adminRouter.use(requireAdmin);

adminRouter.get("/stats", async (_req, res, next) => {
  try {
    const [projectsTotal, projectsDone, ordersTotal, usersTotal, spendAgg, byStep, recent] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null } }),
      prisma.project.count({ where: { status: "done", deletedAt: null } }),
      prisma.order.count(),
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.aiUsage.aggregate({ _sum: { costRub: true } }),
      prisma.aiUsage.groupBy({ by: ["step"], _sum: { costRub: true }, _count: { _all: true } }),
      prisma.aiUsage.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    ]);

    res.json({
      stats: {
        projectsTotal,
        projectsDone,
        ordersTotal,
        usersTotal,
        spendTotalRub: spendAgg._sum.costRub ?? 0,
        conversion: projectsTotal > 0 ? projectsDone / projectsTotal : 0,
        byStep: byStep.map((row) => ({
          step: row.step,
          costRub: row._sum.costRub ?? 0,
          calls: row._count._all,
        })),
        recentUsage: recent,
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/projects", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 20;
    const [total, projects] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null } }),
      prisma.project.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { email: true } },
          aiUsage: { select: { costRub: true } },
          orders: { select: { id: true, number: true } },
        },
      }),
    ]);

    res.json({
      total,
      page,
      pageSize,
      projects: projects.map((project) => ({
        id: project.id,
        title: project.title,
        status: project.status,
        error: project.error,
        createdAt: project.createdAt,
        userEmail: project.user.email,
        spendRub: project.aiUsage.reduce((sum, usage) => sum + usage.costRub, 0),
        order: project.orders[0] ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/projects/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: { select: { email: true } },
        photos: { include: { file: true } },
        room: true,
        answers: true,
        selections: {
          orderBy: { version: "desc" },
          include: { items: { include: { variant: true } } },
        },
        renders: { include: { file: true }, orderBy: { createdAt: "desc" } },
        corrections: { orderBy: { createdAt: "desc" } },
        aiUsage: { orderBy: { createdAt: "desc" } },
        aiJobs: { orderBy: { createdAt: "desc" } },
        orders: { include: { items: true } },
      },
    });
    if (!project) throw AppError.notFound("Проект не найден");

    res.json({
      project: {
        ...project,
        photos: project.photos.map((photo) => ({ ...photo, url: `/api/files/${photo.fileId}` })),
        renders: project.renders.map((render) => ({ ...render, url: `/api/files/${render.fileId}` })),
        spendRub: project.aiUsage.reduce((sum, usage) => sum + usage.costRub, 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/orders", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 20;
    const [total, orders] = await Promise.all([
      prisma.order.count(),
      prisma.order.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { user: { select: { email: true } }, items: true, project: { select: { title: true } } },
      }),
    ]);
    res.json({ total, page, pageSize, orders });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/catalog/categories", async (_req, res, next) => {
  try {
    const categories = await prisma.catalogCategory.findMany({
      orderBy: { sort: "asc" },
      include: { _count: { select: { models: true } } },
    });
    res.json({ categories });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/catalog/variants", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1));
    const pageSize = 50;
    const search = String(req.query.search ?? "").trim();
    const where = search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { article: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {};

    const [total, variants] = await Promise.all([
      prisma.catalogVariant.count({ where }),
      prisma.catalogVariant.findMany({
        where,
        orderBy: { externalId: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { model: { include: { category: true } }, imageFile: true },
      }),
    ]);

    res.json({
      total,
      page,
      pageSize,
      variants: variants.map((variant) => ({
        id: variant.id,
        externalId: variant.externalId,
        name: variant.name,
        article: variant.article,
        priceRub: variant.priceRub,
        widthMm: variant.widthMm,
        depthMm: variant.depthMm,
        heightMm: variant.heightMm,
        isActive: variant.isActive,
        hasDimensions: variant.hasDimensions,
        category: variant.model.category.name,
        model: variant.model.name,
        imageUrl: variant.imageFileId ? `/api/files/${variant.imageFileId}` : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/catalog/variants/:id", async (req, res, next) => {
  try {
    const data = req.body as {
      name?: string;
      priceRub?: number;
      widthMm?: number | null;
      depthMm?: number | null;
      heightMm?: number | null;
      isActive?: boolean;
    };
    const variant = await prisma.catalogVariant.update({
      where: { id: String(req.params.id) },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.priceRub !== undefined ? { priceRub: Math.round(data.priceRub) } : {}),
        ...(data.widthMm !== undefined ? { widthMm: data.widthMm } : {}),
        ...(data.depthMm !== undefined ? { depthMm: data.depthMm } : {}),
        ...(data.heightMm !== undefined ? { heightMm: data.heightMm } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    res.json({ variant });
  } catch (error) {
    next(error);
  }
});

adminRouter.get("/settings", async (_req, res, next) => {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: "company" } });
    res.json({ settings: setting?.valueJson ?? {} });
  } catch (error) {
    next(error);
  }
});

adminRouter.put("/settings", async (req, res, next) => {
  try {
    const data = settingsSchema.parse(req.body);
    const setting = await prisma.setting.upsert({
      where: { key: "company" },
      update: { valueJson: data },
      create: { key: "company", valueJson: data },
    });
    res.json({ settings: setting.valueJson });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/catalog/import", async (req, res, next) => {
  try {
    const scrape = Boolean(req.body?.scrape);
    const images = Boolean(req.body?.images);
    await enqueueAiJob({ type: "import-catalog", options: { scrape, images } });
    res.status(202).json({ status: "queued" });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/retention/run", async (_req, res, next) => {
  try {
    await enqueueAiJob({ type: "retention" });
    res.status(202).json({ status: "queued" });
  } catch (error) {
    next(error);
  }
});
