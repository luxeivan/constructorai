import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma, type FileObject } from "@werstakoff/db";
import { getObject, putObject } from "@werstakoff/storage";
import { AppError } from "@werstakoff/core";

export async function saveBuffer(prefix: string, buffer: Buffer, mime: string, ext: string): Promise<FileObject> {
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

export async function readFileBuffer(fileId: string): Promise<{ file: FileObject; buffer: Buffer }> {
  const file = await prisma.fileObject.findUnique({ where: { id: fileId } });
  if (!file) throw AppError.notFound("Файл не найден");
  const buffer = await getObject(file.key);
  return { file, buffer };
}

export function toDataUrl(buffer: Buffer, mime: string): string {
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

export async function imagePreview(buffer: Buffer, maxSize = 900): Promise<{ buffer: Buffer; mime: string }> {
  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
  return { buffer: processed, mime: "image/jpeg" };
}

export async function normalizePhoto(buffer: Buffer): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const processed = await sharp(buffer)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();
  return { buffer: processed, mime: "image/jpeg", ext: "jpg" };
}
