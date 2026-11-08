// Uses the same optional Playwright / ROOM_URL / ROOM_CHROMIUM setup as the room checks.
const { chromium } = require('playwright');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { bedroomRoomDesign, roomFromDesign } = require('../.room-qa/agent-state/room/agent/design.js');
const fixture = { ...roomFromDesign(bedroomRoomDesign()), run: { id: 'main-flow', model: 'test', attempts: 1, durationMs: 1, totalTokens: 1 } };
const url = process.env.ROOM_URL || 'http://localhost:3000';
fs.mkdirSync('.room-qa', { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.route('**/api/room-agent', route => route.fulfill({ json: route.request().method() === 'GET' ? { configured: true } : fixture }));
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const ready = () => page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false, null, { timeout: 45000 });
    const giftKey = 'promised-land:gift:winter-local-v1';
    const memory = '一起走过的那条街。';
    const letter = '这封信由用户填写。\n不会被默认文案替换。';
    await page.goto(url);
    await page.getByRole('link', { name: '制作礼物', exact: true }).click();
    await page.getByRole('textbox', { name: '送给谁', exact: true }).fill('小河');
    await page.getByRole('textbox', { name: '你的名字（选填）', exact: true }).fill('小林');
    await page.getByRole('textbox', { name: '共同的回忆', exact: true }).fill(memory);
    await page.getByRole('textbox', { name: '写给对方的话', exact: true }).fill(letter);
    const photo = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const ctx = c.getContext('2d'); ctx.fillStyle = '#aec3a1'; ctx.fillRect(0, 0, 600, 400); return c.toDataURL('image/png'); });
    await page.locator('#photos').setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: Buffer.from(photo.split(',')[1], 'base64') });
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.waitForURL('**/gift/generating');
    await page.waitForFunction(() => document.querySelector('a[aria-disabled]')?.getAttribute('aria-disabled') === 'false');
    await page.getByRole('link', { name: '进入编辑', exact: true }).click();
    await page.waitForURL('**/gift/edit?**'); await ready();
    assert.equal(await page.locator('.winter-page-note').innerText(), '点击相框或信件编辑。');
    assert.equal(await page.getByRole('button', { name: '恢复默认摆放', exact: true }).count(), 0);
    assert.equal(await page.locator('.room-panel, [aria-label="物品介绍"]').count(), 0);

    // The generated room is bound to this gift and survives route changes.
    await page.getByRole('textbox', { name: '房间描述', exact: true }).fill('安静的卧室，有一张书桌。');
    await page.getByRole('button', { name: '生成房间', exact: true }).click();
    await confirmPreview(page); await ready();
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).room, giftKey), fixture.definition);
    assert.equal(await page.evaluate(() => localStorage.getItem('promised-land:room-agent:v1')), null);
    // Explicit room edit request, autosave, manual save, and crop persistence.
    await page.locator('.winter-edit-tools').getByRole('button', { name: '编辑信件', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: '编辑信件', exact: true }).click();
    const editedLetter = letter + '\n房间里追加的一行。';
    await dialog.getByRole('textbox', { name: '正文', exact: true }).fill(editedLetter);
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.locator('.winter-edit-tools').getByRole('button', { name: '编辑相框', exact: true }).click();
    await dialog.getByRole('button', { name: '编辑相框', exact: true }).click();
    await dialog.getByRole('slider', { name: '缩放', exact: true }).fill('1.6');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('link', { name: '完成', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '复制链接', exact: true }).isDisabled(), true);
    assert.ok((await page.locator('main').innerText()).includes('分享功能尚未开放'));
    assert.equal(await page.locator('#gift-link').count(), 0);
    assert.ok(!/localhost|127\.0\.0\.1|https?:\/\//.test(await page.locator('main').innerText()));
    await page.getByRole('link', { name: '预览礼物', exact: true }).click();
    await page.getByRole('heading', { name: '送给 小河', exact: true }).waitFor();
    await page.getByRole('link', { name: '打开水晶球', exact: true }).click(); await ready();
    assert.equal(await page.getByRole('button', { name: '恢复默认摆放' }).count(), 0);
    assert.equal(await page.locator('.room-agent').count(), 0);
    for (const name of ['相框', '信件', 'CD 机']) {
      await page.locator('.room3d-objects').getByRole('button', { name, exact: true }).click();
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('button', { name: /^编辑/ }).count(), 0);
      assert.equal(await dialog.locator('input[type=file]').count(), 0);
      if (name === '信件') assert.ok((await dialog.innerText()).includes(editedLetter));
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await page.getByRole('link', { name: '查看回忆', exact: true }).click();
    assert.ok((await page.locator('.winter-paper').innerText()).includes(memory));
    assert.equal(await page.locator('.winter-letter-text').textContent(), editedLetter);
    assert.equal(await page.locator('.winter-paper-sign').textContent(), '小林');
    const gift = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), giftKey);
    assert.equal(gift.object_contents['sunset-frame'].zoom, 1.6);
    assert.equal(gift.details.recipient, '小河');
    assert.equal(await page.locator('.winter-story-photos img').count(), 1);

    // All routes, both shipped sizes: same surface and font, no old theme or introductions.
    for (const [device, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      for (const step of ['home', 'create', 'generating', 'edit', 'complete', 'open', 'room', 'story']) {
        await page.goto(url + (step === 'home' ? '/' : '/gift/' + step));
        if (step === 'create') await page.waitForFunction(() => !document.querySelector('fieldset')?.disabled);
        if (step === 'edit' || step === 'room') await ready();
        if (step === 'story') await page.locator('.winter-paper').waitFor();
        if (step === 'home' || step === 'open') await page.locator('main img').evaluate(img => img.decode());
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, step + ' overflow');
        const style = await page.locator('main').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, font: getComputedStyle(el).fontFamily, heading: getComputedStyle(el.querySelector('h1')).fontFamily }));
        assert.equal(style.bg, 'rgb(247, 244, 237)', step + ' surface');
        assert.equal(style.font, style.heading, step + ' type');
        assert.equal(await page.locator('.room-panel, .winter-footer, .winter-snow').count(), 0);
        assert.ok(!/为一个人|留一盏灯|珍藏的心意|正在查看.*温柔/.test(await page.locator('main').innerText()));
        await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
        await page.screenshot({ path: `.room-qa/unified-${step}-${device}.png`, fullPage: true });
      }
    }
    // Direct story entry stays locked without collection progress.
    await page.evaluate(() => localStorage.removeItem('promised-land:gift:winter-local-v1:collection:v2'));
    await page.goto(url + '/gift/story');
    await page.getByText('查看三件纪念物后，可打开回忆。', { exact: true }).waitFor();
    assert.equal(await page.locator('.winter-paper').count(), 0);
    const personal = await page.evaluate(key => localStorage.getItem(key), giftKey);
    await page.goto(url);
    await page.getByRole('link', { name: '打开示例', exact: true }).click();
    await page.waitForURL('**/gift/open?gift=promised-land-example-v1');
    assert.ok(page.url().includes('gift=promised-land-example-v1'));
    await page.getByRole('heading', { name: '送给 你', exact: true }).waitFor();
    await page.getByRole('link', { name: '打开水晶球', exact: true }).click(); await ready();
    await page.locator('.room3d-objects').getByRole('button', { name: '信件', exact: true }).click();
    await dialog.waitFor(); assert.ok(!(await dialog.innerText()).includes(editedLetter));
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), giftKey), personal);
    assert.equal(await page.evaluate(() => localStorage.getItem('promised-land:gift:winter-local-v1:collection:v2')), null);
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: complete gift flow, explicit edit requests, user content and crop retained, recipient collection, story gate, disabled share placeholder without URL, all eight light-theme pages at desktop/mobile, no introductions or page errors');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
