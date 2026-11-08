const { chromium } = require('playwright');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { roomFromDesign } = require('../.room-qa/agent-state/room/agent/design.js');
const { studyRoomDesign, diningRoomDesign } = require('../.room-qa/agent-state/room/agent/examples.js');
const base = process.env.ROOM_URL || 'http://127.0.0.1:3110', key = 'promised-land:room-agent:v1';
const fixture = make => ({ ...roomFromDesign(make()), run: { id: 'flexible-browser', model: 'test-model', attempts: 1, durationMs: 1000, totalTokens: 100 } });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOM_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
    const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
    let current, request;
    await context.route('**/api/room-agent', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { configured: true } });
      request = route.request().postDataJSON(); return route.fulfill({ json: current });
    });
    const ready = () => page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    await page.goto(base + '/room-3d'); await ready();
    for (const [kind, label, make] of [['study', '双人书房', studyRoomDesign], ['dining', '四人餐厅', diningRoomDesign]]) {
      current = fixture(make);
      await page.getByRole('button', { name: label, exact: true }).click();
      await page.getByRole('button', { name: '生成房间', exact: true }).click();
      await confirmPreview(page); await ready();
      assert.ok(request.prompt.includes(label));
      assert.deepEqual(JSON.parse(await page.evaluate(k => localStorage.getItem(k), key)).definition, current.definition);
      await page.reload(); await ready();
      assert.deepEqual(JSON.parse(await page.evaluate(k => localStorage.getItem(k), key)).design, current.design);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        const labels = await page.locator('.room-agent-examples button').allTextContents();
        assert.deepEqual(labels, ['午后配色', '双窗卧室', '双人书房', '四人餐厅']);
        if (width !== 320) await page.screenshot({ path: `.room-qa/flexible-${kind}-${width === 1440 ? 'desktop' : 'mobile'}.png`, fullPage: true });
      }
      for (const name of ['相框', '信件', 'CD 机']) {
        await page.getByRole('button', { name, exact: true }).click(); await page.locator('dialog[open]').waitFor();
        await page.getByRole('button', { name: '关闭', exact: true }).click();
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    // Render successful real MiMo responses as well as deterministic test fixtures.
    for (const kind of ['study', 'dining']) {
      const file = `.room-qa/flexible-${kind}-live.json`;
      if (!fs.existsSync(file)) continue;
      const result = JSON.parse(fs.readFileSync(file, 'utf8'));
      await page.evaluate(({ key, result }) => localStorage.setItem(key, JSON.stringify(result)), { key, result });
      await page.reload(); await ready();
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await page.screenshot({ path: `.room-qa/flexible-${kind}-live-${width === 1440 ? 'desktop' : 'mobile'}.png`, fullPage: true });
      }
    }
    await context.close(); assert.deepEqual(errors, []);
    console.log('PASS: flexible example prompts, generation, new-schema persistence/reload, gift-object focus, desktop/mobile layouts and live scene rendering');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
