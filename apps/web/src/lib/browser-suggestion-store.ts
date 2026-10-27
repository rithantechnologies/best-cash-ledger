import { clearRememberedField, getRemembered, normalizeFieldKey, safeRememberedValue, saveRemembered } from './browser-suggestion-history';

const DB_NAME = 'cashledger-browser-field-history';
const STORE = 'values';
const META = 'meta';
const opened: { promise?: Promise<IDBDatabase> } = {};
const migrations = new Map<string, Promise<void>>();

type RecordValue = { id: string; staff: string; field: string; value: string; updatedAt: number };
function record(staff: string, field: string, value: string, updatedAt = Date.now()): RecordValue {
  return { id: JSON.stringify([staff, field, value.toLocaleLowerCase()]), staff, field, value, updatedAt };
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Browser storage unavailable'));
  });
}
function settled(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Browser storage transaction failed'));
  });
}

function openHistory(): Promise<IDBDatabase> {
  if (!opened.promise) {
    opened.promise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB disabled'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const values = db.createObjectStore(STORE, { keyPath: 'id' });
          values.createIndex('staffField', ['staff', 'field'], { unique: false });
        }
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => { db.close(); opened.promise = undefined; };
        resolve(db);
      };
      req.onerror = () => reject(req.error || new Error('Could not open browser history'));
      req.onblocked = () => reject(new Error('Browser history upgrade blocked'));
    }).catch(e => { opened.promise = undefined; throw e; });
  }
  return opened.promise;
}

/** Migrate each staff member's previous localStorage history only once. */
async function migrate(staff: string): Promise<void> {
  if (migrations.has(staff)) return migrations.get(staff);
  const task = (async () => {
    const db = await openHistory();
    const check = db.transaction(META, 'readonly');
    if (await request(check.objectStore(META).get(staff))) return;
    const values = getRemembered(localStorage, staff);
    const tx = db.transaction([STORE, META], 'readwrite');
    const target = tx.objectStore(STORE);
    let timestamp = Date.now();
    for (const [rawField, entries] of Object.entries(values)) {
      const field = normalizeFieldKey(rawField);
      for (let i = entries.length - 1; i >= 0; i--) {
        const value = safeRememberedValue(field, entries[i]);
        if (value) target.put(record(staff, field, value, ++timestamp));
      }
    }
    tx.objectStore(META).put(true, staff);
    await settled(tx);
  })();
  migrations.set(staff, task);
  try { await task; } catch (e) { migrations.delete(staff); throw e; }
}

export async function readFieldValues(staff: string, field: string): Promise<string[]> {
  try {
    await migrate(staff);
    const db = await openHistory();
    const tx = db.transaction(STORE, 'readonly');
    const entries = await request(tx.objectStore(STORE).index('staffField').getAll([staff, field])) as RecordValue[];
    return entries.sort((a, b) => b.updatedAt - a.updatedAt).map(e => e.value);
  } catch {
    return getRemembered(localStorage, staff)[field] || [];
  }
}

export async function rememberFieldValue(staff: string, field: string, raw: string): Promise<void> {
  const value = safeRememberedValue(field, raw);
  if (!value) return;
  try {
    await migrate(staff);
    const db = await openHistory();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record(staff, field, value));
    await settled(tx);
  } catch {
    saveRemembered(localStorage, staff, field, value);
  }
}

export async function clearFieldValues(staff: string, field: string): Promise<void> {
  // Preserve old history for migration before clearing this one field.
  try {
    await migrate(staff);
    const db = await openHistory();
    const tx = db.transaction(STORE, 'readwrite');
    const entries = tx.objectStore(STORE);
    const keys = await request(entries.index('staffField').getAllKeys([staff, field]));
    for (const key of keys) entries.delete(key);
    await settled(tx);
  } catch {
    // Fallback storage may be unavailable; nothing else is changed.
  }
  clearRememberedField(localStorage, staff, field);
}
