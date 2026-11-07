import manifestJson from "./asset-manifest.json";
import worldJson from "./demo-world.json";
import type { AssetManifest, WorldConfig } from "./types";

export const assetManifest: AssetManifest = manifestJson as AssetManifest;

/** Reject invalid external/AI JSON before handing any coordinates to Phaser. */
export function validateWorldConfig(value: unknown, manifest: AssetManifest): asserts value is WorldConfig {
  const fail = (field: string): never => { throw new Error(`房间配置无效：${field}`); };
  const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail("应为对象");
  const unit = (v: unknown, field: string, positive = false) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1 || (positive && v === 0)) fail(field);
  };
  const text = (v: unknown, field: string) => { if (typeof v !== "string" || !v.trim()) fail(field); };
  const interaction = (v: unknown) => {
    const item = record(v);
    text(item.title, "interaction.title"); text(item.description, "interaction.description");
  };
  const assets = new Map(manifest.assets.map(a => [a.asset_id, a]));
  if (assets.size !== manifest.assets.length) fail("asset_id 重复");
  const w = record(value);
  if (w.version !== 1) fail("version");
  text(w.world_id, "world_id");
  if (typeof w.background_id !== "string" || assets.get(w.background_id)?.type !== "background") fail("background_id");
  if (!Array.isArray(w.objects) || !Array.isArray(w.hotspots)) fail("objects / hotspots");
  const ids = new Set<string>();
  const id = (v: unknown) => { text(v, "id"); if (ids.has(v as string)) fail("id 重复"); ids.add(v as string); };
  for (const raw of w.objects as unknown[]) {
    const o = record(raw); id(o.object_id);
    const asset = assets.get(o.asset_id as string);
    if (!asset || asset.type === "background" || o.type !== asset.type) fail("asset_id / type");
    unit(o.position_x, "position_x"); unit(o.position_y, "position_y");
    const size = record(o.size);
    unit(size.width, "size.width", true);
    if (size.height_scale !== undefined) unit(size.height_scale, "size.height_scale", true);
    if (o.anchor !== undefined) { const a = record(o.anchor); unit(a.x, "anchor.x"); unit(a.y, "anchor.y"); }
    for (const key of ["visible", "clickable"]) if (typeof o[key] !== "boolean") fail(key);
    if (o.draggable !== undefined && typeof o.draggable !== "boolean") fail("draggable");
    if (o.content_type !== undefined && !["photo_frame", "letter"].includes(o.content_type as string)) fail("content_type");
    interaction(o.interaction);
  }
  for (const raw of w.hotspots as unknown[]) {
    const h = record(raw); id(h.hotspot_id); text(h.furniture_name, "furniture_name");
    unit(h.position_x, "hotspot.position_x"); unit(h.position_y, "hotspot.position_y");
    unit(h.width, "hotspot.width", true); unit(h.height, "hotspot.height", true);
    if ((h.position_x as number) + (h.width as number) > 1 || (h.position_y as number) + (h.height as number) > 1) fail("hotspot 超出背景");
    interaction(h.interaction);
  }
}

validateWorldConfig(worldJson, assetManifest);
export const demoWorld: WorldConfig = worldJson;
