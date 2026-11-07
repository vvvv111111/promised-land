// Optional browser acceptance check: uses an existing Playwright installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { background, objectCenter } = require('./room-test-geometry.cjs');
const configPath = path.join(__dirname, '../src/world/demo-world.json');
const original = fs.readFileSync(configPath, 'utf8');
const world = JSON.parse(original);
const manifest = require('../src/world/asset-manifest.json');
const url = process.env.ROOM_URL || 'http://localhost:3000';
const qa = path.join(__dirname, '../.room-qa');
fs.mkdirSync(qa, { recursive: true });
let configChanged = false;

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, reducedMotion: 'reduce' });
    const oldKey = `promised-land:collection:${world.world_id}`;
    const oldRecord = JSON.stringify(world.objects.filter(o => o.type === 'memory').map(o => o.object_id));
    await context.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: oldKey, value: oldRecord });
    let page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const ready = async () => {
      await page.locator('.canvas-status').filter({ hasText: '房间已就绪' }).waitFor({ timeout: 45000 });
      assert.equal(await page.locator('canvas').count(), 1);
    };
    const clickPoint = async (x, y, expected) => {
      const canvas = page.locator('canvas');
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + box.width * x, box.y + box.height * y);
      await page.locator('.room-panel h2').filter({ hasText: expected }).waitFor();
      if (world.objects.find(o => o.interaction.title === expected)?.content_type) {
        await page.getByRole('dialog').waitFor();
        await page.getByRole('button', { name: '关闭弹窗' }).click();
        await page.getByRole('dialog').waitFor({ state: 'detached' });
      }
    };
    const clickObject = async object => {
      const { x, y } = objectCenter(object);
      await clickPoint(x, y, object.interaction.title);
    };
    assert.equal((await page.goto(`${url}/world-demo`)).status(), 200);
    await ready();
    await page.screenshot({ path: path.join(qa, 'room-desktop.png'), fullPage: true });
    // Verify real PNG decode, dimensions and visible pixels on independent sprites.
    const alphaReport = await page.evaluate(async assets => Promise.all(assets.map(async a => {
      const img = new Image(); img.src = a.path; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      return { id: a.asset_id, width: img.width, height: img.height, centerAlpha: ctx.getImageData(img.width / 2, img.height / 2, 1, 1).data[3] };
    })), manifest.assets);
    alphaReport.forEach(a => { const expected = manifest.assets.find(asset => asset.asset_id === a.id); assert.equal(a.width, expected.width); assert.equal(a.height, expected.height); assert.ok(a.centerAlpha > 32); });
    const beforeClicks = await page.locator('canvas').screenshot();
    for (let round = 0; round < 3; round++) for (const object of world.objects) await clickObject(object);
    assert.equal(await page.getByLabel('纪念物品收集进度').count(), 0);
    assert.equal(await page.getByRole('heading', { name: '我的纪念物' }).count(), 0);
    assert.equal(await page.getByText('已收集', { exact: false }).count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), oldKey), oldRecord);
    assert.deepEqual(await page.locator('canvas').screenshot(), beforeClicks, 'Clicks must not fade, tint, hide or badge room objects');
    for (const h of world.hotspots) await clickPoint(h.position_x + h.width / 2, h.position_y + h.height / 2, h.interaction.title);
    await page.screenshot({ path: path.join(qa, 'room-repeat-clicks.png'), fullPage: true });
    await page.reload(); await ready();
    for (const object of world.objects.filter(o => o.type === 'memory')) await clickObject(object);
    for (const viewport of [{ width: 390, height: 844 }, { width: 1600, height: 1000 }]) {
      await page.setViewportSize(viewport);
      for (const h of world.hotspots) await clickPoint(h.position_x + h.width / 2, h.position_y + h.height / 2, h.interaction.title);
      await clickObject(world.objects.find(o => o.type === 'pet'));
      const b = await page.locator('canvas').boundingBox();
      assert.ok(Math.abs(b.width / b.height - background.width / background.height) < 0.01);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      if (viewport.width === 390) await page.screenshot({ path: path.join(qa, 'room-mobile.png'), fullPage: true });
    }
    await page.getByRole('link', { name: '返回首页' }).click();
    await page.getByRole('heading', { name: '应许之地', exact: true }).waitFor();
    await page.locator('canvas').waitFor({ state: 'detached' });
    await page.getByRole('link', { name: '进入世界演示' }).click(); await ready();

    // Real JSON edit: move cat into bookshelf hotspot, preserving the original in finally.
    const changed = structuredClone(world);
    changed.world_id = `${world.world_id}-json-check`;
    const moved = changed.objects.find(o => o.type === 'pet');
    moved.position_x = 0.39; moved.position_y = 0.41;
    // A fresh tab avoids clicking during Next's refresh of the old module graph.
    await page.close();
    configChanged = true; fs.writeFileSync(configPath, JSON.stringify(changed, null, 2));
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/world-demo`);
    await page.locator(`canvas[data-world-id="${changed.world_id}"]`).waitFor({ timeout: 45000 });
    await ready();
    await clickObject(moved); // Opaque cat must win over the bookshelf.
    // Transparent corner of the PNG must pass through to the bookshelf.
    await clickPoint(0.337, 0.302, world.hotspots[0].interaction.title);
    await page.screenshot({ path: path.join(qa, 'room-json-moved.png'), fullPage: true });
    await page.close();
    fs.writeFileSync(configPath, original); configChanged = false;
    page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/world-demo`);
    await page.locator(`canvas[data-world-id="${world.world_id}"]`).waitFor({ timeout: 45000 });
    await ready();
    await clickObject(world.objects.find(o => o.type === 'pet'));
    await page.goto(`${url}/world-demo?mode=recipient`);
    await ready();
    for (let round = 0; round < 3; round++) for (const object of world.objects.filter(o => o.type === 'memory')) await clickObject(object);
    assert.equal(await page.getByRole('button', { name: '编辑相框', exact: true }).count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), oldKey), oldRecord);
    assert.deepEqual(errors, []);
    await context.close();

    const blocked = await browser.newContext();
    await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw Error('blocked'); } }));
    const blockedPage = await blocked.newPage(); await blockedPage.goto(`${url}/world-demo`);
    await blockedPage.locator('.canvas-status').filter({ hasText: '房间已就绪' }).waitFor();
    await blockedPage.locator('summary').click();
    await blockedPage.getByRole('button', { name: world.objects.find(o => o.type === 'memory').interaction.title }).click();
    await blockedPage.locator('.room-panel h2').filter({ hasText: world.objects.find(o => o.type === 'memory').interaction.title }).waitFor();
    assert.equal(await blockedPage.getByLabel('纪念物品收集进度').count(), 0);
    await blocked.close();
    const result = { passed: ['real assets', 'all five objects', 'furniture hotspots', 'repeated clicks', 'old collection ignored', 'unchanged canvas appearance', 'refresh repeat clicks', 'mobile and desktop alignment', 'remount cleanup', 'JSON coordinate edit', 'object over hotspot', 'transparent pixel passthrough', 'blocked storage'], alphaReport, pageErrors: errors };
    fs.writeFileSync(path.join(qa, 'browser-results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
  } finally {
    if (configChanged) fs.writeFileSync(configPath, original);
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
