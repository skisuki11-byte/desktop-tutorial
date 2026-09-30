// 端末内保存（IndexedDB）。会議データと音声チャンクをブラウザに残す。
// 音声は5秒ごとに追記するので、タブが落ちても直前までの録音が残る。
const DB = 'minutes-app';
let dbp;
const open = () => dbp || (dbp = new Promise((res, rej) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => {
    const d = r.result;
    d.createObjectStore('meetings', { keyPath: 'id' });
    d.createObjectStore('audio', { autoIncrement: true }).createIndex('mid', 'mid');
  };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
}));
const tx = async (store, mode, fn) => {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
};

export const saveMeeting = (m) => tx('meetings', 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(m))));
export const getMeeting = (id) => tx('meetings', 'readonly', (s) => s.get(id));
export const listMeetings = async () => (await tx('meetings', 'readonly', (s) => s.getAll())).sort((a, b) => b.createdAt - a.createdAt);
export const addAudio = (mid, blob) => tx('audio', 'readwrite', (s) => s.add({ mid, blob }));
export async function getAudio(mid) {
  const rows = await tx('audio', 'readonly', (s) => s.index('mid').getAll(mid));
  return rows.map((r) => r.blob);
}
export const hasAudio = async (mid) => (await tx('audio', 'readonly', (s) => s.index('mid').count(mid))) > 0;
export async function deleteMeeting(id) {
  const d = await open();
  await new Promise((res, rej) => {
    const t = d.transaction(['meetings', 'audio'], 'readwrite');
    t.objectStore('meetings').delete(id);
    const cur = t.objectStore('audio').index('mid').openKeyCursor(IDBKeyRange.only(id));
    cur.onsuccess = () => { const c = cur.result; if (c) { t.objectStore('audio').delete(c.primaryKey); c.continue(); } };
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
