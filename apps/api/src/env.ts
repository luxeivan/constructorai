import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.string().default("9000"),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  MINIO_BUCKET: z.string().default("werstakoff"),
  MINIO_USE_SSL: z.string().optional(),
  POLZA_TOKEN: z.string().optional(),
  SESSION_SECRET: z.string().default("dev-secret"),
  PUBLIC_BASE_URL: z.string().default("http://localhost:8080"),
  AI_SESSION_BUDGET_RUB: z.coerce.number().default(60),
  PHOTO_RETENTION_DAYS: z.coerce.number().default(365),
});

export const env = envSchema.parse(process.env);
