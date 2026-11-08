// Default: deterministic local UI check. ROOM_AGENT_LIVE=1 makes a real, paid MiMo call.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { confirmPreview } = require('./room-editor-browser-helpers.cjs');
const { generatedRoomDesign } = require('../.room-qa/generated-state/room/agent/generatedExample.js');
const { roomFromDesign } = require('../.room-qa/generated-state/room/agent/design.js');
const base = process.env.ROOM_URL || 'http://127.0.0.1:3100';
const live = process.env.ROOM_AGENT_LIVE === '1';
const saved = process.env.ROOM_GENERATED_RESULT;
const fixture = saved ? JSON.parse(fs.readFileSync(saved, 'utf8')) : { ...roomFromDesign(generatedRoomDesign()), run: { id: 'generated-browser', model: 'test-model', attempts: 1, durationMs: 1234, totalTokens: 123, input: 'text' } };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOM_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', acceptDownloads: true });
    if (!live) await context.route('**/api/room-agent', route => route.fulfill({ json: route.request().method() === 'GET' ? { configured: true } : fixture }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/room-3d');
    const prompt = process.env.ROOM_GENERATED_PROMPT || '生成一个宽7.4米、深6.4米、高4.6米的loft房间。后方有架空木平台，平台顶面高2.2米，有立柱和前侧护栏，右侧一段实际踏步的楼梯接到平台入口。平台上一张单人床，下方一张沙发；左侧矮柜上有带底座的电视，前方茶桌上有一个陶瓷花瓶。没有的模型请自行创建素材，不要省略楼梯、平台、栏杆、电视和花瓶。留出正常通路，保留相框、信件与CD机交互。';
    await page.locator('textarea').fill(prompt);
    if (process.env.ROOM_REFERENCE_FILE) {
      await page.locator('#room-agent-reference').setInputFiles(path.resolve(process.env.ROOM_REFERENCE_FILE));
      await page.getByAltText('房间参考照片').waitFor();
      await page.waitForFunction(() => !document.querySelector('#room-agent-reference').disabled);
    }
    const responseEvent = page.waitForResponse(r => r.url().endsWith('/api/room-agent') && r.request().method() === 'POST' && r.status() !== 202, { timeout: 600000 });
    await page.getByRole('button', { name: '生成房间', exact: true }).click();
    const response = await responseEvent, result = await response.json();
    assert.equal(response.status(), 200, result.error?.message || 'generation failed');
    roomFromDesign(result.design);
    assert.ok(result.design.assets && Object.keys(result.design.assets).length >= 3);
    const generated = result.definition.nodes.filter(n => n.model === 'generated');
    assert.ok(generated.length >= 3);
    if (!process.env.ROOM_REFERENCE_FILE && !saved) {
      assert.ok(result.definition.nodes.some(n => n.model === 'bed' && n.parent), 'Loft bed must be elevated by a real support');
      assert.ok(generated.some(n => n.geometry.parts.length >= 8), 'Major multi-part structure must be present');
    }
    await confirmPreview(page);
    await page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    const artifact = live ? 'generated-live' : saved ? 'generated-replay' : 'generated-fixture';
    fs.writeFileSync(`.room-qa/${artifact}.json`, JSON.stringify(result, null, 2));
    await page.screenshot({ path: `.room-qa/${artifact}-desktop.png`, fullPage: true });
    for (const name of ['相框', '信件', 'CD 机']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.locator('dialog[open]').waitFor();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('promised-land:room-agent:v1'))).design.assets, result.design.assets);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `.room-qa/${artifact}-mobile.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('promised-land:room-agent:v1'))).design.assets, result.design.assets);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: live ? 'PASS: live MiMo generated assets and browser workflow' : 'PASS: generated asset browser workflow', run: result.run, assets: Object.values(result.design.assets).map(a => a.label), generatedInstances: generated.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
