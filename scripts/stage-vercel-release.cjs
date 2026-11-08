const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { unzipSync } = require('fflate');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
if (branch !== 'main') throw Error('Run from main to prepare the requested main-branch release');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const assetRoot = path.join(root, '.deploy-assets');
const manifest = JSON.parse(fs.readFileSync(path.join(assetRoot, 'manifest.json'), 'utf8'));
const expected = new Set(manifest.files.map(file => file.path));
function audit(directory, relative = '') {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.posix.join(relative, item.name), file = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw Error('Deployment assets contain a symlink');
    if (item.isDirectory()) audit(file, name);
    else if (!expected.has(name)) throw Error('Unlisted deployment asset: ' + name);
  }
}
audit(path.join(assetRoot, 'pet-library'));
for (const file of manifest.files) {
  const bytes = fs.readFileSync(path.join(assetRoot, 'pet-library', file.path));
  if (bytes.length !== file.bytes || createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw Error('Runtime asset changed: ' + file.path);
}
const archive = execFileSync('git', ['archive', '--format=zip', 'HEAD'], { cwd: root, maxBuffer: 100 * 1024 * 1024 });
fs.mkdirSync(path.join(root, '.room-qa'), { recursive: true });
const release = fs.mkdtempSync(path.join(root, '.room-qa/vercel-release-'));
for (const [name, bytes] of Object.entries(unzipSync(archive))) {
  if (name.endsWith('/')) continue;
  const target = path.resolve(release, name);
  if (!target.startsWith(release + path.sep)) throw Error('Invalid source archive path');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
}
if (!fs.existsSync(path.join(release, 'Dockerfile.vercel'))) throw Error('Commit the container configuration before staging');
fs.cpSync(assetRoot, path.join(release, '.deploy-assets'), { recursive: true });
fs.mkdirSync(path.join(release, '.vercel'));
fs.copyFileSync(path.join(root, '.vercel/project.json'), path.join(release, '.vercel/project.json'));
const result = { commit, branch, release, runtimeFiles: manifest.files.length };
fs.writeFileSync(path.join(root, '.room-qa/vercel-release.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
