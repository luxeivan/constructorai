export const PROJECT_STATUSES = [
  "draft",
  "validating",
  "rejected",
  "cleaning",
  "dimensions",
  "wizard",
  "selecting",
  "rendering",
  "review",
  "finalizing",
  "done",
  "failed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Черновик",
  validating: "Проверяем фотографию",
  rejected: "Фотография не подходит",
  cleaning: "Убираем лишнее с фотографии",
  dimensions: "Уточняем размеры помещения",
  wizard: "Отвечаем на вопросы",
  selecting: "Подбираем мебель",
  rendering: "Готовим варианты",
  review: "Согласовываем вариант",
  finalizing: "Готовим финальное изображение и заказ",
  done: "Заказ готов",
  failed: "Ошибка",
};

export const ACTIVE_STATUSES: ProjectStatus[] = [
  "validating",
  "cleaning",
  "dimensions",
  "wizard",
  "selecting",
  "rendering",
  "review",
  "finalizing",
];

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const MAX_CORRECTION_ROUNDS = 4;
export const INITIAL_RENDER_VARIANTS = 3;
export const CORRECTION_RENDER_VARIANTS = 2;
export const DEFAULT_AI_BUDGET_RUB = 60;
export const PHOTO_RETENTION_DAYS = 365;

export const ROOM_LIMITS = {
  minWallMm: 2000,
  minWidthMm: 1000,
  minHeightMm: 2000,
  maxDimensionMm: 30000,
} as const;

export const LAYOUT_RULES = {
  wallGapMm: 100,
  aisleMm: 800,
  doorGapMm: 600,
  gridMm: 10,
} as const;

export const WATERMARK_TEXT = "Верстакофф";
export const COMPANY_SITE = "https://werstakoff.ru";
export const LOGO_URL = "https://werstakoff.ru/img/new_header/logo_new.svg";
