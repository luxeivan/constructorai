import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { AppError, type ProjectStatus, type WizardAnswers } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { publishProjectEvent } from "@werstakoff/queue";
import { getObject, putObject } from "@werstakoff/storage";
import { randomUUID } from "node:crypto";

const here = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.resolve(here, "../../../infra/assets/logo.svg");

export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw AppError.notFound("Проект не найден");
  return project;
}

export async function setStatus(projectId: string, status: ProjectStatus, error: string | null = null) {
  await prisma.project.update({ where: { id: projectId }, data: { status, error } });
  await publishProjectEvent(projectId, { status, error: error ?? undefined });
}

export async function failProject(projectId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  console.error(`[project ${projectId}]`, error);
  await setStatus(projectId, "failed", message);
}

export async function readPhoto(projectId: string, kind: "original" | "cleaned") {
  const photo = await prisma.projectPhoto.findFirst({
    where: { projectId, kind },
    orderBy: { createdAt: "desc" },
    include: { file: true },
  });
  if (!photo) throw AppError.badRequest(`Нет фотографии (${kind})`);
  const buffer = await getObject(photo.file.key);
  return { buffer, mime: photo.file.mime, file: photo.file };
}

export async function readFileById(fileId: string) {
  const file = await prisma.fileObject.findUnique({ where: { id: fileId } });
  if (!file) throw AppError.notFound("Файл не найден");
  return { buffer: await getObject(file.key), mime: file.mime, file };
}

export function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function smallJpeg(buffer: Buffer, maxSize = 900): Promise<{ buffer: Buffer; mime: string }> {
  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 76 })
    .toBuffer();
  return { buffer: processed, mime: "image/jpeg" };
}

export async function getRoom(projectId: string) {
  const room = await prisma.projectRoom.findUnique({ where: { projectId } });
  if (!room || !room.wallLengthMm || !room.widthMm || !room.heightMm) {
    throw AppError.badRequest("Не подтверждены размеры помещения");
  }
  return room as typeof room & { wallLengthMm: number; widthMm: number; heightMm: number };
}

export async function getAnswers(projectId: string): Promise<WizardAnswers> {
  const rows = await prisma.wizardAnswer.findMany({ where: { projectId } });
  return Object.fromEntries(rows.map((row) => [row.questionKey, row.answerJson])) as WizardAnswers;
}

export async function applyWatermark(buffer: Buffer): Promise<Buffer> {
  const svg = (await readFile(LOGO_PATH, "utf8"))
    .replace(/#302876/gi, "#ffffff")
    .replace(/#e62460/gi, "#ffffff");

  const metadata = await sharp(buffer).metadata();
  const width = Math.max(160, Math.round((metadata.width ?? 1200) * 0.18));
  const logo = await sharp(Buffer.from(svg))
    .resize({ width })
    .ensureAlpha(0.55)
    .png()
    .toBuffer();

  return sharp(buffer)
    .composite([{ input: logo, gravity: "southeast" }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export async function saveBuffer(prefix: string, buffer: Buffer, mime: string, ext: string) {
  const key = `${prefix}/${randomUUID()}.${ext}`;
  await putObject(key, buffer, mime);
  let width: number | null = null;
  let height: number | null = null;
  if (mime.startsWith("image/")) {
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width ?? null;
      height = metadata.height ?? null;
    } catch {
      width = null;
      height = null;
    }
  }
  return prisma.fileObject.create({
    data: {
      bucket: process.env.MINIO_BUCKET ?? "werstakoff",
      key,
      mime,
      size: buffer.length,
      width,
      height,
    },
  });
}
