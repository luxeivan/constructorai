import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Settings } from "@werstakoff/core";

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_REGULAR = path.resolve(here, "../../../infra/assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.resolve(here, "../../../infra/assets/fonts/DejaVuSans-Bold.ttf");

export type PdfOrderItem = {
  name: string;
  article: string;
  dimensions: string;
  qty: number;
  priceRub: number;
};

export type PdfInput = {
  orderNumber: string;
  createdAt: Date;
  customerEmail: string;
  room: {
    wallLengthMm: number;
    widthMm: number;
    heightMm: number;
    hasWindow: boolean;
    hasDoor: boolean;
    features?: string | null;
  };
  items: PdfOrderItem[];
  totalRub: number;
  imageBuffer: Buffer;
  settings: Settings;
  logoBuffer?: Buffer | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = 50;

const COLOR_TEXT = rgb(0.07, 0.07, 0.07);
const COLOR_MUTED = rgb(0.33, 0.33, 0.33);
const COLOR_LINE = rgb(0.8, 0.8, 0.8);

type Fonts = { regular: PDFFont; bold: PDFFont };

function formatMoney(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

class Layout {
  page: PDFPage;
  y = MARGIN;

  constructor(
    private doc: PDFDocument,
    private fonts: Fonts,
  ) {
    this.page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.y = MARGIN;
  }

  ensure(height: number): void {
    if (this.y + height > PAGE_HEIGHT - BOTTOM) this.newPage();
  }

  text(
    value: string,
    options: {
      font?: "regular" | "bold";
      size?: number;
      color?: RGB;
      x?: number;
      width?: number;
      lineHeight?: number;
      align?: "left" | "right";
    } = {},
  ): void {
    const font = this.fonts[options.font ?? "regular"];
    const size = options.size ?? 10;
    const width = options.width ?? CONTENT_WIDTH;
    const lineHeight = options.lineHeight ?? size * 1.35;
    const x = options.x ?? MARGIN;

    for (const line of wrap(value, font, size, width)) {
      this.ensure(lineHeight);
      const textWidth = font.widthOfTextAtSize(line, size);
      const drawX = options.align === "right" ? x + width - textWidth : x;
      this.page.drawText(line, {
        x: drawX,
        y: PAGE_HEIGHT - this.y - size,
        size,
        font,
        color: options.color ?? COLOR_TEXT,
      });
      this.y += lineHeight;
    }
  }

  gap(value: number): void {
    this.y += value;
  }

  row(
    cells: Array<{ value: string; x: number; width: number; font?: "regular" | "bold" }>,
    size = 8,
    color: RGB = COLOR_TEXT,
  ): void {
    const prepared = cells.map((cell) => ({
      ...cell,
      lines: wrap(cell.value, this.fonts[cell.font ?? "regular"], size, cell.width),
    }));
    const lineCount = Math.max(...prepared.map((cell) => cell.lines.length));
    const lineHeight = size * 1.35;
    const height = lineCount * lineHeight + 3;
    this.ensure(height);
    const top = this.y;
    for (const cell of prepared) {
      const font = this.fonts[cell.font ?? "regular"];
      cell.lines.forEach((line, index) => {
        this.page.drawText(line, {
          x: cell.x,
          y: PAGE_HEIGHT - top - size - index * lineHeight,
          size,
          font,
          color,
        });
      });
    }
    this.y = top + height;
  }

  line(): void {
    this.ensure(10);
    this.page.drawLine({
      start: { x: MARGIN, y: PAGE_HEIGHT - this.y },
      end: { x: PAGE_WIDTH - MARGIN, y: PAGE_HEIGHT - this.y },
      thickness: 0.7,
      color: COLOR_LINE,
    });
    this.y += 8;
  }
}

export async function buildOrderPdf(input: PdfInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const fonts: Fonts = {
    regular: await doc.embedFont(await readFile(FONT_REGULAR), { subset: true }),
    bold: await doc.embedFont(await readFile(FONT_BOLD), { subset: true }),
  };

  const layout = new Layout(doc, fonts);
  const company = input.settings.companyName || "Верстакофф";

  if (input.logoBuffer) {
    try {
      const logo = input.logoBuffer.toString("latin1").startsWith("\x89PNG")
        ? await doc.embedPng(input.logoBuffer)
        : await doc.embedJpg(input.logoBuffer);
      const logoHeight = 34;
      const logoWidth = (logo.width / logo.height) * logoHeight;
      layout.page.drawImage(logo, {
        x: MARGIN,
        y: PAGE_HEIGHT - layout.y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
      layout.y += logoHeight + 10;
    } catch {
      layout.text(company, { font: "bold", size: 20 });
    }
  } else {
    layout.text(company, { font: "bold", size: 20 });
  }

  const contactLine = [input.settings.phone, input.settings.email, input.settings.site].filter(Boolean).join(" · ");
  if (contactLine) layout.text(contactLine, { size: 9, color: COLOR_MUTED });
  if (input.settings.address) layout.text(input.settings.address, { size: 9, color: COLOR_MUTED });
  layout.gap(10);

  layout.text(`Коммерческое предложение № ${input.orderNumber}`, { font: "bold", size: 16 });
  layout.text(`Дата: ${input.createdAt.toLocaleDateString("ru-RU")}`, { size: 10, color: COLOR_MUTED });
  layout.text(`Клиент: ${input.customerEmail}`, { size: 10, color: COLOR_MUTED });
  layout.gap(10);

  layout.text("Параметры помещения", { font: "bold", size: 11 });
  layout.text(
    `Длина стены: ${input.room.wallLengthMm} мм · Ширина: ${input.room.widthMm} мм · Высота: ${input.room.heightMm} мм`,
    { size: 10 },
  );
  layout.text(`Окно: ${input.room.hasWindow ? "есть" : "нет"} · Дверь: ${input.room.hasDoor ? "есть" : "нет"}`, {
    size: 10,
  });
  if (input.room.features) layout.text(`Особенности: ${input.room.features}`, { size: 10 });
  layout.gap(10);

  try {
    const image = input.imageBuffer.toString("latin1").startsWith("\x89PNG")
      ? await doc.embedPng(input.imageBuffer)
      : await doc.embedJpg(input.imageBuffer);
    const maxHeight = 300;
    const scale = Math.min(CONTENT_WIDTH / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    layout.ensure(height + 10);
    layout.page.drawImage(image, {
      x: MARGIN + (CONTENT_WIDTH - width) / 2,
      y: PAGE_HEIGHT - layout.y - height,
      width,
      height,
    });
    layout.y += height + 12;
  } catch {
    layout.text("Изображение недоступно", { size: 9, color: COLOR_MUTED });
  }

  const columns = [
    { label: "Наименование", width: 205 },
    { label: "Артикул", width: 70 },
    { label: "Габариты, мм", width: 95 },
    { label: "Кол-во", width: 45 },
    { label: "Цена", width: 70 },
  ];

  const drawHeader = (): void => {
    let x = MARGIN;
    layout.row(
      columns.map((column) => {
        const cell = { value: column.label, x, width: column.width, font: "bold" as const };
        x += column.width;
        return cell;
      }),
      8,
      COLOR_MUTED,
    );
    layout.line();
  };

  layout.text("Состав заказа", { font: "bold", size: 11 });
  layout.gap(4);
  drawHeader();

  for (const item of input.items) {
    const values = [
      item.name,
      item.article,
      item.dimensions || "—",
      String(item.qty),
      formatMoney(item.priceRub),
    ];

    let x = MARGIN;
    const cells = values.map((value, index) => {
      const column = columns[index]!;
      const cell = { value, x, width: column.width };
      x += column.width;
      return cell;
    });

    const estimated = Math.max(
      ...cells.map((cell, index) => wrap(cell.value, fonts.regular, 8, columns[index]!.width).length),
    );
    if (layout.y + estimated * 10.8 + 6 > PAGE_HEIGHT - BOTTOM) {
      layout.newPage();
      drawHeader();
    }

    layout.row(cells);
    layout.line();
  }

  layout.gap(2);
  layout.text(`Итого: ${formatMoney(input.totalRub)}`, { font: "bold", size: 11, align: "right" });

  layout.gap(10);
  layout.text("Условия", { font: "bold", size: 10 });
  if (input.settings.paymentTerms) layout.text(`Оплата: ${input.settings.paymentTerms}`, { size: 9, color: COLOR_MUTED });
  if (input.settings.deliveryTerms)
    layout.text(`Доставка: ${input.settings.deliveryTerms}`, { size: 9, color: COLOR_MUTED });
  layout.text(`Предложение действительно ${input.settings.offerValidityDays} дней.`, { size: 9, color: COLOR_MUTED });
  if (input.settings.managerName) layout.text(`Менеджер: ${input.settings.managerName}`, { size: 9, color: COLOR_MUTED });
  layout.gap(8);
  layout.text(input.settings.disclaimer || "Не является публичной офертой.", { size: 8, color: COLOR_MUTED });

  return Buffer.from(await doc.save());
}
