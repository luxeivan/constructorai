import { applyCorrection, classifyCorrection, type Candidate } from "@werstakoff/ai";
import { AppError, MAX_CORRECTION_ROUNDS } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { enqueueAiJob } from "@werstakoff/queue";
import { buildLayoutHint, packItems, type PackingItem } from "@werstakoff/packing";
import { getAnswers, getRoom, setStatus } from "../lib.js";
import { desiredCategories } from "../catalogFilter.js";

export async function processCorrect(input: { projectId: string; correctionId: string }): Promise<void> {
  const { projectId, correctionId } = input;

  const correctionsCount = await prisma.correction.count({ where: { projectId } });
  if (correctionsCount > MAX_CORRECTION_ROUNDS) {
    throw AppError.badRequest("Достигнут лимит правок. Согласуйте текущий вариант или начните новый проект.");
  }

  const correction = await prisma.correction.findUnique({ where: { id: correctionId } });
  if (!correction) throw AppError.notFound("Правка не найдена");

  const room = await getRoom(projectId);
  const selection = await prisma.projectSelection.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    include: { items: { include: { variant: { include: { model: { include: { category: true } } } } } } },
  });
  if (!selection) throw AppError.badRequest("Сначала подберите мебель");

  const intent = await classifyCorrection({ projectId, text: correction.text });
  await prisma.correction.update({
    where: { id: correction.id },
    data: { intentJson: intent as unknown as object },
  });

  const answers = await getAnswers(projectId);
  const categorySlugs = [
    ...new Set([...selection.items.map((item) => item.variant.model.category.slug), ...desiredCategories(answers)]),
  ];
  const perCategory = await Promise.all(
    categorySlugs.map((slug) =>
      prisma.catalogVariant.findMany({
        where: { isActive: true, priceRub: { gt: 0 }, model: { category: { slug } } },
        include: { model: { include: { category: true } } },
        orderBy: { priceRub: "asc" },
        take: 40,
      }),
    ),
  );

  const variantsById = new Map<string, (typeof perCategory)[number][number]>();
  for (const variant of perCategory.flat()) variantsById.set(variant.id, variant);
  for (const item of selection.items) variantsById.set(item.variant.id, item.variant);
  const variants = [...variantsById.values()];

  const candidates: Candidate[] = variants
    .filter((variant) => variant.widthMm && variant.depthMm && variant.heightMm)
    .slice(0, 80)
    .map((variant) => ({
      variantId: variant.id,
      name: variant.name,
      article: variant.article,
      category: variant.model.category.name,
      priceRub: variant.priceRub,
      dimensions: `${variant.widthMm}×${variant.depthMm}×${variant.heightMm}`,
      shelfLoadKg: variant.shelfLoadKg,
    }));

  const current = selection.items.map((item) => ({
    variantId: item.variantId,
    modelId: item.variant.modelId,
    name: item.variant.name,
    article: item.variant.article,
    qty: item.qty,
    unitPriceRub: item.unitPriceRub,
    totalRub: item.unitPriceRub * item.qty,
    widthMm: item.variant.widthMm,
    depthMm: item.variant.depthMm,
    heightMm: item.variant.heightMm,
    imageUrl: item.variant.imageFileId ? `/api/files/${item.variant.imageFileId}` : null,
  }));

  const layoutHint = (selection.layoutJson as { hint?: string } | null)?.hint ?? null;
  const currentIds = new Set(current.map((item) => item.variantId));
  let updatedItems: Array<{ variantId: string; qty: number }>;
  let explanation = "";

  const keyword = correctionKeyword(correction.text);
  if (intent.intent === "add") {
    const slug = keyword.slug ?? [...desiredCategories(answers)][0] ?? "workbenches";
    const candidate = variants
      .filter((variant) => variant.model.category.slug === slug && !currentIds.has(variant.id))
      .filter((variant) => variant.widthMm && variant.depthMm && variant.heightMm)
      .sort((a, b) => b.priceRub - a.priceRub)[0];

    updatedItems = current.map((item) => ({ variantId: item.variantId, qty: item.qty }));
    if (candidate) {
      updatedItems.push({ variantId: candidate.id, qty: 1 });
      explanation = `Добавлен: ${candidate.name}`;
    }
  } else if (intent.intent === "remove") {
    const matchIndex = keyword.word
      ? current.findIndex((item) => item.name.toLowerCase().includes(keyword.word!))
      : current.length - 1;
    updatedItems = current
      .map((item) => ({ variantId: item.variantId, qty: item.qty }))
      .filter((_, index) => index !== (matchIndex >= 0 ? matchIndex : current.length - 1));
    explanation = "Позиция удалена";
  } else {
    const result = await applyCorrection({
      projectId,
      correction: correction.text,
      current,
      candidates,
      layoutHint,
    });
    updatedItems = result.items;
    explanation = result.explanation;

    if (!["remove", "replace"].includes(intent.intent)) {
      const returned = new Set(updatedItems.map((item) => item.variantId));
      for (const item of current) {
        if (!returned.has(item.variantId)) updatedItems.push({ variantId: item.variantId, qty: item.qty });
      }
    }
  }

  if (updatedItems.length === 0) {
    throw AppError.badRequest("После правки в заказе не осталось позиций.");
  }

  const byId = new Map(variants.map((variant) => [variant.id, variant]));
  const chosen = updatedItems
    .map((item) => ({ item, variant: byId.get(item.variantId) }))
    .filter((entry): entry is { item: (typeof updatedItems)[number]; variant: (typeof variants)[number] } =>
      Boolean(entry.variant),
    );

  const packingRoom = {
    wallLengthMm: room.wallLengthMm,
    widthMm: room.widthMm,
    heightMm: room.heightMm,
    hasDoor: room.hasDoor,
  };

  const expanded: PackingItem[] = [];
  for (const { item, variant } of chosen) {
    for (let index = 0; index < Math.min(20, Math.max(1, item.qty)); index += 1) {
      expanded.push({
        variantId: variant.id,
        widthMm: variant.widthMm!,
        depthMm: variant.depthMm!,
        heightMm: variant.heightMm!,
        categorySlug: variant.model.category.slug,
      });
    }
  }

  const layout = packItems(packingRoom, expanded);
  const quantityByVariant = new Map<string, number>();
  for (const placement of layout.placements) {
    quantityByVariant.set(placement.variantId, (quantityByVariant.get(placement.variantId) ?? 0) + 1);
  }

  const items = chosen
    .map(({ variant }) => ({ variant, qty: quantityByVariant.get(variant.id) ?? 0 }))
    .filter((entry) => entry.qty > 0);

  if (items.length === 0) {
    throw AppError.badRequest("После правки мебель не помещается. Сформулируйте иначе или уменьшите количество.");
  }

  const totalRub = items.reduce((sum, entry) => sum + entry.variant.priceRub * entry.qty, 0);
  const version = selection.version + 1;
  const categoryNames = new Map(items.map((entry) => [entry.variant.id, entry.variant.model.category.name]));
  const hint = buildLayoutHint(layout, categoryNames);

  const newSelection = await prisma.projectSelection.create({
    data: {
      projectId,
      version,
      reason: "correction",
      totalRub,
      layoutJson: { ...layout, hint, explanation },
      items: {
        create: items.map((entry) => ({
          variantId: entry.variant.id,
          qty: entry.qty,
          unitPriceRub: entry.variant.priceRub,
        })),
      },
    },
  });

  await setStatus(projectId, "rendering");
  await enqueueAiJob({
    type: "render",
    projectId,
    selectionId: newSelection.id,
    variantCount: 2,
    reason: "correction",
  });
}

function correctionKeyword(text: string): { slug: string | null; word: string | null } {
  const rules: Array<[RegExp, string]> = [
    [/верстак/i, "workbenches"],
    [/стеллаж/i, "shelving"],
    [/шкаф/i, "cabinets"],
    [/тележк/i, "carts"],
    [/тумб/i, "pedestals"],
    [/сварочн/i, "welding"],
    [/антистатич/i, "antistatic"],
    [/стол/i, "tables"],
    [/подставк/i, "pedestals"],
  ];
  for (const [pattern, slug] of rules) {
    const match = text.match(pattern);
    if (match) return { slug, word: match[0].toLowerCase() };
  }
  return { slug: null, word: null };
}
