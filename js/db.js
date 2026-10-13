// Tiny IndexedDB wrapper – all data stays on the device.
const DB_NAME = 'eicr-app', VER = 1;
let dbp;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VER);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const s = t.objectStore(store);
    const r = fn(s);
    t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
export const db = {
  allJobs: () => tx('jobs', 'readonly', s => s.getAll()),
  getJob: id => tx('jobs', 'readonly', s => s.get(id)),
  putJob: job => tx('jobs', 'readwrite', s => s.put(job)),
  deleteJob: id => tx('jobs', 'readwrite', s => s.delete(id)),
  getKV: k => tx('kv', 'readonly', s => s.get(k)),
  setKV: (k, v) => tx('kv', 'readwrite', s => s.put(v, k)),
};
