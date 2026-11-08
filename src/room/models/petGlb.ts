import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { decodePetGlb, validatePetAsset, type PetAsset } from "../petAsset";
import type { ModelBehavior, ModelContext } from "./context";
import type { Vec3 } from "../types";
import { resolvePetGlb } from "../../lib/storage/petAssetStore";

export function disposePetModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
    if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
}

/** Measure the rendered pose, not accessor metadata; GLB coordinates are Y-up by default. */
export async function loadNormalizedPet(glb: string, targetLength: number, upAxis: PetAsset["upAxis"]) {
  const bytes = decodePetGlb(glb);
  const loaded = await new GLTFLoader().parseAsync(bytes.buffer, "");
  const root = new THREE.Group(); root.add(loaded.scene);
  // Dispose unused exported scenes as well; only the default pose is shown.
  const unusedScenes = loaded.scenes.filter(s => s !== loaded.scene);
  try {
    root.rotation.x = upAxis === "z" ? -Math.PI / 2 : 0;
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root, true), size = bounds.getSize(new THREE.Vector3());
    if (bounds.isEmpty() || ![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) throw new Error("宠物模型无法测量。");
    const scale = targetLength / Math.max(size.x, size.z);
    root.scale.setScalar(scale); root.updateMatrixWorld(true);
    bounds.setFromObject(root, true);
    const center = bounds.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -bounds.min.y, -center.z);
    root.updateMatrixWorld(true);
    const measured = bounds.getSize(new THREE.Vector3()).toArray() as Vec3;
    root.traverse(object => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = object.receiveShadow = true;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture && value.image) {
            const image = value.image as { width?: number; height?: number };
            if ((image.width ?? 0) > 4096 || (image.height ?? 0) > 4096) throw new Error("宠物贴图超过 4096 像素，请压缩后重试。");
          }
        }
      }
    });
    unusedScenes.forEach(disposePetModel);
    return { root, size: measured };
  } catch (error) { disposePetModel(root); unusedScenes.forEach(disposePetModel); throw error; }
}

export async function measurePetAsset(input: Omit<PetAsset, "version" | "size">): Promise<PetAsset> {
  if (!Number.isFinite(input.targetLength) || input.targetLength < .25 || input.targetLength > 1.4 || !["y", "z"].includes(input.upAxis)) throw new Error("宠物占地长边需要在 0.25–1.4 米之间。");
  const glb = await resolvePetGlb(input as PetAsset);
  const model = await loadNormalizedPet(glb, input.targetLength, input.upAxis);
  try {
    const asset: PetAsset = { ...input, glb, version: 1, size: model.size };
    delete asset.assetId;
    validatePetAsset(asset); return asset;
  } finally { disposePetModel(model.root); }
}

export function petGlb(room: THREE.Group, ctx: ModelContext, asset: PetAsset): ModelBehavior {
  let disposed = false, owned: THREE.Group | undefined;
  const ready = resolvePetGlb(asset).then(glb => loadNormalizedPet(glb, asset.targetLength, asset.upAxis)).then(model => {
    if (disposed) { disposePetModel(model.root); return; }
    if (model.size.some((n, i) => Math.abs(n - asset.size[i]) > .001)) { disposePetModel(model.root); throw new Error("宠物模型的实测尺寸与保存方案不一致。"); }
    owned = model.root; room.add(owned); ctx.onChange();
  });
  return { ready, dispose() { disposed = true; if (owned) { room.remove(owned); disposePetModel(owned); owned = undefined; } } };
}
