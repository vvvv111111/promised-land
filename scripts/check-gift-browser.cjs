const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const world = require('../src/world/demo-world.json');
const url = process.env.ROOM_URL || 'http://localhost:3000';
const giftId = 'gift-edit-acceptance';
const storageKey = `promised-land:gift:${giftId}`;
const frame = world.objects.find(o => o.content_type === 'photo_frame');
const letter = world.objects.find(o => o.content_type === 'letter');
const body = '亲爱的你：\n\n愿每一天都有阳光。\n<script>这只是正文，不会执行</script>\n\n一直惦念你的人';
fs.mkdirSync('.room-qa', { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const open = async (mode = 'sender', id = giftId) => {
      await page.goto(`${url}/world-demo?mode=${mode}&gift=${id}`);
      await page.locator('.canvas-status').filter({ hasText: '房间已就绪' }).waitFor({ timeout: 45000 });
    };
    const clickObject = async o => {
      await page.locator('canvas').scrollIntoViewIfNeeded();
      const b = await page.locator('canvas').boundingBox();
      const x = o.position_x;
      const y = o.position_y - (o.content_type === 'photo_frame' ? o.size.width / 2 : 0);
      await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
      try { await page.getByRole('dialog').waitFor({ timeout: 10000 }); }
      catch (e) { await page.screenshot({ path: '.room-qa/gift-failure.png', fullPage: true }); console.log(await page.locator('.room-feedback').textContent()); throw e; }
    };
    const close = () => page.getByRole('button', { name: '关闭弹窗' }).click();
    await open();
    await clickObject(frame);
    await page.getByRole('button', { name: '编辑相框', exact: true }).click();
    const image1 = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 900; c.height = 600;
      const ctx = c.getContext('2d'); ctx.fillStyle = '#4d8c93'; ctx.fillRect(0, 0, 900, 600);
      ctx.fillStyle = '#eec25e'; ctx.fillRect(450, 0, 450, 600);
      ctx.fillStyle = '#f9f2d5'; ctx.font = '70px sans-serif'; ctx.fillText('OUR MEMORY', 120, 300);
      return c.toDataURL('image/png');
    });
    const upload = async data => page.locator('input[type=file]').setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: Buffer.from(data.split(',')[1], 'base64') });
    await upload(image1);
    await page.getByAltText('礼物相框中的照片').waitFor();
    await page.getByLabel('照片缩放', { exact: true }).fill('1.8');
    await page.getByLabel('照片左右位置', { exact: true }).fill('0.25');
    await page.getByLabel('照片上下位置', { exact: true }).fill('0.7');
    await page.getByRole('button', { name: '保存编辑', exact: true }).click();
    const first = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), storageKey);
    assert.equal(first.object_contents[frame.object_id].zoom, 1.8);
    assert.equal(first.object_contents[frame.object_id].position_x, 0.25);
    assert.equal(first.object_contents[frame.object_id].position_y, 0.7);
    await page.screenshot({ path: '.room-qa/gift-photo-editor.png', fullPage: true });
    await close(); await page.reload();
    await page.locator('.canvas-status').filter({ hasText: '房间已就绪' }).waitFor();
    await clickObject(frame);
    assert.equal(await page.getByAltText('礼物相框中的照片').getAttribute('src'), first.object_contents[frame.object_id].photo);
    await page.getByRole('button', { name: '编辑相框', exact: true }).click();
    // Invalid uploads must not overwrite the previously saved photograph.
    await page.locator('input[type=file]').setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('not a photo') });
    await page.locator('.gift-dialog [role=alert]').waitFor();
    const same = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), storageKey);
    assert.equal(same.object_contents[frame.object_id].photo, first.object_contents[frame.object_id].photo);
    // Replace with a different valid photo, resetting old crop settings.
    const image2 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 960; const ctx = c.getContext('2d'); ctx.fillStyle = '#af6c76'; ctx.fillRect(0, 0, 640, 960); return c.toDataURL('image/png'); });
    await upload(image2);
    await page.waitForFunction(({ key, id, previous }) => JSON.parse(localStorage.getItem(key)).object_contents[id].photo !== previous,
      { key: storageKey, id: frame.object_id, previous: first.object_contents[frame.object_id].photo });
    const replaced = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), storageKey);
    assert.equal(replaced.object_contents[frame.object_id].zoom, 1);
    await close();

    await clickObject(letter);
    await page.getByRole('button', { name: '编辑信件', exact: true }).click();
    await page.getByLabel('信件正文', { exact: true }).fill(body);
    // Closing without pressing Save still keeps auto-saved content.
    await close();
    await open(); await clickObject(letter);
    assert.equal(await page.locator('.gift-letter-body').textContent(), body);
    await page.getByRole('button', { name: '编辑信件', exact: true }).click();
    await page.getByRole('button', { name: '保存编辑', exact: true }).click();
    await close();

    await open('recipient');
    assert.equal(await page.getByRole('button', { name: '恢复默认摆放' }).count(), 0);
    await clickObject(frame);
    assert.equal(await page.getByAltText('礼物相框中的照片').getAttribute('src'), replaced.object_contents[frame.object_id].photo);
    assert.equal(await page.locator('.gift-dialog input, .gift-dialog textarea, .gift-dialog-actions button').count(), 0);
    await close(); await clickObject(letter);
    assert.equal(await page.locator('.gift-letter-body').textContent(), body);
    assert.equal(await page.getByRole('button', { name: '编辑信件', exact: true }).count(), 0);
    assert.equal(await page.locator('.gift-dialog script').count(), 0);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: '.room-qa/gift-recipient-letter.png', fullPage: true });
    await close();
    await open('recipient', 'separate-gift'); await clickObject(letter);
    assert.notEqual(await page.locator('.gift-letter-body').textContent(), body);
    await close();

    // Simulate quota failure. No false success and the previous saved document survives.
    await open();
    await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('promised-land:gift:')) throw new DOMException('quota', 'QuotaExceededError'); return original.call(this, k, v); }; });
    await clickObject(letter);
    await page.getByRole('button', { name: '编辑信件', exact: true }).click();
    await page.getByLabel('信件正文', { exact: true }).fill('这次保存会失败');
    await page.locator('.gift-dialog [role=alert]').filter({ hasText: '保存失败' }).waitFor();
    await close();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: '放弃未保存更改', exact: true }).click();
    assert.equal((await page.evaluate(k => JSON.parse(localStorage.getItem(k)), storageKey)).object_contents[letter.object_id].body, body);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: frame canvas click, upload/replace/crop, save and refresh, letter autosave/reopen, recipient read-only, gift isolation, invalid file, quota failure, mobile dialog');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
