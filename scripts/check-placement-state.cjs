const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  'src/world/RoomPlacement.ts', 'src/world/config.ts', '--ignoreConfig', '--outDir', '.room-qa/placement-state',
  '--module', 'node16', '--target', 'es2020', '--moduleResolution', 'node16', '--esModuleInterop', '--resolveJsonModule', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
const { RoomPlacement, surfaceToScreen, screenToSurface, insidePolygon, polygonsOverlap } = require('../.room-qa/placement-state/RoomPlacement.js');
const { demoWorld: world, assetManifest, validateWorldConfig } = require('../.room-qa/placement-state/config.js');
const model = () => new RoomPlacement(world, assetManifest);
const check = m => {
  for (const o of world.objects) {
    const pose = m.pose(o.object_id), footprint = m.footprint(o.object_id);
    const surface = world.placement.surfaces.find(s => s.surface_id === pose.surface_id);
    assert.ok(footprint.every(p => insidePolygon(p, surface.polygon)), `${o.object_id} supported`);
    surface.blockers.forEach(b => assert.equal(polygonsOverlap(footprint, b.polygon), false, `${o.object_id} blocks ${b.id}`));
    for (const other of world.objects) if (other.object_id !== o.object_id && m.pose(other.object_id).surface_id === pose.surface_id) {
      assert.equal(polygonsOverlap(footprint, m.footprint(other.object_id)), false, 'No footprint interpenetration');
    }
  }
};
for (const s of world.placement.surfaces) for (const uv of [{x:0,y:0},{x:1,y:1},{x:.24,y:.71}]) {
  const back = screenToSurface(s.polygon, surfaceToScreen(s.polygon, uv));
  assert.ok(Math.abs(back.x-uv.x)<1e-8 && Math.abs(back.y-uv.y)<1e-8);
}
const m = model(); check(m);
console.log('Initial poses:', JSON.stringify(Object.fromEntries(world.objects.map(o => [o.object_id,m.pose(o.object_id)]))));
for (const o of world.objects) for (const requested of [{x:.5,y:0},{x:1,y:1},{x:0,y:.7},{x:.85,y:.53}]) { m.move(o.object_id,requested); check(m); }
const collision = model();
const chairGround = collision.pose('sage-chair').ground;
collision.move('orange-cat', {x:chairGround.x,y:chairGround.y+.0204}); check(collision);
assert.ok(Math.hypot(collision.pose('orange-cat').ground.x-chairGround.x,collision.pose('orange-cat').ground.y-chairGround.y)>.025);
const table = model();
// Search the usable front portion of the tabletop, respecting the lamp footprint.
let onTable = false;
for (const point of [{x:.82,y:.44},{x:.85,y:.44},{x:.875,y:.435}]) {
  const pose = table.move('seaside-shell', {x:point.x,y:point.y-.0105});
  if (pose.surface_id==='side-table-top') { onTable=true; console.log('Tabletop placement:',JSON.stringify(pose)); break; }
}
assert.ok(onTable, 'Small objects can be placed on tabletop'); check(table);
assert.ok(table.pose('seaside-shell').depth > .615);
table.move('sage-chair',{x:.84,y:.44});
assert.equal(table.pose('sage-chair').surface_id,'floor'); check(table);
const restored = new RoomPlacement(world,assetManifest,{'orange-cat':{x:.5,y:.02}}); check(restored);
const swapped = new RoomPlacement(world,assetManifest,{'seaside-shell':{x:.69,y:.7},'sunset-frame':{x:.43,y:.79}});
assert.deepEqual(swapped.pose('seaside-shell').anchor,{x:.69,y:.7});
assert.deepEqual(swapped.pose('sunset-frame').anchor,{x:.43,y:.79}); check(swapped);
const bad = structuredClone(world); bad.objects[0].placement.surfaces=['side-table-top'];
assert.throws(()=>validateWorldConfig(bad,assetManifest));
console.log('PASS: projection roundtrip, floor support, footprint collisions, swept movement, tabletop/lamp support, large-object restrictions, saved-layout correction, schema');
