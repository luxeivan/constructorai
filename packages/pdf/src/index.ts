import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
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

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

function formatMoney(value: number): string {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatDimensions(item: PdfOrderItem): string {
  return item.dimensions || "—";
}

export async function buildOrderPdf(input: PdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  doc.registerFont("regular", FONT_REGULAR);
  doc.registerFont("bold", FONT_BOLD);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  if (input.logoBuffer) {
    try {
      doc.image(input.logoBuffer, PAGE_MARGIN, PAGE_MARGIN, { height: 34 });
      doc.y = PAGE_MARGIN + 44;
    } catch {
      doc.font("bold").fontSize(20).text(input.settings.companyName || "Верстакофф");
    }
  } else {
    doc.font("bold").fontSize(20).text(input.settings.companyName || "Верстакофф");
  }

  doc.font("regular").fontSize(9).fillColor("#555555");
  const contactLine = [input.settings.phone, input.settings.email, input.settings.site]
    .filter(Boolean)
    .join(" · ");
  if (contactLine) doc.text(contactLine);
  if (input.settings.address) doc.text(input.settings.address);
  doc.moveDown(0.8);

  doc.fillColor("#111111").font("bold").fontSize(16).text(`Коммерческое предложение № ${input.orderNumber}`);
  doc.font("regular").fontSize(10).fillColor("#555555");
  doc.text(`Дата: ${input.createdAt.toLocaleDateString("ru-RU")}`);
  doc.text(`Клиент: ${input.customerEmail}`);
  doc.moveDown(0.6);

  doc.fillColor("#111111").font("bold").fontSize(11).text("Параметры помещения");
  doc.font("regular").fontSize(10);
  doc.text(
    `Длина стены: ${input.room.wallLengthMm} мм · Ширина: ${input.room.widthMm} мм · Высота: ${input.room.heightMm} мм`,
  );
  doc.text(`Окно: ${input.room.hasWindow ? "есть" : "нет"} · Дверь: ${input.room.hasDoor ? "есть" : "нет"}`);
  if (input.room.features) doc.text(`Особенности: ${input.room.features}`);
  doc.moveDown(0.6);

  const imageWidth = CONTENT_WIDTH;
  const imageHeight = Math.min(300, imageWidth * 0.62);
  try {
    doc.image(input.imageBuffer, PAGE_MARGIN, doc.y, {
      fit: [imageWidth, imageHeight],
      align: "center",
    });
    doc.y += imageHeight + 12;
  } catch {
    doc.text("Изображение недоступно");
  }

  doc.font("bold").fontSize(11).text("Состав заказа");
  doc.moveDown(0.3);

  const columns = [
    { label: "Наименование", width: 215 },
    { label: "Артикул", width: 70 },
    { label: "Габариты, мм", width: 95 },
    { label: "Кол-во", width: 45 },
    { label: "Цена", width: 60 },
  ];

  function drawHeader(): void {
    const y = doc.y;
    doc.font("bold").fontSize(8).fillColor("#333333");
    let x = PAGE_MARGIN;
    for (const column of columns) {
      doc.text(column.label, x, y, { width: column.width, align: "left" });
      x += column.width;
    }
    doc.moveDown(0.4);
    doc
      .moveTo(PAGE_MARGIN, doc.y)
      .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
      .strokeColor("#cccccc")
      .stroke();
    doc.moveDown(0.3);
  }

  drawHeader();

  for (const item of input.items) {
    const rowY = doc.y;
    doc.font("regular").fontSize(8).fillColor("#111111");
    const nameHeight = doc.heightOfString(item.name, { width: columns[0]!.width });
    const rowHeight = Math.max(14, nameHeight);

    if (rowY + rowHeight > 780) {
      doc.addPage();
      drawHeader();
    }

    let x = PAGE_MARGIN;
    const values = [
      item.name,
      item.article,
      formatDimensions(item),
      String(item.qty),
      formatMoney(item.priceRub),
    ];
    values.forEach((value, index) => {
      const column = columns[index]!;
      doc.text(value, x, rowY, { width: column.width, align: "left" });
      x += column.width;
    });
    doc.y = rowY + rowHeight + 4;
  }

  doc.moveDown(0.4);
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor("#cccccc")
    .stroke();
  doc.moveDown(0.4);
  doc.font("bold").fontSize(11).text(`Итого: ${formatMoney(input.totalRub)}`, { align: "right" });

  doc.moveDown(1);
  doc.font("bold").fontSize(10).text("Условия");
  doc.font("regular").fontSize(9).fillColor("#333333");
  if (input.settings.paymentTerms) doc.text(`Оплата: ${input.settings.paymentTerms}`);
  if (input.settings.deliveryTerms) doc.text(`Доставка: ${input.settings.deliveryTerms}`);
  doc.text(`Предложение действительно ${input.settings.offerValidityDays} дней.`);
  if (input.settings.managerName) doc.text(`Менеджер: ${input.settings.managerName}`);
  doc.moveDown(0.6);
  doc.fontSize(8).fillColor("#777777").text(input.settings.disclaimer || "Не является публичной офертой.");

  doc.end();
  return finished;
}
