const assert = require('node:assert/strict');
const path = require('node:path');
require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
  'src/room/agent/generatedExample.ts', 'src/room/agent/persistence.ts', 'src/room/agent/fitReference.ts', '--rootDir', 'src', '--ignoreConfig', '--outDir', '.room-qa/generated-state', '--module', 'node16',
  '--target', 'es2022', '--moduleResolution', 'node16', '--types', 'node', '--resolveJsonModule', '--esModuleInterop', '--skipLibCheck'], { stdio: 'inherit' });
const { generatedRoomDesign } = require('../.room-qa/generated-state/room/agent/generatedExample.js');
const { roomFromDesign } = require('../.room-qa/generated-state/room/agent/design.js');
const { validateRoomDefinition } = require('../.room-qa/generated-state/room/definition.js');
const { nodeWorldBounds, nodeWorldBoxes, boxesIntersect } = require('../.room-qa/generated-state/room/spatial.js');
const { parseGeneratedAsset } = require('../.room-qa/generated-state/room/generated.js');
const { selectedRoom } = require('../.room-qa/generated-state/room/agent/persistence.js');
const { fitReferenceDesign } = require('../.room-qa/generated-state/room/agent/fitReference.js');
const source = generatedRoomDesign(), before = structuredClone(source), result = roomFromDesign(source);
assert.deepEqual(source, before);
validateRoomDefinition(result.definition);
assert.equal(result.definition.nodes.filter(n => n.model === 'generated').length, 4);
assert.deepEqual(roomFromDesign(JSON.parse(JSON.stringify(result.design))), result, 'Geometry recipes persist without a provider call');
assert.deepEqual(selectedRoom({ getItem: () => JSON.stringify(result) }), result.definition);
const node = id => result.definition.nodes.find(n => n.id === id);
assert.equal(node('upper-bed').parent, 'loft');
assert.equal(node('upper-bed').surface, 'deck');
assert.ok(Math.abs(nodeWorldBounds(result.definition, node('upper-bed')).min[1] - 2.205) < 1e-8);
assert.equal(nodeWorldBounds(result.definition, node('lower-sofa')).min[1], 0);
assert.ok(nodeWorldBounds(result.definition, node('loft')).max[1] > 3);
assert.ok(!nodeWorldBoxes(result.definition, node('loft')).some(a => nodeWorldBoxes(result.definition, node('lower-sofa')).some(b => boxesIntersect(a, b))), 'Platform underside remains usable but real posts are solid');
assert.equal(node('tv').parent, 'tv-cabinet');
assert.equal(node('vase').parent, 'main-table');
const shelfTop = generatedRoomDesign();
shelfTop.furniture.push({ id: 'flower-shelf', type: 'bookshelf', size: [.9, 1.5, .5], x: -2.6, z: 1.8, rotation: 0 });
shelfTop.furniture.find(n => n.id === 'vase').parent = 'flower-shelf';
shelfTop.furniture.find(n => n.id === 'vase').x = 0;
shelfTop.furniture.find(n => n.id === 'vase').z = 0;
const shelfResult = roomFromDesign(shelfTop);
const shelfVase = shelfResult.definition.nodes.find(n => n.id === 'vase');
assert.ok(Math.abs(nodeWorldBounds(shelfResult.definition, shelfVase).min[1] - 1.505) < 1e-8, 'Real bookshelf top boards can support reference-photo props');
assert.ok(Math.abs(nodeWorldBounds(result.definition, node('tv')).min[1] - .805) < 1e-8);
const narrowTv = generatedRoomDesign(); narrowTv.furniture.find(n => n.id === 'tv-cabinet').size[0] = .8;
roomFromDesign(narrowTv); // Screen may extend beyond cabinet; its real stand must fit.
const edgeVase = generatedRoomDesign(); edgeVase.furniture.find(n => n.id === 'vase').x = .9;
const adjustedVase = roomFromDesign(edgeVase);
assert.ok(adjustedVase.design.furniture.find(n => n.id === 'vase').x < .9, 'Small contact-base overhang is fitted on the same support');
assert.equal(edgeVase.furniture.find(n => n.id === 'vase').x, .9, 'Support fitting preserves raw model input');
const farVase = generatedRoomDesign(); farVase.furniture.find(n => n.id === 'vase').x = 1.5;
assert.throws(() => roomFromDesign(farVase), /overhangs/, 'Large support errors still reject instead of relocating props arbitrarily');
assert.ok(['cd', 'lamp', 'envelope'].every(id => node(id).parent !== 'loft'), 'Gift objects prefer accessible low surfaces');
// A child cannot intersect a platform railing just because it shares a support parent.
const rail = generatedRoomDesign(); rail.furniture.find(n => n.id === 'upper-bed').z = .04;
assert.throws(() => roomFromDesign(rail), /overhangs|overlaps/);
// Props occupy their real footprint, including when the support itself is rotated.
const overlap = structuredClone(result.definition);
const vase = overlap.nodes.find(n => n.id === 'vase'), cd = overlap.nodes.find(n => n.id === 'cd');
vase.parent = cd.parent; vase.surface = cd.surface; vase.position = [cd.position[0], .555, cd.position[2]];
assert.throws(() => validateRoomDefinition(overlap), /overlaps/);
const floating = structuredClone(result.definition); floating.nodes.find(n => n.id === 'tv').position[1] += .2;
assert.throws(() => validateRoomDefinition(floating), /floats|penetrates/);
const mounted = generatedRoomDesign();
mounted.assets['curtain-test'] = { label: '挂墙帘杆与布帘', parts: [
  { shape: 'box', size: [1.9, .04, .06], position: [0, .93, 0], color: '#b79269' },
  ...[-.7, .7].map(x => ({ shape: 'box', size: [.3, .9, .03], position: [x, .45, .03], color: '#dfd7c6' })),
] };
mounted.furniture.push({ id: 'wall-curtain', type: 'custom', asset: 'curtain-test', x: 0, z: 0, rotation: 0, mount: { wall: 'back', offset: -2.5, bottom: 2.2 } });
const mountedPlan = roomFromDesign(mounted).definition;
const curtain = mountedPlan.nodes.find(n => n.id === 'wall-curtain');
assert.ok(Math.abs(nodeWorldBounds(mountedPlan, curtain).min[1] - 2.2) < 1e-8, 'Hanging objects retain explicit architectural elevation');
const detached = structuredClone(mountedPlan); detached.nodes.find(n => n.id === 'wall-curtain').position[2] += .2;
assert.throws(() => validateRoomDefinition(detached), /wall mount/);
const blockedMount = structuredClone(mounted);
blockedMount.furniture.push({ id: 'blocking-shelf', type: 'bookshelf', size: [.7, 2.6, .5], x: -3, z: -2.7, rotation: 0 });
assert.throws(() => roomFromDesign(blockedMount), /overlaps/, 'Wall-mounted generated geometry still collides with furniture');
const hole = generatedRoomDesign();
hole.architecture.windows.push({ wall: 'left', offset: 1.7, width: 1, bottom: 1, height: 1.5 });
hole.assets.plate = { label: 'wall plate', parts: [{ shape: 'box', size: [.3, .3, .03], position: [0, .15, 0], color: '#ffffff' }] };
hole.furniture.push({ id: 'invalid-mount', type: 'custom', asset: 'plate', x: 0, z: 0, rotation: 0, mount: { wall: 'left', offset: 1.7, bottom: 1.5 } });
assert.throws(() => roomFromDesign(hole), /window opening/, 'An entire mount cannot attach to an empty window hole');
const fakeSurface = structuredClone(result.definition); fakeSurface.nodes.find(n => n.id === 'loft').surfaces[0].position[1] += .3;
assert.throws(() => validateRoomDefinition(fakeSurface), /metadata/);
const malformed = [
  d => d.assets.television.parts[0].shape = 'script',
  d => d.assets.television.parts[0].size = [Infinity, 1, 1],
  d => d.assets.television.parts[0].color = 'url(https://example.com)',
  d => d.assets.television.parts[0].position[1] = -8,
  d => d.assets.television.parts = Array(65).fill(d.assets.television.parts[0]),
  d => d.assets['loft-platform'].supports[0].part = 999,
  d => d.assets['loft-platform'].parts[0].rotation = [0, .3, 0],
  d => d.furniture.find(n => n.id === 'tv').asset = 'missing',
  d => d.furniture.find(n => n.id === 'tv').y = 10,
  d => d.furniture.find(n => n.id === 'tv').parent = 'missing',
  d => { const a = d.furniture.find(n => n.id === 'loft'); a.parent = 'upper-bed'; a.surface = 'top'; },
  d => d.furniture.find(n => n.id === 'stairs').x = 3.4,
  d => d.dimensions[1] = 2.5,
];
for (const change of malformed) { const d = generatedRoomDesign(); change(d); assert.throws(() => roomFromDesign(d)); }
const asset = { label: 'box', parts: [{ shape: 'box', size: [1, 1, 1], position: [0, .5, 0], color: '#ffffff' }], supports: [{ id: 'top', part: 0 }] };
assert.deepEqual(parseGeneratedAsset(asset), asset);
const shifted = structuredClone(asset); shifted.parts.forEach(p => p.position[1] += 1.2);
const canonical = parseGeneratedAsset(shifted);
assert.deepEqual(canonical.parts[0].size, asset.parts[0].size);
assert.ok(Math.abs(canonical.parts[0].position[1] - .5) < 1e-8, 'Shape-local vertical origin is normalized without resizing');
assert.throws(() => parseGeneratedAsset(shifted, false), /canonical/, 'Stored definitions must already use the canonical origin');
const nearWall = generatedRoomDesign(); nearWall.assets = { cube: asset };
nearWall.furniture = [{ id: 'new-support', type: 'custom', asset: 'cube', x: 3.1, z: 0, rotation: 0 }];
const inset = fitReferenceDesign(nearWall);
assert.equal(inset.corrections, 1); roomFromDesign(inset.input);
assert.equal(nearWall.furniture[0].x, 3.1, 'Generated asset fitting never mutates the input');
assert.deepEqual(inset.input.assets, nearWall.assets, 'Wall fitting preserves authored geometry');
const untouched = fitReferenceDesign(generatedRoomDesign()).input;
assert.deepEqual(untouched.furniture.filter(n => n.parent), source.furniture.filter(n => n.parent), 'Support-local coordinates are never clamped to room walls');
const budget = generatedRoomDesign(); budget.assets['many-parts'] = { ...asset, parts: Array(64).fill(asset.parts[0]) };
budget.furniture = Array.from({ length: 7 }, (_, i) => ({ id: `many-${i}`, type: 'custom', asset: 'many-parts', x: 0, z: 0, rotation: 0 }));
assert.throws(() => roomFromDesign(budget), /384/);
console.log('PASS: generated loft/stairs/TV/vase, multilevel support, piecewise collision, occupied tabletop packing, JSON persistence, malformed geometry and part budgets');
