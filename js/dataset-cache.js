// ========== SHARED DATASET CACHE ==========
// The parsed workbook behind the whole dashboard — every bakery, every month —
// held locally so a reload that the server says is still current does not
// re-download it.
//
// It lived in localStorage, which broke down in two ways as the dataset grew:
//
//   1. A hard ~5MB quota, and the write is the *only* thing that fails. Once
//      the estate's history passed it, setItem threw, the throw was swallowed
//      as a console warning, and every load from then on silently re-downloaded
//      the full dataset — the exact failure that looks like "it just got slow"
//      and has no visible cause.
//   2. localStorage is synchronous and string-only, so each save serialised
//      megabytes of records with JSON.stringify on the main thread, and each
//      load parsed them back, blocking paint both times.
//
// IndexedDB fixes both: quota is a large fraction of free disk rather than 5MB,
// and structured clone stores the arrays as objects, off the string path
// entirely. Everything here degrades to "no cache" rather than throwing —
// a miss only ever costs a download, which is what the old failure did anyway,
// except now it is reported.
const DB_NAME = 'gails-dashboard';
const DB_VERSION = 1;
const STORE = 'dataset';
const RECORD_KEY = 'current';

// The keys the localStorage cache used. Read once so an existing cache is
// honoured on the first load after this ships instead of forcing a download,
// then cleared to give the quota back.
const LEGACY_TS_KEY = 'gails_firebase_cache_ts';
const LEGACY_DATA_KEY = 'gails_firebase_cache';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve) {
    // Absent in some in-app browsers, and it throws rather than returning null
    // in Firefox private windows.
    let request;
    try {
      if (!self.indexedDB) return resolve(null);
      request = self.indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      return resolve(null);
    }
    request.onupgradeneeded = function () {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = function () { resolve(request.result); };
    request.onerror = function () { resolve(null); };
    // Another tab holding an old version open would otherwise hang this
    // forever, and the dashboard would never render.
    request.onblocked = function () { resolve(null); };
  });
  return dbPromise;
}

// Resolves { ok, result, error } rather than throwing, so a caller can tell a
// genuine failure from an empty cache. The distinction matters: a read that
// finds nothing is routine, but a write that failed is the thing that used to
// go unnoticed and quietly cost a full download on every load afterwards.
function runTransaction(mode, run) {
  return openDb().then(function (db) {
    if (!db) return { ok: false, error: new Error('IndexedDB unavailable') };
    return new Promise(function (resolve) {
      let tx;
      let request;
      try {
        tx = db.transaction(STORE, mode);
        // Both of these throw rather than fire an error event — an absent
        // store, or a put of something the structured clone algorithm cannot
        // handle — so they belong inside the guard with the transaction.
        request = run(tx.objectStore(STORE));
      } catch (e) {
        return resolve({ ok: false, error: e });
      }
      tx.onabort = function () { resolve({ ok: false, error: tx.error }); };
      tx.onerror = function () { resolve({ ok: false, error: tx.error }); };
      tx.oncomplete = function () {
        resolve({ ok: true, result: request ? request.result : null });
      };
    });
  }).catch(function (error) {
    return { ok: false, error: error };
  });
}

function readLegacyCache() {
  try {
    const ts = localStorage.getItem(LEGACY_TS_KEY);
    const raw = localStorage.getItem(LEGACY_DATA_KEY);
    if (!ts || !raw) return null;
    const parsed = JSON.parse(raw);
    return {
      ts: ts,
      records: parsed.records || [],
      months: parsed.months || [],
      sourceLastUpdated: parsed.sourceLastUpdated || null
    };
  } catch (e) {
    return null;
  }
}

function clearLegacyCache() {
  try {
    localStorage.removeItem(LEGACY_TS_KEY);
    localStorage.removeItem(LEGACY_DATA_KEY);
  } catch (e) { /* storage unavailable */ }
}

// Resolves the cached dataset, or null if there isn't a usable one. Never
// rejects — a caller that gets null simply downloads.
export function readDatasetCache() {
  return runTransaction('readonly', function (store) {
    return store.get(RECORD_KEY);
  }).then(function (outcome) {
    const record = outcome.ok ? outcome.result : null;
    if (record && record.ts) return record;
    // First load after the move: adopt whatever localStorage still holds so
    // this release does not cost everyone one extra full download. The old
    // copy is only dropped once the new one is safely stored — clearing it
    // eagerly would throw the cache away whenever the write failed.
    const legacy = readLegacyCache();
    if (legacy) {
      writeDatasetCache(legacy.ts, legacy).then(function (stored) {
        if (stored) clearLegacyCache();
      });
    }
    return legacy;
  });
}

// Stores the dataset against the server timestamp that produced it. Fire and
// forget: nothing renders off the result, so no caller waits for it.
export function writeDatasetCache(ts, payload) {
  if (!ts || !payload) return Promise.resolve(false);
  const record = {
    ts: ts,
    records: payload.records || [],
    months: payload.months || [],
    sourceLastUpdated: payload.sourceLastUpdated || null
  };
  return runTransaction('readwrite', function (store) {
    return store.put(record, RECORD_KEY);
  }).then(function (outcome) {
    // Reported rather than swallowed: a cache that has quietly stopped working
    // is indistinguishable from the app simply being slow, which is how the
    // localStorage version failed for so long.
    if (!outcome.ok) {
      console.warn('Could not cache the dashboard dataset locally — every load '
        + 'will re-download it until this is resolved:', outcome.error);
    }
    return outcome.ok;
  });
}

export function clearDatasetCache() {
  clearLegacyCache();
  return runTransaction('readwrite', function (store) {
    return store.delete(RECORD_KEY);
  });
}
