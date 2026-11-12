import { renderPreview, type RenderProduct } from "@werstakoff/ai";
import { prisma } from "@werstakoff/db";
import { publishProjectEvent } from "@werstakoff/queue";
import { applyWatermark, readFileById, readPhoto, saveBuffer, setStatus, smallJpeg, toDataUrl } from "../lib.js";

const VARIANTS = [
  "Вариант 1: стеллажи и шкафы вдоль дальней стены, верстаки ближе к входу.",
  "Вариант 2: стеллажи вдоль боковой стены, рабочие места у окна.",
  "Вариант 3: смешанная расстановка с центральным проходом.",
];

export async function processRender(input: {
  projectId: string;
  selectionId: string;
  variantCount: number;
  reason: "initial" | "correction";
}): Promise<void> {
  const { projectId, selectionId, variantCount } = input;

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (!project || project.status === "done" || project.status === "finalizing") return;

  const selection = await prisma.projectSelection.findUnique({
    where: { id: selectionId },
    include: {
      items: { include: { variant: { include: { imageFile: true } } } },
    },
  });
  if (!selection) throw new Error("Подбор не найден");

  const cleaned = await readPhoto(projectId, "cleaned");
  const room = await prisma.projectRoom.findUnique({ where: { projectId } });
  const layout = selection.layoutJson as { hint?: string } | null;

  const products: RenderProduct[] = selection.items.map((item) => ({
    name: item.variant.name,
    article: item.variant.article,
    dimensions:
      item.variant.widthMm && item.variant.depthMm && item.variant.heightMm
        ? `${item.variant.widthMm}×${item.variant.depthMm}×${item.variant.heightMm}`
        : "по запросу",
    qty: item.qty,
    color: item.variant.color,
  }));

  const productImages: Array<{ type: "base64"; data: string }> = [];
  for (const item of selection.items.slice(0, 8)) {
    if (!item.variant.imageFileId) continue;
    try {
      const file = await readFileById(item.variant.imageFileId);
      const small = await smallJpeg(file.buffer, 420);
      productImages.push({ type: "base64" as const, data: toDataUrl(small.buffer, small.mime) });
    } catch {
      // без референса товара
    }
  }

  const total = Math.max(1, Math.min(3, variantCount));
  const existing = await prisma.projectRender.findMany({
    where: { projectId, selectionId, kind: "preview" },
    select: { variantIndex: true },
  });
  const existingIndexes = new Set(existing.map((render) => render.variantIndex));
  const missing = Array.from({ length: total }, (_, index) => index).filter((index) => !existingIndexes.has(index));
  if (missing.length === 0) {
    const latest = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
    if (latest && latest.status !== "done" && latest.status !== "finalizing") await setStatus(projectId, "review");
    return;
  }

  const renderVariant = async (index: number): Promise<void> => {
    const hint = [layout?.hint, VARIANTS[index % VARIANTS.length]].filter(Boolean).join(". ");
    const result = await renderPreview({
      projectId,
      roomImage: { type: "base64", data: toDataUrl(cleaned.buffer, cleaned.mime) },
      productImages,
      products,
      layoutHint: hint,
      roomType: room?.roomType ?? null,
      colorHint: selection.items[0]?.variant.color ?? null,
      aspectRatio: "3:2",
      seed: 17 + index * 31,
    });

    const watermarked = await applyWatermark(result.buffer);
    const file = await saveBuffer(`projects/${projectId}/previews`, watermarked, "image/jpeg", "jpg");
    await prisma.projectRender.create({
      data: {
        projectId,
        selectionId,
        kind: "preview",
        variantIndex: index,
        fileId: file.id,
        prompt: result.prompt,
        model: "google/gemini-nano-banana-2.1",
        costRub: result.costRub,
      },
    });

    await publishProjectEvent(projectId, {
      status: "rendering",
      message: `Вариант ${index + 1} готов`,
      payload: { variantIndex: index, url: `/api/files/${file.id}` },
    });
  };

  const results = await Promise.allSettled(missing.map((index) => renderVariant(index)));
  const failed = results.filter((result) => result.status === "rejected");
  for (const failure of failed) {
    console.error("[render] вариант не сгенерирован:", failure.reason instanceof Error ? failure.reason.message : failure.reason);
  }
  if (failed.length === results.length) {
    throw failed[0]?.status === "rejected" ? failed[0].reason : new Error("Не удалось сгенерировать варианты");
  }

  const latest = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (latest?.status === "done" || latest?.status === "finalizing") return;
  await setStatus(projectId, "review");
}
