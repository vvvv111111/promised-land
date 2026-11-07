const assert = require('node:assert/strict');
const path = require('node:path');
require('node:child_process').execFileSync(process.execPath, [path.resolve('node_modules/typescript/bin/tsc'),
  'src/app/api/room-agent/route.ts', '--ignoreConfig', '--outDir', '.room-qa/agent-state', '--module', 'node16',
  '--target', 'es2022', '--moduleResolution', 'node16', '--types', 'node', '--resolveJsonModule', '--esModuleInterop', '--skipLibCheck'], { stdio: 'inherit' });
const { defaultRoomDesign, bedroomRoomDesign, roomFromDesign } = require('../.room-qa/agent-state/room/agent/design.js');
const { defaultRoom } = require('../.room-qa/agent-state/room/definition.js');
const { generateRoom, mimoConfig } = require('../.room-qa/agent-state/lib/server/roomAgent.js');
const route = require('../.room-qa/agent-state/app/api/room-agent/route.js');
const { withWallPhoto } = require('../.room-qa/agent-state/room/wallPhoto.js');
const { validateRoomDefinition } = require('../.room-qa/agent-state/room/definition.js');
const baseline = JSON.stringify(defaultRoom);
const clone = () => defaultRoomDesign();
const reply = (design = clone()) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(design) } }], usage: { total_tokens: 123 } });
const post = (body, headers = {}) => new Request('http://localhost/api/room-agent', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

(async () => {
  const originalFetch = global.fetch, oldEnv = { ...process.env };
  try {
    assert.throws(() => mimoConfig({}), /MIMO_API_KEY/);
    assert.equal(mimoConfig({ MIMO_API_KEY: 'test' }).endpoint, 'https://api.xiaomimimo.com/v1/chat/completions');
    assert.equal(mimoConfig({ MIMO_API_KEY: 'test', MIMO_BASE_URL: 'https://token-plan-cn.xiaomimimo.com/v1/' }).endpoint, 'https://token-plan-cn.xiaomimimo.com/v1/chat/completions');
    for (const url of ['http://example.com/v1', 'https://user:pass@example.com/v1', 'https://example.com/v1?key=x']) assert.throws(() => mimoConfig({ MIMO_API_KEY: 'test', MIMO_BASE_URL: url }));
    const compiled = roomFromDesign(clone());
    assert.equal(compiled.definition.nodes.length, defaultRoom.nodes.length);
    assert.deepEqual(compiled.definition.nodes.filter(n => n.interaction), defaultRoom.nodes.filter(n => n.interaction));
    for (const change of [
      d => d.palette.plaster = 'url(https://example.com)',
      d => delete d.palette.wood,
      d => d.furniture[0].id = 'script',
      d => d.furniture[0].id = 'table',
      d => d.furniture = [],
      d => d.furniture = [{ id: 'bed', x: 0, z: 0, rotation: 0 }],
      d => d.furniture[0].x = 3,
      d => { d.furniture[0].x = 0; d.furniture[0].z = .3; },
      d => d.furniture[0].rotation = Infinity,
      d => d.lighting.exposure = 50,
      d => d.summary = '',
      d => d.limitations = ['x'.repeat(161)],
    ]) { const design = clone(); change(design); assert.throws(() => roomFromDesign(design)); }
    const alternate = clone(); alternate.palette.sofaFabric = '#cc8866'; alternate.furniture.find(n => n.id === 'table').z = .7;
    const changed = roomFromDesign(alternate).definition;
    assert.equal(changed.materials.sofaFabric.texture.color, '#cc8866');
    assert.equal(changed.nodes.find(n => n.id === 'table').position[2], .7);
    assert.equal(JSON.stringify(defaultRoom), baseline, 'Generation never mutates the default room');
    const bedroom = roomFromDesign(bedroomRoomDesign());
    assert.equal(bedroom.definition.architecture.windows.length, 2);
    for (const id of ['bed', 'desk', 'chair', 'nightstand']) assert.ok(bedroom.definition.nodes.some(n => n.id === id));
    for (const id of ['sofa', 'table', 'cabinet', 'rug', 'floor-plant', 'window-plant', 'clock']) assert.ok(!bedroom.definition.nodes.some(n => n.id === id));
    for (const id of ['cd', 'envelope', 'lamp']) assert.equal(bedroom.definition.nodes.find(n => n.id === id).parent, 'desk', 'Tabletop keepsakes are rehomed to the actual desk');
    assert.equal(bedroom.definition.nodes.find(n => n.id === 'frame').wall, 'back');
    assert.equal(bedroom.definition.nodes.find(n => n.id === 'frame').parent, undefined);
    for (const support of ['table', 'cabinet', 'desk']) {
      const single = clone(); single.furniture = [{ id: support, x: 0, z: 0, rotation: 0 }];
      assert.ok(roomFromDesign(single).definition.nodes.filter(n => n.interaction).every(n => n.wall || n.parent === support));
    }
    const noPlant = clone(); noPlant.furniture = noPlant.furniture.filter(n => n.id !== 'floor-plant'); roomFromDesign(noPlant);
    const noWindows = bedroomRoomDesign(); noWindows.architecture.windows = []; roomFromDesign(noWindows);
    // Windows and tall furniture constrain the composition, not just the frame origin.
    const fullBack = bedroomRoomDesign(); fullBack.architecture.windows = [-1.4, 1.4].map(offset => ({ wall: 'back', offset, width: 2.6, bottom: .65, height: 1.9 }));
    const leftPhoto = roomFromDesign(fullBack).definition.nodes.find(n => n.id === 'frame');
    assert.equal(leftPhoto.wall, 'left', 'A wall filled with windows cannot receive a photograph');
    assert.equal(leftPhoto.rotation[1], Math.PI / 2, 'Photo front faces into the room');
    const legacy = structuredClone(defaultRoom), oldFrame = legacy.nodes.find(n => n.id === 'frame');
    delete oldFrame.wall; delete oldFrame.scale;
    Object.assign(oldFrame, { parent: 'cabinet', surface: 'top', position: [-.39, 1.43, .01], rotation: [-.13, -.15, 0] });
    const legacyBefore = structuredClone(legacy), adapted = withWallPhoto(legacy);
    validateRoomDefinition(adapted);
    assert.equal(adapted.nodes.find(n => n.id === 'frame').wall, 'back');
    assert.deepEqual(legacy, legacyBefore, 'Reading old scenes never mutates the saved plan');
    assert.deepEqual(adapted.nodes.filter(n => n.id !== 'frame'), legacy.nodes.filter(n => n.id !== 'frame'), 'Other furniture is unchanged');
    for (const change of [
      d => d.architecture.windows[0].wall = 'front',
      d => d.architecture.windows[0].width = 20,
      d => d.architecture.windows[0].bottom = 2,
      d => d.architecture.windows[0].offset = -2,
      d => d.architecture.windows.push({ ...d.architecture.windows[0] }),
      d => d.architecture.windows[0].height = NaN,
    ]) { const design = bedroomRoomDesign(); change(design); assert.throws(() => roomFromDesign(design)); }
    const shelf = bedroomRoomDesign(); shelf.furniture.push({ id: 'bookshelf', x: 2.4, z: .65, rotation: Math.PI / 2 }); roomFromDesign(shelf);
    const wardrobe = bedroomRoomDesign();
    wardrobe.furniture.push({ id: 'wardrobe', x: 2.4, z: .65, rotation: -Math.PI / 2 }); roomFromDesign(wardrobe);

    delete process.env.MIMO_API_KEY;
    assert.deepEqual(await route.GET().json(), { configured: false });
    let response = await route.POST(post({ prompt: 'test' })); assert.equal(response.status, 503);
    process.env.MIMO_API_KEY = 'test-secret-do-not-leak';
    process.env.MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
    process.env.MIMO_MODEL = 'test-model';
    const calls = [];
    global.fetch = async (url, options) => { calls.push({ url, options }); return reply(alternate); };
    response = await route.POST(post({ prompt: '陶土色的暖房间' }));
    const success = await response.json();
    assert.equal(response.status, 200); assert.equal(success.run.attempts, 1); assert.equal(success.run.totalTokens, 123);
    assert.equal(success.run.model, 'test-model'); assert.equal(success.definition.materials.sofaFabric.texture.color, '#cc8866');
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(calls[0].options.headers['api-key'], process.env.MIMO_API_KEY);
    assert.equal(sent.response_format.type, 'json_object'); assert.equal(sent.messages[1].content, '陶土色的暖房间');
    assert.equal(JSON.stringify(success).includes(process.env.MIMO_API_KEY), false);
    assert.equal((await route.POST(post({ prompt: 'loopback hostname normalization' }, { origin: 'http://127.0.0.1', host: '127.0.0.1' }))).status, 200);

    let count = 0;
    global.fetch = async () => ++count === 1 ? reply({}) : reply();
    const repaired = await generateRoom('修正布局');
    assert.equal(repaired.run.attempts, 2); assert.equal(repaired.run.totalTokens, 246);
    global.fetch = async () => reply({});
    await assert.rejects(generateRoom('bad'), e => e.code === 'INVALID_DESIGN');
    for (const [status, code] of [[401, 'AUTH_ERROR'], [403, 'AUTH_ERROR'], [429, 'RATE_LIMITED'], [500, 'UPSTREAM_ERROR']]) {
      global.fetch = async () => new Response('test-secret-do-not-leak', { status });
      response = await route.POST(post({ prompt: 'test' }));
      const failure = await response.json(); assert.equal(failure.error.code, code); assert.ok(!JSON.stringify(failure).includes(process.env.MIMO_API_KEY));
    }
    global.fetch = async () => { throw new Error('provider secret'); };
    await assert.rejects(generateRoom('network'), e => e.code === 'NETWORK_ERROR' && !e.message.includes('provider secret'));
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(generateRoom('cancel', cancelled.signal), e => e.code === 'TIMEOUT');
    for (const body of [{}, { prompt: '' }, { prompt: ' '.repeat(10) }, { prompt: 1 }, { prompt: 'x'.repeat(2001) }]) assert.equal((await route.POST(post(body))).status, 400);
    assert.equal((await route.POST(post({ prompt: 'x'.repeat(13_000) }))).status, 413);
    assert.equal((await route.POST(post({ prompt: 'test' }, { origin: 'https://elsewhere.test' }))).status, 403);
    assert.equal((await route.POST(post({ prompt: 'test' }, { 'sec-fetch-site': 'cross-site' }))).status, 403);
    assert.equal((await route.POST(new Request('http://localhost/api/room-agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).status, 400);
    assert.equal((await route.POST(new Request('http://localhost/api/room-agent', { method: 'POST', body: 'text' }))).status, 415);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    global.fetch = async () => { await gate; return reply(); };
    const first = route.POST(post({ prompt: 'one' })), second = route.POST(post({ prompt: 'two' }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal((await route.POST(post({ prompt: 'three' }))).status, 429);
    release(); assert.equal((await first).status, 200); assert.equal((await second).status, 200);
    console.log('PASS: room design compilation, immutable defaults, bounds/overlap validation, MiMo protocol, repair, no key leakage, errors, input limits, origin checks and concurrency');
  } finally { global.fetch = originalFetch; process.env = oldEnv; }
})().catch(error => { console.error(error); process.exit(1); });
