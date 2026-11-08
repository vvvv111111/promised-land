// Explicit integration check: calls MiMo and consumes quota. Excluded from npm test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.ROOM_URL || 'http://127.0.0.1:3110';
const dining = process.argv.includes('--dining');
(async () => {
  assert.equal((await fetch(base + '/api/room-agent').then(r => r.json())).configured, true);
  const response = await fetch(base + '/api/room-agent', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin }, body: JSON.stringify({ prompt: dining
    ? '生成宽6.5米、深5米、高3米的四人餐厅，一张1.8米长餐桌、四把椅子和一个餐边柜，后墙一扇窗，浅木色搭配陶土色。不要沙发、茶桌或床。'
    : '生成宽7米、深5.6米、高3米的双人书房：两张1.6米宽的书桌、两把椅子、一个书架和一张阅读扶手椅。两张书桌分别用深浅木色，后墙开一扇窗，不要沙发或床。' }), signal: AbortSignal.timeout(100_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error?.message || 'Generation failed'}`);
  require('../.room-qa/agent-state/room/agent/design.js').roomFromDesign(result.design);
  fs.mkdirSync('.room-qa', { recursive: true });
  fs.writeFileSync(`.room-qa/flexible-${dining ? 'dining' : 'study'}-live.json`, JSON.stringify(result, null, 2));
  assert.equal(result.design.version, 2);
  assert.deepEqual(result.definition.dimensions, dining ? [6.5, 3, 5] : [7, 3, 5.6]);
  const count = model => result.definition.nodes.filter(n => n.model === model).length;
  assert.equal(count('chair'), dining ? 4 : 2);
  assert.equal(count(dining ? 'dining-table' : 'desk'), dining ? 1 : 2);
  assert.equal(count('sofa'), 0); assert.equal(count('bed'), 0);
  assert.equal(result.definition.architecture.windows.length, 1);
  if (!dining) {
    const desks = result.definition.nodes.filter(n => n.model === 'desk');
    assert.ok(desks.every(n => Math.abs(n.size[0] - 1.6) < .001));
    assert.notDeepEqual(desks[0].colors, desks[1].colors, 'Requested independent desk colors must be represented');
    assert.equal(count('bookshelf'), 1); assert.equal(count('armchair'), 1);
  }
  assert.deepEqual(result.design.limitations, []);
  console.log(JSON.stringify({ status: 'PASS: live flexible room generation', kind: dining ? 'dining' : 'study', model: result.run.model, attempts: result.run.attempts, durationMs: result.run.durationMs, totalTokens: result.run.totalTokens, summary: result.design.summary }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
