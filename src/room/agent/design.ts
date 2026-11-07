import { defaultRoom, validateRoomDefinition } from "../definition";
import { materialIds, type MaterialId, type RoomArchitecture, type RoomDefinition, type RoomNode } from "../types";
import { furnitureCatalog, furnitureIds, type FurnitureId } from "../furnitureCatalog";
import { parseArchitecture } from "../architecture";
import { withWallPhoto } from "../wallPhoto";

export const movableIds = ["sofa", "table", "cabinet", "floor-plant", "rug"] as const;
export type MovableId = typeof movableIds[number];
export interface RoomDesign {
  summary: string;
  limitations: string[];
  palette: Record<MaterialId, string>;
  architecture?: RoomArchitecture;
  furniture: { id: FurnitureId; x: number; z: number; rotation: number }[];
  lighting: { sunColor: string; intensity: number; ambient: number; exposure: number };
}
export interface RoomAgentResult {
  design: RoomDesign;
  definition: RoomDefinition;
  run: { id: string; model: string; attempts: number; durationMs: number; totalTokens: number };
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

/** Pick only supported data; model output can never supply code, assets or model factories. */
export function parseRoomDesign(input: unknown): RoomDesign {
  const data = object(input), palette = object(data.palette), light = object(data.lighting);
  if (!Array.isArray(data.limitations) || data.limitations.length > 5) throw new Error("invalid limitations");
  if (!Array.isArray(data.furniture) || data.furniture.length < 1 || data.furniture.length > furnitureIds.length) throw new Error("expected 1..11 furniture placements");
  const seen = new Set<string>();
  const furniture = data.furniture.map(value => {
    const item = object(value);
    if (!furnitureIds.includes(item.id as FurnitureId) || seen.has(item.id as string)) throw new Error("unknown or duplicate furniture id");
    seen.add(item.id as string);
    return { id: item.id as FurnitureId, x: numeric(item.x, -3, 3), z: numeric(item.z, -2.4, 2.4), rotation: numeric(item.rotation, -Math.PI, Math.PI) };
  });
  if (!["desk", "table", "cabinet"].some(id => seen.has(id))) throw new Error("include a desk, table or cabinet to support the CD player, letter and photo frame");
  const design: RoomDesign = {
    summary: text(data.summary, 240), limitations: data.limitations.map(v => text(v, 160)),
    palette: Object.fromEntries(materialIds.map(id => [id, color(palette[id])])) as RoomDesign["palette"],
    furniture,
    ...(data.architecture === undefined ? {} : { architecture: parseArchitecture(data.architecture) }),
    lighting: { sunColor: color(light.sunColor), intensity: numeric(light.intensity, .5, 5), ambient: numeric(light.ambient, .5, 3), exposure: numeric(light.exposure, .7, 1.5) },
  };
  validatePlacements(design);
  return design;
}

function validatePlacements(design: RoomDesign) {
  const boxes = design.furniture.map(item => {
    const { width, depth } = furnitureCatalog[item.id], c = Math.cos(item.rotation), s = Math.sin(item.rotation);
    // The established rug geometry is offset from its node's origin.
    const x = item.x + (item.id === "rug" ? -.6 * c + .48 * s : 0);
    const z = item.z + (item.id === "rug" ? .6 * s + .48 * c : 0);
    const halfX = (Math.abs(c) * width + Math.abs(s) * depth) / 2;
    const halfZ = (Math.abs(s) * width + Math.abs(c) * depth) / 2;
    if (Math.abs(x) + halfX > 2.95 || Math.abs(z) + halfZ > 2.35) throw new Error(`${item.id} crosses a wall; move it inside x ±2.95, z ±2.35 including its footprint`);
    return { ...item, x, z, halfX, halfZ };
  });
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.id === "rug" || b.id === "rug") continue;
    if (Math.abs(a.x - b.x) < a.halfX + b.halfX + .04 && Math.abs(a.z - b.z) < a.halfZ + b.halfZ + .04) {
      throw new Error(`${a.id} overlaps ${b.id}; separate their bounding rectangles by at least 0.04m`);
    }
  }
}

/** Compile a small design contract to the existing serializable rendering contract. */
export function roomFromDesign(input: unknown): { design: RoomDesign; definition: RoomDefinition } {
  const design = parseRoomDesign(input);
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
      const spec = furnitureCatalog[placement.id];
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
