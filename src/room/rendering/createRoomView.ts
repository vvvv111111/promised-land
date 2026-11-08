import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildRoom, type RoomObjectId } from "../buildRoom";
import type { PhotoFrameContent } from "@/world/types";
import { createObjectFocus, type ViewBounds } from "./objectFocus";
import { defaultRoom, validateRoomDefinition } from "../definition";
import type { RoomDefinition } from "../types";

export interface RoomView {
  setPhoto: (content: PhotoFrameContent) => void;
  reset: () => void;
  zoom: (factor: number) => void;
  activate: (id: RoomObjectId) => void;
  setAudioPlaying: (playing: boolean) => void;
  clearFocus: () => void;
  setPanelBounds: (bounds: ViewBounds | null) => void;
  dispose: () => void;
}

export function createRoomView(container: HTMLElement, options: {
  definition?: RoomDefinition;
  photo?: PhotoFrameContent;
  onReady: () => void;
  onOpen: (id: "sunset-frame" | "sealed-letter") => void;
  onAudioRequest: () => void;
  onError: (message?: string) => void;
  onFocusChange: (id: RoomObjectId | null) => void;
}): RoomView {
  const definition = options.definition ?? defaultRoom;
  validateRoomDefinition(definition);
  const { lighting, camera: cameraPlan } = definition;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setClearColor(lighting.background);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = lighting.exposure;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0; canvas.setAttribute("aria-label", "3D 房间，可用方向键旋转，加减键缩放");
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cameraPlan.fov, 1, .1, 80);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(...cameraPlan.target);
  controls.enablePan = false;
  controls.enableDamping = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.dampingFactor = .12;
  controls.minDistance = cameraPlan.minDistance;
  controls.maxDistance = cameraPlan.maxDistance;
  controls.minPolarAngle = .45;
  controls.maxPolarAngle = 1.34;
  controls.minAzimuthAngle = .02;
  controls.maxAzimuthAngle = 1.48;
  controls.rotateSpeed = .65;
  controls.zoomSpeed = .75;

  let disposed = false, frame = 0, hasSize = false, rendered = false;
  const environment = new RoomEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentMap = pmrem.fromScene(environment, .04);
  scene.environment = environmentMap.texture;
  scene.environmentIntensity = lighting.environment;
  environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(lighting.sky, lighting.ground, lighting.ambient));
  const sun = new THREE.DirectionalLight(lighting.sun.color, lighting.sun.intensity);
  sun.position.set(...lighting.sun.position); sun.target.position.set(...lighting.sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const shadowSpan = Math.max(5, definition.dimensions[0] * .85, definition.dimensions[2] * .85);
  Object.assign(sun.shadow.camera, { left: -shadowSpan, right: shadowSpan, top: shadowSpan, bottom: -shadowSpan, near: .1, far: Math.max(18, sun.position.length() + Math.hypot(...definition.dimensions) + 4) });
  sun.shadow.normalBias = .025; sun.shadow.bias = -.00015;
  scene.add(sun, sun.target);
  const model = buildRoom(requestRender, definition); scene.add(model.room);
  let modelsReady = false;
  void model.ready.then(() => { if (!disposed) { modelsReady = true; requestRender(); } }).catch(error => { if (!disposed) options.onError(error instanceof Error ? error.message : undefined); });
  const focus = createObjectFocus(camera, controls, model.targets, {
    viewport: () => { const { x, y, width, height } = canvas.getBoundingClientRect(); return { x, y, width, height }; },
    invalidate: requestRender, onChange: options.onFocusChange,
    reducedMotion: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  });
  if (options.photo) model.setPhoto(options.photo);

  function requestRender() {
    if (disposed || frame || document.hidden || !hasSize) return;
    frame = requestAnimationFrame(now => {
      frame = 0;
      if (disposed) return;
      focus.update(now); controls.update(); renderer.render(scene, camera);
      if (focus.animating) requestRender();
      if (!rendered && modelsReady) { rendered = true; options.onReady(); }
    });
  }
  function reset() {
    focus.clear(false);
    const damping = controls.enableDamping;
    controls.enableDamping = false; controls.update();
    controls.target.set(...cameraPlan.target);
    const distance = Math.max(cameraPlan.defaultDistance, cameraPlan.fitWidth / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
    camera.position.copy(new THREE.Vector3(...cameraPlan.direction).normalize().multiplyScalar(Math.min(distance, cameraPlan.maxFitDistance))).add(controls.target);
    controls.update(); controls.enableDamping = damping; requestRender();
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const first = !hasSize, oldAspect = camera.aspect;
    camera.aspect = width / height; camera.updateProjectionMatrix();
    renderer.setSize(width, height, false); hasSize = true;
    if (focus.active) focus.resize();
    else if (first || Math.abs(oldAspect - camera.aspect) > .3) reset();
    requestRender();
  }
  const observer = new ResizeObserver(resize); observer.observe(container);
  controls.addEventListener("change", requestRender);
  const onVisibility = () => { if (!document.hidden) requestRender(); };
  document.addEventListener("visibilitychange", onVisibility);

  function activate(id: RoomObjectId) {
    if (id === "lamp") { model.toggleLamp(); requestRender(); return; }
    focus.focus(id);
    if (id === "cd-player") options.onAudioRequest();
    else options.onOpen(id);
  }
  const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
  function hit(x: number, y: number): RoomObjectId | undefined {
    const rect = canvas.getBoundingClientRect();
    pointer.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObject(model.room, true);
    // Respect real occlusion. An object behind a cabinet or wall is not clickable.
    let object: THREE.Object3D | null = intersections[0]?.object ?? null;
    while (object) {
      for (const [id, target] of model.targets) if (target === object) return id;
      object = object.parent;
    }
  }
  const pointers = new Map<number, { x: number; y: number }>();
  let gesturing = false;
  const down = (e: PointerEvent) => {
    if (!pointers.size) gesturing = false;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) gesturing = true;
  };
  const move = (e: PointerEvent) => {
    const start = pointers.get(e.pointerId);
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) gesturing = true;
    canvas.style.cursor = pointers.size ? "grabbing" : hit(e.clientX, e.clientY) ? "pointer" : "grab";
  };
  const up = (e: PointerEvent) => {
    const start = pointers.get(e.pointerId);
    if (e.button === 0 && start && !gesturing && pointers.size === 1 && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) {
      const id = hit(e.clientX, e.clientY); if (id) activate(id);
    }
    pointers.delete(e.pointerId); canvas.style.cursor = "grab";
  };
  const cancel = (e: PointerEvent) => { gesturing = true; pointers.delete(e.pointerId); };
  const zoom = (factor: number) => {
    const offset = camera.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
    camera.position.copy(controls.target).add(offset); controls.update(); requestRender();
  };
  const keydown = (e: KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") { e.preventDefault(); zoom(.9); }
    else if (e.key === "-") { e.preventDefault(); zoom(1.1); }
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      e.preventDefault();
      const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      spherical.theta = THREE.MathUtils.clamp(spherical.theta + (e.key === "ArrowLeft" ? -.12 : e.key === "ArrowRight" ? .12 : 0), controls.minAzimuthAngle, controls.maxAzimuthAngle);
      spherical.phi = THREE.MathUtils.clamp(spherical.phi + (e.key === "ArrowUp" ? -.1 : e.key === "ArrowDown" ? .1 : 0), controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(new THREE.Vector3().setFromSpherical(spherical)).add(controls.target); controls.update(); requestRender();
    } else if (e.key === "Home") { e.preventDefault(); reset(); }
  };
  const contextLost = (e: Event) => { e.preventDefault(); if (!disposed) options.onError(); };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("keydown", keydown);
  canvas.addEventListener("webglcontextlost", contextLost);
  resize();

  return {
    reset, zoom, activate, setAudioPlaying: model.setAudioPlaying, setPhoto: content => { model.setPhoto(content); requestRender(); },
    clearFocus: () => focus.clear(), setPanelBounds: focus.setPanelBounds,
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility);
      controls.removeEventListener("change", requestRender); controls.dispose();
      canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("keydown", keydown); canvas.removeEventListener("webglcontextlost", contextLost);
      focus.dispose(); model.dispose(); environmentMap.dispose(); sun.shadow.map?.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
