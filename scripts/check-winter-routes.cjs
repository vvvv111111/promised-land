const assert = require('node:assert/strict');
const base = process.env.GIFT_URL || 'http://localhost:3000';
(async () => {
  const pages = {
    '/': 'promised land',
    '/gift/create': '制作礼物',
    '/gift/generating': '未使用 AI 生成',
    '/gift/edit?mode=sender&gift=winter-local-v1': '编辑礼物',
    '/gift/complete': '分享功能尚未开放',
    '/gift/open': '打开水晶球',
    '/gift/room?mode=recipient&gift=winter-local-v1': '纪念物品收集进度',
    '/gift/story': '读取中',
    '/world-demo': '查看礼物',
  };
  for (const [path, expected] of Object.entries(pages)) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.ok((await response.text()).includes(expected), `${path} missing ${expected}`);
  }
  for (const [path, expected] of [
    ['/gift/room', '/gift/room?mode=recipient&gift=winter-local-v1'],
    ['/gift/room?mode=sender&gift=other', '/gift/room?mode=recipient&gift=other'],
    ['/gift/edit?mode=recipient', '/gift/edit?mode=sender&gift=winter-local-v1'],
  ]) {
    const response = await fetch(base + path, { redirect: 'manual' });
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get('location'), expected);
  }
  assert.equal((await fetch(base + '/gift/missing')).status, 404);
  const home = await (await fetch(base + '/')).text();
  assert.ok(home.includes('制作礼物') && home.includes('打开示例'));
  assert.ok(!home.includes('不会融化的雪') && !home.includes('winter-snow') && !home.includes('winter-globe.png'));
  const image = await fetch(base + '/images/promised-land-globe.png');
  assert.equal(image.status, 200);
  assert.match(image.headers.get('content-type'), /image\/png/);
  console.log('PASS: eight page responses, original room route, canonical role/gift redirects, 404, hero asset. HTTP checks only; no browser interaction or visual verification.');
})().catch(error => { console.error(error); process.exitCode = 1; });
