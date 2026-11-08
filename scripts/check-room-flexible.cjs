const assert = require('node:assert/strict');
const path = require('node:path');
require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
  'src/room/agent/persistence.ts', 'src/room/agent/examples.ts', 'src/room/agent/fitReference.ts', '--rootDir', 'src', '--ignoreConfig', '--outDir', '.room-qa/agent-state', '--module', 'node16',
  '--target', 'es2022', '--moduleResolution', 'node16', '--types', 'node', '--resolveJsonModule', '--esModuleInterop', '--skipLibCheck'], { stdio: 'inherit' });
const { roomFromDesign } = require('../.room-qa/agent-state/room/agent/design.js');
const examples = require('../.room-qa/agent-state/room/agent/examples.js');
const { selectedRoom } = require('../.room-qa/agent-state/room/agent/persistence.js');
const { validateRoomDefinition, defaultRoom } = require('../.room-qa/agent-state/room/definition.js');
const { windowRects } = require('../.room-qa/agent-state/room/wallMount.js');
const { fitReferenceDesign } = require('../.room-qa/agent-state/room/agent/fitReference.js');
const baseline = JSON.stringify(defaultRoom);
for (const make of Object.values(examples)) {
  const source = make(), before = structuredClone(source), result = roomFromDesign(source);
  assert.deepEqual(source, before, 'Compiling never mutates a design');
  validateRoomDefinition(result.definition);
  assert.deepEqual(roomFromDesign(JSON.parse(JSON.stringify(result.design))), result, 'Normalized designs survive export/reload');
  assert.deepEqual(selectedRoom({ getItem: () => JSON.stringify(result) }), result.definition, 'Gift creation can adopt a new design');
  assert.equal(result.definition.nodes.filter(n => n.interaction).length, 4);
  assert.ok(!result.definition.nodes.some(n => ['pet', 'slippers', 'clock', 'window-plant'].includes(n.id)), 'Unrequested template decorations are omitted');
}
const dining = roomFromDesign(examples.diningRoomDesign());
assert.equal(dining.definition.nodes.filter(n => n.model === 'chair').length, 4);
assert.deepEqual(dining.definition.dimensions, [6.5, 3, 5]);
const study = roomFromDesign(examples.studyRoomDesign());
assert.equal(study.definition.nodes.filter(n => n.model === 'desk').length, 2);
assert.notEqual(study.definition.nodes.find(n => n.id === 'desk-left').colors.wood, study.definition.nodes.find(n => n.id === 'desk-right').colors.wood);
const twin = examples.flexibleBedroomDesign();
twin.dimensions = [6, 2.4, 4.8]; twin.architecture.windows = [];
twin.furniture = [
  ...[-1.3, 1.3].map((x, i) => ({ id: `single-bed-${i}`, type: 'bed', size: [1.05, 1, 2.1], x, z: -.8, rotation: 0 })),
  ...[-2.4, 2.4].map((x, i) => ({ id: `bedside-${i}`, type: 'nightstand', x, z: -1.5, rotation: 0 })),
  { id: 'work-desk', type: 'desk', size: [1.5, .76, .65], x: 0, z: 1.4, rotation: 0 },
  { id: 'work-chair', type: 'chair', x: 0, z: .4, rotation: 0 },
];
assert.equal(roomFromDesign(twin).definition.nodes.filter(n => n.model === 'bed').length, 2);
// A small room and a large room share actual metre coordinates for openings and supports.
for (const dimensions of [[3, 2.4, 3], [12, 5, 12]]) {
  const design = examples.studyRoomDesign(); design.dimensions = dimensions;
  design.furniture = [{ id: 'desk-a', type: 'desk', size: [1.2, .75, .65], x: 0, z: -.9, rotation: 0 }];
  design.architecture.windows = [{ wall: 'left', offset: 0, width: .8, bottom: 1.1, height: .9 }];
  const result = roomFromDesign(design);
  assert.deepEqual(result.definition.dimensions, dimensions);
  const rect = windowRects(result.definition, 'left')[0];
  assert.equal(rect.min, -.52); assert.equal(rect.max, .52);
  assert.ok(Math.abs(rect.bottom - .98) < 1e-9); assert.ok(Math.abs(rect.top - 2.12) < 1e-9);
  assert.ok(result.definition.nodes.filter(n => n.surface).every(n => n.parent === 'desk-a'));
}
// Parallel diagonal bookshelves have overlapping AABBs, yet their real footprints are separated.
const diagonal = examples.studyRoomDesign(); diagonal.architecture.windows = [];
diagonal.furniture = [
  { id: 'desk-a', type: 'desk', x: -2.2, z: -2, rotation: 0 },
  { id: 'shelf-a', type: 'bookshelf', size: [2, 1.5, .3], x: -.3, z: -.3, rotation: Math.PI / 4 },
  { id: 'shelf-b', type: 'bookshelf', size: [2, 1.5, .3], x: .3, z: .3, rotation: Math.PI / 4 },
];
roomFromDesign(diagonal);
const overlap = structuredClone(diagonal); overlap.furniture[2].x = -.2; overlap.furniture[2].z = -.2;
assert.throws(() => roomFromDesign(overlap), /overlaps/);
const wallError = examples.diningRoomDesign();
wallError.furniture.find(n => n.type === 'cabinet').z = -2.2;
const wallBefore = structuredClone(wallError), adjusted = fitReferenceDesign(wallError), inset = roomFromDesign(adjusted.input);
assert.equal(adjusted.corrections, 1);
assert.ok(inset.design.furniture.find(n => n.type === 'cabinet').z > -2.2, 'Small wall arithmetic errors are corrected locally');
assert.deepEqual(wallError, wallBefore, 'Wall repair does not mutate the input');
assert.equal(inset.design.furniture.length, wallError.furniture.length, 'Repair preserves requested furniture');
for (const change of [
  d => d.version = 99,
  d => d.dimensions = [2, 3, 5],
  d => d.dimensions = [6, Infinity, 5],
  d => d.furniture[0].id = 'shell',
  d => d.furniture[1].id = d.furniture[0].id,
  d => d.furniture[0].type = 'stove',
  d => d.furniture[0].size = [9, .75, .8],
  d => d.furniture[0].colors = { unknown: '#ffffff' },
  d => d.furniture[0].colors = { sofaFabric: '#b0664a' },
  d => d.furniture[0].colors = { wood: 'url(https://example.com)' },
  d => d.furniture[0].x = 3.4,
  d => d.furniture = Array.from({ length: 33 }, (_, i) => ({ ...d.furniture[0], id: `desk-${i}` })),
  d => d.architecture.windows[0].offset = 3.4,
  d => d.architecture.windows[0].height = 3,
]) { const design = examples.studyRoomDesign(); change(design); assert.throws(() => roomFromDesign(design)); }
const undersized = examples.studyRoomDesign();
undersized.furniture = [{ id: 'tiny', type: 'nightstand', size: [.4, .4, .35], x: 0, z: 0, rotation: 0 }];
assert.throws(() => roomFromDesign(undersized), /tabletop space/);
const badMetadata = structuredClone(dining.definition); badMetadata.nodes.find(n => n.model === 'dining-table').surfaces[0].size[0] = 20;
assert.throws(() => validateRoomDefinition(badMetadata), /metadata/);
assert.equal(JSON.stringify(defaultRoom), baseline);
console.log('PASS: flexible room examples, repeated furniture, single beds, per-instance colors, 3–12m rooms, metric windows, support packing, oriented collisions, persistence, invalid inputs and immutable defaults');
