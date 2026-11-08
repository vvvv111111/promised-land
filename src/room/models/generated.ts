import * as THREE from "three";
import type { GeneratedAsset } from "../types";
import type { ModelContext, ModelBehavior } from "./context";

/** Interpret a bounded geometry recipe. No model-supplied JavaScript, URLs or loaders. */
export function generatedModel(root: THREE.Group, ctx: ModelContext, asset: GeneratedAsset): ModelBehavior {
  const mats = new Map<string, THREE.Material>();
  for (const [index, p] of asset.parts.entries()) {
    const key = `${p.material ?? "plain"}:${p.color}`;
    if (!mats.has(key)) mats.set(key, p.material ? ctx.paletteFor({ [p.material]: p.color })[p.material] : ctx.material(p.color, .65));
    const [w, h, d] = p.size;
    const geometry = p.shape === "box" ? new THREE.BoxGeometry(w, h, d)
      : p.shape === "ellipsoid" ? new THREE.SphereGeometry(.5, 16, 12)
      : new THREE.CylinderGeometry(p.shape === "cone" ? 0 : .5, .5, 1, 16);
    const mesh = ctx.mesh(geometry, mats.get(key)!, root, ...p.position);
    mesh.name = `generated-part-${index}`;
    if (p.shape !== "box") mesh.scale.set(w, h, d);
    if (p.rotation) mesh.rotation.set(...p.rotation);
  }
  return {};
}
