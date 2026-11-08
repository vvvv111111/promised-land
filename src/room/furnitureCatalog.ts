import type { MaterialId, ModelId, RoomNode, Vec3 } from "./types";
import { generatedSurfaces } from "./generated";

// Dimensions and support heights mirror the local model geometry, never model-provided values.
export const furnitureCatalog = {
  sofa: { model: "sofa", width: 2.66, height: 1.23, depth: 1.1, min: [1.4, .8, .75], max: [3.6, 1.4, 1.4] },
  table: { model: "table", width: 1.7, height: .6425, depth: 1.02, top: .6425, surface: [1.66, .96], min: [.8, .35, .5], max: [2.4, .7, 1.4] },
  cabinet: { model: "cabinet", width: 2, height: 1.0725, depth: .76, top: 1.0725, surface: [1.96, .68], min: [.8, .7, .45], max: [3, 1.3, .9] },
  "floor-plant": { model: "plant", width: .66, height: 1.15, depth: .66, min: [.3, .5, .3], max: [1, 1.8, 1] },
  rug: { model: "rug", width: 3.7, height: .06, depth: 2.47, min: [.8, .025, .6], max: [5, .08, 4] },
  bed: { model: "bed", width: 1.86, height: 1.14, depth: 2.3, min: [.95, .8, 1.9], max: [2.2, 1.5, 2.5] },
  desk: { model: "desk", width: 2.04, height: .7825, depth: .94, top: .7825, surface: [2, .9], min: [.9, .68, .55], max: [2.8, .85, 1.1] },
  chair: { model: "chair", width: .6, height: .985, depth: .66, min: [.45, .75, .45], max: [.75, 1.15, .8] },
  nightstand: { model: "nightstand", width: .66, height: .6025, depth: .6, top: .6025, surface: [.62, .56], min: [.4, .4, .35], max: [.9, .8, .8] },
  bookshelf: { model: "bookshelf", width: .94, height: 1.88, depth: .44, min: [.5, 1, .3], max: [2, 2.6, .65] },
  wardrobe: { model: "wardrobe", width: 1.74, height: 2.22, depth: .78, min: [.9, 1.7, .55], max: [3, 2.8, .9] },
  "dining-table": { model: "dining-table", width: 1.8, height: .76, depth: .9, top: .76, surface: [1.76, .86], min: [.9, .7, .65], max: [3, .85, 1.4] },
  armchair: { model: "armchair", width: .95, height: 1.05, depth: .95, min: [.75, .8, .75], max: [1.3, 1.3, 1.3] },
} as const satisfies Record<string, { model: ModelId; width: number; height: number; depth: number; min: readonly number[]; max: readonly number[]; top?: number; surface?: readonly [number, number] }>;
export type FurnitureId = keyof typeof furnitureCatalog;
export const furnitureIds = Object.keys(furnitureCatalog) as FurnitureId[];

/** Only these materials are actually used by the parameter-built geometry. */
export const furnitureMaterials: Record<FurnitureId, readonly MaterialId[]> = {
  sofa: ["darkWood", "sofaFabric", "creamFabric"],
  table: ["wood", "darkWood"],
  cabinet: ["wood", "darkWood", "brass"],
  "floor-plant": ["terracotta", "green"],
  rug: ["rugFabric", "creamFabric"],
  bed: ["wood", "darkWood", "creamFabric", "sofaFabric"],
  desk: ["wood", "darkWood", "brass"],
  chair: ["wood", "darkWood", "creamFabric"],
  nightstand: ["wood", "darkWood", "brass"],
  bookshelf: ["wood", "darkWood", "creamFabric", "green", "terracotta"],
  wardrobe: ["wood", "darkWood", "brass"],
  "dining-table": ["wood", "darkWood"],
  armchair: ["darkWood", "sofaFabric", "creamFabric"],
};

export function furnitureSize(type: FurnitureId): Vec3 {
  const { width, height, depth } = furnitureCatalog[type];
  return [width, height, depth];
}

export function validateFurnitureSize(type: FurnitureId, value: unknown): Vec3 {
  const spec = furnitureCatalog[type];
  if (!Array.isArray(value) || value.length !== 3 || value.some((n, i) => typeof n !== "number" || !Number.isFinite(n) || n < spec.min[i] || n > spec.max[i])) {
    throw new Error(`${type} size [width,height,depth] must be between ${spec.min} and ${spec.max}`);
  }
  return [...value] as Vec3;
}

export function furnitureType(model: ModelId): FurnitureId | undefined {
  return furnitureIds.find(id => furnitureCatalog[id].model === model);
}

/** Metadata is computed from the same parameters as the tabletop geometry. */
export function supportSurfaces(node: Pick<RoomNode, "model" | "size" | "geometry">) {
  if (node.model === "generated") return generatedSurfaces(node.geometry!);
  const type = furnitureType(node.model);
  if (!type) return [];
  const spec = furnitureCatalog[type];
  // Parameter-built shelves and wardrobes have an actual full-width top board.
  if (node.size && ["bookshelf", "wardrobe"].includes(type)) return [{ id: "top", position: [0, node.size[1], 0] as Vec3, size: [node.size[0] - .04, node.size[2] - .04] as [number, number] }];
  if (!("top" in spec)) return [];
  return [{ id: "top", position: [0, node.size?.[1] ?? spec.top, 0] as Vec3, size: node.size ? [node.size[0] - .04, node.size[2] - .04] as [number, number] : [...spec.surface] as [number, number] }];
}
export function supportSpec(node: Pick<RoomNode, "model" | "size" | "geometry">, id = "top") {
  const surface = supportSurfaces(node).find(s => s.id === id);
  return surface && { x: surface.position[0], y: surface.position[1], z: surface.position[2], width: surface.size[0], depth: surface.size[1] };
}
