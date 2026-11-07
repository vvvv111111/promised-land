import { MAX_AUDIO_BYTES, type AudioSelection } from "../media/audio";
export type RoomAudio = AudioSelection & { giftId: string; updatedAt: number };

const database = "promised-land-room-audio";
const collection = "tracks";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(database, 1);
    const fail = (error: Error | DOMException | null) => { settled = true; reject(error ?? new Error("浏览器无法打开音频存储，请关闭其他标签页后重试。")); };
    request.onupgradeneeded = () => request.result.createObjectStore(collection, { keyPath: "giftId" });
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(null);
    request.onsuccess = () => {
      if (settled) { request.result.close(); return; }
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    let request: IDBRequest<T>;
    try {
      transaction = db.transaction(collection, mode);
      request = action(transaction.objectStore(collection));
    } catch (error) { db.close(); reject(error); return; }
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onabort = () => { db.close(); reject(transaction.error ?? request.error ?? new Error("音频未能保存。")); };
    // Request errors abort the transaction by default. Resolve only after commit,
    // so quota/abort failure leaves the previous complete audio record intact.
  });
}

export const roomAudioStore = {
  async read(giftId: string): Promise<RoomAudio | null> {
    const record = await operation<RoomAudio | undefined>("readonly", store => store.get(giftId));
    if (!record) return null;
    if (record.giftId !== giftId || typeof record.name !== "string" || !(record.blob instanceof Blob) || !record.blob.size || record.blob.size > MAX_AUDIO_BYTES || !Number.isFinite(record.updatedAt)) {
      throw new Error("音频记录无法读取，请重新上传。");
    }
    return record;
  },
  async save(giftId: string, selection: AudioSelection): Promise<RoomAudio> {
    if (!giftId || !selection.blob.size || selection.blob.size > MAX_AUDIO_BYTES) throw new Error("请选择 20MB 以内的音频文件。");
    const record: RoomAudio = { giftId, name: selection.name, blob: selection.blob, updatedAt: Date.now() };
    await operation("readwrite", store => store.put(record));
    return record;
  },
  async remove(giftId: string): Promise<void> { await operation("readwrite", store => store.delete(giftId)); },
};
