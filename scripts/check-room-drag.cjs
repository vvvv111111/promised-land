const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const world = require('../src/world/demo-world.json');
const manifest = require('../src/world/asset-manifest.json');
const layoutKey = `promised-land:layout:${world.world_id}`;
const url = process.env.ROOM_URL || 'http://localhost:3000';
const center = (o, position) => {
  const a = o.anchor || manifest.assets.find(a => a.asset_id === o.asset_id).default_anchor;
  return { x: position.x + (0.5 - a.x) * o.size.width, y: position.y + (0.5 - a.y) * o.size.width };
};
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${url}/world-demo`);
    const ready = () => page.locator('.canvas-status').filter({ hasText: '房间已就绪' }).waitFor();
    await ready();
    const positions = {};
    for (const o of world.objects) {
      await page.locator('canvas').scrollIntoViewIfNeeded();
      const box = await page.locator('canvas').boundingBox();
      const c = center(o, { x: o.position_x, y: o.position_y });
      await page.mouse.move(box.x + box.width * c.x, box.y + box.height * c.y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * (c.x + 0.05), box.y + box.height * (c.y - 0.02), { steps: 12 });
      await page.mouse.up();
      await page.waitForFunction(({ key, id }) => !!JSON.parse(localStorage.getItem(key) || '{}')[id], { key: layoutKey, id: o.object_id });
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), layoutKey);
      positions[o.object_id] = saved[o.object_id].position;
      assert.ok(Math.abs(positions[o.object_id].x - (o.position_x + 0.05)) < 0.01);
      assert.ok(Math.abs(positions[o.object_id].y - (o.position_y - 0.02)) < 0.01);
      const next = center(o, positions[o.object_id]);
      await page.mouse.click(box.x + box.width * next.x, box.y + box.height * next.y);
      await page.locator('.room-panel h2').filter({ hasText: o.interaction.title }).waitFor();
      if (await page.locator('.gift-dialog[open]').count()) await page.getByRole('button', { name: '关闭弹窗' }).click();
    }
    await page.reload(); await ready();
    await page.setViewportSize({ width: 390, height: 844 });
    const cat = world.objects.find(o => o.type === 'pet');
    const c = center(cat, positions[cat.object_id]);
    await page.locator('canvas').scrollIntoViewIfNeeded();
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + box.width * c.x, box.y + box.height * c.y);
    await page.getByRole('heading', { name: cat.interaction.title, exact: true }).waitFor();
    await page.getByRole('button', { name: '恢复默认摆放' }).click();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), layoutKey), {});
    await context.close();

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobile = await touch.newPage();
    await mobile.goto(`${url}/world-demo`);
    await mobile.locator('.canvas-status').filter({ hasText: '房间已就绪' }).waitFor();
    await mobile.locator('canvas').scrollIntoViewIfNeeded();
    const rect = await mobile.locator('canvas').boundingBox();
    const start = center(cat, { x: cat.position_x, y: cat.position_y });
    const cdp = await touch.newCDPSession(mobile);
    const x = rect.x + rect.width * start.x, y = rect.y + rect.height * start.y;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 3, y: y - i * 2 }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await mobile.waitForFunction(({ key, id }) => !!JSON.parse(localStorage.getItem(key) || '{}')[id], { key: layoutKey, id: cat.object_id });
    const saved = await mobile.evaluate(key => JSON.parse(localStorage.getItem(key)), layoutKey);
    assert.ok(saved[cat.object_id].position.x > cat.position_x + 0.05);
    await mobile.screenshot({ path: '.room-qa/room-touch-drag.png', fullPage: true });
    await touch.close();
    assert.deepEqual(errors, []);
    console.log('PASS: five objects drag, click after drag, saved placement, resized hit alignment, default placement reset, mobile touch drag');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
