import type { RoomDefinition } from "./types";

export type PhotoWall = "left" | "back";

/** Interior wall faces match the actual shell mesh, including its thickness. */
export function wallFace(plan: RoomDefinition, wall: PhotoWall) {
  if (plan.architecture?.units === "meters") return -plan.dimensions[wall === "left" ? 0 : 2] / 2;
  return wall === "left" ? -plan.dimensions[0] / 2 : -2.36 * plan.dimensions[2] / 4.8;
}

export function windowRects(plan: RoomDefinition, wall: PhotoWall) {
  const windows = plan.architecture?.windows ?? [{ wall: "left", offset: -.4, width: 2.65, bottom: 1, height: 1.66 }];
  const metric = plan.architecture?.units === "meters";
  const horizontalScale = metric ? 1 : plan.dimensions[wall === "back" ? 0 : 2] / (wall === "back" ? 6 : 4.8), verticalScale = metric ? 1 : plan.dimensions[1] / 3;
  return windows.filter(w => w.wall === wall).map(w => ({
    min: w.offset * horizontalScale - w.width * horizontalScale / 2 - .12,
    max: w.offset * horizontalScale + w.width * horizontalScale / 2 + .12,
    bottom: w.bottom * verticalScale - .12, top: (w.bottom + w.height) * verticalScale + .12,
  }));
}

/** Fits the whole frame on solid wall, with breathing room around windows. */
export function clearsWindows(plan: RoomDefinition, wall: PhotoWall, along: number, y: number, scale: number) {
  return windowRects(plan, wall).every(w => along + .38 * scale < w.min || along - .38 * scale > w.max || y + .305 * scale < w.bottom || y - .305 * scale > w.top);
}
