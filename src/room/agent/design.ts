import { defaultRoom, validateRoomDefinition } from "../definition";
import { materialIds, type GeneratedAsset, type MaterialId, type RoomArchitecture, type RoomDefinition, type RoomNode, type Vec3, type WallMount } from "../types";
import { furnitureCatalog, furnitureIds, furnitureMaterials, furnitureSize, validateFurnitureSize, type FurnitureId } from "../furnitureCatalog";
import { parseArchitecture } from "../architecture";
import { withWallPhoto } from "../wallPhoto";
import { boxesIntersect } from "../spatial";
import { compileModernDesign } from "./compile";
import { MAX_GENERATED_PARTS, parseGeneratedAsset } from "../generated";

export interface DesignFurniture {
  id: string; type?: FurnitureId | "custom"; asset?: string;
  size?: Vec3; colors?: Partial<Record<MaterialId, string>>;
  x: number; z: number; rotation: number;
  /** x/z are local to this support. The compiler derives y from its real top. */
  parent?: string; surface?: string;
  mount?: WallMount;
}

export const movableIds = ["sofa", "table", "cabinet", "floor-plant", "rug"] as const;
export type MovableId = typeof movableIds[number];
export interface RoomDesign {
  version?: 2;
  dimensions?: Vec3;
  summary: string;
  limitations: string[];
  palette: Record<MaterialId, string>;
  architecture?: RoomArchitecture;
  assets?: Record<string, GeneratedAsset>;
  furniture: DesignFurniture[];
  lighting: { sunColor: string; intensity: number; ambient: number; exposure: number };
}
export interface RoomAgentResult {
  design: RoomDesign;
  definition: RoomDefinition;
  run: { id: string; model: string; attempts: number; durationMs: number; totalTokens: number; input?: "text" | "image"; referenceDescription?: string; positionCorrections?: number };
}

const object = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("expected object");
  return v as Record<string, unknown>;
};
const numeric = (v: unknown, min: number, max: number): number => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw new Error(`number must be ${min}..${max}`);
  return v;
};
const text = (v: unknown, max: number): string => {
  if (typeof v !== "string" || !v.trim() || v.length > max) throw new Error("invalid description");
  return v.trim();
};
const color = (v: unknown): string => {
  if (typeof v !== "string" || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error("expected #rrggbb color");
  return v;
};

/** Pick supported data only; generated assets are geometry recipes, never executable code. */
export function parseRoomDesign(input: unknown): RoomDesign {
  const data = object(input), palette = object(data.palette), light = object(data.lighting);
  if (data.version !== undefined && data.version !== 2) throw new Error("unsupported design version");
  const modern = data.version === 2;
  let dimensions: Vec3 = [6, 3, 4.8];
  if (modern && data.dimensions !== undefined) {
    if (!Array.isArray(data.dimensions) || data.dimensions.length !== 3) throw new Error("dimensions must be [width,height,depth]");
    dimensions = [numeric(data.dimensions[0], 3, 12), numeric(data.dimensions[1], 2.4, 5), numeric(data.dimensions[2], 3, 12)];
  }
  if (!Array.isArray(data.limitations) || data.limitations.length > 5) throw new Error("invalid limitations");
  if (!Array.isArray(data.furniture) || data.furniture.length < 1 || data.furniture.length > (modern ? 32 : furnitureIds.length)) throw new Error("invalid furniture count");
  const assets: Record<string, GeneratedAsset> = Object.create(null);
  if (data.assets !== undefined) {
    if (!modern) throw new Error("generated assets require version:2");
    const entries = Object.entries(object(data.assets));
    if (entries.length > 24) throw new Error("at most 24 generated asset definitions");
    for (const [id, value] of entries) {
      if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error("invalid generated asset id");
      try { assets[id] = parseGeneratedAsset(value); }
      catch (error) { throw new Error(`asset ${id}: ${error instanceof Error ? error.message : "invalid generated geometry"}`); }
    }
  }
  const seen = new Set<string>();
  const furniture = data.furniture.map((value): DesignFurniture => {
    const item = object(value);
    const type = (modern ? item.type : item.id) as FurnitureId | "custom";
    if (!(modern && type === "custom") && !furnitureIds.includes(type as FurnitureId) || typeof item.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(item.id) || ["shell", "cd", "envelope", "frame", "lamp"].includes(item.id) || seen.has(item.id)) throw new Error("unknown type or duplicate/reserved furniture id");
    seen.add(item.id as string);
    const placement = { id: item.id, x: numeric(item.x, -dimensions[0] / 2, dimensions[0] / 2), z: numeric(item.z, -dimensions[2] / 2, dimensions[2] / 2), rotation: numeric(item.rotation, -Math.PI, Math.PI) };
    let support: Pick<DesignFurniture, "parent" | "surface"> = {};
    if (modern && (item.parent !== undefined || item.surface !== undefined)) {
      for (const id of [item.parent, item.surface]) if (typeof id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error("parent and surface must both name real furniture/supports");
      support = { parent: item.parent as string, surface: item.surface as string };
    }
    if (modern && type === "custom") {
      if (typeof item.asset !== "string" || !Object.hasOwn(assets, item.asset)) throw new Error(`${item.id} needs a defined generated asset`);
      if (item.size !== undefined || item.colors !== undefined || item.y !== undefined) throw new Error("custom asset uses part sizes/colors; elevation is derived from parent/surface, not y");
      let mount: WallMount | undefined;
      if (item.mount !== undefined) {
        const m = object(item.mount);
        if (m.wall !== "left" && m.wall !== "back" || item.parent !== undefined) throw new Error("custom wall mount requires left/back wall without a furniture parent");
        mount = { wall: m.wall, offset: numeric(m.offset, -6, 6), bottom: numeric(m.bottom, 0, 5) };
      }
      return { ...placement, type, asset: item.asset, ...support, ...(mount ? { mount } : {}) };
    }
    if (item.mount !== undefined) throw new Error("mount requires a custom asset");
    const colors: Partial<Record<MaterialId, string>> = {};
    if (modern && item.colors !== undefined) for (const [id, value] of Object.entries(object(item.colors))) {
      if (!(materialIds as readonly string[]).includes(id)) throw new Error("unknown furniture material");
      if (!furnitureMaterials[type as FurnitureId].includes(id as MaterialId)) throw new Error(`${item.id} (${type}) does not use ${id}; its visible materials are ${furnitureMaterials[type as FurnitureId].join(",")}`);
      colors[id as MaterialId] = color(value);
    }
    if (modern && item.y !== undefined) throw new Error("elevation is derived from parent/surface, not y");
    return { ...placement, ...(modern ? { type, size: item.size === undefined ? furnitureSize(type as FurnitureId) : validateFurnitureSize(type as FurnitureId, item.size), ...(item.colors === undefined ? {} : { colors }), ...support } : {}) };
  });
  if (furniture.reduce((count, n) => count + (n.type === "custom" ? assets[n.asset!].parts.length : 0), 0) > MAX_GENERATED_PARTS) throw new Error("generated room exceeds 384 instantiated parts; simplify detail, preserve major structure");
  if (!furniture.some(n => ["desk", "table", "cabinet", ...(modern ? ["dining-table", "nightstand"] : [])].includes(n.type ?? n.id) || n.type === "custom" && assets[n.asset!].supports?.length)) throw new Error("include real supporting furniture/surfaces for the CD player, letter and lamp");
  const design: RoomDesign = {
    ...(modern ? { version: 2 as const, dimensions } : {}),
    summary: text(data.summary, 240), limitations: data.limitations.map(v => text(v, 160)),
    palette: Object.fromEntries(materialIds.map(id => [id, color(palette[id])])) as RoomDesign["palette"],
    furniture,
    ...(Object.keys(assets).length ? { assets } : {}),
    ...(modern ? { architecture: parseArchitecture({ ...object(data.architecture ?? { windows: [] }), units: "meters" }, dimensions) } : data.architecture === undefined ? {} : { architecture: parseArchitecture(data.architecture) }),
    lighting: { sunColor: color(light.sunColor), intensity: numeric(light.intensity, .5, 5), ambient: numeric(light.ambient, .5, 3), exposure: numeric(light.exposure, .7, 1.5) },
  };
  validatePlacements(design);
  return design;
}

function validatePlacements(design: RoomDesign) {
  const dimensions = design.dimensions ?? [6, 3, 4.8];
  const boxes = design.furniture.map(item => {
    if (item.type === "custom" || item.parent) return undefined; // Piecewise 3D/support validation runs after compilation.
    const type = item.type ?? item.id as FurnitureId;
    const width = item.size?.[0] ?? furnitureCatalog[type].width, depth = item.size?.[2] ?? furnitureCatalog[type].depth, c = Math.cos(item.rotation), s = Math.sin(item.rotation);
    // The established rug geometry is offset from its node's origin.
    const x = item.x + (type === "rug" && !item.size ? -.6 * c + .48 * s : 0);
    const z = item.z + (type === "rug" && !item.size ? .6 * s + .48 * c : 0);
    const halfX = (Math.abs(c) * width + Math.abs(s) * depth) / 2;
    const halfZ = (Math.abs(s) * width + Math.abs(c) * depth) / 2;
    if (Math.abs(x) + halfX > dimensions[0] / 2 - .05 || Math.abs(z) + halfZ > dimensions[2] / 2 - .05) throw new Error(`${item.id} crosses a wall; include its rotated footprint within the room`);
    const points: Vec3[] = [];
    for (const dx of [-width / 2, width / 2]) for (const y of [0, item.size?.[1] ?? 1]) for (const dz of [-depth / 2, depth / 2]) points.push([x + dx * c + dz * s, y, z - dx * s + dz * c]);
    return { ...item, type, x, z, halfX, halfZ, points };
  });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (!a || !b) continue;
    if (a.type === "rug" || b.type === "rug") continue;
    if (design.version === 2 ? boxesIntersect(a.points, b.points, -.04) : Math.abs(a.x - b.x) < a.halfX + b.halfX + .04 && Math.abs(a.z - b.z) < a.halfZ + b.halfZ + .04) {
      throw new Error(`${a.id} overlaps ${b.id}; separate their bounding rectangles by at least 0.04m`);
    }
  }
}

/** Compile a small design contract to the existing serializable rendering contract. */
export function roomFromDesign(input: unknown): { design: RoomDesign; definition: RoomDefinition } {
  const design = parseRoomDesign(input);
  if (design.version === 2) return compileModernDesign(design);
  let definition = structuredClone(defaultRoom);
  definition.id = "mimo-room-v2";
  if (design.architecture) definition.architecture = design.architecture;
  const selected = new Set(design.furniture.map(item => item.id));
  definition.nodes = definition.nodes.filter(node => {
    if (furnitureIds.includes(node.id as FurnitureId) && !selected.has(node.id as FurnitureId)) return false;
    // These decorations are tied to the legacy wall opening and must not float over new windows.
    if (design.architecture && ["window-plant", "clock"].includes(node.id)) return false;
    return true;
  });
  for (const id of materialIds) {
    const material = definition.materials[id];
    // Textures supply the visible base colour; avoid tinting it twice.
    if (material.texture) { material.color = "#ffffff"; material.texture.color = design.palette[id]; }
    else material.color = design.palette[id];
  }
  for (const placement of design.furniture) {
    let node = definition.nodes.find(node => node.id === placement.id);
    if (!node) {
      const spec = furnitureCatalog[placement.id as FurnitureId];
      node = { id: placement.id, model: spec.model, position: [0, 0, 0] };
      if ("top" in spec) node.surfaces = [{ id: "top", position: [0, spec.top, 0], size: [...spec.surface] }];
      definition.nodes.push(node);
    }
    node.position = [placement.x, node.position[1], placement.z];
    node.rotation = [0, placement.rotation, 0];
  }
  placeKeepsakes(definition);
  definition = withWallPhoto(definition, true);
  definition.lighting.sun.color = design.lighting.sunColor;
  definition.lighting.sun.intensity = design.lighting.intensity;
  definition.lighting.ambient = design.lighting.ambient;
  definition.lighting.exposure = design.lighting.exposure;
  validateRoomDefinition(definition);
  return { design, definition };
}

function placeKeepsakes(definition: RoomDefinition) {
  const find = (id: string) => definition.nodes.find(node => node.id === id);
  const supports = [find("table"), find("desk"), find("cabinet")].filter((n): n is RoomNode => Boolean(n));
  const audioSupport = supports[0], memorySupport = find("cabinet") ?? supports.find(n => n !== audioSupport) ?? audioSupport;
  const move = (id: string, support: RoomNode, x: number, y: number, z: number, scale = 1) => {
    const node = find(id)!;
    if (node.parent === support.id && scale === 1) return;
    node.parent = support.id; node.surface = "top";
    node.position = [x, support.surfaces![0].position[1] + y, z];
    if (scale !== 1) node.scale = [scale, scale, scale];
  };
  if (audioSupport === memorySupport) {
    move("cd", audioSupport, .12, .006, .08, .85);
    move("envelope", audioSupport, -.53, .008, .20, .9);
    move("lamp", audioSupport, .64, .006, -.12, .65);
  } else {
    move("cd", audioSupport, .38, .0055, -.18);
    move("envelope", audioSupport, .1, .0095, .18);
    move("lamp", memorySupport, .6, .0075, 0);
  }
}

export function defaultRoomDesign(): RoomDesign {
  return {
    summary: "暖白与绿色的日常起居室。", limitations: [],
    palette: Object.fromEntries(materialIds.map(id => [id, defaultRoom.materials[id].texture?.color ?? defaultRoom.materials[id].color])) as RoomDesign["palette"],
    furniture: movableIds.map(id => { const node = defaultRoom.nodes.find(n => n.id === id)!; return { id, x: node.position[0], z: node.position[2], rotation: node.rotation?.[1] ?? 0 }; }),
    lighting: { sunColor: defaultRoom.lighting.sun.color, intensity: defaultRoom.lighting.sun.intensity, ambient: defaultRoom.lighting.ambient, exposure: defaultRoom.lighting.exposure },
  };
}

/** A validated example, also available to the model when a bedroom is requested. */
export function bedroomRoomDesign(): RoomDesign {
  const design = defaultRoomDesign();
  return {
    ...design, summary: "双窗卧室，床靠左侧，书桌与椅子位于后墙，CD 机和信件放书桌上，相框挂墙。",
    architecture: { windows: [
      { wall: "left", offset: -.5, width: 1.5, bottom: 1.1, height: 1.45 },
      { wall: "back", offset: 1.25, width: 1.5, bottom: 1.1, height: 1.45 },
    ] },
    furniture: [
      { id: "bed", x: -1.7, z: -.9, rotation: 0 },
      { id: "nightstand", x: -.35, z: -1.3, rotation: 0 },
      { id: "desk", x: 1.3, z: -1.75, rotation: 0 },
      { id: "chair", x: 1.3, z: -.55, rotation: 0 },
    ],
  };
}
