export interface PetAppearance {
  pet: "cat" | "dog";
  color: string;
  accent: string;
  pattern: string;
  /** Coat pattern controls; these never determine the model's physical size. */
  scale: number;
  amount: number;
  seed: number;
}

export interface PetGenerationMetadata {
  appearanceChanged?: boolean;
  appearance?: PetAppearance;
  regionalPreset?: "BicolorWhite" | "SaddleWhiteChestLegs";
  mappingLosses?: string[];
}

const regional = {
  bicolor_white: { name: "BicolorWhite", pet: "cat", color: "white", accent: "brown" },
  saddle_white: { name: "SaddleWhiteChestLegs", pet: "dog", color: "brown", accent: "black" },
} as const;
const colors = ["white", "black", "gray", "cream", "orange", "brown"];

/** Accept optional metadata on legacy assets, and validate every supplied field. */
export function petGenerationMetadata(input: unknown, species: "cat" | "dog"): PetGenerationMetadata {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("宠物生成记录无效。");
  const value = input as PetGenerationMetadata, result: PetGenerationMetadata = {};
  if (value.appearanceChanged !== undefined) {
    if (typeof value.appearanceChanged !== "boolean") throw new Error("宠物毛色记录无效。");
    result.appearanceChanged = value.appearanceChanged;
  }
  let preset: typeof regional[keyof typeof regional] | undefined;
  if (value.appearance !== undefined) {
    const a = value.appearance;
    if (!a || typeof a !== "object" || Array.isArray(a) || Object.keys(a).sort().join(",") !== "accent,amount,color,pattern,pet,scale,seed"
      || a.pet !== species || !colors.includes(a.color) || !colors.includes(a.accent) || typeof a.pattern !== "string"
      || typeof a.scale !== "number" || !Number.isFinite(a.scale) || a.scale < .4 || a.scale > 2.5
      || typeof a.amount !== "number" || !Number.isFinite(a.amount) || a.amount < .15 || a.amount > .85
      || !Number.isSafeInteger(a.seed) || a.seed < 0 || a.seed > 9999) throw new Error("宠物毛色参数无效。");
    if (Object.prototype.hasOwnProperty.call(regional, a.pattern)) {
      preset = regional[a.pattern as keyof typeof regional];
      if (a.pet !== preset.pet || a.color !== preset.color || a.accent !== preset.accent || a.scale !== 1 || a.amount !== .5 || a.seed !== 0) throw new Error("宠物分区毛色参数不匹配。");
    } else if (!(species === "cat" ? ["solid", "stripes", "patches", "calico"] : ["solid", "patches", "spots"]).includes(a.pattern)) throw new Error("宠物花纹与物种不匹配。");
    if (a.pattern === "calico" && (a.color !== "white" || a.accent !== "black")) throw new Error("三花猫颜色参数无效。");
    result.appearance = { ...a };
  }
  if (preset?.name !== value.regionalPreset) throw new Error("宠物分区预设记录不匹配。");
  if (preset) result.regionalPreset = preset.name;
  if ((value.appearanceChanged === true && !result.appearance) || (value.appearanceChanged === false && result.appearance)) throw new Error("宠物毛色生成状态不一致。");
  if (value.mappingLosses !== undefined) {
    if (!Array.isArray(value.mappingLosses) || value.mappingLosses.length > 20 || value.mappingLosses.some(s => typeof s !== "string" || !s.trim() || s.length > 500)) throw new Error("宠物外观差异记录无效。");
    result.mappingLosses = [...value.mappingLosses];
  }
  return result;
}
