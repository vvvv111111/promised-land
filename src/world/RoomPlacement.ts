import type { Anchor, AssetManifest, PlacementSurface, WorldConfig, WorldObject } from "./types";

const EPS = 1e-7;
const add = (a: Anchor, b: Anchor): Anchor => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Anchor, b: Anchor): Anchor => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Anchor, n: number): Anchor => ({ x: a.x * n, y: a.y * n });
const cross = (a: Anchor, b: Anchor) => a.x * b.y - a.y * b.x;
const length = (a: Anchor) => Math.hypot(a.x, a.y);

/** Homography from a unit ground square to a calibrated image quadrilateral. */
function matrix(p: Anchor[]) {
  const [a, b, c, d] = p;
  const dx1 = b.x - c.x, dx2 = d.x - c.x, dx3 = a.x - b.x + c.x - d.x;
  const dy1 = b.y - c.y, dy2 = d.y - c.y, dy3 = a.y - b.y + c.y - d.y;
  const det = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(det) < EPS) throw new Error("摆放平面退化，无法计算投影。");
  const g = (dx3 * dy2 - dx2 * dy3) / det;
  const h = (dx1 * dy3 - dx3 * dy1) / det;
  return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
    b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h];
}

export function surfaceToScreen(polygon: Anchor[], uv: Anchor): Anchor {
  const [a, b, c, d, e, f, g, h] = matrix(polygon);
  const w = g * uv.x + h * uv.y + 1;
  return { x: (a * uv.x + b * uv.y + c) / w, y: (d * uv.x + e * uv.y + f) / w };
}

export function screenToSurface(polygon: Anchor[], point: Anchor): Anchor {
  const [a, b, c, d, e, f, g, h] = matrix(polygon);
  const aa = a - point.x * g, bb = b - point.x * h, dd = d - point.y * g, ee = e - point.y * h;
  const det = aa * ee - bb * dd;
  if (Math.abs(det) < EPS) return { x: 0.5, y: 0.5 };
  return { x: ((point.x - c) * ee - bb * (point.y - f)) / det, y: (aa * (point.y - f) - dd * (point.x - c)) / det };
}

function orientation(p: Anchor[]) {
  return Math.sign(p.reduce((sum, a, i) => sum + cross(a, p[(i + 1) % p.length]), 0));
}

export function insidePolygon(point: Anchor, polygon: Anchor[]): boolean {
  const sign = orientation(polygon);
  return polygon.every((a, i) => sign * cross(sub(polygon[(i + 1) % polygon.length], a), sub(point, a)) >= -EPS);
}

/** SAT of projected ground footprints, rather than the upright sprite rectangles. */
export function polygonsOverlap(a: Anchor[], b: Anchor[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const edge = sub(polygon[(i + 1) % polygon.length], polygon[i]);
    const project = (p: Anchor) => -edge.y * p.x + edge.x * p.y;
    const pa = a.map(project), pb = b.map(project);
    if (Math.max(...pa) <= Math.min(...pb) + EPS || Math.max(...pb) <= Math.min(...pa) + EPS) return false;
  }
  return true;
}

export interface PlacementPose { anchor: Anchor; ground: Anchor; surface_id: string; depth: number }

export class RoomPlacement {
  private states = new Map<string, PlacementPose>();
  private background;

  constructor(private world: WorldConfig, private manifest: AssetManifest, saved: Record<string, Anchor> = {}) {
    this.background = manifest.assets.find(a => a.asset_id === world.background_id)!;
    this.reset();
    // Remove all saved objects before restoring them so valid position swaps survive reload.
    for (const id of Object.keys(saved)) this.states.delete(id);
    for (const [id, anchor] of Object.entries(saved)) {
      const object = world.objects.find(o => o.object_id === id && o.visible);
      if (!object) continue;
      const pose = this.nearest(object, anchor);
      if (!pose) throw new Error(`无法恢复「${object.interaction.title}」的摆放。`);
      this.states.set(id, pose);
    }
  }

  reset() {
    this.states.clear();
    for (const object of this.world.objects.filter(o => o.visible)) {
      const pose = this.nearest(object, { x: object.position_x, y: object.position_y });
      if (!pose) throw new Error(`物品「${object.interaction.title}」没有可用的摆放空间。`);
      this.states.set(object.object_id, pose);
    }
  }

  pose(id: string): PlacementPose { return structuredClone(this.states.get(id)!); }

  private surfaces(object: WorldObject) {
    return this.world.placement!.surfaces.filter(s => object.placement?.surfaces.includes(s.surface_id) ?? s.kind === "floor");
  }

  private offset(object: WorldObject): Anchor {
    const asset = this.manifest.assets.find(a => a.asset_id === object.asset_id)!;
    const anchor = object.anchor ?? asset.default_anchor;
    const contact = object.placement?.contact ?? anchor;
    return { x: (contact.x - anchor.x) * object.size.width,
      y: (contact.y - anchor.y) * object.size.width * this.background.width / this.background.height * asset.height / asset.width };
  }

  private makePose(object: WorldObject, ground: Anchor, surface: PlacementSurface): PlacementPose {
    return { anchor: sub(ground, this.offset(object)), ground, surface_id: surface.surface_id,
      depth: surface.depth_y === undefined ? ground.y : surface.depth_y + 0.0001 + ground.y * 0.00001 };
  }

  private offsets(object: WorldObject, surface: PlacementSurface): Anchor[] {
    const at = { x: 0.5, y: 0.5 };
    const origin = surfaceToScreen(surface.polygon, at);
    const axis = (uv: Anchor) => {
      const v = sub(surfaceToScreen(surface.polygon, uv), origin);
      const norm = Math.hypot(v.x, v.y * this.background.height / this.background.width);
      return mul(v, 1 / norm);
    };
    const u = axis({ x: 0.6, y: 0.5 }), v = axis({ x: 0.5, y: 0.6 });
    const footprint = object.placement?.footprint ?? { width: 0.02, depth: 0.02 };
    return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(mul(u, a * footprint.width / 2), mul(v, b * footprint.depth / 2)));
  }

  footprint(id: string): Anchor[] {
    const object = this.world.objects.find(o => o.object_id === id)!;
    const pose = this.states.get(id)!;
    const surface = this.surfaces(object).find(s => s.surface_id === pose.surface_id)!;
    return this.offsets(object, surface).map(p => add(pose.ground, p));
  }

  private supported(object: WorldObject, ground: Anchor, surface: PlacementSurface) {
    return this.offsets(object, surface).every(p => insidePolygon(add(ground, p), surface.polygon));
  }

  private valid(object: WorldObject, ground: Anchor, surface: PlacementSurface) {
    if (!this.supported(object, ground, surface)) return false;
    const footprint = this.offsets(object, surface).map(p => add(ground, p));
    if (surface.blockers.some(b => polygonsOverlap(footprint, b.polygon))) return false;
    for (const [id, pose] of this.states) {
      if (id !== object.object_id && pose.surface_id === surface.surface_id && polygonsOverlap(footprint, this.footprint(id))) return false;
    }
    return true;
  }

  private project(object: WorldObject, ground: Anchor, surface: PlacementSurface): Anchor {
    const uv = screenToSurface(surface.polygon, ground);
    let result = surfaceToScreen(surface.polygon, { x: Math.max(0, Math.min(1, uv.x)), y: Math.max(0, Math.min(1, uv.y)) });
    const sign = orientation(surface.polygon), offsets = this.offsets(object, surface);
    // Project against the inward half-planes, inset by the complete footprint.
    for (let pass = 0; pass < 20; pass++) for (let i = 0; i < surface.polygon.length; i++) {
      const a = surface.polygon[i], edge = sub(surface.polygon[(i + 1) % surface.polygon.length], a);
      const normal = { x: -edge.y * sign, y: edge.x * sign };
      const margin = -Math.min(...offsets.map(o => normal.x * o.x + normal.y * o.y));
      const distance = normal.x * (result.x - a.x) + normal.y * (result.y - a.y);
      if (distance < margin) result = add(result, mul(normal, (margin - distance + EPS) / (normal.x ** 2 + normal.y ** 2)));
    }
    return result;
  }

  private nearest(object: WorldObject, anchor: Anchor): PlacementPose | undefined {
    const ground = add(anchor, this.offset(object));
    const surfaces = this.surfaces(object);
    for (const surface of [...surfaces].sort((a, b) => Number(b.kind === "tabletop") - Number(a.kind === "tabletop"))) {
      if (this.valid(object, ground, surface)) return this.makePose(object, ground, surface);
    }
    let best: PlacementPose | undefined, distance = Infinity;
    for (const surface of surfaces) {
      const projected = this.project(object, ground, surface);
      const candidates = [projected];
      for (let u = 0; u <= 24; u++) for (let v = 0; v <= 24; v++) candidates.push(surfaceToScreen(surface.polygon, { x: u / 24, y: v / 24 }));
      for (const point of candidates) {
        const d = length(sub(point, ground));
        if (d < distance && this.valid(object, point, surface)) { distance = d; best = this.makePose(object, point, surface); }
      }
    }
    return best;
  }

  move(id: string, requested: Anchor): PlacementPose {
    const object = this.world.objects.find(o => o.object_id === id)!;
    const current = this.states.get(id)!;
    if (![requested.x, requested.y].every(Number.isFinite)) return this.pose(id);
    const wanted = add(requested, this.offset(object));
    const surfaces = this.surfaces(object);
    const surface = surfaces.find(s => s.kind === "tabletop" && insidePolygon(wanted, s.polygon)) ?? surfaces.find(s => s.kind === "floor") ?? surfaces[0];
    const target = this.project(object, wanted, surface);
    if (surface.surface_id !== current.surface_id) {
      // The user's hand can place a small object onto a real support surface.
      if (this.valid(object, target, surface)) this.states.set(id, this.makePose(object, target, surface));
      return this.pose(id);
    }
    const steps = Math.max(1, Math.ceil(length(sub(target, current.ground)) / 0.004));
    const delta = mul(sub(target, current.ground), 1 / steps);
    let ground = current.ground;
    for (let i = 0; i < steps; i++) {
      // Small swept steps prevent tunneling; try sliding along a blocked edge.
      for (const d of [delta, { x: delta.x, y: 0 }, { x: 0, y: delta.y }]) {
        const next = this.project(object, add(ground, d), surface);
        if (this.valid(object, next, surface)) { ground = next; break; }
      }
    }
    this.states.set(id, this.makePose(object, ground, surface));
    return this.pose(id);
  }

  isOccluded(point: Anchor, depth: number) {
    return this.world.placement!.occluders.some(o => o.depth_y > depth && o.polygons.some(p => insidePolygon(point, p)));
  }
}
