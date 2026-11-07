import * as THREE from "three";
import type { ModelContext, ModelBehavior } from "./context";

export function sofa(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, darkWood, sofaFabric, creamFabric, terracotta } = ctx;
  // An ordinary two-seat sofa, with separate upholstery, piping and timber legs.
  const sofa = room;
  for (const x of [-1.08, 1.08]) for (const z of [-.35, .35]) cylinder(sofa, .037, .026, .24, darkWood, x, .14, z);
  box(sofa, 2.55, .23, .97, sofaFabric, 0, .36, 0, .075);
  box(sofa, 2.35, .73, .22, sofaFabric, 0, .83, -.39, .075).rotation.x = -.075;
  for (const x of [-1.2, 1.2]) box(sofa, .22, .55, .99, sofaFabric, x, .64, 0, .09);
  for (const x of [-.56, .56]) {
    box(sofa, 1.08, .19, .77, sofaFabric, x, .54, .08, .065);
    box(sofa, 1.08, .026, .77, sofaFabric, x, .60, .08, .012);
  }
  const pillow = box(sofa, .47, .43, .18, creamFabric, -.79, .84, -.13, .085); pillow.rotation.set(-.15, .15, -.16);
  const otherPillow = box(sofa, .43, .42, .17, terracotta, .79, .83, -.14, .07); otherPillow.rotation.set(-.2, -.1, .15);
  box(sofa, .36, .035, .83, creamFabric, -.92, .66, .06, .012);
  box(sofa, .36, .26, .028, creamFabric, -.92, .52, .46, .008);

  return {};
}

export function table(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, mesh, material, wood, creamFabric, green, ceramic } = ctx;
  const table = room;
  for (const [x, z] of [[-.63, -.34], [.63, -.34], [-.63, .34], [.63, .34]]) {
    const leg = cylinder(table, .04, .027, .53, wood, x, .29, z); leg.rotation.z = -x * .11; leg.rotation.x = z * .14;
  }
  box(table, 1.66, .085, .96, wood, 0, .60, 0, .22);
  box(table, 1.13, .04, .51, wood, 0, .22, 0, .045);
  // A book on the lower shelf, and an unfinished cup of tea above.
  box(table, .36, .05, .27, creamFabric, .1, .27, .03, .006).rotation.y = -.2;
  cylinder(table, .106, .09, .018, ceramic, -.45, .66, -.12);
  const cup = cylinder(table, .071, .052, .12, ceramic, -.45, .72, -.12);
  cylinder(table, .059, .059, .005, material("#67513c", .24), -.45, .782, -.12);
  const handle = mesh(new THREE.TorusGeometry(.042, .012, 8, 20), ceramic, table, -.361, .726, -.12); handle.rotation.y = Math.PI / 2;
  cup.name = "teacup";
  box(table, .24, .012, .31, green, -.35, .25, -.02, .006).rotation.y = .12;

  return {};
}

export function cabinet(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, random, wood, darkWood, creamFabric, terracotta, green, brass } = ctx;
  // Low cabinet: open shelf, drawers, small handles and unevenly placed books.
  const cabinet = room;
  for (const x of [-.79, .79]) for (const z of [-.23, .23]) cylinder(cabinet, .028, .022, .21, darkWood, x, .13, z);
  box(cabinet, 1.96, .065, .68, wood, 0, 1.04, 0);
  box(cabinet, 1.9, .065, .64, wood, 0, .25, 0);
  box(cabinet, 1.9, .76, .035, darkWood, 0, .64, -.30);
  for (const x of [-.92, .15, .92]) box(cabinet, .05, .76, .64, wood, x, .64, 0);
  box(cabinet, .75, .37, .045, wood, .53, .83, .32);
  box(cabinet, .75, .37, .045, wood, .53, .44, .32);
  for (const y of [.83, .44]) box(cabinet, .17, .018, .025, brass, .53, y, .36, .008);
  box(cabinet, 1.04, .04, .6, wood, -.38, .64, 0);
  for (let i = 0; i < 7; i++) {
    const book = box(cabinet, .075 + random() * .03, .25 + random() * .08, .25, [green, creamFabric, terracotta, darkWood][i % 4], -.77 + i * .11, .42, .09, .003);
    if (i === 6) book.rotation.z = .15;
  }
  box(cabinet, .40, .18, .40, creamFabric, -.45, .76, .04, .014);
  box(cabinet, .11, .025, .007, darkWood, -.45, .76, .245, .004);

  return {};
}

export function plant(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { cylinder, ellipsoid, tube, random, darkWood, terracotta, green } = ctx;
  const p = room;
  cylinder(p, .16, .115, .28, terracotta, 0, .14, 0);
  cylinder(p, .145, .145, .015, darkWood, 0, .28, 0);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, height = .5 + random() * .4;
    const end = new THREE.Vector3(Math.sin(a) * .19, height, Math.cos(a) * .19);
    tube(p, [new THREE.Vector3(0, .25, 0), new THREE.Vector3(end.x * .4, .49, end.z * .4), end], .007, green);
    const leaf = ellipsoid(p, .12, [.65, 1.6, .12], green, end.x, end.y, end.z); leaf.rotation.set(.45, a, .45);
  }

  return {};
}

export function clock(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, darkWood, paper, ink } = ctx;
  // Clock has separate hands and a shallow face, to keep the back wall lived in.
  const clock = cylinder(room, .23, .23, .055, darkWood, .35, 2.34, -2.31); clock.rotation.x = Math.PI / 2;
  const face = cylinder(room, .204, .204, .012, paper, .35, 2.34, -2.274); face.rotation.x = Math.PI / 2;
  box(room, .012, .13, .012, ink, .35, 2.40, -2.26, .003).rotation.z = -.35;
  box(room, .10, .012, .012, ink, .39, 2.34, -2.255, .003);

  return {};
}

export function slippers(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, sofaFabric, creamFabric } = ctx;
  const slippers = room;
  for (const x of [-.13, .13]) {
    box(slippers, .18, .035, .34, creamFabric, x, 0, 0, .07);
    box(slippers, .18, .075, .17, sofaFabric, x, .035, -.065, .04);
  }

  return {};
}
