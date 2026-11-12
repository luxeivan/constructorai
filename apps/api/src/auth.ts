import { createHash, randomBytes } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@werstakoff/db";
import { AppError } from "@werstakoff/core";

const USER_COOKIE = "wk_sid";
const ADMIN_COOKIE = "wk_admin";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export async function createUserSession(userId: string, req: Request, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
      ip: req.ip ?? null,
      userAgent: req.get("user-agent") ?? null,
    },
  });
  res.cookie(USER_COOKIE, token, cookieOptions());
}

export async function destroyUserSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[USER_COOKIE];
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(USER_COOKIE, { path: "/" });
}

export type AuthUser = { id: string; email: string };

export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  const token = req.cookies?.[USER_COOKIE];
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || session.user.deletedAt) return null;
  return { id: session.user.id, email: session.user.email };
}

export async function requireUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getAuthUser(req);
    if (!user) throw AppError.unauthorized();
    (req as Request & { user: AuthUser }).user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function currentUser(req: Request): AuthUser {
  const user = (req as Request & { user?: AuthUser }).user;
  if (!user) throw AppError.unauthorized();
  return user;
}

export async function createAdminSession(adminId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await prisma.adminSession.create({
    data: {
      adminId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  res.cookie(ADMIN_COOKIE, token, cookieOptions());
}

export async function destroyAdminSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (token) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
}

export async function getAdmin(req: Request): Promise<{ id: string; login: string } | null> {
  const token = req.cookies?.[ADMIN_COOKIE];
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { admin: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { id: session.admin.id, login: session.admin.login };
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const admin = await getAdmin(req);
    if (!admin) throw AppError.unauthorized("Требуется вход в админку");
    (req as Request & { admin: { id: string; login: string } }).admin = admin;
    next();
  } catch (error) {
    next(error);
  }
}
