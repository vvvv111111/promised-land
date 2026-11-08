import { materialIds, type GeneratedAsset, type RoomNode, type Vec3 } from "./types";

export const MAX_GENERATED_PARTS = 384;
type Pose = { position: Vec3; rotation?: Vec3; scale?: Vec3 };
export function transformPoint(point: Vec3, pose: Pose): Vec3 {
  let [x, y, z] = point.map((v, i) => v * (pose.scale?.[i] ?? 1));
  const [rx, ry, rz] = pose.rotation ?? [0, 0, 0];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  return [x + pose.position[0], y + pose.position[1], z + pose.position[2]];
}
export function boxCorners(min: Vec3, max: Vec3): Vec3[] {
  const result: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) result.push([x, y, z]);
  return result;
}
export function pointBounds(points: Vec3[]) {
  return { min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))) as Vec3, max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) as Vec3 };
}
/** Each part keeps its own conservative OBB; empty space under a loft stays empty. */
export function generatedBoxes(asset: GeneratedAsset): Vec3[][] {
  return asset.parts.map(part => boxCorners(part.size.map(v => -v / 2) as Vec3, part.size.map(v => v / 2) as Vec3).map(p => transformPoint(p, part)));
}
export function generatedSurfaces(asset: GeneratedAsset) {
  return (asset.supports ?? []).map(s => {
    const p = asset.parts[s.part];
    return { id: s.id, position: [p.position[0], p.position[1] + p.size[1] / 2, p.position[2]] as Vec3, size: [p.size[0] - .04, p.size[2] - .04] as [number, number] };
  });
}
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("generated geometry requires an object");
  return v as Record<string, unknown>;
};
function vec(v: unknown, min: number, max: number): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || v.some(n => typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)) throw new Error(`generated vector must have 3 finite values in ${min}..${max}`);
  return [...v] as Vec3;
}
export function parseGeneratedAsset(value: unknown, normalizeOrigin = true): GeneratedAsset {
  const a = obj(value);
  if (typeof a.label !== "string" || !a.label.trim() || a.label.length > 80) throw new Error("generated asset needs a label of 1..80 characters");
  if (!Array.isArray(a.parts) || !a.parts.length || a.parts.length > 64) throw new Error("generated asset needs 1..64 parts");
  const parts = a.parts.map(raw => {
    const p = obj(raw);
    if (!["box", "cylinder", "cone", "ellipsoid"].includes(p.shape as string)) throw new Error("unsupported generated shape");
    if (typeof p.color !== "string" || !/^#[0-9a-f]{6}$/i.test(p.color)) throw new Error("generated part needs a #rrggbb color");
    if (p.material !== undefined && !(materialIds as readonly unknown[]).includes(p.material)) throw new Error("unknown generated material");
    return { shape: p.shape as GeneratedAsset["parts"][number]["shape"], size: vec(p.size, .008, 12), position: vec(p.position, -12, 12), color: p.color, ...(p.rotation === undefined ? {} : { rotation: vec(p.rotation, -Math.PI, Math.PI) }), ...(p.material === undefined ? {} : { material: p.material as typeof materialIds[number] }) };
  });
  let supports: GeneratedAsset["supports"];
  if (a.supports !== undefined) {
    if (!Array.isArray(a.supports) || a.supports.length > 8) throw new Error("at most 8 generated supports");
    const seen = new Set();
    supports = a.supports.map(raw => {
      const s = obj(raw), index = s.part as number;
      if (typeof s.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(s.id) || seen.has(s.id) || !Number.isInteger(index) || !parts[index]) throw new Error("invalid generated support reference");
      seen.add(s.id);
      const p = parts[index];
      if (p.shape !== "box" || p.rotation?.some(n => Math.abs(n) > 1e-8) || Math.min(p.size[0], p.size[2]) < .1) throw new Error("generated support must be the top of a level, unrotated box at least .1m wide/deep");
      return { id: s.id, part: index };
    });
  }
  const asset: GeneratedAsset = { label: a.label.trim(), parts, ...(supports ? { supports } : {}) };
  const b = pointBounds(generatedBoxes(asset).flat());
  if (b.max[1] - b.min[1] > 5 || b.min[0] < -6 || b.max[0] > 6 || b.min[2] < -6 || b.max[2] > 6) throw new Error(`generated asset ${asset.label} bounds exceed x/z -6..6 or 5m height: min=${b.min}, max=${b.max}`);
  // A model's shape-local origin carries no scene elevation. Canonicalize the
  // whole recipe together; only real floor/support placement determines height.
  if (normalizeOrigin) {
    // Already-canonical floating-point bounds must stay byte-stable on save/reload.
    if (Math.abs(b.min[1]) > 1e-9) for (const part of asset.parts) part.position[1] -= b.min[1];
  } else if (Math.abs(b.min[1]) > .012) throw new Error(`generated asset ${asset.label} must use canonical y=0 origin`);
  return asset;
}
export function generatedPartCount(nodes: Pick<RoomNode, "geometry">[]) {
  return nodes.reduce((count, n) => count + (n.geometry?.parts.length ?? 0), 0);
}
