import { Router } from "express";
import { AppError, loginSchema, registerSchema } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import {
  createUserSession,
  currentUser,
  destroyUserSession,
  getAuthUser,
  hashPassword,
  requireUser,
  verifyPassword,
} from "../auth.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw AppError.conflict("Пользователь с таким email уже зарегистрирован");

    const user = await prisma.user.create({
      data: { email: data.email, passwordHash: await hashPassword(data.password) },
    });
    await createUserSession(user.id, req, res);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || user.deletedAt) throw AppError.unauthorized("Неверный email или пароль");
    const valid = await verifyPassword(user.passwordHash, data.password);
    if (!valid) throw AppError.unauthorized("Неверный email или пароль");

    await createUserSession(user.id, req, res);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", async (req, res, next) => {
  try {
    await destroyUserSession(req, res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", async (req, res, next) => {
  try {
    const user = await getAuthUser(req);
    res.json({ user });
  } catch (error) {
    next(error);
  }
});

authRouter.delete("/me", requireUser, async (req, res, next) => {
  try {
    const user = currentUser(req);
    await prisma.project.updateMany({
      where: { userId: user.id, deletedAt: null },
      data: { deletedAt: new Date(), status: "failed", error: "Данные удалены по запросу пользователя" },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date(), email: `deleted+${user.id}@local` },
    });
    res.clearCookie("wk_sid", { path: "/" });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
