import { z } from "zod";
import type { SelectionItem, WizardAnswers } from "@werstakoff/core";
import { assertBudget, withUsage } from "./budget.js";
import { chat } from "./polza.js";
import {
  CORRECTION_SYSTEM_PROMPT,
  SELECTION_SYSTEM_PROMPT,
  buildCorrectionUserPrompt,
  buildSelectionUserPrompt,
} from "./prompts.js";

const CHAT_MODEL = "google/gemini-2.5-flash-lite";

export type Candidate = {
  variantId: string;
  name: string;
  article: string;
  category: string;
  priceRub: number;
  dimensions: string;
  shelfLoadKg: number | null;
};

const selectionResponseSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string(),
        qty: z.number().int().min(1).max(100),
        reason: z.string().max(300).optional(),
      }),
    )
    .min(1),
  summary: z.string().max(1000).optional(),
});

const correctionResponseSchema = z.object({
  items: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1).max(100) })),
  layoutHint: z.string().max(1000).optional(),
  explanation: z.string().max(1000).optional(),
});

function parseJson(content: string): unknown {
  const trimmed = content.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("LLM вернула ответ без JSON");
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function rankSelection(input: {
  projectId: string;
  answers: WizardAnswers;
  room: { wallLengthMm: number; widthMm: number; heightMm: number; hasWindow: boolean; hasDoor: boolean; features: string };
  candidates: Candidate[];
  budgetRub: number | null;
}): Promise<{ items: Array<{ variantId: string; qty: number; reason?: string }>; summary: string }> {
  await assertBudget(input.projectId, 0.5);

  const response = await withUsage(
    { projectId: input.projectId, step: "selection_rank", model: CHAT_MODEL },
    async () => {
      const result = await chat({
        model: CHAT_MODEL,
        json: true,
        maxTokens: 4000,
        messages: [
          { role: "system", content: SELECTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildSelectionUserPrompt({
              answers: input.answers,
              room: input.room,
              candidates: input.candidates,
              budgetRub: input.budgetRub,
            }),
          },
        ],
      });
      return {
        result,
        costRub: result.usage?.cost_rub ?? 0.3,
        inputTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
      };
    },
  );

  const content = response.choices[0]?.message.content ?? "";
  const parsed = selectionResponseSchema.parse(parseJson(content));
  const allowed = new Set(input.candidates.map((candidate) => candidate.variantId));
  const items = parsed.items.filter((item) => allowed.has(item.variantId));

  if (items.length === 0) {
    throw new Error("LLM не выбрала ни одного товара из списка");
  }

  return { items, summary: parsed.summary ?? "" };
}

export async function applyCorrection(input: {
  projectId: string;
  correction: string;
  current: SelectionItem[];
  candidates: Candidate[];
  layoutHint?: string | null;
}): Promise<{ items: Array<{ variantId: string; qty: number }>; layoutHint: string; explanation: string }> {
  await assertBudget(input.projectId, 0.5);

  const response = await withUsage(
    { projectId: input.projectId, step: "correction_apply", model: CHAT_MODEL },
    async () => {
      const result = await chat({
        model: CHAT_MODEL,
        json: true,
        maxTokens: 4000,
        messages: [
          { role: "system", content: CORRECTION_SYSTEM_PROMPT },
          {
            role: "user",
            content: buildCorrectionUserPrompt({
              correction: input.correction,
              current: input.current,
              candidates: input.candidates,
              layoutHint: input.layoutHint,
            }),
          },
        ],
      });
      return {
        result,
        costRub: result.usage?.cost_rub ?? 0.3,
        inputTokens: result.usage?.prompt_tokens,
        outputTokens: result.usage?.completion_tokens,
      };
    },
  );

  const content = response.choices[0]?.message.content ?? "";
  const parsed = correctionResponseSchema.parse(parseJson(content));
  const allowed = new Set(input.candidates.map((candidate) => candidate.variantId));
  const items = parsed.items.filter((item) => allowed.has(item.variantId));

  return {
    items: items.length > 0 ? items : input.current.map((item) => ({ variantId: item.variantId, qty: item.qty })),
    layoutHint: parsed.layoutHint ?? input.layoutHint ?? "",
    explanation: parsed.explanation ?? "",
  };
}
