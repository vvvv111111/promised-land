// Explicit live check: invokes MiMo and consumes API quota. No credentials are printed.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.ROOM_URL || 'http://127.0.0.1:3100';
const bedroom = process.argv.includes('--bedroom');
(async () => {
  const status = await fetch(base + '/api/room-agent').then(r => r.json());
  assert.equal(status.configured, true, 'Configure MIMO_API_KEY in the server environment first');
  const response = await fetch(base + '/api/room-agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin },
    body: JSON.stringify({ prompt: bedroom
      ? '改成卧室：去掉沙发、茶桌和矮柜，放一张床、一张书桌和椅子，左墙和后墙各一扇窗户。纪念物放在书桌上。'
      : '请把这个房间改成奶油色墙面、陶土色沙发和浅木色家具，阳光温暖一些。沿用当前安全布局，保留相框、信件和 CD 机。' }),
    signal: AbortSignal.timeout(100_000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${result.error?.message || 'Generation failed'}`);
  const { roomFromDesign } = require('../.room-qa/agent-state/room/agent/design.js');
  roomFromDesign(result.design);
  if (bedroom) {
    for (const id of ['bed', 'desk', 'chair']) assert.ok(result.definition.nodes.some(n => n.id === id), `Bedroom must contain ${id}`);
    for (const id of ['sofa', 'table', 'cabinet']) assert.ok(!result.definition.nodes.some(n => n.id === id), `${id} must be removed`);
    assert.equal(result.definition.architecture.windows.length, 2);
    assert.deepEqual(result.design.limitations, []);
  }
  fs.mkdirSync('.room-qa', { recursive: true });
  fs.writeFileSync(bedroom ? '.room-qa/agent-bedroom-live.json' : '.room-qa/agent-live.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: 'PASS: live MiMo room generation', model: result.run.model, attempts: result.run.attempts, durationMs: result.run.durationMs, totalTokens: result.run.totalTokens, summary: result.design.summary }));
})().catch(error => { console.error(error.message); process.exit(1); });
