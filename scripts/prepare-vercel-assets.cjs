const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.env.PET_AGENT_LIBRARY || path.join(root, '.pet-library'));
const destination = path.join(root, '.deploy-assets/pet-library');
// Copy only runtime code/models. Never copy the library's .env, runs or user reports.
const entries = [
  'outputs/PetStudio/server.py', 'outputs/PetStudio/storage.py', 'outputs/PetStudio/web',
  'outputs/PetStudio/Source/FBX', 'outputs/PetStudio/LICENSE_ATTRIBUTION_TEMPLATE.md',
  'outputs/Pet_Visual_Library/library_manifest.json', 'outputs/Pet_Model_Selection_Room',
];
const manifest = [];
function copy(relative) {
  const from = path.join(source, relative), to = path.join(destination, relative), stat = fs.lstatSync(from);
  if (stat.isSymbolicLink()) throw Error('Runtime asset symlinks are not supported: ' + relative);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(from)) {
      if (name.startsWith('.') || /^(Runs|Variants|Reports|Previews|tests|__pycache__)$/i.test(name)) continue;
      copy(path.posix.join(relative, name));
    }
  } else {
    if (!/\.(py|js|cjs|mjs|css|html|json|fbx|glb|png|jpe?g|webp|wasm|txt|md)$/i.test(relative) && !/^license$/i.test(path.basename(relative))) throw Error('Unexpected runtime asset: ' + relative);
    const bytes = fs.readFileSync(from);
    fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, bytes);
    manifest.push({ path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
function checkExisting(directory) {
  if (!fs.existsSync(directory)) return;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink() || item.name.startsWith('.')) throw Error('Unexpected private file in deployment assets; inspect before uploading');
    if (item.isDirectory()) checkExisting(path.join(directory, item.name));
  }
}
checkExisting(destination);
for (const entry of entries) copy(entry);
const known = new Set(manifest.map(file => file.path));
function audit(directory, relative = '') {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, item.name), file = path.join(directory, item.name);
    if (item.isDirectory()) audit(file, name);
    else if (!known.has(name)) throw Error('Unexpected file in deployment assets: ' + name);
  }
}
audit(destination);
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(path.join(path.dirname(destination), 'manifest.json'), JSON.stringify({ version: 1, files: manifest }, null, 2) + '\n');
console.log(JSON.stringify({ files: manifest.length, bytes: manifest.reduce((total, file) => total + file.bytes, 0), destination: '.deploy-assets/pet-library' }));
