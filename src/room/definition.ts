import data from "./default-room.json";
import { materialIds, modelIds, type RoomDefinition, type RoomObjectId } from "./types";

const fail = (detail: string): never => { throw new Error(`Invalid room definition: ${detail}`); };
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail("expected object");
const number = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max || fail("number out of range");
const name = (v: unknown) => typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v) || fail("invalid id");
const color = (v: unknown) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) || fail("invalid color");
function vector(v: unknown, min = -100, max = 100) {
  if (!Array.isArray(v) || v.length !== 3) fail("expected three coordinates");
  (v as unknown[]).forEach(n => number(n, min, max));
}

/** Validate external JSON before allocating textures, geometry or a WebGL context. */
export function validateRoomDefinition(input: unknown): asserts input is RoomDefinition {
  const plan = record(input);
  if (plan.version !== 1) fail("unsupported version");
  name(plan.id); number(plan.seed, -2147483648, 2147483647);
  if (!Number.isInteger(plan.seed)) fail("seed must be an integer");
  vector(plan.dimensions, .5, 30);
  const materials = record(plan.materials);
  for (const id of materialIds) {
    const m = record(materials[id]); color(m.color); number(m.roughness, 0, 1);
    if (m.texture !== undefined) {
      const t = record(m.texture); color(t.color);
      if (t.kind !== "wood" && t.kind !== "cloth") fail("unknown texture");
    }
  }
  if (!Array.isArray(plan.nodes) || plan.nodes.length < 1 || plan.nodes.length > 100) fail("invalid node count");
  const nodes = new Map<string, Record<string, unknown>>();
  const interactions = new Set<string>();
  const bindings: Record<RoomObjectId, string> = { "cd-player": "cd", "sealed-letter": "envelope", "sunset-frame": "frame", lamp: "lamp" };
  for (const value of plan.nodes as unknown[]) {
    const node = record(value); name(node.id);
    if (nodes.has(node.id as string)) fail("duplicate node id");
    if (!(modelIds as readonly unknown[]).includes(node.model)) fail("unknown model");
    vector(node.position);
    if (node.rotation !== undefined) vector(node.rotation, -Math.PI * 2, Math.PI * 2);
    if (node.scale !== undefined) vector(node.scale, .01, 20);
    if (node.parent !== undefined) name(node.parent);
    if (node.surface !== undefined) name(node.surface);
    if (node.surfaces !== undefined) {
      if (!Array.isArray(node.surfaces)) fail("invalid support surfaces");
      const surfaces = node.surfaces as unknown[];
      const ids = new Set<string>();
      for (const value of surfaces) {
        const surface = record(value); name(surface.id); vector(surface.position);
        if (!Array.isArray(surface.size) || surface.size.length !== 2) fail("invalid surface size");
        (surface.size as unknown[]).forEach(n => number(n, .01, 30));
        // Current model library exposes the top surface of these two pieces only.
        if (!["table", "cabinet"].includes(node.model as string) || surface.id !== "top" || ids.has(surface.id)) fail("unknown support surface");
        ids.add(surface.id as string);
      }
    }
    if (node.interaction !== undefined) {
      if (!Object.hasOwn(bindings, node.interaction as string) || bindings[node.interaction as RoomObjectId] !== node.model || interactions.has(node.interaction as string)) fail("invalid interaction binding");
      interactions.add(node.interaction as string);
    }
    nodes.set(node.id as string, node);
  }
  for (const [id, node] of nodes) {
    const visited = new Set([id]); let parent = node.parent;
    while (parent !== undefined) {
      if (visited.has(parent as string)) fail("cyclic parents");
      visited.add(parent as string);
      const ancestor = nodes.get(parent as string);
      if (!ancestor) fail("missing parent");
      parent = ancestor!.parent;
    }
    if (node.surface !== undefined) {
      const surfaces = nodes.get(node.parent as string)?.surfaces as { id: string; position: number[]; size: number[] }[] | undefined;
      const surface = surfaces?.find(s => s.id === node.surface);
      if (!surface) fail("missing support surface");
      const position = node.position as number[];
      if (Math.abs(position[0] - surface!.position[0]) > surface!.size[0] / 2 || Math.abs(position[2] - surface!.position[2]) > surface!.size[1] / 2) fail("object origin outside support");
    }
    if (["cd", "envelope", "frame"].includes(node.model as string) && node.surface === undefined) fail("gift object requires a support surface");
  }
  if ([...nodes.values()].filter(n => n.model === "shell").length !== 1) fail("expected one shell");
  for (const id of ["cd-player", "sealed-letter", "sunset-frame"]) if (!interactions.has(id)) fail(`missing ${id}`);
  const light = record(plan.lighting); color(light.background); color(light.sky); color(light.ground);
  number(light.exposure, .01, 10); number(light.environment, 0, 10); number(light.ambient, 0, 20);
  const sun = record(light.sun); color(sun.color); number(sun.intensity, 0, 20); vector(sun.position); vector(sun.target);
  const camera = record(plan.camera); number(camera.fov, 10, 100); vector(camera.target); vector(camera.direction);
  if ((camera.direction as number[]).every(n => n === 0)) fail("zero camera direction");
  for (const key of ["minDistance", "maxDistance", "fitWidth", "defaultDistance", "maxFitDistance"]) number(camera[key], .1, 100);
  if (!(Number(camera.minDistance) <= Number(camera.defaultDistance) && Number(camera.defaultDistance) <= Number(camera.maxFitDistance) && Number(camera.maxFitDistance) <= Number(camera.maxDistance))) fail("invalid camera distances");
}

validateRoomDefinition(data);
export const defaultRoom: RoomDefinition = data;
