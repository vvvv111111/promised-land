import { parseRoomDesign } from "./design";

type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === "object" && !Array.isArray(value);

export function canPatchRoomDesign(value: unknown): value is RecordValue & { furniture: RecordValue[] } {
  // Missing assets/types/fields need schema recovery before local geometry repairs can work.
  if (!object(value) || value.version !== 2) return false;
  try { parseRoomDesign(value, false); return true; } catch { return false; }
}

const patchContract = `patch 可包含 furniture、assets、windows、palette、lighting，至少一项。仅填写需要修改的字段。
furniture 是数组，每项 id 必须已存在，可更新 x/z/rotation/size/colors/parent/surface/mount；parent/surface/mount 可设 null 清除。不能增加、删除、重命名家具或改变 type/asset，不能改变房间尺寸。
custom 实例不能写 size/colors/y；改变它的形状或颜色必须修改对应 assets 中的原部件。不要给 asset.parts 返回完整部件数组，只提供带 index 的局部变更。
assets 是已有 asset-id 到局部素材修正的字典，每项可含 parts:[{index,shape?,size?,position?,rotation?,color?,material?}] 和 supports。index 是原部件从0开始的下标；不能增删部件或素材。supports 若提供则是完整的真实承托面声明。
windows 是数组，每项 {index,offset?,width?,bottom?,height?}，index 是上一版窗户从0开始的下标；不改墙面、不增删窗户。
palette/lighting 是局部字段字典，未提供的值由程序原样保留。不要返回 reference、summary、limitations 或任何其他字段。
程序合并后会重新检查整个房间。优先修具体报错，不修改已正确的家具。示例：{"patch":{"furniture":[{"id":"desk-a","x":1.2}],"windows":[{"index":0,"offset":0.8}]}}。`;

export const roomRepairPrompt = `现在只修复上一版方案，覆盖初次生成时要求完整房间 JSON 的输出格式。只返回 {"patch":{...}}，不要重写完整房间。\n${patchContract}`;
export const roomEditPrompt = `当前房间提供了经过核对的 design。如果用户只修改已有物件位置、尺寸、配色、窗户或光照，覆盖完整输出要求，只返回 {"patch":{...}}，由程序保留其他所有内容。若明确新建房间、更换用途、增删家具/素材或修改房间尺寸，仍返回完整 version:2 JSON。\n${patchContract}`;

/** A bounded data patch, never JSON Pointer evaluation, executable code or arbitrary deep merge. */
export function applyRoomDesignPatch(base: unknown, response: unknown): RecordValue {
  if (!canPatchRoomDesign(base) || !object(response) || Object.keys(response).length !== 1 || !object(response.patch)) throw new Error("repair must return a patch object for the previous room");
  const patch = response.patch;
  const keys = Object.keys(patch);
  if (!keys.length || keys.some(key => !["furniture", "assets", "windows", "palette", "lighting"].includes(key))) throw new Error("unsupported room repair field");
  const next = structuredClone(base);
  if (patch.furniture !== undefined) {
    if (!Array.isArray(patch.furniture) || !patch.furniture.length || patch.furniture.length > 32) throw new Error("invalid furniture repair list");
    const seen = new Set();
    for (const change of patch.furniture) {
      if (!object(change) || typeof change.id !== "string" || seen.has(change.id) || Object.keys(change).some(key => !["id", "x", "z", "rotation", "size", "colors", "parent", "surface", "mount"].includes(key))) throw new Error("repair may only update existing furniture fields");
      seen.add(change.id);
      const item = next.furniture.find(item => item.id === change.id);
      if (!item) throw new Error("repair cannot add or remove furniture");
      for (const [key, value] of Object.entries(change)) {
        if (key === "id") continue;
        if (value === null && ["parent", "surface", "mount"].includes(key)) delete item[key];
        else if (key === "colors" && object(value)) item.colors = { ...(object(item.colors) ? item.colors : {}), ...value };
        else item[key] = structuredClone(value);
      }
    }
  }
  if (patch.assets !== undefined) {
    if (!object(patch.assets) || !object(next.assets)) throw new Error("invalid asset repair");
    for (const [id, value] of Object.entries(patch.assets)) {
      if (!Object.hasOwn(next.assets, id)) throw new Error("repair must preserve existing asset identities");
      const asset = next.assets[id];
      if (!object(value) || !object(asset) || !Array.isArray(asset.parts) || Object.keys(value).some(key => !["parts", "supports"].includes(key))) throw new Error("repair must update existing asset parts");
      if (value.parts !== undefined) {
        if (!Array.isArray(value.parts) || value.parts.length > 64) throw new Error("invalid part repair list");
        const seen = new Set();
        for (const change of value.parts) {
          if (!object(change) || !Number.isInteger(change.index) || seen.has(change.index) || Object.keys(change).some(key => !["index", "shape", "size", "position", "rotation", "color", "material"].includes(key))) throw new Error("invalid part repair fields");
          seen.add(change.index);
          const part = asset.parts[change.index as number];
          if (!object(part)) throw new Error("repair cannot add or remove geometry parts");
          for (const [key, entry] of Object.entries(change)) {
            if (key === "index") continue;
            if (entry === null && ["rotation", "material"].includes(key)) delete part[key];
            else part[key] = structuredClone(entry);
          }
        }
      }
      if (value.supports !== undefined) asset.supports = structuredClone(value.supports);
    }
  }
  if (patch.windows !== undefined) {
    if (!Array.isArray(patch.windows) || patch.windows.length > 8 || !object(next.architecture) || !Array.isArray(next.architecture.windows)) throw new Error("invalid window repair");
    const seen = new Set();
    for (const change of patch.windows) {
      if (!object(change) || !Number.isInteger(change.index) || seen.has(change.index) || Object.keys(change).some(key => !["index", "offset", "width", "bottom", "height"].includes(key))) throw new Error("invalid window repair fields");
      seen.add(change.index);
      const window = next.architecture.windows[change.index as number];
      if (!object(window)) throw new Error("repair cannot add or remove windows");
      for (const [key, value] of Object.entries(change)) if (key !== "index") window[key] = structuredClone(value);
    }
  }
  for (const key of ["palette", "lighting"] as const) if (patch[key] !== undefined) {
    if (!object(patch[key]) || !object(next[key]) || Object.keys(patch[key]).some(field => !Object.hasOwn(next[key] as object, field))) throw new Error(`invalid ${key} repair`);
    next[key] = { ...next[key] as RecordValue, ...patch[key] };
  }
  return next;
}
