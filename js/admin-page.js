import { firebaseConfig, db, storage, auth as primaryAuth } from './firebase-config.js';
import { ref, set, update, push, remove, onValue, get, query, limitToLast, orderByKey } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  ACCESS_GROUPS, accessRowsForGroup, readAccessGrid, permissionsFromAccessGrid,
  TEAM_SCOPES, normalizeTeamScope, teamScopeLabel, describeVisibility, describeEditing,
  DASHBOARD_TABS, ADMIN_AREAS, BUILTIN_ROLES, normalizePermissions, resolveRolePermissions,
  hasAdminPanelAccess, canViewArea, canEditArea, canSeeTeam
} from './permissions.js';
import { createProfileMenu } from './profile-menu.js';

const secondaryApp = initializeApp(firebaseConfig, 'AdminPage');
const secondaryAuth = getAuth(secondaryApp);

// ── DOM refs ──
const authGuard       = document.getElementById('authGuard');
const adminPage       = document.getElementById('adminPage');
const signOutBtn      = document.getElementById('adminPageSignOut');
const workspaceShell  = document.getElementById('adminWorkspaceShell');
const sidebarToggleBtn = document.getElementById('adminSidebarToggle');
const sidebarToggleLabel = document.querySelector('[data-admin-sidebar-toggle-label]');
const nav             = document.getElementById('adminPortalNav');
const panels          = Array.from(document.querySelectorAll('[data-admin-panel-content]'));
const summaryCards    = document.getElementById('adminSummaryCards');
const overviewGrid    = document.getElementById('adminOverviewGrid');
const heroSummary     = document.getElementById('adminHeroSummary');
const heroMeta        = document.getElementById('adminHeroMeta');
const userList        = document.getElementById('adminUserList');
const createUserForm  = document.getElementById('createUserForm');
const inviteUserBtn   = document.getElementById('inviteUserBtn');
const inviteUserModal = document.getElementById('inviteUserModal');
const inviteUserClose = document.getElementById('inviteUserClose');
const inviteUserCancel = document.getElementById('inviteUserCancel');
const inviteSubmitBtn = document.getElementById('inviteSubmitBtn');
const inviteSummary   = document.getElementById('inviteSummary');
const inviteMsg       = document.getElementById('inviteMsg');
const newFirstNameInput = document.getElementById('newFirstNameInput');
const newLastNameInput = document.getElementById('newLastNameInput');
const newEmailInput   = document.getElementById('newEmailInput');
const roleSelect      = document.getElementById('newRoleSelect');
const newManagerSelect = document.getElementById('newManagerSelect');
const newOpsSelect    = document.getElementById('newOpsSelect');
const createMsg       = document.getElementById('createMsg');
const usersMsg        = document.getElementById('usersMsg');

// Person access modal — one person's whole access picture in one dialog.
const userAccessModal   = document.getElementById('userAccessModal');
const userAccessClose   = document.getElementById('userAccessClose');
const userAccessCancel  = document.getElementById('userAccessCancel');
const userAccessSave    = document.getElementById('userAccessSave');
const userAccessRemove  = document.getElementById('userAccessRemove');
const userAccessResetPw = document.getElementById('userAccessResetPassword');
const userAccessTitle   = document.getElementById('userAccessTitle');
const userAccessEmail   = document.getElementById('userAccessEmail');
const userAccessFirstName = document.getElementById('userAccessFirstName');
const userAccessLastName = document.getElementById('userAccessLastName');
const userAccessRole    = document.getElementById('userAccessRole');
const userAccessManager = document.getElementById('userAccessManager');
const userAccessOps     = document.getElementById('userAccessOps');
const userAccessMyActivity = document.getElementById('userAccessMyActivity');
const userAccessSee     = document.getElementById('userAccessSee');
const userAccessEdit    = document.getElementById('userAccessEdit');
const userAccessTeam    = document.getElementById('userAccessTeam');
const userAccessSelfNote = document.getElementById('userAccessSelfNote');
const userAccessStatusNote = document.getElementById('userAccessStatusNote');
const userAccessMsg     = document.getElementById('userAccessMsg');
const reportVisibilityToggle = document.getElementById('reportVisibilityToggle');
const reportVisibilityState  = document.getElementById('reportVisibilityState');
const reportVisibilityMsg    = document.getElementById('reportVisibilityMsg');
const profileMenu     = document.querySelector('[data-profile-menu]');
const profileMenuBtn  = document.getElementById('adminProfileMenuBtn');
const profileMenuPopover = document.getElementById('adminProfileMenuPopover');
const profileMenuAvatar = document.getElementById('adminProfileMenuAvatar');
const profileMenuName = document.getElementById('adminProfileMenuName');
const profileMenuEmail = document.getElementById('adminProfileMenuEmail');
const siteImportZone  = document.getElementById('siteImportZone');
const siteImportInput = document.getElementById('siteImportInput');
const siteImportBrowseBtn = document.getElementById('siteImportBrowseBtn');
const siteImportEmptyState = document.getElementById('siteImportEmptyState');
const siteImportLoadedState = document.getElementById('siteImportLoadedState');
const siteImportLoadedTitle = document.getElementById('siteImportLoadedTitle');
const siteImportLoadedStats = document.getElementById('siteImportLoadedStats');
const siteImportLoadedHint = document.getElementById('siteImportLoadedHint');
const siteSearchInput = document.getElementById('siteSearchInput');
const siteForm        = document.getElementById('siteForm');
const siteNameInput   = document.getElementById('siteNameInput');
const siteRegionInput = document.getElementById('siteRegionInput');
const siteOpsInput    = document.getElementById('siteOpsInput');
const siteList        = document.getElementById('siteMetaList');
const siteMsg         = document.getElementById('siteMsg');
const siteTableMeta   = document.getElementById('siteTableMeta');
const saveSitesBtn    = document.getElementById('saveSitesBtn');
const resetSitesBtn   = document.getElementById('resetSitesBtn');
const regionList      = document.getElementById('adminRegionList');
const managerList     = document.getElementById('adminManagerList');
const regionAssignmentList = document.getElementById('regionAssignmentList');
const regionAssignmentMeta = document.getElementById('regionAssignmentMeta');
const regionAssignmentPeople = document.getElementById('regionAssignmentPeople');
const opsAreaAssignmentList = document.getElementById('opsAreaAssignmentList');
const opsAreaAssignmentMeta = document.getElementById('opsAreaAssignmentMeta');
const opsAreaAssignmentBakeries = document.getElementById('opsAreaAssignmentBakeries');
const dataGrid        = document.getElementById('adminDataGrid');
const dataMsg         = document.getElementById('dataMsg');
const datasetImportZone = document.getElementById('datasetImportZone');
const datasetImportInput = document.getElementById('datasetImportInput');
const datasetImportBrowseBtn = document.getElementById('datasetImportBrowseBtn');
const datasetImportEmptyState = document.getElementById('datasetImportEmptyState');
const datasetImportLoadedState = document.getElementById('datasetImportLoadedState');
const datasetImportLoadedTitle = document.getElementById('datasetImportLoadedTitle');
const datasetImportLoadedStats = document.getElementById('datasetImportLoadedStats');
const datasetImportLoadedHint = document.getElementById('datasetImportLoadedHint');
const portalUploadBtn = document.getElementById('portalUploadBtn');
const clearDatasetBtn = document.getElementById('clearDatasetBtn');
const restoreMetaBtn  = document.getElementById('restoreMetadataBtn');
const compactSidebarMedia = window.matchMedia('(max-width: 980px)');
const activityLogList     = document.getElementById('activityLogList');
const visitSearchInput    = document.getElementById('visitSearchInput');
const visitTableMeta      = document.getElementById('visitTableMeta');
const visitMsg            = document.getElementById('visitMsg');
const visitList           = document.getElementById('visitList');
const visitDetailModal    = document.getElementById('visitDetailModal');
const visitDetailClose    = document.getElementById('visitDetailClose');
const visitDetailBody     = document.getElementById('visitDetailBody');

const deleteConfirmModal      = document.getElementById('deleteConfirmModal');
const deleteConfirmClose      = document.getElementById('deleteConfirmClose');
const deleteConfirmCancel     = document.getElementById('deleteConfirmCancel');
const deleteConfirmInput      = document.getElementById('deleteConfirmInput');
const deleteConfirmSubmitBtn  = document.getElementById('deleteConfirmSubmitBtn');
const deleteConfirmPromptText = document.getElementById('deleteConfirmPromptText');

const roleForm            = document.getElementById('roleForm');
const roleEditorModal     = document.getElementById('roleEditorModal');
const roleEditorClose     = document.getElementById('roleEditorClose');
const roleEditorCancel    = document.getElementById('roleEditorCancel');
const roleEditorDelete    = document.getElementById('roleEditorDelete');
const roleEditorTitle     = document.getElementById('roleEditorTitle');
const roleEditorHint      = document.getElementById('roleEditorHint');
const roleEditorMsg       = document.getElementById('roleEditorMsg');
const roleNameInput       = document.getElementById('roleNameInput');
const roleDescInput       = document.getElementById('roleDescInput');
const roleAccessGrid      = document.getElementById('roleAccessGrid');
const roleTeamScope       = document.getElementById('roleTeamScope');
const roleSubmitBtn       = document.getElementById('roleSubmitBtn');
const newRoleBtn          = document.getElementById('newRoleBtn');
const roleMsg             = document.getElementById('roleMsg');
const roleList            = document.getElementById('adminRoleList');

const cqvImportZone       = document.getElementById('cqvImportZone');
const cqvImportBrowseBtn  = document.getElementById('cqvImportBrowseBtn');
const cqvImportInput      = document.getElementById('cqvImportInput');
const cqvImportMsg        = document.getElementById('cqvImportMsg');
const cqvBackfillAuditorsBtn = document.getElementById('cqvBackfillAuditorsBtn');
const cqvConfirmModal     = document.getElementById('cqvConfirmModal');
const cqvConfirmClose     = document.getElementById('cqvConfirmClose');
const cqvConfirmCancel    = document.getElementById('cqvConfirmCancel');
const cqvConfirmSubmitBtn = document.getElementById('cqvConfirmSubmitBtn');
const cqvConfirmTitle     = document.getElementById('cqvConfirmTitle');
const cqvConfirmBakery    = document.getElementById('cqvConfirmBakery');
const cqvConfirmDate      = document.getElementById('cqvConfirmDate');
const cqvConfirmCoffeePartner = document.getElementById('cqvConfirmCoffeePartner');
const cqvConfirmWarning   = document.getElementById('cqvConfirmWarning');
const cqvConfirmSummary   = document.getElementById('cqvConfirmSummary');

// ── Routine visit schema ──
// Sourced from js/visit-schema.js (shared with index.html's js/visit-report.js)
// so the form structure can't drift between the editable admin view and the
// read-only dashboard report. Keep that file in sync with
// apps-script/RoutineVisitSync.gs's QUESTION_MAP when questions change.
const VISIT_GENERAL_FIELDS = window.GAILS_VISIT_SCHEMA.general;
const VISIT_SECTIONS = window.GAILS_VISIT_SCHEMA.sections;

// ── State ──
const state = {
  activePanel: 'overview',
  users: [],
  // The person whose access modal is open, and the unsaved edits inside it.
  // Held separately from state.users so a live sync landing mid-edit repaints
  // the table underneath without stealing what is being typed.
  accessUserUid: null,
  accessDraft: null,
  siteMetaSource: {},
  siteMetaSourceInfo: null,
  siteMetaDraft: {},
  regionAssignmentsSource: [],
  regionAssignmentsDraft: [],
  opsAreaAssignmentsSource: [],
  opsAreaAssignmentsDraft: [],
  siteMetaDirty: false,
  siteSearch: '',
  datasetInfo: null,
  siteImportInfo: null,
  visits: [],
  visitSearch: '',
  visitDetailId: null,
  cqvPending: null, // { record, warnings, file } awaiting confirmation in cqvConfirmModal
  roles: {},        // custom roles synced from roles/ in Firebase
  editingRoleId: null,
  permissions: normalizePermissions(BUILTIN_ROLES.viewer.permissions),
  isAdmin: false,
  reportVisibilityEnabled: false
};

let usersUnsubscribe = null;
let visitsUnsubscribe = null;
let rolesUnsubscribe = null;
let appSettingsUnsubscribe = null;

// ── Role helpers ──
function canView(areaKey) {
  return state.isAdmin || canViewArea(state.permissions, areaKey);
}

function canEdit(areaKey) {
  return state.isAdmin || canEditArea(state.permissions, areaKey);
}

function allRolesList() {
  var builtIns = Object.keys(BUILTIN_ROLES).map(function(id) {
    return { id: id, def: BUILTIN_ROLES[id], builtIn: true };
  });
  var customs = Object.keys(state.roles).map(function(id) {
    return { id: id, def: state.roles[id], builtIn: false };
  }).sort(function(a, b) {
    return String(a.def.name || a.id).localeCompare(String(b.def.name || b.id));
  });
  return builtIns.concat(customs);
}

function roleDisplayName(roleId) {
  if (BUILTIN_ROLES[roleId]) return BUILTIN_ROLES[roleId].name;
  if (state.roles[roleId] && state.roles[roleId].name) return state.roles[roleId].name;
  // Legacy activity-log entries stored 'admin'/'viewer'; anything else
  // unknown means the role was deleted — fall back to the raw id.
  return roleId || 'Viewer';
}

function roleUserCount(roleId) {
  return state.users.filter(function(u) { return u.role === roleId; }).length;
}

function slugifyRoleId(name) {
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function roleOptionsHtml(selected) {
  return allRolesList().filter(function(role) {
    // Only full admins may grant the Admin role (the database rules
    // also block non-admins from writing it).
    return role.id !== 'admin' || state.isAdmin || selected === 'admin';
  }).map(function(role) {
    return '<option value="' + escapeHtml(role.id) + '" ' + (role.id === selected ? 'selected' : '') + '>'
      + escapeHtml(role.def.name || role.id) + '</option>';
  }).join('');
}

// The ops areas a user can be scoped to are the ops areas mapped in the site
// directory — the same source as the site table's manager autocomplete. An
// empty value means "not scoped": the user sees every site's Bakery Reports.
function opsAreaList() {
  return [...new Set(Object.values(state.siteMetaDraft || {}).map(function(e) {
    return e && e.o;
  }).filter(Boolean))].sort();
}

function opsAreaOptionsHtml(selected) {
  var current = selected || '';
  // A stored ops area that no longer exists in the directory must still be
  // offered, so re-saving the user doesn't silently drop their scoping.
  var areas = opsAreaList();
  if (current && areas.indexOf(current) === -1) areas = areas.concat(current).sort();
  return '<option value=""' + (current === '' ? ' selected' : '') + '>None — sees all sites</option>'
    + areas.map(function(area) {
      return '<option value="' + escapeHtml(area) + '"' + (area === current ? ' selected' : '') + '>'
        + escapeHtml(area) + '</option>';
    }).join('');
}

// ── Reporting lines ──
// The manager field is one uid on each user record (users/{uid}.managerUid).
// Everything about the hierarchy is derived from it — see js/team.js.
function teamApi() {
  return window.GAILS && window.GAILS.Team;
}

function userLabel(user) {
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unnamed user';
}

function findUser(uid) {
  return state.users.find(function(user) { return user.uid === uid; }) || null;
}

function managerLabel(uid) {
  var manager = findUser(uid);
  return manager ? userLabel(manager) : '';
}

// Anyone can be anyone's manager except themselves and their own reports —
// offering those would just be offering a loop the save would refuse.
function managerOptionsHtml(subjectUid, selected) {
  var api = teamApi();
  var current = selected || '';
  var candidates = state.users.filter(function(user) {
    if (user.uid === subjectUid) return false;
    if (!api || !subjectUid) return true;
    return !api.assignmentWouldCycle(subjectUid, user.uid, state.users);
  });
  // A manager who has since been removed must still be shown, so re-saving
  // someone does not silently reassign them.
  var hasCurrent = !current || candidates.some(function(user) { return user.uid === current; });
  return '<option value=""' + (current === '' ? ' selected' : '') + '>Nobody — top of the line</option>'
    + candidates.map(function(user) {
      return '<option value="' + escapeHtml(user.uid) + '"' + (user.uid === current ? ' selected' : '') + '>'
        + escapeHtml(userLabel(user)) + '</option>';
    }).join('')
    + (hasCurrent ? '' : '<option value="' + escapeHtml(current) + '" selected>Former manager (no longer has access)</option>');
}

function populateRoleSelects() {
  if (roleSelect) {
    var current = roleSelect.value || 'viewer';
    roleSelect.innerHTML = roleOptionsHtml(current);
    if (!roleSelect.value) roleSelect.value = 'viewer';
  }
  if (newManagerSelect) {
    var currentManager = newManagerSelect.value || '';
    newManagerSelect.innerHTML = managerOptionsHtml('', currentManager);
  }
  if (newOpsSelect) {
    var currentOps = newOpsSelect.value || '';
    newOpsSelect.innerHTML = opsAreaOptionsHtml(currentOps);
  }
}

// The permissions a role id resolves to, for showing what someone can reach
// without having to open the role itself.
function permissionsForRole(roleId) {
  return resolveRolePermissions(roleId, state.roles[roleId] || null);
}

function nowIso() {
  return new Date().toISOString();
}

// Firebase Auth needs an initial password when the account is created. It is
// deliberately random and never shown or shared: the invitation email lets the
// user choose their own password before signing in.
function createInvitationPassword() {
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  var bytes = new Uint8Array(30);
  window.crypto.getRandomValues(bytes);
  return 'Ga1!' + Array.from(bytes, function(byte) {
    return alphabet[byte % alphabet.length];
  }).join('');
}

function invitationEmailSettings() {
  return {
    url: 'https://' + firebaseConfig.projectId + '.web.app/?invited=1'
  };
}

// Shared with the dashboard header — see js/profile-menu.js. The shared copy
// also resets and closes the menu when passed a null user, which this page's
// previous local copy did not do; admin only ever passes a real user, so that
// branch is unreachable here.
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
  // My Activity is opt-in per user (users/{uid}.myActivity), so the menu entry
  // stays hidden until an admin grants it — including for admins themselves.
  var myActivityLink = document.querySelector('[data-my-activity-link]');
  if (myActivityLink) myActivityLink.hidden = !(profile && profile.myActivity === true);
  // My Team comes from the role's teamScope instead, so it follows whatever
  // access this account already resolved to.
  var myTeamLink = document.querySelector('[data-my-team-link]');
  if (myTeamLink) myTeamLink.hidden = !canSeeTeam(state.permissions);
}

// ── Helpers ──
function cloneMeta(meta) {
  return JSON.parse(JSON.stringify(meta || {}));
}

function detectedSiteRegions(meta) {
  return [...new Set(Object.values(meta || {}).map(function(entry) {
    return entry && String(entry.r || '').trim();
  }).filter(Boolean))].sort(function(a, b) {
    return a.localeCompare(b);
  });
}

function regionAssignmentApi() {
  if (!window.GAILS_REGION_ASSIGNMENTS) {
    throw new Error('Region assignment support is unavailable on this page.');
  }
  return window.GAILS_REGION_ASSIGNMENTS;
}

function mergeRegionAssignmentsForMeta(meta, assignments) {
  return regionAssignmentApi().mergeDetectedRegions(
    detectedSiteRegions(meta),
    assignments
  );
}

function visibleRegionAssignments() {
  return regionAssignmentApi().assignmentsForRegions(
    detectedSiteRegions(state.siteMetaDraft),
    state.regionAssignmentsDraft
  );
}

// Each distinct region/ops area pairing in the directory, which is what the
// Area Head Barista table lists. Ops area names repeat across regions, so the
// pair — not the ops area alone — is what identifies a row. The bakeries in
// each pairing travel with it: ops areas are named after their ops manager, so
// membership is what identifies one across a rename. See
// js/ops-area-assignments.js.
function detectedSiteOpsAreas(meta) {
  var byKey = {};
  var pairs = [];
  Object.keys(meta || {}).forEach(function(bakery) {
    var entry = meta[bakery] || {};
    var opsArea = String(entry.o || '').trim();
    if (!opsArea) return;
    var region = String(entry.r || '').trim();
    var key = (region + ' ' + opsArea).toLowerCase();
    if (!byKey[key]) {
      byKey[key] = { region: region, opsArea: opsArea, bakeries: [] };
      pairs.push(byKey[key]);
    }
    byKey[key].bakeries.push(bakery);
  });
  return pairs;
}

function opsAreaAssignmentApi() {
  if (!window.GAILS_OPS_AREA_ASSIGNMENTS) {
    throw new Error('Area Head Barista support is unavailable on this page.');
  }
  return window.GAILS_OPS_AREA_ASSIGNMENTS;
}

function mergeOpsAreaAssignmentsForMeta(meta, assignments) {
  return opsAreaAssignmentApi().mergeDetectedOpsAreas(
    detectedSiteOpsAreas(meta),
    assignments
  );
}

function visibleOpsAreaAssignments() {
  return opsAreaAssignmentApi().assignmentsForOpsAreas(
    detectedSiteOpsAreas(state.siteMetaDraft),
    state.opsAreaAssignmentsDraft
  );
}

// Lists at most three by name and counts the rest, so a big restructure gives
// the gist without turning the message into a wall of text.
function listOpsAreaChanges(items, describe) {
  var listed = items.slice(0, 3).map(describe);
  var text = listed.join(', ');
  if (items.length > listed.length) {
    text += ', and ' + (items.length - listed.length) + ' more';
  }
  return text;
}

// Spells out each renamed ops area rather than quietly moving the details, so
// an admin who expected to lose them can see exactly what happened.
function describeOpsAreaRenames(renames) {
  var text = listOpsAreaChanges(renames, function(rename) {
    var who = rename.baristas.length ? ' (' + rename.baristas.join(', ') + ')' : '';
    return '“' + rename.from.opsArea + '” is now “' + rename.to.opsArea + '”' + who;
  });
  return renames.length === 1
    ? 'One ops area came across under a new name, bringing its area head barista with it: ' + text + '.'
    : renames.length + ' ops areas came across under new names, bringing their area head baristas with them: ' + text + '.';
}

// Merged areas keep everyone rather than the app picking between them, so the
// admin is told where to go and prune.
function describeOpsAreaMerges(merges) {
  var text = listOpsAreaChanges(merges, function(item) {
    return '“' + item.opsArea + '” (' + (item.baristas.join(', ') || 'no names yet') + ')';
  });
  return merges.length === 1
    ? 'One ops area now draws on more than one previous area, so every area head barista involved is listed against it — remove any who no longer apply: ' + text + '.'
    : merges.length + ' ops areas now draw on more than one previous area, so every area head barista involved is listed against them — remove any who no longer apply: ' + text + '.';
}

function formatDate(iso) {
  if (!iso) return 'Not recorded yet';
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not recorded yet';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// Declaration rather than a const alias: roleOptionsHtml above calls this
// before this line, and relies on hoisting.
function escapeHtml(value) {
  return window.GAILS.escapeHtml(value);
}

function formatCount(value, singular, plural) {
  return value + ' ' + (value === 1 ? singular : plural);
}

function setSidebarCollapsed(collapsed) {
  if (!workspaceShell) return;
  var isCollapsed = !!collapsed;
  workspaceShell.dataset.sidebarCollapsed = isCollapsed ? 'true' : 'false';
  if (sidebarToggleBtn) {
    sidebarToggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
    sidebarToggleBtn.setAttribute('aria-label', isCollapsed ? 'Expand menu' : 'Collapse menu');
  }
  if (sidebarToggleLabel) {
    sidebarToggleLabel.textContent = isCollapsed ? 'Expand' : 'Collapse';
  }
}

function syncSidebarForViewport() {
  setSidebarCollapsed(compactSidebarMedia.matches);
}

function setZoneLoadedState(zone, emptyState, loadedState, isLoaded) {
  if (zone) zone.classList.toggle('is-loaded', !!isLoaded);
  if (emptyState) emptyState.hidden = !!isLoaded;
  if (loadedState) loadedState.hidden = !isLoaded;
}

function normalizeSiteImportInfo(info) {
  if (!info) return null;
  return {
    fileName: info.fileName || info.sourceName || '',
    sheetName: info.sheetName || info.sourceSheetName || '',
    duplicateCount: Number(info.duplicateCount || 0),
    siteCount: Number(info.siteCount || 0),
    updatedAt: info.updatedAt || '',
    updatedBy: info.updatedBy || ''
  };
}

function setMessage(el, type, msg) {
  if (!el) return;
  el.textContent = msg;
  el.className = 'admin-message is-' + type;
  el.style.display = 'block';
}

function clearMessage(el) {
  if (!el) return;
  el.textContent = '';
  el.className = 'admin-message';
  el.style.display = 'none';
}

function setDirty(flag) {
  state.siteMetaDirty = !!flag;
  saveSitesBtn.textContent = state.siteMetaDirty ? 'Save Site Data' : 'Site Data Saved';
  resetSitesBtn.disabled = !state.siteMetaDirty;
}

function currentUserId() {
  return primaryAuth.currentUser ? primaryAuth.currentUser.uid : '';
}

function currentUserEmail() {
  return primaryAuth.currentUser ? (primaryAuth.currentUser.email || primaryAuth.currentUser.uid) : 'Unknown';
}

function buildDashboardDataPayload(records, months, sourceName, sourceLastUpdated) {
  return {
    records: records,
    months: months,
    recordCount: records.length,
    monthCount: months.length,
    sourceName: sourceName || '',
    sourceLastUpdated: sourceLastUpdated || null,
    updatedAt: nowIso(),
    updatedBy: currentUserEmail()
  };
}

function renderImportZones() {
  var siteInfo = state.siteImportInfo;
  var hasSiteInfo = !!(siteInfo && (siteInfo.siteCount || siteInfo.fileName || siteInfo.updatedAt));
  setZoneLoadedState(siteImportZone, siteImportEmptyState, siteImportLoadedState, hasSiteInfo);
  if (siteImportBrowseBtn) {
    siteImportBrowseBtn.textContent = hasSiteInfo ? 'Add New Data' : 'Choose Excel File';
  }
  if (hasSiteInfo) {
    if (siteImportLoadedTitle) {
      siteImportLoadedTitle.textContent = siteInfo.fileName || 'Shared site directory workbook';
    }
    if (siteImportLoadedStats) {
      var siteStats = [
        formatCount(siteInfo.siteCount || 0, 'site', 'sites')
      ];
      if (siteInfo.sheetName) siteStats.push('Sheet: ' + siteInfo.sheetName);
      if (siteInfo.duplicateCount) siteStats.push(formatCount(siteInfo.duplicateCount, 'duplicate merged', 'duplicates merged'));
      siteImportLoadedStats.innerHTML = siteStats.map(function(item) {
        return '<span class="admin-import-card__stat">' + escapeHtml(item) + '</span>';
      }).join('');
    }
    if (siteImportLoadedHint) {
      if (state.siteMetaDirty) {
        var pendingPrefix = siteInfo.updatedAt
          ? 'Last synced ' + formatDate(siteInfo.updatedAt) + ' by ' + (siteInfo.updatedBy || 'Unknown') + '. '
          : '';
        siteImportLoadedHint.textContent = pendingPrefix + 'Review the imported directory below, then click Save Site Data to publish it.';
      } else {
        siteImportLoadedHint.textContent = siteInfo.updatedAt
          ? 'Last synced ' + formatDate(siteInfo.updatedAt) + ' by ' + (siteInfo.updatedBy || 'Unknown') + '.'
          : 'Ready for another site directory update.';
      }
    }
  }

  var datasetInfo = state.datasetInfo;
  var hasDatasetInfo = !!(datasetInfo && datasetInfo.recordCount);
  setZoneLoadedState(datasetImportZone, datasetImportEmptyState, datasetImportLoadedState, hasDatasetInfo);
  if (datasetImportBrowseBtn) {
    datasetImportBrowseBtn.textContent = hasDatasetInfo ? 'Add New Data' : 'Choose Excel File';
  }
  if (hasDatasetInfo) {
    if (datasetImportLoadedTitle) {
      datasetImportLoadedTitle.textContent = datasetInfo.sourceName || 'Shared customer experience workbook';
    }
    if (datasetImportLoadedStats) {
      var datasetStats = [
        formatCount(datasetInfo.recordCount || 0, 'record', 'records'),
        formatCount(datasetInfo.monthCount || 0, 'month', 'months')
      ];
      datasetImportLoadedStats.innerHTML = datasetStats.map(function(item) {
        return '<span class="admin-import-card__stat">' + escapeHtml(item) + '</span>';
      }).join('');
    }
    if (datasetImportLoadedHint) {
      datasetImportLoadedHint.textContent = 'Last synced ' + formatDate(datasetInfo.updatedAt) + ' by ' + (datasetInfo.updatedBy || 'Unknown') + '.';
    }
  }
}

function buildSiteMetaPayload(meta, sourceInfo, regionAssignments, opsAreaAssignments) {
  var entries = window.GAILS && typeof window.GAILS.cloneBakeryMeta === 'function'
    ? window.GAILS.cloneBakeryMeta(meta)
    : cloneMeta(meta);
  var regions = new Set();
  var managers = new Set();
  var normalizedInfo = normalizeSiteImportInfo(sourceInfo);

  Object.values(entries || {}).forEach(function(entry) {
    if (entry && entry.r) regions.add(entry.r);
    if (entry && entry.o) managers.add(entry.o);
  });

  return {
    entries: entries,
    regionAssignments: mergeRegionAssignmentsForMeta(entries, regionAssignments),
    opsAreaAssignments: mergeOpsAreaAssignmentsForMeta(entries, opsAreaAssignments),
    siteCount: Object.keys(entries || {}).length,
    regionCount: regions.size,
    managerCount: managers.size,
    sourceName: normalizedInfo && normalizedInfo.fileName ? normalizedInfo.fileName : '',
    sourceSheetName: normalizedInfo && normalizedInfo.sheetName ? normalizedInfo.sheetName : '',
    duplicateCount: normalizedInfo ? normalizedInfo.duplicateCount : 0,
    updatedAt: nowIso(),
    updatedBy: currentUserEmail()
  };
}

function normalizeWorkbookHeader(value) {
  return String(value == null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getWorkbookCellText(value) {
  return String(value == null ? '' : value).trim();
}

function findWorkbookColumn(headers, matchers) {
  for (var i = 0; i < headers.length; i++) {
    var normalized = normalizeWorkbookHeader(headers[i]);
    for (var j = 0; j < matchers.length; j++) {
      if (matchers[j](normalized)) return i;
    }
  }
  return -1;
}

function findSiteWorkbookSheet(workbook) {
  for (var i = 0; i < workbook.SheetNames.length; i++) {
    var sheetName = workbook.SheetNames[i];
    var rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

    for (var rowIndex = 0; rowIndex < Math.min(rows.length, 12); rowIndex++) {
      var headers = rows[rowIndex] || [];
      var hasRegion = findWorkbookColumn(headers, [
        function(header) { return header === 'regionopsareabakery'; },
        function(header) { return header.indexOf('region') !== -1 && header.indexOf('bakery') !== -1; },
        function(header) { return header === 'region'; }
      ]) !== -1;
      var hasOpsGroup = findWorkbookColumn(headers, [
        function(header) { return header === 'opsgroup'; },
        function(header) { return header.indexOf('opsgroup') !== -1; }
      ]) !== -1;
      var hasLocation = findWorkbookColumn(headers, [
        function(header) { return header === 'locationname'; },
        function(header) { return header.indexOf('locationname') !== -1; },
        function(header) { return header === 'bakery'; }
      ]) !== -1;

      if (hasRegion && hasOpsGroup && hasLocation) {
        return { sheetName: sheetName, rows: rows, headerIndex: rowIndex, headers: headers };
      }
    }
  }

  throw new Error('Could not find the expected site columns in this workbook.');
}

function parseSiteMetaWorkbook(data) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Excel import is unavailable on this page.');
  }

  var workbook = XLSX.read(data, { type: 'array' });
  if (!workbook.SheetNames || !workbook.SheetNames.length) {
    throw new Error('No worksheets were found in this file.');
  }

  var match = findSiteWorkbookSheet(workbook);
  var headers = match.headers || [];
  var regionIndex = findWorkbookColumn(headers, [
    function(header) { return header === 'regionopsareabakery'; },
    function(header) { return header.indexOf('region') !== -1 && header.indexOf('bakery') !== -1; },
    function(header) { return header === 'region'; }
  ]);
  var opsIndex = findWorkbookColumn(headers, [
    function(header) { return header === 'opsgroup'; },
    function(header) { return header.indexOf('opsgroup') !== -1; }
  ]);
  var locationIndex = findWorkbookColumn(headers, [
    function(header) { return header === 'locationname'; },
    function(header) { return header.indexOf('locationname') !== -1; },
    function(header) { return header === 'bakery'; }
  ]);

  if (regionIndex === -1 || opsIndex === -1 || locationIndex === -1) {
    throw new Error('The workbook is missing one or more required site columns.');
  }

  var meta = {};
  var duplicateCount = 0;

  for (var rowIndex = match.headerIndex + 1; rowIndex < match.rows.length; rowIndex++) {
    var row = match.rows[rowIndex] || [];
    var name = getWorkbookCellText(row[locationIndex]);
    if (!name || /^total$/i.test(name)) continue;

    var region = getWorkbookCellText(row[regionIndex]) || 'Unknown';
    var ops = getWorkbookCellText(row[opsIndex]) || 'Unknown';

    if (meta[name]) duplicateCount += 1;
    meta[name] = { r: region, o: ops };
  }

  var normalizedMeta = window.GAILS && typeof window.GAILS.cloneBakeryMeta === 'function'
    ? window.GAILS.cloneBakeryMeta(meta)
    : meta;
  var siteCount = Object.keys(normalizedMeta).length;

  if (!siteCount) {
    throw new Error('No site rows were found after filtering out summary rows.');
  }

  return {
    meta: normalizedMeta,
    sheetName: match.sheetName,
    siteCount: siteCount,
    duplicateCount: duplicateCount
  };
}

function readFileAsBytes(file) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(event) {
      resolve(new Uint8Array(event.target.result));
    };
    reader.onerror = function() {
      reject(new Error('Could not read that file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function confirmSiteImport() {
  var hasDraft = Object.keys(state.siteMetaDraft).length > 0;
  if (!hasDraft && !state.siteMetaDirty) return true;

  return confirm('Importing a workbook will immediately replace the shared site directory for all dashboard users. Coffee Partner and Coffee Trainer details for matching regions, and Area Head Barista details for matching ops areas, will be kept. Continue?');
}

async function importSiteWorkbook(file) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) {
    setMessage(siteMsg, 'error', 'Please choose an Excel workbook ending in .xlsx or .xls.');
    return;
  }
  if (!confirmSiteImport()) {
    if (siteImportInput) siteImportInput.value = '';
    return;
  }

  setMessage(siteMsg, 'info', 'Reading ' + file.name + '...');
  if (siteImportBrowseBtn) siteImportBrowseBtn.disabled = true;

  try {
    var data = await readFileAsBytes(file);
    var imported = parseSiteMetaWorkbook(data);
    var importInfo = {
      fileName: file.name,
      siteCount: imported.siteCount,
      sheetName: imported.sheetName,
      duplicateCount: imported.duplicateCount
    };

    setMessage(siteMsg, 'info', 'Saving ' + imported.siteCount + ' sites to Firebase\u2026');

    var preservedRegionAssignments = mergeRegionAssignmentsForMeta(
      imported.meta,
      state.regionAssignmentsDraft
    );
    // Ops areas carry their ops manager's name, so a leaver shows up in the
    // workbook as a renamed area, and a restructure shows up as bakeries moving
    // between them. Worked out before the merge is applied, purely so the admin
    // is told which details moved, and which were held back for them to decide.
    var opsAreaChanges = opsAreaAssignmentApi().detectChanges(
      detectedSiteOpsAreas(imported.meta),
      state.opsAreaAssignmentsDraft
    );
    var preservedOpsAreaAssignments = mergeOpsAreaAssignmentsForMeta(
      imported.meta,
      state.opsAreaAssignmentsDraft
    );
    var payload = buildSiteMetaPayload(
      imported.meta,
      importInfo,
      preservedRegionAssignments,
      preservedOpsAreaAssignments
    );
    await set(ref(db, 'portalData/siteMeta'), payload);

    state.siteMetaDraft = cloneMeta(imported.meta);
    state.siteMetaSource = cloneMeta(imported.meta);
    state.regionAssignmentsSource = cloneMeta(payload.regionAssignments);
    state.regionAssignmentsDraft = cloneMeta(payload.regionAssignments);
    state.opsAreaAssignmentsSource = cloneMeta(payload.opsAreaAssignments);
    state.opsAreaAssignmentsDraft = cloneMeta(payload.opsAreaAssignments);
    state.siteImportInfo = normalizeSiteImportInfo({
      fileName: payload.sourceName,
      sheetName: payload.sourceSheetName,
      duplicateCount: payload.duplicateCount,
      siteCount: payload.siteCount,
      updatedAt: payload.updatedAt,
      updatedBy: payload.updatedBy
    });
    state.siteMetaSourceInfo = state.siteImportInfo ? cloneMeta(state.siteImportInfo) : null;
    state.siteSearch = '';
    if (siteSearchInput) siteSearchInput.value = '';
    setDirty(false);
    renderPortal();

    var summary = 'Saved ' + imported.siteCount + ' site'
      + (imported.siteCount === 1 ? '' : 's')
      + ' from ' + file.name
      + ' (' + imported.sheetName + ') to the shared site directory.';
    if (imported.duplicateCount > 0) {
      summary += ' ' + imported.duplicateCount + ' duplicate row'
        + (imported.duplicateCount === 1 ? ' was' : 's were')
        + ' merged by bakery name.';
    }
    summary += ' Existing Coffee Partner and Coffee Trainer details were kept for matching regions,'
      + ' and Area Head Barista details for matching ops areas.';
    if (opsAreaChanges.renames.length) {
      summary += ' ' + describeOpsAreaRenames(opsAreaChanges.renames);
    }
    if (opsAreaChanges.merges.length) {
      summary += ' ' + describeOpsAreaMerges(opsAreaChanges.merges);
    }
    // A merge leaves the admin something to prune, so the message says so
    // rather than reading as "all done".
    setMessage(siteMsg, opsAreaChanges.merges.length ? 'info' : 'success', summary);
  } catch (err) {
    console.error('Failed to import site workbook:', err);
    setMessage(siteMsg, 'error', 'Could not import that workbook: ' + err.message);
  } finally {
    if (siteImportBrowseBtn) siteImportBrowseBtn.disabled = false;
    if (siteImportInput) siteImportInput.value = '';
    if (siteImportZone) siteImportZone.classList.remove('drag-over');
  }
}

// ── Summary stats ──
function confirmDatasetImport() {
  if (!state.datasetInfo || !state.datasetInfo.recordCount) return true;
  return confirm('Uploading a workbook will replace the current shared dataset for every dashboard user. Continue?');
}

async function importDatasetWorkbook(file) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) {
    setMessage(dataMsg, 'error', 'Please choose an Excel workbook ending in .xlsx or .xls.');
    return;
  }
  if (!confirmDatasetImport()) {
    if (datasetImportInput) datasetImportInput.value = '';
    return;
  }

  setMessage(dataMsg, 'info', 'Reading ' + file.name + '...');
  if (datasetImportBrowseBtn) datasetImportBrowseBtn.disabled = true;
  if (clearDatasetBtn) clearDatasetBtn.disabled = true;

  try {
    if (!window.GAILS || typeof window.GAILS.parseExcelFile !== 'function') {
      throw new Error('Excel import is unavailable on this page.');
    }

    var data = await readFileAsBytes(file);
    var parsed = window.GAILS.parseExcelFile(data);

    if (!parsed.records || !parsed.records.length) {
      throw new Error('No data rows were found. Check that the workbook matches the expected monthly layout.');
    }

    var payload = buildDashboardDataPayload(parsed.records, parsed.months || [], file.name, parsed.lastUpdated);
    await set(ref(db, 'dashboardData'), payload);
    var meta = {
      recordCount: payload.recordCount,
      monthCount: payload.monthCount,
      sourceName: payload.sourceName,
      sourceLastUpdated: payload.sourceLastUpdated,
      updatedAt: payload.updatedAt,
      updatedBy: payload.updatedBy
    };
    await set(ref(db, 'dashboardMeta'), meta);
    state.datasetInfo = meta;
    renderSummary();
    renderOverview();
    renderDataControls();
    renderImportZones();

    setMessage(
      dataMsg,
      'success',
      'Uploaded ' + payload.recordCount + ' records across ' + payload.monthCount + ' month'
        + (payload.monthCount === 1 ? '' : 's')
        + ' from ' + file.name + '. The shared dashboard dataset is now updated for all users.'
    );
  } catch (err) {
    console.error('Failed to import dataset workbook:', err);
    setMessage(dataMsg, 'error', 'Could not import that workbook: ' + err.message);
  } finally {
    if (datasetImportBrowseBtn) datasetImportBrowseBtn.disabled = false;
    if (clearDatasetBtn) clearDatasetBtn.disabled = false;
    if (datasetImportInput) datasetImportInput.value = '';
    if (datasetImportZone) datasetImportZone.classList.remove('drag-over');
  }
}

function buildSummaryStats() {
  var meta = cloneMeta(state.siteMetaDraft);
  var regions = new Set();
  var managers = new Set();
  Object.values(meta).forEach(function(e) {
    if (e.r) regions.add(e.r);
    if (e.o) managers.add(e.o);
  });
  var adminCount = state.users.filter(function(u) { return u.role === 'admin'; }).length;
  return {
    userCount:    state.users.length,
    adminCount:   adminCount,
    siteCount:    Object.keys(meta).length,
    regionCount:  regions.size,
    managerCount: managers.size,
    recordCount:  state.datasetInfo && state.datasetInfo.recordCount != null ? state.datasetInfo.recordCount : 0,
    monthCount:   state.datasetInfo && state.datasetInfo.monthCount  != null ? state.datasetInfo.monthCount  : 0,
    updatedAt:    state.datasetInfo ? state.datasetInfo.updatedAt  : '',
    updatedBy:    state.datasetInfo ? state.datasetInfo.updatedBy  : ''
  };
}

// ── Render ──
function renderSummary() {
  var s = buildSummaryStats();
  summaryCards.innerHTML = [
    { label: 'Users',        value: s.userCount,    meta: s.adminCount + ' admin' + (s.adminCount === 1 ? '' : 's') },
    { label: 'Sites',        value: s.siteCount,    meta: s.regionCount + ' regions mapped' },
    { label: 'Ops Areas', value: s.managerCount, meta: state.siteMetaDirty ? 'Unsaved changes' : 'Directory synced' },
    { label: 'Records',      value: s.recordCount,  meta: s.monthCount + ' month' + (s.monthCount === 1 ? '' : 's') + ' synced' }
  ].map(function(c) {
    return '<div class="admin-summary-card">'
      + '<div class="admin-summary-card__label">' + c.label + '</div>'
      + '<div class="admin-summary-card__value">' + escapeHtml(c.value) + '</div>'
      + '<div class="admin-summary-card__meta">' + escapeHtml(c.meta) + '</div>'
      + '</div>';
  }).join('');

  heroSummary.textContent = s.recordCount + ' records across ' + s.monthCount + ' months';
  heroMeta.textContent = s.updatedAt
    ? 'Last synced ' + formatDate(s.updatedAt) + ' by ' + (s.updatedBy || 'Unknown')
    : 'No shared workbook currently synced';
}

function renderOverview() {
  var s = buildSummaryStats();
  overviewGrid.innerHTML = [
    { label: 'Access Health',    value: s.userCount ? s.userCount + ' total users'       : 'No users yet',          meta: s.adminCount + ' admin accounts can manage the portal.' },
    { label: 'Site Directory',   value: s.siteCount + ' bakeries mapped',                                           meta: s.managerCount + ' ops areas across ' + s.regionCount + ' regions.' },
    { label: 'Dataset Status',   value: s.recordCount ? 'Shared workbook active'         : 'No workbook synced',    meta: s.updatedAt ? 'Updated ' + formatDate(s.updatedAt) : 'Upload a workbook to populate the live dashboard.' },
    { label: 'Current Session',  value: currentUserEmail(),                                                         meta: state.siteMetaDirty ? 'You have unsaved site mapping edits.' : 'All site metadata changes are saved.' }
  ].map(function(c) {
    return '<div class="admin-overview-card">'
      + '<div class="admin-overview-card__label">' + escapeHtml(c.label) + '</div>'
      + '<div class="admin-overview-card__value">' + escapeHtml(c.value) + '</div>'
      + '<div class="admin-overview-card__meta">' + escapeHtml(c.meta) + '</div>'
      + '</div>';
  }).join('');
}

async function renderActivityLog() {
  if (!activityLogList) return;
  if (!canView('users')) {
    activityLogList.innerHTML = '<tr><td colspan="4" class="admin-empty">Login activity is only visible to roles with Users &amp; Roles access.</td></tr>';
    return;
  }
  activityLogList.innerHTML = '<tr><td colspan="4" class="admin-empty">Loading&hellip;</td></tr>';
  try {
    var snap = await get(query(ref(db, 'activityLog'), orderByKey(), limitToLast(10)));
    if (!snap.exists()) {
      activityLogList.innerHTML = '<tr><td colspan="4" class="admin-empty">No login activity recorded yet.</td></tr>';
      return;
    }
    var entries = [];
    snap.forEach(function(child) {
      entries.push(child.val());
    });
    entries.reverse();
    activityLogList.innerHTML = entries.map(function(entry) {
      var roleClass = entry.role === 'admin' ? 'admin-pill admin-pill--admin' : 'admin-pill';
      var isResume = entry.action === 'session_resume';
      var eventLabel = isResume ? 'Session resumed' : 'Logged in';
      var eventClass = isResume ? 'admin-status-note' : 'admin-status-note';
      return '<tr>'
        + '<td><div class="admin-table__title">' + escapeHtml(entry.email || 'Unknown') + '</div></td>'
        + '<td><div class="' + roleClass + '">' + escapeHtml(roleDisplayName(entry.role)) + '</div></td>'
        + '<td><div class="' + eventClass + '">' + escapeHtml(eventLabel) + '</div></td>'
        + '<td>' + escapeHtml(formatDate(entry.timestamp)) + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.error('Could not load activity log:', e);
    activityLogList.innerHTML = '<tr><td colspan="4" class="admin-empty">Failed to load activity log.</td></tr>';
  }
}

// A person's account state, in the words the table and the modal both use.
function userStatus(user) {
  var invitation = user.invitation || {};
  if (currentUserId() === user.uid) {
    return { label: 'You', note: 'This is the account you are signed in with.', tone: 'self' };
  }
  if (invitation.status === 'pending') {
    return { label: 'Invited', note: 'Waiting for them to choose a password and confirm their details.', tone: 'pending' };
  }
  if (invitation.status === 'delivery_failed') {
    return { label: 'Email failed', note: 'Their invitation email bounced — resend it from their access settings.', tone: 'warn' };
  }
  if (invitation.status === 'accepted') {
    return { label: 'Active', note: 'Dashboard details confirmed.', tone: 'active' };
  }
  return { label: 'Active', note: 'Managed through Firebase dashboard access rules.', tone: 'active' };
}

function renderUsers() {
  if (!userList) return;
  if (!state.users.length) {
    userList.innerHTML = '<tr><td colspan="6" class="admin-empty">Nobody has dashboard access yet.</td></tr>';
    return;
  }
  var canManageUsers = canEdit('users');
  userList.innerHTML = state.users.map(function(user) {
    var isCurrent = currentUserId() === user.uid;
    var perms = permissionsForRole(user.role);
    var status = userStatus(user);
    var roleClass = user.role === 'admin' ? 'admin-pill admin-pill--admin' : 'admin-pill';
    var manager = findUser(user.managerUid);

    // Scope and feature switches sharpen the plain "can see" summary the role
    // gives, because those are per-person and the role summary cannot know them.
    var seeExtras = [];
    if (user.opsArea) seeExtras.push('Bakery Reports limited to ' + user.opsArea);
    if (user.myActivity) seeExtras.push('My Activity hub');

    return '<tr>'
      + '<td>'
        + '<div class="admin-table__title">' + escapeHtml(userLabel(user)) + '</div>'
        + '<div class="admin-status-note">' + escapeHtml(user.email || 'Unknown') + '</div>'
        + '<div class="admin-status-note admin-status-note--' + escapeHtml(status.tone) + '">' + escapeHtml(status.label) + '</div>'
      + '</td>'
      + '<td><div class="' + roleClass + '">' + escapeHtml(roleDisplayName(user.role)) + '</div></td>'
      + '<td>'
        + (manager
          ? '<div class="admin-table__title admin-table__title--sm">' + escapeHtml(userLabel(manager)) + '</div>'
          : '<div class="admin-status-note">' + (user.managerUid ? 'Former manager' : 'Nobody') + '</div>')
        + (perms.teamScope !== 'none'
          ? '<div class="admin-status-note admin-status-note--team">Sees ' + escapeHtml(teamScopeLabel(perms.teamScope).toLowerCase()) + '</div>'
          : '')
      + '</td>'
      + '<td><div class="admin-status-note">' + escapeHtml(describeVisibility(perms)) + '</div>'
        + seeExtras.map(function(extra) {
          return '<div class="admin-status-note admin-user-scope admin-user-scope--restricted">' + escapeHtml(extra) + '</div>';
        }).join('')
      + '</td>'
      + '<td><div class="admin-status-note">' + escapeHtml(describeEditing(perms)) + '</div></td>'
      + '<td>'
        + (canManageUsers
          ? '<div class="admin-table__actions">'
            + '<button type="button" class="admin-inline-btn" data-action="manage-access" data-uid="' + escapeHtml(user.uid) + '">'
            + (isCurrent ? 'View' : 'Manage') + '</button>'
          + '</div>'
          : '<div class="admin-status-note">View only</div>')
      + '</td>'
      + '</tr>';
  }).join('');
}

// ── Person access modal ──
// Every access decision about one person, in one dialog: their role (what they
// can see and edit), their reporting line (whose My Team they appear on), their
// Bakery Reports scope, and their feature switches.
function accessDraftFor(user) {
  return {
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    role: user.role || 'viewer',
    managerUid: user.managerUid || '',
    opsArea: user.opsArea || '',
    myActivity: user.myActivity === true
  };
}

function renderAccessReadout() {
  if (!state.accessDraft) return;
  var perms = permissionsForRole(state.accessDraft.role);
  var seeParts = [describeVisibility(perms)];
  if (state.accessDraft.opsArea) seeParts.push('Bakery Reports limited to ' + state.accessDraft.opsArea);
  if (state.accessDraft.myActivity) seeParts.push('their My Activity hub');

  if (userAccessSee) userAccessSee.textContent = seeParts.join(' · ');
  if (userAccessEdit) userAccessEdit.textContent = describeEditing(perms);
  if (userAccessTeam) {
    var scope = perms.teamScope;
    userAccessTeam.textContent = scope === 'none'
      ? 'No team view'
      : teamScopeLabel(scope) + (scope === 'direct'
        ? ' (' + formatCount(directReportCount(state.accessUserUid), 'person', 'people') + ' reporting in)'
        : '');
  }
}

function directReportCount(uid) {
  var api = teamApi();
  if (!api || !uid) return 0;
  return api.teamUnder(uid, state.users).length;
}

function openAccessModal(uid) {
  var user = findUser(uid);
  if (!user || !userAccessModal) return;
  var isCurrent = currentUserId() === uid;
  var editable = canEdit('users') && !isCurrent;

  state.accessUserUid = uid;
  state.accessDraft = accessDraftFor(user);
  clearMessage(userAccessMsg);

  if (userAccessTitle) userAccessTitle.textContent = userLabel(user);
  if (userAccessEmail) userAccessEmail.textContent = user.email || 'No email on record';
  if (userAccessSelfNote) userAccessSelfNote.hidden = !isCurrent;
  if (userAccessFirstName) {
    userAccessFirstName.value = state.accessDraft.firstName;
    userAccessFirstName.disabled = !canEdit('users');
  }
  if (userAccessLastName) {
    userAccessLastName.value = state.accessDraft.lastName;
    userAccessLastName.disabled = !canEdit('users');
  }

  if (userAccessRole) {
    userAccessRole.innerHTML = roleOptionsHtml(state.accessDraft.role);
    userAccessRole.disabled = !editable;
  }
  if (userAccessManager) {
    userAccessManager.innerHTML = managerOptionsHtml(uid, state.accessDraft.managerUid);
    userAccessManager.disabled = !editable;
  }
  if (userAccessOps) {
    userAccessOps.innerHTML = opsAreaOptionsHtml(state.accessDraft.opsArea);
    userAccessOps.disabled = !editable;
  }
  // The feature switch stays live even on your own account: role and reporting
  // line lock themselves so an admin cannot demote or orphan themselves, but a
  // switch that only reveals your own work is safe to flip on yourself — and
  // with a single admin account, nobody else could ever turn it on.
  if (userAccessMyActivity) {
    userAccessMyActivity.checked = state.accessDraft.myActivity;
    userAccessMyActivity.disabled = !canEdit('users');
  }

  var status = userStatus(user);
  if (userAccessStatusNote) userAccessStatusNote.textContent = status.note;
  if (userAccessResetPw) {
    var invitation = user.invitation || {};
    var isInvite = invitation.status === 'pending' || invitation.status === 'delivery_failed';
    userAccessResetPw.textContent = isInvite ? 'Resend invitation' : 'Reset password';
    userAccessResetPw.hidden = !canEdit('users') || isCurrent;
  }
  if (userAccessRemove) userAccessRemove.hidden = !editable;
  if (userAccessSave) userAccessSave.hidden = !canEdit('users');

  renderAccessReadout();
  userAccessModal.style.display = 'flex';
}

function closeAccessModal() {
  state.accessUserUid = null;
  state.accessDraft = null;
  if (userAccessModal) userAccessModal.style.display = 'none';
}

// ── Role editor ──
// One grid, two columns. Every capability in the app is a row that knows how to
// read and write itself (ACCESS_ROWS in js/permissions.js), so this builds the
// whole thing without knowing which of the stored sub-objects a row lives in.
function buildRoleAccessGrid() {
  if (!roleAccessGrid) return;
  roleAccessGrid.innerHTML = ACCESS_GROUPS.map(function(group) {
    var rows = accessRowsForGroup(group.key).map(function(row) {
      var editCell = row.editable
        ? '<label class="access-grid__cell">'
          + '<input type="checkbox" data-access-edit="' + escapeHtml(row.key) + '">'
          + '<span class="sr-only">' + escapeHtml(row.editLabel || 'Make changes') + '</span>'
          + '</label>'
        : '<span class="access-grid__cell access-grid__cell--empty" aria-hidden="true">&mdash;</span>';
      return '<div class="access-grid__row">'
        + '<div class="access-grid__label">'
        + '<strong>' + escapeHtml(row.label) + '</strong>'
        + (row.description ? '<span>' + escapeHtml(row.description) + '</span>' : '')
        + (row.editable && row.editLabel ? '<span class="access-grid__edit-hint">Edit: ' + escapeHtml(row.editLabel) + '</span>' : '')
        + '</div>'
        + '<label class="access-grid__cell">'
        + '<input type="checkbox" data-access-see="' + escapeHtml(row.key) + '">'
        + '<span class="sr-only">Can see ' + escapeHtml(row.label) + '</span>'
        + '</label>'
        + editCell
        + '</div>';
    }).join('');

    return '<div class="access-grid__group">'
      + '<div class="access-grid__group-head">'
      + '<h4>' + escapeHtml(group.label) + '</h4>'
      + '<p>' + escapeHtml(group.description) + '</p>'
      + '</div>'
      + '<div class="access-grid__head">'
      + '<span></span><span>Can see</span><span>Can edit</span>'
      + '</div>'
      + rows
      + '</div>';
  }).join('');

  if (roleTeamScope) {
    roleTeamScope.innerHTML = TEAM_SCOPES.map(function(scope) {
      return '<label class="access-team__option">'
        + '<input type="radio" name="roleTeamScope" value="' + escapeHtml(scope.key) + '"'
        + (scope.key === 'none' ? ' checked' : '') + '>'
        + '<span class="access-team__option-body">'
        + '<strong>' + escapeHtml(scope.label) + '</strong>'
        + '<span>' + escapeHtml(scope.description) + '</span>'
        + '</span>'
        + '</label>';
    }).join('');
  }
}

function setRoleGridValues(permissions) {
  if (!roleAccessGrid) return;
  var grid = readAccessGrid(permissions);
  Object.keys(grid).forEach(function(key) {
    var seeBox = roleAccessGrid.querySelector('[data-access-see="' + key + '"]');
    var editBox = roleAccessGrid.querySelector('[data-access-edit="' + key + '"]');
    if (seeBox) seeBox.checked = grid[key].see;
    if (editBox) editBox.checked = grid[key].edit;
  });
  var scope = normalizeTeamScope(normalizePermissions(permissions).teamScope);
  var radio = roleTeamScope && roleTeamScope.querySelector('[value="' + scope + '"]');
  if (radio) radio.checked = true;
}

function collectRoleGridValues() {
  var grid = {};
  ACCESS_ROWS_ALL().forEach(function(row) {
    var seeBox = roleAccessGrid && roleAccessGrid.querySelector('[data-access-see="' + row.key + '"]');
    var editBox = roleAccessGrid && roleAccessGrid.querySelector('[data-access-edit="' + row.key + '"]');
    grid[row.key] = { see: !!(seeBox && seeBox.checked), edit: !!(editBox && editBox.checked) };
  });
  var checkedScope = roleTeamScope && roleTeamScope.querySelector('[name="roleTeamScope"]:checked');
  return permissionsFromAccessGrid(grid, checkedScope ? checkedScope.value : 'none');
}

function ACCESS_ROWS_ALL() {
  return ACCESS_GROUPS.reduce(function(all, group) {
    return all.concat(accessRowsForGroup(group.key));
  }, []);
}

// Edit implies see, and unticking see takes edit with it — the stored levels
// cannot express "can change it but cannot look at it", and it would be a lie
// if they could.
function syncAccessGridPair(changed) {
  var key = changed.dataset.accessSee || changed.dataset.accessEdit;
  if (!key) return;
  var seeBox = roleAccessGrid.querySelector('[data-access-see="' + key + '"]');
  var editBox = roleAccessGrid.querySelector('[data-access-edit="' + key + '"]');
  if (!seeBox || !editBox) return;
  if (changed === editBox && editBox.checked) seeBox.checked = true;
  if (changed === seeBox && !seeBox.checked) editBox.checked = false;
}

function openRoleEditor(roleId) {
  if (!roleEditorModal) return;
  var role = roleId ? state.roles[roleId] : null;
  state.editingRoleId = role ? roleId : null;
  clearMessage(roleEditorMsg);

  if (roleForm) roleForm.reset();
  roleNameInput.value = role ? (role.name || '') : '';
  roleDescInput.value = role ? (role.description || '') : '';
  setRoleGridValues(role ? role.permissions : BUILTIN_ROLES.viewer.permissions);

  var assigned = role ? roleUserCount(roleId) : 0;
  if (roleEditorTitle) roleEditorTitle.textContent = role ? 'Edit ' + (role.name || roleId) : 'New role';
  if (roleEditorHint) {
    roleEditorHint.textContent = role
      ? 'Changes apply to everyone holding this role — ' + formatCount(assigned, 'person', 'people') + ' right now — the next time they load a page.'
      : 'Tick what this role can see, then what it can change. Edit always includes seeing.';
  }
  if (roleSubmitBtn) roleSubmitBtn.textContent = role ? 'Save role' : 'Create role';
  if (roleEditorDelete) roleEditorDelete.hidden = !role;

  roleEditorModal.style.display = 'flex';
  if (roleNameInput) roleNameInput.focus();
}

function closeRoleEditor() {
  state.editingRoleId = null;
  if (roleEditorModal) roleEditorModal.style.display = 'none';
  clearMessage(roleEditorMsg);
}

function renderRoles() {
  if (!roleList) return;
  var editable = canEdit('users');
  roleList.innerHTML = allRolesList().map(function(role) {
    var perms = normalizePermissions(role.def.permissions);
    var assigned = roleUserCount(role.id);
    var pillClass = role.id === 'admin' ? 'admin-pill admin-pill--admin' : 'admin-pill';
    var actionsHtml;
    if (role.builtIn) {
      actionsHtml = '<div class="admin-status-note">Built in &mdash; locked</div>';
    } else if (!editable) {
      actionsHtml = '<div class="admin-status-note">View only</div>';
    } else {
      actionsHtml = '<div class="admin-table__actions">'
        + '<button type="button" class="admin-inline-btn" data-action="edit-role" data-role="' + escapeHtml(role.id) + '">Edit</button>'
        + '</div>';
    }
    return '<tr>'
      + '<td><div class="admin-table__title"><span class="' + pillClass + '">' + escapeHtml(role.def.name || role.id) + '</span></div>'
      + (role.def.description ? '<div class="admin-status-note">' + escapeHtml(role.def.description) + '</div>' : '')
      + '</td>'
      + '<td><div class="admin-status-note">' + escapeHtml(describeVisibility(perms)) + '</div></td>'
      + '<td><div class="admin-status-note">' + escapeHtml(describeEditing(perms)) + '</div></td>'
      + '<td><div class="admin-status-note">' + escapeHtml(teamScopeLabel(perms.teamScope)) + '</div></td>'
      + '<td>' + formatCount(assigned, 'person', 'people') + '</td>'
      + '<td>' + actionsHtml + '</td>'
      + '</tr>';
  }).join('');
}

async function saveRoleFromForm() {
  var name = roleNameInput.value.trim();
  if (!name) {
    setMessage(roleEditorMsg, 'error', 'Give the role a name.');
    return;
  }

  var permissions = collectRoleGridValues();
  var hasTab = DASHBOARD_TABS.some(function(tab) { return permissions.tabs[tab.key]; });
  var hasArea = ADMIN_AREAS.some(function(area) { return permissions.admin[area.key] !== 'none'; });
  if (!hasTab && !hasArea && permissions.teamScope === 'none') {
    setMessage(roleEditorMsg, 'error', 'This role cannot see or do anything yet — tick at least one thing it can reach.');
    return;
  }

  var editingId = state.editingRoleId;
  var roleId = editingId || slugifyRoleId(name);

  if (!editingId) {
    if (!roleId || BUILTIN_ROLES[roleId]) {
      setMessage(roleMsg, 'error', '"' + name + '" clashes with a built-in role. Pick a different name.');
      return;
    }
    if (state.roles[roleId]) {
      setMessage(roleEditorMsg, 'error', 'A role called "' + (state.roles[roleId].name || roleId) + '" already exists. Edit that one instead.');
      return;
    }
  } else {
    // Renaming is fine, but block a rename onto another existing role's name.
    var clash = allRolesList().find(function(role) {
      return role.id !== editingId && String(role.def.name || '').trim().toLowerCase() === name.toLowerCase();
    });
    if (clash) {
      setMessage(roleEditorMsg, 'error', 'Another role is already called "' + name + '".');
      return;
    }
  }

  roleSubmitBtn.disabled = true;
  try {
    var existing = editingId ? state.roles[editingId] : null;
    await set(ref(db, 'roles/' + roleId), {
      name: name,
      description: roleDescInput.value.trim(),
      permissions: permissions,
      createdAt: existing && existing.createdAt ? existing.createdAt : nowIso(),
      updatedAt: nowIso(),
      updatedBy: currentUserEmail()
    });
    closeRoleEditor();
    setMessage(roleMsg, 'success', (editingId ? 'Updated' : 'Created') + ' the "' + name + '" role.'
      + (editingId ? ' Everyone holding it gets the new access on their next page load.' : ' Assign it to someone from the People table.'));
  } catch (err) {
    console.error('Failed to save role:', err);
    setMessage(roleEditorMsg, 'error', 'Could not save this role: ' + err.message);
  } finally {
    roleSubmitBtn.disabled = false;
  }
}

async function deleteRole(roleId) {
  var role = state.roles[roleId];
  if (!role) return;
  var assigned = roleUserCount(roleId);
  var confirmMsg = 'Delete the "' + (role.name || roleId) + '" role? This cannot be undone.';
  if (assigned) {
    confirmMsg = 'Delete the "' + (role.name || roleId) + '" role? '
      + formatCount(assigned, 'person', 'people') + ' currently holding it will drop back to Viewer. This cannot be undone.';
  }
  if (!confirm(confirmMsg)) return;
  try {
    await remove(ref(db, 'roles/' + roleId));
    if (assigned) {
      var userUpdates = state.users.filter(function(u) { return u.role === roleId; }).map(function(u) {
        return update(ref(db, 'users/' + u.uid), { role: 'viewer' });
      });
      await Promise.all(userUpdates);
    }
    if (state.editingRoleId === roleId) closeRoleEditor();
    if (assigned) {
      setMessage(roleMsg, 'success', 'Deleted the "' + (role.name || roleId) + '" role and dropped '
        + formatCount(assigned, 'person', 'people') + ' back to Viewer.');
    } else {
      setMessage(roleMsg, 'success', 'Deleted the "' + (role.name || roleId) + '" role.');
    }
  } catch (err) {
    console.error('Failed to delete role:', err);
    setMessage(roleMsg, 'error', 'Could not delete this role: ' + err.message);
  }
}

function renderDatalists() {
  var meta     = cloneMeta(state.siteMetaDraft);
  var regions  = [...new Set(Object.values(meta).map(function(e) { return e.r; }).filter(Boolean))].sort();
  var managers = [...new Set(Object.values(meta).map(function(e) { return e.o; }).filter(Boolean))].sort();
  regionList.innerHTML  = regions.map(function(r) { return '<option value="' + escapeHtml(r) + '">'; }).join('');
  managerList.innerHTML = managers.map(function(m) { return '<option value="' + escapeHtml(m) + '">'; }).join('');
}

function regionAssignmentOptionValue(user) {
  var name = userLabel(user);
  var email = user && user.email !== 'Unknown' ? String(user.email || '').trim() : '';
  return email ? name + ' — ' + email : name;
}

function renderRegionAssignmentPeople() {
  if (!regionAssignmentPeople) return;
  regionAssignmentPeople.innerHTML = state.users.map(function(user) {
    var detail = roleDisplayName(user.role);
    return '<option value="' + escapeHtml(regionAssignmentOptionValue(user)) + '">' +
      escapeHtml(detail) + '</option>';
  }).join('');
}

function resolveRegionAssignmentUser(value) {
  var wanted = String(value || '').trim().toLowerCase();
  if (!wanted) return null;
  var exact = state.users.filter(function(user) {
    var name = userLabel(user).toLowerCase();
    var email = String(user.email || '').trim().toLowerCase();
    var option = regionAssignmentOptionValue(user).toLowerCase();
    return wanted === option || wanted === email || wanted === name;
  });
  return exact.length === 1 ? exact[0] : null;
}

function regionAssignmentDisplayName(row, field) {
  var uid = row[field + 'Uid'];
  var user = uid && findUser(uid);
  return user ? userLabel(user) : (row[field] || '');
}

function renderRegionAssignments() {
  if (!regionAssignmentList) return;
  renderRegionAssignmentPeople();
  var rows = visibleRegionAssignments();
  var assignmentsComplete = rows.filter(function(row) {
    return !!(row.coffeePartner || row.coffeePartnerUid ||
      row.coffeeTrainer || row.coffeeTrainerUid);
  }).length;

  if (regionAssignmentMeta) {
    regionAssignmentMeta.textContent = rows.length + ' detected region'
      + (rows.length === 1 ? '' : 's')
      + ' \u2022 ' + assignmentsComplete + ' with team details'
      + (state.siteMetaDirty ? ' \u2022 unsaved changes' : ' \u2022 all changes saved');
  }

  if (!rows.length) {
    regionAssignmentList.innerHTML = '<tr><td colspan="3" class="admin-empty">Upload or add site data to detect regions.</td></tr>';
    return;
  }

  var assignmentsEditable = canEdit('sites');
  var inputDisabled = assignmentsEditable ? '' : ' disabled';
  regionAssignmentList.innerHTML = rows.map(function(row) {
    return '<tr>'
      + '<td><div class="admin-table__title">' + escapeHtml(row.region) + '</div></td>'
      + '<td><input type="text" value="' + escapeHtml(regionAssignmentDisplayName(row, 'coffeePartner')) + '"'
        + ' data-region="' + escapeHtml(row.region) + '" data-field="coffeePartner"'
        + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Type a person’s name"' + inputDisabled + '></td>'
      + '<td><input type="text" value="' + escapeHtml(regionAssignmentDisplayName(row, 'coffeeTrainer')) + '"'
        + ' data-region="' + escapeHtml(row.region) + '" data-field="coffeeTrainer"'
        + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Type a person’s name"' + inputDisabled + '></td>'
      + '</tr>';
  }).join('');
}

function renderOpsAreaAssignmentBakeries() {
  if (!opsAreaAssignmentBakeries) return;
  opsAreaAssignmentBakeries.innerHTML = Object.keys(state.siteMetaDraft || {})
    .sort(function(a, b) { return a.localeCompare(b); })
    .map(function(name) {
      var entry = state.siteMetaDraft[name] || {};
      var detail = [entry.o, entry.r].filter(Boolean).join(' • ');
      return '<option value="' + escapeHtml(name) + '">' + escapeHtml(detail) + '</option>';
    }).join('');
}

// The stored uid is what survives a rename in the people directory, so it wins
// over the name saved alongside it.
function opsAreaBaristaDisplayName(entry) {
  var user = entry.uid && findUser(entry.uid);
  return user ? userLabel(user) : (entry.name || '');
}

function opsAreaBaristaEntries(row) {
  var entries = (row && row.baristas) || [];
  // Always one row to type into, even before anyone has been named.
  return entries.length ? entries : [{ name: '', uid: '', homeBakery: '' }];
}

function opsAreaAssignmentsMetaText(rows, dirtyOverride) {
  var named = 0;
  var shared = 0;
  rows.forEach(function(row) {
    var withNames = ((row && row.baristas) || []).filter(function(entry) {
      return !!(entry.name || entry.uid);
    });
    if (withNames.length) named++;
    if (withNames.length > 1) shared++;
  });
  var isDirty = typeof dirtyOverride === 'boolean' ? dirtyOverride : state.siteMetaDirty;
  return rows.length + ' ops area' + (rows.length === 1 ? '' : 's')
    + ' • ' + named + ' with an area head barista'
    + (shared ? ' • ' + shared + ' with more than one' : '')
    + (isDirty ? ' • unsaved changes' : ' • all changes saved');
}

// Ops areas are listed under their region so the table reads the way the
// estate is actually organised, rather than as one flat alphabetical list.
function renderOpsAreaAssignments() {
  if (!opsAreaAssignmentList) return;
  renderRegionAssignmentPeople();
  renderOpsAreaAssignmentBakeries();
  var rows = visibleOpsAreaAssignments();

  if (opsAreaAssignmentMeta) {
    opsAreaAssignmentMeta.textContent = opsAreaAssignmentsMetaText(rows);
  }

  if (!rows.length) {
    opsAreaAssignmentList.innerHTML = '<tr><td colspan="4" class="admin-empty">Upload or add site data to detect ops areas.</td></tr>';
    return;
  }

  var assignmentsEditable = canEdit('sites');
  var inputDisabled = assignmentsEditable ? '' : ' disabled';
  var grouped = {};
  var regionOrder = [];
  rows.forEach(function(row) {
    var region = row.region || 'Unassigned region';
    if (!grouped[region]) {
      grouped[region] = [];
      regionOrder.push(region);
    }
    grouped[region].push(row);
  });

  opsAreaAssignmentList.innerHTML = regionOrder.map(function(region) {
    var groupRows = grouped[region];
    return '<tr class="admin-table__group-row">'
      + '<th scope="rowgroup" colspan="4">'
      + '<span>' + escapeHtml(region) + '</span>'
      + '<em>' + groupRows.length + ' ops area' + (groupRows.length === 1 ? '' : 's') + '</em>'
      + '</th>'
      + '</tr>'
      + groupRows.map(function(row) {
        var entries = opsAreaBaristaEntries(row);
        var opsAttrs = ' data-region="' + escapeHtml(row.region) + '"'
          + ' data-ops-area="' + escapeHtml(row.opsArea) + '"';
        // Shown only while the rename is still an unsaved change; once saved,
        // the new name is simply the name.
        var note = row.renamedFrom
          ? '<div class="admin-table__rename-note" title="These area head baristas came across with their bakeries.">'
            + 'Renamed from ' + escapeHtml(row.renamedFrom.opsArea) + '</div>'
          : '';

        return entries.map(function(entry, index) {
          var isFirst = index === 0;
          var isLast = index === entries.length - 1;
          var entryAttrs = opsAttrs + ' data-index="' + index + '"';
          var actions = '';
          if (assignmentsEditable) {
            actions += '<button type="button" class="admin-icon-btn" data-action="remove-barista"'
              + entryAttrs + ' aria-label="Remove this area head barista from '
              + escapeHtml(row.opsArea) + '" title="Remove this area head barista">&minus;</button>';
            if (isLast) {
              actions += '<button type="button" class="admin-icon-btn admin-icon-btn--add"'
                + ' data-action="add-barista"' + opsAttrs
                + ' aria-label="Add another area head barista to ' + escapeHtml(row.opsArea) + '"'
                + ' title="Add another area head barista">+</button>';
            }
          }

          return '<tr' + (isFirst ? '' : ' class="admin-table__row--continued"') + '>'
            + '<td>' + (isFirst
              ? '<div class="admin-table__title">' + escapeHtml(row.opsArea) + '</div>' + note
              : '<span class="sr-only">' + escapeHtml(row.opsArea) + '</span>') + '</td>'
            + '<td><input type="text" value="' + escapeHtml(opsAreaBaristaDisplayName(entry)) + '"'
              + entryAttrs + ' data-field="name"'
              + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Type a person’s name"' + inputDisabled + '></td>'
            + '<td><input type="text" value="' + escapeHtml(entry.homeBakery || '') + '"'
              + entryAttrs + ' data-field="homeBakery"'
              + ' list="opsAreaAssignmentBakeries" autocomplete="off" placeholder="Bakery they normally work at"' + inputDisabled + '></td>'
            + '<td class="admin-table__actions-cell">' + actions + '</td>'
            + '</tr>';
        }).join('');
      }).join('');
  }).join('');
}

function getVisibleSiteMeta() {
  var merged = cloneMeta(state.siteMetaDraft);
  var search = state.siteSearch.trim().toLowerCase();
  return Object.keys(merged).sort().filter(function(name) {
    if (!search) return true;
    var e = merged[name] || {};
    return name.toLowerCase().includes(search)
      || String(e.r || '').toLowerCase().includes(search)
      || String(e.o || '').toLowerCase().includes(search);
  }).map(function(name) { return { name: name, entry: merged[name] || { r: '', o: '' } }; });
}

function updateSiteTableMeta(count) {
  siteTableMeta.textContent = count + ' visible site' + (count === 1 ? '' : 's')
    + ' of ' + Object.keys(state.siteMetaDraft).length
    + (state.siteMetaDirty ? ' \u2022 unsaved changes' : ' \u2022 all changes saved');
}

function renderSites() {
  var rows = getVisibleSiteMeta();
  renderDatalists();
  updateSiteTableMeta(rows.length);
  if (!rows.length) {
    siteList.innerHTML = '<tr><td colspan="4" class="admin-empty">No sites match the current search.</td></tr>';
    return;
  }
  var sitesEditable = canEdit('sites');
  var siteInputDis = sitesEditable ? '' : ' disabled';
  siteList.innerHTML = rows.map(function(row) {
    return '<tr>'
      + '<td><div class="admin-table__title">' + window.GAILS.bakeryProfileLink(row.name, {
        returnUrl: 'admin.html#sites',
        returnLabel: 'Site Data'
      }) + '</div></td>'
      + '<td><input type="text" value="' + escapeHtml(row.entry.r || '') + '" list="adminRegionList"  data-site="' + escapeHtml(row.name) + '" data-field="r" placeholder="Region"' + siteInputDis + '></td>'
      + '<td><input type="text" value="' + escapeHtml(row.entry.o || '') + '" list="adminManagerList" data-site="' + escapeHtml(row.name) + '" data-field="o" placeholder="Ops area"' + siteInputDis + '></td>'
      + '<td>' + (sitesEditable
          ? '<div class="admin-table__actions"><button type="button" class="admin-inline-danger" data-action="remove-site" data-site="' + escapeHtml(row.name) + '">Remove</button></div>'
          : '<div class="admin-status-note">View only</div>')
      + '</td>'
      + '</tr>';
  }).join('');
}

function renderDataControls() {
  var s = buildSummaryStats();
  dataGrid.innerHTML = [
    { label: 'Shared Workbook',          value: s.recordCount ? s.recordCount + ' records'   : 'No shared data',        meta: s.monthCount ? s.monthCount + ' synced month' + (s.monthCount === 1 ? '' : 's') : 'Upload needed' },
    { label: 'Last Sync',                value: s.updatedAt ? formatDate(s.updatedAt)         : 'Not synced yet',        meta: s.updatedBy ? 'Updated by ' + s.updatedBy : 'No sync activity recorded' },
    { label: 'Current Browser Session',  value: 'Admin page — no session data',                                         meta: 'Go to the dashboard to load or upload data.' },
    { label: 'Site Metadata',            value: Object.keys(state.siteMetaDraft).length + ' mapped bakeries',           meta: state.siteMetaDirty ? 'Unsaved site edits pending' : 'Matches the shared portal data' }
  ].map(function(c) {
    return '<div class="admin-data-card">'
      + '<div class="admin-data-card__label">' + escapeHtml(c.label) + '</div>'
      + '<div class="admin-data-card__value">' + escapeHtml(c.value) + '</div>'
      + '<div class="admin-data-card__meta">'  + escapeHtml(c.meta)  + '</div>'
      + '</div>';
  }).join('');
}

// ── Routine visits ──
function formatVisitDate(isoDate) {
  if (!isoDate) return 'No date';
  var d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getVisibleVisits() {
  var search = state.visitSearch.trim().toLowerCase();
  var rows = state.visits.slice().sort(function(a, b) {
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
  if (!search) return rows;
  return rows.filter(function(v) {
    return String(v.bakery || '').toLowerCase().includes(search)
      || (window.GAILS.Mentions
        ? window.GAILS.Mentions.toText(v.coffeePartner).toLowerCase().includes(search)
        : String(v.coffeePartner || '').toLowerCase().includes(search))
      || (window.GAILS.Mentions
        ? window.GAILS.Mentions.formatPeople(window.GAILS.Mentions.toAssigneeList(v.assignedTo)).toLowerCase().includes(search)
        : false)
      || String(v.auditorName || '').toLowerCase().includes(search)
      || String(v.mod || '').toLowerCase().includes(search);
  });
}

function updateVisitTableMeta(count) {
  visitTableMeta.textContent = count + ' visible visit' + (count === 1 ? '' : 's')
    + ' of ' + state.visits.length + ' logged';
}

function renderVisits() {
  var rows = getVisibleVisits();
  updateVisitTableMeta(rows.length);

  if (!rows.length) {
    visitList.innerHTML = '<tr><td colspan="6" class="admin-empty">No visits logged yet. Submit the Routine Coffee Visit form to see records here.</td></tr>';
    return;
  }

  visitList.innerHTML = rows.map(function(v) {
    var scoreText = '—';
    if (v.type === 'siteVisit') {
      scoreText = '';
    } else if (v.type === 'cqv') {
      scoreText = (v.overallPct != null) ? v.overallPct + '%' : '—';
    } else if (v.type === 'nbo') {
      // Derived percentage — NBO PDFs print no score and get no RAG band.
      scoreText = window.GAILS.NBOShared.pctText(v);
    } else {
      scoreText = (v.score != null && v.score !== '') ? (v.score + (v.scoreMax ? ' / ' + v.scoreMax : '')) : '—';
    }
    var isSiteVisit = v.type === 'siteVisit';
    var isCqv = v.type === 'cqv';
    var isNbo = v.type === 'nbo';
    var importedAssignees = (isCqv || isNbo) && window.GAILS.Mentions
      ? window.GAILS.Mentions.toAssigneeList(v.assignedTo)
      : [];
    var importedPartnerHtml = importedAssignees.length && window.GAILS.Mentions
      ? window.GAILS.Mentions.formatSelectionHtml(window.GAILS.Mentions.formatPeople(importedAssignees))
      : escapeHtml(v.auditorName || '—');
    var typeBadge = isCqv
      ? '<span class="admin-table-badge admin-table-badge--cqv">' + (v.isFollowUp ? 'CQV Follow-Up' : 'CQV') + '</span>'
      : isNbo
        ? '<span class="admin-table-badge admin-table-badge--nbo">NBO Visit ' + escapeHtml(v.visitNumber || 1) + '</span>'
        : isSiteVisit
          ? '<span class="admin-table-badge admin-table-badge--adhoc">' + escapeHtml(siteVisitKindLabel(v)) + '</span>'
          : '<span class="admin-table-badge admin-table-badge--routine">Routine</span>';

    return '<tr>'
      + '<td>' + escapeHtml(formatVisitDate(v.date)) + '</td>'
      + '<td><div class="admin-table__title-cell">'
      + '  <div class="admin-table__title">' + (v.bakery
        ? window.GAILS.bakeryProfileLink(v.bakery, {
          returnUrl: 'admin.html#visits',
          returnLabel: 'Bakery Visits'
        })
        : escapeHtml('Unknown')) + '</div>'
      + '  ' + typeBadge
      + '</div></td>'
      + '<td>' + ((isCqv || isNbo)
        ? importedPartnerHtml
        : (v.coffeePartner && window.GAILS.Mentions
          ? window.GAILS.Mentions.formatSelectionHtml(v.coffeePartner)
          : escapeHtml(v.coffeePartner || '—'))) + '</td>'
      + '<td>' + escapeHtml(scoreText) + '</td>'
      + '<td>' + escapeHtml(v.mod || '—') + '</td>'
      + '<td><div class="admin-table__actions admin-table__actions--icons">'
      + '<button type="button" class="admin-icon-btn" data-action="view-visit" data-id="' + escapeHtml(v.id) + '" title="View / Edit" aria-label="View / Edit">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>'
      + '</button>'
      + (canEdit('visits')
          ? '<button type="button" class="admin-icon-btn admin-icon-btn--danger" data-action="remove-visit" data-id="' + escapeHtml(v.id) + '" title="Delete" aria-label="Delete">'
          +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
          + '</button>'
          : '')
      + '</div></td>'
      + '</tr>';
  }).join('');
}

// ── CQV (Coffee Quality Visit) PDF import ──
// admin.html never loads js/app.js/js/state.js (that's what populates
// window.GAILS.state.BAKERIES from the uploaded Excel dataset), so that list
// is always empty here. state.siteMetaDraft — the site directory synced from
// portalData/siteMeta and already used to drive the Sites panel — is the
// bakery list that's actually available on this page.
function cqvBakeryList() {
  return Object.keys(state.siteMetaDraft || {});
}

function guessBakeryMatch(parsedName) {
  var bakeries = cqvBakeryList();
  if (!parsedName || !bakeries.length) return '';
  var needle = parsedName.trim().toLowerCase();
  var exact = bakeries.find(function(b) { return b.toLowerCase() === needle; });
  if (exact) return exact;
  var contains = bakeries.find(function(b) {
    return b.toLowerCase().indexOf(needle) !== -1 || needle.indexOf(b.toLowerCase()) !== -1;
  });
  return contains || '';
}

function bakeryOptionsHtml(selected) {
  var bakeries = cqvBakeryList().sort();
  return '<option value="">Select a bakery&hellip;</option>' + bakeries.map(function(b) {
    return '<option value="' + escapeHtml(b) + '" ' + (b === selected ? 'selected' : '') + '>' + escapeHtml(b) + '</option>';
  }).join('');
}

function cqvSummaryHtml(record, warnings) {
  var lines = [];
  if (record.isFollowUp) {
    lines.push('<span style="color:var(--gold);">Detected as a follow-up CQV</span> (reissued after a previous visit scored poorly).');
  }
  if (record.overallPct != null) {
    var band = cqvBand(record);
    var bandColor = cqvBandColor(band);
    lines.push('<strong>' + escapeHtml(record.overallPct) + '%</strong>'
      + (band ? ' <span style="color:' + bandColor + '; font-weight:700;">(' + escapeHtml(band) + ')</span>' : '')
      + (record.score != null ? ' &mdash; ' + escapeHtml(record.score) + ' / ' + escapeHtml(record.scoreMax) : ''));
  }
  if (record.criticalFail) {
    lines.push('<span style="color:#B22A24;">&#9888; Rated Red: a zero-tolerance Critical question failed</span>' +
      (record.printedBand && record.printedBand !== 'Red' ? ' (overrides the ' + escapeHtml(record.printedBand) + ' shown in the PDF header).' : '.'));
  }
  if (record.auditorName) {
    lines.push('Auditor: <strong>' + escapeHtml(record.auditorName) + '</strong>');
  }
  var sectionNames = Object.keys(record.sectionScores || {});
  if (sectionNames.length) {
    lines.push('Sections: ' + sectionNames.map(function(s) {
      return escapeHtml(s) + ' ' + escapeHtml(record.sectionScores[s].pct) + '%';
    }).join(', '));
  }
  lines.push(record.questions.length + ' question' + (record.questions.length === 1 ? '' : 's') + ' parsed, '
    + record.actionPlan.length + ' action item' + (record.actionPlan.length === 1 ? '' : 's') + '.');
  if (warnings && warnings.length) {
    lines.push('<span style="color:var(--gold);">' + warnings.length + ' item' + (warnings.length === 1 ? '' : 's')
      + ' couldn\'t be fully parsed &mdash; the original PDF stays attached as the source of truth.</span>');
  }
  return lines.map(function(l) { return '<div>' + l + '</div>'; }).join('');
}

// An NBO Coffee Visit PDF prints no score of its own — the percentage shown
// here is derived from the Yes/No answers (see js/nbo-shared.js) and carries no
// RAG band, so it's stated plainly rather than colour-coded.
function nboSummaryHtml(record, warnings) {
  var counts = record.counts || {};
  var total = (record.questions || []).length;
  var coachingCount = (record.questions || []).filter(function(q) { return q.note; }).length;
  var lines = [];
  lines.push('<strong>NBO Coffee Visit ' + escapeHtml(record.visitNumber || 1) + '</strong> &mdash; '
    + '<strong>' + escapeHtml(window.GAILS.NBOShared.pctText(record)) + '</strong> (derived from the Yes/No answers; the PDF has no score of its own).');
  if (record.auditorName) {
    lines.push('Auditor: <strong>' + escapeHtml(record.auditorName) + '</strong>');
  }
  lines.push(total + ' question' + (total === 1 ? '' : 's') + ' parsed &mdash; '
    + '<span style="color:#1D9E5C; font-weight:700;">' + (counts.yes || 0) + ' Yes</span>, '
    + '<span style="color:#B22A24; font-weight:700;">' + (counts.no || 0) + ' No</span>'
    + (counts.na ? ', ' + counts.na + ' N/A' : '') + '.');
  lines.push(coachingCount + ' coaching note' + (coachingCount === 1 ? '' : 's') + ' captured.');
  if (warnings && warnings.length) {
    lines.push('<span style="color:var(--gold);">' + warnings.length + ' item' + (warnings.length === 1 ? '' : 's')
      + ' couldn\'t be fully parsed &mdash; the original PDF stays attached as the source of truth.</span>');
  }
  return lines.map(function(l) { return '<div>' + l + '</div>'; }).join('');
}

function openCqvConfirmModal(record, warnings, file) {
  var isNbo = record.type === 'nbo';
  state.cqvPending = { record: record, warnings: warnings || [], file: file };
  cqvConfirmBakery.innerHTML = bakeryOptionsHtml(guessBakeryMatch(record.bakery));
  cqvConfirmDate.value = record.date || '';
  if (cqvConfirmCoffeePartner) {
    var parsedPartner = window.GAILS.Mentions
      ? window.GAILS.Mentions.resolvePerson(record.auditorName)
      : null;
    cqvConfirmCoffeePartner.value = parsedPartner && window.GAILS.Mentions
      ? window.GAILS.Mentions.formatPeople([parsedPartner])
      : (record.auditorName || '');
    if (window.GAILS.MentionField) {
      window.GAILS.MentionField.enhance(cqvConfirmCoffeePartner);
      window.GAILS.MentionField.refresh(cqvConfirmCoffeePartner);
    }
  }
  if (cqvConfirmTitle) cqvConfirmTitle.textContent = isNbo ? 'Confirm NBO Visit Details' : 'Confirm CQV Details';
  cqvConfirmSubmitBtn.textContent = isNbo ? 'Save NBO Visit' : 'Save CQV';
  cqvConfirmSummary.innerHTML = isNbo ? nboSummaryHtml(record, warnings) : cqvSummaryHtml(record, warnings);
  if (warnings && warnings.length) {
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-info';
    cqvConfirmWarning.textContent = 'Some rows in this PDF weren\'t fully machine-readable. Scores shown above are still accurate — only a few question labels/notes may be incomplete.';
  } else {
    cqvConfirmWarning.style.display = 'none';
  }
  cqvConfirmModal.style.display = 'flex';
}

function closeCqvConfirmModal() {
  cqvConfirmModal.style.display = 'none';
  state.cqvPending = null;
}

async function handleCqvFile(file) {
  if (!file) return;
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    setMessage(cqvImportMsg, 'error', 'Please choose a PDF file exported from GoAudits.');
    return;
  }
  setMessage(cqvImportMsg, 'info', 'Reading ' + file.name + '…');
  if (cqvImportBrowseBtn) cqvImportBrowseBtn.disabled = true;
  try {
    var bytes = await readFileAsBytes(file);
    if (!window.GAILS.CQV || typeof window.GAILS.CQV.buildRecordFromPdf !== 'function'
        || !window.GAILS.NBO || typeof window.GAILS.NBO.buildRecordFromPdf !== 'function') {
      throw new Error('PDF parsers did not load. Refresh the page and try again.');
    }

    // Both report types come out of GoAudits and share the same text-layout
    // extraction, so the pages are read once and the title on the cover
    // decides which parser gets them. The user never has to say which it is.
    var pages = await window.GAILS.CQV.extractPageLines(bytes.buffer);
    var result;
    if (window.GAILS.NBO.looksLikeNboPdf(pages)) {
      result = window.GAILS.NBO.parsePages(pages);
      if (!result.record.questions.length) {
        throw new Error('This looks like an NBO Coffee Visit, but no questions could be read from it. Make sure it\'s the standard GoAudits export.');
      }
    } else {
      result = window.GAILS.CQV.parsePages(pages);
      if (result.record.overallPct == null && result.record.score == null && !result.record.questions.length) {
        throw new Error('Could not find any CQV score data in this PDF. Make sure it\'s the standard GoAudits CQV or NBO Coffee Visit export.');
      }
    }
    clearMessage(cqvImportMsg);
    openCqvConfirmModal(result.record, result.warnings, file);
  } catch (err) {
    console.error('Failed to parse visit PDF:', err);
    setMessage(cqvImportMsg, 'error', 'Could not read that PDF: ' + err.message);
  } finally {
    if (cqvImportBrowseBtn) cqvImportBrowseBtn.disabled = false;
    if (cqvImportInput) cqvImportInput.value = '';
    if (cqvImportZone) cqvImportZone.classList.remove('drag-over');
  }
}

function missingCqvAuditorVisits() {
  return state.visits.filter(function(visit) {
    return visit.type === 'cqv' && !String(visit.auditorName || '').trim() && visit.pdfUrl;
  });
}

function updateCqvBackfillButton() {
  if (!cqvBackfillAuditorsBtn) return;
  var count = missingCqvAuditorVisits().length;
  cqvBackfillAuditorsBtn.disabled = count === 0;
  cqvBackfillAuditorsBtn.textContent = count
    ? 'Update missing auditor names (' + count + ')'
    : 'Auditor names up to date';
}

async function backfillCqvAuditors() {
  var visits = missingCqvAuditorVisits();
  if (!visits.length || !cqvBackfillAuditorsBtn) return;

  cqvBackfillAuditorsBtn.disabled = true;
  var updated = 0;
  var notFound = 0;
  var failed = 0;
  setMessage(cqvImportMsg, 'info', 'Checking ' + visits.length + ' saved CQV PDF' + (visits.length === 1 ? '' : 's') + ' for auditor names…');

  // Parse sequentially to avoid downloading and decoding every stored PDF at
  // once on larger visit histories.
  for (var idx = 0; idx < visits.length; idx++) {
    var visit = visits[idx];
    try {
      var response = await fetch(visit.pdfUrl);
      if (!response.ok) throw new Error('PDF request returned ' + response.status);
      var result = await window.GAILS.CQV.buildRecordFromPdf(await response.arrayBuffer());
      var auditorName = String(result.record.auditorName || '').trim();
      if (!auditorName) {
        notFound++;
        continue;
      }
      var backfillPatch = {
        auditorName: auditorName,
        'meta/auditorBackfilledAt': nowIso(),
        'meta/auditorBackfilledBy': currentUserEmail()
      };
      // Recovering the name is also the moment the report can be credited.
      var backfilledAuditor = window.GAILS.Mentions
        ? window.GAILS.Mentions.resolvePerson(auditorName)
        : null;
      if (backfilledAuditor && !visit.assignedTo) backfillPatch.assignedTo = [backfilledAuditor];
      await update(ref(db, 'routineVisits/' + visit.id), backfillPatch);
      updated++;
    } catch (err) {
      failed++;
      console.error('Could not backfill auditor for CQV ' + visit.id + ':', err);
    }
  }

  var detail = updated + ' auditor name' + (updated === 1 ? '' : 's') + ' updated.';
  if (notFound) detail += ' ' + notFound + ' could not be found in the attached PDF.';
  if (failed) detail += ' ' + failed + ' PDF' + (failed === 1 ? '' : 's') + ' could not be read.';
  setMessage(cqvImportMsg, failed ? 'error' : 'success', detail);
  updateCqvBackfillButton();
}

async function saveCqvRecord() {
  var pending = state.cqvPending;
  if (!pending) return;

  var bakery = cqvConfirmBakery.value;
  var date = cqvConfirmDate.value;
  if (!bakery || !date) {
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-error';
    cqvConfirmWarning.textContent = 'Choose a bakery and a visit date before saving.';
    return;
  }

  var attributionText = String(cqvConfirmCoffeePartner && cqvConfirmCoffeePartner.value || '').trim();
  var selectedPartners = resolveEditedAssignees(attributionText);
  var parsedAuditorName = String(pending.record.auditorName || '').trim();
  if (attributionText && !selectedPartners.length &&
      attributionText.toLowerCase() !== parsedAuditorName.toLowerCase()) {
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-error';
    cqvConfirmWarning.textContent = 'Choose the Coffee Partner from the name suggestions before saving.';
    return;
  }

  // NBO Visit 1 and Visit 2 are distinct reports, so a duplicate is only a
  // duplicate when the visit number matches too — otherwise saving Visit 2
  // after Visit 1 on the same day would be blocked.
  var isNbo = pending.record.type === 'nbo';
  var typeLabel = isNbo ? ('NBO Coffee Visit ' + (pending.record.visitNumber || 1)) : 'CQV';
  var duplicate = state.visits.find(function(v) {
    if (v.bakery !== bakery || v.date !== date) return false;
    if (isNbo) return v.type === 'nbo' && (v.visitNumber || 1) === (pending.record.visitNumber || 1);
    return v.type === 'cqv';
  });
  if (duplicate) {
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-error';
    cqvConfirmWarning.textContent = 'A ' + typeLabel + ' for ' + bakery + ' on ' + formatVisitDate(date) + ' is already saved. Delete that record first if you need to replace it.';
    return;
  }

  cqvConfirmSubmitBtn.disabled = true;
  var originalText = cqvConfirmSubmitBtn.textContent;
  cqvConfirmSubmitBtn.textContent = 'Saving…';

  try {
    var newRef = push(ref(db, 'routineVisits'));
    var pathSafeBakery = bakery.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var storagePath = (isNbo ? 'nboPdfs/' : 'cqvPdfs/') + pathSafeBakery + '/' + newRef.key + '-' + pending.file.name.replace(/[^a-z0-9.\-]+/gi, '_');
    var fileRef = storageRef(storage, storagePath);

    var bytes = await readFileAsBytes(pending.file);
    await uploadBytes(fileRef, bytes, { contentType: 'application/pdf' });
    var pdfUrl = await getDownloadURL(fileRef);

    var nowIsoStr = nowIso();
    // The PDF auditor is the default attribution. A Coffee Partner selected in
    // the confirmation modal takes precedence without changing the source name
    // parsed from the PDF.
    var auditor = window.GAILS.Mentions
      ? window.GAILS.Mentions.resolvePerson(pending.record.auditorName)
      : null;
    var attributedPartners = selectedPartners.length
      ? selectedPartners
      : (auditor ? [auditor] : []);

    var record = Object.assign({}, pending.record, {
      bakery: bakery,
      date: date,
      pdfUrl: pdfUrl,
      pdfPath: storagePath,
      pdfFileName: pending.file.name,
      assignedTo: attributedPartners.length ? attributedPartners : null,
      meta: {
        source: 'pdf-import',
        createdAt: nowIsoStr,
        // The importer is recorded separately from the auditor so a report is
        // never credited to whoever happened to upload the file.
        importedBy: currentUserEmail(),
        updatedAt: nowIsoStr,
        updatedBy: currentUserEmail()
      }
    });

    await set(newRef, record);
    closeCqvConfirmModal();
    setMessage(visitMsg, 'success', 'Saved ' + typeLabel + ' for ' + bakery + ' on ' + formatVisitDate(date) + '.');
  } catch (err) {
    console.error('Failed to save visit PDF:', err);
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-error';
    cqvConfirmWarning.textContent = 'Could not save this ' + typeLabel + ': ' + err.message;
  } finally {
    cqvConfirmSubmitBtn.disabled = false;
    cqvConfirmSubmitBtn.textContent = originalText;
  }
}

function ynnaOptionsHtml(value) {
  var options = ['Yes', 'No', 'N/A'];
  return options.map(function(opt) {
    return '<option value="' + opt + '" ' + (value === opt ? 'selected' : '') + '>' + opt + '</option>';
  }).join('') + (options.indexOf(value) === -1 ? '<option value="" selected>—</option>' : '');
}

function scaleOptionsHtml(value) {
  var out = '';
  for (var i = 1; i <= 10; i++) {
    out += '<option value="' + i + '" ' + (Number(value) === i ? 'selected' : '') + '>' + i + '</option>';
  }
  if (value == null || value === '') out += '<option value="" selected>—</option>';
  return out;
}

// NBO Coffee Visit 1 and 2 are NOT site-visit kinds — they arrive as PDF
// imports (type: 'nbo', see js/nbo-parser.js), not as manually logged
// check-ins, so they're deliberately absent from this list.
var SITE_VISIT_KIND_LABELS = {
  checkin: 'Check-in',
  nboOpening: 'NBO: Opening'
};

function siteVisitKindLabel(v) {
  return SITE_VISIT_KIND_LABELS[v.visitKind] || 'Check-in';
}

function siteVisitKindOptionsHtml(value) {
  var kind = SITE_VISIT_KIND_LABELS[value] ? value : 'checkin';
  return Object.keys(SITE_VISIT_KIND_LABELS).map(function(key) {
    return '<option value="' + key + '" ' + (kind === key ? 'selected' : '') + '>' + SITE_VISIT_KIND_LABELS[key] + '</option>';
  }).join('');
}

function fieldInputHtml(sectionKey, field, value) {
  var dataAttrs = 'data-section="' + escapeHtml(sectionKey || '') + '" data-field="' + escapeHtml(field.key) + '" data-type="' + escapeHtml(field.type) + '"'
    + (canEdit('visits') ? '' : ' disabled');
  var wide = (field.type === 'textarea' || field.type === 'photos') ? ' admin-form-field--wide' : '';
  var input;

  if (field.type === 'ynna') {
    input = '<select ' + dataAttrs + '>' + ynnaOptionsHtml(value) + '</select>';
  } else if (field.type === 'scale') {
    input = '<select ' + dataAttrs + '>' + scaleOptionsHtml(value) + '</select>';
  } else if (field.type === 'siteVisitKind') {
    input = '<select ' + dataAttrs + '>' + siteVisitKindOptionsHtml(value) + '</select>';
  } else if (field.type === 'textarea') {
    input = '<textarea rows="2" ' + dataAttrs + '>' + escapeHtml(value || '') + '</textarea>';
  } else if (field.type === 'photos') {
    var urls = Array.isArray(value) ? value.join(', ') : (value || '');
    input = '<textarea rows="2" placeholder="Comma-separated photo URLs" ' + dataAttrs + '>' + escapeHtml(urls) + '</textarea>';
  } else if (field.type === 'number') {
    input = '<input type="number" value="' + escapeHtml(value != null ? value : '') + '" ' + dataAttrs + '>';
  } else if (field.type === 'date') {
    input = '<input type="date" value="' + escapeHtml(value || '') + '" ' + dataAttrs + '>';
  } else if (field.type === 'time') {
    input = '<input type="time" value="' + escapeHtml(value || '') + '" ' + dataAttrs + '>';
  } else if (field.key === 'coffeePartner' || field.type === 'person') {
    // Assignable: typing searches for a colleague. Enhanced into its two-face
    // editor by openVisitDetail once the markup is in the DOM.
    input = '<input type="text" value="' + escapeHtml(value || '') + '" autocomplete="off" data-mention-field ' + dataAttrs + '>'
      + '<small class="mention-field-hint">Choose a name, then press <strong>Space</strong> to add another. <strong>Backspace</strong> removes the last person.</small>';
  } else {
    input = '<input type="text" value="' + escapeHtml(value || '') + '" ' + dataAttrs + '>';
  }

  var photoLinks = '';
  if (field.type === 'photos' && Array.isArray(value) && value.length) {
    photoLinks = '<div class="visit-detail-photos">' + value.map(function(url) {
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener">Photo &#8599;</a>';
    }).join('') + '</div>';
  }

  return '<label class="admin-form-field' + wide + '"><span>' + escapeHtml(field.label) + '</span>' + input + '</label>' + photoLinks;
}

// Shared with the visit report modal — see js/cqv-shared.js. Declarations
// rather than const aliases: buildCqvSummaryHtml above calls cqvBand and
// cqvBandColor before this point, and relies on hoisting.
function cqvHasCriticalFail(visit) { return window.GAILS.CQVShared.hasCriticalFail(visit); }
function cqvBand(visit)            { return window.GAILS.CQVShared.band(visit); }
function cqvBandColor(band)        { return window.GAILS.CQVShared.bandColor(band); }
function cqvPriorityColor(priority){ return window.GAILS.CQVShared.priorityColor(priority); }
function cqvCriticalTag(label)     { return window.GAILS.CQVShared.criticalTag(label); }
function cqvLostPointItems(visit)  { return window.GAILS.CQVShared.lostPointItems(visit); }

function buildCqvDetailHtml(visit) {
  var sectionRows = Object.keys(visit.sectionScores || {}).map(function(name) {
    var s = visit.sectionScores[name];
    var isCritical = (s.code === 'CRTCL' || s.code === 'ALRG') || /^(critical|allergen)\b/i.test(name);
    var failing = s.pct < 70 || (isCritical && s.actual < s.target);
    return '<div class="visit-report-row' + (failing ? ' visit-report-row--flag' : '') + '">'
      + '<span class="visit-report-row__label">' + escapeHtml(name) + '</span>'
      + '<span class="visit-report-row__value' + (failing ? ' visit-report-row__value--flag' : ' visit-report-row__value--ok') + '">'
      + escapeHtml(s.actual) + ' / ' + escapeHtml(s.target) + ' (' + escapeHtml(s.pct) + '%)</span></div>';
  }).join('');
  var categoryRows = Object.keys(visit.categoryScores || {}).map(function(name) {
    var s = visit.categoryScores[name];
    var isCritical = (s.code === 'CRTCL' || s.code === 'ALRG') || /^(critical|allergen)\b/i.test(name);
    var failing = s.pct < 70 || (isCritical && s.actual < s.target);
    return '<div class="visit-report-row' + (failing ? ' visit-report-row--flag' : '') + '">'
      + '<span class="visit-report-row__label">' + escapeHtml(name) + '</span>'
      + '<span class="visit-report-row__value' + (failing ? ' visit-report-row__value--flag' : ' visit-report-row__value--ok') + '">'
      + escapeHtml(s.actual) + ' / ' + escapeHtml(s.target) + ' (' + escapeHtml(s.pct) + '%)</span></div>';
  }).join('');
  var actionPlanItems = visit.actionPlan;
  var actionPlanIsDerived = false;
  if ((!actionPlanItems || !actionPlanItems.length) && visit.isFollowUp) {
    actionPlanItems = cqvLostPointItems(visit);
    actionPlanIsDerived = actionPlanItems.length > 0;
  }
  var actionItemsHtml = (actionPlanItems || []).map(function(a) {
    var label = a.questionLabel || a.sectionPath || 'Action item';
    var dueDate = a.dueDate;
    
    // Clean up embedded due date in label if found
    var dueMatch = label.match(/\s*DUE\s*DATE\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\b/i);
    if (dueMatch) {
      if (!dueDate) dueDate = dueMatch[1];
      label = label.replace(dueMatch[0], '').trim();
    }

    // Clean up sectionPath to get sub-category only
    var cleanSection = a.sectionPath || '';
    if (cleanSection.indexOf('>>') !== -1) {
      cleanSection = cleanSection.split('>>').pop().trim();
    }

    var priorityColor = cqvPriorityColor(a.priority);
    var criticalTag = cqvCriticalTag(label);
    var metaHtml = '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; text-align:right;">'
      + (criticalTag
          ? '<span style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding:2px 8px; border-radius:99px; color:#fff; background:#B22A24; white-space:nowrap;">&#9888; ' + escapeHtml(criticalTag) + '</span>'
          : '')
      + (a.priority
          ? '<span style="font-size:0.66rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding:2px 8px; border-radius:99px;'
            + (priorityColor ? ' color:' + priorityColor + '; background:' + priorityColor + '26;' : ' color:var(--muted-l); background:rgba(34, 31, 26,0.06);')
            + '">' + escapeHtml(a.priority) + '</span>'
          : '')
      + '<span style="font-size:0.72rem; color:var(--muted-l); white-space:nowrap;">Due ' + escapeHtml(dueDate || '—') + '</span>'
      + '</div>';

    return '<div class="visit-detail-section" style="margin-top:10px; padding-bottom:10px; border-bottom:1px solid var(--card-border);' + (criticalTag ? ' border-left:3px solid #B22A24; padding-left:12px;' : '') + '">'
      + '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">'
      +   '<div style="min-width:0; flex:1;">'
      +     '<h4 style="font-size:0.85rem; margin:0; font-weight:700; color:var(--text);">' + escapeHtml(label) + '</h4>'
      +     (cleanSection ? '<div style="font-size:0.7rem; color:var(--muted-l); margin-top:2px;">' + escapeHtml(cleanSection) + '</div>' : '')
      +     (a.findings ? '<p style="font-size:0.82rem; color:var(--text-2); margin:8px 0 0;">' + escapeHtml(a.findings) + '</p>' : '')
      +     (a.actionRequired ? '<div style="font-size:0.82rem; color:var(--text); margin-top:8px; padding:6px 10px; background:var(--accent-light); border-left:3px solid var(--accent); border-radius:4px; line-height:1.4;">'
            + '<strong style="color:var(--accent);">Action required:</strong> ' + escapeHtml(a.actionRequired) + '</div>' : '')
      +   '</div>'
      +   metaHtml
      + '</div>'
      + '</div>';
  }).join('') || '<p class="visit-report-note">No action items were flagged on this visit.</p>';

  var basicFields = [
    { key: 'bakery', label: 'Bakery', type: 'text' },
    { key: 'date', label: 'Visit date', type: 'date' },
    { key: 'auditorName', label: 'PDF auditor', type: 'text' },
    { key: 'coffeePartnerAttribution', label: 'Coffee Partner attribution', type: 'person' }
  ];
  var basicHtml = basicFields.map(function(field) {
    return fieldInputHtml(null, field, visit[field.key]);
  }).join('');

  var pdfLinkHtml = visit.pdfUrl
    ? '<a class="btn" href="' + escapeHtml(visit.pdfUrl) + '" target="_blank" rel="noopener" style="text-decoration:none; display:inline-block;">View Original PDF &#8599;</a>'
    : '<p class="visit-report-note">No PDF is attached to this record.</p>';

  return '<div class="visit-detail-section"><h4>Details</h4><div class="visit-detail-grid">' + basicHtml + '</div></div>'
    + '<div class="visit-detail-section"><h4>Overall Score</h4>'
    + '<p style="font-size:1.4rem; font-weight:800; color:var(--text);">' + escapeHtml(visit.overallPct != null ? visit.overallPct + '%' : '—')
    + (cqvBand(visit) ? ' <span style="font-size:0.9rem; font-weight:700; color:' + cqvBandColor(cqvBand(visit)) + ';">(' + escapeHtml(cqvBand(visit)) + ')</span>' : '') + '</p>'
    + (cqvHasCriticalFail(visit)
        ? '<p style="font-size:0.82rem; color:#B22A24; font-weight:600;">&#9888; A Critical Point was lost.</p>'
        : '')
    + (visit.summary ? '<p class="visit-report-comment">' + escapeHtml(visit.summary) + '</p>' : '')
    + '</div>'
    + '<div class="visit-detail-section"><h4>Score by Section</h4>' + (sectionRows || '<p class="visit-report-note">Not parsed.</p>') + '</div>'
    + '<div class="visit-detail-section' + (cqvHasCriticalFail(visit) ? ' visit-detail-section--danger' : '') + '"><h4>Score by Category</h4>' + (categoryRows || '<p class="visit-report-note">Not parsed.</p>') + '</div>'
    + '<div class="visit-detail-section"><h4>Action Plan (' + (actionPlanItems || []).length + ')</h4>'
    + (actionPlanIsDerived ? '<p class="visit-report-note" style="margin-bottom:10px;">This follow-up report didn\'t include a written action plan &mdash; showing the questions that lost points instead.</p>' : '')
    + actionItemsHtml + '</div>'
    + '<div class="visit-detail-section"><h4>Original Report</h4>' + pdfLinkHtml + '</div>'
    + (canEdit('visits')
        ? '<div class="visit-detail-actions">'
        + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
        + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Details</button>'
        + '</div>'
        : '');
}

function buildNboDetailHtml(visit) {
  var basicFields = [
    { key: 'bakery', label: 'Bakery', type: 'text' },
    { key: 'date', label: 'Visit date', type: 'date' },
    { key: 'auditorName', label: 'PDF auditor', type: 'text' },
    { key: 'coffeePartnerAttribution', label: 'Coffee Partner attribution', type: 'person' }
  ];
  var basicHtml = basicFields.map(function(field) {
    return fieldInputHtml(null, field, visit[field.key]);
  }).join('');

  var questions = visit.questions || [];
  var sectionOrder = [];
  var bySection = {};
  questions.forEach(function(question) {
    var section = question.section || 'Questions';
    if (!bySection[section]) {
      bySection[section] = [];
      sectionOrder.push(section);
    }
    bySection[section].push(question);
  });

  var sectionsHtml = sectionOrder.map(function(section) {
    var rows = bySection[section].map(function(question) {
      var response = String(question.response || '').toUpperCase();
      var isNo = response === 'NO';
      var responseColor = isNo ? '#B22A24' : (response === 'YES' ? '#1D9E5C' : 'var(--muted-l)');
      return '<div class="visit-report-row-wrap" style="padding:12px 0; border-bottom:1px solid var(--card-border);">'
        + '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">'
        + '<div style="min-width:0; flex:1;">'
        + '<div style="font-weight:' + (isNo ? '700' : '600') + '; color:var(--text); font-size:0.9rem;">'
        + escapeHtml((question.qNum ? question.qNum + '. ' : '') + (question.label || 'Question')) + '</div>'
        + (question.note
          ? '<p style="font-size:0.85rem; color:var(--text-2); margin:8px 0 0; padding:6px 10px; background:var(--accent-light); border-radius:4px; line-height:1.4;">'
            + escapeHtml(question.note) + '</p>'
          : '')
        + '</div>'
        + '<span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding:2px 8px; border-radius:99px; white-space:nowrap; flex-shrink:0;'
        + ' color:' + responseColor + '; background:' + responseColor + '26;">' + escapeHtml(response || '—') + '</span>'
        + '</div></div>';
    }).join('');
    var noCount = bySection[section].filter(function(question) {
      return String(question.response || '').toUpperCase() === 'NO';
    }).length;
    return '<div class="visit-detail-section"><h4>' + escapeHtml(section)
      + (noCount ? ' <span style="color:#B22A24; font-weight:700;">(' + noCount + ' to work on)</span>' : '')
      + '</h4>' + rows + '</div>';
  }).join('') || '<div class="visit-detail-section"><h4>Visit Responses</h4><p class="visit-report-note">No parsed responses are available. Use the original PDF below.</p></div>';

  var counts = visit.counts || {};
  var pdfLinkHtml = visit.pdfUrl
    ? '<a class="btn" href="' + escapeHtml(visit.pdfUrl) + '" target="_blank" rel="noopener" style="text-decoration:none; display:inline-block;">View Original NBO PDF &#8599;</a>'
    : '<p class="visit-report-note">No PDF is attached to this record.</p>';

  return '<div class="visit-detail-section"><h4>Details</h4><div class="visit-detail-grid">' + basicHtml + '</div></div>'
    + '<div class="visit-detail-section"><h4>Derived Result</h4>'
    + '<p style="font-size:1.4rem; font-weight:800; color:var(--text);">' + escapeHtml(window.GAILS.NBOShared.pctText(visit)) + '</p>'
    + '<p class="visit-report-note">' + escapeHtml((counts.yes || 0) + ' Yes, ' + (counts.no || 0) + ' No'
      + (counts.na ? ', ' + counts.na + ' N/A' : '')) + '. This percentage is derived from the responses; the NBO PDF has no score of its own.</p>'
    + '</div>'
    + sectionsHtml
    + '<div class="visit-detail-section"><h4>Original Report</h4>' + pdfLinkHtml + '</div>'
    + (canEdit('visits')
        ? '<div class="visit-detail-actions">'
        + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
        + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Details</button>'
        + '</div>'
        : '');
}

function buildVisitDetailHtml(visit) {
  var isSiteVisit = visit.type === 'siteVisit';
  var isCqv = visit.type === 'cqv';
  var isNbo = visit.type === 'nbo';
  var badgeHtml = isCqv
    ? '<span class="admin-badge admin-badge--cqv">' + (visit.isFollowUp ? 'CQV Follow-Up' : 'Coffee Quality Visit (CQV)') + '</span>'
    : isNbo
      ? '<span class="admin-badge admin-badge--nbo">NBO Coffee Visit ' + escapeHtml(visit.visitNumber || 1) + '</span>'
      : isSiteVisit
        ? '<span class="admin-badge admin-badge--adhoc">' + escapeHtml(siteVisitKindLabel(visit)) + '</span>'
        : '<span class="admin-badge admin-badge--routine">Routine Coffee Visit</span>';

  var recorderText = '';
  if (visit.meta) {
    var actionWord = isSiteVisit ? 'Logged' : 'Recorded';
    var datePart = formatVisitDate(visit.date);
    var userPart = visit.meta.updatedBy ? ' by ' + visit.meta.updatedBy : '';
    var sourcePart = (visit.meta.source === 'form') ? ' via the Routine Coffee Visit form.'
      : (visit.meta.source === 'pdf-import') ? (isNbo ? ' from an imported NBO PDF.' : ' from an imported CQV PDF.')
      : ' manually.';
    recorderText = actionWord + ' on ' + datePart + userPart + sourcePart;
  } else {
    recorderText = 'Recorded on ' + formatVisitDate(visit.date);
  }

  var headerHtml = '<div class="visit-detail-header-wrap">'
    + '  <div class="visit-detail-title-row">'
    + '    <h3>' + escapeHtml(visit.bakery || 'Visit detail') + '</h3>'
    + '    ' + badgeHtml
    + '  </div>'
    + '  <p>' + escapeHtml(recorderText) + '</p>'
    + '</div>';

  if (isCqv) {
    return headerHtml + buildCqvDetailHtml(visit);
  }

  if (isNbo) {
    return headerHtml + buildNboDetailHtml(visit);
  }

  if (isSiteVisit) {
    var adhocFields = [
      { key: 'bakery', label: 'Bakery', type: 'text' },
      { key: 'visitKind', label: 'Visit Type', type: 'siteVisitKind' },
      { key: 'date', label: 'Visit date', type: 'date' },
      { key: 'time', label: 'Visit time', type: 'time' },
      { key: 'coffeePartner', label: 'Coffee Partner', type: 'text' },
      { key: 'mod', label: 'Barista', type: 'text' },
      { key: 'comments', label: 'Comments', type: 'textarea' }
    ];

    var adhocHtml = adhocFields.map(function(field) {
      return fieldInputHtml(null, field, visit[field.key]);
    }).join('');

    return headerHtml
      + '<div class="visit-detail-section">'
      + '  <h4>Details</h4>'
      + '  <div class="visit-detail-grid">' + adhocHtml + '</div>'
      + '</div>'
      + (canEdit('visits')
          ? '<div class="visit-detail-actions">'
          + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
          + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Changes</button>'
          + '</div>'
          : '');
  } else {
    var generalHtml = VISIT_GENERAL_FIELDS.map(function(field) {
      return fieldInputHtml(null, field, visit[field.key]);
    }).join('');

    var sectionsHtml = VISIT_SECTIONS.map(function(section) {
      var sectionData = visit[section.key] || {};
      var fieldsHtml = section.fields.map(function(field) {
        return fieldInputHtml(section.key, field, sectionData[field.key]);
      }).join('');
      return '<div class="visit-detail-section">'
        + '  <h4>' + escapeHtml(section.title) + '</h4>'
        + '  <div class="visit-detail-grid">' + fieldsHtml + '</div>'
        + '</div>';
    }).join('');

    return headerHtml
      + '<div class="visit-detail-section">'
      + '  <h4>General</h4>'
      + '  <div class="visit-detail-grid">' + generalHtml + '</div>'
      + '</div>'
      + sectionsHtml
      + (canEdit('visits')
          ? '<div class="visit-detail-actions">'
          + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
          + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Changes</button>'
          + '</div>'
          : '');
  }
}

function visitForAttributionEdit(visit) {
  var editable = Object.assign({}, visit);
  var isAudited = visit.type === 'cqv' || visit.type === 'nbo';
  var M = window.GAILS.Mentions;
  if (isAudited) {
    var auditedAssignees = M ? M.toAssigneeList(visit.assignedTo) : [];
    editable.coffeePartnerAttribution = auditedAssignees.length && M
      ? M.formatPeople(auditedAssignees)
      : (visit.auditorName || '');
    return editable;
  }
  if (!M) return editable;

  // assignedTo is authoritative. Older records can have that list while their
  // Coffee Partner display text is blank or still uses legacy @ syntax.
  var assigned = M.toAssigneeList(visit.assignedTo);
  if (!assigned.length) assigned = M.resolveSelections(visit.coffeePartner);
  if (assigned.length) editable.coffeePartner = M.formatPeople(assigned);
  return editable;
}

function openVisitDetail(id) {
  var visit = state.visits.find(function(v) { return v.id === id; });
  if (!visit) return;
  state.visitDetailId = id;
  visitDetailBody.innerHTML = buildVisitDetailHtml(visitForAttributionEdit(visit));
  if (window.GAILS.MentionField) window.GAILS.MentionField.enhanceAll(visitDetailBody);
  visitDetailModal.style.display = 'flex';
}

function closeVisitDetail() {
  visitDetailModal.style.display = 'none';
  visitDetailBody.innerHTML = '';
  state.visitDetailId = null;
}

function collectVisitFormValues() {
  var result = { general: {} };
  VISIT_SECTIONS.forEach(function(section) { result[section.key] = {}; });

  Array.from(visitDetailBody.querySelectorAll('[data-field]')).forEach(function(input) {
    var section = input.dataset.section;
    var key = input.dataset.field;
    var type = input.dataset.type;
    var raw = input.value;
    var value;

    if (type === 'number') {
      value = raw === '' ? null : Number(raw);
    } else if (type === 'scale') {
      value = raw === '' ? null : Number(raw);
    } else if (type === 'photos') {
      value = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    } else {
      value = raw;
    }

    if (section) {
      result[section][key] = value;
    } else {
      result.general[key] = value;
    }
  });

  return result;
}

// Exact directory names separated by ",", "+" or "&" become explicit visit
// assignees. Legacy @mentions remain valid, while unfamiliar text is ignored.
function resolveEditedAssignees(partnerText) {
  var M = window.GAILS.Mentions;
  if (!M) return [];
  return M.resolveSelections(partnerText);
}

async function saveVisitDetail(id) {
  var existing = state.visits.find(function(v) { return v.id === id; });
  if (!existing) return;

  var collected = collectVisitFormValues();
  if (!collected.general.bakery || !collected.general.date) {
    setMessage(visitMsg, 'error', 'A visit needs at least a bakery name and a date.');
    return;
  }

  var payload = Object.assign({}, existing, collected.general);
  delete payload.coffeePartnerAttribution;
  if (!existing.type || existing.type === 'routine') {
    VISIT_SECTIONS.forEach(function(section) {
      payload[section.key] = collected[section.key];
    });
  }
  // Routine visits use their Coffee Partner field. Imported CQV and NBO
  // reports use the explicit attribution picker, with the PDF auditor retained
  // as the automatic fallback.
  var isAudited = existing.type === 'cqv' || existing.type === 'nbo';
  var attributionText = isAudited
    ? (collected.general.coffeePartnerAttribution || '')
    : collected.general.coffeePartner;
  var editedAssignees = resolveEditedAssignees(attributionText);
  var storedAssignees = window.GAILS.Mentions
    ? window.GAILS.Mentions.toAssigneeList(existing.assignedTo)
    : [];
  if (!isAudited && !editedAssignees.length && storedAssignees.length &&
      String(attributionText || '').trim() ===
        window.GAILS.Mentions.formatPeople(storedAssignees)) {
    // A temporarily unavailable directory must not erase an unchanged,
    // authoritative assignment merely because this visit was opened and saved.
    editedAssignees = storedAssignees;
  }
  if (isAudited && !editedAssignees.length) {
    var previousAttributionText = visitForAttributionEdit(existing).coffeePartnerAttribution || '';
    if (String(attributionText || '').trim() === String(previousAttributionText).trim() &&
        storedAssignees.length) {
      editedAssignees = storedAssignees;
    } else if (String(attributionText || '').trim() &&
               String(attributionText).trim().toLowerCase() !==
                 String(collected.general.auditorName || existing.auditorName || '').trim().toLowerCase()) {
      setMessage(visitMsg, 'error', 'Choose the Coffee Partner from the name suggestions before saving.');
      return;
    }
  }
  payload.assignedTo = editedAssignees.length ? editedAssignees : null;
  if (!isAudited && editedAssignees.length && window.GAILS.Mentions) {
    payload.coffeePartner = window.GAILS.Mentions.formatPeople(editedAssignees);
  }
  payload.meta = Object.assign({}, existing.meta, {
    updatedAt: nowIso(),
    updatedBy: currentUserEmail()
  });
  delete payload.id;

  await set(ref(db, 'routineVisits/' + id), payload);
  setMessage(visitMsg, 'success', 'Saved visit for ' + (collected.general.bakery || 'bakery') + '.');
  closeVisitDetail();
}

function openDeleteConfirmModal(promptText) {
  return new Promise((resolve) => {
    deleteConfirmPromptText.textContent = promptText;
    deleteConfirmInput.value = '';
    deleteConfirmSubmitBtn.disabled = true;
    deleteConfirmSubmitBtn.textContent = 'Delete';
    deleteConfirmSubmitBtn.style.cursor = 'not-allowed';
    deleteConfirmSubmitBtn.style.opacity = '0.5';
    deleteConfirmModal.style.display = 'flex';
    
    function onInput() {
      var matches = deleteConfirmInput.value.trim().toLowerCase() === 'delete record';
      deleteConfirmSubmitBtn.disabled = !matches;
      if (matches) {
        deleteConfirmSubmitBtn.style.cursor = 'pointer';
        deleteConfirmSubmitBtn.style.opacity = '1';
      } else {
        deleteConfirmSubmitBtn.style.cursor = 'not-allowed';
        deleteConfirmSubmitBtn.style.opacity = '0.5';
      }
    }
    
    async function onSubmit() {
      if (deleteConfirmInput.value.trim().toLowerCase() !== 'delete record') return;
      deleteConfirmSubmitBtn.disabled = true;
      deleteConfirmSubmitBtn.textContent = 'Deleting...';
      cleanup();
      resolve(true);
    }
    
    function onCancel() {
      cleanup();
      resolve(false);
    }
    
    function cleanup() {
      deleteConfirmInput.removeEventListener('input', onInput);
      deleteConfirmSubmitBtn.removeEventListener('click', onSubmit);
      deleteConfirmCancel.removeEventListener('click', onCancel);
      deleteConfirmClose.removeEventListener('click', onCancel);
      deleteConfirmModal.removeEventListener('click', onOutsideClick);
    }
    
    function onOutsideClick(e) {
      if (e.target === deleteConfirmModal) {
        onCancel();
      }
    }
    
    deleteConfirmInput.addEventListener('input', onInput);
    deleteConfirmSubmitBtn.addEventListener('click', onSubmit);
    deleteConfirmCancel.addEventListener('click', onCancel);
    deleteConfirmClose.addEventListener('click', onCancel);
    deleteConfirmModal.addEventListener('click', onOutsideClick);
  });
}

async function removeVisitRecord(id) {
  var existing = state.visits.find(function(v) { return v.id === id; });
  var bakeryName = existing ? existing.bakery : 'this bakery';
  var dateText = existing && existing.date ? formatVisitDate(existing.date) : '';
  
  var promptMsg = 'Delete the visit record for ' + bakeryName + (dateText ? ' on ' + dateText : '') + '?';
  var confirmed = await openDeleteConfirmModal(promptMsg);
  if (!confirmed) return;
  
  try {
    await remove(ref(db, 'routineVisits/' + id));
    setMessage(visitMsg, 'success', 'Visit record deleted.');
    if (state.visitDetailId === id) closeVisitDetail();
  } finally {
    deleteConfirmModal.style.display = 'none';
  }
}

function renderPortal() {
  renderSummary();
  renderOverview();
  renderActivityLog();
  renderUsers();
  renderRoles();
  populateRoleSelects();
  renderSites();
  renderRegionAssignments();
  renderOpsAreaAssignments();
  renderVisits();
  renderDataControls();
  renderImportZones();
}

// ── Navigation ──
function switchPanel(panelName) {
  state.activePanel = panelName;
  Array.from(nav.querySelectorAll('[data-admin-panel]')).forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.adminPanel === panelName);
  });
  panels.forEach(function(panel) {
    panel.classList.toggle('active', panel.dataset.adminPanelContent === panelName);
  });
  if (panelName === 'overview') renderActivityLog();
}

// Users and Roles used to be two panels; they are now one. A bookmark or an
// old link to either should land on it rather than bouncing to Overview.
var RENAMED_PANELS = { users: 'access', roles: 'access' };

function requestedAdminPanel() {
  var panelName = String(window.location.hash || '').replace(/^#/, '');
  if (RENAMED_PANELS[panelName]) panelName = RENAMED_PANELS[panelName];
  var panel = panels.find(function(item) {
    return item.dataset.adminPanelContent === panelName;
  });
  if (!panel) return 'overview';
  var area = PANEL_AREAS[panelName];
  return !area || canView(area) ? panelName : 'overview';
}

// ── Firebase ──
async function refreshDatasetInfo() {
  try {
    var snap = await get(ref(db, 'dashboardMeta'));
    if (snap.exists()) {
      state.datasetInfo = snap.val();
    } else {
      // Fall back to reading metadata fields from dashboardData for backwards compatibility
      var dataSnap = await get(ref(db, 'dashboardData'));
      if (dataSnap.exists()) {
        var d = dataSnap.val();
        state.datasetInfo = {
          recordCount: d.recordCount,
          monthCount: d.monthCount,
          sourceName: d.sourceName,
          updatedAt: d.updatedAt,
          updatedBy: d.updatedBy
        };
      } else {
        state.datasetInfo = null;
      }
    }
  } catch (e) {
    console.error('Could not load dataset info:', e);
  }
  renderSummary();
  renderOverview();
  renderDataControls();
  renderImportZones();
}

function syncSiteMetaFromSource(payload) {
  var entries = payload && payload.entries ? payload.entries : payload;
  state.siteMetaSource = cloneMeta(entries || {});
  state.regionAssignmentsSource = mergeRegionAssignmentsForMeta(
    state.siteMetaSource,
    payload && payload.regionAssignments
  );
  state.opsAreaAssignmentsSource = mergeOpsAreaAssignmentsForMeta(
    state.siteMetaSource,
    payload && payload.opsAreaAssignments
  );
  state.siteMetaSourceInfo = normalizeSiteImportInfo({
    fileName: payload && payload.sourceName,
    sheetName: payload && payload.sourceSheetName,
    duplicateCount: payload && payload.duplicateCount,
    siteCount: payload && payload.siteCount ? payload.siteCount : Object.keys(state.siteMetaSource).length,
    updatedAt: payload && payload.updatedAt,
    updatedBy: payload && payload.updatedBy
  });
  if (!state.siteMetaDirty) {
    state.siteMetaDraft = cloneMeta(state.siteMetaSource);
    state.regionAssignmentsDraft = cloneMeta(state.regionAssignmentsSource);
    state.opsAreaAssignmentsDraft = cloneMeta(state.opsAreaAssignmentsSource);
    state.siteImportInfo = state.siteMetaSourceInfo ? cloneMeta(state.siteMetaSourceInfo) : null;
  }
  renderSummary();
  renderOverview();
  renderSites();
  renderRegionAssignments();
  renderOpsAreaAssignments();
  renderDataControls();
  renderImportZones();
}

// Saves everything the access modal holds in one write, so a person's role,
// reporting line, and scope can never end up half-applied.
async function saveAccessModal() {
  var uid = state.accessUserUid;
  var user = findUser(uid);
  if (!user || !state.accessDraft) return;

  var draft = state.accessDraft;
  var firstName = String(draft.firstName || '').trim();
  var lastName = String(draft.lastName || '').trim();
  if ((firstName && !lastName) || (!firstName && lastName)) {
    throw new Error('Enter both a first name and a last name, or leave both blank.');
  }
  if (firstName.length > 50 || lastName.length > 50) {
    throw new Error('First and last names must be 50 characters or fewer.');
  }

  // The signed-in admin may safely update their own name, but their role and
  // reporting line remain locked to prevent an accidental lockout.
  if (uid === currentUserId()) {
    await update(ref(db, 'users/' + uid), {
      firstName: firstName,
      lastName: lastName
    });
    if (primaryAuth.currentUser) {
      await updateProfile(primaryAuth.currentUser, {
        displayName: [firstName, lastName].filter(Boolean).join(' ')
      }).catch(function(error) {
        console.warn('The profile name was saved, but the auth display name could not be refreshed:', error);
      });
    }
    return;
  }

  var api = teamApi();
  if (draft.managerUid && api && api.assignmentWouldCycle(uid, draft.managerUid, state.users)) {
    throw new Error(managerLabel(draft.managerUid) + ' already reports to ' + userLabel(user)
      + ', so they cannot also be their manager.');
  }

  await update(ref(db, 'users/' + uid), {
    firstName: firstName,
    lastName: lastName,
    role: draft.role,
    opsArea: draft.opsArea,
    managerUid: draft.managerUid,
    myActivity: draft.myActivity === true
  });
  // Only full admins may write the admins/ mirror (rules enforce this too).
  if (state.isAdmin) {
    if (draft.role === 'admin') {
      await set(ref(db, 'admins/' + uid), true);
    } else {
      await remove(ref(db, 'admins/' + uid));
    }
  }
}

// Mirrors the readable name/email of every user into the shared directory that
// powers @mention assignment, and feeds this page's own picker. Best-effort and
// idempotent: a write that the rules reject (because userDirectory has not been
// deployed yet) must not break the user list this runs off.
//
// teamDirectory is the same idea for reporting lines. /users carries roles and
// ops areas and is deliberately unreadable to ordinary users, but a manager has
// to be able to see who reports to them — so the org chart is mirrored into its
// own node, readable only by roles that have a team view, and writable only
// here. Publishing both together keeps them from drifting apart.
function publishDirectoryEntries(users) {
  var people = (users || []).map(function(user) {
    var email = user.email === 'Unknown' ? '' : user.email;
    var name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    // Someone who has not filled in their profile is still a colleague visits
    // get assigned to, so their work address stands in for the name they have
    // not set yet. Their own entry replaces it the moment they do.
    if (!name && window.GAILS.Mentions) name = window.GAILS.Mentions.nameFromEmail(email);
    return {
      uid: user.uid,
      name: name,
      email: email,
      managerUid: user.managerUid || '',
      roleId: user.role || 'viewer',
      opsArea: user.opsArea || ''
    };
  }).filter(function(person) { return !!person.name; });

  if (window.GAILS.Mentions) window.GAILS.Mentions.addPeople(people);
  if (!canEdit('users')) return;

  people.forEach(function(person) {
    set(ref(db, 'userDirectory/' + person.uid), {
      name: person.name,
      email: person.email || ''
    }).catch(function(error) {
      console.warn('Could not publish ' + person.name + ' to the shared people directory:', error);
    });
    set(ref(db, 'teamDirectory/' + person.uid), {
      name: person.name,
      email: person.email || '',
      managerUid: person.managerUid,
      roleId: person.roleId,
      roleName: roleDisplayName(person.roleId),
      opsArea: person.opsArea
    }).catch(function(error) {
      console.warn('Could not publish ' + person.name + ' to the team directory:', error);
    });
  });
}

async function revokeUser(uid) {
  var user = findUser(uid);
  if (!user || uid === currentUserId()) return;
  var reports = teamApi() ? teamApi().directReports(uid, state.users) : [];
  var warning = reports.length
    ? '\n\n' + formatCount(reports.length, 'person', 'people')
      + ' currently reports to them and will be left without a manager.'
    : '';
  if (!confirm('Remove dashboard access for ' + (user.email || 'this person') + '?' + warning)) return;
  await remove(ref(db, 'users/' + uid));
  if (state.isAdmin) {
    await remove(ref(db, 'admins/' + uid));
  }
  // Someone without dashboard access should not stay in the @mention picker,
  // or hold a place in anyone's reporting line.
  try {
    await remove(ref(db, 'userDirectory/' + uid));
    await remove(ref(db, 'teamDirectory/' + uid));
  } catch (directoryErr) {
    console.warn('Could not remove the user from the shared directories:', directoryErr);
  }
  // Their reports are not deleted, only detached — the next admin to open them
  // can point them at a new manager.
  await Promise.all(reports.map(function(report) {
    return update(ref(db, 'users/' + report.uid), { managerUid: '' }).catch(function(error) {
      console.warn('Could not detach ' + report.name + ' from their removed manager:', error);
    });
  }));
}

function updateSiteDraft(name, field, value) {
  if (!state.siteMetaDraft[name]) state.siteMetaDraft[name] = { r: '', o: '' };
  state.siteMetaDraft[name][field] = String(value || '').trim();
  setDirty(true);
  updateSiteTableMeta(getVisibleSiteMeta().length);
  renderSummary();
  renderOverview();
  renderRegionAssignments();
  renderOpsAreaAssignments();
  renderDataControls();
}

function updateRegionAssignmentDraft(region, field, value, userUid) {
  var next = regionAssignmentApi().updateAssignment(
    detectedSiteRegions(state.siteMetaDraft),
    state.regionAssignmentsDraft,
    region,
    field,
    value
  );
  next = regionAssignmentApi().updateAssignment(
    detectedSiteRegions(state.siteMetaDraft),
    next,
    region,
    field + 'Uid',
    userUid || ''
  );
  state.regionAssignmentsDraft = next;
  setDirty(true);
  updateSiteTableMeta(getVisibleSiteMeta().length);
  if (regionAssignmentMeta) {
    var rows = visibleRegionAssignments();
    var assignmentsComplete = rows.filter(function(row) {
      return !!(row.coffeePartner || row.coffeePartnerUid ||
        row.coffeeTrainer || row.coffeeTrainerUid);
    }).length;
    regionAssignmentMeta.textContent = rows.length + ' detected region'
      + (rows.length === 1 ? '' : 's')
      + ' \u2022 ' + assignmentsComplete + ' with team details'
      + ' \u2022 unsaved changes';
  }
  renderSummary();
  renderOverview();
  renderDataControls();
}

function afterOpsAreaAssignmentEdit() {
  setDirty(true);
  updateSiteTableMeta(getVisibleSiteMeta().length);
  if (opsAreaAssignmentMeta) {
    opsAreaAssignmentMeta.textContent = opsAreaAssignmentsMetaText(visibleOpsAreaAssignments(), true);
  }
  renderSummary();
  renderOverview();
  renderDataControls();
}

// Deliberately does not re-render the table: the admin is typing into one of
// its inputs, and replacing the row would drop the caret.
function updateOpsAreaBaristaDraft(region, opsArea, index, field, value, userUid) {
  var pairs = detectedSiteOpsAreas(state.siteMetaDraft);
  var next = opsAreaAssignmentApi().updateBarista(
    pairs,
    state.opsAreaAssignmentsDraft,
    region,
    opsArea,
    index,
    field,
    value
  );
  if (field === 'name') {
    next = opsAreaAssignmentApi().updateBarista(
      pairs, next, region, opsArea, index, 'uid', userUid || ''
    );
  }
  state.opsAreaAssignmentsDraft = next;
  afterOpsAreaAssignmentEdit();
}

// Adding and removing rows does change the shape of the table, so unlike
// typing these two repaint it.
function addOpsAreaBarista(region, opsArea) {
  state.opsAreaAssignmentsDraft = opsAreaAssignmentApi().addBarista(
    detectedSiteOpsAreas(state.siteMetaDraft),
    state.opsAreaAssignmentsDraft,
    region,
    opsArea
  );
  afterOpsAreaAssignmentEdit();
  renderOpsAreaAssignments();
}

function removeOpsAreaBarista(region, opsArea, index) {
  var rows = visibleOpsAreaAssignments();
  var target = rows.find(function(row) {
    return row.region === region && row.opsArea === opsArea;
  });
  var entry = target && (target.baristas || [])[index];

  // Only worth interrupting for when there is something to lose — an empty row
  // the admin just added away again is not a deletion.
  if (entry && (entry.name || entry.homeBakery)) {
    var who = entry.name || 'This area head barista';
    if (!confirm('Remove ' + who + ' as an area head barista for ' + opsArea + '?')) return;
  }

  state.opsAreaAssignmentsDraft = opsAreaAssignmentApi().removeBarista(
    detectedSiteOpsAreas(state.siteMetaDraft),
    state.opsAreaAssignmentsDraft,
    region,
    opsArea,
    index
  );
  afterOpsAreaAssignmentEdit();
  renderOpsAreaAssignments();
}

function removeSite(name) {
  if (!confirm('Remove ' + name + ' from the shared site directory?')) return;
  delete state.siteMetaDraft[name];
  setDirty(true);
  renderSites();
  renderRegionAssignments();
  renderOpsAreaAssignments();
  renderSummary();
  renderOverview();
  renderDataControls();
}

// Reflects appSettings/reportVisibility onto the toggle. Only users who can
// edit the Users area may flip it; everyone else sees it read-only.
function renderReportVisibility() {
  if (!reportVisibilityToggle) return;
  var enabled = !!state.reportVisibilityEnabled;
  reportVisibilityToggle.checked = enabled;
  reportVisibilityToggle.disabled = !canEdit('users');
  if (reportVisibilityState) {
    reportVisibilityState.textContent = enabled
      ? 'On — assigned ops managers see only their own ops area in Bakery Reports.'
      : 'Off — everyone sees every site’s visits and follow-ups.';
  }
}

function ensurePortalSync() {
  if (usersUnsubscribe || rolesUnsubscribe) return;

  if (!appSettingsUnsubscribe) appSettingsUnsubscribe = onValue(ref(db, 'appSettings/reportVisibility'), function(snapshot) {
    var val = snapshot.exists() ? snapshot.val() : null;
    state.reportVisibilityEnabled = !!(val && val.enabled);
    renderReportVisibility();
  }, function(err) {
    console.error('Failed to sync report visibility setting:', err);
  });

  if (canView('users')) {
    usersUnsubscribe = onValue(ref(db, 'users'), function(snapshot) {
      state.users = [];
      if (snapshot.exists()) {
        var users = snapshot.val();
        state.users = Object.keys(users).map(function(uid) {
          return {
            uid: uid,
            firstName: users[uid].firstName || '',
            lastName: users[uid].lastName || '',
            email: users[uid].email || 'Unknown',
            role: users[uid].role || 'viewer',
            opsArea: users[uid].opsArea || '',
            // The whole reporting hierarchy is derived from this one field.
            managerUid: users[uid].managerUid || '',
            // Absent means off: My Activity is opt-in, so a user who has never
            // been granted it does not have it.
            myActivity: users[uid].myActivity === true,
            invitation: users[uid].invitation || null
          };
        });
        // Admins can read the full user list, so the @mention picker on this
        // page is built from it directly. It also republishes the shared
        // directory (see database.rules.json), which is how a colleague becomes
        // mentionable before they have ever signed in.
        publishDirectoryEntries(state.users);
        state.users = state.users.sort(function(a, b) {
          var aLabel = [a.firstName, a.lastName].filter(Boolean).join(' ') || a.email;
          var bLabel = [b.firstName, b.lastName].filter(Boolean).join(' ') || b.email;
          return aLabel.localeCompare(bLabel);
        });
      }
      renderSummary();
      renderOverview();
      renderUsers();
      renderRoles();
      renderRegionAssignments();
      renderOpsAreaAssignments();
    }, function(err) {
      console.error('Failed to sync users:', err);
      setMessage(createMsg, 'error', 'Could not load active users from Firebase.');
    });
  }

  rolesUnsubscribe = onValue(ref(db, 'roles'), function(snapshot) {
    state.roles = snapshot.exists() ? (snapshot.val() || {}) : {};
    renderRoles();
    populateRoleSelects();
    renderUsers();
  }, function(err) {
    console.error('Failed to sync roles:', err);
    setMessage(roleMsg, 'error', 'Could not load roles from Firebase.');
  });

  get(ref(db, 'portalData/siteMeta')).then(function(snapshot) {
    if (snapshot.exists()) {
      var payload = snapshot.val();
      syncSiteMetaFromSource(payload);
    }
  }).catch(function(err) {
    console.error('Failed to load site metadata snapshot:', err);
  });

  visitsUnsubscribe = onValue(ref(db, 'routineVisits'), function(snapshot) {
    state.visits = [];
    if (snapshot.exists()) {
      var visits = snapshot.val();
      state.visits = Object.keys(visits).map(function(id) {
        return Object.assign({ id: id }, visits[id]);
      });
      if (window.GAILS.Mentions) window.GAILS.Mentions.addHarvested({ visits: visits });
    }
    renderVisits();
    updateCqvBackfillButton();
  }, function(err) {
    console.error('Failed to sync routine visits:', err);
    setMessage(visitMsg, 'error', 'Could not load visit history from Firebase.');
  });
}

// ── Auth guard ──
// Panels are gated per-area by the signed-in user's role: full admins see
// everything; custom roles see only the panels their permissions allow
// (view = read-only, edit = full controls). Roles with no admin access at
// all are bounced back to the dashboard. Client-side gating is backed up
// by the database rules (see database.rules.reference.json).
var PANEL_AREAS = { access: 'users', sites: 'sites', data: 'dataset', visits: 'visits' };

function applyAdminAccessUI() {
  Object.keys(PANEL_AREAS).forEach(function(panelName) {
    var area = PANEL_AREAS[panelName];
    var hidden = !canView(area);
    var navBtn = nav.querySelector('[data-admin-panel="' + panelName + '"]');
    if (navBtn) navBtn.style.display = hidden ? 'none' : '';
    var panel = panels.find(function(p) { return p.dataset.adminPanelContent === panelName; });
    if (panel) panel.dataset.roleHidden = hidden ? 'true' : 'false';
    Array.from(document.querySelectorAll('[data-admin-panel-target="' + panelName + '"]')).forEach(function(card) {
      card.style.display = hidden ? 'none' : '';
    });
  });

  // Hide edit-only controls in panels where the role is view-only. Everything
  // that only *reports* access stays visible — the People and Roles tables and
  // the estate-wide rules, which renderReportVisibility renders disabled — and
  // only the buttons that change something come out.
  var editOnly = {
    users: [inviteUserBtn, newRoleBtn],
    sites: [
      document.querySelector('.admin-site-import'),
      siteForm,
      saveSitesBtn,
      resetSitesBtn
    ],
    dataset: [
      document.querySelector('[data-admin-panel-content="data"] .admin-dataset-upload'),
      clearDatasetBtn,
      restoreMetaBtn
    ],
    visits: [document.querySelector('[data-admin-panel-content="visits"] .admin-dataset-upload')]
  };
  Object.keys(editOnly).forEach(function(area) {
    var hide = !canEdit(area);
    editOnly[area].forEach(function(el) {
      if (el) el.style.display = hide ? 'none' : '';
    });
  });
}

onAuthStateChanged(primaryAuth, async function(user) {
  if (!user) {
    window.location.replace('index.html');
    return;
  }

  try {
    var adminSnap = await get(ref(db, 'admins/' + user.uid));
    var userSnap  = await get(ref(db, 'users/'  + user.uid));

    var isAdmin = false;
    if (adminSnap.exists() && adminSnap.val() === true) isAdmin = true;

    var roleId = 'viewer';
    if (userSnap.exists() && userSnap.val()) roleId = userSnap.val().role || 'viewer';
    if (roleId === 'admin') isAdmin = true;
    if (isAdmin) roleId = 'admin';

    var customRoleDef = null;
    if (!BUILTIN_ROLES[roleId]) {
      var roleSnap = await get(ref(db, 'roles/' + roleId));
      customRoleDef = roleSnap.exists() ? roleSnap.val() : null;
    }

    state.isAdmin = isAdmin;
    state.permissions = resolveRolePermissions(roleId, customRoleDef);
    updateProfileMenu(user, userSnap.exists() ? userSnap.val() : null);

    if (!isAdmin && !hasAdminPanelAccess(state.permissions)) {
      window.location.replace('index.html');
      return;
    }
  } catch (e) {
    console.error('Auth check failed:', e);
    window.location.replace('index.html');
    return;
  }

  authGuard.style.display = 'none';
  adminPage.style.display = 'flex';

  setDirty(false);
  syncSidebarForViewport();
  buildRoleAccessGrid();
  applyAdminAccessUI();
  ensurePortalSync();
  switchPanel(requestedAdminPanel());
  renderPortal();
  refreshDatasetInfo();
});

// ── Event listeners ──
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

signOutBtn.addEventListener('click', async function() {
  setProfileMenuOpen(false);
  if (usersUnsubscribe) { usersUnsubscribe(); usersUnsubscribe = null; }
  if (visitsUnsubscribe) { visitsUnsubscribe(); visitsUnsubscribe = null; }
  if (rolesUnsubscribe) { rolesUnsubscribe(); rolesUnsubscribe = null; }
  await signOut(primaryAuth);
  window.location.href = 'index.html';
});

visitSearchInput.addEventListener('input', function(e) {
  state.visitSearch = e.target.value;
  renderVisits();
});

visitList.addEventListener('click', async function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var id = btn.dataset.id;

  if (btn.dataset.action === 'view-visit') {
    openVisitDetail(id);
    return;
  }
  if (btn.dataset.action === 'remove-visit') {
    btn.disabled = true;
    try {
      await removeVisitRecord(id);
    } catch (err) {
      setMessage(visitMsg, 'error', 'Error: ' + err.message);
    } finally {
      btn.disabled = false;
    }
  }
});

visitDetailBody.addEventListener('click', async function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var id = btn.dataset.id;
  btn.disabled = true;

  try {
    if (btn.dataset.action === 'save-visit-detail') {
      await saveVisitDetail(id);
    }
    if (btn.dataset.action === 'delete-visit-detail') {
      await removeVisitRecord(id);
    }
  } catch (err) {
    setMessage(visitMsg, 'error', 'Error: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

if (visitDetailClose) {
  visitDetailClose.addEventListener('click', closeVisitDetail);
}

visitDetailModal.addEventListener('click', function(e) {
  if (e.target === visitDetailModal) closeVisitDetail();
});

nav.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-admin-panel]');
  if (!btn) return;
  switchPanel(btn.dataset.adminPanel);
  window.history.replaceState(null, '', 'admin.html#' + btn.dataset.adminPanel);
  if (compactSidebarMedia.matches) setSidebarCollapsed(true);
});

document.addEventListener('click', function(e) {
  var link = e.target.closest('[data-admin-panel-target]');
  if (!link) return;
  switchPanel(link.dataset.adminPanelTarget);
  window.history.replaceState(null, '', 'admin.html#' + link.dataset.adminPanelTarget);
  if (compactSidebarMedia.matches) setSidebarCollapsed(true);
});

if (sidebarToggleBtn) {
  sidebarToggleBtn.addEventListener('click', function() {
    setSidebarCollapsed(workspaceShell.dataset.sidebarCollapsed !== 'true');
  });
}

if (compactSidebarMedia && typeof compactSidebarMedia.addEventListener === 'function') {
  compactSidebarMedia.addEventListener('change', syncSidebarForViewport);
} else if (compactSidebarMedia && typeof compactSidebarMedia.addListener === 'function') {
  compactSidebarMedia.addListener(syncSidebarForViewport);
}

// ── Invite modal ──
function openInviteModal() {
  if (!inviteUserModal || !canEdit('users')) return;
  clearMessage(inviteMsg);
  createUserForm.reset();
  populateRoleSelects();
  renderInviteSummary();
  inviteUserModal.style.display = 'flex';
  if (newFirstNameInput) newFirstNameInput.focus();
}

function closeInviteModal() {
  if (inviteUserModal) inviteUserModal.style.display = 'none';
}

// The same read-out the access modal shows, so what an invitation grants is
// visible before it is sent rather than after.
function renderInviteSummary() {
  if (!inviteSummary) return;
  var perms = permissionsForRole(roleSelect ? roleSelect.value : 'viewer');
  var manager = newManagerSelect && newManagerSelect.value ? managerLabel(newManagerSelect.value) : '';
  var parts = ['They will see ' + describeVisibility(perms).toLowerCase() + '.'];
  parts.push('They can edit: ' + describeEditing(perms).toLowerCase() + '.');
  if (manager) parts.push('Their work will appear on ' + manager + '’s My Team.');
  inviteSummary.textContent = parts.join(' ');
}

createUserForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  clearMessage(inviteMsg);
  clearMessage(createMsg);
  clearMessage(usersMsg);
  setMessage(inviteMsg, 'info', 'Creating invitation…');
  var btn = inviteSubmitBtn;
  btn.disabled = true;
  try {
    var firstName = newFirstNameInput.value.trim();
    var lastName = newLastNameInput.value.trim();
    var email = newEmailInput.value.trim();
    var role  = roleSelect.value;
    var managerUid = newManagerSelect ? newManagerSelect.value : '';
    var opsArea = newOpsSelect ? newOpsSelect.value : '';
    if (!firstName || !lastName) throw new Error('Enter their first and last name.');
    var pass = createInvitationPassword();
    var cred  = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    var uid   = cred.user.uid;
    var invitedAt = nowIso();
    await set(ref(db, 'users/' + uid), {
      firstName: firstName,
      lastName: lastName,
      email: email,
      role: role,
      managerUid: managerUid,
      opsArea: opsArea,
      invitation: {
        status: 'pending',
        invitedAt: invitedAt,
        invitedBy: primaryAuth.currentUser ? (primaryAuth.currentUser.email || primaryAuth.currentUser.uid) : 'Unknown'
      }
    });
    try {
      await updateProfile(cred.user, { displayName: firstName + ' ' + lastName });
    } catch (profileErr) {
      console.warn('Could not mirror the user name to Firebase Auth:', profileErr);
    }
    if (role === 'admin' && state.isAdmin) await set(ref(db, 'admins/' + uid), true);

    var emailSent = false;
    try {
      await sendPasswordResetEmail(secondaryAuth, email, invitationEmailSettings());
      emailSent = true;
      try {
        await update(ref(db, 'users/' + uid + '/invitation'), {
          emailSentAt: nowIso()
        });
      } catch (statusErr) {
        console.warn('Invitation email was sent, but its delivery status could not be recorded:', statusErr);
      }
    } catch (emailErr) {
      console.warn('Failed to send auto-reset email:', emailErr);
      try {
        await update(ref(db, 'users/' + uid + '/invitation'), {
          status: 'delivery_failed'
        });
      } catch (statusErr) {
        console.warn('Could not record the invitation delivery failure:', statusErr);
      }
    }

    createUserForm.reset();
    populateRoleSelects();

    if (emailSent) {
      closeInviteModal();
      setMessage(createMsg, 'success', 'Invitation sent to ' + email + '. They can choose a password, sign in, and confirm their dashboard details.');
    } else {
      setMessage(inviteMsg, 'error', 'Access was created for ' + email + ', but the invitation email could not be sent. Open their access settings to resend it.');
    }
  } catch (err) {
    setMessage(inviteMsg, 'error', 'Error: ' + err.message);
  } finally {
    if (secondaryAuth.currentUser) {
      try {
        await signOut(secondaryAuth);
      } catch (signOutErr) {
        console.warn('Could not close the invitation account session:', signOutErr);
      }
    }
    btn.disabled = false;
  }
});

userList.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action="manage-access"]');
  if (!btn) return;
  clearMessage(createMsg);
  clearMessage(usersMsg);
  openAccessModal(btn.dataset.uid);
});

// ── Person access modal ──
if (userAccessFirstName) {
  userAccessFirstName.addEventListener('input', function() {
    if (!state.accessDraft) return;
    state.accessDraft.firstName = userAccessFirstName.value;
  });
}

if (userAccessLastName) {
  userAccessLastName.addEventListener('input', function() {
    if (!state.accessDraft) return;
    state.accessDraft.lastName = userAccessLastName.value;
  });
}

if (userAccessRole) {
  userAccessRole.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.role = userAccessRole.value;
    renderAccessReadout();
  });
}
if (userAccessManager) {
  userAccessManager.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.managerUid = userAccessManager.value;
    renderAccessReadout();
  });
}
if (userAccessOps) {
  userAccessOps.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.opsArea = userAccessOps.value;
    renderAccessReadout();
  });
}
if (userAccessMyActivity) {
  userAccessMyActivity.addEventListener('change', async function() {
    if (!state.accessDraft) return;
    var next = userAccessMyActivity.checked;
    state.accessDraft.myActivity = next;
    renderAccessReadout();

    // For anyone else, Save writes it with the rest of their access. On your
    // own account the Save button is hidden — role and reporting line lock
    // themselves so an admin cannot demote or orphan themselves — so this one
    // switch writes on its own. It only ever reveals your own work, and with a
    // lone admin account nobody else could turn it on for you.
    var uid = state.accessUserUid;
    if (!uid || uid !== currentUserId() || !canEdit('users')) return;
    userAccessMyActivity.disabled = true;
    try {
      await update(ref(db, 'users/' + uid), { myActivity: next });
      setMessage(userAccessMsg, 'success', 'My Activity ' + (next ? 'turned on' : 'turned off') + ' for your account.');
    } catch (err) {
      userAccessMyActivity.checked = !next;
      state.accessDraft.myActivity = !next;
      renderAccessReadout();
      setMessage(userAccessMsg, 'error', 'Could not update My Activity: ' + err.message);
    } finally {
      userAccessMyActivity.disabled = false;
    }
  });
}

if (userAccessSave) {
  userAccessSave.addEventListener('click', async function() {
    var user = findUser(state.accessUserUid);
    if (!user) return;
    userAccessSave.disabled = true;
    clearMessage(userAccessMsg);
    try {
      await saveAccessModal();
      closeAccessModal();
      setMessage(usersMsg, 'success', 'Updated access for ' + userLabel(user) + '.');
    } catch (err) {
      setMessage(userAccessMsg, 'error', err.message);
    } finally {
      userAccessSave.disabled = false;
    }
  });
}

if (userAccessRemove) {
  userAccessRemove.addEventListener('click', async function() {
    var uid = state.accessUserUid;
    var user = findUser(uid);
    if (!user) return;
    userAccessRemove.disabled = true;
    try {
      await revokeUser(uid);
      closeAccessModal();
      setMessage(usersMsg, 'success', 'Removed access for ' + userLabel(user) + '.');
    } catch (err) {
      setMessage(userAccessMsg, 'error', 'Could not remove access: ' + err.message);
    } finally {
      userAccessRemove.disabled = false;
    }
  });
}

if (userAccessResetPw) {
  userAccessResetPw.addEventListener('click', async function() {
    var uid = state.accessUserUid;
    var user = findUser(uid);
    if (!user) return;
    var email = user.email;
    var invitation = user.invitation || {};
    var isInvitation = invitation.status && invitation.status !== 'accepted';
    if (!confirm((isInvitation ? 'Resend the invitation to ' : 'Send a password reset email to ') + email + '?')) return;

    userAccessResetPw.disabled = true;
    clearMessage(userAccessMsg);
    try {
      if (typeof sendPasswordResetEmail !== 'function' || !primaryAuth) {
        throw new Error('Password reset is not available.');
      }
      if (isInvitation) {
        await sendPasswordResetEmail(primaryAuth, email, invitationEmailSettings());
        await update(ref(db, 'users/' + uid + '/invitation'), { status: 'pending', emailSentAt: nowIso() });
      } else {
        await sendPasswordResetEmail(primaryAuth, email);
      }
      setMessage(userAccessMsg, 'success', (isInvitation ? 'Invitation resent to ' : 'Password reset email sent to ') + email + '.');
    } catch (err) {
      if (isInvitation) {
        try {
          await update(ref(db, 'users/' + uid + '/invitation'), { status: 'delivery_failed' });
        } catch (statusErr) {
          console.warn('Could not record the invitation delivery failure:', statusErr);
        }
      }
      setMessage(userAccessMsg, 'error', 'Could not send that email: ' + err.message);
    } finally {
      userAccessResetPw.disabled = false;
    }
  });
}

[userAccessClose, userAccessCancel].forEach(function(control) {
  if (control) control.addEventListener('click', closeAccessModal);
});
if (userAccessModal) {
  userAccessModal.addEventListener('click', function(event) {
    if (event.target === userAccessModal) closeAccessModal();
  });
}

// ── Invite modal ──
if (inviteUserBtn) inviteUserBtn.addEventListener('click', openInviteModal);
[inviteUserClose, inviteUserCancel].forEach(function(control) {
  if (control) control.addEventListener('click', closeInviteModal);
});
if (inviteUserModal) {
  inviteUserModal.addEventListener('click', function(event) {
    if (event.target === inviteUserModal) closeInviteModal();
  });
}
[roleSelect, newManagerSelect, newOpsSelect].forEach(function(select) {
  if (select) select.addEventListener('change', renderInviteSummary);
});

if (reportVisibilityToggle) {
  reportVisibilityToggle.addEventListener('change', async function() {
    if (!canEdit('users')) { renderReportVisibility(); return; }
    var next = reportVisibilityToggle.checked;
    reportVisibilityToggle.disabled = true;
    clearMessage(reportVisibilityMsg);
    try {
      await set(ref(db, 'appSettings/reportVisibility'), { enabled: next });
      setMessage(reportVisibilityMsg, 'success', next
        ? 'Ops managers with an assigned area are now restricted to their own sites.'
        : 'Restriction turned off — everyone can see all Bakery Reports again.');
    } catch (err) {
      console.error('Failed to update report visibility setting:', err);
      setMessage(reportVisibilityMsg, 'error', 'Could not update this setting: ' + err.message);
      // Restore the checkbox to the last known-good value on failure.
      renderReportVisibility();
    } finally {
      reportVisibilityToggle.disabled = !canEdit('users');
    }
  });
}

// ── Role editor modal ──
if (roleForm) {
  roleForm.addEventListener('submit', function(e) {
    e.preventDefault();
    clearMessage(roleEditorMsg);
    saveRoleFromForm();
  });
}

if (roleAccessGrid) {
  roleAccessGrid.addEventListener('change', function(e) {
    var box = e.target.closest('[data-access-see], [data-access-edit]');
    if (box) syncAccessGridPair(box);
  });
}

if (newRoleBtn) newRoleBtn.addEventListener('click', function() { openRoleEditor(null); });
[roleEditorClose, roleEditorCancel].forEach(function(control) {
  if (control) control.addEventListener('click', closeRoleEditor);
});
if (roleEditorModal) {
  roleEditorModal.addEventListener('click', function(event) {
    if (event.target === roleEditorModal) closeRoleEditor();
  });
}

if (roleEditorDelete) {
  roleEditorDelete.addEventListener('click', async function() {
    var roleId = state.editingRoleId;
    if (!roleId) return;
    roleEditorDelete.disabled = true;
    try {
      await deleteRole(roleId);
    } finally {
      roleEditorDelete.disabled = false;
    }
  });
}

if (roleList) {
  roleList.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="edit-role"]');
    if (btn) openRoleEditor(btn.dataset.role);
  });
}

// One Escape handler for all three access dialogs, closing only the open one.
document.addEventListener('keydown', function(event) {
  if (event.key !== 'Escape') return;
  if (userAccessModal && userAccessModal.style.display === 'flex') closeAccessModal();
  else if (roleEditorModal && roleEditorModal.style.display === 'flex') closeRoleEditor();
  else if (inviteUserModal && inviteUserModal.style.display === 'flex') closeInviteModal();
});

siteSearchInput.addEventListener('input', function(e) {
  state.siteSearch = e.target.value;
  renderSites();
});

siteForm.addEventListener('submit', function(e) {
  e.preventDefault();
  var name   = siteNameInput.value.trim();
  var region = siteRegionInput.value.trim();
  var ops    = siteOpsInput.value.trim();
  if (!name || !region || !ops) {
    setMessage(siteMsg, 'error', 'Enter a bakery name, region, and ops area to add a site.');
    return;
  }
  state.siteMetaDraft[name] = { r: region, o: ops };
  siteNameInput.value  = '';
  siteRegionInput.value = '';
  siteOpsInput.value   = '';
  setDirty(true);
  setMessage(siteMsg, 'success', 'Added ' + name + ' to the site directory.');
  renderPortal();
});

siteList.addEventListener('input', function(e) {
  var input = e.target;
  if (!input.dataset.site || !input.dataset.field) return;
  updateSiteDraft(input.dataset.site, input.dataset.field, input.value);
});

siteList.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action="remove-site"]');
  if (btn) removeSite(btn.dataset.site);
});

if (regionAssignmentList) {
  regionAssignmentList.addEventListener('input', function(e) {
    var input = e.target;
    if (!input.dataset.region || !input.dataset.field) return;
    var user = resolveRegionAssignmentUser(input.value);
    updateRegionAssignmentDraft(
      input.dataset.region,
      input.dataset.field,
      user ? userLabel(user) : input.value,
      user ? user.uid : ''
    );
  });

  regionAssignmentList.addEventListener('change', function(e) {
    var input = e.target;
    if (!input.dataset.region || !input.dataset.field) return;
    var user = resolveRegionAssignmentUser(input.value);
    if (!user) return;
    input.value = userLabel(user);
    updateRegionAssignmentDraft(
      input.dataset.region,
      input.dataset.field,
      userLabel(user),
      user.uid
    );
  });
}

if (opsAreaAssignmentList) {
  opsAreaAssignmentList.addEventListener('input', function(e) {
    var input = e.target;
    if (!input.dataset.opsArea || !input.dataset.field || !input.dataset.index) return;
    var index = Number(input.dataset.index);
    if (input.dataset.field === 'homeBakery') {
      updateOpsAreaBaristaDraft(
        input.dataset.region,
        input.dataset.opsArea,
        index,
        'homeBakery',
        input.value
      );
      return;
    }
    var user = resolveRegionAssignmentUser(input.value);
    updateOpsAreaBaristaDraft(
      input.dataset.region,
      input.dataset.opsArea,
      index,
      'name',
      user ? userLabel(user) : input.value,
      user ? user.uid : ''
    );
  });

  // Picking from the people list stores the readable name rather than the
  // "Name — email" option text the datalist puts in the box.
  opsAreaAssignmentList.addEventListener('change', function(e) {
    var input = e.target;
    if (!input.dataset.opsArea || !input.dataset.field || !input.dataset.index) return;
    if (input.dataset.field === 'homeBakery') return;
    var user = resolveRegionAssignmentUser(input.value);
    if (!user) return;
    input.value = userLabel(user);
    updateOpsAreaBaristaDraft(
      input.dataset.region,
      input.dataset.opsArea,
      Number(input.dataset.index),
      'name',
      userLabel(user),
      user.uid
    );
  });

  opsAreaAssignmentList.addEventListener('click', function(e) {
    var addBtn = e.target.closest('[data-action="add-barista"]');
    if (addBtn) {
      addOpsAreaBarista(addBtn.dataset.region, addBtn.dataset.opsArea);
      return;
    }
    var removeBtn = e.target.closest('[data-action="remove-barista"]');
    if (removeBtn) {
      removeOpsAreaBarista(
        removeBtn.dataset.region,
        removeBtn.dataset.opsArea,
        Number(removeBtn.dataset.index)
      );
    }
  });
}

saveSitesBtn.addEventListener('click', async function() {
  saveSitesBtn.disabled = true;
  setMessage(siteMsg, 'info', 'Saving site data to Firebase…');
  try {
    var payload;
    if (window.GAILS_Firebase && typeof window.GAILS_Firebase.saveSiteMeta === 'function') {
      payload = await window.GAILS_Firebase.saveSiteMeta(
        state.siteMetaDraft,
        state.siteImportInfo,
        state.regionAssignmentsDraft,
        state.opsAreaAssignmentsDraft
      );
    } else {
      payload = buildSiteMetaPayload(
        state.siteMetaDraft,
        state.siteImportInfo,
        state.regionAssignmentsDraft,
        state.opsAreaAssignmentsDraft
      );
      await set(ref(db, 'portalData/siteMeta'), payload);
    }
    state.siteMetaSource = cloneMeta(state.siteMetaDraft);
    state.regionAssignmentsSource = cloneMeta((payload && payload.regionAssignments) || []);
    state.regionAssignmentsDraft = cloneMeta(state.regionAssignmentsSource);
    state.opsAreaAssignmentsSource = cloneMeta((payload && payload.opsAreaAssignments) || []);
    state.opsAreaAssignmentsDraft = cloneMeta(state.opsAreaAssignmentsSource);
    state.siteMetaSourceInfo = normalizeSiteImportInfo({
      fileName: payload && payload.sourceName,
      sheetName: payload && payload.sourceSheetName,
      duplicateCount: payload && payload.duplicateCount,
      siteCount: payload && payload.siteCount,
      updatedAt: payload && payload.updatedAt,
      updatedBy: payload && payload.updatedBy
    });
    state.siteImportInfo = state.siteMetaSourceInfo ? cloneMeta(state.siteMetaSourceInfo) : null;
    setDirty(false);
    setMessage(siteMsg, 'success', 'Site directory saved for all dashboard users.');
    renderPortal();
  } catch (err) {
    setMessage(siteMsg, 'error', 'Error: ' + err.message);
  } finally {
    saveSitesBtn.disabled = false;
  }
});

resetSitesBtn.addEventListener('click', function() {
  state.siteMetaDraft = cloneMeta(state.siteMetaSource);
  state.regionAssignmentsDraft = cloneMeta(state.regionAssignmentsSource);
  state.opsAreaAssignmentsDraft = cloneMeta(state.opsAreaAssignmentsSource);
  state.siteImportInfo = state.siteMetaSourceInfo ? cloneMeta(state.siteMetaSourceInfo) : null;
  setDirty(false);
  clearMessage(siteMsg);
  renderPortal();
});

if (siteImportBrowseBtn) {
  siteImportBrowseBtn.addEventListener('click', function(event) {
    event.stopPropagation();
    if (siteImportInput) siteImportInput.click();
  });
}

if (siteImportInput) {
  siteImportInput.addEventListener('change', function(event) {
    if (event.target.files && event.target.files[0]) {
      importSiteWorkbook(event.target.files[0]);
    }
  });
}

if (siteImportZone) {
  siteImportZone.addEventListener('click', function() {
    if (siteImportInput) siteImportInput.click();
  });

  siteImportZone.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (siteImportInput) siteImportInput.click();
    }
  });

  siteImportZone.addEventListener('dragover', function(event) {
    event.preventDefault();
    siteImportZone.classList.add('drag-over');
  });

  siteImportZone.addEventListener('dragleave', function(event) {
    if (event.target === siteImportZone) {
      siteImportZone.classList.remove('drag-over');
    }
  });

  siteImportZone.addEventListener('drop', function(event) {
    event.preventDefault();
    siteImportZone.classList.remove('drag-over');
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      importSiteWorkbook(event.dataTransfer.files[0]);
    }
  });
}

if (datasetImportBrowseBtn) {
  datasetImportBrowseBtn.addEventListener('click', function(event) {
    event.stopPropagation();
    if (datasetImportInput) datasetImportInput.click();
  });
}

if (datasetImportInput) {
  datasetImportInput.addEventListener('change', function(event) {
    if (event.target.files && event.target.files[0]) {
      importDatasetWorkbook(event.target.files[0]);
    }
  });
}

if (datasetImportZone) {
  datasetImportZone.addEventListener('click', function() {
    if (datasetImportInput) datasetImportInput.click();
  });

  datasetImportZone.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (datasetImportInput) datasetImportInput.click();
    }
  });

  datasetImportZone.addEventListener('dragover', function(event) {
    event.preventDefault();
    datasetImportZone.classList.add('drag-over');
  });

  datasetImportZone.addEventListener('dragleave', function(event) {
    if (event.target === datasetImportZone) {
      datasetImportZone.classList.remove('drag-over');
    }
  });

  datasetImportZone.addEventListener('drop', function(event) {
    event.preventDefault();
    datasetImportZone.classList.remove('drag-over');
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      importDatasetWorkbook(event.dataTransfer.files[0]);
    }
  });
}

portalUploadBtn.addEventListener('click', function() {
  window.location.href = 'index.html';
});

clearDatasetBtn.addEventListener('click', async function() {
  if (!confirm('Clear the shared Firebase dataset for everyone?')) return;
  clearDatasetBtn.disabled = true;
  setMessage(dataMsg, 'info', 'Clearing shared dataset…');
  try {
    await remove(ref(db, 'dashboardData'));
    await remove(ref(db, 'dashboardMeta'));
    state.datasetInfo = null;
    setMessage(dataMsg, 'success', 'Shared dataset cleared. Upload a fresh workbook here or from the dashboard to repopulate.');
    renderSummary();
    renderOverview();
    renderDataControls();
    renderImportZones();
  } catch (err) {
    setMessage(dataMsg, 'error', 'Error: ' + err.message);
  } finally {
    clearDatasetBtn.disabled = false;
  }
});

restoreMetaBtn.addEventListener('click', async function() {
  if (!confirm('Restore the shared site directory back to the default mapping in this app?')) return;
  restoreMetaBtn.disabled = true;
  setMessage(dataMsg, 'info', 'Restoring default site map…');
  try {
    var defaults = cloneMeta(window.GAILS && window.GAILS.DEFAULT_BAKERY_META ? window.GAILS.DEFAULT_BAKERY_META : {});
    var payload = buildSiteMetaPayload(
      defaults,
      { fileName: 'Default site map', siteCount: Object.keys(defaults).length },
      state.regionAssignmentsDraft,
      state.opsAreaAssignmentsDraft
    );
    await set(ref(db, 'portalData/siteMeta'), payload);
    state.siteMetaSource = cloneMeta(defaults);
    state.siteMetaDraft  = cloneMeta(defaults);
    state.regionAssignmentsSource = cloneMeta(payload.regionAssignments);
    state.regionAssignmentsDraft = cloneMeta(payload.regionAssignments);
    state.opsAreaAssignmentsSource = cloneMeta(payload.opsAreaAssignments);
    state.opsAreaAssignmentsDraft = cloneMeta(payload.opsAreaAssignments);
    state.siteMetaSourceInfo = normalizeSiteImportInfo({
      fileName: payload.sourceName,
      sheetName: payload.sourceSheetName,
      duplicateCount: payload.duplicateCount,
      siteCount: payload.siteCount,
      updatedAt: payload.updatedAt,
      updatedBy: payload.updatedBy
    });
    state.siteImportInfo = state.siteMetaSourceInfo ? cloneMeta(state.siteMetaSourceInfo) : null;
    setDirty(false);
    setMessage(dataMsg, 'success', 'Default site map restored.');
    renderPortal();
  } catch (err) {
    setMessage(dataMsg, 'error', 'Error: ' + err.message);
  } finally {
    restoreMetaBtn.disabled = false;
  }
});

// ── CQV import zone + confirm modal ──
if (cqvImportBrowseBtn) {
  cqvImportBrowseBtn.addEventListener('click', function(event) {
    event.stopPropagation();
    if (cqvImportInput) cqvImportInput.click();
  });
}

if (cqvBackfillAuditorsBtn) {
  cqvBackfillAuditorsBtn.addEventListener('click', function(event) {
    event.stopPropagation();
    backfillCqvAuditors();
  });
}

if (cqvImportInput) {
  cqvImportInput.addEventListener('change', function(event) {
    if (event.target.files && event.target.files[0]) {
      handleCqvFile(event.target.files[0]);
    }
  });
}

if (cqvImportZone) {
  cqvImportZone.addEventListener('click', function() {
    if (cqvImportInput) cqvImportInput.click();
  });

  cqvImportZone.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (cqvImportInput) cqvImportInput.click();
    }
  });

  cqvImportZone.addEventListener('dragover', function(event) {
    event.preventDefault();
    cqvImportZone.classList.add('drag-over');
  });

  cqvImportZone.addEventListener('dragleave', function(event) {
    if (event.target === cqvImportZone) {
      cqvImportZone.classList.remove('drag-over');
    }
  });

  cqvImportZone.addEventListener('drop', function(event) {
    event.preventDefault();
    cqvImportZone.classList.remove('drag-over');
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      handleCqvFile(event.dataTransfer.files[0]);
    }
  });
}

if (cqvConfirmClose) cqvConfirmClose.addEventListener('click', closeCqvConfirmModal);
if (cqvConfirmCancel) cqvConfirmCancel.addEventListener('click', closeCqvConfirmModal);
if (cqvConfirmModal) {
  cqvConfirmModal.addEventListener('click', function(e) {
    if (e.target === cqvConfirmModal) closeCqvConfirmModal();
  });
}
if (cqvConfirmSubmitBtn) cqvConfirmSubmitBtn.addEventListener('click', saveCqvRecord);
