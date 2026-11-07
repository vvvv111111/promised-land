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
  const surfaceKinds = new Map<string, unknown>();
  const polygon = (v: unknown, field: string, quad = false) => {
    if (!Array.isArray(v) || v.length < 3 || (quad && v.length !== 4)) fail(field);
    const points = (v as unknown[]).map(raw => {
      const p = record(raw); unit(p.x, `${field}.x`); unit(p.y, `${field}.y`);
      return { x: p.x as number, y: p.y as number };
    });
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length], c = points[(i + 2) % points.length];
      const turn = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(turn) < 1e-8 || (sign && Math.sign(turn) !== sign)) fail(`${field} 必须是非退化凸多边形`);
      sign = Math.sign(turn);
    }
  };
  if (w.placement !== undefined) {
    const rules = record(w.placement);
    if (!Number.isInteger(rules.version) || (rules.version as number) < 1 || rules.projection !== "orthographic") fail("placement.version / projection");
    if (!Array.isArray(rules.surfaces) || !rules.surfaces.length || !Array.isArray(rules.occluders)) fail("placement.surfaces / occluders");
    for (const raw of rules.surfaces as unknown[]) {
      const s = record(raw); text(s.surface_id, "surface_id");
      if (surfaceKinds.has(s.surface_id as string) || !["floor", "tabletop"].includes(s.kind as string)) fail("surface_id / kind");
      surfaceKinds.set(s.surface_id as string, s.kind);
      polygon(s.polygon, "surface.polygon", true);
      if (s.depth_y !== undefined) unit(s.depth_y, "surface.depth_y");
      if (s.kind === "tabletop" && s.depth_y === undefined) fail("tabletop.depth_y");
      if (!Array.isArray(s.blockers)) fail("surface.blockers");
      for (const rawBlocker of s.blockers as unknown[]) { const b = record(rawBlocker); text(b.id, "blocker.id"); polygon(b.polygon, "blocker.polygon"); }
    }
    if (![...surfaceKinds.values()].includes("floor")) fail("缺少地板平面");
    for (const raw of rules.occluders as unknown[]) {
      const o = record(raw); text(o.id, "occluder.id"); unit(o.depth_y, "occluder.depth_y");
      if (!Array.isArray(o.polygons) || !o.polygons.length) fail("occluder.polygons");
      for (const p of o.polygons as unknown[]) polygon(p, "occluder.polygon");
    }
  }
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
    unit(record(o.size).width, "size.width", true);
    if (o.anchor !== undefined) { const a = record(o.anchor); unit(a.x, "anchor.x"); unit(a.y, "anchor.y"); }
    for (const key of ["visible", "clickable"]) if (typeof o[key] !== "boolean") fail(key);
    if (o.draggable !== undefined && typeof o.draggable !== "boolean") fail("draggable");
    if (o.content_type !== undefined && !["photo_frame", "letter"].includes(o.content_type as string)) fail("content_type");
    if (o.placement !== undefined) {
      const p = record(o.placement), contact = record(p.contact), footprint = record(p.footprint);
      unit(contact.x, "contact.x"); unit(contact.y, "contact.y");
      unit(footprint.width, "footprint.width", true); unit(footprint.depth, "footprint.depth", true);
      if (!Array.isArray(p.surfaces) || !p.surfaces.length || !p.surfaces.every(id => typeof id === "string" && surfaceKinds.has(id))) fail("object.placement.surfaces");
      if (o.type !== "memory" && (p.surfaces as string[]).some(id => surfaceKinds.get(id) === "tabletop")) fail("大件物品不能放在边桌上");
    }
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
