const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { imageDifference } = require('./room-test-image.cjs');
const url = process.env.ROOM_URL || 'http://localhost:3000';

(async () => {
  const THREE = await import('three');
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const errors = [];
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    const ready = p => p.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    const canvas = page.locator('.room3d-stage canvas');
    const close = async () => { await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click(); };
    const open = async name => {
      await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('dialog').waitFor();
      if (await page.getByRole('dialog').locator('img').count()) await page.getByRole('dialog').locator('img').evaluate(image => image.decode());
    };
    await page.goto(url + '/room-3d'); await ready(page);
    const original = await canvas.screenshot();
    for (const [name, file] of [['CD 机', 'cd'], ['相框', 'frame'], ['信件', 'letter']]) {
      await open(name);
      assert.equal(await page.locator('.room3d-objects button').filter({ hasText: name }).getAttribute('aria-pressed'), 'true');
      assert.ok(await imageDifference(page, original, await canvas.screenshot()) > 8, 'Object receives a genuine close-up');
      await page.screenshot({ path: `.room-qa/focus-${file}-desktop.png`, fullPage: true });
      await close();
      assert.ok(await imageDifference(page, original, await canvas.screenshot()) < .5, 'Closing restores previous room view');
    }
    await page.getByRole('button', { name: '开灯', exact: true }).click();
    await page.getByRole('button', { name: '返回房间', exact: true }).waitFor();
    await page.getByRole('button', { name: '关灯', exact: true }).click();
    await page.getByRole('button', { name: '返回房间', exact: true }).click();
    assert.ok(await imageDifference(page, original, await canvas.screenshot()) < .5);
    await page.getByRole('button', { name: '放大', exact: true }).click();
    const zoomed = await canvas.screenshot();
    await open('CD 机'); await close();
    assert.ok(await imageDifference(page, zoomed, await canvas.screenshot()) < .5, 'Return preserves a manually adjusted camera');
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(url + '/room-3d'); await ready(mobile);
    const mobileCanvas = mobile.locator('canvas'), before = await mobileCanvas.screenshot();
    const bounds = await mobileCanvas.boundingBox(), camera = new THREE.PerspectiveCamera(35, bounds.width / bounds.height, .1, 80);
    const distance = Math.min(23, Math.max(12, 7.1 / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2)) * camera.aspect)));
    camera.position.copy(new THREE.Vector3(.84, .72, 1.15).normalize().multiplyScalar(distance)).add(new THREE.Vector3(0, 1, 0)); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
    const point = new THREE.Vector3(-.25, .746, .17).project(camera);
    await mobile.touchscreen.tap(bounds.x + (point.x + 1) / 2 * bounds.width, bounds.y + (1 - point.y) / 2 * bounds.height);
    const dialog = mobile.getByRole('dialog', { name: 'CD 机', exact: true }); await dialog.waitFor();
    assert.ok(await imageDifference(mobile, before, await mobileCanvas.screenshot()) > 8);
    const panel = await dialog.boundingBox(); assert.ok(panel.y > bounds.y + bounds.height * .4, 'Phone sheet leaves the upper model visible');
    await mobile.screenshot({ path: '.room-qa/focus-cd-mobile.png', fullPage: true });
    await dialog.getByRole('button', { name: '关闭', exact: true }).tap();
    assert.ok(await imageDifference(mobile, before, await mobileCanvas.screenshot()) < .5);
    await mobile.getByRole('button', { name: '相框', exact: true }).tap(); await mobile.getByRole('dialog').waitFor();
    await mobile.getByRole('dialog').locator('img').evaluate(image => image.decode());
    await mobile.screenshot({ path: '.room-qa/focus-frame-mobile.png', fullPage: true });
    await mobile.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).tap();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mobileContext.close();

    const animated = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    animated.on('pageerror', e => errors.push(e.message));
    await animated.goto(url + '/room-3d'); await ready(animated);
    const starting = await animated.locator('canvas').screenshot();
    await animated.getByRole('button', { name: 'CD 机', exact: true }).click();
    await animated.getByRole('dialog').waitFor(); await animated.waitForTimeout(650);
    assert.ok(await imageDifference(animated, starting, await animated.locator('canvas').screenshot()) > 8);
    await animated.keyboard.press('Escape'); await animated.waitForTimeout(650);
    assert.ok(await imageDifference(animated, starting, await animated.locator('canvas').screenshot()) < .5);
    await animated.getByRole('button', { name: 'CD 机', exact: true }).click();
    await animated.keyboard.press('Escape'); await animated.waitForTimeout(650);
    assert.equal(await animated.getByRole('dialog').count(), 0);
    assert.ok(await imageDifference(animated, starting, await animated.locator('canvas').screenshot()) < .5, 'Closing during a transition leaves no stale focus');
    await animated.close(); assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile object close-ups, native touch picking, panel-aware framing, camera restore including manual zoom, lamp return, reduced motion, animated focus and interrupted close');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
