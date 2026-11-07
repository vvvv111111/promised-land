import type { Anchor, WorldConfig, WorldObject } from "./types";

/** Saved placement applies only while the object's JSON defaults still match. */
export class RoomLayout {
  private entries: Record<string, { basis: string; position: Anchor }> = {};
  warning = "";
  private key: string;

  constructor(private world: WorldConfig, private storage?: Pick<Storage, "getItem" | "setItem">) {
    this.key = `promised-land:layout:${world.world_id}`;
    try {
      const saved: unknown = JSON.parse(storage?.getItem(this.key) ?? "{}");
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        for (const o of world.objects.filter(o => o.visible && o.draggable !== false)) {
          const entry = (saved as Record<string, unknown>)[o.object_id];
          if (!entry || typeof entry !== "object") continue;
          const { basis, position } = entry as { basis?: unknown; position?: Anchor };
          if (basis === this.basis(o) && position && [position.x, position.y].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) {
            this.entries[o.object_id] = { basis, position: { x: position.x, y: position.y } };
          }
        }
      }
    } catch { this.warning = "本地摆放记录无法读取，本次使用默认位置。"; }
  }

  private basis(o: WorldObject) {
    return JSON.stringify([this.world.background_id, o.asset_id, o.position_x, o.position_y, o.size, o.anchor]);
  }

  positions(): Record<string, Anchor> {
    return Object.fromEntries(Object.entries(this.entries).map(([id, e]) => [id, { ...e.position }]));
  }

  move(id: string, position: Anchor) {
    const o = this.world.objects.find(o => o.object_id === id && o.visible && o.draggable !== false);
    if (!o || ![position.x, position.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return;
    this.entries[id] = { basis: this.basis(o), position: { ...position } };
    this.save();
  }

  reset() { this.entries = {}; this.save(); }

  private save() {
    try {
      if (!this.storage) throw new Error("storage unavailable");
      this.storage.setItem(this.key, JSON.stringify(this.entries));
      this.warning = "";
    } catch { this.warning = "摆放仅在本次访问中保留，浏览器无法保存位置。"; }
  }
}
