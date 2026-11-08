import { furnitureIds, furnitureSize, validateFurnitureSize, type FurnitureId } from "../furnitureCatalog";
import { boxCorners, generatedBoxes, parseGeneratedAsset, pointBounds, transformPoint } from "../generated";
import type { RoomWindow, Vec3 } from "../types";

/** Fit windows to their actual wall without resizing, changing walls or dropping a window. */
function fitWindows(candidate: Record<string, unknown>, dimensions: number[]) {
  const architecture = candidate.architecture as { windows?: unknown } | undefined;
  if (!architecture || !Array.isArray(architecture.windows) || architecture.windows.length > 8) return 0;
  const windows = architecture.windows as RoomWindow[];
  if (windows.some(w => !w || !["left", "back"].includes(w.wall) || ![w.offset, w.width, w.bottom, w.height].every(Number.isFinite) || w.width < .4 || w.width > 8 || w.height < .6 || w.height > dimensions[1] - .45)) return 0;
  const before = windows.map(w => [w.offset, w.bottom]);
  for (const wall of ["left", "back"] as const) {
    const group = windows.filter(w => w.wall === wall).sort((a, b) => a.offset - b.offset);
    const half = dimensions[wall === "left" ? 2 : 0] / 2 - .2;
    // An impossible fit stays an explicit error, rather than silently shrinking the reference.
    if (group.length > 4 || group.reduce((sum, w) => sum + w.width, 0) + Math.max(0, group.length - 1) * .15 > half * 2 + 1e-6) continue;
    for (let i = 0; i < group.length; i++) {
      const w = group[i];
      w.offset = Math.max(-half + w.width / 2, Math.min(half - w.width / 2, w.offset));
      if (i) w.offset = Math.max(w.offset, group[i - 1].offset + (group[i - 1].width + w.width) / 2 + .15);
      w.bottom = Math.max(.3, Math.min(dimensions[1] - .15 - w.height, w.bottom));
    }
    for (let i = group.length - 1; i >= 0; i--) {
      const w = group[i];
      w.offset = Math.min(w.offset, i === group.length - 1 ? half - w.width / 2 : group[i + 1].offset - (group[i + 1].width + w.width) / 2 - .15);
    }
  }
  return windows.filter((w, i) => Math.abs(w.offset - before[i][0]) > 1e-6 || Math.abs(w.bottom - before[i][1]) > 1e-6).length;
}

/** Fit windows to their walls and correct small furniture wall-margin errors,
 * then run full design/space validation. Preserve all object sizes and counts. */
export function fitReferenceDesign(input: unknown): { input: unknown; corrections: number } {
  if (!input || typeof input !== "object" || !("version" in input) || input.version !== 2) return { input, corrections: 0 };
  const candidate = structuredClone(input) as Record<string, unknown>;
  const dimensions = candidate.dimensions ?? [6, 3, 4.8];
  if (!Array.isArray(dimensions) || dimensions.length !== 3 || !dimensions.every(n => typeof n === "number" && Number.isFinite(n)) || dimensions[0] < 3 || dimensions[0] > 12 || dimensions[2] < 3 || dimensions[2] > 12 || !Array.isArray(candidate.furniture)) return { input, corrections: 0 };
  let corrections = fitWindows(candidate, dimensions);
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
