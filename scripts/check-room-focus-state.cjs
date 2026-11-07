const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const THREE = await import('three');
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
  const output = path.resolve('.room-qa/focus-state'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(output, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { noEmit: false, incremental: false, outDir: '.', rootDir: '../../src' }, include: ['../../src/room/rendering/objectFocus.ts'] }));
  require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '--project', path.join(output, 'tsconfig.json')], { stdio: 'inherit' });
  const { createObjectFocus } = await import(pathToFileURL(path.join(output, 'room/rendering/objectFocus.js')));
  let viewport = { x: 40, y: 80, width: 1360, height: 720 }, reduced = true;
  const camera = new THREE.PerspectiveCamera(35, viewport.width / viewport.height, .1, 80);
  const controls = new OrbitControls(camera, null);
  controls.minDistance = 7; controls.maxDistance = 24;
  controls.target.set(0, 1, 0);
  camera.position.copy(new THREE.Vector3(.84, .72, 1.15).normalize().multiplyScalar(12)).add(controls.target); controls.update();
  const original = { position: camera.position.clone(), target: controls.target.clone() };
  const cd = new THREE.Group(), frame = new THREE.Group();
  cd.position.set(-.25, .74, .17); cd.rotation.y = -.09;
  cd.add(new THREE.Mesh(new THREE.BoxGeometry(.64, .10, .40)));
  frame.position.set(1.27, 1.43, -1.96); frame.add(new THREE.Mesh(new THREE.BoxGeometry(.76, .61, .08)));
  cd.updateMatrix(); const before = cd.matrix.clone();
  const events = [];
  const focus = createObjectFocus(camera, controls, new Map([['cd-player', cd], ['sunset-frame', frame]]), { viewport: () => viewport, invalidate() {}, onChange: id => events.push(id), reducedMotion: () => reduced });
  function visible(object, region) {
    camera.updateMatrixWorld();
    const bounds = new THREE.Box3().setFromObject(object);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      const point = new THREE.Vector3(x, y, z).project(camera);
      const px = viewport.x + (point.x + 1) / 2 * viewport.width, py = viewport.y + (1 - point.y) / 2 * viewport.height;
      assert.ok(px >= region.x && px <= region.x + region.width && py >= region.y && py <= region.y + region.height, 'All model corners fit outside the actual content panel');
    }
  }
  focus.focus('cd-player');
  assert.ok(controls.getDistance() < 3, 'Small CD player gets a real camera close-up');
  focus.setPanelBounds({ x: 1016, y: 32, width: 400, height: 550 });
  visible(cd, { x: 40, y: 80, width: 976, height: 720 });
  focus.focus('sunset-frame'); visible(frame, { x: 40, y: 80, width: 976, height: 720 });
  focus.clear();
  assert.ok(camera.position.distanceTo(original.position) < 1e-9 && controls.target.distanceTo(original.target) < 1e-9);
  assert.equal(camera.view.enabled, false); assert.equal(controls.minDistance, 7);
  assert.deepEqual(cd.matrix.elements, before.elements, 'Camera inspection never moves the model');

  viewport = { x: 16, y: 80, width: 358, height: 548 };
  camera.aspect = viewport.width / viewport.height; camera.updateProjectionMatrix();
  focus.focus('cd-player'); focus.setPanelBounds({ x: 16, y: 440, width: 358, height: 388 });
  visible(cd, { x: 16, y: 80, width: 358, height: 360 });
  focus.setPanelBounds({ x: 16, y: 520, width: 358, height: 308 });
  visible(cd, { x: 16, y: 80, width: 358, height: 440 });
  focus.clear();

  reduced = false;
  const baseline = camera.position.clone();
  focus.focus('cd-player'); assert.equal(focus.animating, true);
  focus.update(performance.now() + 200);
  focus.clear(); focus.update(performance.now() + 100);
  focus.focus('sunset-frame'); focus.update(performance.now() + 500);
  focus.clear(); focus.update(performance.now() + 500);
  assert.ok(camera.position.distanceTo(baseline) < 1e-9, 'Interrupted return and rapid switching preserve the original room camera');
  assert.equal(focus.animating, false); assert.equal(controls.enabled, true); assert.equal(controls.minDistance, 7);
  focus.dispose(); // No DOM was connected to the controls in this pure camera test.
  console.log('PASS: true camera close-up, desktop panel/mobile sheet framing, dynamic panel resize, original camera restore, fixed models, reduced motion, interrupted transition and rapid switching');
})().catch(error => { console.error(error); process.exitCode = 1; });
