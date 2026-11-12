import type { WizardAnswers } from "@werstakoff/core";

const ZONE_TO_SLUG: Record<string, string[]> = {
  workbench: ["workbenches"],
  shelving: ["shelving"],
  cabinet: ["cabinets"],
  cart: ["carts"],
  pedestal: ["pedestals"],
  welding: ["welding"],
  antistatic: ["antistatic"],
  assembly: ["tables"],
};

const STORAGE_TO_SLUG: Record<string, string[]> = {
  tools: ["workbenches", "cabinets", "carts"],
  parts: ["shelving", "pedestals"],
  documents: ["shelving", "cabinets"],
  heavy: ["shelving"],
  ppe: ["cabinets"],
  oversized: ["shelving"],
  none: ["workbenches", "tables"],
};

export function desiredCategories(answers: WizardAnswers): Set<string> {
  const result = new Set<string>();
  const zones = Array.isArray(answers.zones) ? answers.zones : [];
  for (const zone of zones) {
    for (const slug of ZONE_TO_SLUG[String(zone)] ?? []) result.add(slug);
  }
  const storage = Array.isArray(answers.storage_type) ? answers.storage_type : [];
  for (const type of storage) {
    for (const slug of STORAGE_TO_SLUG[String(type)] ?? []) result.add(slug);
  }
  if (answers.antistatic === true) result.add("antistatic");
  if (result.size === 0) result.add("workbenches");
  return result;
}

export function budgetMax(answers: WizardAnswers): number | null {
  const value = String(answers.budget ?? "");
  if (value === "100000") return 100_000;
  if (value === "300000") return 300_000;
  if (value === "700000") return 700_000;
  return null;
}

export function requiredLoad(answers: WizardAnswers): number {
  const value = String(answers.shelf_load ?? "120");
  if (value === "700plus") return 700;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 120;
}

export function colorCode(answers: WizardAnswers): string | null {
  const value = String(answers.color ?? "any");
  if (value === "ral7047") return "7047";
  if (value === "ral5015") return "5015";
  if (value === "ral9011") return "9011";
  return null;
}
