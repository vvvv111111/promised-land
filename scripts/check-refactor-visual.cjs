// Capture before a structural change, then compare against the same production browser.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { imageDifference } = require('./room-test-image.cjs');
const base = process.env.ROOM_BASELINE_DIR || '.room-qa/refactor-before';
(async () => {
  fs.mkdirSync(base, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.ROOM_CHROMIUM });
  try {
    for (const [label, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 390, height: 844 }]]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      async function capture(name) {
        const actual = await page.screenshot({ fullPage: true });
        const file = `${base}/${label}-${name}.png`;
        if (process.env.ROOM_CAPTURE_BASELINE === '1') fs.writeFileSync(file, actual);
        else {
          const diff = await imageDifference(page, fs.readFileSync(file), actual);
          assert.ok(diff < .5, `${label}/${name}: pixel difference ${diff}`);
          console.log(`${label}/${name}: ${diff.toFixed(4)}`);
        }
      }
      await page.goto((process.env.ROOM_URL || 'http://localhost:3217') + '/');
      await page.locator('.gift-home').waitFor(); await page.evaluate(() => document.fonts.ready);
      await capture('home');
      await page.goto((process.env.ROOM_URL || 'http://localhost:3217') + '/room-3d');
      await page.waitForFunction(() => document.querySelector('.room3d-actions button')?.disabled === false);
      await capture('room');
      for (const [name, id] of [['CD 机', 'cd'], ['相框', 'frame']]) {
        await page.getByRole('button', { name, exact: true }).click();
        const dialog = page.getByRole('dialog'); await dialog.waitFor();
        for (const img of await dialog.locator('img').all()) await img.evaluate(el => el.decode());
        await capture(id);
        await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      }
      assert.deepEqual(errors, []); await context.close();
    }
    console.log('PASS: refactor visual baseline');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
