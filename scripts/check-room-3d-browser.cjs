const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const demoGift = require('../src/world/demo-gift.json');
const legacyRoom = structuredClone(require('../src/room/default-room.json'));
const oldFrame = legacyRoom.nodes.find(n => n.id === 'frame');
delete oldFrame.wall; delete oldFrame.scale;
Object.assign(oldFrame, { parent: 'cabinet', surface: 'top', position: [-.39, 1.43, .01], rotation: [-.13, -.15, 0] });
const url = process.env.ROOM_URL || 'http://localhost:3000';
const key = 'promised-land:gift:winter-local-v1';

(async () => {
  const THREE = await import('three');
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ gift, key, legacyRoom }) => {
      if (localStorage.getItem(key)) return;
      const image = document.createElement('canvas'); image.width = 80; image.height = 60;
      const ctx = image.getContext('2d'); ctx.fillStyle = '#648766'; ctx.fillRect(0, 0, 40, 60); ctx.fillStyle = '#b77656'; ctx.fillRect(40, 0, 40, 60);
      gift.gift_id = 'winter-local-v1';
      gift.room = legacyRoom;
      gift.details = { recipient: 'test', sender: 'test', memory: 'saved memory', extra_photos: [] };
      gift.object_contents['sealed-letter'].body = 'saved 3D letter';
      gift.object_contents['sunset-frame'].photo = image.toDataURL();
      localStorage.setItem(key, JSON.stringify(gift));
    }, { gift: demoGift, key, legacyRoom });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false, { timeout: 45000 });
    const canvas = page.locator('.room3d-stage canvas');
    const screenshot = () => canvas.screenshot();
    async function restored(original) {
      const current = await screenshot();
      const difference = await page.evaluate(async ([first, second]) => {
        const pixels = async source => {
          const image = new Image(); image.src = 'data:image/png;base64,' + source; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data;
        };
        const a = await pixels(first), b = await pixels(second);
        let total = 0; for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[i]);
        return total / a.length;
      }, [original.toString('base64'), current.toString('base64')]);
      assert.ok(difference < .5, 'Reset restores the camera within subpixel GPU rendering tolerance: ' + difference);
    }
    await page.goto(url + '/room-3d?mode=recipient'); await ready();
    assert.equal(await canvas.count(), 1);
    const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
    const original = await screenshot();
    await page.screenshot({ path: '.room-qa/3d-desktop.png', fullPage: true });
    await page.getByRole('button', { name: '放大', exact: true }).click();
    assert.ok(!(await screenshot()).equals(original), 'Perspective camera zoom changes the scene');
    await page.getByRole('button', { name: '复位视角', exact: true }).click();
    await restored(original);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * .48, box.y + box.height * .52); await page.mouse.down();
    await page.mouse.move(box.x + box.width * .64, box.y + box.height * .48, { steps: 12 }); await page.mouse.up();
    assert.ok(!(await screenshot()).equals(original), 'Drag rotates the real camera');
    assert.equal(await page.getByRole('dialog').count(), 0, 'Rotation does not open content');
    await page.getByRole('button', { name: '复位视角', exact: true }).click();
    await canvas.focus(); await page.keyboard.press('ArrowRight');
    assert.ok(!(await screenshot()).equals(original), 'Keyboard rotates the room');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab'); // Move the focus ring outside the canvas before pixel comparison.
    await restored(original);
    console.log('PASS: 3D camera zoom/orbit/reset/keyboard');

    // Project known points on physical objects, then exercise native raycasting.
    async function clickObject(point) {
      const box = await canvas.boundingBox();
      const camera = new THREE.PerspectiveCamera(35, box.width / box.height, .1, 80);
      camera.position.copy(new THREE.Vector3(.84, .72, 1.15).normalize().multiplyScalar(12)).add(new THREE.Vector3(0, 1, 0));
      camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
      const projected = new THREE.Vector3(...point).project(camera);
      await page.mouse.click(box.x + (projected.x + 1) / 2 * box.width, box.y + (1 - projected.y) / 2 * box.height);
    }
    await clickObject([-1.35, 1.9, -2.267]);
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    assert.equal(await dialog.getByAltText('礼物相框中的照片').count(), 1);
    assert.equal(await dialog.getByRole('button', { name: '编辑相框', exact: true }).count(), 0);
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await restored(original);
    await clickObject([-.574, .664, .491]);
    await dialog.waitFor(); assert.ok((await dialog.innerText()).includes('saved 3D letter'));
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.keyboard.press('Tab');
    await restored(original);
    await clickObject([2.26, 1.60, -1.97]);
    assert.equal(await page.getByRole('button', { name: /^(开灯|关灯|台灯|返回房间)$/ }).count(), 0);
    assert.ok(!(await screenshot()).equals(original), 'Lamp changes actual scene lighting');
    await clickObject([2.26, 1.60, -1.97]);
    await restored(original);
    assert.deepEqual(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore, 'Preview does not write any gift, placement or collection state');
    await page.getByRole('link', { name: '返回首页', exact: true }).click();
    await page.waitForURL(url + '/');
    await page.goBack(); await ready();
    assert.equal(await canvas.count(), 1, 'Remount has a single renderer');
    await page.reload(); await ready();
    await page.getByRole('button', { name: '信件', exact: true }).click();
    await dialog.waitFor(); assert.ok((await dialog.innerText()).includes('saved 3D letter'));
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS: physical object raycasting, saved content, lamp and remount');
    await context.close();

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', e => errors.push(e.message));
    await mobile.goto(url + '/room-3d?mode=recipient');
    await mobile.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    const mobileCanvas = mobile.locator('.room3d-stage canvas'), bounds = await mobileCanvas.boundingBox();
    const before = await mobileCanvas.screenshot();
    const cdp = await mobileContext.newCDPSession(mobile);
    const a = { x: bounds.x + bounds.width * .35, y: bounds.y + bounds.height * .5 }, b = { x: bounds.x + bounds.width * .65, y: bounds.y + bounds.height * .5 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...a, id: 1 }, { ...b, id: 2 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x - i * 3, y: a.y, id: 1 }, { x: b.x + i * 3, y: b.y, id: 2 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(!(await mobileCanvas.screenshot()).equals(before), 'Mobile pinch zooms the camera');
    assert.equal(await mobile.getByRole('dialog').count(), 0);
    await mobile.getByRole('button', { name: '复位视角', exact: true }).click();
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mobile.screenshot({ path: '.room-qa/3d-mobile.png', fullPage: true });
    await mobileContext.close();

    const unsupported = await browser.newContext();
    await unsupported.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /^webgl/.test(type) ? null : original.call(this, type, ...args); };
    });
    const fallback = await unsupported.newPage();
    await fallback.goto(url + '/room-3d?mode=recipient'); await fallback.locator('.room3d-message[role="alert"]').waitFor();
    assert.equal(await fallback.getByRole('button', { name: '放大', exact: true }).isDisabled(), true);
    await fallback.getByRole('button', { name: '重试', exact: true }).click();
    await fallback.locator('.room3d-message[role="alert"]').waitFor();
    assert.equal(await fallback.locator('.room3d-stage canvas').count(), 0);
    await unsupported.close();
    assert.deepEqual(errors, []);
    console.log('PASS: actual WebGL room, orbit/zoom/reset/keyboard, native 3D object picking, saved photo/letter read-only, lamp, remount, mobile pinch without clicks, no overflow, unavailable-WebGL fallback/retry');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
