import type { ModelId, RoomDefinition, RoomNode, Vec3 } from "./types";
import { clearsWindows, wallFace, windowRects } from "./wallMount";
import { supportSpec, supportSurfaces } from "./furnitureCatalog";
import { generatedBoxes, pointBounds } from "./generated";

type Bounds = { min: Vec3; max: Vec3 };
// Conservative local geometry envelopes. Keep these alongside model changes.
const envelopes: Record<Exclude<ModelId, "shell" | "generated">, Bounds> = {
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
  "dining-table": { min: [-.9, 0, -.45], max: [.9, .76, .45] },
  armchair: { min: [-.475, 0, -.475], max: [.475, 1.05, .475] },
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

/** Separating-axis test on actual transformed boxes, including yaw and nested supports. */
export function boxesIntersect(a: Vec3[], b: Vec3[], tolerance = .003): boolean {
  const sub = (u: Vec3, v: Vec3): Vec3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const cross = (u: Vec3, v: Vec3): Vec3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const edges = (p: Vec3[]) => [sub(p[4], p[0]), sub(p[2], p[0]), sub(p[1], p[0])];
  const ea = edges(a), eb = edges(b);
  const axes = [cross(ea[0], ea[1]), cross(ea[0], ea[2]), cross(ea[1], ea[2]), cross(eb[0], eb[1]), cross(eb[0], eb[2]), cross(eb[1], eb[2]), ...ea.flatMap(u => eb.map(v => cross(u, v)))];
  return axes.every(axis => {
    const length = Math.hypot(...axis);
    if (length < 1e-10) return true;
    const project = (points: Vec3[]) => points.map(p => (p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]) / length);
    const pa = project(a), pb = project(b);
    return Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) > tolerance;
  });
}

export function modelBounds(node: Pick<RoomNode, "model" | "size" | "wall" | "geometry" | "petAsset">): Bounds {
  if (node.model === "pet" && node.petAsset) {
    const [w, h, d] = node.petAsset.size;
    return { min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] };
  }
  if (node.model === "generated") return pointBounds(generatedBoxes(node.geometry!).flat());
  if (node.size) return { min: [-node.size[0] / 2, 0, -node.size[2] / 2], max: [node.size[0] / 2, node.size[1], node.size[2] / 2] };
  if (node.model === "shell") throw new Error("Shell bounds are defined by room dimensions");
  return node.model === "frame" && node.wall ? { min: [-.38, -.305, -.0325], max: [.38, .305, .052] } : envelopes[node.model];
}

function localPoints(node: RoomNode) {
  if (node.model === "shell") throw new Error("Shell bounds are defined by room dimensions");
  return corners(modelBounds(node)).map(p => transform(p, node));
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

export function nodeLocalBoxes(node: RoomNode): Vec3[][] {
  return (node.model === "generated" ? generatedBoxes(node.geometry!) : [corners(modelBounds(node))]).map(box => box.map(p => transform(p, node)));
}
export function nodeWorldBoxes(plan: RoomDefinition, node: RoomNode): Vec3[][] {
  const nodes = new Map(plan.nodes.map(n => [n.id, n]));
  return nodeLocalBoxes(node).map(box => box.map(p => {
    let parent = node.parent;
    while (parent) { const n = nodes.get(parent)!; p = transform(p, n); parent = n.parent; }
    return p;
  }));
}

/** A vase/TV is held by its base; foliage/screens may extend beyond the tabletop.
 * Upper geometry remains part of every room-bound and inter-object collision check. */
export function supportFootprint(node: RoomNode): Bounds {
  const boxes = nodeLocalBoxes(node), all = pointBounds(boxes.flat());
  if (node.model !== "generated") return all;
  return pointBounds(boxes.filter(b => pointBounds(b).min[1] <= all.min[1] + .015).flat());
}

/** A plan is renderable only when complete model envelopes are physically supported. */
export function validateRoomSpace(plan: RoomDefinition) {
  const fail = (message: string): never => { throw new Error(`Invalid room definition: ${message}`); };
  const nodes = new Map(plan.nodes.map(node => [node.id, node]));
  const worldBounds = new Map<string, Bounds>();
  const localBounds = new Map<string, Bounds>();
  const worldPoints = new Map<string, Vec3[]>(), localGeometry = new Map<string, Vec3[]>();
  const pieces = new Map<string, Vec3[][]>();
  const mounted = new Set<string>();
  const same = (actual: Vec3 | undefined, expected: Vec3, fallback: Vec3) => (actual ?? fallback).every((v, i) => Math.abs(v - expected[i]) < .001);
  for (const node of plan.nodes) {
    if (node.model === "shell") {
      if (node.parent || node.position.some(v => v !== 0) || node.rotation?.some(v => v !== 0) || node.scale?.some(v => v !== 1)) fail("shell transform must use room dimensions");
      continue;
    }
    if (!node.surface && node.parent) fail(`${node.id} requires an explicit support`);
    const expectedSurfaces = supportSurfaces(node);
    for (const surface of node.surfaces ?? []) {
      const actual = expectedSurfaces.find(s => s.id === surface.id);
      if (!actual || surface.position.some((v, i) => Math.abs(v - actual.position[i]) > .001) || surface.size.some((v, i) => Math.abs(v - actual.size[i]) > .001)) fail(`${node.id} support metadata differs from real geometry`);
    }
    const geometry = localPoints(node);
    localGeometry.set(node.id, geometry);
    localBounds.set(node.id, bounds(geometry));
    if (node.surface) {
      const parent = nodes.get(node.parent!)!;
      const spec = supportSpec(parent, node.surface);
      if (!spec) fail("unsupported furniture surface");
      const surface = parent.surfaces!.find(s => s.id === node.surface)!;
      if (surface.position.some((v, i) => Math.abs(v - [spec!.x, spec!.y, spec!.z][i]) > .001) || Math.abs(surface.size[0] - spec!.width) > .001 || Math.abs(surface.size[1] - spec!.depth) > .001) fail("support metadata differs from model");
      const local = bounds(geometry), base = supportFootprint(node);
      if (base.min[0] < spec!.x - spec!.width / 2 || base.max[0] > spec!.x + spec!.width / 2 || base.min[2] < spec!.z - spec!.depth / 2 || base.max[2] > spec!.z + spec!.depth / 2) fail(`${node.id} overhangs its support; keep its entire contact base inside ${parent.id}/${node.surface}`);
      if (Math.abs(local.min[1] - spec!.y) > .05) fail(`${node.id} floats or penetrates its support`);
    }
    const points = geometry.map(p => {
      let parent = node.parent;
      while (parent) { const n = nodes.get(parent)!; p = transform(p, n); parent = n.parent; }
      return p;
    });
    const box = bounds(points); worldBounds.set(node.id, box);
    worldPoints.set(node.id, points);
    pieces.set(node.id, nodeWorldBoxes(plan, node));
    if (box.min[0] < -plan.dimensions[0] / 2 - .01 || box.max[0] > plan.dimensions[0] / 2 + .01 || box.min[2] < -plan.dimensions[2] / 2 - .01 || box.max[2] > plan.dimensions[2] / 2 + .01 || box.min[1] < -.04 || box.max[1] > plan.dimensions[1] + .01) fail(`${node.id} crosses room bounds`);
    // Legacy shell decorations have known physical mounts. Other root models need floor contact.
    const windowPlant = !plan.architecture && node.id === "window-plant" && node.model === "plant" && !node.parent
      && same(node.position, [-2.78 * plan.dimensions[0] / 6, 1.03 * plan.dimensions[1] / 3, -.99 * plan.dimensions[2] / 4.8], [0, 0, 0])
      && same(node.scale, [.43, .43, .43], [1, 1, 1]) && same(node.rotation, [0, 0, 0], [0, 0, 0]);
    const wallClock = node.model === "clock" && !node.parent && Math.abs(node.position[2] - (2.4 - plan.dimensions[2] / 2)) < .001
      && same(node.scale, [1, 1, 1], [1, 1, 1]) && same(node.rotation, [0, 0, 0], [0, 0, 0]);
    if (windowPlant || wallClock) mounted.add(node.id);
    if (node.mount) {
      const { wall, offset, bottom } = node.mount, axis = wall === "back" ? 2 : 0, along = wall === "back" ? 0 : 2;
      if (!same(node.rotation, [0, wall === "left" ? Math.PI / 2 : 0, 0], [0, 0, 0]) || Math.abs(node.position[along] - offset) > .001 || Math.abs(node.position[1] - bottom) > .001 || Math.abs(box.min[axis] - wallFace(plan, wall) - .001) > .003) fail(`${node.id} must contact its declared wall mount`);
      const windows = windowRects(plan, wall);
      const contact = pieces.get(node.id)!.map(pointBounds).some(b => Math.abs(b.min[axis] - wallFace(plan, wall) - .001) < .003
        && [b.min[along], b.max[along]].some(x => [b.min[1], b.max[1]].some(y => !windows.some(w => x > w.min && x < w.max && y > w.bottom && y < w.top))));
      if (!contact) fail(`${node.id} wall attachment falls entirely in a window opening; provide a real contact on solid wall`);
      mounted.add(node.id);
    }
    if (node.wall) {
      const scale = node.scale?.[0] ?? 1, normalAxis = node.wall === "back" ? 2 : 0, alongAxis = node.wall === "back" ? 0 : 2;
      if (!same(node.scale, [scale, scale, scale], [1, 1, 1]) || !same(node.rotation, [0, node.wall === "left" ? Math.PI / 2 : 0, 0], [0, 0, 0])) fail("wall frame must face into the room without tilt");
      if (Math.abs(box.min[normalAxis] - wallFace(plan, node.wall) - .001) > .003) fail("photo must contact its wall mount");
      if (!clearsWindows(plan, node.wall, node.position[alongAxis], node.position[1], scale)) fail("photo overlaps a window or its trim");
      mounted.add(node.id);
    }
    if (!node.parent && !mounted.has(node.id) && (box.min[1] < -.04 || box.min[1] > .15)) fail(`${node.id} is not supported by the floor`);
  }
  const solid = plan.nodes.filter(n => n.model !== "shell" && n.model !== "rug" && (n.model === "frame" || n.model === "generated" || !mounted.has(n.id)));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    // Attached contents naturally overlap their supporting furniture envelope.
    if ((a.parent === b.id && b.model !== "generated") || (b.parent === a.id && a.model !== "generated")) continue;
    const boxes = a.parent && a.parent === b.parent ? localBounds : worldBounds;
    const points = a.parent && a.parent === b.parent ? localGeometry : worldPoints;
    if (overlaps(boxes.get(a.id)!, boxes.get(b.id)!)) {
      const collision = a.model === "generated" || b.model === "generated"
        ? pieces.get(a.id)!.some(pa => pieces.get(b.id)!.some(pb => boxesIntersect(pa, pb)))
        : boxesIntersect(points.get(a.id)!, points.get(b.id)!);
      if (collision) fail(`${a.id} overlaps ${b.id}; separate the colliding geometry or use a real parent/surface`);
    }
  }
}
