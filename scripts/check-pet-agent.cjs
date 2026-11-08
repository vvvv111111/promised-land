const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.room-qa/pet-state'); fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'package.json'),JSON.stringify({type:'module'}));
fs.writeFileSync(path.join(output,'tsconfig.json'),JSON.stringify({extends:'../../tsconfig.json',compilerOptions:{noEmit:false,incremental:false,outDir:'.',rootDir:'../../src',types:['node'],typeRoots:[path.resolve('node_modules/@types')]},include:['../../src/room/composePet.ts','../../src/room/models/petGlb.ts','../../src/room/agent/examples.ts','../../src/room/agent/persistence.ts','../../src/app/api/pet-agent/route.ts']}));
require('node:child_process').execFileSync(process.execPath,[path.resolve('node_modules/typescript/bin/tsc'),'--project',path.join(output,'tsconfig.json')],{stdio:'inherit'});
function resolveImports(dir) {
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) resolveImports(file);
    else if(file.endsWith('.js')) {
      let source=fs.readFileSync(file,'utf8');
      source=source.replace(/import (\w+) from "(\.\.?\/[^"\n]+\.json)";/g,(_,name,relative)=>`const ${name} = ${fs.readFileSync(path.resolve(path.dirname(file),relative),'utf8')};`);
      source=source.replace(/from "(\.\.?\/[^"\n]+)"/g,(_,relative)=>`from "${relative.endsWith('.js')?relative:relative+'.js'}"`);
      fs.writeFileSync(file,source);
    }
  }
}
resolveImports(output);
const root = '../.room-qa/pet-state/';
const { decodePetGlb, validatePetAsset } = require(root + 'room/petAsset.js');
const { measurePetAsset, loadNormalizedPet, disposePetModel, petGlb } = require(root + 'room/models/petGlb.js');
const { composePet, customPet, preservePet } = require(root + 'room/composePet.js');
const { defaultRoom, validateRoomDefinition } = require(root + 'room/definition.js');
const { nodeWorldBounds } = require(root + 'room/spatial.js');
const { roomFromDesign } = require(root + 'room/agent/design.js');
const { flexibleBedroomDesign } = require(root + 'room/agent/examples.js');
const { selectedRoom } = require(root + 'room/agent/persistence.js');
const route = require(root + 'app/api/pet-agent/route.js');

function fixtureGlb() {
  // A deliberately offset, centimetre-sized box tests centering, floor contact and unit conversion.
  const positions = new Float32Array([10, 20, 30, 210, 20, 30, 210, 120, 30, 10, 120, 30, 10, 20, 110, 210, 20, 110, 210, 120, 110, 10, 120, 110]);
  const indices = new Uint16Array([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5]);
  const bin = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const data = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [10,20,30], max: [210,120,110] }, { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' }] };
  let json = Buffer.from(JSON.stringify(data)); if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - json.length % 4, 32)]);
  const header = Buffer.alloc(20), tail = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2,4); header.writeUInt32LE(28 + json.length + bin.length,8); header.writeUInt32LE(json.length,12); header.writeUInt32LE(0x4e4f534a,16);
  tail.writeUInt32LE(bin.length); tail.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,tail,bin]).toString('base64');
}
module.exports = { fixtureGlb };

async function main() {
  const glb = fixtureGlb();
  const asset = await measurePetAsset({ species: 'cat', glb, template: 'fixture', targetLength: .6, upAxis: 'y' });
  assert.ok(asset.size.every((n,i) => Math.abs(n - [.6,.3,.24][i]) < 1e-9));
  validatePetAsset(asset);
  const model = await loadNormalizedPet(glb,.6,'y');
  const THREE = await import('three');
  const bounds = new THREE.Box3().setFromObject(model.root,true);
  assert.ok(Math.abs(bounds.min.y) < 1e-9 && Math.abs(bounds.min.x + bounds.max.x) < 1e-9 && Math.abs(bounds.min.z + bounds.max.z) < 1e-9);
  disposePetModel(model.root);
  const zUp = await measurePetAsset({ ...asset, upAxis: 'z' });
  assert.ok(Math.abs(zUp.size[1] - .24) < 1e-8);
  const before = structuredClone(defaultRoom), room = composePet(defaultRoom,asset);
  assert.deepEqual(defaultRoom,before); validateRoomDefinition(room);
  assert.equal(room.nodes.filter(n => n.model === 'pet').length,1);
  const pet = customPet(room), b = nodeWorldBounds(room,pet);
  assert.ok(b.min[1] >= 0 && b.min[1] < .1);
  assert.ok(Math.abs((b.max[0] - b.min[0]) - .6) < 1e-8);
  const next = preservePet(roomFromDesign(flexibleBedroomDesign()).definition,room);
  assert.deepEqual(customPet(next).petAsset,asset);
  const moved = structuredClone(pet); moved.position = [0,0,0];
  const relocated = composePet(defaultRoom,asset,moved);
  assert.notDeepEqual(customPet(relocated).position,moved.position);
  const exported = JSON.parse(JSON.stringify(next)); validateRoomDefinition(exported);
  assert.deepEqual(selectedRoom({ getItem: () => JSON.stringify({ definition: exported }) }), exported);
  const huge = { ...asset, size: [1.4,2.5,1.4], targetLength: 1.4 };
  const tinyDesign = flexibleBedroomDesign(); tinyDesign.dimensions[1] = 2.4; tinyDesign.architecture.windows = [];
  const tiny = roomFromDesign(tinyDesign).definition;
  assert.throws(() => composePet(tiny,huge), /没有足够/);
  for (const change of [a => a.size[0] = 99, a => a.targetLength = NaN, a => a.upAxis = 'x', a => a.glb = 'https://example.com/pet.glb']) { const a=structuredClone(asset); change(a); assert.throws(() => validatePetAsset(a)); }
  const floating = structuredClone(room); customPet(floating).position[1] = 1;
  assert.throws(() => validateRoomDefinition(floating), /floor/);
  const spoofed = { ...asset, size: [.6,.5,.24] };
  await assert.rejects(petGlb(new THREE.Group(), { onChange() {} }, spoofed).ready, /实测尺寸/);
  const lateRoot = new THREE.Group(), late = petGlb(lateRoot, { onChange() { throw Error('late load'); } },asset); late.dispose(); await late.ready; assert.equal(lateRoot.children.length,0);
  const bytes = Buffer.from(glb,'base64'); bytes.writeUInt32LE(bytes.length + 4,8); assert.throws(() => decodePetGlb(bytes.toString('base64')));
  const request = (data, headers={}) => new Request('http://localhost/api/pet-agent', { method:'POST', headers:{ 'content-type':'application/json', ...headers }, body: JSON.stringify(data) });
  assert.equal((await route.POST(request({ templateId:'../secret' }))).status,400);
  assert.equal((await route.POST(request({ templateId:'cat' },{ origin:'https://other.test' }))).status,403);
  assert.equal((await route.POST(request({ image:'https://example.com/private.jpg' }))).status,400);
  assert.equal((await route.GET(new Request('http://localhost/api/pet-agent?id=expired'))).status,404);
  if (fs.existsSync('.pet-library/outputs/Pet_Model_Selection_Room/sources.json')) {
    for (const id of ['cat','kitten','dog','puppy']) {
      const response = await route.POST(request({ templateId:id })); assert.equal(response.status,200);
      const data = await response.json(); decodePetGlb(data.result.glb); assert.equal(data.result.appearanceChanged,false); assert.ok(data.result.license);
    }
  }
  console.log('PASS: measured GLB scale/axes/floor contact, collision relocation, no-space rollback, room regeneration, standalone export persistence, invalid assets, async cancellation/disposal, same-origin API and four real library models');
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode=1; });
