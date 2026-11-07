import type { GiftConfig, GiftContent, GiftDetails, GiftMode, WorldConfig } from "./types";
import { validateRoomDefinition } from "../room/definition";
import type { RoomDefinition } from "../room/types";

export function validGiftDetails(value: unknown): value is GiftDetails {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return [v.recipient, v.sender, v.memory].every(text => typeof text === "string")
    && Array.isArray(v.extra_photos) && v.extra_photos.length <= 2
    && v.extra_photos.every(photo => validGiftContent({ kind: "photo_frame", photo, zoom: 1, position_x: .5, position_y: .5 }) && typeof photo === "string");
}

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

/** One complete gift document, including its room plan, keyed by gift_id. */
export class GiftStore {
  private config: GiftConfig;
  readonly storageKey: string;
  warning = "";
  private observed: string | null = null;
  private pending: Promise<unknown> = Promise.resolve();

  constructor(base: GiftConfig, private world: WorldConfig, private mode: GiftMode, private storage?: Pick<Storage, "getItem" | "setItem">) {
    this.config = structuredClone(base);
    this.storageKey = `promised-land:gift:${base.gift_id}`;
    try {
      this.observed = storage?.getItem(this.storageKey) ?? null;
      const saved = JSON.parse(this.observed ?? "null") as Partial<GiftConfig> | null;
      if (saved?.version === 1 && saved.gift_id === base.gift_id && saved.world_id === world.world_id && saved.object_contents && typeof saved.object_contents === "object") {
        if (validGiftDetails(saved.details)) this.config.details = structuredClone(saved.details);
        if (Number.isSafeInteger(saved.revision) && saved.revision! >= 0) this.config.revision = saved.revision;
        if (saved.room !== undefined) { validateRoomDefinition(saved.room); this.config.room = structuredClone(saved.room); }
        for (const object of world.objects) {
          const content = saved.object_contents[object.object_id];
          if (validGiftContent(content) && content.kind === object.content_type) this.config.object_contents[object.object_id] = structuredClone(content);
        }
      }
    } catch { this.warning = "保存记录无法读取，已显示默认内容。"; }
  }

  read(): GiftConfig { return structuredClone(this.config); }

  /** Browser writers serialize across tabs; the snapshot check also protects plain adapters. */
  private locked<T>(action: () => T): Promise<T> {
    const run = () => typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(this.storageKey, async () => action()) : Promise.resolve().then(action);
    const result = this.pending.then(run, run);
    this.pending = result.catch(() => {});
    return result;
  }

  saveLocked(objectId: string, content: GiftContent): Promise<GiftConfig> {
    return this.locked(() => {
      const latest = this.latest();
      const current = latest.read().object_contents[objectId];
      if (!this.equal(current, this.config.object_contents[objectId]) && !this.equal(current, content)) this.conflict();
      const committed = latest.save(objectId, content);
      this.adopt(latest); return committed;
    });
  }

  saveRoomLocked(room: RoomDefinition): Promise<GiftConfig> {
    return this.locked(() => {
      const latest = this.latest(), next = latest.read();
      if (!this.equal(next.room, this.config.room) && !this.equal(next.room, room)) this.conflict();
      const committed = latest.saveGift({ ...next, room });
      this.adopt(latest); return committed;
    });
  }

  private equal(a: unknown, b: unknown) { return JSON.stringify(a) === JSON.stringify(b); }
  private conflict(): never { throw new Error("礼物已在其他页面更新。请先保留当前输入，再刷新页面后编辑。"); }
  private latest() {
    const latest = new GiftStore(this.config, this.world, this.mode, this.storage);
    if (latest.warning) this.conflict();
    return latest;
  }
  private adopt(store: GiftStore) { this.config = store.read(); this.observed = store.observed; this.warning = store.warning; }

  saveGiftLocked(next: GiftConfig): Promise<GiftConfig> {
    return this.locked(() => this.saveGift(next));
  }

  save(objectId: string, content: GiftContent): GiftConfig {
    if (this.mode !== "sender") throw new Error("当前无法保存此内容，请重新打开后重试。");
    const object = this.world.objects.find(o => o.object_id === objectId);
    if (!validGiftContent(content) || object?.content_type !== content.kind) throw new Error("当前无法保存此内容，请重新打开后重试。");
    const next = structuredClone(this.config);
    next.object_contents[objectId] = structuredClone(content);
    return this.saveGift(next);
  }

  /** Validate and commit the entire document with one atomic storage write. */
  saveGift(next: GiftConfig): GiftConfig {
    if (this.mode !== "sender") throw new Error("当前无法保存此内容，请重新打开后重试。");
    if (next.version !== 1 || next.gift_id !== this.config.gift_id || next.world_id !== this.world.world_id
      || !next.object_contents || typeof next.object_contents !== "object"
      || (next.details !== undefined && !validGiftDetails(next.details))) throw new Error("当前无法保存此内容，请重新打开后重试。");
    for (const [id, content] of Object.entries(next.object_contents)) {
      if (!validGiftContent(content) || this.world.objects.find(o => o.object_id === id)?.content_type !== content.kind) throw new Error("当前无法保存此内容，请重新打开后重试。");
    }
    if (Object.keys(this.config.object_contents).some(id => !(id in next.object_contents))) throw new Error("当前无法保存此内容，请重新打开后重试。");
    if (!this.storage) throw new Error("浏览器无法保存数据，请允许本地存储后重试。");
    if (next.room !== undefined) validateRoomDefinition(next.room);
    if (this.storage.getItem(this.storageKey) !== this.observed) this.conflict();
    const committed = structuredClone(next);
    committed.revision = (this.config.revision ?? 0) + 1;
    const serialized = JSON.stringify(committed);
    try { this.storage.setItem(this.storageKey, serialized); }
    catch { throw new Error("保存失败。输入已暂留，请检查浏览器存储或减少照片大小后重试。"); }
    this.config = committed;
    this.observed = serialized;
    this.warning = "";
    return this.read();
  }
}
