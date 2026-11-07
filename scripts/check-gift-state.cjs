const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
require('node:child_process').execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'),
  'src/world/GiftStore.ts', 'src/world/WinterGift.ts', 'src/world/config.ts', '--ignoreConfig', '--outDir', '.room-qa/gift-state',
  '--module', 'node16', '--target', 'es2020', '--moduleResolution', 'node16', '--esModuleInterop', '--resolveJsonModule', '--skipLibCheck'], { cwd: root, stdio: 'inherit' });
const { GiftStore, validGiftContent } = require('../.room-qa/gift-state/GiftStore.js');
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
assert.throws(() => new GiftStore(base, world, 'recipient', storage).save(letterId, { kind: 'letter', body: '不允许' }), /不能编辑/);
assert.throws(() => sender.save(letterId, frame), /格式无效/);
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

const { openWinterGift, giftWithDraft, draftFromGift, WINTER_GIFT_ID, LEGACY_DRAFT_KEY } = require('../.room-qa/gift-state/WinterGift.js');
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
assert.throws(() => canonicalOnly.saveGift(canonicalOnly.read()), /不能编辑/);
const invalid = giftWithDraft(winter.read(), updated);
invalid.object_contents[frameId].zoom = 9;
const beforeInvalid = winterRecords.get(canonicalKey);
assert.throws(() => winter.saveGift(invalid), /格式无效/);
assert.equal(winterRecords.get(canonicalKey), beforeInvalid);
console.log('PASS: complete atomic gift save, failure rollback, read-only legacy migration, canonical precedence, room/form consistency, crop preservation');
