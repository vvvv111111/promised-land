import type { ModelContext, ModelBehavior } from "./context";
import type * as THREE from "three";

export function bed(root: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, wood, darkWood, creamFabric, sofaFabric } = ctx;
  for (const x of [-.72, .72]) for (const z of [-.88, .88]) cylinder(root, .035, .03, .24, darkWood, x, .12, z);
  box(root, 1.8, .21, 2.16, wood, 0, .3, 0, .04);
  box(root, 1.82, 1.05, .12, wood, 0, .61, -1.08, .05);
  box(root, 1.7, .25, 2.03, creamFabric, 0, .52, .01, .09);
  box(root, 1.73, .1, 1.35, sofaFabric, 0, .67, .36, .07);
  box(root, 1.74, .065, .28, creamFabric, 0, .73, -.19, .025);
  for (const x of [-.43, .43]) box(root, .66, .14, .42, creamFabric, x, .72, -.73, .08).rotation.x = -.1;
  // A folded throw hangs over the foot of the bed.
  box(root, .55, .035, .62, sofaFabric, .5, .75, .75, .02);
  return {};
}

export function desk(root: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, wood, darkWood, brass } = ctx;
  box(root, 2, .065, .9, wood, 0, .75, 0, .025);
  for (const x of [-.88, .88]) for (const z of [-.34, .34]) cylinder(root, .028, .022, .72, darkWood, x, .36, z);
  box(root, .42, .18, .66, wood, .68, .62, -.03, .015);
  box(root, .16, .018, .02, brass, .68, .64, .31, .004);
  box(root, 1.77, .08, .035, wood, 0, .58, -.36);
  return {};
}

export function chair(root: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, wood, darkWood, creamFabric } = ctx;
  for (const x of [-.21, .21]) for (const z of [-.21, .21]) cylinder(root, .024, .018, .45, darkWood, x, .225, z);
  box(root, .55, .07, .54, wood, 0, .46, 0, .04);
  box(root, .48, .07, .46, creamFabric, 0, .52, -.015, .04);
  for (const x of [-.22, .22]) box(root, .035, .51, .04, wood, x, .71, .24);
  box(root, .55, .29, .065, wood, 0, .84, .26, .04);
  return {};
}

export function nightstand(root: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, wood, darkWood, brass } = ctx;
  for (const x of [-.24, .24]) for (const z of [-.2, .2]) cylinder(root, .022, .018, .17, darkWood, x, .085, z);
  box(root, .6, .4, .54, wood, 0, .36, 0, .02);
  box(root, .62, .045, .56, wood, 0, .58, 0, .015);
  box(root, .52, .15, .018, wood, 0, .44, .28, .006);
  box(root, .14, .016, .016, brass, 0, .44, .295, .004);
  return {};
}

export function bookshelf(root: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, wood, darkWood, creamFabric, green, terracotta, random } = ctx;
  for (const x of [-.43, .43]) box(root, .05, 1.85, .4, wood, x, .925, 0);
  box(root, .9, 1.85, .025, darkWood, 0, .925, -.2);
  for (const y of [.06, .49, .92, 1.35, 1.85]) box(root, .9, .045, .4, wood, 0, y, 0);
  for (const y of [.49, .92, 1.35]) for (let i = 0; i < 6; i++) {
    box(root, .065, .24 + random() * .08, .2, [creamFabric, green, terracotta][i % 3], -.31 + i * .105, y + .18, .01, .003);
  }
  return {};
}

export function wardrobe(root: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, wood, darkWood, brass } = ctx;
  box(root, 1.7, 2.18, .64, wood, 0, 1.13, 0, .025);
  for (const x of [-.42, .42]) box(root, .81, 2.06, .035, wood, x, 1.14, .34, .008);
  for (const x of [-.08, .08]) box(root, .018, .19, .025, brass, x, 1.11, .37, .004);
  for (const x of [-.68, .68]) box(root, .075, .1, .5, darkWood, x, .05, 0);
  return {};
}
