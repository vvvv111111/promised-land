// Explicit opt-in: real photo generation, followed by an edit of that same saved room.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const base = process.env.ROOM_URL || 'http://127.0.0.1:3111';
if (process.env.ROOM_AGENT_LIVE !== '1') throw Error('Set ROOM_AGENT_LIVE=1 for real MiMo calls.');
const key = 'promised-land:room-agent:v1';
const seedFile = process.env.ROOM_RELIABILITY_SEED;
const directory = `.room-qa/room-reliability${seedFile ? '-edit' : ''}`;

(async () => {
  fs.mkdirSync(directory, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOM_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], results = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(60_000);
    await page.goto(base + '/room-3d');
    await page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    async function generate(kind) {
      const finalResponse = page.waitForResponse(response => response.url().endsWith('/api/room-agent') && response.request().method() === 'POST' && response.status() !== 202, { timeout: 200_000 });
      // A failed click must not leave an unhandled response waiter after browser cleanup.
      finalResponse.catch(() => {});
      await page.getByRole('button', { name: '生成房间', exact: true }).click();
      const response = await finalResponse, data = await response.json();
      fs.writeFileSync(`${directory}/live-${kind}.json`, JSON.stringify(data, null, 2));
      assert.equal(response.status(), 200, JSON.stringify(data.error));
      await confirmPreview(page);
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      assert.deepEqual(saved.design, data.design);
      results.push({ kind, seconds: data.run.durationMs / 1000, attempts: data.run.attempts, furniture: data.design.furniture.length, corrections: data.run.positionCorrections || 0 });
      console.log(JSON.stringify(results.at(-1)));
      return data;
    }
    if (seedFile) {
      const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
      await page.route('**/api/room-agent', route => route.request().method() === 'POST' ? route.fulfill({ json: seed }) : route.continue());
      await page.locator('#room-agent-prompt').fill('载入验证用房间');
    } else {
      await page.locator('#room-agent-reference').setInputFiles('public/assets/warm-room-v1/room_warm_01.png');
      await page.getByAltText('房间参考照片').waitFor();
      await page.waitForFunction(() => !document.querySelector('#room-agent-reference').disabled);
    }
    const photo = await generate(seedFile ? 'seed' : 'photo');
    if (seedFile) await page.unroute('**/api/room-agent');
    await page.screenshot({ path: `${directory}/photo-desktop.png`, fullPage: true });
    if (!seedFile) await page.getByRole('button', { name: '移除照片', exact: true }).click();
    await page.locator('#room-agent-prompt').fill('只把墙面配色改成 #e6d6c5，其他家具、房间尺寸、窗户、布局和光照全部保持当前房间不变。');
    const edit = await generate('edit');
    assert.deepEqual(edit.design.dimensions, photo.design.dimensions);
    assert.deepEqual(edit.design.architecture, photo.design.architecture);
    const layout = design => design.furniture.map(({ colors, ...item }) => item);
    assert.deepEqual(layout(edit.design), layout(photo.design), 'A color edit preserves every furniture identity and placement');
    assert.equal(edit.design.palette.plaster, '#e6d6c5');
    await page.screenshot({ path: `${directory}/edit-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${directory}/edit-mobile.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    assert.deepEqual((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)).design, edit.design);
    assert.deepEqual(errors, []);
    fs.writeFileSync(`${directory}/live-report.json`, JSON.stringify({ mode: seedFile ? 'live_edit_of_seed' : 'live_mimo', results, errors, reload: true }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
