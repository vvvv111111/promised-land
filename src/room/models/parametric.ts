import * as THREE from "three";
import type { ModelContext, ModelBehavior } from "./context";
import type { ModelId, Vec3 } from "../types";

/** Construct at requested dimensions. Board, leg and cushion thicknesses stay physical. */
export function parametricFurniture(root: THREE.Group, ctx: ModelContext, model: ModelId, size: Vec3): ModelBehavior {
  const [w, h, d] = size;
  const { box, cylinder, ellipsoid, tube, wood, darkWood, sofaFabric, creamFabric, rugFabric, brass, green, terracotta } = ctx;
  const legs = (height: number, inset = .1, radius = .025) => {
    for (const x of [-w / 2 + inset, w / 2 - inset]) for (const z of [-d / 2 + inset, d / 2 - inset]) {
      cylinder(root, radius, radius * .8, height, darkWood, x, height / 2, z);
    }
  };
  if (["table", "desk", "dining-table"].includes(model)) {
    const thickness = .055;
    legs(h - thickness, .1, model === "dining-table" ? .035 : .028);
    box(root, w, thickness, d, wood, 0, h - thickness / 2, 0, .018);
    if (model === "desk") {
      box(root, Math.min(.4, w * .27), .14, d - .16, wood, w / 2 - .26, h - .14, 0);
      box(root, .12, .014, .02, brass, w / 2 - .26, h - .14, d / 2 - .07);
    }
  } else if (model === "bed") {
    legs(.18, .12, .035);
    box(root, w, .2, d - .1, wood, 0, .28, .05, .035);
    box(root, w, h - .18, .09, wood, 0, (h + .18) / 2, -d / 2 + .045, .035);
    box(root, w - .12, .22, d - .18, creamFabric, 0, .49, .035, .07);
    box(root, w - .1, .07, (d - .2) * .65, sofaFabric, 0, .635, d * .17, .035);
    const pillows = w < 1.3 ? 1 : 2, pillowW = Math.min(.65, (w - .25) / pillows);
    for (let i = 0; i < pillows; i++) box(root, pillowW, .13, .38, creamFabric, (i - (pillows - 1) / 2) * (pillowW + .06), .665, -d / 2 + .38, .055);
  } else if (model === "chair") {
    const seat = Math.min(.49, h * .53);
    legs(seat - .04, .075, .022);
    box(root, w, .06, d - .08, wood, 0, seat - .01, -.04, .025);
    box(root, w - .08, .05, d - .15, creamFabric, 0, seat + .04, -.04, .02);
    for (const x of [-w / 2 + .06, w / 2 - .06]) box(root, .035, h - seat, .04, wood, x, (seat + h) / 2, d / 2 - .04);
    box(root, w, Math.min(.26, (h - seat) * .65), .06, wood, 0, h - Math.min(.26, (h - seat) * .65) / 2, d / 2 - .03, .025);
  } else if (model === "sofa" || model === "armchair") {
    const seat = .43, arm = .13, back = .16, seats = model === "armchair" ? 1 : Math.max(2, Math.round(w / .85));
    legs(.17, .11, .03);
    box(root, w, .18, d, sofaFabric, 0, .25, 0, .055);
    box(root, w, h - .32, back, sofaFabric, 0, (h + .32) / 2, -d / 2 + back / 2, .055);
    for (const x of [-w / 2 + arm / 2, w / 2 - arm / 2]) box(root, arm, .34, d, sofaFabric, x, .49, 0, .05);
    const cushionW = (w - arm * 2 - .06) / seats;
    for (let i = 0; i < seats; i++) box(root, cushionW - .025, .16, d - back - .05, sofaFabric, (i - (seats - 1) / 2) * cushionW, seat, back / 2, .045);
    box(root, Math.min(.4, w * .4), .34, .14, creamFabric, model === "armchair" ? 0 : -w * .26, Math.min(.69, h - .17), -d / 2 + back + .1, .055);
  } else if (["cabinet", "nightstand", "wardrobe", "bookshelf"].includes(model)) {
    const board = .035, base = model === "bookshelf" ? .04 : .12;
    if (model !== "bookshelf") legs(base, .07, .023);
    for (const x of [-w / 2 + board / 2, w / 2 - board / 2]) box(root, board, h - base, d - .03, wood, x, (base + h) / 2, -.015);
    box(root, w, h - base, .025, darkWood, 0, (base + h) / 2, -d / 2 + .0125);
    box(root, w, board, d, wood, 0, h - board / 2, 0);
    box(root, w - board * 2, board, d - .03, wood, 0, base + board / 2, 0);
    if (model === "bookshelf") {
      const levels = Math.max(2, Math.round((h - base) / .4));
      for (let level = 1; level < levels; level++) {
        const y = base + (h - base) * level / levels;
        box(root, w - board * 2, board, d - .04, wood, 0, y, 0);
        const books = Math.min(16, Math.floor((w - .14) / .09));
        for (let i = 0; i < books; i++) box(root, .06, Math.min(.25, (h - base) / levels - .07), Math.min(.19, d - .08), [creamFabric, green, terracotta][i % 3], -w / 2 + .1 + i * .09, y + .15, 0, .003);
      }
    } else {
      const doors = Math.max(1, Math.round(w / .65)), doorW = (w - .08) / doors;
      for (let i = 0; i < doors; i++) {
        const x = (i - (doors - 1) / 2) * doorW;
        box(root, doorW - .015, h - base - .1, .03, wood, x, (h + base) / 2, d / 2 - .015, .006);
        box(root, .1, .016, .02, brass, x, (h + base) / 2, d / 2 - .01, .003);
      }
    }
  } else if (model === "rug") {
    box(root, w, h, d, rugFabric, 0, h / 2, 0, .012);
    for (const z of [-d / 2 + .07, d / 2 - .07]) box(root, w - .1, .002, .025, creamFabric, 0, h - .001, z, 0);
  } else if (model === "plant") {
    const radius = Math.min(w, d) * .23, potH = h * .25;
    cylinder(root, radius, radius * .72, potH, terracotta, 0, potH / 2, 0);
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.4, y = h * (.55 + (i % 4) * .09), x = Math.sin(angle) * w * .28, z = Math.cos(angle) * d * .28;
      tube(root, [new THREE.Vector3(0, potH, 0), new THREE.Vector3(x * .4, y * .7, z * .4), new THREE.Vector3(x, y, z)], .006, green);
      ellipsoid(root, 1, [w * .12, h * .16, d * .09], green, x, y, z);
    }
  } else throw new Error(`No parameter-built furniture for ${model}`);
  return {};
}
