import { strToU8, zipSync } from "fflate";
import { validGiftContent, validGiftDetails } from "../../world/GiftStore";
import { validateRoomDefinition } from "../../room/definition";
import type { GiftConfig } from "../../world/types";
import { packageHtml } from "./template";

export interface GiftPackage {
  version: 1;
  gift: GiftConfig;
  audio: { name: string; type: string; base64: string } | null;
}

/** The package is a fixed snapshot. All models and media must travel with it. */
export function validateGiftPackage(value: GiftPackage) {
  const gift = value?.gift;
  if (value?.version !== 1 || !gift || gift.version !== 1 || !/^[a-zA-Z0-9_-]{1,80}$/.test(gift.gift_id)
    || !gift.object_contents || (gift.details !== undefined && !validGiftDetails(gift.details))) throw new Error("礼物内容无效，请重新保存后打包。");
  for (const content of Object.values(gift.object_contents)) if (!validGiftContent(content)) throw new Error("照片或信件无效，请重新保存。");
  if (gift.object_contents["sunset-frame"]?.kind !== "photo_frame" || gift.object_contents["sealed-letter"]?.kind !== "letter") throw new Error("相框或信件缺失，请重新保存。");
  validateRoomDefinition(gift.room);
  for (const node of gift.room!.nodes) if (node.petAsset && (!node.petAsset.glb || node.petAsset.assetId)) throw new Error("宠物模型未完整打包，请重新生成或保存。");
  const audio = value.audio;
  if (audio !== null && (!audio || typeof audio.name !== "string" || audio.name.length > 1000
    || !/^audio\/(mpeg|wav|mp4|ogg|webm|flac|aac)$/.test(audio.type)
    || typeof audio.base64 !== "string" || audio.base64.length > Math.ceil(20 * 1024 * 1024 / 3) * 4
    || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio.base64))) throw new Error("音乐无效，请重新保存后打包。");
  if (JSON.stringify(value).length > 48 * 1024 * 1024) throw new Error("礼物素材过大，请减少照片或音乐大小。");
}

export function buildGiftPackage(payload: GiftPackage, runtime: string, notices: string): Uint8Array<ArrayBuffer> {
  validateGiftPackage(payload);
  if (!runtime.startsWith("/* promised-land-gift-viewer:v1 */") || runtime.length < 1000 || runtime.length > 5 * 1024 * 1024 || !notices.includes("MIT")) throw new Error("预览程序无法读取，请刷新后重试。");
  return zipSync({
    "index.html": strToU8(packageHtml(payload)),
    "viewer.js": strToU8(runtime),
    "THIRD_PARTY_NOTICES.txt": strToU8(notices),
    "README.txt": strToU8("应许之地 · 只读礼物包\n\n解压后打开 index.html 查看；也可将全部文件上传至任意静态网站目录。\n保留 index.html 与 viewer.js 的相对位置，支持部署到子目录。\n收礼端不需要 Node.js、Python、MiMo 密钥或生成服务。\n照片、音乐与宠物模型已包含在包内，请仅分享给预期收礼人。\n素材来源和许可见礼物数据中的 source/license 及 THIRD_PARTY_NOTICES.txt。\n"),
  }, { level: 6 });
}
