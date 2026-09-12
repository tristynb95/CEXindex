// Superset Firebase stub: every firebasejs/** import is fulfilled with this one
// module, so each page destructures whatever subset it needs.
const DATA = {
  admins: { u1: true },
  users: { u1: { name: 'Test User', email: 'test@gails.test', role: 'admin', opsArea: 'North', myActivity: true } },
  roles: {},
  userDirectory: {},
  dashboardMeta: { updatedAt: 1 },
  dashboardData: {
    updatedAt: 1, recordCount: 2, monthCount: 2, sourceName: 'fixture.xlsx',
    months: ['Jul 2026', 'Aug 2026'],
    records: [
      { b: 'Test Bakery', m: 'Jul 2026', nr: 3, n: 40, na: 40, v: 120, va: 120, s2: 82.5, s2w: 80.1, s3: 74.2, s4: 79.0,
        o5: 66.4, ov: 78.3, fr: 88.1, dr: 74.6, ef: 69.2, s30: 61.5, td: 12, at: 210, at12: 200, at9: 190,
        nc: 30, nm: 6, nd: 40, vc: 110, vf: 0 },
      { b: 'Test Bakery', m: 'Aug 2026', nr: 2, n: 44, na: 44, v: 132, va: 132, s2: 85.2, s2w: 83.0, s3: 77.1, s4: 81.4,
        o5: 69.0, ov: 80.9, fr: 90.2, dr: 77.3, ef: 72.5, s30: 64.8, td: 9, at: 198, at12: 188, at9: 180,
        nc: 33, nm: 5, nd: 44, vc: 121, vf: 0 }
    ]
  },
  portalData: { siteMeta: { entries: {
    'Test Bakery': { r: 'London', o: 'North', lat: 51.52, lng: -0.12, addr: '1 Test Street, London' },
    'Second Bakery': { r: 'London', o: 'North', lat: 51.50, lng: -0.10, addr: '2 Other Road, London' }
  } } },
  appSettings: { reportVisibility: { enabled: false } },
  routineVisits: {}, followUpActions: {}, bakeryNotes: {}, notificationEvents: {}
};
function walk(path) {
  if (!path) return DATA;
  let node = DATA;
  for (const seg of String(path).split('/').filter(Boolean)) {
    if (node == null || typeof node !== 'object') return undefined;
    node = node[seg];
  }
  return node;
}
function snap(value, key) {
  return {
    exists: () => value !== undefined && value !== null,
    val: () => (value === undefined ? null : value),
    key: key || null,
    forEach(cb) {
      if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) cb(snap(value[k], k));
      }
    }
  };
}
const noop = () => {};
export function initializeApp() { return { name: 'stub' }; }
export function getAuth() { return { currentUser: { uid: 'u1', email: 'test@gails.test', displayName: 'Test User', emailVerified: true, metadata: { lastSignInTime: new Date().toISOString(), creationTime: new Date().toISOString() }, getIdTokenResult: () => Promise.resolve({ claims: {}, token: 'stub-token', issuedAtTime: new Date().toISOString(), authTime: new Date().toISOString() }), getIdToken: () => Promise.resolve('stub-token'), reload: () => Promise.resolve() } }; }
export function getDatabase() { return { _stub: true }; }
export function getStorage() { return { _stub: true }; }
export function getAnalytics() { return { _stub: true }; }
export function isSupported() { return Promise.resolve(false); }
export function getFunctions() { return { _stub: true }; }
export function httpsCallable() { return () => Promise.resolve({ data: {} }); }
export function onAuthStateChanged(auth, cb) {
  Promise.resolve().then(() => cb({ uid: 'u1', email: 'test@gails.test', displayName: 'Test User', emailVerified: true, metadata: { lastSignInTime: new Date().toISOString(), creationTime: new Date().toISOString() }, getIdTokenResult: () => Promise.resolve({ claims: {}, token: 'stub-token', issuedAtTime: new Date().toISOString(), authTime: new Date().toISOString() }), getIdToken: () => Promise.resolve('stub-token'), reload: () => Promise.resolve() }));
  return noop;
}
export function signOut() { return Promise.resolve(); }
export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'u1' } }); }
export function sendPasswordResetEmail() { return Promise.resolve(); }
export function updatePassword() { return Promise.resolve(); }
export function reauthenticateWithCredential() { return Promise.resolve(); }
export const EmailAuthProvider = { credential: () => ({}) };
export function ref(db, path) { return { _path: typeof db === 'string' ? db : path }; }
export function child(r, p) { return { _path: (r && r._path ? r._path + '/' : '') + p }; }
export function get(r) { return Promise.resolve(snap(walk(r && r._path))); }
export function onValue(r, cb) { Promise.resolve().then(() => cb(snap(walk(r && r._path)))); return noop; }
export function off() {}
export function set() { return Promise.resolve(); }
export function update() { return Promise.resolve(); }
export function remove() { return Promise.resolve(); }
export function push(r) { return { key: 'new-id', _path: (r && r._path) + '/new-id' }; }
export function serverTimestamp() { return Date.now(); }
export function runTransaction() { return Promise.resolve({ committed: true }); }
export function query(r) { return r; }
export function orderByChild() { return {}; }
export function startAt() { return {}; }
export function endAt() { return {}; }
export function limitToLast() { return {}; }
export function equalTo() { return {}; }
export function getDownloadURL() { return Promise.resolve(''); }
export function uploadBytes() { return Promise.resolve({}); }
