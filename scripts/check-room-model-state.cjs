const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const THREE = await import('three');
  const output = path.resolve('.room-qa/model-state'); fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  fs.writeFileSync(path.join(output, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', compilerOptions: { noEmit: false, incremental: false, outDir: '.', rootDir: '../../src' }, include: ['../../src/room/buildRoom.ts', '../../src/room/agent/design.ts'] }));
  require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'), '--project', path.join(output, 'tsconfig.json')], { stdio: 'inherit' });
  // Match browser/bundler module resolution in Node without a runtime loader.
  function resolveImports(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) resolveImports(file);
      else if (file.endsWith('.js')) {
        let source = fs.readFileSync(file, 'utf8');
        source = source.replace(/import (\w+) from "(\.\.?\/[^"\n]+\.json)";/g, (_, name, relative) => `const ${name} = ${fs.readFileSync(path.resolve(path.dirname(file), relative), 'utf8')};`);
        source = source.replace(/from "(\.\.?\/[^"\n]+)"/g, (_, relative) => `from "${relative.endsWith('.js') ? relative : relative + '.js'}"`);
        fs.writeFileSync(file, source);
      }
    }
  }
  resolveImports(path.join(output, 'room'));
  let canvases = 0, changes = 0, lastImage;
  global.document = { createElement() { canvases++; return { width: 0, height: 0, getContext: () => ({ fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, drawImage() {} }) }; } };
  global.Image = class { constructor() { lastImage = this; } width = 100; height = 100; };
  const { buildRoom } = await import(pathToFileURL(path.join(output, 'room/buildRoom.js')));
  const data = require('../src/room/default-room.json');
  const plan = structuredClone(data);
  plan.nodes.find(n => n.id === 'table').position = [-1, 0, .7];
  plan.nodes.find(n => n.id === 'pet').position = [2, .07, 1.5];
  const before = structuredClone(plan);
  const model = buildRoom(() => changes++, plan);
  model.room.updateMatrixWorld(true);
  const table = model.room.getObjectByName('table'), cd = model.targets.get('cd-player');
  assert.ok(table && cd && cd.parent === table);
  const expected = new THREE.Vector3(.38, .648, -.18).applyMatrix4(table.matrixWorld);
  assert.ok(cd.getWorldPosition(new THREE.Vector3()).distanceTo(expected) < 1e-9, 'CD follows its configured support parent');
  const photo = model.targets.get('sunset-frame');
  assert.equal(photo.parent, model.room, 'A wall photo is independent of the table');
  const photoBounds = new THREE.Box3().setFromObject(photo);
  assert.ok(Math.abs(photoBounds.min.z - (-2.36 + .001)) < .0001, 'Real frame back contacts the wall with a 1mm offset');
  assert.ok(photoBounds.getSize(new THREE.Vector3()).z < .1, 'Wall frame has no easel leg sticking through the wall');
  assert.deepEqual(model.room.getObjectByName('pet').position.toArray(), [2, .07, 1.5]);
  assert.equal(model.targets.size, 4);
  assert.deepEqual(plan, before, 'Assembly never mutates the serializable plan');
  assert.equal(model.toggleLamp(), true); assert.equal(model.toggleLamp(), false);
  model.setAudioPlaying(true); assert.equal(changes, 1);
  model.setPhoto({ kind: 'photo_frame', photo: 'data:image/png;base64,AA==', zoom: 1, position_x: .5, position_y: .5 });
  const resources = new Map();
  function watch(resource) {
    if (!resource || resources.has(resource)) return;
    resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1));
  }
  model.room.traverse(object => {
    if (!object.isMesh) return;
    watch(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) { watch(material); watch(material.map); }
  });
  model.dispose(); model.dispose();
  lastImage.onload(); assert.equal(changes, 1, 'Late photo decoding cannot redraw a disposed room');
  assert.ok(resources.size > 300); assert.ok([...resources.values()].every(count => count === 1), 'Shared GPU resources are released once');
  const invalid = structuredClone(data); invalid.nodes[1].model = 'unknown';
  const count = canvases;
  assert.throws(() => buildRoom(() => {}, invalid), /Invalid room definition/);
  assert.equal(canvases, count, 'Invalid plans fail before allocating textures');
  const { roomFromDesign, bedroomRoomDesign } = await import(pathToFileURL(path.join(output, 'room/agent/design.js')));
  const bedroom = roomFromDesign(bedroomRoomDesign()).definition;
  const bedroomModel = buildRoom(() => {}, bedroom); bedroomModel.room.updateMatrixWorld(true);
  for (const id of ['bed', 'desk', 'chair', 'nightstand']) {
    const root = bedroomModel.room.getObjectByName(id);
    assert.ok(root && root.children.length > 0, `Real geometry exists for ${id}`);
  }
  assert.equal(bedroomModel.targets.size, 4);
  assert.equal(bedroomModel.targets.get('cd-player').parent.name, 'desk');
  const ray = new THREE.Raycaster();
  for (const w of bedroom.architecture.windows) {
    const wall = bedroomModel.room.getObjectByName('wall-' + w.wall);
    assert.equal(wall.children.filter(n => n.name.startsWith('window-')).length, 1);
    const panels = wall.children.filter(n => n.name === 'wall-panel');
    const origin = w.wall === 'left' ? new THREE.Vector3(0, w.bottom + w.height * .3, w.offset + w.width * .2) : new THREE.Vector3(w.offset + w.width * .2, w.bottom + w.height * .3, 0);
    ray.set(origin, w.wall === 'left' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1));
    assert.equal(ray.intersectObjects(panels).length, 0, 'Window opening contains no wall triangles');
    ray.set(w.wall === 'left' ? new THREE.Vector3(0, .3, w.offset) : new THREE.Vector3(w.offset, .3, 0), w.wall === 'left' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1));
    assert.ok(ray.intersectObjects(panels).length > 0, 'Wall below window remains solid');
  }
  const bedroomResources = new Map();
  bedroomModel.room.traverse(n => {
    if (!n.isMesh) return;
    for (const resource of [n.geometry, ...(Array.isArray(n.material) ? n.material : [n.material])]) {
      if (bedroomResources.has(resource)) continue;
      bedroomResources.set(resource, 0); resource.addEventListener('dispose', () => bedroomResources.set(resource, bedroomResources.get(resource) + 1));
    }
  });
  bedroomModel.dispose(); bedroomModel.dispose();
  assert.ok([...bedroomResources.values()].every(count => count === 1), 'Bedroom and custom window GPU resources are released once');
  for (const id of ['bookshelf', 'wardrobe']) {
    const withStorage = bedroomRoomDesign(); withStorage.furniture.push({ id, x: 2.4, z: .65, rotation: Math.PI / 2 });
    const extra = buildRoom(() => {}, roomFromDesign(withStorage).definition);
    assert.ok(extra.room.getObjectByName(id).children.length > 5, `Real geometry exists for ${id}`); extra.dispose();
  }
  console.log('PASS: data-driven table/pet transforms, child support inheritance, interaction bindings, immutable input, lamp/audio behaviors, late photo cancellation and GPU cleanup');
  console.log('PASS: bedroom furniture geometry, desk-supported keepsakes, real window wall openings and GPU cleanup');
})().catch(e => { console.error(e); process.exitCode = 1; });
