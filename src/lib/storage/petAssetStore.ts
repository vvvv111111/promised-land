import { decodePetGlb, type PetAsset } from "../../room/petAsset";
import type { RoomDefinition } from "../../room/types";

/** Binary models live beside audio in IndexedDB, keeping room JSON below localStorage quotas. */
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("promised-land:pet-assets:v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("models");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("无法打开宠物模型存储，请检查浏览器存储权限。"));
    request.onblocked = () => reject(new Error("宠物模型存储正在升级，请关闭其他页面后重试。"));
  });
}

export async function resolvePetGlb(asset: PetAsset): Promise<string> {
  if (asset.glb) return asset.glb;
  const db = await database();
  try {
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const request = db.transaction("models", "readonly").objectStore("models").get(asset.assetId!);
      request.onsuccess = () => request.result instanceof ArrayBuffer ? resolve(request.result) : reject(new Error("本浏览器中的宠物模型已被清理，请重新选择宠物。"));
      request.onerror = () => reject(new Error("宠物模型无法读取，请重试。"));
    });
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const id = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    if (id !== asset.assetId) throw new Error("宠物模型完整性校验失败，请重新选择。");
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i += 8192) binary += String.fromCharCode(...new Uint8Array(bytes, i, Math.min(8192, bytes.byteLength - i)));
    const encoded = btoa(binary); decodePetGlb(encoded); return encoded;
  } finally { db.close(); }
}

export async function persistPetAssets(input: RoomDefinition): Promise<RoomDefinition> {
  const plan = structuredClone(input);
  for (const node of plan.nodes) {
    const asset = node.petAsset;
    if (!asset?.glb) continue;
    const bytes = decodePetGlb(asset.glb);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const id = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
    const db = await database();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction("models", "readwrite");
        transaction.objectStore("models").put(bytes.buffer, id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () => reject(new Error("宠物模型未能保存，请检查浏览器存储空间。"));
      });
    } finally { db.close(); }
    node.petAsset = { ...asset, glb: "", assetId: id };
  }
  return plan;
}

/** Exports always embed model bytes, so they can be restored without this browser or server. */
export async function embedPetAssets(input: RoomDefinition): Promise<RoomDefinition> {
  const plan = structuredClone(input);
  for (const node of plan.nodes) if (node.petAsset) {
    node.petAsset.glb = await resolvePetGlb(node.petAsset);
    delete node.petAsset.assetId;
  }
  return plan;
}
