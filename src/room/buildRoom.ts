import * as THREE from "three";
import type { PhotoFrameContent } from "@/world/types";
import { defaultRoom, validateRoomDefinition } from "./definition";
import type { ModelId, RoomDefinition, RoomObjectId } from "./types";
import { createModelContext, type ModelContext, type ModelBehavior } from "./models/context";
import { shell, rug, plannedShell } from "./models/architecture";
import { sofa, table, cabinet, plant, clock, slippers } from "./models/furniture";
import { cd, envelope, frame, lamp } from "./models/giftObjects";
import { pet } from "./models/pet";
import { bed, desk, chair, nightstand, bookshelf, wardrobe } from "./models/bedroom";
import { withWallPhoto } from "./wallPhoto";

export type { RoomObjectId } from "./types";
const models: Record<ModelId, (root: THREE.Group, context: ModelContext) => ModelBehavior> = {
  shell, rug, sofa, table, cabinet, plant, clock, slippers, cd, envelope, frame, lamp, pet,
  bed, desk, chair, nightstand, bookshelf, wardrobe,
};

/** Assemble a validated plan; model factories never decide furniture placement. */
export function buildRoom(onChange: () => void, definition: RoomDefinition = defaultRoom) {
  validateRoomDefinition(definition);
  // Adapt legacy table frames without rewriting the user's saved room or contents.
  definition = withWallPhoto(definition);
  validateRoomDefinition(definition);
  const room = new THREE.Group();
  const context = createModelContext(definition, onChange);
  const nodes = new Map<string, THREE.Group>();
  const targets = new Map<RoomObjectId, THREE.Group>();
  const behaviors = new Map<RoomObjectId, ModelBehavior>();
  const owned: ModelBehavior[] = [];
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    owned.forEach(model => model.dispose?.()); context.dispose();
  }
  try {
    // Allocate all roots first so a plan may reference parents in any order.
    for (const node of definition.nodes) nodes.set(node.id, new THREE.Group());
    for (const node of definition.nodes) {
      const root = nodes.get(node.id)!; root.name = node.id;
      root.position.set(...node.position);
      if (node.rotation) root.rotation.set(...node.rotation);
      if (node.scale) root.scale.set(...node.scale);
      (node.parent ? nodes.get(node.parent)! : room).add(root);
      const behavior = node.model === "shell" && definition.architecture
        ? plannedShell(root, context, definition.architecture)
        : node.model === "frame" ? frame(root, context, Boolean(node.wall)) : models[node.model](root, context);
      owned.push(behavior);
      if (node.model === "shell") root.scale.multiply(new THREE.Vector3(definition.dimensions[0] / 6, definition.dimensions[1] / 3, definition.dimensions[2] / 4.8));
      if (node.interaction) { targets.set(node.interaction, root); behaviors.set(node.interaction, behavior); }
    }
  } catch (error) { dispose(); throw error; }
  return {
    room, targets,
    setPhoto: (content: PhotoFrameContent) => behaviors.get("sunset-frame")?.setPhoto?.(content),
    setAudioPlaying: (playing: boolean) => behaviors.get("cd-player")?.setAudioPlaying?.(playing),
    toggleLamp: () => behaviors.get("lamp")?.toggleLamp?.() ?? false,
    dispose,
  };
}
