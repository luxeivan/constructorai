import { AppError, DEFAULT_AI_BUDGET_RUB } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";

export function sessionBudgetRub(): number {
  const value = Number(process.env.AI_SESSION_BUDGET_RUB ?? DEFAULT_AI_BUDGET_RUB);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_AI_BUDGET_RUB;
}

export async function getSpentRub(projectId: string): Promise<number> {
  const result = await prisma.aiUsage.aggregate({
    where: { projectId },
    _sum: { costRub: true },
  });
  return result._sum.costRub ?? 0;
}

export async function assertBudget(projectId: string, estimatedRub: number): Promise<void> {
  const spent = await getSpentRub(projectId);
  if (spent + estimatedRub > sessionBudgetRub()) {
    throw AppError.budgetExceeded(
      `Лимит генераций для этой сессии исчерпан (${spent.toFixed(2)} из ${sessionBudgetRub()} ₽)`,
    );
  }
}

export type UsageInput = {
  projectId?: string | null;
  step: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costRub: number;
  durationMs?: number;
};

export async function recordUsage(input: UsageInput): Promise<void> {
  await prisma.aiUsage.create({
    data: {
      projectId: input.projectId ?? null,
      step: input.step,
      model: input.model,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      costRub: input.costRub,
      durationMs: input.durationMs ?? 0,
    },
  });
}

export async function withUsage<T>(
  meta: Omit<UsageInput, "costRub" | "inputTokens" | "outputTokens" | "durationMs">,
  fn: () => Promise<{ result: T; costRub: number; inputTokens?: number; outputTokens?: number }>,
): Promise<T> {
  const started = Date.now();
  const { result, costRub, inputTokens, outputTokens } = await fn();
  await recordUsage({
    ...meta,
    costRub,
    inputTokens,
    outputTokens,
    durationMs: Date.now() - started,
  });
  return result;
}
