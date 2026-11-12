import type { CorrectionIntent, JevValidation } from "@werstakoff/core";
import { jev, type ImagePart, type JevQuestion } from "./polza.js";
import { withUsage } from "./budget.js";

const VALIDATION_QUESTIONS: Record<string, JevQuestion> = {
  is_room: {
    type: "noul",
    instructions: "На изображении внутреннее помещение: комната, склад, цех, гараж, мастерская?",
    criteria: {
      true: "Виден пол, стены и потолок или их часть, пространство внутри здания",
      false: "Улица, пейзаж, крупный план предмета, чертёж, скриншот, не помещение",
    },
  },
  has_floor: { type: "noul", instructions: "На изображении виден пол помещения?" },
  has_wall_2m: {
    type: "noul",
    instructions: "На изображении видна хотя бы одна стена длиной не менее 2 метров?",
  },
  has_people: { type: "noul", instructions: "На изображении есть люди?" },
  is_inappropriate: {
    type: "noul",
    instructions: "Изображение содержит неприемлемый контент: насилие, обнажённость, оружие, шок-контент?",
  },
  room_type: {
    type: "choice",
    instructions: "Что это за помещение?",
    criteria: {
      warehouse: "Склад, архив, кладовая",
      workshop: "Производственный цех, мастерская, сервис",
      garage: "Гараж, автосервис, паркинг",
      classroom: "Учебный класс, аудитория",
      office: "Офис, лаборатория",
      other: "Другое или не определить",
    },
  },
  width_range: {
    type: "choice",
    instructions: "Какова примерная ширина помещения по видимой стене?",
    criteria: {
      lt2: "Меньше 2 метров",
      m2_4: "От 2 до 4 метров",
      m4_6: "От 4 до 6 метров",
      m6_10: "От 6 до 10 метров",
      gt10: "Больше 10 метров",
      unknown: "Не определить по фотографии",
    },
  },
  depth_range: {
    type: "choice",
    instructions: "Какова примерная глубина помещения от переднего плана до дальней стены?",
    criteria: {
      lt2: "Меньше 2 метров",
      m2_4: "От 2 до 4 метров",
      m4_6: "От 4 до 6 метров",
      m6_10: "От 6 до 10 метров",
      gt10: "Больше 10 метров",
      unknown: "Не определить по фотографии",
    },
  },
  height_range: {
    type: "choice",
    instructions: "Какова примерная высота потолков?",
    criteria: {
      lt2_5: "Меньше 2,5 метров",
      m2_5_3: "От 2,5 до 3 метров",
      m3_4: "От 3 до 4 метров",
      gt4: "Больше 4 метров",
      unknown: "Не определить по фотографии",
    },
  },
  clutter_level: {
    type: "score",
    instructions: "Насколько помещение захламлено?",
    criteria: [
      "Пустое помещение или почти пустое",
      "Есть отдельные предметы мебели и коробки",
      "Много мебели, коробок и посторонних предметов",
      "Сильно захламлено, проходы затруднены",
    ],
  },
};

const FEATURE_QUESTIONS: Record<string, JevQuestion> = {
  has_window: { type: "noul", instructions: "На изображении есть окно?" },
  has_door: { type: "noul", instructions: "На изображении есть дверь или дверной проём?" },
  has_ledges: {
    type: "noul",
    instructions: "На изображении есть выступы, колонны, ниши или карманы в стенах?",
  },
  wall_length_range: {
    type: "choice",
    instructions: "Какова примерная длина самой длинной видимой стены?",
    criteria: {
      lt2: "Меньше 2 метров",
      m2_4: "От 2 до 4 метров",
      m4_6: "От 4 до 6 метров",
      m6_10: "От 6 до 10 метров",
      gt10: "Больше 10 метров",
      unknown: "Не определить",
    },
  },
  height_range: {
    type: "choice",
    instructions: "Какова примерная высота потолка?",
    criteria: {
      lt2_5: "Меньше 2,5 метров",
      m2_5_3: "От 2,5 до 3 метров",
      m3_4: "От 3 до 4 метров",
      gt4: "Больше 4 метров",
      unknown: "Не определить",
    },
  },
};

const CORRECTION_QUESTIONS: Record<string, JevQuestion> = {
  intent: {
    type: "choice",
    instructions: "Что клиент хочет изменить в подобранной мебели?",
    criteria: {
      add: "Добавить товар или позицию",
      remove: "Убрать товар или позицию",
      replace: "Заменить товар на другой",
      color: "Изменить цвет или покрытие",
      layout: "Изменить расстановку, не меняя состав",
      quantity: "Изменить количество",
      budget: "Снизить или уложиться в бюджет",
      other: "Другое или непонятно",
    },
  },
  changes_selection: {
    type: "noul",
    instructions: "Правка требует изменить состав или количество товаров в заказе?",
  },
};

function num(answer: { noul?: number } | undefined): number {
  return typeof answer?.noul === "number" ? answer.noul : 0;
}

function choice(answer: { choice?: string } | undefined, fallback: string): string {
  return typeof answer?.choice === "string" ? answer.choice : fallback;
}

export async function validatePhoto(input: {
  projectId: string;
  image: ImagePart;
}): Promise<{ validation: JevValidation; ok: boolean; reason: string | null }> {
  const started = Date.now();
  const response = await jev({
    state: [
      { type: "text", text: "Фотография помещения, которую прислал клиент для подбора металлической мебели." },
      { type: "image_url", image_url: { url: input.image.data } },
    ],
    questions: VALIDATION_QUESTIONS,
  });

  await withUsage(
    { projectId: input.projectId, step: "photo_validation", model: response.model },
    async () => ({
      result: null,
      costRub: response.usage?.cost_rub ?? 0.05,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }),
  );

  const validation: JevValidation = {
    isRoom: num(response.answers.is_room as { noul?: number }),
    hasFloor: num(response.answers.has_floor as { noul?: number }),
    hasWall2m: num(response.answers.has_wall_2m as { noul?: number }),
    hasPeople: num(response.answers.has_people as { noul?: number }),
    isInappropriate: num(response.answers.is_inappropriate as { noul?: number }),
    roomType: choice(response.answers.room_type as { choice?: string }, "other"),
    widthRange: choice(response.answers.width_range as { choice?: string }, "unknown"),
    depthRange: choice(response.answers.depth_range as { choice?: string }, "unknown"),
    heightRange: choice(response.answers.height_range as { choice?: string }, "unknown"),
    clutterLevel: Number((response.answers.clutter_level as { score?: number })?.score ?? 0),
  };

  let reason: string | null = null;
  if (validation.isRoom < 0.7) reason = "На фотографии не удалось распознать помещение.";
  else if (validation.hasFloor < 0.7) reason = "На фотографии не виден пол помещения.";
  else if (validation.hasWall2m < 0.6) reason = "На фотографии не видна стена длиной от 2 метров.";
  else if (validation.hasPeople > 0.3) reason = "На фотографии есть люди. Загрузите фото без людей.";
  else if (validation.isInappropriate > 0.2) reason = "Фотография содержит неприемлемый контент.";

  void started;
  return { validation, ok: reason === null, reason };
}

export async function extractRoomFeatures(input: {
  projectId: string;
  image: ImagePart;
}): Promise<{
  hasWindow: boolean;
  hasDoor: boolean;
  hasLedges: boolean;
  wallLengthRange: string;
  heightRange: string;
}> {
  const response = await jev({
    state: [
      { type: "text", text: "Пустое помещение после удаления мебели. Нужно описать архитектуру." },
      { type: "image_url", image_url: { url: input.image.data } },
    ],
    questions: FEATURE_QUESTIONS,
  });

  await withUsage(
    { projectId: input.projectId, step: "room_features", model: response.model },
    async () => ({
      result: null,
      costRub: response.usage?.cost_rub ?? 0.05,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }),
  );

  return {
    hasWindow: num(response.answers.has_window as { noul?: number }) >= 0.5,
    hasDoor: num(response.answers.has_door as { noul?: number }) >= 0.5,
    hasLedges: num(response.answers.has_ledges as { noul?: number }) >= 0.5,
    wallLengthRange: choice(response.answers.wall_length_range as { choice?: string }, "unknown"),
    heightRange: choice(response.answers.height_range as { choice?: string }, "unknown"),
  };
}

export async function classifyCorrection(input: {
  projectId: string;
  text: string;
}): Promise<{ intent: CorrectionIntent; changesSelection: boolean; confidence: number }> {
  const response = await jev({
    state: input.text,
    questions: CORRECTION_QUESTIONS,
  });

  await withUsage(
    { projectId: input.projectId, step: "correction_intent", model: response.model },
    async () => ({
      result: null,
      costRub: response.usage?.cost_rub ?? 0.005,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    }),
  );

  const choiceAnswer = response.answers.intent as { choice?: string; confidence?: number } | undefined;
  return {
    intent: (choiceAnswer?.choice ?? "other") as CorrectionIntent,
    changesSelection: num(response.answers.changes_selection as { noul?: number }) >= 0.5,
    confidence: choiceAnswer?.confidence ?? 0,
  };
}
