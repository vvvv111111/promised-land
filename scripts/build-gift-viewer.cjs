const { buildSync } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'public/gift-viewer');
fs.mkdirSync(directory, { recursive: true });
buildSync({ entryPoints: [path.join(root, 'src/gift/publish/viewer.ts')], outfile: path.join(directory, 'runtime.js'), bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, legalComments: 'eof', banner: { js: '/* promised-land-gift-viewer:v1 */' }, tsconfig: path.join(root, 'tsconfig.json') });
fs.writeFileSync(path.join(directory, 'notices.txt'), 'Three.js (MIT)\n\n' + fs.readFileSync(path.join(root, 'node_modules/three/LICENSE'), 'utf8'));
console.log('Built self-contained gift viewer');
