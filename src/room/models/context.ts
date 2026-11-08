import * as THREE from "three";
import type { PhotoFrameContent } from "@/world/types";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { materialIds, type MaterialId, type RoomDefinition } from "../types";

export interface ModelBehavior {
  ready?: Promise<void>;
  setAudioPlaying?: (playing: boolean) => void;
  toggleLamp?: () => boolean;
  setPhoto?: (content: PhotoFrameContent) => void;
  dispose?: () => void;
}

/** Own every GPU resource for one room, including shared materials and textures. */
export function createModelContext(definition: RoomDefinition, onChange: () => void) {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();

  let seed = definition.seed;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
  function texture(kind: "wood" | "cloth", color: string) {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < (kind === "wood" ? 420 : 7000); i++) {
      ctx.strokeStyle = random() > .5 ? "rgba(63,44,24,.08)" : "rgba(255,250,228,.14)";
      const x = random() * 256, y = random() * 256;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (kind === "wood" ? 2 : 1), y + (kind === "wood" ? random() * 110 : 1)); ctx.stroke();
    }
    if (kind === "cloth") {
      ctx.strokeStyle = "rgba(255,255,245,.09)";
      for (let i = 0; i < 256; i += 2) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); }
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    textures.add(map); return map;
  }
  function material(color: string, roughness = .8, map?: THREE.Texture) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, ...(map ? { map } : {}) });
    materials.add(mat); return mat;
  }
  const palette = Object.fromEntries(materialIds.map(id => {
    const spec = definition.materials[id];
    return [id, material(spec.color, spec.roughness, spec.texture ? texture(spec.texture.kind, spec.texture.color) : undefined)];
  })) as Record<MaterialId, THREE.MeshStandardMaterial>;
  const overrides = new Map<string, THREE.MeshStandardMaterial>();
  function paletteFor(colors: Partial<Record<MaterialId, string>>) {
    const result = { ...palette };
    for (const id of materialIds) {
      const color = colors[id];
      if (!color) continue;
      const key = `${id}:${color}`, spec = definition.materials[id];
      if (!overrides.has(key)) overrides.set(key, material(spec.texture ? "#ffffff" : color, spec.roughness, spec.texture ? texture(spec.texture.kind, color) : undefined));
      result[id] = overrides.get(key)!;
    }
    return result;
  }

  function mesh(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x: number, y: number, z: number) {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat);
    object.position.set(x, y, z); object.castShadow = object.receiveShadow = true;
    parent.add(object); return object;
  }
  function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, bevel = .012) {
    return mesh(bevel > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(bevel, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
  }
  function cylinder(parent: THREE.Object3D, top: number, bottom: number, h: number, mat: THREE.Material, x: number, y: number, z: number) {
    return mesh(new THREE.CylinderGeometry(top, bottom, h, 24), mat, parent, x, y, z);
  }
  function ellipsoid(parent: THREE.Object3D, radius: number, scale: [number, number, number], mat: THREE.Material, x: number, y: number, z: number) {
    const object = mesh(new THREE.SphereGeometry(radius, 24, 16), mat, parent, x, y, z);
    object.scale.set(...scale); return object;
  }
  function tube(parent: THREE.Object3D, points: THREE.Vector3[], radius: number, mat: THREE.Material) {
    return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 24, radius, 8, false), mat, parent, 0, 0, 0);
  }
  return {
    ...palette, random, material, mesh, box, cylinder, ellipsoid, tube, paletteFor,
    materials, textures, geometries, onChange,
    dispose() {
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    },
  };
}
export type ModelContext = ReturnType<typeof createModelContext>;
