const assert = require('node:assert/strict');
const path = require('node:path');
require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
  'src/lib/media/photos.ts', '--ignoreConfig', '--outDir', '.room-qa/photo-state', '--module', 'commonjs',
  '--target', 'es2022', '--skipLibCheck'], { stdio: 'inherit' });
const { prepareGiftPhoto, prepareFramePhoto } = require('../.room-qa/photo-state/photos.js');
(async () => {
  let revoked = 0, decodeError = false, outputLength = 30;
  const canvases = [];
  global.Image = class {
    width = 2400; height = 1200; naturalWidth = 2400; naturalHeight = 1200;
    async decode() { if (decodeError) throw Object.assign(new Error('decode'), { name: 'EncodingError' }); }
  };
  global.URL = { createObjectURL: () => 'blob:test', revokeObjectURL: () => revoked++ };
  global.document = { createElement() {
    const canvas = { width: 0, height: 0, filled: false, quality: 0,
      getContext() { return { fillRect() { canvas.filled = true; }, drawImage() {} }; },
      toDataURL(type, quality) { this.quality = quality; return 'x'.repeat(outputLength); },
      toBlob(callback, type, quality) { this.quality = quality; callback(new Blob(['jpeg'], { type })); },
    }; canvases.push(canvas); return canvas;
  } };
  const png = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], 'photo.png', { type: 'image/png' });
  await prepareGiftPhoto(png); await prepareFramePhoto(png);
  assert.deepEqual(canvases.map(c => [c.width, c.height, c.filled, c.quality]), [[900, 450, false, .78], [1200, 600, true, .86]]);
  assert.equal(revoked, 2);
  const fake = (size, type = 'image/png') => ({ size, type });
  await assert.rejects(() => prepareGiftPhoto(fake(12 * 1024 * 1024 + 1)), /12MB/);
  await assert.rejects(() => prepareFramePhoto(fake(10 * 1024 * 1024 + 1)), /10MB/);
  await assert.rejects(() => prepareGiftPhoto(fake(1, 'text/plain')), /JPG/);
  outputLength = 1800001;
  await assert.rejects(() => prepareFramePhoto(png), /仍然过大/);
  decodeError = true;
  await assert.rejects(() => prepareGiftPhoto(png), /无法处理/);
  await assert.rejects(() => prepareFramePhoto(png), /无法处理/);
  assert.equal(revoked, 5, 'Failed processing also releases object URLs');
  console.log('PASS: independent upload limits, JPEG sizes/quality/backgrounds, decode/size errors, resource release');
})().catch(e => { console.error(e); process.exitCode = 1; });
