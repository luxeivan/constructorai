import { LAYOUT_RULES, type LayoutPlacement, type LayoutResult } from "@werstakoff/core";

export type PackingItem = {
  variantId: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  categorySlug: string;
};

export type PackingRoom = {
  wallLengthMm: number;
  widthMm: number;
  heightMm: number;
  hasDoor: boolean;
};

type Footprint = { width: number; depth: number; rotation: 0 | 90 };

function footprint(item: PackingItem, rotated: boolean): Footprint {
  return rotated
    ? { width: item.depthMm, depth: item.widthMm, rotation: 90 }
    : { width: item.widthMm, depth: item.depthMm, rotation: 0 };
}

export function fitsRoom(item: PackingItem, room: PackingRoom): boolean {
  if (item.heightMm > room.heightMm) return false;
  const normal = item.widthMm <= room.wallLengthMm && item.depthMm <= room.widthMm;
  const rotated = item.depthMm <= room.wallLengthMm && item.widthMm <= room.widthMm;
  return normal || rotated;
}

export function packItems(room: PackingRoom, items: PackingItem[]): LayoutResult {
  const { wallGapMm, aisleMm, doorGapMm } = LAYOUT_RULES;
  const usableWidth = room.wallLengthMm - wallGapMm * 2;
  const usableDepth = room.widthMm - wallGapMm * 2 - (room.hasDoor ? doorGapMm : 0);

  const sorted = [...items]
    .filter((item) => fitsRoom(item, room))
    .sort((a, b) => b.widthMm * b.depthMm - a.widthMm * a.depthMm);

  const placements: LayoutPlacement[] = [];
  const warnings: string[] = [];
  let cursorX = wallGapMm;
  let cursorY = wallGapMm;
  let rowDepth = 0;

  for (const item of sorted) {
    let chosen: Footprint | null = null;
    for (const rotated of [false, true]) {
      const candidate = footprint(item, rotated);
      if (candidate.width <= usableWidth && candidate.depth <= usableDepth) {
        chosen = candidate;
        break;
      }
    }
    if (!chosen) {
      warnings.push(`Не помещается: ${item.variantId}`);
      continue;
    }

    if (cursorX + chosen.width > wallGapMm + usableWidth) {
      cursorX = wallGapMm;
      cursorY += rowDepth + aisleMm;
      rowDepth = 0;
    }

    if (cursorY + chosen.depth > wallGapMm + usableDepth) {
      warnings.push(`Не хватило места в ряду: ${item.variantId}`);
      continue;
    }

    placements.push({
      variantId: item.variantId,
      x: cursorX,
      y: cursorY,
      width: chosen.width,
      depth: chosen.depth,
      rotation: chosen.rotation,
      qty: 1,
    });

    cursorX += chosen.width;
    rowDepth = Math.max(rowDepth, chosen.depth);
  }

  const usedAreaMm2 = placements.reduce((sum, placement) => sum + placement.width * placement.depth, 0);
  const roomAreaMm2 = room.wallLengthMm * room.widthMm;
  const freeAreaMm2 = Math.max(0, roomAreaMm2 - usedAreaMm2);

  return {
    placements,
    usedAreaMm2,
    freeAreaMm2,
    fillRatio: roomAreaMm2 > 0 ? usedAreaMm2 / roomAreaMm2 : 0,
    warnings,
  };
}

export function buildLayoutHint(layout: LayoutResult, categories: Map<string, string>): string {
  if (layout.placements.length === 0) return "мебель не помещается";

  const rows = new Map<number, string[]>();
  for (const placement of layout.placements) {
    const row = Math.round(placement.y / 100);
    const name = categories.get(placement.variantId) ?? "позиция";
    const list = rows.get(row) ?? [];
    list.push(name);
    rows.set(row, list);
  }

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, names], index) => `ряд ${index + 1} (от дальней стены): ${names.join(", ")}`)
    .join("; ");
}

export function summarizeLayout(layout: LayoutResult): string {
  return `заполнение ${Math.round(layout.fillRatio * 100)}%, свободно ${(layout.freeAreaMm2 / 1_000_000).toFixed(1)} м²`;
}
