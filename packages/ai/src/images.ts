import { assertBudget, withUsage } from "./budget.js";
import { generateImage, estimateMediaCost, type ImagePart } from "./polza.js";
import {
  CLEAN_ROOM_PROMPT,
  FINAL_RENDER_PROMPT,
  buildRenderPrompt,
  type RenderProduct,
} from "./prompts.js";

const CLEAN_MODEL = "google/gemini-3.1-flash-lite-image";
const RENDER_MODEL = "google/gemini-nano-banana-2.1";

export async function cleanRoom(input: {
  projectId: string;
  image: ImagePart;
  aspectRatio?: string;
}): Promise<{ buffer: Buffer; mime: string; costRub: number }> {
  await assertBudget(input.projectId, estimateMediaCost(CLEAN_MODEL, "1K"));

  return withUsage(
    { projectId: input.projectId, step: "clean_room", model: CLEAN_MODEL },
    async () => {
      const result = await generateImage({
        model: CLEAN_MODEL,
        prompt: CLEAN_ROOM_PROMPT,
        resolution: "1K",
        aspectRatio: input.aspectRatio ?? "3:2",
        images: [input.image],
      });
      return { result, costRub: result.costRub };
    },
  );
}

export async function renderPreview(input: {
  projectId: string;
  roomImage: ImagePart;
  productImages: ImagePart[];
  products: RenderProduct[];
  layoutHint: string;
  roomType?: string | null;
  colorHint?: string | null;
  aspectRatio?: string;
  seed?: number;
}): Promise<{ buffer: Buffer; mime: string; costRub: number; prompt: string }> {
  await assertBudget(input.projectId, estimateMediaCost(RENDER_MODEL, "1K"));

  const prompt = buildRenderPrompt({
    products: input.products,
    layoutHint: input.layoutHint,
    roomType: input.roomType,
    colorHint: input.colorHint,
  });

  const images: ImagePart[] = [input.roomImage, ...input.productImages.slice(0, 8)];

  return withUsage(
    { projectId: input.projectId, step: "render_preview", model: RENDER_MODEL },
    async () => {
      const result = await generateImage({
        model: RENDER_MODEL,
        prompt,
        resolution: "1K",
        aspectRatio: input.aspectRatio ?? "3:2",
        images,
        seed: input.seed,
      });
      return { result: { ...result, prompt }, costRub: result.costRub };
    },
  );
}

export async function renderFinal(input: {
  projectId: string;
  previewImage: ImagePart;
  aspectRatio?: string;
}): Promise<{ buffer: Buffer; mime: string; costRub: number }> {
  await assertBudget(input.projectId, estimateMediaCost(RENDER_MODEL, "4K"));

  return withUsage(
    { projectId: input.projectId, step: "render_final", model: RENDER_MODEL },
    async () => {
      const result = await generateImage({
        model: RENDER_MODEL,
        prompt: FINAL_RENDER_PROMPT,
        resolution: "4K",
        aspectRatio: input.aspectRatio ?? "3:2",
        images: [input.previewImage],
      });
      return { result, costRub: result.costRub };
    },
  );
}
