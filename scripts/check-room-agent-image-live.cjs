// Explicit live check: sends only the selected reference to MiMo and consumes API quota.
// The default is a public project fixture, never a personal photo.
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.ROOM_URL || 'http://127.0.0.1:3100';
const reference = path.resolve(process.env.ROOM_REFERENCE_FILE || 'public/assets/warm-room-v1/room_warm_01.png');
// Replay an already verified provider result for UI checks without another API charge.
const replay = process.env.ROOM_AGENT_REPLAY_FILE;

(async () => {
  const status = await fetch(base + '/api/room-agent').then(r => r.json());
  assert.equal(status.configured, true, 'Configure server-side MiMo credentials first');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOM_CHROMIUM || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    if (replay) await context.route('**/api/room-agent', route => route.fulfill({ json: route.request().method() === 'POST' ? JSON.parse(fs.readFileSync(replay, 'utf8')) : status }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/room-3d');
    await page.locator('#room-agent-reference').setInputFiles(reference);
    await page.getByAltText('房间参考照片').waitFor();
    await page.waitForFunction(() => !document.querySelector('#room-agent-reference').disabled);
    await page.locator('textarea').fill('参考照片中的布局、家具、窗户、墙面与木色。只放照片中主要可见的家具，必要时补充纪念物承托面，保留相框、信件和 CD 机交互。不能精确还原的部分请说明。');
    const responseEvent = page.waitForResponse(r => r.url().endsWith('/api/room-agent') && r.request().method() === 'POST', { timeout: 185000 });
    await page.getByRole('button', { name: '生成房间', exact: true }).click();
    const response = await responseEvent, result = await response.json();
    assert.equal(response.status(), 200, result.error?.message || 'Live generation failed');
    assert.equal(result.run.input, 'image');
    assert.ok(result.run.referenceDescription?.length > 0);
    assert.ok(!JSON.stringify(result).includes('data:image/'), 'Raw reference must not appear in the result');
    await page.getByText('已生成并保存到本浏览器。', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
    await page.screenshot({ path: '.room-qa/agent-image-live-desktop.png', fullPage: true });
    fs.writeFileSync('.room-qa/agent-image-live.json', JSON.stringify(result, null, 2));
    for (const name of ['相框', '信件', 'CD 机']) {
      await page.getByRole('button', { name, exact: true }).click();
      await page.locator('dialog[open]').waitFor();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: '.room-qa/agent-image-live-mobile.png', fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.reload();
    await page.getByText(/已恢复上次(?:生成|保存)的房间。/).waitFor();
    assert.equal(await page.getByAltText('房间参考照片').count(), 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ status: replay ? 'PASS: saved MiMo photo result replay → rendered interactions → persisted result' : 'PASS: reference upload → live MiMo vision → validated 3D room → persisted result', ...result.run, summary: result.design.summary }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
