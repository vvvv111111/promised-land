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
    async function clickLamp(p, touch = false) {
      const bounds = await p.locator('.room3d-stage canvas').boundingBox();
      const camera = new THREE.PerspectiveCamera(35, bounds.width / bounds.height, .1, 80);
      const distance = Math.min(23, Math.max(12, 7.1 / (2 * Math.tan(THREE.MathUtils.degToRad(35 / 2)) * camera.aspect)));
      camera.position.copy(new THREE.Vector3(.84, .72, 1.15).normalize().multiplyScalar(distance)).add(new THREE.Vector3(0, 1, 0));
      camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
      const point = new THREE.Vector3(2.26, 1.60, -1.97).project(camera);
      const x = bounds.x + (point.x + 1) / 2 * bounds.width, y = bounds.y + (1 - point.y) / 2 * bounds.height;
      if (touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
    }
    const close = async () => { await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click(); };
    const open = async name => {
      await page.getByRole('button', { name, exact: true }).click(); await page.getByRole('dialog').waitFor();
      if (await page.getByRole('dialog').locator('img').count()) await page.getByRole('dialog').locator('img').evaluate(image => image.decode());
    };
    await page.goto(url + '/room-3d?mode=recipient'); await ready(page);
    const original = await canvas.screenshot();
    for (const [name, file] of [['CD 机', 'cd'], ['相框', 'frame'], ['信件', 'letter']]) {
      await open(name);
      assert.equal(await page.locator('.room3d-objects button').filter({ hasText: name }).getAttribute('aria-pressed'), 'true');
      assert.ok(await imageDifference(page, original, await canvas.screenshot()) > 8, 'Object receives a genuine close-up');
      await page.screenshot({ path: `.room-qa/focus-${file}-desktop.png`, fullPage: true });
      await close();
      assert.ok(await imageDifference(page, original, await canvas.screenshot()) < .5, 'Closing restores previous room view');
    }
    assert.equal(await page.getByRole('button', { name: /^(开灯|关灯|台灯)$/ }).count(), 0);
    await clickLamp(page);
    assert.equal(await page.getByRole('button', { name: '返回房间', exact: true }).count(), 0, 'Lamp clicks do not focus or add return controls');
    assert.equal(await page.getByRole('dialog').count(), 0);
    assert.equal((await canvas.screenshot()).equals(original), false, 'Clicking the lamp changes its real light');
    await page.screenshot({ path: '.room-qa/lamp-click-desktop.png', fullPage: true });
    await clickLamp(page);
    assert.ok(await imageDifference(page, original, await canvas.screenshot()) < .5);
    await page.getByRole('button', { name: '放大', exact: true }).click();
    const zoomed = await canvas.screenshot();
    await open('CD 机'); await close();
    assert.ok(await imageDifference(page, zoomed, await canvas.screenshot()) < .5, 'Return preserves a manually adjusted camera');
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(url + '/room-3d?mode=recipient'); await ready(mobile);
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
    await clickLamp(mobile, true);
    assert.equal(await mobile.getByRole('button', { name: /^(开灯|关灯|台灯|返回房间)$/ }).count(), 0);
    assert.equal((await mobileCanvas.screenshot()).equals(before), false, 'Touching the lamp toggles its light');
    await mobile.screenshot({ path: '.room-qa/lamp-click-mobile.png', fullPage: true });
    await clickLamp(mobile, true);
    assert.ok(await imageDifference(mobile, before, await mobileCanvas.screenshot()) < .5, 'A second tap switches off without moving the camera');
    await mobile.getByRole('button', { name: '相框', exact: true }).tap(); await mobile.getByRole('dialog').waitFor();
    await mobile.getByRole('dialog').locator('img').evaluate(image => image.decode());
    await mobile.screenshot({ path: '.room-qa/focus-frame-mobile.png', fullPage: true });
    await mobile.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).tap();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mobileContext.close();

    const animated = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
    animated.on('pageerror', e => errors.push(e.message));
    await animated.goto(url + '/room-3d?mode=recipient'); await ready(animated);
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
    console.log('PASS: desktop/mobile object close-ups, native touch picking, panel-aware framing, camera restore, direct lamp toggle without controls/focus, reduced motion and interrupted close');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
