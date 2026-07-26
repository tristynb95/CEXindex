import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, set, update, remove, push, onValue } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES, normalizePermissions, resolveRolePermissions, hasAdminPanelAccess, canSeeTeam } from './permissions.js';
import { createProfileMenu } from './profile-menu.js';

function nowIso() {
  return new Date().toISOString();
}

function getSiteMetaEntries(payload) {
  if (!payload) return null;
  if (payload.entries && typeof payload.entries === 'object') return payload.entries;
  return payload;
}

function cloneRegionAssignments(assignments) {
  var records = Array.isArray(assignments)
    ? assignments
    : Object.values(assignments && typeof assignments === 'object' ? assignments : {});
  return records.map(function(record) {
    return {
      region: String(record && record.region || '').trim(),
      coffeePartner: String(record && record.coffeePartner || '').trim(),
      coffeeTrainer: String(record && record.coffeeTrainer || '').trim()
    };
  }).filter(function(record) {
    return !!record.region;
  });
}

function buildSiteMetaPayload(meta, sourceInfo, regionAssignments) {
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
    regionAssignments: cloneRegionAssignments(regionAssignments),
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
  saveData: async function(records, months, sourceName, sourceLastUpdated) {
    if (!auth.currentUser) return;
    try {
      var ts = nowIso();
      var meta = {
        recordCount: records.length,
        monthCount: months.length,
        sourceName: sourceName || '',
        sourceLastUpdated: sourceLastUpdated || null,
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
        localStorage.setItem('gails_firebase_cache', JSON.stringify({ records: records, months: months, sourceLastUpdated: sourceLastUpdated || null }));
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
  saveSiteMeta: async function(meta, sourceInfo, regionAssignments) {
    if (!auth.currentUser) return;
    var assignments = regionAssignments;
    if (typeof assignments === 'undefined') {
      var existingSnapshot = await get(ref(db, 'portalData/siteMeta'));
      var existingPayload = existingSnapshot.exists() ? existingSnapshot.val() : null;
      assignments = existingPayload && existingPayload.regionAssignments;
    }
    var payload = buildSiteMetaPayload(meta, sourceInfo, assignments);
    await set(ref(db, 'portalData/siteMeta'), payload);
    return payload;
  },
  saveSiteVisit: async function(visitRecord) {
    if (!auth.currentUser) throw new Error('You must be signed in to log a visit.');
    // Only blocks when the resolved role explicitly denies it, so the field
    // form keeps working for built-in roles. The database rules enforce the
    // same check server-side.
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow logging visits.');
    }
    var newVisitRef = push(ref(db, 'routineVisits'));
    var nowIsoStr = nowIso();
    var payload = Object.assign({
      type: 'siteVisit',
      score: null,
      scoreMax: null,
      meta: {
        source: 'siteVisit',
        createdAt: nowIsoStr,
        // Authorship is recorded separately from updatedBy because an admin
        // correcting a visit later overwrites updatedBy — which would
        // otherwise move the visit into the admin's My Activity hub
        // (my-activity.html) and out of the person's who actually logged it.
        createdBy: auth.currentUser.email || auth.currentUser.uid,
        createdByUid: auth.currentUser.uid,
        updatedAt: nowIsoStr,
        updatedBy: auth.currentUser.email || auth.currentUser.uid
      }
    }, visitRecord);
    await set(newVisitRef, payload);
    return newVisitRef.key;
  },
  deleteSiteVisit: async function(visitId) {
    if (!auth.currentUser) throw new Error('You must be signed in to delete a visit.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (!window.GAILS.isAdmin && perms && perms.admin && perms.admin.visits !== 'edit') {
      throw new Error('Your role does not allow deleting visits.');
    }
    await remove(ref(db, 'routineVisits/' + visitId));
  },
  // ---- Follow-up Actions ----
  // Site-scoped tasks raised on a visit (or ad-hoc) and ticked off later. The
  // same logVisits permission that gates check-ins gates raising/ticking a
  // task; the database rules enforce the identical check server-side.
  saveFollowUpAction: async function(task) {
    if (!auth.currentUser) throw new Error('You must be signed in to add a follow-up.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow adding follow-ups.');
    }
    var who = auth.currentUser.email || auth.currentUser.uid;
    var nowIsoStr = nowIso();
    var newRef = push(ref(db, 'followUpActions'));
    var payload = Object.assign({
      bakery: '',
      title: '',
      detail: '',
      dueDate: null,
      // none | low | medium | high — 'none' is the default, and is also what
      // tasks created before priority existed are treated as on read.
      priority: 'none',
      status: 'open',
      sourceVisitId: null,
      // Who the action belongs to. Raised during a check-in it inherits that
      // visit's assignees; raised standalone it stays null and falls back to
      // the person who created it (see js/attribution.js).
      assignedTo: null,
      completedAt: null,
      completedBy: null
    }, task, {
      createdAt: nowIsoStr,
      createdBy: who,
      meta: { updatedAt: nowIsoStr, updatedBy: who }
    });
    await set(newRef, payload);
    return newRef.key;
  },
  completeFollowUpAction: async function(taskId, done) {
    if (!auth.currentUser) throw new Error('You must be signed in to update a follow-up.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow updating follow-ups.');
    }
    var who = auth.currentUser.email || auth.currentUser.uid;
    var nowIsoStr = nowIso();
    await update(ref(db, 'followUpActions/' + taskId), {
      status: done ? 'done' : 'open',
      completedAt: done ? nowIsoStr : null,
      completedBy: done ? who : null,
      'meta/updatedAt': nowIsoStr,
      'meta/updatedBy': who
    });
  },
  updateFollowUpAction: async function(taskId, patch) {
    if (!auth.currentUser) throw new Error('You must be signed in to update a follow-up.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow updating follow-ups.');
    }
    var who = auth.currentUser.email || auth.currentUser.uid;
    var nowIsoStr = nowIso();
    await update(ref(db, 'followUpActions/' + taskId), Object.assign({}, patch, {
      'meta/updatedAt': nowIsoStr,
      'meta/updatedBy': who
    }));
  },
  deleteFollowUpAction: async function(taskId) {
    if (!auth.currentUser) throw new Error('You must be signed in to delete a follow-up.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow deleting follow-ups.');
    }
    await remove(ref(db, 'followUpActions/' + taskId));
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
const adminBtn = document.getElementById('adminBtn');
const profileMenu = document.querySelector('.header [data-profile-menu]');
const profileMenuBtn = document.getElementById('profileMenuBtn');
const profileMenuPopover = document.getElementById('profileMenuPopover');
const profileMenuAvatar = document.getElementById('profileMenuAvatar');
const profileMenuName = document.getElementById('profileMenuName');
const profileMenuEmail = document.getElementById('profileMenuEmail');
const logoutBtn = document.getElementById('logoutBtn');
const invitationNotice = document.getElementById('invitationNotice');
const invitationNoticeName = document.getElementById('invitationNoticeName');
const invitationNoticeEmail = document.getElementById('invitationNoticeEmail');
const invitationNoticeRole = document.getElementById('invitationNoticeRole');
const invitationNoticeError = document.getElementById('invitationNoticeError');
const confirmInvitationBtn = document.getElementById('confirmInvitationBtn');

let siteMetaUnsubscribe = null;
let dashboardDataUnsubscribe = null;
let routineVisitsUnsubscribe = null;
let followUpActionsUnsubscribe = null;
let appSettingsUnsubscribe = null;
let userDirectoryUnsubscribe = null;
let _freshLogin = false;
let pendingInvitationUserRef = null;

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

// Shared with the admin page — see js/profile-menu.js.
const profileMenuUi = createProfileMenu({
  btn: profileMenuBtn,
  popover: profileMenuPopover,
  avatar: profileMenuAvatar,
  nameEl: profileMenuName,
  emailEl: profileMenuEmail
});

function setProfileMenuOpen(open) {
  profileMenuUi.setOpen(open);
}

function updateProfileMenu(user, profile) {
  profileMenuUi.update(user, profile);
}

function invitationRoleName(roleId, customRoleDef) {
  if (BUILTIN_ROLES[roleId]) return BUILTIN_ROLES[roleId].name;
  return customRoleDef && customRoleDef.name ? customRoleDef.name : roleId;
}

function showInvitationNotice(user, profile, roleId, customRoleDef) {
  var invitation = profile && profile.invitation;
  var shouldShow = invitation && invitation.status === 'pending';
  pendingInvitationUserRef = shouldShow ? ref(db, 'users/' + user.uid) : null;
  invitationNotice.hidden = !shouldShow;
  if (!shouldShow) return;

  invitationNoticeName.textContent = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || user.displayName || 'Not provided';
  invitationNoticeEmail.textContent = profile.email || user.email || 'Not provided';
  invitationNoticeRole.textContent = invitationRoleName(roleId, customRoleDef);
  invitationNoticeError.hidden = true;
  invitationNoticeError.textContent = '';
  confirmInvitationBtn.disabled = false;
  confirmInvitationBtn.textContent = 'Confirm Details';
}

if (confirmInvitationBtn) {
  confirmInvitationBtn.addEventListener('click', async function() {
    if (!pendingInvitationUserRef) return;
    confirmInvitationBtn.disabled = true;
    confirmInvitationBtn.textContent = 'Confirming…';
    invitationNoticeError.hidden = true;
    try {
      var confirmedAt = nowIso();
      await update(pendingInvitationUserRef, {
        'invitation/status': 'accepted',
        'invitation/confirmedAt': confirmedAt,
        updatedAt: confirmedAt
      });
      pendingInvitationUserRef = null;
      invitationNotice.hidden = true;
    } catch (error) {
      invitationNoticeError.textContent = 'Your details could not be confirmed. Please try again.';
      invitationNoticeError.hidden = false;
      confirmInvitationBtn.disabled = false;
      confirmInvitationBtn.textContent = 'Confirm Details';
      console.error('Could not confirm invitation details:', error);
    }
  });
}

headerEl.style.display = 'none';
containerEl.style.display = 'none';

function applySiteMeta(payload) {
  var meta = getSiteMetaEntries(payload);
  if (window.GAILS && typeof window.GAILS.setRegionAssignments === 'function') {
    window.GAILS.setRegionAssignments(payload && payload.regionAssignments);
  }
  if (window.GAILS && typeof window.GAILS.setBakeryMeta === 'function') {
    window.GAILS.setBakeryMeta(meta);
  }
  // The regional coffee team is the curated list of who actually runs these
  // visits, so it feeds the @mention picker (js/mentions.js).
  if (window.GAILS && window.GAILS.Mentions) {
    window.GAILS.Mentions.addHarvested({
      regionAssignments: (payload && payload.regionAssignments) || []
    });
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

function stopDashboardDataSync() {
  if (dashboardDataUnsubscribe) {
    dashboardDataUnsubscribe();
    dashboardDataUnsubscribe = null;
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

function computeLastVisitRecords(visitsObj) {
  var lastVisit = {};
  Object.keys(visitsObj || {}).forEach(function(id) {
    var v = visitsObj[id];
    var bakery = v && v.bakery;
    var date = v && v.date;
    if (!bakery || !date) return;
    var key = (window.GAILS && typeof window.GAILS.resolveBakeryMetaKey === 'function')
      ? window.GAILS.resolveBakeryMetaKey(bakery)
      : bakery;
    if (!lastVisit[key] || date > lastVisit[key].date) {
      lastVisit[key] = Object.assign({ id: id }, v);
    }
  });
  return lastVisit;
}

function applyLastVisitDates(visitsObj) {
  if (window.GAILS) {
    if (window.GAILS.Mentions) {
      window.GAILS.Mentions.addHarvested({ visits: visitsObj || {} });
    }
    if (typeof window.GAILS.setLastVisitRecords === 'function') {
      window.GAILS.setLastVisitRecords(computeLastVisitRecords(visitsObj));
    }
    window.GAILS._allVisitsObj = visitsObj || {};
    if (typeof window.GAILS.renderVisitLog === 'function') {
      window.GAILS.renderVisitLog();
    }
    if (typeof window.GAILS.refreshMapVisitFilters === 'function') {
      window.GAILS.refreshMapVisitFilters();
    }
    // A ?visit=<id> link from the My Activity hub can only be honoured once
    // the record it names has arrived.
    if (typeof window.GAILS.openVisitFromDeepLink === 'function') {
      window.GAILS.openVisitFromDeepLink();
    }
  }
}

function applyFollowUpActions(actionsObj) {
  if (!window.GAILS) return;
  window.GAILS._followUpActionsObj = actionsObj || {};
  // Only re-render when the Follow-ups view is on screen; the visit history and
  // unvisited views don't read this node.
  if (window.GAILS._activeVisitLogView === 'followups' && typeof window.GAILS.renderVisitLog === 'function') {
    window.GAILS.renderVisitLog();
  }
}

function stopRoutineVisitsSync() {
  if (routineVisitsUnsubscribe) {
    routineVisitsUnsubscribe();
    routineVisitsUnsubscribe = null;
  }
  if (followUpActionsUnsubscribe) {
    followUpActionsUnsubscribe();
    followUpActionsUnsubscribe = null;
  }
}

function startRoutineVisitsSync() {
  stopRoutineVisitsSync();
  routineVisitsUnsubscribe = onValue(ref(db, 'routineVisits'), function(snapshot) {
    applyLastVisitDates(snapshot.exists() ? snapshot.val() : {});
  }, function(error) {
    console.error('Failed to sync routine visits for map tooltips:', error);
  });
  followUpActionsUnsubscribe = onValue(ref(db, 'followUpActions'), function(snapshot) {
    applyFollowUpActions(snapshot.exists() ? snapshot.val() : {});
  }, function(error) {
    console.error('Failed to sync follow-up actions:', error);
  });
}

// ---- Shared people directory ----
// Who can be @mentioned in a visit's Coffee Partner field. It exists because
// /users is deliberately unreadable to ordinary users (see database.rules.json)
// — a name-and-email-only node can be world-readable to signed-in staff when the
// full user record, carrying roles and ops areas, must not be.
//
// Self-maintaining: every user republishes their own entry at sign-in, so the
// directory converges without anyone curating it. Both the read and the write
// are best-effort — before the matching rules are deployed they simply fail, and
// the picker falls back to names harvested from readable data.
function publishDirectoryEntry(user, profile) {
  var email = user.email || (profile && profile.email) || '';
  var name = [profile && profile.firstName, profile && profile.lastName]
    .filter(Boolean).join(' ').trim() || user.displayName || '';
  // Until they set a name, their work address stands in for one — otherwise
  // they cannot be @mentioned and their visits cannot be credited to them.
  if (!name && window.GAILS && window.GAILS.Mentions) {
    name = window.GAILS.Mentions.nameFromEmail(email);
  }
  if (!name) return Promise.resolve();
  return set(ref(db, 'userDirectory/' + user.uid), {
    name: name,
    email: email
  }).catch(function(error) {
    console.warn('Could not publish your directory entry:', error);
  });
}

function stopUserDirectorySync() {
  if (userDirectoryUnsubscribe) {
    userDirectoryUnsubscribe();
    userDirectoryUnsubscribe = null;
  }
}

function startUserDirectorySync() {
  stopUserDirectorySync();
  userDirectoryUnsubscribe = onValue(ref(db, 'userDirectory'), function(snapshot) {
    var entries = snapshot.exists() ? snapshot.val() : {};
    if (!window.GAILS || !window.GAILS.Mentions) return;
    window.GAILS.Mentions.addPeople(Object.keys(entries).map(function(uid) {
      return {
        uid: uid,
        name: entries[uid] && entries[uid].name,
        email: entries[uid] && entries[uid].email
      };
    }));
  }, function(error) {
    console.warn('Shared people directory unavailable, falling back to names already in the data:', error);
  });
}

// The Bakery Reports visibility master switch. Live-synced so an admin toggling
// it in the portal takes effect without the ops manager reloading. Paired with
// the per-user opsArea (set at sign-in) to scope Bakery Reports client-side.
function stopReportVisibilitySync() {
  if (appSettingsUnsubscribe) {
    appSettingsUnsubscribe();
    appSettingsUnsubscribe = null;
  }
}

function startReportVisibilitySync() {
  stopReportVisibilitySync();
  appSettingsUnsubscribe = onValue(ref(db, 'appSettings/reportVisibility'), function(snapshot) {
    var val = snapshot.exists() ? snapshot.val() : null;
    window.GAILS.reportVisibilityEnabled = !!(val && val.enabled);
    if (typeof window.GAILS.renderVisitLog === 'function') window.GAILS.renderVisitLog();
  }, function(error) {
    console.error('Failed to sync report visibility setting:', error);
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

// canUpload: true for admins and roles with 'edit' on the shared dataset —
// controls whether the upload zone is revealed when no shared data exists.
async function loadSharedDashboardData(canUpload) {
  try {
    var statusEl = document.getElementById('uploadStatus');

    // Fetch lightweight metadata first to check if a download is actually needed
    var metaSnap = await get(ref(db, 'dashboardMeta'));
    if (!metaSnap.exists()) {
      if (canUpload) {
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
        if (canUpload) {
          var uploadZoneEl = document.getElementById('uploadZone');
          if (uploadZoneEl) uploadZoneEl.style.display = '';
        }
        loadingScreen.style.display = 'none';
        return;
      }
      data = dbSnap.val();
      try {
        localStorage.setItem('gails_firebase_cache_ts', meta.updatedAt);
        localStorage.setItem('gails_firebase_cache', JSON.stringify({ records: data.records || [], months: data.months || [], sourceLastUpdated: data.sourceLastUpdated || null }));
      } catch (cacheErr) {
        console.warn('Could not cache Firebase data locally:', cacheErr);
      }
    }

    if (window.GAILS && window.GAILS.state) {
      window.GAILS.state.dataLastUpdated = data.sourceLastUpdated || meta.sourceLastUpdated || null;
    }

    // Set up real-time listener so the month filter updates automatically when new data is uploaded
    stopDashboardDataSync();
    var lastSeenUpdatedAt = meta.updatedAt;
    dashboardDataUnsubscribe = onValue(ref(db, 'dashboardMeta'), function(snap) {
      if (!snap.exists()) return;
      var freshMeta = snap.val();
      if (!freshMeta.updatedAt || freshMeta.updatedAt === lastSeenUpdatedAt) return;
      lastSeenUpdatedAt = freshMeta.updatedAt;
      get(ref(db, 'dashboardData')).then(function(dbSnap) {
        if (!dbSnap.exists() || !window.GAILS_initDashboard) return;
        var freshData = dbSnap.val();
        try {
          localStorage.setItem('gails_firebase_cache_ts', freshMeta.updatedAt);
          localStorage.setItem('gails_firebase_cache', JSON.stringify({ records: freshData.records || [], months: freshData.months || [], sourceLastUpdated: freshData.sourceLastUpdated || null }));
        } catch (cacheErr) {}
        if (window.GAILS && window.GAILS.state) {
          window.GAILS.state.dataLastUpdated = freshData.sourceLastUpdated || null;
        }
        window.GAILS_initDashboard(freshData.records || [], freshData.months || []);
      });
    });

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
      let userProfile = userSnap.exists() ? userSnap.val() : null;

      let isAdmin = false;
      let isAllowed = false;
      let roleId = 'viewer';

      if (adminSnap.exists() && adminSnap.val() === true) {
        isAdmin = true;
        isAllowed = true;
        if (!userSnap.exists()) {
          userProfile = { email: user.email, role: 'admin' };
          await set(ref(db, `users/${user.uid}`), userProfile);
        }
      }
      if (userProfile !== null) {
        isAllowed = true;
        roleId = userProfile.role || 'viewer';
        if (roleId === 'admin') isAdmin = true;
      }
      if (isAdmin) roleId = 'admin';

      // Custom roles live at roles/{roleId}; a deleted/unknown role safely
      // falls back to viewer permissions inside resolveRolePermissions.
      let customRoleDef = null;
      if (isAllowed && !BUILTIN_ROLES[roleId]) {
        try {
          const roleSnap = await get(ref(db, `roles/${roleId}`));
          customRoleDef = roleSnap.exists() ? roleSnap.val() : null;
        } catch (roleErr) {
          console.warn('Could not load role definition:', roleErr);
        }
      }
      const permissions = resolveRolePermissions(roleId, customRoleDef);

      if (isAllowed) {
        if (user.email && userProfile && String(userProfile.email || '').toLowerCase() !== user.email.toLowerCase()) {
          await update(userRef, {
            email: user.email,
            updatedAt: nowIso()
          });
          userProfile = Object.assign({}, userProfile, {
            email: user.email
          });
        }
        updateProfileMenu(user, userProfile);
        showInvitationNotice(user, userProfile, roleId, customRoleDef);
        const action = _freshLogin ? 'login' : 'session_resume';
        _freshLogin = false;
        if (shouldLogActivity(user.uid, action)) {
          try {
            await push(ref(db, 'activityLog'), {
              email: user.email || user.uid,
              uid: user.uid,
              role: roleId,
              action: action,
              timestamp: nowIso()
            });
            markActivityLogged(user.uid);
          } catch (logErr) {
            console.warn('Could not write login activity log:', logErr);
          }
        }
        // Scopes Bakery Reports client-side: the user's assigned ops area, and
        // the master switch (live-synced), are read by js/visit-report.js.
        window.GAILS.userOpsArea = (userProfile && userProfile.opsArea) || '';
        applyMyActivityAccess(userProfile);
        applyMyTeamAccess(permissions);
        showApp(isAdmin, permissions);
        applyDashboardTabPermissions(permissions);
        startSiteMetaSync();
        startRoutineVisitsSync();
        startReportVisibilitySync();
        startUserDirectorySync();
        publishDirectoryEntry(user, userProfile);
        await loadSharedDashboardData(isAdmin || permissions.admin.dataset === 'edit');
      } else {
        loginError.textContent = "You don't have access to this dashboard. Contact your administrator.";
        loginError.style.display = 'block';
        stopSiteMetaSync();
        stopRoutineVisitsSync();
        stopReportVisibilitySync();
        stopUserDirectorySync();
        await signOut(auth);
        showApp(undefined);
      }
    } catch (e) {
      console.error("DB error", e);
      loginError.textContent = "Database connection error or permission denied. Check configuration and rules.";
      loginError.style.display = 'block';
      stopSiteMetaSync();
      stopRoutineVisitsSync();
      stopReportVisibilitySync();
      stopUserDirectorySync();
      await signOut(auth);
      showApp(undefined);
    }
  } else {
    stopSiteMetaSync();
    stopDashboardDataSync();
    stopRoutineVisitsSync();
    stopReportVisibilitySync();
    stopUserDirectorySync();
    window.GAILS.userOpsArea = '';
    applyMyActivityAccess(null);
    applyMyTeamAccess(null);
    applySiteMeta(null);
    clearLoginForm();
    updateProfileMenu(null);
    pendingInvitationUserRef = null;
    invitationNotice.hidden = true;
    showApp(undefined);
  }
});

// My Activity is opt-in per user (users/{uid}.myActivity, granted in the admin
// portal), so the profile-menu entry is hidden unless it has been turned on.
// Absent means off — the hub is invisible until someone grants it.
function applyMyActivityAccess(userProfile) {
  var link = document.querySelector('.header [data-my-activity-link]');
  if (link) link.hidden = !(userProfile && userProfile.myActivity === true);
}

// My Team comes from the *role* rather than a per-user switch: a manager needs
// it because of the job they do, not because someone remembered to tick a box.
// The page checks the same thing on load, and the database rules refuse the
// roster read — this only decides whether the menu entry appears.
function applyMyTeamAccess(permissions) {
  var link = document.querySelector('.header [data-my-team-link]');
  if (link) link.hidden = !canSeeTeam(permissions);
}

// Hides dashboard tab buttons (desktop nav + mobile bottom nav) that the
// signed-in user's role can't see, and moves off a hidden active tab.
function applyDashboardTabPermissions(permissions) {
  const perms = normalizePermissions(permissions);
  const tabButtons = Array.from(document.querySelectorAll('.tab[data-tab]'));
  tabButtons.forEach(function(btn) {
    const key = btn.dataset.tab;
    const allowed = perms.tabs[key] !== false;
    btn.style.display = allowed ? '' : 'none';
  });
  const activeHidden = tabButtons.some(function(btn) {
    return btn.classList.contains('active') && btn.style.display === 'none';
  });
  if (activeHidden) {
    const firstVisible = tabButtons.find(function(btn) { return btn.style.display !== 'none'; });
    if (firstVisible) firstVisible.click();
  }

  // Dashboard actions: roles without logVisits see the Bakery Reports tab
  // read-only — the "+ Log Visit" entry points are removed.
  const addVisitBtn = document.getElementById('visitLogAddBtn');
  if (addVisitBtn) addVisitBtn.style.display = perms.actions.logVisits ? '' : 'none';
}

function showApp(isAdmin, permissions) {
  if (window.GAILS) {
    window.GAILS.isAdmin = !!isAdmin;
    window.GAILS.permissions = normalizePermissions(permissions);
    window.GAILS.can = function(areaKey, level) {
      const current = window.GAILS.permissions.admin[areaKey];
      if (level === 'edit') return current === 'edit';
      return current === 'view' || current === 'edit';
    };
  }
  if (isAdmin !== undefined) {
    // Keep the loading screen visible — loadSharedDashboardData will dismiss it
    // once Firebase data has finished loading.
    loginScreen.style.display = 'none';
    headerEl.style.display = 'flex';
    containerEl.style.display = 'block';

    const uploader = document.getElementById('uploadZone');
    if (adminBtn) adminBtn.style.display = (isAdmin || hasAdminPanelAccess(permissions)) ? 'inline-block' : 'none';

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

if (profileMenuBtn && profileMenuPopover) {
  profileMenuBtn.addEventListener('click', function(event) {
    event.stopPropagation();
    setProfileMenuOpen(profileMenuPopover.hidden);
  });

  profileMenuPopover.addEventListener('click', function(event) {
    event.stopPropagation();
  });

  document.addEventListener('click', function(event) {
    if (profileMenu && !profileMenu.contains(event.target)) setProfileMenuOpen(false);
  });

  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && !profileMenuPopover.hidden) {
      setProfileMenuOpen(false);
      profileMenuBtn.focus();
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    setProfileMenuOpen(false);
    clearLoginForm();
    await signOut(auth);
  });
}
