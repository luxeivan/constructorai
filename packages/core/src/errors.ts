export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "PHOTO_REJECTED"
  | "BUDGET_EXCEEDED"
  | "AI_ERROR"
  | "INTERNAL";

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError("BAD_REQUEST", message, 400, details);
  }

  static unauthorized(message = "Требуется авторизация") {
    return new AppError("UNAUTHORIZED", message, 401);
  }

  static forbidden(message = "Доступ запрещён") {
    return new AppError("FORBIDDEN", message, 403);
  }

  static notFound(message = "Не найдено") {
    return new AppError("NOT_FOUND", message, 404);
  }

  static conflict(message: string) {
    return new AppError("CONFLICT", message, 409);
  }

  static validation(message: string, details?: unknown) {
    return new AppError("VALIDATION_ERROR", message, 422, details);
  }

  static photoRejected(message: string) {
    return new AppError("PHOTO_REJECTED", message, 422);
  }

  static budgetExceeded(message = "Лимит генераций для этой сессии исчерпан") {
    return new AppError("BUDGET_EXCEEDED", message, 402);
  }

  static ai(message: string, details?: unknown) {
    return new AppError("AI_ERROR", message, 502, details);
  }
}
