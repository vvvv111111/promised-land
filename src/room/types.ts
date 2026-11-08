import type { PetAsset } from "./petAsset";
/** Serializable room plan. Business content remains in GiftStore / audio storage. */
export type Vec3 = [number, number, number];
export const modelIds = ["shell", "sofa", "rug", "table", "cd", "envelope", "cabinet", "frame", "lamp", "plant", "clock", "pet", "slippers", "bed", "desk", "chair", "nightstand", "bookshelf", "wardrobe", "dining-table", "armchair", "generated"] as const;
export type ModelId = typeof modelIds[number];
export type RoomObjectId = "sunset-frame" | "sealed-letter" | "lamp" | "cd-player";
export const materialIds = ["wood", "paleWood", "darkWood", "plaster", "trim", "sofaFabric", "creamFabric", "rugFabric", "paper", "terracotta", "green", "ceramic", "brass", "ink"] as const;
export type MaterialId = typeof materialIds[number];
/** Data-only geometry authored by the room agent. Dimensions are full extents, in metres. */
export interface GeneratedPart {
  shape: "box" | "cylinder" | "cone" | "ellipsoid";
  size: Vec3;
  position: Vec3;
  rotation?: Vec3;
  color: string;
  material?: MaterialId;
}
export interface GeneratedAsset {
  label: string;
  parts: GeneratedPart[];
  /** A support must name a real, level box top; its footprint is derived, never invented. */
  supports?: { id: string; part: number }[];
}
export interface WallMount { wall: "left" | "back"; offset: number; bottom: number }
export interface MaterialSpec {
  color: string;
  roughness: number;
  texture?: { kind: "wood" | "cloth"; color: string };
}
export interface RoomNode {
  id: string;
  model: ModelId;
  petAsset?: PetAsset;
  geometry?: GeneratedAsset;
  mount?: WallMount;
  parent?: string;
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  /** Parameter-built furniture: outer width, height, depth in metres; never mesh stretching. */
  size?: Vec3;
  colors?: Partial<Record<MaterialId, string>>;
  interaction?: RoomObjectId;
  /** Named support surfaces, local to this furniture model. */
  surfaces?: { id: string; position: Vec3; size: [number, number] }[];
  surface?: string;
  /** Wall-mounted photo frames face into the room, independent of furniture. */
  wall?: "left" | "back";
}
export interface RoomWindow {
  wall: "left" | "back";
  /** Along z on the left wall, along x on the back wall, in local shell metres. */
  offset: number;
  width: number;
  bottom: number;
  height: number;
}
export interface RoomArchitecture {
  /** Absent on historical plans whose shell coordinates are scaled from 6 × 3 × 4.8. */
  units?: "meters";
  windows: RoomWindow[];
}
export interface RoomDefinition {
  version: 1;
  id: string;
  seed: number;
  /** Width, height, depth of the rectangular shell. Model units are metres. */
  dimensions: Vec3;
  /** Omitted for legacy rooms, preserving their original shell geometry. */
  architecture?: RoomArchitecture;
  materials: Record<MaterialId, MaterialSpec>;
  nodes: RoomNode[];
  lighting: {
    background: string; exposure: number; environment: number;
    sky: string; ground: string; ambient: number;
    sun: { color: string; intensity: number; position: Vec3; target: Vec3 };
  };
  camera: { fov: number; target: Vec3; direction: Vec3; minDistance: number; maxDistance: number; fitWidth: number; defaultDistance: number; maxFitDistance: number };
}
