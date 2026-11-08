const { chromium } = require('playwright');
const { unzipSync, strFromU8 } = require('fflate');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const { roomFromDesign, bedroomRoomDesign } = require('../.room-qa/agent-state/room/agent/design.js');
const base = process.env.ROOM_URL || 'http://localhost:3000';
const giftId = 'package-test', key = `promised-land:gift:${giftId}`;
const directory = path.resolve('.room-qa/gift-package/browser');
fs.mkdirSync(directory, { recursive: true });
const ready = p => p.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false, null, { timeout: 45000 });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOM_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  let server;
  try {
    const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/pet-agent', route => route.fulfill({ json: route.request().method() === 'GET' ? { configured: true, primaryAvailable: true } : { status: 'succeeded', result: { species: 'cat', template: 'cat', appearanceChanged: false, glb: fs.readFileSync('.pet-library/outputs/Pet_Model_Selection_Room/cat.glb').toString('base64') } } }));
    await page.goto(base);
    const photo = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d'); ctx.fillStyle = '#c88042'; ctx.fillRect(0, 0, 32, 32); return c.toDataURL(); });
    const text = '写给你的信。 </script><script>window.injected=true</script>';
    const gift = { ...require('../src/world/demo-gift.json'), gift_id: giftId, room: roomFromDesign(bedroomRoomDesign()).definition, details: { recipient: '小河', sender: '小林', memory: '共同的回忆', extra_photos: [photo] } };
    gift.object_contents['sunset-frame'] = { kind: 'photo_frame', photo, zoom: 1.5, position_x: .3, position_y: .7 };
    gift.object_contents['sealed-letter'] = { kind: 'letter', body: text };
    await page.evaluate(({ key, gift }) => localStorage.setItem(key, JSON.stringify(gift)), { key, gift });
    // A real GLB goes through normalization, placement and IndexedDB before packaging.
    await page.goto(`${base}/gift/edit?mode=sender&gift=${giftId}`); await ready(page);
    await page.getByRole('tab', { name: '宠物', exact: true }).click();
    await page.locator('#pet-agent-photo').setInputFiles('public/assets/warm-room-v1/cat_orange_01.png');
    await page.getByRole('button', { name: '生成宠物', exact: true }).click(); await confirmPreview(page);
    const saved = await page.evaluate(key => localStorage.getItem(key), key);
    const pet = JSON.parse(saved).room.nodes.find(n => n.petAsset);
    assert.ok(pet.petAsset.assetId && !pet.petAsset.glb);
    const wav = Buffer.alloc(44 + 8000 * 2); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
    for (let i = 44; i < wav.length; i += 2) wav.writeInt16LE(Math.round(Math.sin(i * .2) * 1200), i);
    await page.evaluate(async ({ giftId, bytes }) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('promised-land-room-audio', 1); r.onupgradeneeded = () => r.result.createObjectStore('tracks', { keyPath: 'giftId' }); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      await new Promise((resolve, reject) => { const t = db.transaction('tracks', 'readwrite'); t.objectStore('tracks').put({ giftId, name: 'gift.wav', blob: new Blob([new Uint8Array(bytes)], { type: 'audio/wav' }), updatedAt: Date.now() }); t.oncomplete = resolve; t.onerror = () => reject(t.error); }); db.close();
    }, { giftId, bytes: [...wav] });
    await page.getByRole('link', { name: '完成', exact: true }).click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '下载礼物包', exact: true }).click();
    const download = await downloadEvent; await download.saveAs(path.join(directory, 'gift.zip'));
    const files = unzipSync(fs.readFileSync(path.join(directory, 'gift.zip')));
    for (const [name, bytes] of Object.entries(files)) { assert.ok(['index.html', 'viewer.js', 'README.txt', 'THIRD_PARTY_NOTICES.txt'].includes(name)); fs.writeFileSync(path.join(directory, name), bytes); }
    const payload = JSON.parse(strFromU8(files['index.html']).match(/<script id="gift-data" type="application\/json">(.*?)<\/script>/s)[1]);
    const exported = payload.gift.room.nodes.find(n => n.petAsset);
    assert.deepEqual(exported.position, pet.position); assert.deepEqual(exported.rotation, pet.rotation); assert.deepEqual(exported.petAsset.size, pet.petAsset.size);
    assert.equal(exported.petAsset.glb, fs.readFileSync('.pet-library/outputs/Pet_Model_Selection_Room/cat.glb').toString('base64'));
    assert.equal(exported.petAsset.assetId, undefined); assert.equal(payload.audio.base64, wav.toString('base64'));
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), saved, 'Export must not rewrite the local gift');
    await page.screenshot({ path: '.room-qa/gift-package/complete-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: '.room-qa/gift-package/complete-mobile.png', fullPage: true });
    // Missing IndexedDB bytes are a visible failure, never a partial ZIP.
    await page.evaluate(async () => { const db = await new Promise(resolve => { const r = indexedDB.open('promised-land:pet-assets:v1', 1); r.onsuccess = () => resolve(r.result); }); await new Promise(resolve => { const t = db.transaction('models', 'readwrite'); t.objectStore('models').clear(); t.oncomplete = resolve; }); db.close(); });
    let extraDownloads = 0; page.on('download', () => extraDownloads++);
    await page.getByRole('button', { name: '下载礼物包', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '宠物模型已被清理' }).waitFor(); assert.equal(extraDownloads, 0);
    server = http.createServer((req, res) => { const name = req.url === '/gifts/test/' ? 'index.html' : req.url?.startsWith('/gifts/test/') ? req.url.slice('/gifts/test/'.length) : ''; if (!files[name]) { res.writeHead(404); return res.end(); } res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript' : 'text/plain'); res.end(Buffer.from(files[name])); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const recipient = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await recipient.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw Error('Viewer must not read IndexedDB'); } }); Object.defineProperty(window, 'localStorage', { get() { throw Error('Viewer must not read localStorage'); } }); });
    const reader = await recipient.newPage(); reader.on('pageerror', error => errors.push(error.message));
    const requests = []; reader.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
    await reader.goto(origin + '/gifts/test/');
    await reader.waitForFunction(() => !document.querySelector('[data-object]')?.disabled, null, { timeout: 45000 });
    assert.equal(await reader.locator('#title').innerText(), '送给 小河');
    assert.equal(await reader.locator('input, textarea, [role=tab]').count(), 0);
    for (const name of ['相框', '信件', 'CD 机']) {
      await reader.getByRole('button', { name, exact: true }).click();
      const dialog = reader.getByRole('dialog'); await dialog.waitFor();
      if (name === '信件') assert.ok((await dialog.innerText()).includes(text));
      if (name === '相框') assert.equal(await dialog.locator('img').evaluate(img => img.style.transform), 'scale(1.5)');
      if (name === 'CD 机') { await dialog.getByText('gift.wav', { exact: true }).waitFor(); await dialog.locator('audio').evaluate(audio => audio.play()); }
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await reader.getByRole('button', { name: '查看回忆', exact: true }).click();
    assert.equal(await reader.locator('#memory').innerText(), '共同的回忆'); assert.equal(await reader.locator('#story-photos img').count(), 2);
    assert.equal(await reader.evaluate(() => window.injected), undefined);
    assert.ok(requests.every(url => url === origin + '/gifts/test/' || url === origin + '/gifts/test/viewer.js'), 'No calls to generation APIs, CDNs or original app');
    await reader.screenshot({ path: '.room-qa/gift-package/viewer-desktop.png', fullPage: true });
    await reader.setViewportSize({ width: 390, height: 844 });
    assert.equal(await reader.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await reader.getByRole('button', { name: '信件', exact: true }).click();
    await reader.screenshot({ path: '.room-qa/gift-package/viewer-mobile.png', fullPage: true });
    await reader.getByRole('button', { name: '关闭', exact: true }).click();
    await reader.goto(pathToFileURL(path.join(directory, 'index.html')).href);
    await reader.waitForFunction(() => !document.querySelector('[data-object]')?.disabled, null, { timeout: 45000 });
    assert.deepEqual(errors, []);
    await recipient.close(); await context.close();
    console.log('PASS: real model from IndexedDB embedded with exact placement, saved media/crop retained, missing model fails without ZIP, fresh storage-free recipient, static subdirectory and file://, audio, collection/story, injection safety, desktop/mobile');
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
