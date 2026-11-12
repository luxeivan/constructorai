import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { renderFinal } from "@werstakoff/ai";
import { settingsSchema } from "@werstakoff/core";
import { prisma } from "@werstakoff/db";
import { buildOrderPdf } from "@werstakoff/pdf";
import { getRoom, readFileById, saveBuffer, setStatus, toDataUrl } from "../lib.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const FALLBACK_LOGO = path.resolve(here, "../../../infra/assets/logo.svg");

export async function processFinalize(input: { projectId: string; renderId: string }): Promise<void> {
  const { projectId, renderId } = input;

  const existing = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  if (existing?.status === "done") return;

  const render = await prisma.projectRender.findFirst({
    where: { id: renderId, projectId, kind: "preview" },
    include: { selection: { include: { items: { include: { variant: true } } } } },
  });
  if (!render || !render.selection) throw new Error("Согласованный вариант не найден");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { user: true },
  });
  if (!project) throw new Error("Проект не найден");

  const room = await getRoom(projectId);
  const preview = await readFileById(render.fileId);

  const existingFinal = await prisma.projectRender.findFirst({
    where: { projectId, kind: "final", selectionId: render.selectionId },
    orderBy: { createdAt: "desc" },
  });

  let finalBuffer: Buffer;
  let finalFileId: string;

  if (existingFinal) {
    const file = await readFileById(existingFinal.fileId);
    finalBuffer = file.buffer;
    finalFileId = existingFinal.fileId;
  } else {
    const final = await renderFinal({
      projectId,
      previewImage: { type: "base64", data: toDataUrl(preview.buffer, preview.mime) },
      aspectRatio: "3:2",
    });

    const finalFile = await saveBuffer(`projects/${projectId}/final`, final.buffer, final.mime, "jpg");
    await prisma.projectRender.create({
      data: {
        projectId,
        selectionId: render.selectionId,
        kind: "final",
        variantIndex: 0,
        fileId: finalFile.id,
        prompt: "final 4K",
        model: "google/gemini-nano-banana-2.1",
        costRub: final.costRub,
        approved: true,
      },
    });

    finalBuffer = final.buffer;
    finalFileId = finalFile.id;
  }

  const setting = await prisma.setting.findUnique({ where: { key: "company" } });
  const settings = settingsSchema.parse(setting?.valueJson ?? {});

  let logoBuffer: Buffer | null = null;
  if (settings.logoFileId) {
    try {
      logoBuffer = (await readFileById(settings.logoFileId)).buffer;
    } catch {
      logoBuffer = null;
    }
  }
  if (!logoBuffer) {
    try {
      const svg = await readFile(FALLBACK_LOGO, "utf8");
      logoBuffer = await sharp(Buffer.from(svg)).resize({ width: 600 }).png().toBuffer();
    } catch {
      logoBuffer = null;
    }
  }

  const orderCount = await prisma.order.count();
  const orderNumber = `ВК-${new Date().getFullYear()}-${String(orderCount + 1).padStart(4, "0")}`;

  const items = render.selection.items.map((item) => ({
    name: item.variant.name,
    article: item.variant.article,
    dimensions:
      item.variant.widthMm && item.variant.depthMm && item.variant.heightMm
        ? `${item.variant.widthMm}×${item.variant.depthMm}×${item.variant.heightMm}`
        : "",
    qty: item.qty,
    priceRub: item.unitPriceRub,
  }));

  const pdf = await buildOrderPdf({
    orderNumber,
    createdAt: new Date(),
    customerEmail: project.user.email,
    room: {
      wallLengthMm: room.wallLengthMm,
      widthMm: room.widthMm,
      heightMm: room.heightMm,
      hasWindow: room.hasWindow,
      hasDoor: room.hasDoor,
      features: String((room.featuresJson as { features?: string } | null)?.features ?? ""),
    },
    items,
    totalRub: render.selection.totalRub,
    imageBuffer: finalBuffer,
    settings,
    logoBuffer,
  });

  const pdfFile = await saveBuffer(`projects/${projectId}/orders`, pdf, "application/pdf", "pdf");

  await prisma.order.create({
    data: {
      projectId,
      userId: project.userId,
      number: orderNumber,
      status: "created",
      totalRub: render.selection.totalRub,
      pdfFileId: pdfFile.id,
      snapshotJson: {
        room: {
          wallLengthMm: room.wallLengthMm,
          widthMm: room.widthMm,
          heightMm: room.heightMm,
        },
        items,
        renderId: render.id,
        finalFileId,
      },
      items: {
        create: render.selection.items.map((item) => ({
          variantId: item.variantId,
          name: item.variant.name,
          article: item.variant.article,
          dimensions:
            item.variant.widthMm && item.variant.depthMm && item.variant.heightMm
              ? `${item.variant.widthMm}×${item.variant.depthMm}×${item.variant.heightMm}`
              : null,
          qty: item.qty,
          priceRub: item.unitPriceRub,
        })),
      },
    },
  });

  await setStatus(projectId, "done");
}
