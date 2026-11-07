import type { GiftConfig, GiftContent, GiftMode, WorldConfig } from "./types";

export function validGiftContent(value: unknown): value is GiftContent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "letter") return typeof v.body === "string" && v.body.length <= 10000;
  if (v.kind !== "photo_frame") return false;
  const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  return (v.photo === null || (typeof v.photo === "string" && v.photo.length <= 1800000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(v.photo)))
    && typeof v.zoom === "number" && Number.isFinite(v.zoom) && v.zoom >= 1 && v.zoom <= 3
    && unit(v.position_x) && unit(v.position_y);
}

/** One persisted gift document, keyed by gift_id; layout stays separate. */
export class GiftStore {
  private config: GiftConfig;
  readonly storageKey: string;
  warning = "";

  constructor(base: GiftConfig, private world: WorldConfig, private mode: GiftMode, private storage?: Pick<Storage, "getItem" | "setItem">) {
    this.config = structuredClone(base);
    this.storageKey = `promised-land:gift:${base.gift_id}`;
    try {
      const saved = JSON.parse(storage?.getItem(this.storageKey) ?? "null") as Partial<GiftConfig> | null;
      if (saved?.version === 1 && saved.gift_id === base.gift_id && saved.world_id === world.world_id && saved.object_contents && typeof saved.object_contents === "object") {
        for (const object of world.objects) {
          const content = saved.object_contents[object.object_id];
          if (validGiftContent(content) && content.kind === object.content_type) this.config.object_contents[object.object_id] = structuredClone(content);
        }
      }
    } catch { this.warning = "礼物记录无法读取，已展示默认内容。"; }
  }

  read(): GiftConfig { return structuredClone(this.config); }

  save(objectId: string, content: GiftContent): GiftConfig {
    if (this.mode !== "sender") throw new Error("收礼者模式不能编辑礼物内容。");
    const object = this.world.objects.find(o => o.object_id === objectId);
    if (!validGiftContent(content) || object?.content_type !== content.kind) throw new Error("编辑内容格式无效。");
    if (!this.storage) throw new Error("浏览器未开放本地存储，无法保存。请允许站点存储后重试。");
    const next = structuredClone(this.config);
    next.object_contents[objectId] = structuredClone(content);
    try { this.storage.setItem(this.storageKey, JSON.stringify(next)); }
    catch { throw new Error("保存失败：浏览器存储空间不足或不可写。请更换较小的照片后重试。"); }
    this.config = next;
    this.warning = "";
    return this.read();
  }
}
