import * as THREE from "three";
import type { ModelContext, ModelBehavior } from "./context";

export function pet(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { ellipsoid, mesh, tube, material, darkWood } = ctx;
  // A sleeping cat: solid forms remain three-dimensional from every allowed view.
  const cat = room;
  const fur = material("#bf9065", .95), muzzle = material("#d9c1a0", .98);
  ellipsoid(cat, .23, [1.6, .72, 1], fur, 0, .15, 0);
  ellipsoid(cat, .16, [1, .91, 1], fur, -.22, .18, .04);
  ellipsoid(cat, .10, [1, .6, 1], muzzle, -.29, .11, .12);
  for (const x of [-.32, -.12]) {
    const ear = mesh(new THREE.ConeGeometry(.066, .15, 3), fur, cat, x, .33, .02); ear.rotation.z = x < -.2 ? .25 : -.25;
  }
  tube(cat, [new THREE.Vector3(.2, .12, -.10), new THREE.Vector3(.37, .11, .06), new THREE.Vector3(.18, .10, .20), new THREE.Vector3(-.08, .10, .2)], .043, fur);
  tube(cat, [new THREE.Vector3(-.36, .21, .14), new THREE.Vector3(-.31, .20, .15), new THREE.Vector3(-.28, .21, .17)], .005, darkWood);

  return {};
}
