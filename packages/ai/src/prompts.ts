import type { SelectionItem, WizardAnswers } from "@werstakoff/core";

export const CLEAN_ROOM_PROMPT = [
  "Отредактируй фотографию помещения.",
  "Удали всю мебель, стеллажи, верстаки, шкафы, столы, коробки, инструменты, мусор, людей, животных, провода и любые посторонние предметы.",
  "Оставь только архитектуру: стены, пол, потолок, окна, двери, колонны и инженерные коммуникации.",
  "Не меняй ракурс, перспективу, освещение и геометрию помещения. Ничего не добавляй.",
  "Результат — пустое помещение, фотореализм, естественный свет.",
].join(" ");

export type RenderProduct = {
  name: string;
  article: string;
  dimensions: string;
  qty: number;
  color?: string | null;
  placement?: string;
};

export function buildRenderPrompt(input: {
  products: RenderProduct[];
  layoutHint: string;
  roomType?: string | null;
  colorHint?: string | null;
}): string {
  const lines = input.products.map(
    (product, index) =>
      `${index + 1}. ${product.name} (арт. ${product.article}), габариты ${product.dimensions}, количество ${product.qty}${
        product.color ? `, цвет ${product.color}` : ""
      }${product.placement ? `, размещение: ${product.placement}` : ""}`,
  );

  return [
    "Фотореалистичная визуализация помещения с металлической мебелью.",
    "Сохрани точную геометрию, ракурс, перспективу, освещение, окна и двери с исходной фотографии.",
    input.roomType ? `Тип помещения: ${input.roomType}.` : "",
    "Размести строго перечисленные товары, не добавляй ничего другого:",
    ...lines,
    input.layoutHint ? `Схема расстановки: ${input.layoutHint}.` : "",
    input.colorHint ? `Цветовая гамма: ${input.colorHint}.` : "",
    "Мебель должна стоять устойчиво на полу, масштаб реалистичный, тени согласованы с освещением.",
    "Без людей, без текста, без логотипов и водяных знаков.",
  ]
    .filter(Boolean)
    .join(" ");
}

export const FINAL_RENDER_PROMPT = [
  "Детализируй это изображение до разрешения 4K.",
  "Полностью сохрани композицию, расстановку мебели, ракурс, перспективу, освещение и цвета.",
  "Повысь резкость и детализацию металла, пола и стен. Фотореализм.",
  "Не добавляй и не убирай предметы, не меняй планировку, без текста и водяных знаков.",
].join(" ");

export const SELECTION_SYSTEM_PROMPT = [
  "Ты — инженер по подбору металлической мебели для производственных помещений.",
  "Тебе дан список товаров-кандидатов и ответы клиента.",
  "Выбери товары, которые лучше всего закрывают потребности и помещаются в помещение.",
  "Не придумывай товары: используй только variantId из списка.",
  "Верни строго JSON: {\"items\":[{\"variantId\":\"...\",\"qty\":1,\"reason\":\"кратко\"}],\"summary\":\"1-2 предложения\"}.",
].join(" ");

export function buildSelectionUserPrompt(input: {
  answers: WizardAnswers;
  room: { wallLengthMm: number; widthMm: number; heightMm: number; hasWindow: boolean; hasDoor: boolean; features: string };
  candidates: Array<{
    variantId: string;
    name: string;
    article: string;
    category: string;
    priceRub: number;
    dimensions: string;
    shelfLoadKg: number | null;
  }>;
  budgetRub: number | null;
}): string {
  return JSON.stringify(
    {
      room: input.room,
      answers: input.answers,
      budgetRub: input.budgetRub,
      candidates: input.candidates,
    },
    null,
    2,
  );
}

export const CORRECTION_SYSTEM_PROMPT = [
  "Ты обновляешь состав заказа металлической мебели по правке клиента.",
  "Тебе дан текущий состав и список доступных товаров-кандидатов.",
  "Верни строго JSON: {\"items\":[{\"variantId\":\"...\",\"qty\":1}],\"layoutHint\":\"как расставить\",\"explanation\":\"что изменено\"}.",
  "Верни полный итоговый состав заказа. Меняй только то, о чём просит клиент, остальные позиции сохраняй без изменений.",
  "Используй только variantId из списка. Если правка не про состав, верни текущий состав без изменений.",
].join(" ");

export function buildCorrectionUserPrompt(input: {
  correction: string;
  current: SelectionItem[];
  candidates: Array<{ variantId: string; name: string; article: string; priceRub: number; dimensions: string }>;
  layoutHint?: string | null;
}): string {
  return JSON.stringify(
    {
      correction: input.correction,
      current: input.current.map((item) => ({
        variantId: item.variantId,
        name: item.name,
        qty: item.qty,
      })),
      candidates: input.candidates,
      currentLayout: input.layoutHint ?? null,
    },
    null,
    2,
  );
}

export const WATERMARK_OPACITY = 0.35;
