// The shared dataset cache, exercised against a fake IndexedDB rather than
// only pattern-matched, because its whole job is to behave sanely when the
// storage underneath it misbehaves — which is exactly what the localStorage
// version failed to do.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/dataset-cache.js'), 'utf8');

// A minimal in-memory IndexedDB: enough of the surface the module actually
// touches, with a switch for making writes fail the way a quota error does.
function makeFakeIndexedDB(options) {
  const opts = options || {};
  const data = new Map();
  return {
    store: data,
    open() {
      const request = {};
      queueMicrotask(() => {
        if (opts.openFails) {
          request.error = new Error('open refused');
          if (request.onerror) request.onerror();
          return;
        }
        request.result = {
          objectStoreNames: { contains: () => true },
          transaction(name, mode) {
            const tx = { error: null };
            tx.objectStore = () => ({
              get(key) {
                const req = {};
                queueMicrotask(() => {
                  req.result = data.get(key);
                  if (tx.oncomplete) tx.oncomplete();
                });
                return req;
              },
              put(value, key) {
                const req = {};
                queueMicrotask(() => {
                  if (opts.writeFails) {
                    tx.error = new Error('QuotaExceededError');
                    if (tx.onerror) tx.onerror();
                    return;
                  }
                  data.set(key, value);
                  req.result = key;
                  if (tx.oncomplete) tx.oncomplete();
                });
                return req;
              },
              delete(key) {
                const req = {};
                queueMicrotask(() => {
                  data.delete(key);
                  if (tx.oncomplete) tx.oncomplete();
                });
                return req;
              }
            });
            void mode;
            return tx;
          }
        };
        if (request.onsuccess) request.onsuccess();
      });
      return request;
    }
  };
}

function makeFakeLocalStorage(seed) {
  const map = new Map(Object.entries(seed || {}));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map
  };
}

// The module is an ES module; load it with a fresh global environment per test
// so each one gets its own database and its own console.
async function loadModule(env) {
  const previous = {
    indexedDB: global.indexedDB,
    localStorage: global.localStorage,
    self: global.self,
    console: global.console
  };
  global.indexedDB = env.indexedDB;
  global.localStorage = env.localStorage;
  global.self = { indexedDB: env.indexedDB };
  const warnings = [];
  global.console = Object.assign(Object.create(console), {
    warn: (...args) => warnings.push(args.join(' '))
  });
  // Cache-bust so module-level state (the open-database promise) is fresh.
  const url = 'file://' + path.join(root, 'js/dataset-cache.js').replace(/\\/g, '/')
    + '?t=' + Math.random();
  const mod = await import(url);
  return {
    mod,
    warnings,
    restore() { Object.assign(global, previous); }
  };
}

const PAYLOAD = {
  records: [{ b: 'Union Street, Bath', ac: 81 }],
  months: ['Jul 26'],
  sourceLastUpdated: '2026-07-31'
};

test('a written dataset reads back with its timestamp', async () => {
  const env = { indexedDB: makeFakeIndexedDB(), localStorage: makeFakeLocalStorage() };
  const { mod, restore } = await loadModule(env);
  try {
    assert.equal(await mod.writeDatasetCache('2026-08-01T09:00:00Z', PAYLOAD), true);
    const read = await mod.readDatasetCache();
    assert.equal(read.ts, '2026-08-01T09:00:00Z');
    assert.deepEqual(read.months, ['Jul 26']);
    assert.equal(read.records[0].b, 'Union Street, Bath');
  } finally {
    restore();
  }
});

test('a failed write is reported, not swallowed', async () => {
  const env = {
    indexedDB: makeFakeIndexedDB({ writeFails: true }),
    localStorage: makeFakeLocalStorage()
  };
  const { mod, warnings, restore } = await loadModule(env);
  try {
    assert.equal(await mod.writeDatasetCache('2026-08-01T09:00:00Z', PAYLOAD), false);
    // The old failure mode was a silent console.warn-and-continue that left
    // every later load re-downloading with no indication why.
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /re-download/);
  } finally {
    restore();
  }
});

test('an unavailable database degrades to a cache miss, not a crash', async () => {
  const env = {
    indexedDB: makeFakeIndexedDB({ openFails: true }),
    localStorage: makeFakeLocalStorage()
  };
  const { mod, restore } = await loadModule(env);
  try {
    assert.equal(await mod.readDatasetCache(), null);
    assert.equal(await mod.writeDatasetCache('2026-08-01T09:00:00Z', PAYLOAD), false);
  } finally {
    restore();
  }
});

test('an existing localStorage cache is adopted rather than re-downloaded', async () => {
  const localStorage = makeFakeLocalStorage({
    gails_firebase_cache_ts: '2026-08-01T09:00:00Z',
    gails_firebase_cache: JSON.stringify(PAYLOAD)
  });
  const env = { indexedDB: makeFakeIndexedDB(), localStorage };
  const { mod, restore } = await loadModule(env);
  try {
    const read = await mod.readDatasetCache();
    assert.equal(read.ts, '2026-08-01T09:00:00Z');
    assert.equal(read.records[0].ac, 81);
    // Migrated across, then the old copy released to give the quota back.
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(localStorage.getItem('gails_firebase_cache'), null);
    const again = await mod.readDatasetCache();
    assert.equal(again.ts, '2026-08-01T09:00:00Z');
  } finally {
    restore();
  }
});

test('the legacy cache survives a failed migration write', async () => {
  const localStorage = makeFakeLocalStorage({
    gails_firebase_cache_ts: '2026-08-01T09:00:00Z',
    gails_firebase_cache: JSON.stringify(PAYLOAD)
  });
  const env = {
    indexedDB: makeFakeIndexedDB({ writeFails: true }),
    localStorage
  };
  const { mod, restore } = await loadModule(env);
  try {
    const read = await mod.readDatasetCache();
    assert.equal(read.ts, '2026-08-01T09:00:00Z');
    await new Promise((r) => setTimeout(r, 10));
    // Clearing it eagerly would have thrown the only copy away.
    assert.notEqual(localStorage.getItem('gails_firebase_cache'), null);
  } finally {
    restore();
  }
});

test('nothing outside this module touches the raw cache keys', () => {
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  assert.doesNotMatch(auth, /gails_firebase_cache/);
  assert.match(auth, /readDatasetCache|writeDatasetCache|clearDatasetCache/);
  // Records and months are handed to structured clone as objects. Serialising
  // megabytes to a string by hand on the main thread is the cost this move
  // exists to avoid, so the write path stores the record directly.
  assert.match(source, /store\.put\(record, RECORD_KEY\)/);
  // JSON is only for reading what the old localStorage cache left behind.
  const code = source.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /JSON\.stringify/);
  assert.equal((code.match(/JSON\.parse/g) || []).length, 1);
});
