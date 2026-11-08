import { validateRoomDefinition } from "../definition";
import { parseArchitecture } from "../architecture";
import { parseGeneratedAsset } from "../generated";
import { materialIds, type RoomDefinition } from "../types";
import { roomFromDesign, type RoomDesign } from "./design";

export const MAX_CURRENT_ROOM_BYTES = 200_000;

/** Photos, letters, music and binary pet models are never part of room design context. */
export function roomForGeneration(definition: RoomDefinition, design?: RoomDesign): RoomDefinition & { agentDesign?: RoomDesign } {
  const room: RoomDefinition & { agentDesign?: RoomDesign } = structuredClone(definition);
  room.nodes = room.nodes.filter(node => node.model !== "pet");
  if (design) room.agentDesign = structuredClone(design);
  return room;
}

/** Rebuild an explicit allowlist before any client-provided context reaches the model. */
export function roomGenerationContext(input: unknown) {
  const serialized = JSON.stringify(input);
  if (!serialized || new TextEncoder().encode(serialized).length > MAX_CURRENT_ROOM_BYTES) throw new Error("current room is too large");
  validateRoomDefinition(input);
  const source = (input as RoomDefinition & { agentDesign?: unknown }).agentDesign;
  if (source !== undefined) {
    try {
      const current = roomFromDesign(source);
      const visible = (room: RoomDefinition) => ({
        dimensions: room.dimensions, architecture: room.architecture,
        palette: materialIds.map(id => room.materials[id].texture?.color ?? room.materials[id].color),
        lighting: [room.lighting.sun.color, room.lighting.sun.intensity, room.lighting.ambient, room.lighting.exposure],
        furniture: room.nodes.filter(n => !n.interaction && n.model !== "shell" && n.model !== "pet").map(n => ({ id: n.id, model: n.model, position: n.position, rotation: n.rotation, size: n.size, scale: n.scale, colors: n.colors, geometry: n.geometry, parent: n.parent, surface: n.surface, mount: n.mount })),
      });
      if (JSON.stringify(visible(current.definition)) === JSON.stringify(visible(input))) return { design: current.design };
    } catch { /* Old or stale metadata falls back to the actual visible scene below. */ }
  }
  return {
    dimensions: [...input.dimensions],
    ...(input.architecture ? { architecture: parseArchitecture(input.architecture, input.dimensions) } : {}),
    palette: Object.fromEntries(materialIds.map(id => [id, input.materials[id].texture?.color ?? input.materials[id].color])),
    furniture: input.nodes.filter(node => !node.interaction && node.model !== "pet" && node.model !== "shell").map(node => ({
      id: node.id, model: node.model, position: [...node.position],
      ...(node.rotation ? { rotation: [...node.rotation] } : {}),
      ...(node.size ? { size: [...node.size] } : {}),
      ...(node.scale ? { scale: [...node.scale] } : {}),
      ...(node.parent ? { parent: node.parent, surface: node.surface } : {}),
      ...(node.mount ? { mount: { wall: node.mount.wall, offset: node.mount.offset, bottom: node.mount.bottom } } : {}),
      ...(node.colors ? { colors: Object.fromEntries(Object.entries(node.colors).filter(([key]) => materialIds.includes(key as typeof materialIds[number]))) } : {}),
      ...(node.geometry ? { geometry: parseGeneratedAsset(node.geometry, false) } : {}),
    })),
    lighting: { sunColor: input.lighting.sun.color, intensity: input.lighting.sun.intensity, ambient: input.lighting.ambient, exposure: input.lighting.exposure },
  };
}
