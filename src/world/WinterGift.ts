import { GiftStore, validGiftContent, validGiftDetails } from "./GiftStore";
import type { GiftConfig, GiftMode, WorldConfig } from "./types";

export type GiftDraft = { recipient: string; sender: string; memory: string; letter: string; photos: string[] };
export const WINTER_GIFT_ID = "winter-local-v1";
export const LEGACY_DRAFT_KEY = "promised-land:winter:draft:v1";
export const EXAMPLE_GIFT_ID = "promised-land-example-v1";
export const giftMemories = [
  { object_id: "sunset-frame", title: "相框" },
  { object_id: "sealed-letter", title: "信件" },
  { object_id: "cd-player", title: "CD 机" },
] as const;
export const collectionKey = (giftId: string) => `promised-land:gift:${giftId}:collection:v2`;

export function openGift(base: GiftConfig, world: WorldConfig, giftId: string, mode: GiftMode, storage?: Pick<Storage, "getItem" | "setItem">): GiftStore {
  if (giftId === EXAMPLE_GIFT_ID) return new GiftStore({ ...base, gift_id: giftId }, world, "recipient");
  return giftId === WINTER_GIFT_ID ? openWinterGift(base, world, mode, storage) : new GiftStore({ ...base, gift_id: giftId }, world, mode, storage);
}
const frameId = "sunset-frame";
const letterId = "sealed-letter";

export function draftFromGift(gift: GiftConfig): GiftDraft {
  const frame = gift.object_contents[frameId], letter = gift.object_contents[letterId];
  return {
    recipient: gift.details?.recipient ?? "", sender: gift.details?.sender ?? "", memory: gift.details?.memory ?? "",
    letter: letter?.kind === "letter" ? letter.body : "",
    photos: [...(frame?.kind === "photo_frame" && frame.photo ? [frame.photo] : []), ...(gift.details?.extra_photos ?? [])],
  };
}

export function giftWithDraft(gift: GiftConfig, draft: GiftDraft): GiftConfig {
  const next = structuredClone(gift);
  next.details = { recipient: draft.recipient, sender: draft.sender, memory: draft.memory, extra_photos: draft.photos.slice(1) };
  next.object_contents[letterId] = { kind: "letter", body: draft.letter };
  const frame = next.object_contents[frameId], photo = draft.photos[0] ?? null;
  if (frame?.kind !== "photo_frame" || frame.photo !== photo) {
    next.object_contents[frameId] = { kind: "photo_frame", photo, zoom: 1, position_x: .5, position_y: .5 };
  }
  return next;
}

/** Read-only compatibility: canonical contents win; legacy data only supplies missing fields.
 * No initialization writes. The next successful save persists one complete canonical document.
 */
export function openWinterGift(base: GiftConfig, world: WorldConfig, mode: GiftMode, storage?: Pick<Storage, "getItem" | "setItem">): GiftStore {
  const canonical = new GiftStore({ ...base, gift_id: WINTER_GIFT_ID }, world, mode, storage);
  if (canonical.read().details || canonical.warning || !storage) return canonical;
  try {
    const raw: unknown = JSON.parse(storage.getItem(LEGACY_DRAFT_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return canonical;
    const draft = raw as GiftDraft;
    if (![draft.recipient, draft.sender, draft.memory, draft.letter].every(text => typeof text === "string") || !Array.isArray(draft.photos)) return canonical;
    const photos = draft.photos.filter(photo => typeof photo === "string" && validGiftContent({ kind: "photo_frame", photo, zoom: 1, position_x: .5, position_y: .5 })).slice(0, 3);
    const migrated = giftWithDraft({ ...base, gift_id: WINTER_GIFT_ID }, { ...draft, photos });
    if (!validGiftDetails(migrated.details) || !validGiftContent(migrated.object_contents[letterId])) return canonical;
    return new GiftStore(migrated, world, mode, storage);
  } catch {
    canonical.warning = "保存记录无法读取，已显示默认内容。";
    return canonical;
  }
}
