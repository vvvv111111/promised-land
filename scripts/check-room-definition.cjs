const assert = require('node:assert/strict');
const path = require('node:path');
require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
  'src/room/definition.ts', '--ignoreConfig', '--outDir', '.room-qa/definition-state', '--module', 'node16',
  '--target', 'es2022', '--moduleResolution', 'node16', '--resolveJsonModule', '--esModuleInterop', '--skipLibCheck'], { stdio: 'inherit' });
const { defaultRoom, validateRoomDefinition } = require('../.room-qa/definition-state/definition.js');
const clone = () => JSON.parse(JSON.stringify(defaultRoom));
validateRoomDefinition(clone());
const alternate = clone();
alternate.dimensions = [7, 3.2, 5];
alternate.nodes.find(n => n.id === 'table').position = [-1, 0, .7];
alternate.nodes.find(n => n.id === 'pet').position = [2, .07, 1.5];
alternate.materials.sofaFabric.texture.color = '#859088';
alternate.nodes.reverse(); // Parent references need not precede children.
validateRoomDefinition(alternate);
assert.deepEqual(JSON.parse(JSON.stringify(alternate)), alternate, 'Room plan survives JSON round-trip');
for (const change of [
  r => r.version = 2,
  r => r.seed = .5,
  r => r.dimensions = [6, 0, 5],
  r => r.nodes[1].position[0] = NaN,
  r => r.nodes[1].scale = [1, -1, 1],
  r => r.nodes[1].id = r.nodes[0].id,
  r => r.nodes[1].model = 'execute-script',
  r => r.nodes[1].parent = 'missing',
  r => { r.nodes[1].parent = 'table'; r.nodes.find(n => n.id === 'table').parent = r.nodes[1].id; },
  r => r.nodes.find(n => n.id === 'cd').interaction = 'sunset-frame',
  r => r.nodes.find(n => n.id === 'frame').surface = 'missing',
  r => delete r.nodes.find(n => n.id === 'cd').surface,
  r => r.nodes = r.nodes.filter(n => n.id !== 'envelope'),
  r => r.nodes.find(n => n.id === 'table').surfaces[0].id = 'not-a-real-surface',
  r => r.nodes.find(n => n.id === 'table').surfaces[0].size = [-1, 1],
  r => r.nodes.find(n => n.id === 'cd').position = [5, .648, 5],
  r => r.materials.wood.texture.kind = 'remote-url',
  r => r.materials.wood.color = 'url(https://example.com)',
  r => r.camera.direction = [0, 0, 0],
  r => r.camera.maxDistance = 2,
  r => r.lighting.sun.intensity = Infinity,
]) {
  const invalid = clone(); change(invalid);
  assert.throws(() => validateRoomDefinition(invalid), /Invalid room definition/);
}
console.log('PASS: serializable room plan, alternative layout, parent order, invalid transforms/materials, missing gift bindings/supports, parent cycles, lighting/camera limits');
