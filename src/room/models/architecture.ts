import * as THREE from "three";
import type { ModelContext, ModelBehavior } from "./context";

export function shell(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, mesh, material, random, materials, paleWood, darkWood, plaster, trim } = ctx;
  // Open front and right edges reveal the real wall thickness and interior volume.
  box(room, 6.28, .20, 4.88, darkWood, 0, -.13, 0, .035);
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 4; col++) {
      const length = 1.5, width = .299;
      const mat = paleWood.clone(); mat.color.setHSL(.105, .24, .76 + random() * .045); materials.add(mat);
      box(room, length - .009, .045, width, mat, -2.25 + col * length, -.005, -2.25 + row * .3, .004);
    }
  }
  box(room, 6.24, 3.12, .14, plaster, 0, 1.52, -2.43);
  // Left wall with a genuine window opening, not a picture of a window.
  box(room, .14, 1.02, 4.88, plaster, -3.07, .47, 0, 0);
  box(room, .14, .42, 4.88, plaster, -3.07, 2.87, 0, 0);
  box(room, .14, 1.68, .68, plaster, -3.07, 1.82, -2.1, 0);
  box(room, .14, 1.68, 1.5, plaster, -3.07, 1.82, 1.69, 0);
  box(room, 6, .10, .045, trim, 0, .075, -2.34);
  box(room, .045, .10, 4.7, trim, -2.98, .075, 0);
  for (const z of [-1.75, .94]) box(room, .21, 1.77, .075, paleWood, -3.01, 1.83, z);
  for (const y of [1.0, 2.66]) box(room, .22, .075, 2.75, paleWood, -3.01, y, -.40);
  box(room, .12, 1.62, .045, paleWood, -3.01, 1.83, -.40);
  box(room, .12, .04, 2.68, paleWood, -3.01, 1.8, -.40);
  box(room, .42, .065, 2.90, paleWood, -2.94, .99, -.40);
  const glass = new THREE.MeshPhysicalMaterial({ color: "#b1c5bd", roughness: .18, transparent: true, opacity: .12, side: THREE.DoubleSide });
  materials.add(glass);
  const pane = mesh(new THREE.PlaneGeometry(2.64, 1.6), glass, room, -3.08, 1.83, -.40); pane.rotation.y = Math.PI / 2; pane.castShadow = false;
  // Light cotton curtain, with actual folded cross-section.
  const curtain = material("#ebe6d7", 1);
  for (const z of [-1.57, .76]) {
    const geometry = new THREE.PlaneGeometry(.47, 1.7, 16, 1);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getX(i) * 55) * .035);
    geometry.computeVertexNormals();
    const fabric = curtain.clone(); fabric.side = THREE.DoubleSide; materials.add(fabric);
    const panel = mesh(geometry, fabric, room, -2.86, 1.86, z); panel.rotation.y = Math.PI / 2;
  }
  const rail = cylinder(room, .015, .015, 3.1, darkWood, -2.84, 2.76, -.40); rail.rotation.x = Math.PI / 2;

  return {};
}

export function rug(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, creamFabric, rugFabric } = ctx;
  // Flat woven rug and fringed ends, all seated on the floor.
  box(room, 3.65, .025, 2.35, rugFabric, -.60, .035, .48, .028);
  for (const z of [-.60, 1.56]) box(room, 3.5, .003, .034, creamFabric, -.60, .05, z, 0);
  for (let i = 0; i < 42; i++) for (const z of [-.72, 1.68]) {
    const fringe = cylinder(room, .004, .004, .07, creamFabric, -2.34 + i * .085, .04, z); fringe.rotation.x = Math.PI / 2;
  }

  return {};
}
