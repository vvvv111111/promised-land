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
    if (minDx > maxDx || minDz > maxDz || Math.hypot(Math.max(minDx, Math.min(maxDx, 0)), Math.max(minDz, Math.min(maxDz, 0))) > .25) throw new Error(`${node.id} overhangs its support; preserve the object and correct its parent/surface or local placement`);
    if (minDx <= maxDx && minDz <= maxDz) {
      const dx = Math.max(minDx, Math.min(maxDx, 0)), dz = Math.max(minDz, Math.min(maxDz, 0));
      if (Math.hypot(dx, dz) <= .25) {
        node.position[0] += dx; node.position[2] += dz;
        item.x = node.position[0]; item.z = node.position[2];
      }
    }
  }
  placeGiftObjects(definition);
  for (const item of design.furniture) if (item.parent) {
    const node = nodes.get(item.id)!;
    item.x = node.position[0]; item.z = node.position[2];
  }
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
  type Rect = { x: number; z: number; width: number; depth: number; bottom: number; top: number };
  const nodes = new Map(definition.nodes.map(n => [n.id, n]));
  const height = (node: RoomNode) => { let y = node.position[1], parent = node.parent; while (parent) { const n = nodes.get(parent)!; y += n.position[1]; parent = n.parent; } return y; };
  const supports = definition.nodes.flatMap(node => (node.surfaces ?? []).map(surface => ({ node, surface, key: `${node.id}/${surface.id}` }))).sort((a, b) => {
    const reach = (s: typeof a) => { const h = height(s.node) + s.surface.position[1]; return h >= .3 && h <= 1.3 ? 0 : 1; };
    return reach(a) - reach(b) || b.surface.size[0] * b.surface.size[1] - a.surface.size[0] * a.surface.size[1];
  });
  type Item = { node: RoomNode; bounds: ReturnType<typeof modelBounds>; contact?: ReturnType<typeof modelBounds>; support?: typeof supports[number]; original?: { x: number; z: number } };
  // Small authored props stay on their original surface, at their original scale and rotation.
  // Pack them together with the keepsakes so independent clamping cannot stack every prop in one corner.
  const props: Item[] = definition.nodes.flatMap(node => {
    if (!["generated", "plant"].includes(node.model) || !node.parent || node.surfaces?.length) return [];
    const support = supports.find(s => s.node.id === node.parent && s.surface.id === node.surface);
    if (!support) return [];
    const b = pointBounds(nodeLocalBoxes(node).flat()), base = supportFootprint(node);
    if (b.max[0] - b.min[0] > 1 || b.max[2] - b.min[2] > 1 || b.max[1] - b.min[1] > 1.5) return [];
    return [{ node, bounds: { min: [b.min[0] - node.position[0], b.min[1] - node.position[1], b.min[2] - node.position[2]], max: [b.max[0] - node.position[0], b.max[1] - node.position[1], b.max[2] - node.position[2]] } as ReturnType<typeof modelBounds>, contact: { min: base.min.map((v, i) => v - node.position[i]), max: base.max.map((v, i) => v - node.position[i]) } as ReturnType<typeof modelBounds>, support, original: { x: node.position[0], z: node.position[2] } }];
  }).sort((a, b) => (b.bounds.max[0] - b.bounds.min[0]) * (b.bounds.max[2] - b.bounds.min[2]) - (a.bounds.max[0] - a.bounds.min[0]) * (a.bounds.max[2] - a.bounds.min[2])).slice(0, 8);
  const movable = new Set(props.map(item => item.node.id));
  const occupied = new Map(supports.map(s => {
    const used: Rect[] = definition.nodes.filter(n => !["cd", "lamp", "envelope", "frame"].includes(n.id) && !movable.has(n.id) && n.parent === s.node.id && n.surface === s.surface.id).map(n => {
      const b = pointBounds(nodeLocalBoxes(n).flat());
      return { x: (b.min[0] + b.max[0]) / 2 - s.surface.position[0], z: (b.min[2] + b.max[2]) / 2 - s.surface.position[2], width: b.max[0] - b.min[0], depth: b.max[2] - b.min[2], bottom: b.min[1] - s.surface.position[1], top: b.max[1] - s.surface.position[1] };
    });
    // A platform railing or raised part is occupied even though it belongs to the support itself.
    if (s.node.geometry) for (const points of generatedBoxes(s.node.geometry)) {
      const b = pointBounds(points);
      if (b.max[1] <= s.surface.position[1] + .01) continue;
      used.push({ x: (b.min[0] + b.max[0]) / 2 - s.surface.position[0], z: (b.min[2] + b.max[2]) / 2 - s.surface.position[2], width: b.max[0] - b.min[0], depth: b.max[2] - b.min[2], bottom: b.min[1] - s.surface.position[1], top: b.max[1] - s.surface.position[1] });
    }
    return [s.key, used] as const;
  }));
  const items: Item[] = [...props, ...["cd", "lamp", "envelope"].map(id => { const node = definition.nodes.find(n => n.id === id)!; return { node, bounds: modelBounds(node) }; })];
  let budget = 20_000, missing = "cd";
  function place(index: number): boolean {
    if (index === items.length) return true;
    const item = items[index], { node, bounds } = item; missing = node.id;
    for (const scale of item.support ? [1] : [1, .85, .7, .55]) for (const support of item.support ? [item.support] : supports) {
      const { surface } = support, [sw, sd] = surface.size;
      for (const yaw of item.support ? [0] : [0, Math.PI / 2]) {
        const w = bounds.max[0] - bounds.min[0], d = bounds.max[2] - bounds.min[2];
        const width = (yaw ? d : w) * scale, depth = (yaw ? w : d) * scale;
        const halfW = width / 2, halfD = depth / 2, margin = .012, gap = .025, used = occupied.get(support.key)!;
        const top = (bounds.max[1] - bounds.min[1]) * scale + .005;
        const blockers = used.filter(r => r.top > .005 && r.bottom < top + .015);
        const cx = (bounds.min[0] + bounds.max[0]) / 2, cz = (bounds.min[2] + bounds.max[2]) / 2;
        // A vase's flowers may extend beyond the shelf; its real base must stay supported.
        // Keep the full upper footprint for collision checks against other objects and rails.
        const minX = item.contact ? -sw / 2 + margin + cx - item.contact.min[0] : -sw / 2 + halfW + margin;
        const maxX = item.contact ? sw / 2 - margin + cx - item.contact.max[0] : sw / 2 - halfW - margin;
        const minZ = item.contact ? -sd / 2 + margin + cz - item.contact.min[2] : -sd / 2 + halfD + margin;
        const maxZ = item.contact ? sd / 2 - margin + cz - item.contact.max[2] : sd / 2 - halfD - margin;
        if (minX > maxX || minZ > maxZ) continue;
        const px = item.original ? item.original.x + cx - surface.position[0] : 0, pz = item.original ? item.original.z + cz - surface.position[2] : 0;
        const unique = (values: number[]) => [...new Map(values.map(v => [Math.round(v * 1e7), v])).values()];
        const xs = unique([...(item.original ? [px] : []), minX, maxX, 0, ...blockers.flatMap(r => [r.x - r.width / 2 - halfW - gap, r.x + r.width / 2 + halfW + gap])]);
        const zs = unique([...(item.original ? [pz] : []), minZ, maxZ, 0, ...blockers.flatMap(r => [r.z - r.depth / 2 - halfD - gap, r.z + r.depth / 2 + halfD + gap])]);
        if (item.original) { xs.sort((a, b) => Math.abs(a - px) - Math.abs(b - px)); zs.sort((a, b) => Math.abs(a - pz) - Math.abs(b - pz)); }
        for (const x of xs) for (const z of zs) {
          if (--budget < 0) return false;
          if (x < minX - 1e-8 || x > maxX + 1e-8 || z < minZ - 1e-8 || z > maxZ + 1e-8) continue;
          if (blockers.some(r => Math.abs(x - r.x) < (width + r.width) / 2 + gap - 1e-8 && Math.abs(z - r.z) < (depth + r.depth) / 2 + gap - 1e-8)) continue;
          const nextX = surface.position[0] + x - (yaw ? cz : cx) * scale, nextZ = surface.position[2] + z - (yaw ? -cx : cz) * scale;
          if (item.original && Math.hypot(nextX - item.original.x, nextZ - item.original.z) > .4) continue;
          if (item.support) {
            node.position[0] = nextX; node.position[2] = nextZ;
          } else {
            node.parent = support.node.id; node.surface = surface.id; node.rotation = [0, yaw, 0]; node.scale = [scale, scale, scale];
            node.position = [nextX, surface.position[1] - bounds.min[1] * scale + .005, nextZ];
          }
          used.push({ x, z, width, depth, bottom: .005, top });
          if (place(index + 1)) return true;
          used.pop();
          if (budget < 0) return false;
        }
      }
    }
    return false;
  }
  if (!place(0)) {
    const item = items.find(item => item.node.id === missing)!;
    const size = [item.bounds.max[0] - item.bounds.min[0], item.bounds.max[1] - item.bounds.min[1], item.bounds.max[2] - item.bounds.min[2]].map(n => +n.toFixed(3));
    const available = (item.support ? [item.support] : supports).map(s => `${s.key}=${s.surface.size.map(n => +n.toFixed(3)).join("x")}m`).join(", ");
    throw new Error(`Not enough tabletop space for ${missing} (width/height/depth=${size.join("/")}m; supports: ${available}); preserve this object and correct its local position, supporting surface or obstructing parts. Small props only move up to 0.4m automatically; enlarge or add a suitable real support if needed`);
  }
}
