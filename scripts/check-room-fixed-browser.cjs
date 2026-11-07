const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const world = require('../src/world/demo-world.json');
const { objectCenter } = require('./room-test-geometry.cjs');
const key = `promised-land:layout:${world.world_id}`;
const url = process.env.ROOM_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.locator('.canvas-status').filter({ hasText: '房间已加载' }).waitFor();
    await page.goto(url + '/world-demo'); await ready();
    assert.equal(await page.getByRole('button', { name: '恢复默认摆放', exact: true }).count(), 0);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const original = await page.locator('canvas').screenshot();
    for (const object of world.objects.filter(o => o.visible && o.clickable)) {
      const box = await page.locator('canvas').boundingBox(), point = objectCenter(object);
      await page.mouse.move(box.x + box.width * point.x, box.y + box.height * point.y); await page.mouse.down();
      await page.mouse.move(box.x + box.width * (point.x + .04), box.y + box.height * (point.y - .02), { steps: 12 }); await page.mouse.up();
      assert.equal((await page.locator('canvas').screenshot()).equals(original), true, object.object_id + ' stays fixed');
      assert.equal(await page.getByRole('dialog').count(), 0, 'A drag is not a click');
    }
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    const catObject = world.objects.find(o => o.type === 'pet');
    const basis = JSON.stringify([world.background_id, catObject.asset_id, catObject.position_x, catObject.position_y, catObject.size, catObject.anchor, world.placement?.version, catObject.placement]);
    await page.evaluate(({ key, basis }) => localStorage.setItem(key, JSON.stringify({ 'orange-cat': { basis, position: { x: .60, y: .85 } } })), { key, basis });
    const legacy = await page.evaluate(key => localStorage.getItem(key), key);
    await page.reload(); await ready(); await page.locator('canvas').scrollIntoViewIfNeeded();
    assert.equal((await page.locator('canvas').screenshot()).equals(original), true, 'Legacy placement does not change the fixed room');
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), legacy, 'Old storage is not rewritten');
    await page.close();

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobile = await touch.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(url + '/world-demo'); await mobile.locator('.canvas-status').filter({ hasText: '房间已加载' }).waitFor();
    const canvas = mobile.locator('canvas'); await canvas.scrollIntoViewIfNeeded(); const before = await canvas.screenshot();
    const box = await canvas.boundingBox(), cat = objectCenter(world.objects.find(o => o.type === 'pet'));
    const cdp = await touch.newCDPSession(mobile), x = box.x + box.width * cat.x, y = box.y + box.height * cat.y;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 3, y: y - i * 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await canvas.screenshot()).equals(before), true);
    assert.equal(await mobile.evaluate(key => localStorage.getItem(key), key), null);
    assert.equal(await mobile.getByRole('dialog').count(), 0);
    await touch.close(); assert.deepEqual(errors, []);
    console.log('PASS: fixed room on mouse/touch, no placement controls/writes, legacy positions ignored, drag does not click');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
