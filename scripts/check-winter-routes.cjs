const assert = require('node:assert/strict');
const base = process.env.GIFT_URL || 'http://localhost:3000';
(async () => {
  const pages = {
    '/': '不会融化的雪',
    '/gift/create': '创造你们的礼物',
    '/gift/generating': '未调用真实 AI',
    '/gift/edit?mode=sender&gift=winter-local-v1': '把心意',
    '/gift/complete': '不支持跨设备',
    '/gift/open': '开启礼物',
    '/gift/room?mode=recipient&gift=winter-local-v1': '纪念物品收集进度',
    '/gift/story': '正在展开信纸',
    '/world-demo': '世界演示',
  };
  for (const [path, expected] of Object.entries(pages)) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).includes(expected), `${path} missing ${expected}`);
  }
  for (const [path, expected] of [
    ['/gift/room', '/gift/room?mode=recipient&gift=winter-local-v1'],
    ['/gift/room?mode=sender&gift=other', '/gift/room?mode=recipient&gift=winter-local-v1'],
    ['/gift/edit?mode=recipient', '/gift/edit?mode=sender&gift=winter-local-v1'],
  ]) {
    const response = await fetch(base + path, { redirect: 'manual' });
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get('location'), expected);
  }
  assert.equal((await fetch(base + '/gift/missing')).status, 404);
  const image = await fetch(base + '/images/winter-globe.png');
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  console.log('PASS: eight page responses, original room route, canonical role/gift redirects, 404, hero asset. HTTP checks only; no browser interaction or visual verification.');
})().catch(error => { console.error(error); process.exitCode = 1; });
