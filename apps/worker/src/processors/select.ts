import { rankSelection, type Candidate } from "@werstakoff/ai";
import { AppError } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { enqueueAiJob } from "@werstakoff/queue";
import { buildLayoutHint, packItems, type PackingItem } from "@werstakoff/packing";
import { getAnswers, getRoom, setStatus } from "../lib.js";
import { budgetMax, colorCode, desiredCategories, requiredLoad } from "../catalogFilter.js";

function dimensionsLabel(variant: { widthMm: number | null; depthMm: number | null; heightMm: number | null }) {
  if (!variant.widthMm || !variant.depthMm || !variant.heightMm) return "по запросу";
  return `${variant.widthMm}×${variant.depthMm}×${variant.heightMm}`;
}

export async function processSelect(projectId: string): Promise<void> {
  const room = await getRoom(projectId);
  const answers = await getAnswers(projectId);
  const desired = desiredCategories(answers);
  const maxBudget = budgetMax(answers);
  const load = requiredLoad(answers);
  const color = colorCode(answers);

  const variants = await prisma.catalogVariant.findMany({
    where: { isActive: true, priceRub: { gt: 0 } },
    include: { model: { include: { category: true } } },
    take: 3000,
  });

  const packingRoom = {
    wallLengthMm: room.wallLengthMm,
    widthMm: room.widthMm,
    heightMm: room.heightMm,
    hasDoor: room.hasDoor,
  };

  type Scored = { variant: (typeof variants)[number]; score: number };
  const scored: Scored[] = [];

  for (const variant of variants) {
    if (!variant.widthMm || !variant.depthMm || !variant.heightMm) continue;
    if (maxBudget !== null && variant.priceRub > maxBudget) continue;

    const slug = variant.model.category.slug;
    const packingItem: PackingItem = {
      variantId: variant.id,
      widthMm: variant.widthMm,
      depthMm: variant.depthMm,
      heightMm: variant.heightMm,
      categorySlug: slug,
    };
    if (!packingItem || !fitsRoomSafe(packingItem, packingRoom)) continue;

    let score = 0;
    if (desired.has(slug)) score += 50;
    else if (slug === "components") score += 5;
    else continue;

    if (variant.shelfLoadKg && variant.shelfLoadKg >= load) score += 20;
    else if (variant.shelfLoadKg) score += Math.max(0, 10 - Math.abs(variant.shelfLoadKg - load) / 50);
    if (color && variant.color?.includes(color)) score += 10;
    if (maxBudget !== null) score += Math.max(0, 10 - (variant.priceRub / maxBudget) * 10);
    if (variant.imageFileId) score += 3;

    scored.push({ variant, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 40);

  if (top.length === 0) {
    throw AppError.badRequest("Не удалось подобрать мебель под размеры помещения. Измените размеры или ответы.");
  }

  const candidates: Candidate[] = top.map(({ variant }) => ({
    variantId: variant.id,
    name: variant.name,
    article: variant.article,
    category: variant.model.category.name,
    priceRub: variant.priceRub,
    dimensions: dimensionsLabel(variant),
    shelfLoadKg: variant.shelfLoadKg,
  }));

  let picked: Array<{ variantId: string; qty: number; reason?: string }>;
  try {
    const ranked = await rankSelection({
      projectId,
      answers,
      room: {
        wallLengthMm: room.wallLengthMm,
        widthMm: room.widthMm,
        heightMm: room.heightMm,
        hasWindow: room.hasWindow,
        hasDoor: room.hasDoor,
        features: String((room.featuresJson as { features?: string } | null)?.features ?? ""),
      },
      candidates,
      budgetRub: maxBudget,
    });
    picked = ranked.items;
  } catch (error) {
    console.warn("LLM-ранжирование не удалось, используем детерминированный выбор:", (error as Error).message);
    picked = top.slice(0, 8).map(({ variant }) => ({ variantId: variant.id, qty: 1 }));
  }

  const byId = new Map(top.map(({ variant }) => [variant.id, variant]));
  const chosen = picked
    .map((item) => ({ item, variant: byId.get(item.variantId) }))
    .filter((entry): entry is { item: (typeof picked)[number]; variant: (typeof top)[number]["variant"] } => Boolean(entry.variant));

  if (chosen.length === 0) {
    throw AppError.badRequest("Подбор не дал результата. Попробуйте изменить ответы.");
  }

  const expanded: PackingItem[] = [];
  for (const { item, variant } of chosen) {
    const qty = Math.min(20, Math.max(1, item.qty));
    for (let index = 0; index < qty; index += 1) {
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

  let items = chosen
    .map(({ item, variant }) => ({
      variant,
      qty: quantityByVariant.get(variant.id) ?? 0,
      reason: item.reason,
    }))
    .filter((entry) => entry.qty > 0);

  if (items.length === 0) {
    throw AppError.badRequest("Мебель не помещается в помещение. Увеличьте размеры или измените ответы.");
  }

  const total = () => items.reduce((sum, entry) => sum + entry.variant.priceRub * entry.qty, 0);
  if (maxBudget !== null) {
    while (total() > maxBudget && items.length > 1) {
      items = items.slice(0, -1);
    }
    if (total() > maxBudget) {
      throw AppError.badRequest("Подобранный комплект превышает бюджет. Увеличьте бюджет или измените требования.");
    }
  }

  const last = await prisma.projectSelection.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });
  const version = (last?.version ?? 0) + 1;

  const categoryNames = new Map(items.map((entry) => [entry.variant.id, entry.variant.model.category.name]));
  const hint = buildLayoutHint(layout, categoryNames);

  const selection = await prisma.projectSelection.create({
    data: {
      projectId,
      version,
      reason: "initial",
      totalRub: total(),
      layoutJson: { ...layout, hint },
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
    selectionId: selection.id,
    variantCount: 3,
    reason: "initial",
  });
}

function fitsRoomSafe(
  item: PackingItem,
  room: { wallLengthMm: number; widthMm: number; heightMm: number },
): boolean {
  if (item.heightMm > room.heightMm) return false;
  const normal = item.widthMm <= room.wallLengthMm && item.depthMm <= room.widthMm;
  const rotated = item.depthMm <= room.wallLengthMm && item.widthMm <= room.widthMm;
  return normal || rotated;
}
