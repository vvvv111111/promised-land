import * as THREE from "three";
import type { ModelContext, ModelBehavior } from "./context";
import type { PhotoFrameContent } from "@/world/types";

export function cd(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, cylinder, mesh, material, materials, darkWood, onChange } = ctx;
  // Compact top-loading CD player: solid housing, recessed disc, transparent lid,
  // speaker perforations and physical controls share the table's world transform.
  const cd = room;
  const plastic = material("#dcded4", .52), rubber = material("#515950", .85);
  box(cd, .64, .075, .40, plastic, 0, .038, 0, .035);
  box(cd, .59, .014, .35, rubber, 0, .012, 0, .025);
  cylinder(cd, .151, .151, .009, rubber, -.082, .080, -.015);
  const discMaterial = new THREE.MeshPhysicalMaterial({ color: "#c5ced1", metalness: .85, roughness: .25, iridescence: .65, iridescenceIOR: 1.3 }); materials.add(discMaterial);
  const disc = mesh(new THREE.RingGeometry(.021, .137, 64), discMaterial, cd, -.082, .086, -.015); disc.rotation.x = -Math.PI / 2;
  cylinder(cd, .020, .020, .010, plastic, -.082, .085, -.015);
  const lidMaterial = new THREE.MeshPhysicalMaterial({ color: "#d3e1dd", metalness: 0, roughness: .12, transparent: true, opacity: .17, depthWrite: false }); materials.add(lidMaterial);
  cylinder(cd, .151, .151, .012, lidMaterial, -.082, .102, -.015);
  box(cd, .13, .007, .055, rubber, .21, .080, -.118, .007);
  const indicator = material("#72806c", .5);
  box(cd, .09, .004, .028, indicator, .21, .085, -.118, .003);
  for (let i = 0; i < 3; i++) cylinder(cd, .018, .018, .012, plastic, .21, .087, -.035 + i * .052);
  for (let x = 0; x < 6; x++) for (let z = 0; z < 2; z++) cylinder(cd, .003, .003, .002, rubber, -.16 + x * .033, .080, .152 + z * .017);
  for (const x of [-.25, .25]) box(cd, .035, .007, .011, darkWood, x, .025, .202, .003);

  return { setAudioPlaying(playing: boolean) {
    indicator.color.set(playing ? "#618454" : "#72806c");
    indicator.emissive.set(playing ? "#31472a" : "#000000"); onChange();
  } };
}

export function envelope(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, tube, trim, paper } = ctx;
  // Envelope lies on the tabletop. Its flap is geometry, rather than an HTML overlay.
  const letter = room;
  box(letter, .34, .012, .23, paper, 0, 0, 0, .004);
  tube(letter, [new THREE.Vector3(-.16, .008, -.10), new THREE.Vector3(0, .009, .02), new THREE.Vector3(.16, .008, -.10)], .0025, trim);

  return {};
}

export function frame(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { box, material, textures, darkWood, paper, onChange } = ctx;
  const frame = room;
  box(frame, .76, .61, .065, darkWood, 0, 0, 0);
  box(frame, .68, .53, .015, paper, 0, 0, .037);
  const photoCanvas = document.createElement("canvas"); photoCanvas.width = 320; photoCanvas.height = 240;
  const photoContext = photoCanvas.getContext("2d")!;
  photoContext.fillStyle = "#c2c8bb"; photoContext.fillRect(0, 0, 320, 240);
  const photoTexture = new THREE.CanvasTexture(photoCanvas); photoTexture.colorSpace = THREE.SRGBColorSpace; textures.add(photoTexture);
  const photoMaterial = material("#ffffff", .86, photoTexture);
  box(frame, .56, .42, .004, photoMaterial, 0, 0, .048, 0);
  box(frame, .035, .38, .025, darkWood, 0, -.19, -.13).rotation.x = .5;

  let disposed = false, photoSequence = 0;
  return {
    setPhoto(content: PhotoFrameContent) {
      const sequence = ++photoSequence;
      photoContext.fillStyle = "#c2c8bb"; photoContext.fillRect(0, 0, 320, 240); photoTexture.needsUpdate = true;
      if (!content.photo) return;
      const image = new Image();
      image.onload = () => {
        if (disposed || sequence !== photoSequence) return;
        const width = 320, height = 240;
        const scale = Math.max(width / image.width, height / image.height) * content.zoom;
        const w = image.width * scale, h = image.height * scale;
        photoContext.drawImage(image, (width - w) * content.position_x, (height - h) * content.position_y, w, h);
        photoTexture.needsUpdate = true;
        onChange();
      };
      image.src = content.photo;
    },
    dispose() { disposed = true; photoSequence++; },
  };
}

export function lamp(room: THREE.Group, ctx: ModelContext): ModelBehavior {
  const { cylinder, mesh, materials, ceramic, brass } = ctx;
  // Lamp is deliberately quiet: no particles or decorative glow overlays.
  const lamp = room;
  cylinder(lamp, .14, .16, .035, ceramic, 0, .02, 0);
  cylinder(lamp, .018, .018, .43, brass, 0, .25, 0);
  const shadeMaterial = new THREE.MeshStandardMaterial({ color: "#e1d6bd", roughness: .9, side: THREE.DoubleSide }); materials.add(shadeMaterial);
  mesh(new THREE.CylinderGeometry(.17, .29, .33, 48, 1, true), shadeMaterial, lamp, 0, .52, 0);
  const lampLight = new THREE.PointLight("#ffe0ac", 0, 3, 2); lampLight.position.set(0, .42, 0); lamp.add(lampLight);

  let lampOn = false;

  return { toggleLamp() {
    lampOn = !lampOn; lampLight.intensity = lampOn ? 2.5 : 0;
    shadeMaterial.emissive.set(lampOn ? "#b08845" : "#000000"); shadeMaterial.emissiveIntensity = .35;
    return lampOn;
  } };
}
