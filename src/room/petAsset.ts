import type { Vec3 } from "./types";

// Exports embed GLBs; browser snapshots may reference a content-addressed IndexedDB model.
export const MAX_PET_GLB_BYTES = 2_500_000;
export interface PetAsset {
  version: 1;
  species: "cat" | "dog";
  glb: string;
  assetId?: string;
  /** Measured bounds after axis correction and uniform scaling, in metres. */
  size: Vec3;
  targetLength: number;
  upAxis: "y" | "z";
  template: string;
  source?: string;
  license?: string;
}

/** Only self-contained GLBs; loaders must never follow model-authored URLs. */
export function decodePetGlb(encoded: string): Uint8Array<ArrayBuffer> {
  if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_PET_GLB_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("宠物模型过大或格式无效，GLB 最多 2.5MB。");
  const binary = atob(encoded), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (btoa(binary) !== encoded || bytes.length > MAX_PET_GLB_BYTES || bytes.length < 28) throw new Error("宠物 GLB 无效。");
  const view = new DataView(bytes.buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.length) throw new Error("需要完整的 GLB 2.0 模型。");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength % 4 || jsonLength + 20 > bytes.length) throw new Error("GLB 数据块无效。");
  const data = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  if (!Array.isArray(data.scenes) || data.scenes.length !== 1) throw new Error("宠物 GLB 需要只包含一个场景。");
  if (data.asset?.version !== "2.0" || !Array.isArray(data.meshes) || !data.meshes.length || !Array.isArray(data.nodes) || data.nodes.length > 512) throw new Error("宠物模型没有可用几何或结构过大。");
  if ((data.buffers ?? []).some((b: { uri?: unknown }) => b.uri !== undefined) || (data.images ?? []).some((i: { uri?: unknown }) => i.uri !== undefined)) throw new Error("宠物模型必须内嵌网格和贴图，不能引用外部文件。");
  if (data.buffers?.length !== 1 || data.bufferViews?.some((v: { extensions?: unknown }) => v.extensions !== undefined)) throw new Error("请使用单一内嵌缓冲区的未压缩 GLB。");
  if (jsonLength + 28 > bytes.length || view.getUint32(jsonLength + 24, true) !== 0x004e4942 || view.getUint32(jsonLength + 20, true) + jsonLength + 28 !== bytes.length) throw new Error("宠物 GLB 二进制数据不完整。");
  if ((data.extensionsRequired ?? []).some((x: string) => !["KHR_materials_unlit", "KHR_materials_specular", "KHR_materials_ior", "KHR_materials_clearcoat", "KHR_materials_transmission", "KHR_materials_volume", "KHR_materials_emissive_strength", "KHR_texture_transform", "KHR_mesh_quantization"].includes(x))) throw new Error("请导出不依赖额外解码器的 GLB。");
  const vertices = (data.accessors ?? []).reduce((n: number, a: { count?: number }) => n + (a.count ?? 0), 0);
  if (!Number.isSafeInteger(vertices) || vertices > 2_000_000 || (data.images?.length ?? 0) > 16) throw new Error("宠物模型细节过多，请简化网格或贴图。");
  return bytes;
}

export function validatePetAsset(input: unknown): asserts input is PetAsset {
  const a = input as PetAsset;
  if (!a || a.version !== 1 || !["cat", "dog"].includes(a.species) || !["y", "z"].includes(a.upAxis) || typeof a.targetLength !== "number" || !Number.isFinite(a.targetLength) || a.targetLength < .25 || a.targetLength > 1.4) throw new Error("宠物尺寸或物种无效。");
  if (!Array.isArray(a.size) || a.size.length !== 3 || a.size.some(n => !Number.isFinite(n) || n < .01 || n > 2.5) || Math.abs(Math.max(a.size[0], a.size[2]) - a.targetLength) > .001) throw new Error("宠物实测尺寸与目标尺寸不一致。");
  for (const value of [a.template, a.source, a.license]) if (value !== undefined && (typeof value !== "string" || value.length > 1000)) throw new Error("宠物来源信息无效。");
  if (typeof a.template !== "string" || !a.template.trim()) throw new Error("宠物模板信息缺失。");
  if (typeof a.glb !== "string") throw new Error("宠物模型数据无效。");
  if (a.glb) decodePetGlb(a.glb);
  else if (typeof a.assetId !== "string" || !/^[a-f0-9]{64}$/.test(a.assetId)) throw new Error("宠物模型引用无效。");
}
