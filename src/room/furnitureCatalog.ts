import type { ModelId } from "./types";

// Dimensions and support heights mirror the local model geometry, never model-provided values.
export const furnitureCatalog = {
  sofa: { model: "sofa", width: 2.66, depth: 1.1 },
  table: { model: "table", width: 1.7, depth: 1.02, top: .6425, surface: [1.66, .96] },
  cabinet: { model: "cabinet", width: 2, depth: .76, top: 1.0725, surface: [1.96, .68] },
  "floor-plant": { model: "plant", width: .66, depth: .66 },
  rug: { model: "rug", width: 3.7, depth: 2.47 },
  bed: { model: "bed", width: 1.86, depth: 2.3 },
  desk: { model: "desk", width: 2.04, depth: .94, top: .7825, surface: [2, .9] },
  chair: { model: "chair", width: .6, depth: .66 },
  nightstand: { model: "nightstand", width: .66, depth: .6, top: .6025, surface: [.62, .56] },
  bookshelf: { model: "bookshelf", width: .94, depth: .44 },
  wardrobe: { model: "wardrobe", width: 1.74, depth: .78 },
} as const satisfies Record<string, { model: ModelId; width: number; depth: number; top?: number; surface?: readonly [number, number] }>;
export type FurnitureId = keyof typeof furnitureCatalog;
export const furnitureIds = Object.keys(furnitureCatalog) as FurnitureId[];
