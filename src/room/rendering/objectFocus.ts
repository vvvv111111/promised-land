import * as THREE from "three";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { RoomObjectId } from "../types";

export type ViewBounds = { x: number; y: number; width: number; height: number };
type Pose = { position: THREE.Vector3; target: THREE.Vector3; offset: THREE.Vector2 };

/** Camera-only inspection. Model transforms and gift contents never change. */
export function createObjectFocus(camera: THREE.PerspectiveCamera, controls: OrbitControls, targets: Map<RoomObjectId, THREE.Group>, options: {
  viewport: () => ViewBounds;
  invalidate: () => void;
  onChange: (id: RoomObjectId | null) => void;
  reducedMotion: () => boolean;
}) {
  const limits = { min: controls.minDistance, max: controls.maxDistance, damping: controls.enableDamping };
  let active: RoomObjectId | null = null;
  let previous: (Pose & { aspect: number }) | null = null;
  let panel: ViewBounds | null = null, panelSignature = "";
  let offset = new THREE.Vector2();
  let transition: { from: Pose; to: Pose; start: number; restore: boolean } | null = null;

  function pose(): Pose { return { position: camera.position.clone(), target: controls.target.clone(), offset: offset.clone() }; }
  function apply(value: Pose) {
    camera.position.copy(value.position); controls.target.copy(value.target); offset.copy(value.offset);
    const viewport = options.viewport();
    if (offset.lengthSq() > .01 && viewport.width > 0 && viewport.height > 0) camera.setViewOffset(viewport.width, viewport.height, offset.x, offset.y, viewport.width, viewport.height);
    else camera.clearViewOffset();
    controls.update();
  }
  function finish(restore: boolean) {
    controls.enabled = true; controls.enableDamping = limits.damping;
    if (restore) { previous = null; controls.minDistance = limits.min; controls.maxDistance = limits.max; }
  }
  function move(to: Pose, restore = false) {
    controls.enableDamping = false; controls.update(); controls.enabled = false;
    if (options.reducedMotion()) { transition = null; apply(to); finish(restore); }
    else transition = { from: pose(), to, start: performance.now(), restore };
    options.invalidate();
  }
  function available(viewport: ViewBounds): ViewBounds {
    if (!panel) return viewport;
    const x = Math.max(viewport.x, panel.x), y = Math.max(viewport.y, panel.y);
    const right = Math.min(viewport.x + viewport.width, panel.x + panel.width);
    const bottom = Math.min(viewport.y + viewport.height, panel.y + panel.height);
    if (x >= right || y >= bottom) return viewport;
    const candidates = [
      { ...viewport, width: x - viewport.x },
      { ...viewport, x: right, width: viewport.x + viewport.width - right },
      { ...viewport, height: y - viewport.y },
      { ...viewport, y: bottom, height: viewport.y + viewport.height - bottom },
    ];
    return candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  }
  function refit() {
    if (!active) return;
    const object = targets.get(active); if (!object) return;
    const viewport = options.viewport(); if (!viewport.width || !viewport.height) return;
    const space = available(viewport);
    const box = new THREE.Box3().setFromObject(object), center = box.getCenter(new THREE.Vector3());
    const rotation = object.getWorldQuaternion(new THREE.Quaternion());
    const direction = active === "cd-player" || active === "sealed-letter"
      ? new THREE.Vector3(.32, 1.25, .9).applyQuaternion(rotation).normalize()
      : active === "sunset-frame" ? new THREE.Vector3(.25, .30, 1).applyQuaternion(rotation).normalize()
      : camera.position.clone().sub(controls.target).normalize();
    const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right).normalize();
    const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const horizontal = tangent * camera.aspect * Math.max(.1, (space.width - 48) / viewport.width);
    const vertical = tangent * Math.max(.1, (space.height - 48) / viewport.height);
    let distance = .5;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const corner = new THREE.Vector3(x, y, z).sub(center), depth = corner.dot(direction);
      distance = Math.max(distance, Math.abs(corner.dot(right)) / horizontal + depth, Math.abs(corner.dot(up)) / vertical + depth);
    }
    distance = Math.min(distance * 1.22, controls.maxDistance);
    move({ position: center.clone().addScaledVector(direction, distance), target: center, offset: new THREE.Vector2(
      viewport.width / 2 - (space.x - viewport.x + space.width / 2),
      viewport.height / 2 - (space.y - viewport.y + space.height / 2),
    ) });
  }
  return {
    get active() { return active; },
    get animating() { return transition !== null; },
    focus(id: RoomObjectId) {
      if (!targets.has(id)) return;
      if (!previous) {
        controls.enableDamping = false; controls.update();
        previous = { ...pose(), aspect: camera.aspect };
      }
      active = id; controls.minDistance = .35;
      options.onChange(id); refit();
    },
    clear(restore = true) {
      const original = previous;
      active = null; panel = null; panelSignature = "";
      options.onChange(null);
      if (restore && original) {
        if (camera.aspect < original.aspect) {
          const relative = original.position.clone().sub(original.target);
          relative.setLength(Math.min(limits.max, relative.length() * original.aspect / camera.aspect));
          original.position.copy(original.target).add(relative);
        }
        move(original, true);
      } else {
        previous = null;
        transition = null; offset.set(0, 0); camera.clearViewOffset(); finish(true);
      }
    },
    setPanelBounds(bounds: ViewBounds | null) {
      const viewport = options.viewport();
      const signature = JSON.stringify([bounds, viewport]);
      if (signature === panelSignature) return;
      panelSignature = signature; panel = bounds;
      if (active) refit();
    },
    resize() { if (active) refit(); },
    update(now: number) {
      if (!transition) return;
      const current = transition, progress = Math.min(1, Math.max(0, (now - current.start) / 460));
      const eased = progress === 1 ? 1 : 1 - 2 ** (-10 * progress);
      apply({ position: current.from.position.clone().lerp(current.to.position, eased), target: current.from.target.clone().lerp(current.to.target, eased), offset: current.from.offset.clone().lerp(current.to.offset, eased) });
      if (progress === 1) { transition = null; finish(current.restore); }
    },
    dispose() { transition = null; previous = null; },
  };
}
