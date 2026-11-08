export const petCoatRegions = ["head", "back", "leftFlank", "rightFlank", "chest", "belly", "leftFace", "rightFace", "muzzle", "leftEar", "rightEar", "frontLegs", "hindLegs", "paws", "tail", "tailTip", "blaze"] as const;
export type PetCoatRegion = typeof petCoatRegions[number];
export interface PetPhotoCoat {
  version: 1;
  base: string;
  regions: Partial<Record<PetCoatRegion, string>>;
  markings: { region: PetCoatRegion; kind: "patch" | "stripes" | "spots"; color: string; center: [number, number]; size: [number, number]; coverage: number }[];
}

/** Serialized observations, not instructions for fetching or executing external assets. */
export function validatePetPhotoCoat(input: unknown): asserts input is PetPhotoCoat {
  const coat = input as PetPhotoCoat;
  const color = (v: unknown) => typeof v === "string" && /^#[a-f\d]{6}$/i.test(v);
  const keys = (v: unknown, fields: string[]) => !!v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join() === fields.sort().join();
  if (!keys(coat, ["version", "base", "regions", "markings"]) || coat.version !== 1 || !color(coat.base) || !coat.regions || typeof coat.regions !== "object" || Array.isArray(coat.regions) || Object.entries(coat.regions).some(([r, c]) => !(petCoatRegions as readonly string[]).includes(r) || !color(c)) || !Array.isArray(coat.markings) || coat.markings.length > 12) throw new Error("宠物照片毛色分区无效。");
  for (const mark of coat.markings) {
    if (!keys(mark, ["region", "kind", "color", "center", "size", "coverage"]) || !petCoatRegions.includes(mark.region) || !["patch", "stripes", "spots"].includes(mark.kind) || !color(mark.color) || typeof mark.coverage !== "number" || !Number.isFinite(mark.coverage) || mark.coverage < .05 || mark.coverage > .95) throw new Error("宠物照片花纹无效。");
    for (const [key, low] of [["center", 0], ["size", .03]] as const) if (!Array.isArray(mark[key]) || mark[key].length !== 2 || mark[key].some(n => typeof n !== "number" || !Number.isFinite(n) || n < low || n > 1)) throw new Error("宠物照片花纹位置无效。");
  }
}
