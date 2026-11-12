import { AppError } from "@werstakoff/core";

const API_BASE = "https://polza.ai/api/v1";

export type ImagePart = { type: "url" | "base64"; data: string };

export type JevQuestion =
  | { type: "noul"; instructions: string; criteria?: Record<string, string> }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> }
  | { type: "score"; instructions: string; criteria: string[] };

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
  | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number };

export type JevResponse = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost_rub?: number };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type ChatResponse = {
  model: string;
  choices: Array<{ message: { content: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost_rub?: number };
};

export type MediaResult = {
  buffer: Buffer;
  mime: string;
  costRub: number;
  raw: unknown;
};

function token(): string {
  const value = process.env.POLZA_TOKEN?.trim();
  if (!value) {
    throw AppError.ai("Не настроен POLZA_TOKEN");
  }
  return value;
}

async function request<T>(path: string, init: RequestInit, timeoutMs = 120_000): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const body = await response.text();
    let message = `Polza API ${response.status}`;
    try {
      const parsed = JSON.parse(body) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      if (body) message = body.slice(0, 300);
    }
    throw AppError.ai(message, { status: response.status });
  }

  return (await response.json()) as T;
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (error instanceof AppError && error.details && typeof error.details === "object") {
        const status = (error.details as { status?: number }).status;
        if (status && status < 500 && status !== 429) throw error;
      }
      if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw lastError;
}

export async function jev(input: {
  state: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
  questions: Record<string, JevQuestion>;
}): Promise<JevResponse> {
  return withRetry(() =>
    request<JevResponse>("/systemone", {
      method: "POST",
      headers: { "TypeSafe-Danger-Zone-Images": "true" },
      body: JSON.stringify({
        model: "typesafe/jev",
        state: input.state,
        questions: input.questions,
      }),
    }),
  );
}

export async function chat(input: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}): Promise<ChatResponse> {
  return withRetry(() =>
    request<ChatResponse>("/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 2000,
        ...(input.json ? { response_format: { type: "json_object" } } : {}),
      }),
    }),
  );
}

export type MediaInput = {
  model: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: "1K" | "2K" | "4K";
  images?: ImagePart[];
  seed?: number;
};

const RESOLUTION_MODELS = new Set([
  "google/gemini-nano-banana-2.1",
  "openai/gpt-image-2.5-flare",
  "qwen/image-2.1",
  "openai/gpt-image-2.5-sunburst",
  "google/gemini-3.1-flash-image",
  "openai/gpt-5.4-image-2",
  "google/gemini-3.1-flash-image-preview",
  "black-forest-labs/flux.2-pro",
  "black-forest-labs/flux.2-flex",
  "bytedance/seedream-4",
  "google/gemini-3-pro-image-preview",
]);

const PRICE_TABLE: Record<string, Record<string, number>> = {
  "google/gemini-3.1-flash-lite-image": { "1K": 2.9, "2K": 2.9, "4K": 2.9 },
  "google/gemini-nano-banana-2.1": { "1K": 3, "2K": 4.5, "4K": 6.75 },
  "google/gemini-3.1-flash-image-preview": { "1K": 4.8, "2K": 7.2, "4K": 10.8 },
};

export function estimateMediaCost(model: string, resolution: "1K" | "2K" | "4K" = "1K"): number {
  return PRICE_TABLE[model]?.[resolution] ?? 5;
}

type MediaResponse = {
  id?: string;
  status?: string;
  data?: { url?: string; b64_json?: string } | Array<{ url?: string; b64_json?: string }>;
  usage?: { cost_rub?: number };
  error?: unknown;
};

async function waitForMedia(id: string, timeoutMs = 300_000): Promise<MediaResponse> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await request<MediaResponse>(`/media/${id}`, { method: "GET" });
    if (result.status === "completed") return result;
    if (result.status === "failed") {
      throw AppError.ai("Генерация изображения не удалась", result.error);
    }
    await new Promise((resolve) => setTimeout(resolve, 4000));
  }
  throw AppError.ai("Таймаут генерации изображения");
}

export async function generateImage(input: MediaInput): Promise<MediaResult> {
  const resolution = input.resolution ?? "1K";
  const payload: Record<string, unknown> = {
    prompt: input.prompt,
    aspect_ratio: input.aspectRatio ?? "3:2",
  };
  if (RESOLUTION_MODELS.has(input.model)) {
    payload.image_resolution = resolution;
  }
  if (input.images?.length) {
    payload.images = input.images.map((image) => ({ type: image.type, data: image.data }));
  }
  if (input.seed !== undefined) payload.seed = input.seed;

  let result = await withRetry(() =>
    request<MediaResponse>("/media", {
      method: "POST",
      body: JSON.stringify({ model: input.model, input: payload }),
    }),
  );

  if (result.status === "pending" || result.status === "processing" || (!result.data && result.id)) {
    if (!result.id) throw AppError.ai("Polza не вернула идентификатор задачи");
    result = await waitForMedia(result.id);
  }

  const items = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  const first = items[0];
  if (!first) throw AppError.ai("В ответе нет изображения");

  let buffer: Buffer;
  let mime = "image/png";
  if (first.b64_json) {
    buffer = Buffer.from(first.b64_json, "base64");
  } else if (first.url) {
    const response = await fetch(first.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw AppError.ai("Не удалось скачать изображение");
    buffer = Buffer.from(await response.arrayBuffer());
    mime = response.headers.get("content-type") ?? mime;
  } else {
    throw AppError.ai("В ответе нет ссылки на изображение");
  }

  const costRub = result.usage?.cost_rub ?? estimateMediaCost(input.model, resolution);
  return { buffer, mime, costRub, raw: result };
}
