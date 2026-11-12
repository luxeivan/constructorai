import { runImport } from "@werstakoff/catalog";

export async function processImportCatalog(options: { scrape: boolean; images: boolean }): Promise<void> {
  await runImport({
    file: process.env.CATALOG_FILE,
    scrape: options.scrape,
    images: options.images,
  });
}
