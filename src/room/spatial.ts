import type { ModelId, RoomDefinition, RoomNode, Vec3 } from "./types";
import { clearsWindows, wallFace } from "./wallMount";

type Bounds = { min: Vec3; max: Vec3 };
// Conservative local geometry envelopes. Keep these alongside model changes.
const envelopes: Record<Exclude<ModelId, "shell">, Bounds> = {
  sofa: { min: [-1.33, .02, -.52], max: [1.33, 1.23, .55] },
  table: { min: [-.85, .01, -.51], max: [.85, .785, .51] },
  cabinet: { min: [-1, .02, -.34], max: [1, 1.075, .38] },
  cd: { min: [-.32, .005, -.20], max: [.32, .108, .208] },
  envelope: { min: [-.17, -.006, -.115], max: [.17, .012, .115] },
  frame: { min: [-.38, -.363, -.232], max: [.38, .305, .052] },
  lamp: { min: [-.29, .0025, -.29], max: [.29, .685, .29] },
  plant: { min: [-.32, 0, -.32], max: [.32, 1.15, .32] },
  pet: { min: [-.4, -.02, -.24], max: [.42, .41, .25] },
  slippers: { min: [-.22, -.018, -.17], max: [.22, .073, .17] },
  rug: { min: [-2.45, .022, -.755], max: [1.25, .075, 1.715] },
  clock: { min: [.12, 2.11, -2.34], max: [.58, 2.57, -2.24] },
  bed: { min: [-.93, 0, -1.15], max: [.93, 1.14, 1.15] },
  desk: { min: [-1.02, 0, -.47], max: [1.02, .7825, .47] },
  chair: { min: [-.3, 0, -.33], max: [.3, .985, .33] },
  nightstand: { min: [-.33, 0, -.3], max: [.33, .6025, .3] },
  bookshelf: { min: [-.47, 0, -.22], max: [.47, 1.88, .22] },
  wardrobe: { min: [-.87, 0, -.35], max: [.87, 2.22, .39] },
};
function corners(b: Bounds): Vec3[] {
  const points: Vec3[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) points.push([x, y, z]);
  return points;
}
function transform(point: Vec3, node: RoomNode): Vec3 {
  let [x, y, z] = point.map((v, i) => v * (node.scale?.[i] ?? 1));
  const [rx, ry, rz] = node.rotation ?? [0, 0, 0];
  [x, y] = [x * Math.cos(rz) - y * Math.sin(rz), x * Math.sin(rz) + y * Math.cos(rz)];
  [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
  [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
  return [x + node.position[0], y + node.position[1], z + node.position[2]];
}
function bounds(points: Vec3[]): Bounds {
  return { min: [0, 1, 2].map(i => Math.min(...points.map(p => p[i]))) as Vec3, max: [0, 1, 2].map(i => Math.max(...points.map(p => p[i]))) as Vec3 };
}
function overlaps(a: Bounds, b: Bounds) {
  return [0, 1, 2].every(i => Math.min(a.max[i], b.max[i]) - Math.max(a.min[i], b.min[i]) > .003);
}

function localPoints(node: RoomNode) {
  if (node.model === "shell") throw new Error("Shell bounds are defined by room dimensions");
  const envelope = node.model === "frame" && node.wall ? { min: [-.38, -.305, -.0325], max: [.38, .305, .052] } as Bounds : envelopes[node.model];
  return corners(envelope).map(p => transform(p, node));
}

/** Pure geometry bounds, shared by validation and wall-photo composition. */
export function nodeWorldBounds(plan: RoomDefinition, node: RoomNode): Bounds {
  const nodes = new Map(plan.nodes.map(n => [n.id, n]));
  return bounds(localPoints(node).map(p => {
    let parent = node.parent;
    while (parent) { const n = nodes.get(parent)!; p = transform(p, n); parent = n.parent; }
    return p;
  }));
}

/** A plan is renderable only when complete model envelopes are physically supported. */
export function validateRoomSpace(plan: RoomDefinition) {
  const fail = (message: string): never => { throw new Error(`Invalid room definition: ${message}`); };
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const worldBounds = new Map<string, Bounds>();
  const localBounds = new Map<string, Bounds>();
  const mounted = new Set<string>();
  const same = (actual: Vec3 | undefined, expected: Vec3, fallback: Vec3) => (actual ?? fallback).every((v, i) => Math.abs(v - expected[i]) < .001);
  for (const node of plan.nodes) {
    if (node.model === "shell") {
      if (node.parent || node.position.some(v => v !== 0) || node.rotation?.some(v => v !== 0) || node.scale?.some(v => v !== 1)) fail("shell transform must use room dimensions");
      continue;
    }
    if (!node.surface && node.parent) fail(`${node.id} requires an explicit support`);
    const geometry = localPoints(node);
    localBounds.set(node.id, bounds(geometry));
    if (node.surface) {
      const parent = nodes.get(node.parent!)!;
      const spec = parent.model === "table" ? { y: .6425, width: 1.66, depth: .96 }
        : parent.model === "cabinet" ? { y: 1.0725, width: 1.96, depth: .68 }
        : parent.model === "desk" ? { y: .7825, width: 2, depth: .9 }
        : parent.model === "nightstand" ? { y: .6025, width: .62, depth: .56 } : null;
      if (!spec) fail("unsupported furniture surface");
      const surface = parent.surfaces!.find(s => s.id === node.surface)!;
      if (surface.position.some((v, i) => Math.abs(v - (i === 1 ? spec!.y : 0)) > .001) || Math.abs(surface.size[0] - spec!.width) > .001 || Math.abs(surface.size[1] - spec!.depth) > .001) fail("support metadata differs from model");
      const local = bounds(geometry);
      if (local.min[0] < -spec!.width / 2 || local.max[0] > spec!.width / 2 || local.min[2] < -spec!.depth / 2 || local.max[2] > spec!.depth / 2) fail(`${node.id} overhangs its support`);
      if (Math.abs(local.min[1] - spec!.y) > .05) fail(`${node.id} floats or penetrates its support`);
    }
    const points = geometry.map(p => {
      let parent = node.parent;
      while (parent) { const n = nodes.get(parent)!; p = transform(p, n); parent = n.parent; }
      return p;
    });
    const box = bounds(points); worldBounds.set(node.id, box);
    if (box.min[0] < -plan.dimensions[0] / 2 - .01 || box.max[0] > plan.dimensions[0] / 2 + .01 || box.min[2] < -plan.dimensions[2] / 2 - .01 || box.max[2] > plan.dimensions[2] / 2 + .01 || box.min[1] < -.04 || box.max[1] > plan.dimensions[1] + .01) fail(`${node.id} crosses room bounds`);
    // Legacy shell decorations have known physical mounts. Other root models need floor contact.
    const windowPlant = !plan.architecture && node.id === "window-plant" && node.model === "plant" && !node.parent
      && same(node.position, [-2.78 * plan.dimensions[0] / 6, 1.03 * plan.dimensions[1] / 3, -.99 * plan.dimensions[2] / 4.8], [0, 0, 0])
      && same(node.scale, [.43, .43, .43], [1, 1, 1]) && same(node.rotation, [0, 0, 0], [0, 0, 0]);
    const wallClock = node.model === "clock" && !node.parent && Math.abs(node.position[2] - (2.4 - plan.dimensions[2] / 2)) < .001
      && same(node.scale, [1, 1, 1], [1, 1, 1]) && same(node.rotation, [0, 0, 0], [0, 0, 0]);
    if (windowPlant || wallClock) mounted.add(node.id);
    if (node.wall) {
      const scale = node.scale?.[0] ?? 1, normalAxis = node.wall === "back" ? 2 : 0, alongAxis = node.wall === "back" ? 0 : 2;
      if (!same(node.scale, [scale, scale, scale], [1, 1, 1]) || !same(node.rotation, [0, node.wall === "left" ? Math.PI / 2 : 0, 0], [0, 0, 0])) fail("wall frame must face into the room without tilt");
      if (Math.abs(box.min[normalAxis] - wallFace(plan, node.wall) - .001) > .003) fail("photo must contact its wall mount");
      if (!clearsWindows(plan, node.wall, node.position[alongAxis], node.position[1], scale)) fail("photo overlaps a window or its trim");
      mounted.add(node.id);
    }
    if (!node.parent && !mounted.has(node.id) && (box.min[1] < -.04 || box.min[1] > .15)) fail(`${node.id} is not supported by the floor`);
  }
  const solid = plan.nodes.filter(n => n.model !== "shell" && n.model !== "rug" && (n.model === "frame" || !mounted.has(n.id)));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    // Attached contents naturally overlap their supporting furniture envelope.
    if (a.parent === b.id || b.parent === a.id) continue;
    const boxes = a.parent && a.parent === b.parent ? localBounds : worldBounds;
    if (overlaps(boxes.get(a.id)!, boxes.get(b.id)!)) fail(`${a.id} overlaps ${b.id}`);
  }
}
