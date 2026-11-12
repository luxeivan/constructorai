export const AI_QUEUE = "ai";

export type AiJobPayload =
  | { type: "validate-photo"; projectId: string }
  | { type: "clean-room"; projectId: string }
  | { type: "room-features"; projectId: string }
  | { type: "select"; projectId: string }
  | { type: "render"; projectId: string; selectionId: string; variantCount: number; reason: "initial" | "correction" }
  | { type: "correct"; projectId: string; correctionId: string }
  | { type: "finalize"; projectId: string; renderId: string }
  | { type: "import-catalog"; options: { scrape: boolean; images: boolean } }
  | { type: "retention" };

export type ProjectEvent = {
  status: string;
  message?: string;
  error?: string;
  payload?: Record<string, unknown>;
};

export function projectChannel(projectId: string): string {
  return `project:${projectId}`;
}
