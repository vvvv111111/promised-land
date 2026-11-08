import { validateRoomDefinition } from "./definition";
import { boxesIntersect, nodeWorldBounds, nodeWorldBoxes } from "./spatial";
import { pointBounds } from "./generated";
import { validatePetAsset, type PetAsset } from "./petAsset";
import type { RoomDefinition, RoomNode } from "./types";

export function customPet(plan: RoomDefinition) { return plan.nodes.find(n => n.model === "pet" && n.petAsset); }

/** Deterministic placement uses the same measured envelopes as rendering/validation. */
export function composePet(input: RoomDefinition, asset: PetAsset, previous?: RoomNode, yaw = previous?.rotation?.[1] ?? 0): RoomDefinition {
  validateRoomDefinition(input); validatePetAsset(asset);
  if (!Number.isFinite(yaw) || Math.abs(yaw) > Math.PI * 2) throw new Error("宠物朝向无效。");
  const plan = structuredClone(input);
  plan.nodes = plan.nodes.filter(n => n.model !== "pet");
  const node: RoomNode = { id: "companion-pet", model: "pet", petAsset: structuredClone(asset), position: [0, .005, 0], rotation: [0, yaw, 0] };
  // Do not shadow an agent-authored furniture id.
  while (plan.nodes.some(n => n.id === node.id)) node.id += "-p";
  const [w, , d] = plan.dimensions;
  const preferred = previous?.position ?? [w * .32, 0, d * .32];
  const candidates: [number, number][] = [[preferred[0], preferred[2]]];
  const grid: [number, number][] = [];
  for (let x = -w / 2 + .2; x < w / 2; x += .22) for (let z = -d / 2 + .2; z < d / 2; z += .22) grid.push([x, z]);
  grid.sort((a, b) => Math.hypot(a[0] - preferred[0], a[1] - preferred[2]) - Math.hypot(b[0] - preferred[0], b[1] - preferred[2]));
  candidates.push(...grid);
  plan.nodes.push(node);
  const rugs = plan.nodes.filter(n => n.model === "rug").map(n => nodeWorldBounds(plan, n));
  // Existing room geometry is already validated. Cache it instead of rechecking every
  // furniture pair for each possible pet position in a dense room.
  const obstacles = plan.nodes.filter(n => !["shell", "rug", "pet"].includes(n.model)).flatMap(n => nodeWorldBoxes(plan, n)).map(points => ({ points, bounds: pointBounds(points) }));
  for (const [x, z] of candidates) {
    node.position = [x, .005, z];
    const footprint = nodeWorldBounds(plan, node);
    let floor = 0, partialRug = false;
    for (const rug of rugs) {
      if (footprint.min[0] < rug.max[0] && footprint.max[0] > rug.min[0] && footprint.min[2] < rug.max[2] && footprint.max[2] > rug.min[2]) {
        if (footprint.min[0] < rug.min[0] || footprint.max[0] > rug.max[0] || footprint.min[2] < rug.min[2] || footprint.max[2] > rug.max[2]) { partialRug = true; break; }
        floor = Math.max(floor, rug.max[1]);
      }
    }
    if (partialRug) continue;
    node.position[1] = floor + .005;
    // Reserve 8cm around the pet; never change its requested physical size to fit.
    const clearance: RoomNode = { ...node, petAsset: { ...asset, size: [asset.size[0] + .16, asset.size[1], asset.size[2] + .16] } };
    const points = nodeWorldBoxes(plan, clearance)[0], bounds = pointBounds(points);
    if (floor > .14 || bounds.min[0] < -w / 2 + .02 || bounds.max[0] > w / 2 - .02 || bounds.min[2] < -d / 2 + .02 || bounds.max[2] > d / 2 - .02 || bounds.max[1] > plan.dimensions[1] - .02) continue;
    if (obstacles.some(obstacle => [0, 1, 2].every(i => Math.min(bounds.max[i], obstacle.bounds.max[i]) - Math.max(bounds.min[i], obstacle.bounds.min[i]) > .003) && boxesIntersect(points, obstacle.points))) continue;
    validateRoomDefinition(plan);
    return plan;
  }
  throw new Error("房间内没有足够的落脚空间，当前房间和宠物已保留。请调整房间布局后重试。");
}

export function preservePet(next: RoomDefinition, previous: RoomDefinition) {
  const pet = customPet(previous);
  return pet?.petAsset ? composePet(next, pet.petAsset, pet) : next;
}
