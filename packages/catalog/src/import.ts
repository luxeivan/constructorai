import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@werstakoff/db";
import { putObject } from "@werstakoff/storage";
import sharp from "sharp";
import { TOP_CATEGORIES, classifyCategory } from "./categories.js";
import {
  extractArticle,
  extractColor,
  extractDimensions,
  extractShelfLoad,
  isAvailable,
  modelKey,
  modelName,
  type RawItem,
} from "./normalize.js";
import { downloadItemImage, scrapeItemCategories } from "./scraper.js";

export type ImportOptions = {
  file?: string;
  scrape?: boolean;
  images?: boolean;
  limit?: number | null;
};

type Options = {
  file: string;
  scrape: boolean;
  images: boolean;
  limit: number | null;
};

function parseArgs(argv: string[]): Options {
  const options: Options = {
    file: path.resolve(process.cwd(), "../../items.json"),
    scrape: false,
    images: false,
    limit: null,
  };
  for (const arg of argv) {
    if (arg === "--scrape") options.scrape = true;
    else if (arg === "--images") options.images = true;
    else if (arg.startsWith("--file=")) options.file = path.resolve(arg.slice(7));
    else if (arg.startsWith("--limit=")) options.limit = Number(arg.slice(8));
  }
  return options;
}

async function loadItems(file: string): Promise<RawItem[]> {
  const raw = await readFile(file, "utf8");
  const parsed = JSON.parse(raw) as Record<string, RawItem>;
  return Object.values(parsed);
}

async function uploadImage(item: RawItem): Promise<string | null> {
  const source = await downloadItemImage(item.picture);
  if (!source) return null;

  const processed = await sharp(source)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  const key = `catalog/${item.id}.webp`;
  await putObject(key, processed, "image/webp");
  const bucket = process.env.MINIO_BUCKET ?? "werstakoff";
  const file = await prisma.fileObject.upsert({
    where: { bucket_key: { bucket, key } },
    update: { size: processed.length, mime: "image/webp" },
    create: { bucket, key, mime: "image/webp", size: processed.length },
  });
  return file.id;
}

export async function runImport(input: ImportOptions = {}): Promise<void> {
  const options: Options = {
    file: input.file ?? path.resolve(process.cwd(), "../../items.json"),
    scrape: input.scrape ?? false,
    images: input.images ?? false,
    limit: input.limit ?? null,
  };
  console.log(`Импорт каталога: ${options.file}`);

  let items = await loadItems(options.file);
  if (options.limit) items = items.slice(0, options.limit);
  console.log(`Товаров: ${items.length}`);

  const categoryIds = new Map<string, string>();
  for (const [index, category] of TOP_CATEGORIES.entries()) {
    const record = await prisma.catalogCategory.upsert({
      where: { slug: category.slug },
      update: { name: category.name, sort: index },
      create: { slug: category.slug, name: category.name, sort: index },
    });
    categoryIds.set(category.slug, record.id);
  }
  console.log(`Категорий: ${categoryIds.size}`);

  const siteCategories = options.scrape
    ? await scrapeItemCategories(
        items.map((item) => item.id),
        {
          concurrency: 5,
          onProgress: (done, total) => {
            if (done % 100 === 0 || done === total) console.log(`  скрапинг ${done}/${total}`);
          },
        },
      )
    : new Map();

  const modelIds = new Map<string, string>();
  let created = 0;
  let skipped = 0;
  const imageByExternalId = new Map<number, string>();
  if (options.images) {
    const available = items.filter(isAvailable);
    const existing = await prisma.catalogVariant.findMany({
      where: { externalId: { in: available.map((item) => item.id) } },
      select: { externalId: true, imageFileId: true },
    });
    for (const variant of existing) {
      if (variant.imageFileId) imageByExternalId.set(variant.externalId, variant.imageFileId);
    }

    const missing = available.filter((item) => !imageByExternalId.has(item.id));
    let processed = 0;
    await mapLimit(missing, 8, async (item) => {
      const fileId = await uploadImage(item);
      if (fileId) imageByExternalId.set(item.id, fileId);
      processed += 1;
      if (processed % 100 === 0) console.log(`  изображений ${processed}/${missing.length}`);
    });
    console.log(`  изображений готово: ${imageByExternalId.size}, скачано: ${missing.length}`);
  }

  let imagesUploaded = 0;

  for (const [index, item] of items.entries()) {
    if (!isAvailable(item)) {
      skipped += 1;
      continue;
    }

    const siteCategory = siteCategories.get(item.id);
    const categorySlug = siteCategory?.categorySlug ?? classifyCategory(item.name).slug;
    const categoryId = categoryIds.get(categorySlug) ?? categoryIds.get("other")!;
    const dimensions = extractDimensions(item, categorySlug);
    const hasDimensions = Boolean(dimensions.widthMm && dimensions.depthMm && dimensions.heightMm);

    const key = `${categorySlug}:${modelKey(item.name)}`;
    let modelId = modelIds.get(key);
    if (!modelId) {
      const name = modelName(item.name);
      const model = await prisma.catalogModel.upsert({
        where: { categoryId_name: { categoryId, name } },
        update: {},
        create: {
          categoryId,
          name,
          brandSeries: item.props?.SERIYA_STELLAJEI ?? item.props?.SERIES ?? null,
          description: item.preview ?? null,
        },
      });
      modelId = model.id;
      modelIds.set(key, modelId);
    }

    const imageFileId = options.images ? imageByExternalId.get(item.id) ?? null : null;
    if (imageFileId) imagesUploaded += 1;
    if ((index + 1) % 200 === 0) console.log(`  обработано ${index + 1}/${items.length}, изображений ${imagesUploaded}`);

    const variant = await prisma.catalogVariant.upsert({
      where: { externalId: item.id },
      update: {
        modelId,
        article: extractArticle(item),
        name: item.name,
        priceRub: Math.round(item.price),
        widthMm: dimensions.widthMm,
        depthMm: dimensions.depthMm,
        heightMm: dimensions.heightMm,
        color: extractColor(item),
        shelfLoadKg: extractShelfLoad(item),
        isActive: true,
        hasDimensions,
        rawJson: item as unknown as object,
        ...(imageFileId ? { imageFileId } : {}),
      },
      create: {
        modelId,
        externalId: item.id,
        article: extractArticle(item),
        name: item.name,
        priceRub: Math.round(item.price),
        widthMm: dimensions.widthMm,
        depthMm: dimensions.depthMm,
        heightMm: dimensions.heightMm,
        color: extractColor(item),
        shelfLoadKg: extractShelfLoad(item),
        isActive: true,
        hasDimensions,
        rawJson: item as unknown as object,
        imageFileId,
      },
    });

    await prisma.catalogProp.deleteMany({ where: { variantId: variant.id } });
    const props = Object.entries(item.props ?? {});
    if (props.length > 0) {
      await prisma.catalogProp.createMany({
        data: props.map(([propKey, value]) => {
          const numeric = Number.parseFloat(String(value ?? "").replace(",", "."));
          return {
            variantId: variant.id,
            key: propKey,
            valueText: value ? String(value).slice(0, 2000) : null,
            valueNum: Number.isFinite(numeric) ? numeric : null,
          };
        }),
      });
    }

    created += 1;
    if (created % 100 === 0) {
      console.log(`  обработано ${created}/${items.length} (изображений: ${imagesUploaded})`);
    }
    void index;
  }

  console.log(`Готово: вариантов ${created}, пропущено без цены ${skipped}, изображений ${imagesUploaded}`);
}

const isCli = process.argv[1]?.includes("import");
if (isCli) {
  runImport(parseArgs(process.argv.slice(2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

async function mapLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}
