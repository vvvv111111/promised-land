/** Budgets apply across every continuation, not just one model request. */
export const ROOM_GENERATION_TIMEOUT_MS = 180_000;
export const ROOM_MAX_ATTEMPTS = 6;
export const ROOM_MAX_REPEATED_ISSUES = 3;
export const ROOM_ATTEMPT_TIMEOUT_MS = 170_000;
export const ROOM_REQUEST_TIMEOUT_MS = 180_000;

export interface RoomGenerationProgress {
  status: "repairing";
  generationId: string;
  attempts: number;
  message: string;
}

export function isRoomGenerationProgress(value: unknown): value is RoomGenerationProgress {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<RoomGenerationProgress>;
  return data.status === "repairing" && typeof data.generationId === "string" && /^[0-9a-f-]{36}$/.test(data.generationId)
    && Number.isSafeInteger(data.attempts) && data.attempts! >= 0 && typeof data.message === "string" && data.message.length <= 300;
}
