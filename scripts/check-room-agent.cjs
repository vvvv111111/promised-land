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
const { validateRoomReference } = require('../.room-qa/agent-state/lib/server/roomReference.js');
const { fitReferenceDesign } = require('../.room-qa/agent-state/room/agent/fitReference.js');
const { parseArchitecture } = require('../.room-qa/agent-state/room/architecture.js');
const { applyRoomDesignPatch, canPatchRoomDesign } = require('../.room-qa/agent-state/room/agent/repair.js');
const { roomForGeneration, roomGenerationContext } = require('../.room-qa/agent-state/room/agent/context.js');
const { ROOM_GENERATION_TIMEOUT_MS, ROOM_MAX_ATTEMPTS, ROOM_MAX_REPEATED_ISSUES } = require('../.room-qa/agent-state/room/agent/generation.js');
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

    // Header-level JPEG fixture for the transport validator; browser/live tests use a decoded real image.
    const referenceImage = 'data:image/jpeg;base64,' + Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 16, 0, 16, 1, 1, 17, 0, 255, 217]).toString('base64');
    validateRoomReference(referenceImage);
    const referenceReply = () => reply({ ...clone(), reference: { isRoom: true, observation: '照片中有浅色墙面与绿色沙发。' } });
    global.fetch = async (url, options) => { calls.push({ url, options }); return referenceReply(); };
    const photoResponse = await route.POST(post({ referenceImage }));
    assert.equal(photoResponse.status, 200);
    const fromPhoto = await photoResponse.json();
    assert.equal(fromPhoto.run.input, 'image');
    assert.equal(fromPhoto.run.referenceDescription, '照片中有浅色墙面与绿色沙发。');
    assert.ok(!JSON.stringify(fromPhoto).includes(referenceImage), 'Raw reference is never persisted or exported with results');
    const photoSent = JSON.parse(calls.at(-1).options.body);
    assert.equal(photoSent.messages[1].content[0].type, 'image_url');
    assert.equal(photoSent.messages[1].content[0].image_url.url, referenceImage);
    assert.ok(photoSent.messages[1].content[1].text.includes('参考'));
    const photoWithText = await generateRoom('保留布局，把沙发改成绿色', undefined, referenceImage);
    assert.equal(photoWithText.run.input, 'image');
    assert.equal(JSON.parse(calls.at(-1).options.body).messages[1].content[1].text, '保留布局，把沙发改成绿色');
    for (const invalid of ['https://example.com/private.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YWJj', referenceImage + '!', 'x'.repeat(1_600_001), 42, null]) {
      const before = calls.length;
      assert.equal((await route.POST(post({ prompt: 'test', referenceImage: invalid }))).status, 400);
      assert.equal(calls.length, before, 'Invalid images never reach the provider');
    }
    const tooWide = Buffer.from([255, 216, 255, 192, 0, 11, 8, 0, 16, 8, 0, 1, 1, 17, 0, 255, 217]);
    assert.throws(() => validateRoomReference('data:image/jpeg;base64,' + tooWide.toString('base64')), /尺寸/);
    assert.equal((await route.POST(post({ referenceImage: 'x'.repeat(1_620_000) }))).status, 413);
    global.fetch = async () => reply({ reference: { isRoom: false, observation: '不是房间' } });
    await assert.rejects(generateRoom('', undefined, referenceImage), e => e.code === 'NOT_A_ROOM');
    const imageRepairCalls = [];
    global.fetch = async (url, options) => { imageRepairCalls.push(JSON.parse(options.body)); return imageRepairCalls.length === 1 ? reply({}) : referenceReply(); };
    const photoRepaired = await generateRoom('修复图片方案', undefined, referenceImage);
    assert.equal(photoRepaired.run.attempts, 2);
    assert.equal(imageRepairCalls[1].messages[1].content[0].image_url.url, referenceImage, 'Repair retains the same reference image');
    const nearWall = { ...clone(), version: 2, dimensions: [6, 3, 4.8], architecture: { units: 'meters', windows: [] }, furniture: [{ id: 'desk-photo', type: 'desk', x: 2.1, z: 0, rotation: 0 }], reference: { isRoom: true, observation: '一张靠墙的木书桌。' } };
    assert.throws(() => roomFromDesign(nearWall), /crosses a wall/);
    const fitted = fitReferenceDesign(nearWall);
    assert.equal(fitted.corrections, 1); roomFromDesign(fitted.input);
    assert.equal(nearWall.furniture[0].x, 2.1, 'Wall fitting does not mutate model output');
    global.fetch = async () => reply(nearWall);
    const adjustedPhoto = await generateRoom('', undefined, referenceImage);
    assert.equal(adjustedPhoto.run.positionCorrections, 1);
    const adjustedText = await generateRoom('一张靠墙的书桌');
    assert.equal(adjustedText.run.positionCorrections, 1, 'Text generation also corrects small wall-margin errors before strict validation');
    const far = structuredClone(nearWall); far.furniture[0].x = 10;
    assert.equal(fitReferenceDesign(far).corrections, 0, 'Large placement errors still fail normal validation');
    const colliding = structuredClone(nearWall); colliding.furniture.push({ ...colliding.furniture[0], id: 'desk-second' });
    assert.throws(() => roomFromDesign(fitReferenceDesign(colliding).input), /overlaps/);
    const smallTable = { ...nearWall, furniture: [{ id: 'photo-side', type: 'nightstand', size: [.66, .6025, .6], x: 0, z: 0, rotation: 0 }] };
    const packed = roomFromDesign(smallTable).definition;
    for (const id of ['cd', 'envelope', 'lamp']) assert.equal(packed.nodes.find(n => n.id === id).parent, 'photo-side');
    assert.ok(packed.nodes.find(n => n.id === 'cd').scale[0] < .85, 'Packing retries earlier objects at smaller scales to leave space for the lamp');
    validateRoomDefinition(packed);
    const insufficient = structuredClone(smallTable); insufficient.furniture[0].size = [.4, .4, .35];
    assert.throws(() => roomFromDesign(insufficient), /Not enough tabletop space/);
    // Replay the actual production failure: a wide window repeatedly crossed a wall edge.
    const windowFailure = { ...structuredClone(nearWall), dimensions: [5.2, 2.9, 4.8], furniture: [{ id: 'desk-a', type: 'desk', x: 0, z: 0, rotation: 0 }], architecture: { units: 'meters', windows: [{ wall: 'back', offset: 1.6, width: 3.2, bottom: 1.05, height: 1.55 }] } };
    assert.throws(() => roomFromDesign(windowFailure), /window crosses/);
    const fixedWindow = fitReferenceDesign(windowFailure);
    assert.equal(fixedWindow.corrections, 1);
    assert.equal(fixedWindow.input.architecture.windows[0].width, 3.2, 'Window fitting preserves the original size');
    assert.ok(Math.abs(fixedWindow.input.architecture.windows[0].offset - .8) < 1e-6);
    assert.equal(windowFailure.architecture.windows[0].offset, 1.6, 'Fitting never mutates the provider response');
    roomFromDesign(fixedWindow.input);
    parseArchitecture({ units: 'meters', windows: [{ wall: 'back', offset: 1.3, width: 2.2, bottom: 1.05, height: 1.5 }] }, [5.2, 2.9, 4.8]);
    const grouped = structuredClone(windowFailure);
    grouped.architecture.windows = [.5, .6].map(offset => ({ wall: 'back', offset, width: 1, bottom: 1.05, height: 1.55 }));
    const separated = fitReferenceDesign(grouped).input.architecture;
    parseArchitecture(separated, grouped.dimensions);
    assert.equal(separated.windows.length, 2); assert.ok(separated.windows[1].offset - separated.windows[0].offset >= 1.15 - 1e-6);
    const impossible = structuredClone(grouped); impossible.architecture.windows.forEach(w => w.width = 3);
    assert.deepEqual(fitReferenceDesign(impossible).input.architecture.windows, impossible.architecture.windows, 'Impossible window groups are not shrunk or deleted');
    let fitCalls = 0;
    global.fetch = async () => { fitCalls++; return reply(windowFailure); };
    assert.equal((await generateRoom('按参考布局生成', undefined, referenceImage)).run.attempts, 1, 'The recorded window failure now succeeds without a model repair');
    assert.equal(fitCalls, 1);

    const collision = { ...structuredClone(nearWall), furniture: [{ id: 'desk-a', type: 'desk', x: -1.3, z: 0, rotation: 0 }, { id: 'desk-b', type: 'desk', x: -1.25, z: 0, rotation: 0 }] };
    const delta = { patch: { furniture: [{ id: 'desk-b', x: 1.3 }] } };
    const patched = applyRoomDesignPatch(collision, delta);
    roomFromDesign(patched);
    assert.deepEqual(patched.furniture[0], collision.furniture[0], 'Unrelated furniture is unchanged');
    assert.equal(collision.furniture[1].x, -1.25);
    const crowded = structuredClone(patched);
    crowded.assets = { prop: { label: 'small prop', parts: [{ shape: 'box', size: [.2, .2, .2], position: [0, .1, 0], color: '#ffffff' }] } };
    for (let i = 0; i < 3; i++) crowded.furniture.push({ id: `prop-${i}`, type: 'custom', asset: 'prop', parent: 'desk-a', surface: 'top', x: 0, z: 0, rotation: 0 });
    const packedCrowded = roomFromDesign(crowded);
    validateRoomDefinition(packedCrowded.definition);
    assert.equal(packedCrowded.design.furniture.length, crowded.furniture.length, 'Joint tabletop packing preserves every prop');
    assert.deepEqual(packedCrowded.design.assets.prop, crowded.assets.prop, 'Joint packing never changes prop geometry or scale');
    for (const item of packedCrowded.design.furniture.filter(n => n.parent)) {
      assert.equal(item.parent, 'desk-a'); assert.equal(item.surface, 'top');
      assert.ok(Math.hypot(item.x, item.z) <= .4 + 1e-6);
      assert.deepEqual(packedCrowded.definition.nodes.find(n => n.id === item.id).position.filter((_, i) => i !== 1), [item.x, item.z]);
    }
    assert.ok(crowded.furniture.filter(n => n.parent).every(n => n.x === 0 && n.z === 0), 'Packing does not mutate the input');
    const tiered = structuredClone(crowded);
    tiered.assets.shelf = { label: 'tiered shelf', parts: [
      { shape: 'box', size: [.8, .08, .6], position: [0, .04, 0], color: '#ffffff' },
      { shape: 'box', size: [.8, .08, .6], position: [0, .48, 0], color: '#ffffff' },
      { shape: 'box', size: [.08, .48, .6], position: [-.36, .24, 0], color: '#ffffff' },
      { shape: 'box', size: [.08, .48, .6], position: [.36, .24, 0], color: '#ffffff' },
    ], supports: [{ id: 'lower', part: 0 }, { id: 'upper', part: 1 }] };
    tiered.furniture = tiered.furniture.filter(n => !n.parent);
    tiered.furniture.push({ id: 'shelf-a', type: 'custom', asset: 'shelf', x: 0, z: 1.6, rotation: 0 });
    tiered.furniture.push({ id: 'book-stack', type: 'custom', asset: 'prop', parent: 'shelf-a', surface: 'lower', x: 0, z: 0, rotation: 0 });
    const packedShelf = roomFromDesign(tiered);
    assert.equal(packedShelf.design.furniture.find(n => n.id === 'book-stack').surface, 'lower', 'An upper shelf does not block a shorter prop beneath it');
    validateRoomDefinition(packedShelf.definition);
    const tooTall = structuredClone(tiered);
    tooTall.assets.prop.parts[0].size[1] = .6;
    tooTall.assets.prop.parts[0].position[1] = .3;
    assert.throws(() => roomFromDesign(tooTall), /Not enough tabletop space/, 'A prop that actually hits the shelf above is still rejected');
    const vaseTop = structuredClone(tiered);
    vaseTop.furniture = vaseTop.furniture.filter(n => n.id !== 'book-stack');
    vaseTop.assets.flowers = { label: 'wide flowers on narrow base', parts: [
      { shape: 'cylinder', size: [.18, .3, .18], position: [0, .15, 0], color: '#ffffff' },
      { shape: 'ellipsoid', size: [.9, .3, .7], position: [0, .5, 0], color: '#ffffff' },
    ] };
    vaseTop.furniture.push({ id: 'flower-vase', type: 'custom', asset: 'flowers', parent: 'shelf-a', surface: 'upper', x: 0, z: 0, rotation: 0 });
    const supportedFlowers = roomFromDesign(vaseTop);
    assert.equal(supportedFlowers.design.furniture.find(n => n.id === 'flower-vase').surface, 'upper');
    assert.deepEqual(supportedFlowers.design.assets.flowers, vaseTop.assets.flowers, 'A supported flower crown may overhang without shrinking the flowers');
    validateRoomDefinition(supportedFlowers.definition);
    const collidingFlowers = structuredClone(vaseTop);
    collidingFlowers.furniture.push({ ...collidingFlowers.furniture.at(-1), id: 'second-vase' });
    assert.throws(() => roomFromDesign(collidingFlowers), /Not enough tabletop space/, 'Overhanging crowns still collide even when both bases fit');
    const coordinateError = structuredClone(collision); coordinateError.furniture[1].x = 4;
    assert.equal(canPatchRoomDesign(coordinateError), true, 'A finite out-of-room placement can be repaired locally');
    assert.throws(() => roomFromDesign(coordinateError), /desk-b.x=4/);
    assert.deepEqual(patched.furniture.map(n => n.id), collision.furniture.map(n => n.id));
    const withParts = { ...collision, assets: { fixture: { label: 'fixture', parts: [{ shape: 'box', size: [1, .1, 1], position: [0, .05, 0], color: '#ffffff' }, { shape: 'box', size: [.1, 1, .1], position: [.4, .5, .4], color: '#ffffff' }] } } };
    const fixedPart = applyRoomDesignPatch(withParts, { patch: { assets: { fixture: { parts: [{ index: 1, color: '#123456' }] } } } });
    assert.equal(fixedPart.assets.fixture.parts.length, 2);
    assert.deepEqual(fixedPart.assets.fixture.parts[0], withParts.assets.fixture.parts[0]);
    assert.equal(fixedPart.assets.fixture.parts[1].color, '#123456');
    assert.equal(withParts.assets.fixture.parts[1].color, '#ffffff');
    assert.throws(() => applyRoomDesignPatch(withParts, { patch: { assets: { fixture: { parts: [{ index: 2, color: '#123456' }] } } } }));
    for (const bad of [
      { patch: { dimensions: [12, 5, 12] } },
      { patch: { furniture: [] }, extra: true },
      { patch: { furniture: [{ id: 'new-desk', x: 0 }] } },
      { patch: { furniture: [{ id: 'desk-a', type: 'table' }] } },
      { patch: { windows: [{ index: 0, wall: 'left' }] } },
      { patch: { palette: { constructor: {} } } },
    ]) assert.throws(() => applyRoomDesignPatch(collision, bad));
    const patchCalls = [];
    global.fetch = async (url, options) => { patchCalls.push(JSON.parse(options.body)); return patchCalls.length === 1 ? reply(collision) : reply(delta); };
    const localRepair = await generateRoom('两张书桌，保留它们');
    assert.equal(localRepair.run.attempts, 2);
    assert.deepEqual(localRepair.design.furniture.map(n => n.id), ['desk-a', 'desk-b']);
    assert.equal(localRepair.design.furniture[0].x, -1.3);
    assert.equal(localRepair.design.furniture[1].x, 1.3);
    assert.ok(patchCalls[1].messages.some(m => m.role === 'system' && m.content.includes('只修复上一版方案')));
    assert.equal(patchCalls[1].max_completion_tokens, 8192);
    let recoveringCalls = 0;
    global.fetch = async () => { recoveringCalls++; return recoveringCalls === 1 ? reply(collision) : recoveringCalls === 2 ? reply(clone()) : reply(delta); };
    const recoveredPatch = await generateRoom('无效的修复回复不能覆盖上一版');
    assert.equal(recoveredPatch.run.attempts, 3);
    assert.deepEqual(recoveredPatch.design.furniture.map(n => n.id), ['desk-a', 'desk-b']);
    let malformedPatches = 0;
    const invalidGeometryPatch = structuredClone(crowded); invalidGeometryPatch.furniture[1].x = -1.25;
    global.fetch = async () => { malformedPatches++; return malformedPatches === 1 ? reply(invalidGeometryPatch) : malformedPatches === 2 ? reply({ patch: { furniture: [{ id: 'prop-0', size: [1, 1, 1] }] } }) : reply({ patch: { furniture: [{ id: 'desk-b', x: 1.3 }] } }); };
    const preservedSchema = await generateRoom('错误补丁不能破坏自定义素材协议');
    assert.equal(preservedSchema.run.attempts, 3);
    assert.equal(preservedSchema.design.furniture.find(n => n.id === 'prop-0').size, undefined);
    const missingAsset = structuredClone(collision);
    missingAsset.furniture.push({ id: 'shelf', type: 'custom', asset: 'undefined-shelf', x: 0, z: 1, rotation: 0 });
    assert.equal(canPatchRoomDesign(missingAsset), false, 'Incomplete structure must not be trapped in a patch that cannot create its missing asset');
    let schemaCalls = 0;
    global.fetch = async () => { schemaCalls++; return schemaCalls === 1 ? reply(missingAsset) : schemaCalls === 2 ? reply(collision) : reply(delta); };
    assert.equal((await generateRoom('先恢复结构，再局部修复')).run.attempts, 3);
    const exactContext = roomGenerationContext(roomForGeneration(localRepair.definition, localRepair.design));
    assert.deepEqual(exactContext.design, localRepair.design, 'A verified source design retains exact furniture and asset IDs for follow-up edits');
    const staleContext = roomForGeneration(localRepair.definition, localRepair.design);
    staleContext.agentDesign.furniture[0].x = 100;
    assert.equal(roomGenerationContext(staleContext).design, undefined, 'Stale design metadata cannot override the actual visible room');
    const changedPalette = roomForGeneration(localRepair.definition, localRepair.design);
    changedPalette.materials.plaster.color = '#123456';
    assert.equal(roomGenerationContext(changedPalette).design, undefined, 'A stale palette must fall back to the current visible scene');
    const contextRoom = roomForGeneration(defaultRoom);
    contextRoom.privatePhoto = 'secret photo must stay local';
    contextRoom.nodes[0].privateNote = 'secret photo must stay local';
    assert.ok(!contextRoom.nodes.some(n => n.model === 'pet'));
    assert.ok(!JSON.stringify(roomGenerationContext(contextRoom)).includes('secret photo'));
    let contextBody;
    global.fetch = async (url, options) => { contextBody = JSON.parse(options.body); return reply(); };
    assert.equal((await route.POST(post({ prompt: '只修改沙发配色', currentRoom: contextRoom }))).status, 200);
    assert.match(contextBody.messages[1].content, /当前房间上下文/);
    assert.ok(!JSON.stringify(contextBody).includes('secret photo'));
    global.fetch = async () => reply({ patch: { palette: { plaster: '#e6d6c5' } } });
    const recolored = await generateRoom('只改墙面颜色', undefined, undefined, roomForGeneration(localRepair.definition, localRepair.design));
    assert.equal(recolored.run.attempts, 1);
    assert.equal(recolored.design.palette.plaster, '#e6d6c5');
    assert.deepEqual(recolored.design.furniture, localRepair.design.furniture, 'Initial edit patches preserve all unrelated furniture exactly');
    assert.deepEqual(recolored.design.architecture, localRepair.design.architecture);
    assert.deepEqual(recolored.design.lighting, localRepair.design.lighting);
    assert.equal((await route.POST(post({ prompt: '修改房间', currentRoom: {} }))).status, 400);
    global.fetch = async () => new Response('provider detail', { status: 400 });
    await assert.rejects(generateRoom('', undefined, referenceImage), e => e.code === 'IMAGE_REJECTED');

    let count = 0;
    global.fetch = async () => ++count === 1 ? reply({}) : reply();
    const repaired = await generateRoom('修正布局');
    assert.equal(repaired.run.attempts, 2); assert.equal(repaired.run.totalTokens, 246);
    const rounds = [];
    global.fetch = async (url, options) => {
      rounds.push(JSON.parse(options.body));
      return reply({});
    };
    await assert.rejects(generateRoom('保留主要家具，避免无限修复'), e => e.code === 'REPAIR_EXHAUSTED');
    assert.equal(rounds.length, ROOM_MAX_REPEATED_ISSUES, 'Repeated validation errors stop further paid model calls');
    assert.ok(rounds.every(r => r.messages.length <= 4), 'Repairs retain only the latest candidate and bounded error feedback');
    assert.match(rounds.at(-1).messages.at(-1).content, /同一错误已重复/);
    assert.match(rounds.at(-1).messages.at(-1).content, /不能删掉主要物件/);
    assert.equal(rounds.at(-1).messages[1].content, '保留主要家具，避免无限修复');
    const invalidColor = clone(); invalidColor.palette.plaster = 'invalid';
    let changingFailures = 0;
    global.fetch = async () => reply(++changingFailures % 2 ? {} : invalidColor);
    await assert.rejects(generateRoom('交替出现不同错误'), e => e.code === 'REPAIR_EXHAUSTED');
    assert.equal(changingFailures, ROOM_MAX_ATTEMPTS, 'Alternating errors are bounded by the total call budget');
    let finalAttempt = 0;
    global.fetch = async () => ++finalAttempt === ROOM_MAX_ATTEMPTS ? reply() : reply(finalAttempt % 2 ? {} : invalidColor);
    assert.equal((await generateRoom('在最后一次尝试修复成功')).run.attempts, ROOM_MAX_ATTEMPTS, 'A valid final attempt still succeeds');
    const stopRepairs = new AbortController(); let failedRounds = 0;
    global.fetch = async () => { if (++failedRounds === 2) stopRepairs.abort(); return reply({}); };
    await assert.rejects(generateRoom('bad', stopRepairs.signal), e => e.code === 'TIMEOUT');
    assert.equal(failedRounds, 2, 'Cancellation stops even before the repair budget is reached');

    const originalNow = Date.now;
    let elapsed = 0, callsAfterDeadline = 0;
    Date.now = () => originalNow() + elapsed;
    try {
      let budgetSession = await (await route.POST(post({ continuous: true, prompt: '总时限跨请求保留' }))).json();
      global.fetch = async () => { callsAfterDeadline++; return reply(); };
      elapsed = ROOM_GENERATION_TIMEOUT_MS + 1;
      response = await route.POST(post({ generationId: budgetSession.generationId }));
      assert.equal((await response.json()).error.code, 'GENERATION_TIMEOUT');
      assert.equal(callsAfterDeadline, 0, 'Expired workflows never start another model call');
      assert.equal((await route.POST(post({ generationId: budgetSession.generationId }))).status, 410, 'Expired workflows are released');
      elapsed = 0;
      budgetSession = await (await route.POST(post({ continuous: true, prompt: '迟到的成功结果也不能突破总时限' }))).json();
      global.fetch = async () => { elapsed = ROOM_GENERATION_TIMEOUT_MS + 1; return reply(); };
      response = await route.POST(post({ generationId: budgetSession.generationId }));
      assert.equal((await response.json()).error.code, 'GENERATION_TIMEOUT');
      assert.equal((await route.POST(post({ generationId: budgetSession.generationId }))).status, 410);
    } finally { Date.now = originalNow; }

    // Successful repair continuations retain the photo, without resetting workflow budgets.
    const sessionCalls = [];
    const overlapDesign = clone(); overlapDesign.furniture[0].x = 0; overlapDesign.furniture[0].z = .3;
    global.fetch = async (url, options) => {
      sessionCalls.push(JSON.parse(options.body));
      return sessionCalls.length <= 2 ? reply({ ...overlapDesign, reference: { isRoom: true, observation: '保留原布局。' } }) : referenceReply();
    };
    const continuationFetch = global.fetch;
    let cloudCalls = 0;
    process.env.ROOM_AGENT_TRANSPORT = 'request';
    global.fetch = async () => ++cloudCalls <= 2 ? reply({ ...overlapDesign, reference: { isRoom: true, observation: '保留原布局。' } }) : referenceReply();
    try {
      const directCloud = await route.POST(post({ continuous: true, referenceImage }));
      assert.equal(directCloud.status, 200, 'Cloud mode finishes repairs in the initiating request');
      const cloudResult = await directCloud.json();
      assert.ok(cloudResult.definition); assert.equal(cloudResult.run.attempts, 3);
    } finally { delete process.env.ROOM_AGENT_TRANSPORT; global.fetch = continuationFetch; }
    response = await route.POST(post({ continuous: true, referenceImage }));
    assert.equal(response.status, 202);
    const session = await response.json();
    assert.equal(session.attempts, 0);
    assert.equal(sessionCalls.length, 0, 'Starting a continuation does not detach work from a request');
    assert.ok(!JSON.stringify(session).includes(referenceImage));
    assert.ok(!JSON.stringify(session).includes(process.env.MIMO_API_KEY));
    for (let attempt = 1; attempt <= 3; attempt++) {
      response = await route.POST(post({ generationId: session.generationId }));
      const value = await response.json();
      assert.equal(response.status, attempt === 3 ? 200 : 202);
      if (attempt < 3) {
        assert.equal(value.attempts, attempt);
        assert.match(value.message, /间距/);
        assert.ok(!JSON.stringify(value).includes(referenceImage));
      } else { assert.equal(value.run.attempts, 3); assert.equal(value.run.totalTokens, 369); }
    }
    assert.equal(sessionCalls[2].messages[1].content[0].image_url.url, referenceImage);
    assert.equal((await route.POST(post({ generationId: session.generationId }))).status, 410, 'Finished sessions are released');
    assert.equal((await route.POST(post({ generationId: 'invalid' }))).status, 400);
    assert.equal((await route.POST(post({ generationId: session.generationId }, { origin: 'https://elsewhere.test' }))).status, 403);

    const cancelSession = await (await route.POST(post({ continuous: true, prompt: '取消持续修复' }))).json();
    let sawProviderAbort = false, markStarted;
    const providerStarted = new Promise(resolve => { markStarted = resolve; });
    global.fetch = async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => { sawProviderAbort = true; reject(new Error('aborted')); }, { once: true });
      markStarted();
    });
    const inFlight = route.POST(post({ generationId: cancelSession.generationId }));
    await providerStarted;
    assert.equal((await route.POST(post({ generationId: cancelSession.generationId }))).status, 409, 'Duplicate continuation never starts another model call');
    const deletion = (origin) => new Request(`http://localhost/api/room-agent?id=${cancelSession.generationId}`, { method: 'DELETE', headers: origin ? { origin } : {} });
    assert.equal(route.DELETE(deletion('https://elsewhere.test')).status, 403);
    assert.equal(route.DELETE(deletion()).status, 200);
    assert.equal((await inFlight).status, 504);
    assert.equal(sawProviderAbort, true, 'Cancel aborts the in-flight provider call');
    assert.equal((await route.POST(post({ generationId: cancelSession.generationId }))).status, 410, 'Cancelled generations cannot be resumed');
    for (const [status, code] of [[401, 'AUTH_ERROR'], [403, 'AUTH_ERROR'], [429, 'RATE_LIMITED'], [500, 'UPSTREAM_ERROR']]) {
      global.fetch = async () => new Response('test-secret-do-not-leak', { status });
      response = await route.POST(post({ prompt: 'test' }));
      const failure = await response.json(); assert.equal(failure.error.code, code); assert.ok(!JSON.stringify(failure).includes(process.env.MIMO_API_KEY));
    }
    global.fetch = async () => { throw new Error('provider secret'); };
    await assert.rejects(generateRoom('network'), e => e.code === 'NETWORK_ERROR' && !e.message.includes('provider secret'));
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(generateRoom('cancel', cancelled.signal), e => e.code === 'TIMEOUT');
    global.fetch = async () => ({ ok: true, json: async () => { throw new Error('body unavailable'); } });
    await assert.rejects(generateRoom('body timeout', cancelled.signal), e => e.code === 'TIMEOUT', 'Aborted response-body reads are timeouts, not malformed provider responses');
    await assert.rejects(generateRoom('invalid response body'), e => e.code === 'INVALID_RESPONSE');
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
    console.log('PASS: image-only/text+image, JPEG budgets, no remote image fetch, visual observation, non-room rejection, image-aware repair and no raw image in result');
    console.log('PASS: repair/time budgets, repeated and alternating failures, final-attempt success, bounded context, multi-request progress, image retention, cancellation, session cleanup and duplicate-call protection');
    console.log('PASS: recorded window failure fits in one call, floating-point edge tolerance, window groups, immutable local patches, protected furniture identity, sanitized current-room context and bounded requests');
  } finally { global.fetch = originalFetch; process.env = oldEnv; }
})().catch(error => { console.error(error); process.exit(1); });
