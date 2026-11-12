import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const endpoint = () => {
  const host = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = process.env.MINIO_PORT ?? "9000";
  const ssl = process.env.MINIO_USE_SSL === "true";
  return `${ssl ? "https" : "http"}://${host}:${port}`;
};

let client: S3Client | null = null;

export function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      region: "us-east-1",
      endpoint: endpoint(),
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
      },
    });
  }
  return client;
}

export function bucket(): string {
  return process.env.MINIO_BUCKET ?? "werstakoff";
}

export function driver(): "fs" | "s3" {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "fs";
}

export function storageDir(): string {
  return process.env.STORAGE_DIR ?? path.resolve(process.cwd(), "storage");
}

function localPath(key: string): string {
  return path.join(storageDir(), bucket(), key);
}

export async function ensureBucket(): Promise<void> {
  if (driver() === "fs") {
    await mkdir(path.join(storageDir(), bucket()), { recursive: true });
    return;
  }
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
  }
}

export type PutResult = { bucket: string; key: string; size: number };

export async function putObject(key: string, body: Buffer, mime: string): Promise<PutResult> {
  if (driver() === "fs") {
    const target = localPath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { bucket: bucket(), key, size: body.length };
  }

  await ensureBucket();
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: mime,
    }),
  );
  return { bucket: bucket(), key, size: body.length };
}

export async function getObject(key: string): Promise<Buffer> {
  if (driver() === "fs") {
    return readFile(localPath(key));
  }
  const response = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!response.Body) throw new Error(`Файл не найден: ${key}`);
  const bytes = await response.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function deleteObject(key: string): Promise<void> {
  if (driver() === "fs") {
    await unlink(localPath(key)).catch(() => undefined);
    return;
  }
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function signedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (driver() === "fs") return `/api/storage/${encodeURIComponent(key)}`;
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export function buildKey(prefix: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safe}`;
}
