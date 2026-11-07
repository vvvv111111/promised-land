const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const url = process.env.ROOM_URL || 'http://localhost:3000';
function wav(frequency = 440) {
  const samples = 8000 * 8, buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24); buffer.writeUInt32LE(16000, 28); buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buffer.writeInt16LE(Math.round(Math.sin(i * frequency * Math.PI * 2 / 8000) * 1500), 44 + i * 2);
  return buffer;
}

(async () => {
  const THREE = await import('three');
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    const dialog = page.getByRole('dialog', { name: 'CD 机', exact: true });
    const audio = page.locator('.room3d > audio');
    const open = async () => { await page.getByRole('button', { name: 'CD 机', exact: true }).click(); await dialog.waitFor(); await page.waitForFunction(() => !document.querySelector('.room-audio-file input')?.disabled); };
    const choose = async (name, buffer, mimeType = 'audio/wav') => dialog.locator('input[type=file]').setInputFiles({ name, mimeType, buffer });
    const record = () => page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open('promised-land-room-audio', 1);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('tracks', 'readonly'), r = tx.objectStore('tracks').get('winter-local-v1');
        tx.oncomplete = async () => {
          const track = r.result; db.close();
          resolve(track ? { name: track.name, size: track.blob.size, hash: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await track.blob.arrayBuffer()))).join(',') } : null);
        };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    }));
    await page.goto(url + '/room-3d'); await ready();
    const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
    // Native picking of the CD player's actual surface on the coffee table.
    const box = await page.locator('canvas').boundingBox(), camera = new THREE.PerspectiveCamera(35, box.width / box.height, .1, 80);
    camera.position.copy(new THREE.Vector3(.84, .72, 1.15).normalize().multiplyScalar(12)).add(new THREE.Vector3(0, 1, 0));
    camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    const point = new THREE.Vector3(-.25, .746, .17).project(camera);
    await page.mouse.click(box.x + (point.x + 1) / 2 * box.width, box.y + (1 - point.y) / 2 * box.height);
    await dialog.waitFor();
    await dialog.getByText('暂无音频', { exact: true }).waitFor();
    await choose('my-recording.wav', wav());
    await dialog.getByRole('button', { name: '试听', exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('.room-audio-transport button')?.disabled);
    assert.equal(await record(), null, 'Selection and preview do not overwrite saved audio');
    await dialog.getByRole('button', { name: '试听', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.room3d > audio').currentTime > .1);
    await dialog.getByRole('button', { name: '暂停', exact: true }).click();
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByText('已保存', { exact: true }).waitFor();
    const original = await record(); assert.equal(original.name, 'my-recording.wav');
    await dialog.getByRole('button', { name: '播放', exact: true }).click();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.room3d > audio').paused && document.querySelector('.room3d > audio').currentTime > .1);
    assert.equal(await dialog.count(), 0, 'Closed dialog is not in the accessible tree; audio continues');
    await open(); await dialog.getByRole('button', { name: '暂停', exact: true }).click();
    await page.reload(); await ready(); await open();
    await dialog.getByText('my-recording.wav', { exact: true }).waitFor();
    await choose('fake.mp3', Buffer.from('not an audio file'), 'audio/mpeg');
    await dialog.getByRole('alert').waitFor(); assert.deepEqual(await record(), original);
    await choose('broken.mp3', Buffer.from('ID3 followed by invalid audio'), 'audio/mpeg');
    await dialog.getByRole('alert').waitFor(); assert.deepEqual(await record(), original);
    await choose('too-big.wav', Buffer.alloc(20 * 1024 * 1024 + 1));
    await dialog.getByRole('alert').waitFor(); assert.deepEqual(await record(), original);
    await choose('replacement.wav', wav(660));
    await dialog.getByRole('button', { name: '保存', exact: true }).waitFor();
    // Abort after the write request succeeds, before commit: the previous blob must survive.
    await page.evaluate(() => {
      window.originalAudioPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const request = window.originalAudioPut.apply(this, args);
        if (this.name === 'tracks') request.addEventListener('success', () => this.transaction.abort());
        return request;
      };
    });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByRole('alert').filter({ hasText: '原音频已保留' }).waitFor();
    assert.deepEqual(await record(), original, 'Aborted replacement preserves the entire previous audio record');
    await page.evaluate(() => { IDBObjectStore.prototype.put = window.originalAudioPut; });
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByText('已保存', { exact: true }).waitFor();
    assert.equal((await record()).name, 'replacement.wav');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.goto(url + '/room-3d?mode=recipient'); await ready();
    await page.getByRole('button', { name: 'CD 机', exact: true }).click(); await dialog.waitFor();
    await dialog.getByText('replacement.wav', { exact: true }).waitFor();
    assert.equal(await dialog.locator('input[type=file]').count(), 0);
    assert.equal(await dialog.getByRole('button', { name: '移除音频', exact: true }).count(), 0);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.goto(url + '/room-3d'); await ready(); await open();
    await dialog.getByRole('button', { name: '移除音频', exact: true }).click();
    await dialog.getByText('暂无音频', { exact: true }).waitFor(); assert.equal(await record(), null);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore, 'Audio never rewrites gift/photo/letter/placement state');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.screenshot({ path: '.room-qa/3d-cd-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await open(); await choose('voice.wav', wav()); await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByText('已保存', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '.room-qa/3d-cd-mobile-dialog.png', fullPage: true });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.screenshot({ path: '.room-qa/3d-cd-mobile.png', fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: native CD picking, real audio decoding, explicit preview/save/play/pause, background playback, reload, invalid/oversize rejection, failed-commit rollback, replacement, recipient read-only, deletion, no gift writes, mobile layout');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
