import type { WizardAnswers } from "./schemas.js";

export type RoomFeatures = {
  roomType: string;
  widthRange: string;
  depthRange: string;
  heightRange: string;
  hasWindow: boolean;
  hasDoor: boolean;
  clutterLevel: number;
  notes?: string;
};

export type CatalogVariant = {
  id: string;
  externalId: number;
  modelId: string;
  modelName: string;
  name: string;
  article: string;
  categorySlug: string;
  priceRub: number;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  color: string | null;
  shelfLoadKg: number | null;
  imageUrl: string | null;
  isActive: boolean;
  hasDimensions: boolean;
};

export type LayoutPlacement = {
  variantId: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rotation: 0 | 90;
  qty: number;
};

export type LayoutResult = {
  placements: LayoutPlacement[];
  usedAreaMm2: number;
  freeAreaMm2: number;
  fillRatio: number;
  warnings: string[];
};

export type SelectionItem = {
  variantId: string;
  modelId: string;
  name: string;
  article: string;
  qty: number;
  unitPriceRub: number;
  totalRub: number;
  widthMm: number | null;
  depthMm: number | null;
  heightMm: number | null;
  imageUrl: string | null;
  reason?: string;
};

export type ProjectPayload = {
  answers: WizardAnswers;
  room: {
    wallLengthMm: number;
    widthMm: number;
    heightMm: number;
    hasWindow: boolean;
    hasDoor: boolean;
    features: string;
  };
};

export type JevValidation = {
  isRoom: number;
  hasFloor: number;
  hasWall2m: number;
  hasPeople: number;
  isInappropriate: number;
  roomType: string;
  widthRange: string;
  depthRange: string;
  heightRange: string;
  clutterLevel: number;
};

export type CorrectionIntent =
  | "add"
  | "remove"
  | "replace"
  | "color"
  | "layout"
  | "quantity"
  | "budget"
  | "other";
