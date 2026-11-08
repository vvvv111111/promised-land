import { furnitureIds, furnitureSize, validateFurnitureSize, type FurnitureId } from "../furnitureCatalog";
import { boxCorners, generatedBoxes, parseGeneratedAsset, pointBounds, transformPoint } from "../generated";
import type { Vec3 } from "../types";

/** Generated layouts and photographs have approximate coordinates. Correct only small wall-margin errors,
 * then run the unchanged full design/space validators. Never rearrange furniture or resize it. */
export function fitReferenceDesign(input: unknown): { input: unknown; corrections: number } {
  if (!input || typeof input !== "object" || !("version" in input) || input.version !== 2) return { input, corrections: 0 };
  const candidate = structuredClone(input) as Record<string, unknown>;
  const dimensions = candidate.dimensions ?? [6, 3, 4.8];
  if (!Array.isArray(dimensions) || dimensions.length !== 3 || !dimensions.every(n => typeof n === "number" && Number.isFinite(n)) || dimensions[0] < 3 || dimensions[0] > 12 || dimensions[2] < 3 || dimensions[2] > 12 || !Array.isArray(candidate.furniture)) return { input, corrections: 0 };
  let corrections = 0;
  for (const raw of candidate.furniture) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>, type = item.type as FurnitureId;
    if (item.parent !== undefined || item.mount !== undefined) continue; // Support/mount coordinates must not be clamped as floor furniture.
    if ((item.type !== "custom" && !furnitureIds.includes(type)) || typeof item.x !== "number" || !Number.isFinite(item.x) || typeof item.z !== "number" || !Number.isFinite(item.z) || typeof item.rotation !== "number" || !Number.isFinite(item.rotation) || Math.abs(item.rotation) > Math.PI) continue;
    let points: Vec3[];
    try {
      if (item.type === "custom") {
        const assets = candidate.assets as Record<string, unknown> | undefined;
        if (!assets || typeof item.asset !== "string" || !Object.hasOwn(assets, item.asset)) continue;
        points = generatedBoxes(parseGeneratedAsset(assets[item.asset])).flat();
      } else {
        const size = item.size === undefined ? furnitureSize(type) : validateFurnitureSize(type, item.size);
        points = boxCorners([-size[0] / 2, 0, -size[2] / 2], [size[0] / 2, size[1], size[2] / 2]);
      }
    }
    catch { continue; }
    const b = pointBounds(points.map(p => transformPoint(p, { position: [0, 0, 0], rotation: [0, item.rotation as number, 0] })));
    const minX = -dimensions[0] / 2 + .1 - b.min[0], maxX = dimensions[0] / 2 - .1 - b.max[0];
    const minZ = -dimensions[2] / 2 + .1 - b.min[2], maxZ = dimensions[2] / 2 - .1 - b.max[2];
    if (minX > maxX || minZ > maxZ) continue;
    const x = Math.max(minX, Math.min(maxX, item.x)), z = Math.max(minZ, Math.min(maxZ, item.z));
    const displacement = Math.hypot(x - item.x, z - item.z);
    if (displacement > 1e-7 && displacement <= .4) { item.x = x; item.z = z; corrections++; }
  }
  return { input: candidate, corrections };
}
