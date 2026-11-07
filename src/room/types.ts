/** Serializable room plan. Business content remains in GiftStore / audio storage. */
export type Vec3 = [number, number, number];
export const modelIds = ["shell", "sofa", "rug", "table", "cd", "envelope", "cabinet", "frame", "lamp", "plant", "clock", "pet", "slippers"] as const;
export type ModelId = typeof modelIds[number];
export type RoomObjectId = "sunset-frame" | "sealed-letter" | "lamp" | "cd-player";
export const materialIds = ["wood", "paleWood", "darkWood", "plaster", "trim", "sofaFabric", "creamFabric", "rugFabric", "paper", "terracotta", "green", "ceramic", "brass", "ink"] as const;
export type MaterialId = typeof materialIds[number];
export interface MaterialSpec {
  color: string;
  roughness: number;
  texture?: { kind: "wood" | "cloth"; color: string };
}
export interface RoomNode {
  id: string;
  model: ModelId;
  parent?: string;
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  interaction?: RoomObjectId;
  /** Named support surfaces, local to this furniture model. */
  surfaces?: { id: string; position: Vec3; size: [number, number] }[];
  surface?: string;
}
export interface RoomDefinition {
  version: 1;
  id: string;
  seed: number;
  /** Width, height, depth of the rectangular shell. Model units are metres. */
  dimensions: Vec3;
  materials: Record<MaterialId, MaterialSpec>;
  nodes: RoomNode[];
  lighting: {
    background: string; exposure: number; environment: number;
    sky: string; ground: string; ambient: number;
    sun: { color: string; intensity: number; position: Vec3; target: Vec3 };
  };
  camera: { fov: number; target: Vec3; direction: Vec3; minDistance: number; maxDistance: number; fitWidth: number; defaultDistance: number; maxFitDistance: number };
}
