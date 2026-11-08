// Uses the optional Playwright / ROOM_URL / ROOM_CHROMIUM setup of the room checks.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { bedroomRoomDesign, roomFromDesign } = require('../.room-qa/agent-state/room/agent/design.js');
const fixture = { ...roomFromDesign(bedroomRoomDesign()), run: { id: 'navigation', model: 'test', attempts: 1, durationMs: 1, totalTokens: 1 } };
const url = process.env.ROOM_URL || 'http://localhost:3000';

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ROOM_CHROMIUM ? { executablePath: process.env.ROOM_CHROMIUM } : {}) });
  try {
    for (const width of [1440, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route('**/api/room-agent', route => route.fulfill({ json: route.request().method() === 'GET' ? { configured: true } : fixture }));
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const edit = async () => {
        await page.getByRole('link', { name: '制作礼物', exact: true }).click();
        await page.waitForURL('**/gift/edit?**');
        await page.waitForFunction(() => document.querySelector('.winter-room-actions a:last-child')?.getAttribute('aria-disabled') === 'false');
      };
      const leave = async locator => {
        // A full document navigation must work even if native confirms are suppressed.
        await page.evaluate(() => { window.confirm = () => false; window.__editorDocument = true; });
        await locator.click();
        await page.waitForURL(url + '/');
        await page.getByRole('link', { name: '制作礼物', exact: true }).waitFor();
        assert.equal(await page.evaluate(() => window.__editorDocument), undefined);
      };
      await page.goto(url);
      await edit();
      await page.locator('.winter-gift-details > summary').click();
      const recipient = page.getByRole('textbox', { name: '送给谁', exact: true });
      await recipient.fill('未保存昵称');
      await page.waitForFunction(() => document.querySelector('.winter-room-actions a:last-child')?.getAttribute('aria-disabled') === 'true');
      await page.getByRole('link', { name: '完成', exact: true }).click({ force: true });
      await page.getByRole('alert').filter({ hasText: '请先保存或撤销' }).waitFor();
      await leave(page.getByRole('link', { name: '返回首页', exact: true }));
      assert.equal(await page.evaluate(() => localStorage.getItem('promised-land:gift:winter-local-v1')), null);

      await edit();
      await page.locator('.winter-gift-details > summary').click();
      await recipient.fill('已保存昵称');
      await page.getByRole('button', { name: '保存信息', exact: true }).click();
      await page.locator('.winter-gift-details [role=status]').getByText('已保存', { exact: true }).waitFor();
      await leave(page.getByRole('link', { name: '返回首页', exact: true }));
      const persisted = await page.evaluate(() => localStorage.getItem('promised-land:gift:winter-local-v1'));
      assert.equal(JSON.parse(persisted).details.recipient, '已保存昵称');

      await edit();
      await page.getByRole('textbox', { name: '房间描述', exact: true }).fill('安静的卧室');
      await page.getByRole('button', { name: '生成房间', exact: true }).click();
      await page.locator('.room-editor-savebar').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `.room-qa/gift-navigation-${width}.png`, fullPage: true });
      await leave(page.locator('.winter-brand'));
      assert.equal(await page.evaluate(() => localStorage.getItem('promised-land:gift:winter-local-v1')), persisted);
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS ${width}px: return home and brand perform full navigation without confirmation, saved data retained, unsaved drafts not persisted, forward actions explain blocking`);
    }
    const noJS = await browser.newContext({ javaScriptEnabled: false });
    const page = await noJS.newPage();
    await page.goto(url + '/gift/edit?mode=sender&gift=winter-local-v1');
    await page.getByRole('link', { name: '返回首页', exact: true }).click();
    await page.waitForURL(url + '/');
    await page.getByRole('link', { name: '制作礼物', exact: true }).waitFor();
    await noJS.close();
    console.log('PASS: return home also works without JavaScript');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
