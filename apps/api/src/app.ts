import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "@werstakoff/core";
import { authRouter } from "./routes/auth.js";
import { projectsRouter } from "./routes/projects.js";
import { ordersRouter } from "./routes/orders.js";
import { filesRouter } from "./routes/files.js";
import { adminRouter } from "./routes/admin.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/admin", adminRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Маршрут не найден" } });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof ZodError) {
      res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message ?? "Некорректные данные",
          details: error.issues,
        },
      });
      return;
    }

    if (error instanceof multer.MulterError) {
      const message =
        error.code === "LIMIT_FILE_SIZE" ? "Файл больше 15 МБ" : "Не удалось загрузить файл";
      res.status(400).json({ error: { code: "BAD_REQUEST", message } });
      return;
    }

    if (error instanceof AppError) {
      res.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    console.error("Unhandled error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Внутренняя ошибка сервера" } });
  });

  return app;
}
