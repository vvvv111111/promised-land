import { bedroomRoomDesign, defaultRoomDesign, type RoomDesign } from "./design";
import { furnitureSize, type FurnitureId } from "../furnitureCatalog";

function modern(design: RoomDesign): RoomDesign {
  return { ...design, version: 2, dimensions: [6, 3, 4.8], architecture: { units: "meters", windows: design.architecture?.windows ?? [{ wall: "left", offset: -.4, width: 2, bottom: 1.1, height: 1.5 }] }, furniture: design.furniture.map(n => ({ ...n, type: n.id as FurnitureId, size: furnitureSize(n.id as FurnitureId) })) };
}

export function livingRoomDesign(): RoomDesign {
  const design = modern(defaultRoomDesign());
  design.furniture.find(n => n.type === "rug")!.x = -.6;
  design.furniture.find(n => n.type === "rug")!.z = .48;
  return design;
}

export function flexibleBedroomDesign(): RoomDesign { return modern(bedroomRoomDesign()); }

export function studyRoomDesign(): RoomDesign {
  return { ...modern(defaultRoomDesign()), summary: "双人书房，两张书桌独立配色，后方采光，另设书架和阅读椅。", dimensions: [7, 3, 5.6], architecture: { units: "meters", windows: [{ wall: "back", offset: 0, width: 1.2, bottom: 1.1, height: 1.5 }] }, furniture: [
    { id: "desk-left", type: "desk", size: [1.6, .76, .8], colors: { wood: "#b68c63" }, x: -1.9, z: -2, rotation: 0 },
    { id: "desk-right", type: "desk", size: [1.6, .76, .8], colors: { wood: "#d6b894" }, x: 1.9, z: -2, rotation: 0 },
    { id: "chair-left", type: "chair", x: -1.9, z: -.9, rotation: 0 },
    { id: "chair-right", type: "chair", x: 1.9, z: -.9, rotation: 0 },
    { id: "reading-shelf", type: "bookshelf", x: 2.7, z: 1.6, rotation: 0 },
    { id: "reading-chair", type: "armchair", colors: { sofaFabric: "#b77b58" }, x: -2, z: 1.1, rotation: .25 },
  ] };
}

export function diningRoomDesign(): RoomDesign {
  return { ...modern(defaultRoomDesign()), summary: "四人餐厅，木质餐桌配四把椅子与餐边柜。", dimensions: [6.5, 3, 5], architecture: { units: "meters", windows: [{ wall: "back", offset: -.8, width: 1.8, bottom: 1.1, height: 1.5 }] }, furniture: [
    { id: "dining-main", type: "dining-table", size: [1.8, .76, .9], x: 0, z: 0, rotation: 0 },
    ...[-1, 1].flatMap(side => [-.6, .6].map((x, index) => ({ id: `dining-chair-${side === -1 ? "back" : "front"}-${index + 1}`, type: "chair" as const, x, z: side * 1.05, rotation: side === -1 ? Math.PI : 0 }))),
    { id: "sideboard", type: "cabinet", size: [1.4, .95, .65], x: 2.15, z: -1.95, rotation: 0 },
  ] };
}
