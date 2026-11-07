const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  'src/world/config.ts', 'src/world/RoomSession.ts', 'src/world/RoomLayout.ts', '--ignoreConfig', '--outDir', '.room-qa/state',
  '--module', 'node16', '--target', 'es2020', '--moduleResolution', 'node16', '--esModuleInterop',
  '--resolveJsonModule', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
const { demoWorld: world, assetManifest, validateWorldConfig } = require('../.room-qa/state/config.js');
const { RoomSession } = require('../.room-qa/state/RoomSession.js');
const session = new RoomSession();
for (const object of world.objects) {
  const target = { id: object.object_id, kind: 'object', interaction: object.interaction };
  for (let i = 0; i < 4; i++) {
    const result = session.interact(target);
    assert.equal(result.selected.id, object.object_id);
    assert.equal(result.message, `正在查看：${object.interaction.title}`);
    assert.equal('collected_ids' in result, false);
  }
}
for (const modify of [
  w => { w.objects[0].position_x = 2; },
  w => { w.objects[0].size.width = 0; },
  w => { w.objects[0].asset_id = 'missing'; },
  w => { w.objects[1].object_id = w.objects[0].object_id; },
  w => { w.hotspots[0].width = 1; },
]) {
  const config = structuredClone(world); modify(config);
  assert.throws(() => validateWorldConfig(config, assetManifest));
}
for (const a of assetManifest.assets) assert.ok(fs.existsSync(require('node:path').join(__dirname, '../public', a.path)), a.path);
console.log('PASS: repeatable interactions, no collection state, JSON validation, asset paths');
const { RoomLayout } = require('../.room-qa/state/RoomLayout.js');
const records = new Map();
const layoutStorage = { getItem: k => records.get(k) ?? null, setItem: (k, v) => records.set(k, v) };
const layout = new RoomLayout(world, layoutStorage);
const cat = world.objects.find(o => o.type === 'pet');
layout.move(cat.object_id, { x: 0.6, y: 0.8 });
assert.deepEqual(new RoomLayout(world, layoutStorage).positions()[cat.object_id], { x: 0.6, y: 0.8 });
const changedWorld = structuredClone(world); changedWorld.objects.find(o => o.object_id === cat.object_id).position_x += 0.1;
assert.deepEqual(new RoomLayout(changedWorld, layoutStorage).positions(), {});
layout.move(cat.object_id, { x: NaN, y: 9 });
assert.deepEqual(layout.positions()[cat.object_id], { x: 0.6, y: 0.8 });
layout.reset(); assert.deepEqual(new RoomLayout(world, layoutStorage).positions(), {});
console.log('PASS: placement persistence, changed JSON defaults win, invalid positions rejected, reset');
