import { defaultRoom, validateRoomDefinition } from "../definition";
import { furnitureCatalog, supportSurfaces } from "../furnitureCatalog";
import { materialIds, type RoomDefinition, type RoomNode } from "../types";
import { modelBounds, nodeLocalBoxes, supportFootprint } from "../spatial";
import { generatedBoxes, pointBounds } from "../generated";
import { withWallPhoto } from "../wallPhoto";
import { wallFace } from "../wallMount";
import type { RoomDesign } from "./design";

/** New designs start with the shell and gift interactions, not a furnished living-room template. */
export function compileModernDesign(design: RoomDesign) {
  let definition = structuredClone(defaultRoom);
  definition.id = "mimo-room-v3";
  definition.dimensions = [...design.dimensions!];
  definition.architecture = design.architecture!;
  definition.nodes = definition.nodes.filter(n => ["shell", "cd", "envelope", "frame", "lamp"].includes(n.id));
  for (const id of materialIds) {
    const material = definition.materials[id];
    if (material.texture) { material.color = "#ffffff"; material.texture.color = design.palette[id]; }
    else material.color = design.palette[id];
  }
  for (const item of design.furniture) {
    const node: RoomNode = item.type === "custom"
      ? { id: item.id, model: "generated", geometry: structuredClone(design.assets![item.asset!]), position: [item.x, 0, item.z], rotation: [0, item.rotation, 0] }
      : { id: item.id, model: furnitureCatalog[item.type!].model, position: [item.x, 0, item.z], rotation: [0, item.rotation, 0], size: [...item.size!] };
    if (item.colors) node.colors = { ...item.colors };
    const surfaces = supportSurfaces(node);
    if (surfaces.length) node.surfaces = surfaces;
    if (item.parent) { node.parent = item.parent; node.surface = item.surface; }
    if (item.mount) {
      node.mount = { ...item.mount };
      const normal = wallFace(definition, item.mount.wall) + .001 - modelBounds(node).min[2];
      node.rotation = [0, item.mount.wall === "left" ? Math.PI / 2 : 0, 0];
      node.position = item.mount.wall === "left" ? [normal, item.mount.bottom, item.mount.offset] : [item.mount.offset, item.mount.bottom, normal];
    }
    definition.nodes.push(node);
  }
  // Parents may be declared after their children. Reject cycles/missing parents before spatial traversal.
  const nodes = new Map(definition.nodes.map(n => [n.id, n]));
  for (const item of design.furniture) {
    const node = nodes.get(item.id)!;
    if (!node.parent) continue;
    const seen = new Set([node.id]); let ancestor: RoomNode | undefined = node;
    while (ancestor?.parent) {
      if (seen.has(ancestor.parent)) throw new Error(`cyclic support for ${node.id}`);
      seen.add(ancestor.parent); ancestor = nodes.get(ancestor.parent);
      if (!ancestor) throw new Error(`missing parent for ${node.id}`);
    }
    const surface = nodes.get(node.parent)?.surfaces?.find(s => s.id === node.surface);
    if (!surface) throw new Error(`missing real support ${node.parent}/${node.surface} for ${node.id}`);
    node.position[1] = surface.position[1] - modelBounds(node).min[1] + .005;
    const base = supportFootprint(node), [sx, , sz] = surface.position;
    const minDx = sx - surface.size[0] / 2 + .005 - base.min[0], maxDx = sx + surface.size[0] / 2 - .005 - base.max[0];
    const minDz = sz - surface.size[1] / 2 + .005 - base.min[2], maxDz = sz + surface.size[1] / 2 - .005 - base.max[2];
    if (minDx <= maxDx && minDz <= maxDz) {
      const dx = Math.max(minDx, Math.min(maxDx, 0)), dz = Math.max(minDz, Math.min(maxDz, 0));
      if (Math.hypot(dx, dz) <= .25) {
        node.position[0] += dx; node.position[2] += dz;
        item.x = node.position[0]; item.z = node.position[2];
      }
    }
  }
  placeGiftObjects(definition);
  definition = withWallPhoto(definition, true);
  definition.lighting.sun.color = design.lighting.sunColor;
  definition.lighting.sun.intensity = design.lighting.intensity;
  definition.lighting.ambient = design.lighting.ambient;
  definition.lighting.exposure = design.lighting.exposure;
  const [w, h, d] = definition.dimensions, fit = Math.max(w / 6, d / 4.8, h / 3);
  definition.camera = { ...definition.camera, target: [0, h / 3, 0], fitWidth: Math.hypot(w, d) + .7, minDistance: 4 * Math.min(1, fit), defaultDistance: 12 * fit, maxFitDistance: 25 * fit, maxDistance: 28 * fit };
  const sun = definition.lighting.sun;
  sun.position = [-w * .63, Math.max(6.5, h * 2), d * .63]; sun.target = [0, 0, 0];
  validateRoomDefinition(definition);
  return { design, definition };
}

/** Pack real object footprints onto real tabletop dimensions; no inherited coordinates. */
function placeGiftObjects(definition: RoomDefinition) {
  type Rect = { x: number; z: number; width: number; depth: number };
  const nodes = new Map(definition.nodes.map(n => [n.id, n]));
  const height = (node: RoomNode) => { let y = node.position[1], parent = node.parent; while (parent) { const n = nodes.get(parent)!; y += n.position[1]; parent = n.parent; } return y; };
  const supports = definition.nodes.flatMap(node => (node.surfaces ?? []).map(surface => ({ node, surface, key: `${node.id}/${surface.id}` }))).sort((a, b) => {
    const reach = (s: typeof a) => { const h = height(s.node) + s.surface.position[1]; return h >= .3 && h <= 1.3 ? 0 : 1; };
    return reach(a) - reach(b) || b.surface.size[0] * b.surface.size[1] - a.surface.size[0] * a.surface.size[1];
  });
  const occupied = new Map(supports.map(s => {
    const used: Rect[] = definition.nodes.filter(n => !["cd", "lamp", "envelope", "frame"].includes(n.id) && n.parent === s.node.id && n.surface === s.surface.id).map(n => {
      const b = pointBounds(nodeLocalBoxes(n).flat());
      return { x: (b.min[0] + b.max[0]) / 2 - s.surface.position[0], z: (b.min[2] + b.max[2]) / 2 - s.surface.position[2], width: b.max[0] - b.min[0], depth: b.max[2] - b.min[2] };
    });
    // A platform railing or raised part is occupied even though it belongs to the support itself.
    if (s.node.geometry) for (const points of generatedBoxes(s.node.geometry)) {
      const b = pointBounds(points);
      if (b.max[1] <= s.surface.position[1] + .01 || b.min[1] > s.surface.position[1] + .7) continue;
      used.push({ x: (b.min[0] + b.max[0]) / 2 - s.surface.position[0], z: (b.min[2] + b.max[2]) / 2 - s.surface.position[2], width: b.max[0] - b.min[0], depth: b.max[2] - b.min[2] });
    }
    return [s.key, used] as const;
  }));
  const items = ["cd", "lamp", "envelope"].map(id => { const node = definition.nodes.find(n => n.id === id)!; return { node, bounds: modelBounds(node) }; });
  let budget = 1000, missing = "cd";
  // Backtrack the three keepsakes together. Greedy placement can consume all space
  // with the first object even when a smaller, rotated arrangement fits them all.
  function place(index: number): boolean {
    if (index === items.length) return true;
    if (--budget < 0) return false;
    const { node, bounds } = items[index]; missing = node.id;
    for (const scale of [1, .85, .7, .55]) for (const support of supports) {
      const { surface } = support, [sw, sd] = surface.size;
      for (const yaw of [0, Math.PI / 2]) {
        const w = bounds.max[0] - bounds.min[0], d = bounds.max[2] - bounds.min[2];
        const width = (yaw ? d : w) * scale, depth = (yaw ? w : d) * scale;
        const halfW = width / 2, halfD = depth / 2, margin = .012, gap = .025, used = occupied.get(support.key)!;
        const xs = [-sw / 2 + halfW + margin, sw / 2 - halfW - margin, 0, ...used.flatMap(r => [r.x - r.width / 2 - halfW - gap, r.x + r.width / 2 + halfW + gap])];
        const zs = [-sd / 2 + halfD + margin, sd / 2 - halfD - margin, 0, ...used.flatMap(r => [r.z - r.depth / 2 - halfD - gap, r.z + r.depth / 2 + halfD + gap])];
        for (const x of xs) for (const z of zs) {
          if (Math.abs(x) + halfW + margin > sw / 2 + 1e-8 || Math.abs(z) + halfD + margin > sd / 2 + 1e-8) continue;
          if (used.some(r => Math.abs(x - r.x) < (width + r.width) / 2 + gap - 1e-8 && Math.abs(z - r.z) < (depth + r.depth) / 2 + gap - 1e-8)) continue;
          const cx = (bounds.min[0] + bounds.max[0]) / 2, cz = (bounds.min[2] + bounds.max[2]) / 2;
          node.parent = support.node.id; node.surface = surface.id; node.rotation = [0, yaw, 0]; node.scale = [scale, scale, scale];
          node.position = [surface.position[0] + x - (yaw ? cz : cx) * scale, surface.position[1] - bounds.min[1] * scale + .005, surface.position[2] + z - (yaw ? -cx : cz) * scale];
          used.push({ x, z, width, depth });
          if (place(index + 1)) return true;
          used.pop();
          if (budget < 0) return false;
        }
      }
    }
    return false;
  }
  if (!place(0)) throw new Error(`Not enough tabletop space for ${missing}; enlarge or add a desk, dining-table, table, cabinet or nightstand`);
}
