import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import { categorySlugFromSiteName } from "./categories.js";

const SITE = "https://werstakoff.ru";
const CACHE_DIR = path.resolve(process.cwd(), ".cache/scrape");

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WerstakoffConstructor/1.0)",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`);
  return response.text();
}

async function cachedItemHtml(itemId: number): Promise<string> {
  const file = path.join(CACHE_DIR, "items", `${itemId}.html`);
  if (existsSync(file)) return readFile(file, "utf8");
  const html = await fetchHtml(`${SITE}/catalog/item${itemId}.html`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
  return html;
}

export type ItemCategory = {
  itemId: number;
  categorySlug: string;
  breadcrumbs: string[];
};

export async function scrapeItemCategory(itemId: number): Promise<ItemCategory> {
  const html = await cachedItemHtml(itemId);
  const $ = load(html);
  const breadcrumbs: string[] = [];
  $("[class*=breadcrumb] a").each((_, element) => {
    const text = $(element).text().replace(/\s+/g, " ").trim();
    if (text && !breadcrumbs.includes(text)) breadcrumbs.push(text);
  });

  let categorySlug = "other";
  for (let index = breadcrumbs.length - 1; index >= 0; index -= 1) {
    const slug = categorySlugFromSiteName(breadcrumbs[index]!);
    if (slug !== "other") {
      categorySlug = slug;
      break;
    }
  }

  return { itemId, categorySlug, breadcrumbs };
}

export async function scrapeItemCategories(
  itemIds: number[],
  options: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<Map<number, ItemCategory>> {
  const concurrency = options.concurrency ?? 5;
  const result = new Map<number, ItemCategory>();
  let cursor = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (cursor < itemIds.length) {
      const index = cursor;
      cursor += 1;
      const itemId = itemIds[index]!;
      try {
        result.set(itemId, await scrapeItemCategory(itemId));
      } catch (error) {
        console.warn(`Не удалось получить категорию для ${itemId}:`, (error as Error).message);
      }
      done += 1;
      options.onProgress?.(done, itemIds.length);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return result;
}

export async function downloadItemImage(picture: string): Promise<Buffer | null> {
  if (!picture) return null;
  const url = picture.startsWith("http") ? picture : `${SITE}${picture}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; WerstakoffConstructor/1.0)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  }
}
