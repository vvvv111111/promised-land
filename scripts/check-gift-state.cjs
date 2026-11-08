const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  'src/world/GiftStore.ts', 'src/world/WinterGift.ts', 'src/world/config.ts', '--ignoreConfig', '--rootDir', 'src', '--outDir', '.room-qa/gift-state',
  '--module', 'node16', '--target', 'es2020', '--moduleResolution', 'node16', '--esModuleInterop', '--resolveJsonModule', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
const { GiftStore, validGiftContent } = require('../.room-qa/gift-state/world/GiftStore.js');
const world = require('../src/world/demo-world.json');
const base = require('../src/world/demo-gift.json');
const records = new Map();
const storage = { getItem: k => records.get(k) ?? null, setItem: (k, v) => records.set(k, v) };
const letterId = world.objects.find(o => o.content_type === 'letter').object_id;
const frameId = world.objects.find(o => o.content_type === 'photo_frame').object_id;
const sender = new GiftStore(base, world, 'sender', storage);
sender.save(letterId, { kind: 'letter', body: '亲爱的你：\n愿你开心。<script>不会执行</script>' });
assert.match(new GiftStore(base, world, 'recipient', storage).read().object_contents[letterId].body, /愿你开心/);
const frame = { kind: 'photo_frame', photo: 'data:image/jpeg;base64,/9j/AA==', zoom: 1.8, position_x: 0.2, position_y: 0.7 };
sender.save(frameId, frame);
assert.deepEqual(new GiftStore(base, world, 'sender', storage).read().object_contents[frameId], frame);
assert.match(sender.read().object_contents[letterId].body, /愿你开心/);
assert.throws(() => new GiftStore(base, world, 'recipient', storage).save(letterId, { kind: 'letter', body: '不允许' }), /无法保存/);
assert.throws(() => sender.save(letterId, frame), /无法保存/);
assert.equal(validGiftContent({ ...frame, photo: 'javascript:alert(1)' }), false);
assert.equal(validGiftContent({ ...frame, zoom: 9 }), false);
assert.equal(validGiftContent({ kind: 'letter', body: 'x'.repeat(10001) }), false);
const other = new GiftStore({ ...base, gift_id: 'another-gift' }, world, 'sender', storage);
assert.deepEqual(other.read().object_contents, base.object_contents);
const blocked = new GiftStore(base, world, 'sender', { getItem: storage.getItem, setItem: () => { throw Error('quota'); } });
const before = blocked.read();
assert.throws(() => blocked.save(letterId, { kind: 'letter', body: '不会假装保存' }), /保存失败/);
assert.deepEqual(blocked.read(), before);
assert.throws(() => new GiftStore(base, world, 'sender').save(letterId, { kind: 'letter', body: '无法持久化' }), /无法保存/);
console.log('PASS: gift persistence, photo transforms, recipient write guard, gift isolation, invalid input, quota failure rollback');

const { openWinterGift, giftWithDraft, draftFromGift, WINTER_GIFT_ID, LEGACY_DRAFT_KEY } = require('../.room-qa/gift-state/world/WinterGift.js');
const canonicalKey = `promised-land:gift:${WINTER_GIFT_ID}`;
const legacy = { recipient: 'recipient', sender: 'sender', memory: 'memory', letter: 'legacy letter', photos: [frame.photo, frame.photo] };
const winterRecords = new Map([[LEGACY_DRAFT_KEY, JSON.stringify(legacy)]]);
let writeCount = 0, failWrite = false;
const winterStorage = {
  getItem: k => winterRecords.get(k) ?? null,
  setItem: (k, v) => { writeCount++; if (failWrite) throw Error('quota'); winterRecords.set(k, v); },
};
let winter = openWinterGift(base, world, 'sender', winterStorage);
assert.deepEqual(draftFromGift(winter.read()), legacy);
assert.equal(writeCount, 0, 'Initialization must not rewrite either document');
const updated = { ...legacy, letter: 'new letter', photos: ['data:image/png;base64,AAAA', frame.photo], memory: 'new memory' };
winter.saveGift(giftWithDraft(winter.read(), updated));
assert.equal(writeCount, 1, 'Letter, photo and metadata commit in one write');
assert.deepEqual(draftFromGift(openWinterGift(base, world, 'recipient', winterStorage).read()), updated);
assert.equal(winterRecords.get(LEGACY_DRAFT_KEY), JSON.stringify(legacy), 'Legacy draft is read-only');

const previousDocument = winterRecords.get(canonicalKey), previousConfig = winter.read();
failWrite = true;
assert.throws(() => winter.saveGift(giftWithDraft(winter.read(), { ...updated, letter: 'failed letter', photos: [frame.photo], recipient: 'failed name' })), /保存失败/);
assert.equal(winterRecords.get(canonicalKey), previousDocument);
assert.deepEqual(winter.read(), previousConfig, 'Failed commit leaves all in-memory fields unchanged');
assert.deepEqual(draftFromGift(openWinterGift(base, world, 'recipient', winterStorage).read()), updated, 'Reload retains the complete previous document');
failWrite = false;

// Existing room-only saves win over legacy letter/photo; metadata falls back to the old draft.
winterRecords.set(canonicalKey, JSON.stringify({ ...base, gift_id: WINTER_GIFT_ID, object_contents: {
  ...base.object_contents, [letterId]: { kind: 'letter', body: 'room letter' }, [frameId]: frame,
} }));
const writesBeforeRead = writeCount;
winter = openWinterGift(base, world, 'sender', winterStorage);
assert.equal(draftFromGift(winter.read()).letter, 'room letter');
assert.equal(winter.read().object_contents[frameId].zoom, frame.zoom);
assert.equal(draftFromGift(winter.read()).recipient, legacy.recipient);
assert.equal(writeCount, writesBeforeRead);
winter.save(letterId, { kind: 'letter', body: 'edited in room' });
assert.equal(openWinterGift(base, world, 'recipient', winterStorage).read().details.recipient, legacy.recipient);
assert.equal(draftFromGift(openWinterGift(base, world, 'recipient', winterStorage).read()).letter, 'edited in room');
const samePhotoDraft = draftFromGift(winter.read());
assert.deepEqual(giftWithDraft(winter.read(), samePhotoDraft).object_contents[frameId], frame, 'Unchanged photo preserves crop');

// After migration, obsolete/corrupt legacy data cannot override the canonical document.
winterRecords.set(LEGACY_DRAFT_KEY, '{broken');
const canonicalOnly = openWinterGift(base, world, 'recipient', winterStorage);
assert.equal(canonicalOnly.warning, '');
assert.equal(draftFromGift(canonicalOnly.read()).letter, 'edited in room');
assert.throws(() => canonicalOnly.saveGift(canonicalOnly.read()), /无法保存/);
const invalid = giftWithDraft(winter.read(), updated);
invalid.object_contents[frameId].zoom = 9;
const beforeInvalid = winterRecords.get(canonicalKey);
assert.throws(() => winter.saveGift(invalid), /无法保存/);
assert.equal(winterRecords.get(canonicalKey), beforeInvalid);
console.log('PASS: complete atomic gift save, failure rollback, read-only legacy migration, canonical precedence, room/form consistency, crop preservation');

const asyncTimeout = setTimeout(() => { throw new Error('Gift save tests did not finish'); }, 10000);
(async () => {
  const { openGift, EXAMPLE_GIFT_ID, collectionKey } = require('../.room-qa/gift-state/world/WinterGift.js');
  const { defaultRoom } = require('../.room-qa/gift-state/room/definition.js');
  const data = new Map(), adapter = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const a = new GiftStore(base, world, 'sender', adapter), b = new GiftStore(base, world, 'sender', adapter);
  await Promise.all([
    a.saveLocked(letterId, { kind: 'letter', body: 'concurrent letter' }),
    b.saveLocked(frameId, frame),
  ]);
  const merged = new GiftStore(base, world, 'recipient', adapter).read();
  assert.equal(merged.object_contents[letterId].body, 'concurrent letter');
  assert.deepEqual(merged.object_contents[frameId], frame);
  assert.equal(merged.revision, 2);
  await assert.rejects(a.saveGiftLocked(a.read()), /其他页面更新/, 'Stale full snapshots cannot silently overwrite other edits');
  const c = new GiftStore(base, world, 'sender', adapter), d = new GiftStore(base, world, 'sender', adapter);
  await c.saveLocked(letterId, { kind: 'letter', body: 'newer letter' });
  const preserved = adapter.getItem(c.storageKey);
  await assert.rejects(d.saveLocked(letterId, { kind: 'letter', body: 'stale letter' }), /其他页面更新/);
  assert.equal(adapter.getItem(c.storageKey), preserved);
  await b.saveRoomLocked(defaultRoom);
  const bound = new GiftStore(base, world, 'recipient', adapter).read();
  assert.equal(bound.object_contents[letterId].body, 'newer letter');
  assert.deepEqual(bound.object_contents[frameId], frame);
  assert.deepEqual(bound.room, defaultRoom);
  assert.equal(bound.revision, 4);
  // Inline gift details merge with the latest scene/content rather than a stale full draft.
  const infoA = new GiftStore(base, world, 'sender', adapter), infoB = new GiftStore(base, world, 'sender', adapter), infoStale = new GiftStore(base, world, 'sender', adapter);
  await infoA.saveDetailsLocked({ recipient: '小河', memory: '共同回忆' });
  await infoB.saveDetailsLocked({ sender: '小林' });
  const info = new GiftStore(base, world, 'recipient', adapter).read();
  assert.equal(info.details.recipient, '小河');
  assert.equal(info.details.sender, '小林');
  assert.equal(info.details.memory, '共同回忆');
  assert.deepEqual(info.room, bound.room);
  assert.deepEqual(info.object_contents, bound.object_contents);
  const infoBeforeConflict = adapter.getItem(infoA.storageKey);
  await assert.rejects(infoStale.saveDetailsLocked({ recipient: '覆盖昵称' }), /其他页面更新/);
  assert.equal(adapter.getItem(infoA.storageKey), infoBeforeConflict);
  await assert.rejects(infoA.saveDetailsLocked({ recipient: 'x'.repeat(21) }), /信息无效/);
  await assert.rejects(infoA.saveDetailsLocked({ extra_photos: [] }), /信息无效/);
  const infoFail = new GiftStore(base, world, 'sender', { getItem: adapter.getItem, setItem() { throw Error('quota'); } });
  const infoBeforeFailure = infoFail.read();
  await assert.rejects(infoFail.saveDetailsLocked({ memory: '不会写入' }), /保存失败/);
  assert.deepEqual(infoFail.read(), infoBeforeFailure);
  assert.equal(adapter.getItem(infoA.storageKey), infoBeforeConflict);
  const extras = new Map(), extrasAdapter = { getItem: k => extras.get(k) ?? null, setItem: (k, v) => extras.set(k, v) };
  const withExtras = new GiftStore({ ...base, details: { ...info.details, extra_photos: [frame.photo] } }, world, 'sender', extrasAdapter);
  assert.deepEqual((await withExtras.saveDetailsLocked({ memory: '新回忆' })).details.extra_photos, [frame.photo]);
  const nextRoom = structuredClone(defaultRoom); nextRoom.seed++;
  const stale = new GiftStore(base, world, 'sender', adapter);
  await b.saveRoomLocked(nextRoom);
  await assert.rejects(stale.saveRoomLocked(defaultRoom), /其他页面更新/);
  const beforeRoomFailure = adapter.getItem(b.storageKey);
  const fail = new GiftStore(base, world, 'sender', { getItem: adapter.getItem, setItem() { throw Error('quota'); } });
  await assert.rejects(fail.saveRoomLocked(defaultRoom), /保存失败/);
  assert.equal(adapter.getItem(b.storageKey), beforeRoomFailure);
  assert.deepEqual(fail.read().room, nextRoom);
  let reads = 0, writes = 0;
  const sample = openGift(base, world, EXAMPLE_GIFT_ID, 'sender', { getItem() { reads++; return preserved; }, setItem() { writes++; } });
  assert.equal(reads, 0, 'Example never loads personal content');
  assert.deepEqual(sample.read().object_contents, base.object_contents);
  await assert.rejects(sample.saveRoomLocked(defaultRoom), /无法保存/);
  assert.equal(writes, 0);
  assert.notEqual(collectionKey(EXAMPLE_GIFT_ID), collectionKey(WINTER_GIFT_ID));
  console.log('PASS: concurrent field merge, stale snapshot/same-field/room conflicts, room binding, quota rollback, revisions and read-only example isolation');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(asyncTimeout));
