import type { RoomDefinition, RoomNode } from "./types";
import { nodeWorldBounds } from "./spatial";
import { clearsWindows, wallFace } from "./wallMount";

/** Deterministic composition: above low furniture, at eye level, never in a window or behind a tall object. */
export function withWallPhoto(input: RoomDefinition, recompose = false): RoomDefinition {
  const original = input.nodes.find(n => n.interaction === "sunset-frame");
  if (!original || (original.wall && !recompose)) return input;
  const plan = structuredClone(input), photo = plan.nodes.find(n => n.id === original.id)!;
  const obstacles = input.nodes.filter(n => n.id !== original.id && n.model !== "shell" && n.model !== "rug").map(n => nodeWorldBounds(input, n));
  const anchors = ["sofa", "bed", "cabinet", "desk"].map(model => input.nodes.find(n => n.model === model)).filter((n): n is RoomNode => Boolean(n));
  for (const scale of [1.1, 1, .85, .7]) for (const wall of ["back", "left"] as const) {
    const axis = wall === "back" ? 0 : 2, length = plan.dimensions[axis];
    const positions = [...anchors.map(n => n.position[axis]), 0];
    for (let offset = .15; offset < length / 2 - .2; offset += .15) positions.push(-offset, offset);
    for (const y of [1.9, 1.75, 2.1, 1.6, 2.3]) for (const along of positions) {
      const bottom = y - .305 * scale, top = y + .305 * scale, min = along - .38 * scale, max = along + .38 * scale;
      if (min < -length / 2 + .2 || max > length / 2 - .2 || bottom < .9 || top > plan.dimensions[1] - .2) continue;
      if (!clearsWindows(plan, wall, along, y, scale)) continue;
      // Project tall furnishings onto the wall too: a physically clear frame must also remain visible.
      if (obstacles.some(b => bottom < b.max[1] + .14 && top > b.min[1] - .08 && min < b.max[axis] + .12 && max > b.min[axis] - .12)) continue;
      delete photo.parent; delete photo.surface;
      photo.wall = wall; photo.scale = [scale, scale, scale];
      photo.rotation = [0, wall === "left" ? Math.PI / 2 : 0, 0];
      const normal = wallFace(plan, wall) + .0325 * scale + .001;
      photo.position = wall === "back" ? [along, y, normal] : [normal, y, along];
      return plan;
    }
  }
  throw new Error("Invalid room definition: no clear wall area for the photo; leave space above low furniture, away from windows and tall cabinets");
}
