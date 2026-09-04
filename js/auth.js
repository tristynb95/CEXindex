import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, set, update, remove, push, onValue } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES, normalizePermissions, resolveRolePermissions, hasAdminPanelAccess, canSeeTeam } from './permissions.js';
import { createProfileMenu } from './profile-menu.js';
import { recordNotification, followUpTargets } from './notification-write.js';
import { mountNotificationCentre } from './notification-centre.js';
import { trackSessionRevocation } from './session-guard.js';
import { trackIdleTimeout } from './idle-timeout.js';
import { consumeSignOutNotice } from './sign-out-notice.js';
import { subscribeVisits, fetchVisit } from './visit-feed.js';
import { readDatasetCache, writeDatasetCache, clearDatasetCache } from './dataset-cache.js';

function nowIso() {
  return new Date().toISOString();
}

function notifyMutation(message, options) {
  if (options && options.silent) return;
  if (window.GAILS && typeof window.GAILS.notifySuccess === 'function') {
    window.GAILS.notifySuccess(message);
  }
}

function getSiteMetaEntries(payload) {
  if (!payload) return null;
  if (payload.entries && typeof payload.entries === 'object') return payload.entries;
  return payload;
}

// `cover` is present only on a region whose Coffee Partner or Coffee Trainer
// patch is currently split between colleagues covering individual ops areas —
// what happens when one of them leaves. Cover rows carry the bakeries their ops
// area held when they were saved, which is what follows them across a rename
// (see js/region-assignments.js). An area nobody covers is not stored at all.
function cloneRegionCover(cover) {
  var source = cover && typeof cover === 'object' ? cover : {};
  var text = function(value) {
    return String(value == null ? '' : value).trim();
  };
  var areas = (Array.isArray(source.areas) ? source.areas : []).map(function(entry) {
    var area = entry && typeof entry === 'object' ? entry : {};
    return {
      opsArea: text(area.opsArea),
      coffeePartner: text(area.coffeePartner),
      coffeePartnerUid: text(area.coffeePartnerUid),
      coffeeTrainer: text(area.coffeeTrainer),
      coffeeTrainerUid: text(area.coffeeTrainerUid),
      bakeries: (Array.isArray(area.bakeries) ? area.bakeries : []).map(text).filter(Boolean)
    };
  }).filter(function(area) {
    return !!area.opsArea && !!(area.coffeePartner || area.coffeePartnerUid ||
      area.coffeeTrainer || area.coffeeTrainerUid);
  });
  var enabled = source.enabled === true || source.enabled === 'true';
  return enabled || areas.length ? { enabled: enabled, areas: areas } : null;
}

// The uid travels with the readable name so a later rename in the directory
// still resolves to the same person — dropping it here would silently undo
// what the admin picked from the people list.
function cloneRegionAssignments(assignments) {
  var records = Array.isArray(assignments)
    ? assignments
    : Object.values(assignments && typeof assignments === 'object' ? assignments : {});
  return records.map(function(record) {
    var cloned = {
      region: String(record && record.region || '').trim(),
      coffeePartner: String(record && record.coffeePartner || '').trim(),
      coffeePartnerUid: String(record && record.coffeePartnerUid || '').trim(),
      coffeeTrainer: String(record && record.coffeeTrainer || '').trim(),
      coffeeTrainerUid: String(record && record.coffeeTrainerUid || '').trim()
    };
    var cover = cloneRegionCover(record && record.cover);
    if (cover) cloned.cover = cover;
    return cloned;
  }).filter(function(record) {
    return !!record.region;
  });
}

// Area Head Baristas are held per ops area rather than per region, and an ops
// area can have more than one. Each entry pairs the person with their home
// bakery — the bakery they work out of — which is what lets the app follow them
// when areas are renamed, split or merged (see js/ops-area-assignments.js).
// `bakeries` is the membership the area had when it was saved, used as the
// fallback for anyone with no home bakery recorded yet.
function cloneOpsAreaAssignments(assignments) {
  var records = Array.isArray(assignments)
    ? assignments
    : Object.values(assignments && typeof assignments === 'object' ? assignments : {});
  var text = function(value) {
    return String(value == null ? '' : value).trim();
  };
  return records.map(function(record) {
    var source = record && typeof record === 'object' ? record : {};
    var baristas = Array.isArray(source.baristas) ? source.baristas : [];

    // A record written before an ops area could hold more than one reads as a
    // single entry, so an older saved directory keeps working untouched.
    if (!baristas.length && (source.areaHeadBarista || source.homeBakery)) {
      baristas = [{
        name: source.areaHeadBarista,
        uid: source.areaHeadBaristaUid,
        homeBakery: source.homeBakery
      }];
    }

    return {
      region: text(source.region),
      opsArea: text(source.opsArea),
      baristas: baristas.map(function(entry) {
        var value = entry && typeof entry === 'object' ? entry : {};
        return {
          name: text(value.name),
          uid: text(value.uid),
          homeBakery: text(value.homeBakery)
        };
        // A row the admin added but never filled in is not worth storing.
      }).filter(function(entry) {
        return !!(entry.name || entry.homeBakery);
      }),
      bakeries: (Array.isArray(source.bakeries) ? source.bakeries : [])
        .map(text).filter(Boolean)
    };
  }).filter(function(record) {
    return !!record.opsArea;
  });
}

function buildSiteMetaPayload(meta, sourceInfo, regionAssignments, opsAreaAssignments) {
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
    opsAreaAssignments: cloneOpsAreaAssignments(opsAreaAssignments),
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
      writeDatasetCache(ts, {
        records: records,
        months: months,
        sourceLastUpdated: sourceLastUpdated || null
      });
      // A new workbook moves every bakery's numbers, so everybody hears about
      // it — see the estateWide flag in js/notifications.js.
      recordNotification('data.updated', {
        subject: 'the shared dataset',
        detail: records.length + ' rows' + (sourceName ? ' from ' + sourceName : '')
      });
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
    await clearDatasetCache();
  },
  // A caller that does not pass the people assignments is only replacing the
  // site mapping, so the saved Coffee Team and Area Head Barista details are
  // read back first rather than being blanked by the write.
  saveSiteMeta: async function(meta, sourceInfo, regionAssignments, opsAreaAssignments) {
    if (!auth.currentUser) return;
    var assignments = regionAssignments;
    var opsAssignments = opsAreaAssignments;
    if (typeof assignments === 'undefined' || typeof opsAssignments === 'undefined') {
      var existingSnapshot = await get(ref(db, 'portalData/siteMeta'));
      var existingPayload = existingSnapshot.exists() ? existingSnapshot.val() : null;
      if (typeof assignments === 'undefined') {
        assignments = existingPayload && existingPayload.regionAssignments;
      }
      if (typeof opsAssignments === 'undefined') {
        opsAssignments = existingPayload && existingPayload.opsAreaAssignments;
      }
    }
    var payload = buildSiteMetaPayload(meta, sourceInfo, assignments, opsAssignments);
    await set(ref(db, 'portalData/siteMeta'), payload);
    recordNotification('data.updated', {
      subject: 'the site directory',
      detail: payload.siteCount ? payload.siteCount + ' sites' : ''
    });
    return payload;
  },
  saveSiteVisit: async function(visitRecord, options) {
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
    // Colleagues hear about a report the moment it lands, so the bakery's own
    // people are not the last to know what was found there.
    recordNotification('report.created', {
      bakery: payload.bakery,
      subject: payload.visitKind && payload.visitKind !== 'checkin' ? 'NBO opening visit' : 'Check-in',
      entityId: newVisitRef.key
    });
    notifyMutation(
      payload.visitKind && payload.visitKind !== 'checkin' ? 'NBO opening visit saved' : 'Check-in saved',
      options
    );
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
  saveFollowUpAction: async function(task, options) {
    if (!auth.currentUser) throw new Error('You must be signed in to add a follow-up.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow adding follow-ups.');
    }
    var who = auth.currentUser.email || auth.currentUser.uid;
    var whoUid = auth.currentUser.uid;
    var whoName = window.GAILS.currentPerson && window.GAILS.currentPerson.name
      ? window.GAILS.currentPerson.name
      : (auth.currentUser.displayName || '');
    var defaultAssignee = whoName ? [{
      uid: whoUid,
      name: whoName,
      email: auth.currentUser.email || ''
    }] : null;
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
      // Every new action starts with its creator as the responsible person.
      // Callers can replace this list (for example, a follow-up raised during
      // an attributed visit) or explicitly clear it with null.
      assignedTo: defaultAssignee,
      completedAt: null,
      completedBy: null
    }, task, {
      createdAt: nowIsoStr,
      createdBy: who,
      createdByUid: whoUid,
      createdByName: whoName,
      meta: { updatedAt: nowIsoStr, updatedBy: who }
    });
    await set(newRef, payload);
    // Only the people it lands on are told, and never the person raising it —
    // a task you gave yourself is not news. buildEvent drops the actor, so a
    // self-assigned task simply notifies nobody.
    recordNotification('task.assigned', {
      bakery: payload.bakery,
      subject: payload.title,
      entityId: newRef.key,
      targetUids: followUpTargets(payload)
    });
    notifyMutation('Task created', options);
    return newRef.key;
  },
  completeFollowUpAction: async function(taskId, done, options) {
    if (!auth.currentUser) throw new Error('You must be signed in to update a follow-up.');
    var perms = window.GAILS && window.GAILS.permissions;
    if (perms && perms.actions && perms.actions.logVisits === false) {
      throw new Error('Your role does not allow updating follow-ups.');
    }
    var who = auth.currentUser.email || auth.currentUser.uid;
    var whoUid = auth.currentUser.uid;
    var whoName = auth.currentUser.displayName || '';
    var nowIsoStr = nowIso();
    // Read before writing: signing a task off has to tell both the people it
    // was assigned to and the person who raised it, and only the stored record
    // knows who they are.
    var existing = null;
    if (done) {
      try {
        var taskSnapshot = await get(ref(db, 'followUpActions/' + taskId));
        existing = taskSnapshot.exists() ? taskSnapshot.val() : null;
      } catch (error) {
        console.warn('Could not read the task before signing it off:', error);
      }
    }
    await update(ref(db, 'followUpActions/' + taskId), {
      status: done ? 'done' : 'open',
      completedAt: done ? nowIsoStr : null,
      completedBy: done ? who : null,
      completedByUid: done ? whoUid : null,
      completedByName: done ? whoName : null,
      'meta/updatedAt': nowIsoStr,
      'meta/updatedBy': who
    });
    // Reopening is a correction rather than news, so only a sign-off is
    // announced — to the assignees and to whoever raised it.
    if (done && existing) {
      recordNotification('task.completed', {
        bakery: existing.bakery,
        subject: existing.title,
        entityId: taskId,
        targetUids: followUpTargets(existing)
      });
    }
    notifyMutation(done ? 'Task signed off' : 'Task reopened', options);
  },
  updateFollowUpAction: async function(taskId, patch, options) {
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
    notifyMutation('Task updated', options);
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
const adminPortalLink = document.querySelector('.header [data-admin-portal-link]');
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

// Notifications live inside that menu — see js/notification-centre.js, which
// subscribes to the feed itself and is told who is signed in once the profile
// resolves. Mounting can only fail if the header markup is missing, so the null
// guard keeps every call site free of one.
const notificationCentre = mountNotificationCentre({
  root: document.querySelector('.header [data-notification-centre]'),
  trigger: document.querySelector('.header [data-notification-trigger]'),
  count: document.querySelector('.header [data-notification-count]'),
  dot: document.querySelector('.header [data-notification-dot]'),
  // The panel takes the menu's place, and Back brings the menu back.
  onOpen: function() { profileMenuUi.setOpen(false); },
  onBack: function() { profileMenuUi.setOpen(true); }
}) || { update: function() {}, setOpen: function() {} };

function setProfileMenuOpen(open) {
  profileMenuUi.setOpen(open);
  // One surface at a time: opening the menu closes the panel it replaced.
  if (open) notificationCentre.setOpen(false);
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
  if (window.GAILS && typeof window.GAILS.setOpsAreaAssignments === 'function') {
    window.GAILS.setOpsAreaAssignments(payload && payload.opsAreaAssignments);
  }
  if (window.GAILS && typeof window.GAILS.setBakeryMeta === 'function') {
    window.GAILS.setBakeryMeta(meta);
  }
  // The regional coffee team and the area head baristas are the curated list of
  // who actually runs these visits, so they feed the @mention picker
  // (js/mentions.js).
  if (window.GAILS && window.GAILS.Mentions) {
    window.GAILS.Mentions.addHarvested({
      regionAssignments: (payload && payload.regionAssignments) || [],
      opsAreaAssignments: (payload && payload.opsAreaAssignments) || []
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
  // A rolling window rather than the whole node — see js/visit-feed.js for why,
  // and for what "All Time" does about the rest.
  var feed = subscribeVisits({
    onData: applyLastVisitDates,
    onError: function(error) {
      console.error('Failed to sync routine visits for map tooltips:', error);
    }
  });
  routineVisitsUnsubscribe = feed.stop;
  // Bakery Reports offers an All Time period. Selecting it is the only thing
  // that needs history older than the window, so it pays for it at that point
  // and only once — see js/visit-report.js.
  window.GAILS.loadAllTimeVisits = feed.expandToAllTime;
  window.GAILS.hasAllTimeVisits = feed.isAllTime;
  // A link can name a visit older than the window, so opening one falls back to
  // fetching just that record rather than giving up.
  window.GAILS.fetchVisitById = fetchVisit;
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
// are best-effort — a refused read or write simply fails, and the picker falls
// back to names harvested from readable data.
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
async function loadSharedDashboardData(canUpload, metaPromise) {
  try {
    var statusEl = document.getElementById('uploadStatus');

    // Lightweight metadata, which decides whether the full dataset needs
    // downloading at all. The caller starts this read alongside the profile
    // reads rather than after them — it depends on nothing they produce, and
    // awaiting it in sequence put an avoidable round trip in front of every
    // load. Falls back to fetching it here if no in-flight read was handed in.
    // A handed-in read that failed resolves null rather than rejecting, so the
    // retry here is what turns a transient blip into a second attempt instead
    // of an empty dashboard.
    var metaSnap = (metaPromise ? await metaPromise : null) || await get(ref(db, 'dashboardMeta'));
    if (!metaSnap.exists()) {
      if (canUpload) {
        var uploadZone = document.getElementById('uploadZone');
        if (uploadZone) uploadZone.style.display = '';
      }
      loadingScreen.style.display = 'none';
      return;
    }

    var meta = metaSnap.val();
    var data = null;

    // Use the local cache if it matches the server's timestamp. Held in
    // IndexedDB (js/dataset-cache.js) rather than localStorage, so a growing
    // estate cannot quietly push it past a 5MB quota and turn every load into
    // a full download.
    var cached = await readDatasetCache();
    if (cached && cached.ts === meta.updatedAt) data = cached;

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
      writeDatasetCache(meta.updatedAt, data);
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
        writeDatasetCache(freshMeta.updatedAt, freshData);
        if (window.GAILS && window.GAILS.state) {
          window.GAILS.state.dataLastUpdated = freshData.sourceLastUpdated || null;
        }
        window.GAILS_initDashboard(freshData.records || [], freshData.months || []);
      });
    });

    // js/app.js is a deferred classic script and this is a module, so it has
    // always finished — and published GAILS_initDashboard — long before an auth
    // state change resolves. This used to poll for it on a 100ms interval,
    // which never fires immediately: every single load paid a tenth of a second
    // waiting for a function that was already there. The `load` fallback keeps
    // it honest if that ordering ever changes, without taxing the normal path.
    var runInit = function() {
      window.GAILS_initDashboard(data.records || [], data.months || []);
      loadingScreen.style.display = 'none';
      if (statusEl) {
        statusEl.textContent = 'Loaded data securely from Firebase Database';
        statusEl.className = 'status success';
      }
    };
    if (window.GAILS_initDashboard) runInit();
    else window.addEventListener('load', function() {
      if (window.GAILS_initDashboard) runInit();
      else console.error('Dashboard init never loaded; the dataset could not be rendered.');
    }, { once: true });
  } catch (e) {
    console.error("Failed to load Firebase data:", e);
    loadingScreen.style.display = 'none';
  }
}

// Puts the dashboard back to a clean Overview with the last session's filters
// cleared (js/app.js resetDashboardSession). Signing out never reloads the
// page, so without this the login form goes up over the previous session's
// view and signing back in resumes it. Housekeeping behind the form, so a
// failure here is logged rather than allowed to surface as a sign-in error.
function resetDashboardForNewSession() {
  try {
    if (window.GAILS && window.GAILS.resetDashboardSession) window.GAILS.resetDashboardSession();
  } catch (resetErr) {
    console.warn('Could not reset the dashboard between sessions:', resetErr);
  }
}

onAuthStateChanged(auth, async (user) => {
  trackSessionRevocation(auth, db, user);
  trackIdleTimeout(auth, user);
  if (user) {
    const adminRef = ref(db, `admins/${user.uid}`);
    const userRef = ref(db, `users/${user.uid}`);
    // Started here, before the profile is even resolved, because the dataset
    // metadata is readable by anyone signed in and depends on nothing below.
    // Handed to loadSharedDashboardData at the bottom, by which time it has
    // usually already landed. The catch keeps a rejection from going unhandled
    // if this turns out to be someone who gets signed straight back out.
    const dashboardMetaPromise = get(ref(db, 'dashboardMeta')).catch(function() { return null; });
    try {
      // Neither read depends on the other, and nothing on the page renders
      // until both have landed — awaiting them one after the other spent two
      // round trips where one would do, at the very front of every visit.
      const [adminSnap, userSnap] = await Promise.all([get(adminRef), get(userRef)]);
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
          // Repairing a stale stored address is housekeeping: everything below
          // reads the corrected `userProfile` built here, not the written row,
          // so awaiting the write only put a round trip in front of the
          // dashboard on the rare load that needs it. Same reasoning as the
          // activity-log write further down.
          update(userRef, {
            email: user.email,
            updatedAt: nowIso()
          }).catch(function(emailErr) {
            console.warn('Could not sync your stored email address:', emailErr);
          });
          userProfile = Object.assign({}, userProfile, {
            email: user.email
          });
        }
        updateProfileMenu(user, userProfile);
        showInvitationNotice(user, userProfile, roleId, customRoleDef);
        var currentPersonName = [
          userProfile && userProfile.firstName,
          userProfile && userProfile.lastName
        ].filter(Boolean).join(' ').trim() || user.displayName || '';
        if (!currentPersonName && window.GAILS && window.GAILS.Mentions) {
          currentPersonName = window.GAILS.Mentions.nameFromEmail(user.email);
        }
        window.GAILS.currentPerson = {
          uid: user.uid,
          name: currentPersonName,
          email: user.email || (userProfile && userProfile.email) || ''
        };
        if (currentPersonName && window.GAILS.Mentions) {
          window.GAILS.Mentions.addPeople([window.GAILS.currentPerson]);
        }
        const action = _freshLogin ? 'login' : 'session_resume';
        _freshLogin = false;
        // Recorded, not waited on. Nothing below reads this row, and a failed
        // write was already only a console warning — so awaiting it only put a
        // write round trip in front of the dashboard load on every single
        // visit. The cooldown marker is still set on success alone, exactly as
        // it was.
        if (shouldLogActivity(user.uid, action)) {
          push(ref(db, 'activityLog'), {
            email: user.email || user.uid,
            uid: user.uid,
            role: roleId,
            action: action,
            timestamp: nowIso()
          }).then(function () {
            markActivityLogged(user.uid);
          }).catch(function (logErr) {
            console.warn('Could not write login activity log:', logErr);
          });
        }
        // Scopes Bakery Reports client-side: the user's assigned ops area, and
        // the master switch (live-synced), are read by js/visit-report.js.
        window.GAILS.userOpsArea = (userProfile && userProfile.opsArea) || '';
        window.GAILS.userPatch = (userProfile && userProfile.patch) || null;
        notificationCentre.update(user, userProfile, permissions);
        applyMyActivityAccess(userProfile);
        applyMyTeamAccess(permissions);
        showApp(isAdmin, permissions);
        applyDashboardTabPermissions(permissions);
        startSiteMetaSync();
        startRoutineVisitsSync();
        startReportVisibilitySync();
        startUserDirectorySync();
        publishDirectoryEntry(user, userProfile);
        await loadSharedDashboardData(
          isAdmin || permissions.admin.dataset === 'edit',
          dashboardMetaPromise
        );
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
    // Nothing of the session that just ended is left on the dashboard behind
    // the login screen — an open full-bleed modal included, since those pin
    // <body> and would strand the form. Done first, while the dashboard still
    // has the data its panels render from.
    resetDashboardForNewSession();
    stopSiteMetaSync();
    stopDashboardDataSync();
    stopRoutineVisitsSync();
    stopReportVisibilitySync();
    stopUserDirectorySync();
    window.GAILS.userOpsArea = '';
    window.GAILS.userPatch = null;
    window.GAILS.currentPerson = null;
    notificationCentre.update(null);
    applyMyActivityAccess(null);
    applyMyTeamAccess(null);
    applySiteMeta(null);
    clearLoginForm();
    // Anybody signed out automatically — by an administrator, or by the idle
    // timeout — lands back here with no idea why, so say which it was.
    // clearLoginForm has just blanked the same element.
    var signOutNotice = consumeSignOutNotice();
    if (signOutNotice && loginError) {
      loginError.textContent = signOutNotice;
      loginError.style.display = 'block';
    }
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
  // A role that can't see any view in a sidebar group would otherwise be left
  // with the group heading sitting above nothing.
  document.querySelectorAll('[data-nav-group]').forEach(function(group) {
    const groupTabs = Array.from(group.querySelectorAll('.tab[data-tab]'));
    const anyVisible = groupTabs.some(function(btn) { return btn.style.display !== 'none'; });
    group.style.display = anyVisible ? '' : 'none';
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
    if (adminPortalLink) adminPortalLink.hidden = !(isAdmin || hasAdminPanelAccess(permissions));

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
    // Again here, and before the sign-in rather than after: a session can end
    // on another page (My Activity and My Team both sign out back to here), so
    // the dashboard never saw it, and Bakery Reports warms itself off the
    // stored filters as soon as this session's data starts loading.
    resetDashboardForNewSession();
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
