import { z } from "zod";
import { ROOM_LIMITS } from "./constants.js";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Введите корректный email")
  .max(254);

export const passwordSchema = z
  .string()
  .min(8, "Пароль должен быть не короче 8 символов")
  .max(128);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  consent: z.literal(true, {
    errorMap: () => ({ message: "Нужно согласие на обработку данных" }),
  }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const roomDimensionsSchema = z.object({
  wallLengthMm: z
    .number()
    .int()
    .min(ROOM_LIMITS.minWallMm, `Стена должна быть не короче ${ROOM_LIMITS.minWallMm} мм`)
    .max(ROOM_LIMITS.maxDimensionMm),
  widthMm: z
    .number()
    .int()
    .min(ROOM_LIMITS.minWidthMm, `Ширина должна быть не меньше ${ROOM_LIMITS.minWidthMm} мм`)
    .max(ROOM_LIMITS.maxDimensionMm),
  heightMm: z
    .number()
    .int()
    .min(ROOM_LIMITS.minHeightMm, `Высота должна быть не меньше ${ROOM_LIMITS.minHeightMm} мм`)
    .max(ROOM_LIMITS.maxDimensionMm),
  hasWindow: z.boolean(),
  hasDoor: z.boolean(),
  features: z.string().trim().max(1000).optional().default(""),
});

export type RoomDimensions = z.infer<typeof roomDimensionsSchema>;

export const WIZARD_QUESTION_KEYS = [
  "room_purpose",
  "storage_type",
  "shelf_load",
  "workplaces",
  "zones",
  "ceiling_height",
  "floor_type",
  "antistatic",
  "color",
  "budget",
  "delivery_assembly",
  "priority",
] as const;

export type WizardQuestionKey = (typeof WIZARD_QUESTION_KEYS)[number];

export type WizardOption = {
  value: string;
  label: string;
};

export type WizardQuestion = {
  key: WizardQuestionKey;
  title: string;
  hint?: string;
  type: "single" | "multi" | "boolean";
  options?: WizardOption[];
};

export const WIZARD_QUESTIONS: WizardQuestion[] = [
  {
    key: "room_purpose",
    title: "Что это за помещение?",
    type: "single",
    options: [
      { value: "warehouse", label: "Склад или архив" },
      { value: "workshop", label: "Производственный цех" },
      { value: "service", label: "Мастерская или сервис" },
      { value: "garage", label: "Гараж или автосервис" },
      { value: "classroom", label: "Учебный класс" },
      { value: "office", label: "Офис или лаборатория" },
      { value: "other", label: "Другое" },
    ],
  },
  {
    key: "storage_type",
    title: "Что планируете хранить?",
    hint: "Можно выбрать несколько",
    type: "multi",
    options: [
      { value: "tools", label: "Инструмент и оснастка" },
      { value: "parts", label: "Запчасти и метизы" },
      { value: "documents", label: "Документы и архив" },
      { value: "heavy", label: "Тяжёлые грузы и оборудование" },
      { value: "ppe", label: "СИЗ и одежда" },
      { value: "oversized", label: "Крупногабаритные предметы" },
      { value: "none", label: "Только рабочие места" },
    ],
  },
  {
    key: "shelf_load",
    title: "Какая нагрузка нужна на полку?",
    type: "single",
    options: [
      { value: "120", label: "До 120 кг" },
      { value: "185", label: "До 185 кг" },
      { value: "450", label: "До 450 кг" },
      { value: "700", label: "До 700 кг" },
      { value: "700plus", label: "Больше 700 кг" },
    ],
  },
  {
    key: "workplaces",
    title: "Сколько рабочих мест нужно?",
    type: "single",
    options: [
      { value: "0", label: "Не нужны" },
      { value: "1-2", label: "1–2" },
      { value: "3-5", label: "3–5" },
      { value: "6-10", label: "6–10" },
      { value: "10plus", label: "Больше 10" },
    ],
  },
  {
    key: "zones",
    title: "Какие зоны нужны?",
    hint: "Можно выбрать несколько",
    type: "multi",
    options: [
      { value: "workbench", label: "Верстаки и столы" },
      { value: "shelving", label: "Стеллажи" },
      { value: "cabinet", label: "Шкафы" },
      { value: "cart", label: "Инструментальные тележки" },
      { value: "pedestal", label: "Тумбы" },
      { value: "welding", label: "Сварочный стол" },
      { value: "antistatic", label: "Антистатическая зона" },
      { value: "assembly", label: "Монтажный стол" },
    ],
  },
  {
    key: "ceiling_height",
    title: "Какая высота потолков?",
    type: "single",
    options: [
      { value: "lt2.5", label: "До 2,5 м" },
      { value: "2.5-3", label: "2,5–3 м" },
      { value: "3-4", label: "3–4 м" },
      { value: "gt4", label: "Больше 4 м" },
    ],
  },
  {
    key: "floor_type",
    title: "Какое покрытие пола?",
    type: "single",
    options: [
      { value: "concrete", label: "Бетон" },
      { value: "tile", label: "Плитка" },
      { value: "metal", label: "Металл" },
      { value: "wood", label: "Дерево" },
      { value: "other", label: "Другое" },
    ],
  },
  {
    key: "antistatic",
    title: "Нужна ли защита от статики?",
    hint: "Для электроники и точной сборки",
    type: "boolean",
  },
  {
    key: "color",
    title: "Какой цвет предпочтительнее?",
    type: "single",
    options: [
      { value: "ral7047", label: "Серый RAL 7047" },
      { value: "ral5015", label: "Синий RAL 5015" },
      { value: "ral9011", label: "Чёрный RAL 9011" },
      { value: "any", label: "Любой" },
    ],
  },
  {
    key: "budget",
    title: "Какой бюджет на мебель?",
    type: "single",
    options: [
      { value: "100000", label: "До 100 000 ₽" },
      { value: "300000", label: "100 000–300 000 ₽" },
      { value: "700000", label: "300 000–700 000 ₽" },
      { value: "700000plus", label: "Больше 700 000 ₽" },
    ],
  },
  {
    key: "delivery_assembly",
    title: "Нужна доставка и сборка?",
    type: "boolean",
  },
  {
    key: "priority",
    title: "Что важнее?",
    type: "single",
    options: [
      { value: "capacity", label: "Максимум хранения" },
      { value: "space", label: "Максимум свободного места" },
      { value: "balance", label: "Баланс" },
    ],
  },
];

export const wizardAnswersSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.boolean()]),
);

export type WizardAnswers = z.infer<typeof wizardAnswersSchema>;

export function validateWizardAnswers(answers: WizardAnswers): string[] {
  const errors: string[] = [];
  for (const question of WIZARD_QUESTIONS) {
    const value = answers[question.key];
    if (value === undefined || value === null || value === "") {
      errors.push(`Ответьте на вопрос: ${question.title}`);
      continue;
    }
    if (question.type === "multi") {
      if (!Array.isArray(value) || value.length === 0) {
        errors.push(`Выберите хотя бы один вариант: ${question.title}`);
      }
    }
    if (question.type === "single" && Array.isArray(value)) {
      errors.push(`Выберите один вариант: ${question.title}`);
    }
  }
  return errors;
}

export const correctionSchema = z.object({
  text: z.string().trim().min(1, "Опишите, что изменить").max(2000),
});

export const adminLoginSchema = z.object({
  login: z.string().trim().min(1),
  password: z.string().min(1),
});

export const settingsSchema = z.object({
  companyName: z.string().trim().max(200),
  inn: z.string().trim().max(20),
  kpp: z.string().trim().max(20),
  address: z.string().trim().max(500),
  phone: z.string().trim().max(100),
  email: z.string().trim().max(200),
  site: z.string().trim().max(200),
  managerName: z.string().trim().max(200),
  paymentTerms: z.string().trim().max(1000),
  deliveryTerms: z.string().trim().max(1000),
  offerValidityDays: z.number().int().min(1).max(365),
  disclaimer: z.string().trim().max(1000),
  logoFileId: z.string().uuid().nullable().optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
