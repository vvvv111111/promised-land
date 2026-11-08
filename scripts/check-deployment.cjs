const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const { buildSync } = require('esbuild');
const cp = require('node:child_process');
const directory = path.resolve('.room-qa/deployment-state');
fs.mkdirSync(directory, { recursive: true });
const bundle = path.join(directory, 'pet-route.cjs');
buildSync({ entryPoints: ['src/app/api/pet-agent/route.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'cjs' });
const original = { execFile: cp.execFile, spawn: cp.spawn, kill: process.kill };
const children = [], groups = [];
const fakeExec = () => {};
fakeExec[promisify.custom] = async (_file, args) => ({ stdout: args.includes('--capabilities') ? JSON.stringify({ primaryAvailable: true, regionalPresets: [], photoCoatAvailable: true }) : '', stderr: '' });
cp.execFile = fakeExec;
cp.spawn = (file, args, options) => {
  const child = new EventEmitter(); child.pid = 900000 + children.length; child.exitCode = null;
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kill = () => { if (child.exitCode !== null) return; child.exitCode = 1; setImmediate(() => child.emit('close', 1)); };
  if (file === 'taskkill') { const target = children.find(item => item.pid === Number(args[1])); setImmediate(() => target?.kill()); return child; }
  child.args = args; child.options = options; children.push(child); return child;
};
process.kill = pid => { groups.push(pid); children.find(item => item.pid === Math.abs(pid))?.kill(); return true; };
process.env.MIMO_API_KEY = 'test-not-a-real-key';
process.env.PET_AGENT_PYTHON = process.execPath;
process.env.PET_AGENT_CHROME = process.execPath;
process.env.PET_AGENT_CACHE_DIR = path.join(directory, 'jobs');
process.env.PET_AGENT_TRANSPORT = 'request';
const route = require(bundle);
const pixels = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], buffers: [{ byteLength: pixels.byteLength }], bufferViews: [{ buffer: 0, byteLength: pixels.byteLength }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }] }));
const padded = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]), header = Buffer.alloc(20), bin = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + pixels.byteLength, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16); bin.writeUInt32LE(pixels.byteLength); bin.writeUInt32LE(0x004e4942, 4);
const glb = Buffer.concat([header, padded, bin, Buffer.from(pixels.buffer)]);
async function finish(child, failure = false) {
  const out = child.args[child.args.indexOf('--output-dir') + 1];
  if (!failure) {
    const run = path.join(out, 'pet-fixture'); fs.mkdirSync(run); fs.writeFileSync(path.join(run, 'pet.glb'), glb);
    child.stdout.emit('data', JSON.stringify({ status: 'fallback_selected', species: 'cat', template: 'fixture', run, sha256: createHash('sha256').update(glb).digest('hex'), appearance_changed: false }));
  } else child.stderr.emit('data', 'HTTP 401 secret provider output');
  child.exitCode = failure ? 1 : 0; child.emit('close', child.exitCode);
}
async function spawned(count) { for (let i = 0; i < 500; i++) { if (children.length === count) return children[count - 1]; await new Promise(resolve => setTimeout(resolve, 5)); } throw Error('Child did not start'); }
const deadline = setTimeout(() => { throw Error('Deployment request test timed out'); }, 15000);
(async () => {
  const photo = await require('sharp')({ create: { width: 16, height: 16, channels: 3, background: '#fff' } }).jpeg().toBuffer();
  const request = signal => new Request('http://localhost/api/pet-agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: 'data:image/jpeg;base64,' + photo.toString('base64') }), signal });
  let done = false; const pending = route.POST(request()).then(response => { done = true; return response; });
  const child = await spawned(1); assert.equal(done, false, 'Cloud request must remain active until generation finishes');
  assert.equal((await route.POST(request())).status, 429, 'Per-instance concurrency guard stays active');
  await finish(child); const response = await pending, result = await response.json();
  assert.equal(response.status, 200); assert.equal(result.status, 'succeeded'); assert.equal(result.result.glb, glb.toString('base64'));
  assert.equal(result.id, undefined, 'Completed cloud responses do not ask the client to poll another instance');
  assert.deepEqual(fs.readdirSync(process.env.PET_AGENT_CACHE_DIR), [], 'Photos and intermediate outputs are removed');
  const controller = new AbortController(), cancelled = route.POST(request(controller.signal));
  const cancelledChild = await spawned(2); controller.abort();
  assert.equal((await (await cancelled).json()).status, 'cancelled'); assert.notEqual(cancelledChild.exitCode, null);
  if (process.platform !== 'win32') assert.ok(groups.includes(-cancelledChild.pid), 'Linux cancels the complete Python/Chrome process group');
  const failed = route.POST(request()); await finish(await spawned(3), true);
  const failure = await (await failed).json(); assert.equal(failure.status, 'failed'); assert.match(failure.error, /鉴权失败/); assert.ok(!JSON.stringify(failure).includes('secret provider'));
  process.env.PET_AGENT_TRANSPORT = 'poll';
  const local = await route.POST(request()), job = await local.json(); assert.equal(local.status, 202); assert.ok(job.id);
  await finish(await spawned(4));
  for (let i = 0; i < 100; i++) { const value = await (await route.GET(new Request('http://localhost/api/pet-agent?id=' + job.id))).json(); if (value.status === 'succeeded') break; await new Promise(resolve => setTimeout(resolve, 5)); }
  assert.equal((await (await route.GET(new Request('http://localhost/api/pet-agent?id=' + job.id))).json()).status, 'succeeded');
  assert.deepEqual(fs.readdirSync(process.env.PET_AGENT_CACHE_DIR), []);
  const docker = fs.readFileSync('Dockerfile.vercel', 'utf8');
  for (const item of ['ROOM_AGENT_TRANSPORT=request', 'PET_AGENT_TRANSPORT=request', 'USER node', '.deploy-assets/pet-library', 'PET_AGENT_CACHE_DIR=/tmp/', 'public ./public', '.next/static']) assert.ok(docker.includes(item), item);
  console.log('PASS: request-bound pet result, no cross-instance polling, per-instance concurrency, abort/process cleanup, sanitized failure, local polling compatibility, writable cache and container artifact requirements');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { cp.execFile = original.execFile; cp.spawn = original.spawn; process.kill = original.kill; clearTimeout(deadline); });
