import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, set, remove, push } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";

function nowIso() {
  return new Date().toISOString();
}

function getSiteMetaEntries(payload) {
  if (!payload) return null;
  if (payload.entries && typeof payload.entries === 'object') return payload.entries;
  return payload;
}

function buildSiteMetaPayload(meta, sourceInfo) {
  var entries = window.GAILS && typeof window.GAILS.cloneBakeryMeta === 'function'
    ? window.GAILS.cloneBakeryMeta(meta)
    : meta;
  var regions = new Set();
  var managers = new Set();
  var normalizedInfo = sourceInfo || {};

  Object.values(entries || {}).forEach(function(entry) {
    if (entry && entry.r) regions.add(entry.r);
    if (entry && entry.o) managers.add(entry.o);
  });

  return {
    entries: entries,
    siteCount: Object.keys(entries || {}).length,
    regionCount: regions.size,
    managerCount: managers.size,
    sourceName: normalizedInfo.fileName || normalizedInfo.sourceName || '',
    sourceSheetName: normalizedInfo.sheetName || normalizedInfo.sourceSheetName || '',
    duplicateCount: Number(normalizedInfo.duplicateCount || 0),
    updatedAt: nowIso(),
    updatedBy: auth.currentUser ? (auth.currentUser.email || auth.currentUser.uid) : 'Unknown'
  };
}

window.GAILS_Firebase = {
  saveData: async function(records, months, sourceName) {
    if (!auth.currentUser) return;
    try {
      var ts = nowIso();
      var meta = {
        recordCount: records.length,
        monthCount: months.length,
        sourceName: sourceName || '',
        updatedAt: ts,
        updatedBy: auth.currentUser.email || auth.currentUser.uid
      };
      await set(ref(db, 'dashboardData'), {
        records: records,
        months: months,
        ...meta
      });
      await set(ref(db, 'dashboardMeta'), meta);
      try {
        localStorage.setItem('gails_firebase_cache_ts', ts);
        localStorage.setItem('gails_firebase_cache', JSON.stringify({ records: records, months: months }));
      } catch (cacheErr) {
        console.warn('Could not update local cache:', cacheErr);
      }
      console.log('Firebase DB: Saved successfully.');
    } catch (e) {
      console.error('Firebase DB: Save failed.', e);
    }
  },
  getDashboardData: async function() {
    var snapshot = await get(ref(db, 'dashboardData'));
    return snapshot.exists() ? snapshot.val() : null;
  },
  clearDashboardData: async function() {
    await remove(ref(db, 'dashboardData'));
    localStorage.removeItem('gails_firebase_cache_ts');
    localStorage.removeItem('gails_firebase_cache');
  },
  saveSiteMeta: async function(meta, sourceInfo) {
    if (!auth.currentUser) return;
    var payload = buildSiteMetaPayload(meta, sourceInfo);
    await set(ref(db, 'portalData/siteMeta'), payload);
    return payload;
  }
};

const loadingScreen = document.getElementById('loadingScreen');
const loginScreen = document.getElementById('loginScreen');
const headerEl = document.querySelector('.header');
const containerEl = document.querySelector('.container');
const loginForm = document.getElementById('loginForm');
const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const loginError = document.getElementById('loginError');
const logoutBtn = document.getElementById('logoutBtn');

let siteMetaUnsubscribe = null;
let _freshLogin = false;

const ACTIVITY_LOG_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

function getLastLogKey(uid) {
  return 'gails_activity_log_ts_' + uid;
}

function shouldLogActivity(uid, action) {
  if (action === 'login') return true;
  var lastStr = localStorage.getItem(getLastLogKey(uid));
  if (!lastStr) return true;
  return (Date.now() - Number(lastStr)) >= ACTIVITY_LOG_COOLDOWN_MS;
}

function markActivityLogged(uid) {
  try {
    localStorage.setItem(getLastLogKey(uid), String(Date.now()));
  } catch (e) {}
}

headerEl.style.display = 'none';
containerEl.style.display = 'none';

function applySiteMeta(payload) {
  var meta = getSiteMetaEntries(payload);
  if (window.GAILS && typeof window.GAILS.setBakeryMeta === 'function') {
    window.GAILS.setBakeryMeta(meta);
  }
  window.dispatchEvent(new CustomEvent('gails:site-meta-sync', {
    detail: {
      payload: payload || null,
      meta: window.GAILS && typeof window.GAILS.getBakeryMetaSnapshot === 'function'
        ? window.GAILS.getBakeryMetaSnapshot()
        : meta
    }
  }));
}

function stopSiteMetaSync() {
  if (siteMetaUnsubscribe) {
    siteMetaUnsubscribe();
    siteMetaUnsubscribe = null;
  }
}

function startSiteMetaSync() {
  get(ref(db, 'portalData/siteMeta')).then(function(snapshot) {
    applySiteMeta(snapshot.exists() ? snapshot.val() : null);
  }).catch(function(error) {
    console.error('Failed to load site metadata:', error);
    applySiteMeta(null);
  });
}

function clearLoginForm() {
  if (loginForm) loginForm.reset();
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (loginError) {
    loginError.textContent = '';
    loginError.style.display = 'none';
  }
}

async function loadSharedDashboardData(isAdmin) {
  try {
    var statusEl = document.getElementById('uploadStatus');

    // Fetch lightweight metadata first to check if a download is actually needed
    var metaSnap = await get(ref(db, 'dashboardMeta'));
    if (!metaSnap.exists()) {
      if (isAdmin) {
        var uploadZone = document.getElementById('uploadZone');
        if (uploadZone) uploadZone.style.display = '';
      }
      loadingScreen.style.display = 'none';
      return;
    }

    var meta = metaSnap.val();
    var cachedTs = localStorage.getItem('gails_firebase_cache_ts');
    var data = null;

    // Use the local cache if it matches the server's timestamp
    if (cachedTs && cachedTs === meta.updatedAt) {
      try {
        var raw = localStorage.getItem('gails_firebase_cache');
        if (raw) data = JSON.parse(raw);
      } catch (e) {
        data = null;
      }
    }

    // Cache miss or stale — download the full dataset from Firebase
    if (!data) {
      var dbSnap = await get(ref(db, 'dashboardData'));
      if (!dbSnap.exists()) {
        if (isAdmin) {
          var uploadZoneEl = document.getElementById('uploadZone');
          if (uploadZoneEl) uploadZoneEl.style.display = '';
        }
        loadingScreen.style.display = 'none';
        return;
      }
      data = dbSnap.val();
      try {
        localStorage.setItem('gails_firebase_cache_ts', meta.updatedAt);
        localStorage.setItem('gails_firebase_cache', JSON.stringify({ records: data.records || [], months: data.months || [] }));
      } catch (cacheErr) {
        console.warn('Could not cache Firebase data locally:', cacheErr);
      }
    }

    var tryInit = setInterval(function() {
      if (window.GAILS_initDashboard) {
        clearInterval(tryInit);
        window.GAILS_initDashboard(data.records || [], data.months || []);
        loadingScreen.style.display = 'none';
        if (statusEl) {
          statusEl.textContent = 'Loaded data securely from Firebase Database';
          statusEl.className = 'status success';
        }
      }
    }, 100);
  } catch (e) {
    console.error("Failed to load Firebase data:", e);
    loadingScreen.style.display = 'none';
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const adminRef = ref(db, `admins/${user.uid}`);
    const userRef = ref(db, `users/${user.uid}`);
    try {
      const adminSnap = await get(adminRef);
      const userSnap = await get(userRef);

      let isAdmin = false;
      let isAllowed = false;

      if (adminSnap.exists() && adminSnap.val() === true) {
        isAdmin = true;
        isAllowed = true;
        if (!userSnap.exists()) {
          await set(ref(db, `users/${user.uid}`), { email: user.email, role: 'admin' });
        }
      }
      if (userSnap.exists() && userSnap.val() !== null) {
        isAllowed = true;
        if (userSnap.val().role === 'admin') isAdmin = true;
      }

      if (isAllowed) {
        const action = _freshLogin ? 'login' : 'session_resume';
        _freshLogin = false;
        if (shouldLogActivity(user.uid, action)) {
          try {
            await push(ref(db, 'activityLog'), {
              email: user.email || user.uid,
              uid: user.uid,
              role: isAdmin ? 'admin' : 'viewer',
              action: action,
              timestamp: nowIso()
            });
            markActivityLogged(user.uid);
          } catch (logErr) {
            console.warn('Could not write login activity log:', logErr);
          }
        }
        showApp(isAdmin);
        startSiteMetaSync();
        await loadSharedDashboardData(isAdmin);
      } else {
        loginError.textContent = "You don't have access to this dashboard. Contact your administrator.";
        loginError.style.display = 'block';
        stopSiteMetaSync();
        await signOut(auth);
        showApp(undefined);
      }
    } catch (e) {
      console.error("DB error", e);
      loginError.textContent = "Database connection error or permission denied. Check configuration and rules.";
      loginError.style.display = 'block';
      stopSiteMetaSync();
      await signOut(auth);
      showApp(undefined);
    }
  } else {
    stopSiteMetaSync();
    applySiteMeta(null);
    clearLoginForm();
    showApp(undefined);
  }
});

function showApp(isAdmin) {
  if (isAdmin !== undefined) {
    // Keep the loading screen visible — loadSharedDashboardData will dismiss it
    // once Firebase data has finished loading.
    loginScreen.style.display = 'none';
    headerEl.style.display = 'flex';
    containerEl.style.display = 'block';

    const adminBtn = document.getElementById('adminBtn');
    const uploader = document.getElementById('uploadZone');
    if (adminBtn) adminBtn.style.display = isAdmin ? 'inline-block' : 'none';

    // Always hide upload zone initially — loadSharedDashboardData will reveal it
    // for admins only if there is no Firebase data to load.
    if (uploader) uploader.style.display = 'none';
  } else {
    loadingScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    headerEl.style.display = 'none';
    containerEl.style.display = 'none';
  }
}

async function handleLogin(event) {
  if (event) event.preventDefault();
  loginError.style.display = 'none';
  const email = emailInput.value;
  const password = passwordInput.value;

  if (!email || !password) {
    loginError.textContent = 'Please enter email and password.';
    loginError.style.display = 'block';
    return;
  }

  const loginText = loginBtn.textContent;
  loginBtn.textContent = 'Logging in...';
  loginBtn.disabled = true;

  try {
    _freshLogin = true;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    _freshLogin = false;
    loginError.textContent = error.message;
    loginError.style.display = 'block';
  } finally {
    loginBtn.textContent = loginText;
    loginBtn.disabled = false;
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', handleLogin);
} else if (loginBtn) {
  loginBtn.addEventListener('click', handleLogin);
}

if (adminBtn) {
  adminBtn.addEventListener('click', function() {
    window.location.href = 'admin.html';
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    clearLoginForm();
    await signOut(auth);
  });
}
