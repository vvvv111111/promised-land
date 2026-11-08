// Offline derivatives of the supplied static models; original GLBs remain untouched.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

async function simplifyGlb(input, output) {
  const { MeshoptSimplifier } = await import('meshoptimizer'); await MeshoptSimplifier.ready;
  const bytes = await fs.readFile(input), jsonLength = bytes.readUInt32LE(12);
  const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8'));
  if (data.skins?.length || data.animations?.length || data.meshes?.length !== 1 || data.meshes[0].primitives.length !== 1) throw Error('Only the supplied single-mesh static library is supported');
  const primitive = data.meshes[0].primitives[0];
  if (primitive.targets || primitive.mode && primitive.mode !== 4) throw Error('Unsupported primitive');
  const bin = bytes.subarray(28 + jsonLength);
  function accessor(index) {
    const a = data.accessors[index], v = data.bufferViews[a.bufferView];
    if (a.sparse || v.byteStride) throw Error('Interleaved/sparse attributes are not supported');
    const count = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const ctor = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    if (!ctor || !count) throw Error('Unsupported accessor');
    const start = (v.byteOffset || 0) + (a.byteOffset || 0);
    const copy = Uint8Array.from(bin.subarray(start, start + a.count * count * ctor.BYTES_PER_ELEMENT));
    return { a, count, array: new ctor(copy.buffer) };
  }
  const positions = accessor(primitive.attributes.POSITION), originalIndices = accessor(primitive.indices);
  const attrs = Object.entries(primitive.attributes).map(([key, index]) => ({ key, index, ...accessor(index) }));
  const normals = attrs.find(a => a.key === 'NORMAL'), uv = attrs.find(a => a.key === 'TEXCOORD_0');
  if (!normals || !uv) throw Error('Normals and UVs are required');
  const appearance = new Float32Array(positions.a.count * 5);
  for (let i = 0; i < positions.a.count; i++) {
    appearance.set(normals.array.subarray(i * 3, i * 3 + 3), i * 5);
    appearance.set(uv.array.subarray(i * 2, i * 2 + 2), i * 5 + 3);
  }
  const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(Uint32Array.from(originalIndices.array), positions.array, 3, appearance, 5, [.5, .5, .5, 1, 1], null, 30_000 * 3, .025, ['Permissive']);
  const [remap, vertexCount] = MeshoptSimplifier.compactMesh(indices);
  const replacements = new Map();
  const sharp = require('sharp');
  for (const image of data.images || []) {
    const v = data.bufferViews[image.bufferView];
    if (!v) throw Error('Only embedded textures are supported');
    const texture = sharp(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true });
    const alpha = (await texture.metadata()).hasAlpha;
    replacements.set(image.bufferView, await (alpha ? texture.png() : texture.jpeg({ quality: 82 })).toBuffer());
    image.mimeType = alpha ? 'image/png' : 'image/jpeg';
  }
  for (const attr of attrs) {
    const compact = new attr.array.constructor(vertexCount * attr.count);
    for (let i = 0; i < remap.length; i++) if (remap[i] !== 0xffffffff) compact.set(attr.array.subarray(i * attr.count, i * attr.count + attr.count), remap[i] * attr.count);
    replacements.set(attr.a.bufferView, Buffer.from(compact.buffer));
    attr.a.count = vertexCount; delete attr.a.byteOffset;
    if (attr.key === 'POSITION') {
      attr.a.min = [Infinity, Infinity, Infinity]; attr.a.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < compact.length; i++) { const axis = i % 3; attr.a.min[axis] = Math.min(attr.a.min[axis], compact[i]); attr.a.max[axis] = Math.max(attr.a.max[axis], compact[i]); }
    }
  }
  const packedIndices = vertexCount <= 65535 ? Uint16Array.from(indices) : indices;
  replacements.set(originalIndices.a.bufferView, Buffer.from(packedIndices.buffer));
  originalIndices.a.componentType = vertexCount <= 65535 ? 5123 : 5125; originalIndices.a.count = indices.length; delete originalIndices.a.byteOffset;
  let offset = 0; const chunks = [];
  for (let i = 0; i < data.bufferViews.length; i++) {
    const v = data.bufferViews[i];
    const chunk = replacements.get(i) || bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    v.byteOffset = offset; v.byteLength = chunk.length;
    chunks.push(chunk); offset += chunk.length;
    if (offset % 4) { const padding = Buffer.alloc(4 - offset % 4); chunks.push(padding); offset += padding.length; }
  }
  const binary = Buffer.concat(chunks); data.buffers = [{ byteLength: binary.length }];
  data.asset.generator = 'promised-land static pet derivative (meshoptimizer; 2.5% error limit)';
  let json = Buffer.from(JSON.stringify(data)); if (json.length % 4) json = Buffer.concat([json, Buffer.alloc(4 - json.length % 4, 32)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + binary.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(binary.length); binHeader.writeUInt32LE(0x004e4942, 4);
  const result = Buffer.concat([header, json, binHeader, binary]);
  if (result.length > 2_500_000) throw Error(`Derivative exceeds 2.5 MB: ${result.length} bytes, ${indices.length / 3} triangles, ${vertexCount} vertices`);
  await fs.writeFile(output, result);
  return { bytes: result.length, triangles: indices.length / 3, sha256: crypto.createHash('sha256').update(result).digest('hex'), simplificationError: error };
}

async function main() {
  const root = path.resolve(process.argv[2] || '.pet-library');
  const source = path.join(root, 'outputs/Pet_Model_Selection'), target = path.join(root, 'outputs/Pet_Model_Selection_Room');
  await fs.mkdir(target, { recursive: true });
  for (const file of ['index.html', 'vendor']) await fs.cp(path.join(source, file), path.join(target, file), { recursive: true });
  const sources = JSON.parse(await fs.readFile(path.join(source, 'sources.json'), 'utf8'));
  const derivatives = [];
  for (const asset of sources) {
    if (!['cat', 'kitten', 'dog', 'puppy'].includes(asset.id)) throw Error('Unknown library id');
    const input = path.join(source, asset.id + '.glb');
    const original = await fs.readFile(input);
    if (crypto.createHash('sha256').update(original).digest('hex') !== asset.sha256) throw Error('Original asset hash mismatch');
    const result = await simplifyGlb(input, path.join(target, asset.id + '.glb'));
    derivatives.push({ ...asset, ...result, originalSha256: asset.sha256, derivative: true });
    await fs.copyFile(path.join(source, asset.id + '-LICENSE.txt'), path.join(target, asset.id + '-LICENSE.txt'));
    console.log(asset.id, JSON.stringify(result));
  }
  await fs.writeFile(path.join(target, 'sources.json'), JSON.stringify(derivatives, null, 2));
}
module.exports = { simplifyGlb };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
