export type RawItem = {
  id: number;
  name: string;
  code: string;
  url: string;
  price: number;
  picture: string;
  section: number;
  preview?: string;
  detail?: string;
  props?: Record<string, string | undefined>;
  props_num?: Record<string, number | undefined>;
};

export type Dimensions = {
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
};

const MIN_MM = 100;
const MAX_MM = 10_000;

function toNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDimension(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < MIN_MM || value > MAX_MM) return null;
  return Math.round(value);
}

export function parseTriple(text: string | undefined | null): [number, number, number] | null {
  if (!text) return null;
  const normalized = text
    .replace(/[хХ]/g, "x")
    .replace(/\*/g, "x")
    .replace(/,/g, ".")
    .replace(/мм/gi, " ");
  const matches = normalized.match(/\(?\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?\)?/g);
  if (!matches) return null;
  const numbers: number[] = [];
  for (const match of matches) {
    const range = match.match(/\d+(?:\.\d+)?/g);
    if (!range) continue;
    const values = range.map((value) => Number.parseFloat(value)).filter((value) => Number.isFinite(value));
    if (values.length === 0) continue;
    numbers.push(Math.max(...values));
  }
  if (numbers.length < 3) return null;
  return [numbers[0]!, numbers[1]!, numbers[2]!];
}

function isVerticalFirst(categorySlug: string): boolean {
  return ["shelving", "cabinets", "parking", "antistatic", "components"].includes(categorySlug);
}

export function extractDimensions(item: RawItem, categorySlug: string): Dimensions {
  const props = item.props ?? {};

  const stelHeight = toNumber(props.stel11);
  const stelDepth = toNumber(props.stel12);
  const stelWidth = toNumber(props.stel13);
  if (stelHeight && stelDepth && stelWidth) {
    return {
      widthMm: normalizeDimension(stelWidth),
      depthMm: normalizeDimension(stelDepth),
      heightMm: normalizeDimension(stelHeight),
    };
  }

  const vWidth = toNumber(props.V4);
  const vDepth = toNumber(props.V5);
  const vHeight = toNumber(props.V6);
  if (vWidth && vDepth && vHeight) {
    return {
      widthMm: normalizeDimension(vWidth),
      depthMm: normalizeDimension(vDepth),
      heightMm: normalizeDimension(vHeight),
    };
  }

  const nameTriple = parseTriple(item.name);
  const a1Triple = parseTriple(props.A1);

  const triple = a1Triple ?? nameTriple;
  if (!triple) return { widthMm: null, depthMm: null, heightMm: null };

  const explicitOrder = /ВхШхГ/i.test(item.name);
  if (explicitOrder) {
    return {
      heightMm: normalizeDimension(triple[0]),
      widthMm: normalizeDimension(triple[1]),
      depthMm: normalizeDimension(triple[2]),
    };
  }

  if (isVerticalFirst(categorySlug)) {
    return {
      heightMm: normalizeDimension(triple[0]),
      widthMm: normalizeDimension(triple[1]),
      depthMm: normalizeDimension(triple[2]),
    };
  }

  return {
    widthMm: normalizeDimension(triple[0]),
    depthMm: normalizeDimension(triple[1]),
    heightMm: normalizeDimension(triple[2]),
  };
}

export function extractShelfLoad(item: RawItem): number | null {
  const props = item.props ?? {};
  const raw = toNumber(props.stel2) ?? toNumber(props.stel1);
  if (raw && raw > 0) return Math.round(raw);

  const matches = item.name.match(/(\d+)\s*кг/gi);
  if (!matches) return null;
  const values = matches
    .map((match) => Number.parseInt(match, 10))
    .filter((value) => Number.isFinite(value));
  return values.length > 0 ? Math.max(...values) : null;
}

export function extractColor(item: RawItem): string | null {
  const props = item.props ?? {};
  const value = props.V11 ?? props.P9;
  if (!value) return null;
  const trimmed = value.replace(/a:\d+:\{[\s\S]*$/, "").trim();
  return trimmed ? trimmed.slice(0, 120) : null;
}

export function extractArticle(item: RawItem): string {
  return (item.props?.ARTICLE ?? item.code ?? String(item.id)).trim();
}

export function isAvailable(item: RawItem): boolean {
  return Number(item.price) > 0;
}

export function modelKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(?:[.,]\d+)?\s*[xх*]\s*\d+(?:[.,]\d+)?\s*[xх*]\s*\d+(?:[.,]\d+)?\s*(?:мм)?/gi, " ")
    .replace(/\bвхшхг\b/gi, " ")
    .replace(/[-–]\s*\d+\s*(?:fr|r|f|m|к)?\s*$/gi, " ")
    .replace(/[-–]\s*(?:fr|r|f|m|к)\s*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function modelName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}
