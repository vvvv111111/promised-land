import type { GeneratedAsset, GeneratedPart, Vec3 } from "../types";
import { defaultRoomDesign, type RoomDesign } from "./design";

/** A real compositional example, also exercised by geometry and browser checks. */
export function generatedRoomDesign(): RoomDesign {
  const box = (size: Vec3, position: Vec3, color = "#b79269"): GeneratedPart => ({ shape: "box", size, position, color, material: "wood" });
  const loft: GeneratedAsset = { label: "架空木平台与护栏", parts: [
    box([3.8, .16, 2.2], [0, 2.12, 0]),
    ...[-1.8, 1.8].flatMap(x => [-1, 1].map(z => box([.12, 2.04, .12], [x, 1.02, z]))),
    ...[-1.8, -.9, 0, .9, 1.8].map(x => box([.04, .8, .04], [x, 2.6, 1.075])),
    box([3.7, .05, .04], [0, 3.02, 1.075]),
  ], supports: [{ id: "deck", part: 0 }] };
  const stairs: GeneratedAsset = { label: "八级木楼梯", parts: Array.from({ length: 8 }, (_, i) => box([.8, (i + 1) * .275, .3], [0, (i + 1) * .275 / 2, 1.05 - i * .3])) };
  const tv: GeneratedAsset = { label: "有底座的平板电视", parts: [
    box([.55, .04, .24], [0, .02, 0], "#24292b"),
    box([.06, .16, .06], [0, .12, 0], "#24292b"),
    box([1.08, .62, .065], [0, .49, 0], "#24292b"),
    { shape: "box", size: [1, .54, .012], position: [0, .49, .039], color: "#566774" },
  ] };
  const vase: GeneratedAsset = { label: "陶瓷花瓶", parts: [
    { shape: "ellipsoid", size: [.2, .24, .2], position: [0, .12, 0], color: "#d5b597" },
    { shape: "cylinder", size: [.09, .12, .09], position: [0, .28, 0], color: "#d5b597" },
  ] };
  return { ...defaultRoomDesign(), version: 2, dimensions: [7, 4.6, 6],
    summary: "带木楼梯和护栏的阁楼房间，平台上单人床、下方双人沙发，左侧矮柜上电视，前方茶桌上花瓶。",
    limitations: [], architecture: { units: "meters", windows: [{ wall: "left", offset: -.8, width: 1.6, bottom: 1.1, height: 1.5 }] },
    assets: { "loft-platform": loft, "wood-stairs": stairs, television: tv, "ceramic-vase": vase },
    furniture: [
      { id: "loft", type: "custom", asset: "loft-platform", x: 0, z: -1.7, rotation: 0 },
      { id: "stairs", type: "custom", asset: "wood-stairs", x: 2.3, z: -1.7, rotation: 0 },
      { id: "upper-bed", type: "bed", size: [1.05, 1, 2.05], parent: "loft", surface: "deck", x: -.6, z: 0, rotation: 0 },
      { id: "lower-sofa", type: "sofa", size: [2, 1, .9], x: -.3, z: -1.7, rotation: 0 },
      { id: "tv-cabinet", type: "cabinet", size: [1.5, .8, .6], x: -2.7, z: -.1, rotation: Math.PI / 2 },
      { id: "tv", type: "custom", asset: "television", parent: "tv-cabinet", surface: "top", x: 0, z: 0, rotation: 0 },
      { id: "main-table", type: "table", size: [1.9, .55, 1.05], x: 0, z: .5, rotation: 0 },
      { id: "vase", type: "custom", asset: "ceramic-vase", parent: "main-table", surface: "top", x: .7, z: .25, rotation: 0 },
    ],
  };
}
