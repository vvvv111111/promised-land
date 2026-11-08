import { openGift } from "../../world/WinterGift";
import { demoWorld } from "../../world/config";
import demoGift from "../../world/demo-gift.json";
import type { GiftConfig } from "../../world/types";
import { defaultRoom } from "../../room/definition";
import { embedPetAssets } from "../../lib/storage/petAssetStore";
import { roomAudioStore } from "../../lib/storage/roomAudioStore";
import { buildGiftPackage, type GiftPackage } from "./package";

/** Minimal publishing agent: collect saved inputs, resolve assets, validate, archive. */
export async function packageSavedGift(giftId: string, progress: (text: string) => void): Promise<Blob> {
  progress("收集素材…");
  const store = openGift(demoGift as GiftConfig, demoWorld, giftId, "recipient", localStorage);
  if (store.warning) throw new Error(store.warning);
  const snapshot = localStorage.getItem(store.storageKey), saved = store.read();
  const [room, audio, runtimeResponse, noticesResponse] = await Promise.all([
    embedPetAssets(saved.room ?? defaultRoom), roomAudioStore.read(giftId),
    fetch("/gift-viewer/runtime.js", { cache: "no-cache" }), fetch("/gift-viewer/notices.txt", { cache: "no-cache" }),
  ]);
  if (!runtimeResponse.ok || !noticesResponse.ok) throw new Error("打包程序未就绪，请刷新后重试。");
  let track: GiftPackage["audio"] = null;
  if (audio) {
    const bytes = new Uint8Array(await audio.blob.arrayBuffer()); let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    track = { name: audio.name, type: audio.blob.type, base64: btoa(binary) };
  }
  const gift: GiftConfig = { version: 1, gift_id: saved.gift_id, world_id: saved.world_id, revision: saved.revision, object_contents: saved.object_contents, details: saved.details, room };
  const runtime = await runtimeResponse.text(), notices = await noticesResponse.text();
  if (localStorage.getItem(store.storageKey) !== snapshot) throw new Error("礼物刚刚发生变化，请重新打包。");
  progress("打包中…");
  await new Promise<void>(resolve => setTimeout(resolve, 30));
  const bytes = buildGiftPackage({ version: 1, gift, audio: track }, runtime, notices);
  return new Blob([bytes], { type: "application/zip" });
}
