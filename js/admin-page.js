import { firebaseConfig, db, storage, auth as primaryAuth } from './firebase-config.js';
import { ref, set, update, push, remove, onValue, get, query, limitToLast, orderByKey } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, updateProfile, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-functions.js";
import {
  ACCESS_GROUPS, accessRowsForGroup, readAccessGrid, permissionsFromAccessGrid,
  TEAM_SCOPES, normalizeTeamScope, teamScopeLabel, describeVisibility, describeEditing,
  DASHBOARD_TABS, ADMIN_AREAS, BUILTIN_ROLES, normalizePermissions, resolveRolePermissions,
  hasAdminPanelAccess, canViewArea, canEditArea, canSeeTeam,
  NOTIFICATION_SCOPES, normalizeNotificationScope, notificationScopeLabel
} from './permissions.js';
import { createProfileMenu } from './profile-menu.js';
import { recordNotification } from './notification-write.js';
import { mountNotificationCentre } from './notification-centre.js';

const secondaryApp = initializeApp(firebaseConfig, 'AdminPage');
const secondaryAuth = getAuth(secondaryApp);
const functionsClient = getFunctions();
const setUserPasswordCall = httpsCallable(functionsClient, 'setUserPassword');

// ── DOM refs ──
const authGuard       = document.getElementById('authGuard');
const adminPage       = document.getElementById('adminPage');
const signOutBtn      = document.getElementById('adminPageSignOut');
const workspaceShell  = document.getElementById('adminWorkspaceShell');
const sidebarToggleBtn = document.getElementById('adminSidebarToggle');
const sidebarToggleLabel = document.querySelector('[data-admin-sidebar-toggle-label]');
const nav             = document.getElementById('adminPortalNav');
const workspaceMain   = document.querySelector('.admin-workspace__main');
const panels          = Array.from(document.querySelectorAll('[data-admin-panel-content]'));
const summaryCards    = document.getElementById('adminSummaryCards');
const overviewGrid    = document.getElementById('adminOverviewGrid');
const heroSummary     = document.getElementById('adminHeroSummary');
const heroMeta        = document.getElementById('adminHeroMeta');
const panelTitle      = document.getElementById('adminPanelTitle');
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
const newDepartmentSelect = document.getElementById('newDepartmentSelect');
const newManagerSelect = document.getElementById('newManagerSelect');
const newOpsSelect    = document.getElementById('newOpsSelect');
const createMsg       = document.getElementById('createMsg');
const usersMsg        = document.getElementById('usersMsg');
const userSearchInput = document.getElementById('userSearchInput');
const userDepartmentFilter = document.getElementById('userDepartmentFilter');
const userRoleFilter  = document.getElementById('userRoleFilter');
const userStatusFilter = document.getElementById('userStatusFilter');
const userSortSelect  = document.getElementById('userSortSelect');
const userTableMeta   = document.getElementById('userTableMeta');

// Person access modal — one person's whole access picture in one dialog.
const userAccessModal   = document.getElementById('userAccessModal');
const userAccessClose   = document.getElementById('userAccessClose');
const userAccessCancel  = document.getElementById('userAccessCancel');
const userAccessSave    = document.getElementById('userAccessSave');
const userAccessRemove  = document.getElementById('userAccessRemove');
const userAccessResetPw = document.getElementById('userAccessResetPassword');
const userAccessSetPassword = document.getElementById('userAccessSetPassword');
const userAccessPasswordPanel = document.getElementById('userAccessPasswordPanel');
const userAccessPasswordMsg = document.getElementById('userAccessPasswordMsg');
const userAccessNewPassword = document.getElementById('userAccessNewPassword');
const userAccessConfirmPassword = document.getElementById('userAccessConfirmPassword');
const userAccessShowPassword = document.getElementById('userAccessShowPassword');
const userAccessPasswordCancel = document.getElementById('userAccessPasswordCancel');
const userAccessPasswordSubmit = document.getElementById('userAccessPasswordSubmit');
const userAccessTitle   = document.getElementById('userAccessTitle');
const userAccessEmail   = document.getElementById('userAccessEmail');
const userAccessFirstName = document.getElementById('userAccessFirstName');
const userAccessLastName = document.getElementById('userAccessLastName');
const userAccessRole    = document.getElementById('userAccessRole');
const userAccessDepartment = document.getElementById('userAccessDepartment');
const userAccessDepartmentOperations = document.getElementById('userAccessDepartmentOperations');
const userAccessDepartmentCoffeeTeam = document.getElementById('userAccessDepartmentCoffeeTeam');
const userAccessManager = document.getElementById('userAccessManager');
const userAccessNotifications = document.getElementById('userAccessNotifications');
const userAccessPatchList = document.getElementById('userAccessPatchList');
const userAccessPatchSummary = document.getElementById('userAccessPatchSummary');
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
const saveSitesBar    = document.getElementById('adminSaveBar');
const saveSitesBarDetail = document.getElementById('adminSaveBarDetail');
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

const clearDatasetBtn = document.getElementById('clearDatasetBtn');
const restoreMetaBtn  = document.getElementById('restoreMetadataBtn');
const syncCoordinatesBtn = document.getElementById('syncCoordinatesBtn');
const exportSiteMetaBtn = document.getElementById('exportSiteMetaBtn');
const compactSidebarMedia = window.matchMedia('(max-width: 980px)');
const activityLogList     = document.getElementById('activityLogList');
const visitSearchInput    = document.getElementById('visitSearchInput');
const visitTableMeta      = document.getElementById('visitTableMeta');
const visitTypeFilter     = document.getElementById('visitTypeFilter');
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
const deleteConfirmTitle  = document.getElementById('deleteConfirmTitle');
const deleteConfirmWord   = document.getElementById('deleteConfirmWord');

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
const roleNotificationScope = document.getElementById('roleNotificationScope');
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
const unsavedChangesModal = document.getElementById('unsavedChangesModal');
const unsavedChangesClose = document.getElementById('unsavedChangesClose');
const unsavedChangesCancel = document.getElementById('unsavedChangesCancel');
const unsavedChangesDiscard = document.getElementById('unsavedChangesDiscard');
const unsavedChangesSave  = document.getElementById('unsavedChangesSave');
const unsavedChangesMessage = document.getElementById('unsavedChangesMessage');

// ── Routine visit schema ──
// Sourced from js/visit-schema.js (shared with index.html's js/visit-report.js)
// so the form structure can't drift between the editable admin view and the
// read-only dashboard report. Keep that file in sync with
// apps-script/RoutineVisitSync.gs's QUESTION_MAP when questions change.
const VISIT_GENERAL_FIELDS = window.GAILS_VISIT_SCHEMA.general;
const VISIT_SECTIONS = window.GAILS_VISIT_SCHEMA.sections;
const DEPARTMENTS = [
  { id: 'operations', name: 'Operations' },
  { id: 'coffee-team', name: 'Coffee Team' }
];

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
  // People table search, filters and sort. Held in state rather than read off the
  // inputs so a re-render from a remote change cannot silently drop them.
  userSearch: '',
  userDepartment: '',
  userRole: '',
  userStatus: '',
  userSort: 'name',
  datasetInfo: null,
  siteImportInfo: null,
  visits: [],
  visitSearch: '',
  visitType: '',
  visitDetailId: null,
  cqvPending: null, // { record, warnings, file } awaiting confirmation in cqvConfirmModal
  roles: {},        // custom roles synced from roles/ in Firebase
  editingRoleId: null,
  permissions: normalizePermissions(BUILTIN_ROLES.viewer.permissions),
  isAdmin: false,
  isFullAdmin: false,
  reportVisibilityEnabled: false
};

let usersUnsubscribe = null;
let visitsUnsubscribe = null;
let rolesUnsubscribe = null;
let appSettingsUnsubscribe = null;
const dirtyDrafts = new Set();
let unsavedChangesResolve = null;

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

function normalizeDepartment(value) {
  var normalized = String(value || '').trim().toLowerCase();
  var department = DEPARTMENTS.find(function(item) {
    return item.id === normalized || item.name.toLowerCase() === normalized;
  });
  return department ? department.id : '';
}

function departmentName(value) {
  var normalized = normalizeDepartment(value);
  var department = DEPARTMENTS.find(function(item) { return item.id === normalized; });
  return department ? department.name : 'Unassigned';
}

function departmentOptionsHtml(selected, requireSelection) {
  var current = normalizeDepartment(selected);
  var emptyLabel = requireSelection ? 'Choose a department' : 'Unassigned';
  return '<option value=""' + (current ? '' : ' selected') + (requireSelection ? ' disabled' : '') + '>'
    + emptyLabel + '</option>'
    + DEPARTMENTS.map(function(department) {
      return '<option value="' + escapeHtml(department.id) + '"'
        + (department.id === current ? ' selected' : '') + '>'
        + escapeHtml(department.name) + '</option>';
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

// ── The patch editor ──
// Which part of the estate one person looks after, as regions each holding
// their ops areas — so a single control answers both "which areas does this ops
// manager run" and "which regions does this regional manager cover".
//
// The draft holds plain names, because names are what the admin is ticking. The
// bakeries each area holds are stamped on at save time, and they are what lets
// the assignment survive the area being renamed after a leaver. See js/patch.js.
function patchApi() {
  return window.GAILS && window.GAILS.Patch;
}

function patchEstateTree() {
  var byRegion = {};
  var order = [];
  Object.keys(state.siteMetaDraft || {}).forEach(function(bakery) {
    var entry = (state.siteMetaDraft || {})[bakery] || {};
    var region = String(entry.r || '').trim();
    var opsArea = String(entry.o || '').trim();
    if (!region) return;
    if (!byRegion[region]) {
      byRegion[region] = { region: region, opsAreas: [], seen: {} };
      order.push(region);
    }
    if (!opsArea || byRegion[region].seen[opsArea]) return;
    byRegion[region].seen[opsArea] = true;
    byRegion[region].opsAreas.push(opsArea);
  });
  return order.sort().map(function(region) {
    return { region: region, opsAreas: byRegion[region].opsAreas.sort() };
  });
}

function draftPatch() {
  if (!state.accessDraft) return { opsAreas: [], regions: [] };
  if (!state.accessDraft.patch) state.accessDraft.patch = { opsAreas: [], regions: [] };
  return state.accessDraft.patch;
}

function renderPatchEditor(editable) {
  if (!userAccessPatchList) return;
  var patch = draftPatch();
  var pickedAreas = patch.opsAreas.map(function(area) { return area.opsArea; });
  var tree = patchEstateTree();

  if (!tree.length) {
    userAccessPatchList.innerHTML = '<p class="admin-empty">Upload or add site data to map regions and ops areas.</p>';
  } else {
    userAccessPatchList.innerHTML = tree.map(function(node) {
      var wholeRegion = patch.regions.indexOf(node.region) !== -1;
      var areas = node.opsAreas.map(function(area) {
        // A whole region already includes every area inside it, so those ticks
        // read as covered rather than as a second thing to choose.
        var checked = wholeRegion || pickedAreas.indexOf(area) !== -1;
        return '<label class="access-patch__area">'
          + '<input type="checkbox" data-patch-ops-area="' + escapeHtml(area) + '"'
          + ' data-patch-region="' + escapeHtml(node.region) + '"'
          + (checked ? ' checked' : '')
          + (editable && !wholeRegion ? '' : ' disabled') + '>'
          + '<span>' + escapeHtml(area) + '</span>'
          + '</label>';
      }).join('');
      return '<div class="access-patch__region">'
        + '<label class="access-patch__region-head">'
        + '<input type="checkbox" data-patch-region-all="' + escapeHtml(node.region) + '"'
        + (wholeRegion ? ' checked' : '') + (editable ? '' : ' disabled') + '>'
        + '<strong>' + escapeHtml(node.region) + '</strong>'
        + '<span class="access-patch__count">' + escapeHtml(formatCount(node.opsAreas.length, 'area', 'areas')) + '</span>'
        + '</label>'
        + '<div class="access-patch__areas">' + areas + '</div>'
        + '</div>';
    }).join('');
  }

  if (!userAccessPatchSummary) return;
  var api = patchApi();
  var resolved = api ? api.resolvePatch(patch, state.siteMetaDraft) : null;
  var parts = [resolved && resolved.bakeries.length
    ? formatCount(resolved.bakeries.length, 'bakery', 'bakeries')
    : 'The whole estate'];
  // An area that has been renamed since it was saved, or has left the directory
  // altogether, is called out so the admin can see it rather than being told
  // nothing while the assignment quietly stops matching.
  (resolved ? resolved.opsAreas : []).forEach(function(area) {
    if (area.renamed) parts.push('“' + area.savedAs.opsArea + '” is now “' + area.opsArea + '”');
  });
  (resolved ? resolved.unresolved : []).forEach(function(area) {
    parts.push('“' + area.opsArea + '” is no longer in the site directory');
  });
  userAccessPatchSummary.textContent = parts.join(' · ');
}

function togglePatchRegion(region, on) {
  var patch = draftPatch();
  patch.regions = patch.regions.filter(function(name) { return name !== region; });
  if (!on) return;
  patch.regions.push(region);
  // Taking the whole region makes any individual area inside it redundant.
  var inside = (patchEstateTree().filter(function(node) {
    return node.region === region;
  })[0] || {}).opsAreas || [];
  patch.opsAreas = patch.opsAreas.filter(function(area) {
    return inside.indexOf(area.opsArea) === -1;
  });
}

// The person's own notification choice. The empty option is not "nothing" — it
// is "follow my role", so the list names what the role currently gives them.
function notificationScopeOptionsHtml(selected, roleId) {
  var current = normalizeNotificationScope(selected) === selected ? selected : '';
  var inherited = notificationScopeLabel(permissionsForRole(roleId).notificationScope);
  return '<option value=""' + (current === '' ? ' selected' : '') + '>'
    + escapeHtml('Same as their role (' + inherited.toLowerCase() + ')') + '</option>'
    + NOTIFICATION_SCOPES.map(function(scope) {
      return '<option value="' + escapeHtml(scope.key) + '"' + (scope.key === current ? ' selected' : '') + '>'
        + escapeHtml(scope.label) + '</option>';
    }).join('');
}

function togglePatchOpsArea(region, opsArea, on) {
  var patch = draftPatch();
  patch.opsAreas = patch.opsAreas.filter(function(area) { return area.opsArea !== opsArea; });
  if (on) patch.opsAreas.push({ region: region, opsArea: opsArea, bakeries: [] });
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
  if (newDepartmentSelect) {
    var currentDepartment = normalizeDepartment(newDepartmentSelect.value);
    newDepartmentSelect.innerHTML = departmentOptionsHtml(currentDepartment, true);
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

// Republishing the dataset or the site directory changes the numbers under
// every bakery at once, so it reaches everybody's bell rather than one area's —
// see the estateWide flag in js/notifications.js. Best-effort: the save has
// already succeeded by the time this runs.
function announceDataUpdate(subject, detail) {
  recordNotification('data.updated', { subject: subject, detail: detail || '' });
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

// Notifications sit inside that menu, exactly as they do on every other page —
// see js/notification-centre.js.
const notificationCentre = mountNotificationCentre({
  root: document.querySelector('[data-notification-centre]'),
  trigger: document.querySelector('[data-notification-trigger]'),
  count: document.querySelector('[data-notification-count]'),
  dot: document.querySelector('[data-notification-dot]'),
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
  notificationCentre.update(user, profile, state.permissions);
  // My Activity is opt-in per user (users/{uid}.myActivity), so the menu entry
  // stays hidden until an admin grants it — including for admins themselves.
  var myActivityLink = document.querySelector('[data-my-activity-link]');
  if (myActivityLink) myActivityLink.hidden = !(profile && profile.myActivity === true);
  // My Team comes from the role's teamScope instead, so it follows whatever
  // access this account already resolved to.
  var myTeamLink = document.querySelector('[data-my-team-link]');
  if (myTeamLink) myTeamLink.hidden = !canSeeTeam(state.permissions);
  // This page is already guarded by the same permission, but keeping the item
  // gated makes the profile menu's contract identical on every page.
  var adminPortalLink = document.querySelector('[data-admin-portal-link]');
  if (adminPortalLink) adminPortalLink.hidden = !hasAdminPanelAccess(state.permissions);
}

// ── Helpers ──
function cloneMeta(meta) {
  return JSON.parse(JSON.stringify(meta || {}));
}

// Every region in the directory, each carrying the ops areas inside it and the
// bakeries those hold. A region only offers cover once it is divided into ops
// areas, since cover is handed out one area at a time — and an area is followed
// by its bakeries rather than its name, because ops areas are named after their
// ops manager. See js/region-assignments.js.
function detectedSiteRegions(meta) {
  var byRegion = {};
  var regions = [];
  Object.keys(meta || {}).forEach(function(bakery) {
    var entry = meta[bakery] || {};
    var region = String(entry.r || '').trim();
    if (!region) return;
    var key = region.toLowerCase();
    if (!byRegion[key]) {
      byRegion[key] = { region: region, opsAreas: [], _byOpsArea: {} };
      regions.push(byRegion[key]);
    }
    var opsArea = String(entry.o || '').trim();
    if (!opsArea) return;
    var opsKey = opsArea.toLowerCase();
    if (!byRegion[key]._byOpsArea[opsKey]) {
      byRegion[key]._byOpsArea[opsKey] = { opsArea: opsArea, bakeries: [] };
      byRegion[key].opsAreas.push(byRegion[key]._byOpsArea[opsKey]);
    }
    byRegion[key]._byOpsArea[opsKey].bakeries.push(bakery);
  });
  return regions.map(function(entry) {
    return { region: entry.region, opsAreas: entry.opsAreas };
  }).sort(function(a, b) {
    return a.region.localeCompare(b.region);
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
  updateSiteSaveControls();
}

// What actually differs from what is saved, counted per kind. The bar names it
// so "Save changes" is a considered click rather than a hopeful one — and so a
// draft left behind by an earlier edit cannot masquerade as nothing.
function describeSiteChanges() {
  var parts = [];
  var savedSites = state.siteMetaSource || {};
  var draftSites = state.siteMetaDraft || {};
  var changedSites = 0;
  Object.keys(draftSites).forEach(function(name) {
    if (JSON.stringify(draftSites[name]) !== JSON.stringify(savedSites[name])) changedSites++;
  });
  var removedSites = Object.keys(savedSites).filter(function(name) {
    return !(name in draftSites);
  }).length;
  if (changedSites) parts.push(formatCount(changedSites, 'bakery', 'bakeries'));
  if (removedSites) parts.push(formatCount(removedSites, 'removal', 'removals'));

  if (JSON.stringify(state.regionAssignmentsDraft) !== JSON.stringify(state.regionAssignmentsSource)) {
    parts.push('region coffee team');
  }
  if (JSON.stringify(state.opsAreaAssignmentsDraft) !== JSON.stringify(state.opsAreaAssignmentsSource)) {
    parts.push('area head baristas');
  }
  if (hasSiteEntryDraft()) parts.push('a part-typed new bakery');
  return parts;
}

function updateSiteSaveControls() {
  var hasChanges = hasSiteChanges();
  if (saveSitesBar) saveSitesBar.hidden = !hasChanges;
  resetSitesBtn.disabled = !hasChanges;
  if (!hasChanges || !saveSitesBarDetail) return;
  var parts = describeSiteChanges();
  saveSitesBarDetail.textContent = parts.length
    ? 'Changed: ' + parts.join(' · ')
    : 'Not published yet — nobody else can see them.';
}

function markDraftDirty(context, flag) {
  if (flag === false) dirtyDrafts.delete(context);
  else dirtyDrafts.add(context);
}

function hasSiteEntryDraft() {
  return [siteNameInput, siteRegionInput, siteOpsInput].some(function(input) {
    return !!(input && input.value.trim());
  });
}

function hasSiteChanges() {
  return state.siteMetaDirty || hasSiteEntryDraft();
}

function hasUnsavedAdminChanges() {
  return hasSiteChanges() || dirtyDrafts.size > 0 || !!state.cqvPending;
}

function settleUnsavedChanges(choice) {
  if (!unsavedChangesResolve) return;
  var resolve = unsavedChangesResolve;
  unsavedChangesResolve = null;
  unsavedChangesModal.style.display = 'none';
  resolve(choice);
}

function promptUnsavedChanges(message) {
  if (!unsavedChangesModal) return Promise.resolve('cancel');
  if (unsavedChangesResolve) return Promise.resolve('cancel');
  if (unsavedChangesMessage) unsavedChangesMessage.textContent = message;
  unsavedChangesModal.style.display = 'flex';
  window.requestAnimationFrame(function() {
    if (unsavedChangesSave) unsavedChangesSave.focus();
  });
  return new Promise(function(resolve) {
    unsavedChangesResolve = resolve;
  });
}

// Browsers deliberately control the text and buttons shown during refresh,
// tab close, or address-bar navigation. Setting returnValue gives the user the
// native Stay/Leave choice; staying keeps every draft available to save.
window.addEventListener('beforeunload', function(event) {
  if (!hasUnsavedAdminChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

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

    // This workbook only carries region/ops columns. Coordinates are set by
    // hand in the Site Directory, so carry forward whatever is already saved
    // for a matching bakery rather than letting the missing value fall back
    // to the built-in default on every import.
    var existingKey = window.GAILS && typeof window.GAILS.resolveBakeryMetaKey === 'function'
      ? window.GAILS.resolveBakeryMetaKey(name)
      : name;
    var existingEntry = state.siteMetaDraft && state.siteMetaDraft[existingKey];
    if (existingEntry && Array.isArray(existingEntry.ll)) {
      meta[name].ll = existingEntry.ll;
    }
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

// Importing publishes straight to Firebase and then calls setDirty(false), so any
// unsaved edits sitting in the draft below the dropzone are thrown away. The old
// copy never said so — it led with what "will be kept", so an admin who had spent
// ten minutes retyping ops areas lost the ten minutes and was reassured about it.
//
// A dirty draft is now a three-way decision (save first / discard / keep editing)
// through the same dialog every other exit from a dirty state uses. A clean draft
// still gets a plain confirm, because nothing of yours is at stake — only the
// shared copy is being replaced.
async function confirmSiteImport() {
  if (hasSiteChanges()) {
    var choice = await promptUnsavedChanges(
      'You have unsaved site directory edits. Importing a workbook replaces the shared '
      + 'directory for everyone and discards those edits. Save them first?'
    );
    if (choice === 'cancel') return false;
    if (choice === 'save') {
      var saved = await saveSiteData();
      if (!saved) return false;
    } else {
      discardSiteChanges();
    }
    return true;
  }

  var hasDraft = Object.keys(state.siteMetaDraft).length > 0;
  if (!hasDraft) return true;
  return confirm('Importing a workbook will immediately replace the shared site directory for all dashboard users. Coffee Partner and Coffee Trainer details for matching regions, and Area Head Barista details for matching ops areas, will be kept. Continue?');
}

async function importSiteWorkbook(file) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) {
    setMessage(siteMsg, 'error', 'Please choose an Excel workbook ending in .xlsx or .xls.');
    return;
  }
  if (!(await confirmSiteImport())) {
    if (siteImportInput) siteImportInput.value = '';
    return;
  }

  setMessage(siteMsg, 'info', 'Reading ' + file.name + '...');
  if (siteImportBrowseBtn) siteImportBrowseBtn.disabled = true;

  try {
    // SheetJS is fetched on demand rather than at page load; both awaits run
    // while the user is still looking at the "Reading ..." message.
    await window.GAILS.ensureXLSX();
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
    announceDataUpdate('the site directory', imported.siteCount + ' sites from ' + file.name);

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

    // SheetJS is fetched on demand rather than at page load; both awaits run
    // while the user is still looking at the "Reading ..." message.
    await window.GAILS.ensureXLSX();
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
    announceDataUpdate('the shared dataset', payload.recordCount + ' rows from ' + file.name);
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

// Everything the workspace can work out for itself that somebody needs to deal
// with. This replaces four cards that restated the summary strip above them and
// a "Current Session" card that showed you your own email address.
//
// Each check reports a count and the panel that fixes it. A check that finds
// nothing is dropped rather than shown as a zero — an admin should be able to
// read this list as a to-do, not scan it for the non-zero rows.
function buildAttentionItems() {
  var items = [];
  var meta = state.siteMetaDraft || {};
  var siteNames = Object.keys(meta);

  if (hasSiteChanges()) {
    items.push({
      tone: 'warn', panel: 'sites', action: 'Review',
      title: 'Unsaved site directory changes',
      detail: 'Edits are held in this browser only. Nobody else sees them until you save.'
    });
  }

  var unplaced = siteNames.filter(function(name) {
    var entry = meta[name] || {};
    return !String(entry.r || '').trim() || !String(entry.o || '').trim();
  });
  if (unplaced.length) {
    items.push({
      tone: 'warn', panel: 'sites', action: 'Fix',
      title: formatCount(unplaced.length, 'bakery has', 'bakeries have') + ' no region or ops area',
      detail: 'They drop out of the Region and Ops Area filters everywhere on the dashboard.'
    });
  }

  var unpinned = siteNames.filter(function(name) {
    var ll = (meta[name] || {}).ll;
    return !Array.isArray(ll) || ll[0] == null || ll[1] == null;
  });
  if (unpinned.length) {
    items.push({
      tone: 'info', panel: 'sites', action: 'Fix',
      title: formatCount(unpinned.length, 'bakery has', 'bakeries have') + ' no coordinates',
      detail: 'They cannot be plotted on the dashboard map.'
    });
  }

  var pending = state.users.filter(function(u) {
    return u.invitation && u.invitation.status === 'pending';
  });
  if (pending.length) {
    items.push({
      tone: 'info', panel: 'access', action: 'View',
      title: formatCount(pending.length, 'invitation is', 'invitations are') + ' still unaccepted',
      detail: 'They have not chosen a password and confirmed their details yet.'
    });
  }

  var bounced = state.users.filter(function(u) {
    return u.invitation && u.invitation.status === 'delivery_failed';
  });
  if (bounced.length) {
    items.push({
      tone: 'danger', panel: 'access', action: 'Resend',
      title: formatCount(bounced.length, 'invitation email', 'invitation emails') + ' bounced',
      detail: 'Resend from that person’s access settings.'
    });
  }

  // A manager who has been removed leaves their reports pointing at nothing, so
  // those people quietly vanish from every My Team roster.
  var orphaned = state.users.filter(function(u) {
    return u.managerUid && !findUser(u.managerUid);
  });
  if (orphaned.length) {
    items.push({
      tone: 'danger', panel: 'access', action: 'Re-point',
      title: formatCount(orphaned.length, 'person reports', 'people report') + ' to a deleted account',
      detail: 'Their work no longer reaches anybody’s My Team page.'
    });
  }

  var missingAuditors = typeof missingCqvAuditorVisits === 'function' ? missingCqvAuditorVisits() : [];
  if (missingAuditors.length) {
    items.push({
      tone: 'info', panel: 'visits', action: 'Update',
      title: formatCount(missingAuditors.length, 'visit report is', 'visit reports are') + ' missing an auditor',
      detail: 'They are not credited to anyone’s activity until the name is filled in.'
    });
  }

  if (!(state.datasetInfo && state.datasetInfo.recordCount)) {
    items.push({
      tone: 'danger', panel: 'data', action: 'Upload',
      title: 'No shared workbook is synced',
      detail: 'The dashboard has no customer experience data to show anyone.'
    });
  }

  // Never point somebody at a panel their role cannot open. applyAdminAccessUI
  // hides the static [data-admin-panel-target] cards, but it runs once at boot
  // and these rows are built on every data change, so the filter belongs here.
  return items.filter(function(item) {
    var area = PANEL_AREAS[item.panel];
    return !area || canView(area);
  });
}

function renderOverview() {
  if (!overviewGrid) return;
  var items = buildAttentionItems();
  if (!items.length) {
    overviewGrid.innerHTML = '<div class="admin-attention__clear">'
      + '<strong>Nothing needs attention.</strong>'
      + '<span>The directory is complete, every invitation has landed, and the workbook is synced.</span>'
      + '</div>';
    return;
  }
  overviewGrid.innerHTML = items.map(function(item) {
    return '<div class="admin-attention__row admin-attention__row--' + escapeHtml(item.tone) + '">'
      + '<div class="admin-attention__body">'
        + '<strong>' + escapeHtml(item.title) + '</strong>'
        + '<span>' + escapeHtml(item.detail) + '</span>'
      + '</div>'
      + '<button type="button" class="admin-inline-btn" data-admin-panel-target="' + escapeHtml(item.panel) + '">'
        + escapeHtml(item.action) + '</button>'
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
  if (invitation.status === 'pending' && invitation.passwordSetAt) {
    return { label: 'Password ready', note: 'An admin set a password. Waiting for them to sign in and confirm their details.', tone: 'pending' };
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

// Search, filter and sort for the People table. `userStatus` already derives the
// tone every row shows, so the status filter reuses it rather than re-deriving
// the same rules a second way.
function getVisiblePeople() {
  var search = String(state.userSearch || '').trim().toLowerCase();
  var department = state.userDepartment || '';
  var role = state.userRole || '';
  var status = state.userStatus || '';
  var sort = state.userSort || 'name';

  var rows = state.users.filter(function(user) {
    if (search) {
      var haystack = (userLabel(user) + ' ' + (user.email || '')).toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (department && (user.department || 'unassigned') !== department) return false;
    if (role && (user.role || 'viewer') !== role) return false;
    if (status) {
      var tone = userStatus(user).tone;
      // "You" is an active account; it is only toned differently so the row can
      // say so. Filtering by Active should not hide the signed-in admin.
      if (tone === 'self') tone = 'active';
      if (tone !== status) return false;
    }
    return true;
  });

  var by = {
    name: function(u) { return userLabel(u).toLowerCase(); },
    department: function(u) { return departmentName(u.department) + ' ' + userLabel(u); },
    role: function(u) { return roleDisplayName(u.role) + ' ' + userLabel(u); },
    status: function(u) { return userStatus(u).label + ' ' + userLabel(u); }
  }[sort] || function(u) { return userLabel(u).toLowerCase(); };

  return rows.sort(function(a, b) {
    return String(by(a)).localeCompare(String(by(b)));
  });
}

// The role filter's options follow whatever roles exist, custom ones included.
function populateUserRoleFilter() {
  if (!userRoleFilter) return;
  var selected = state.userRole;
  var options = ['<option value="">All roles</option>'].concat(allRolesList().map(function(role) {
    return '<option value="' + escapeHtml(role.id) + '">' + escapeHtml(role.name) + '</option>';
  }));
  userRoleFilter.innerHTML = options.join('');
  // A custom role can be deleted while it is the active filter; falling back to
  // "All roles" is better than filtering by a role nobody holds any more.
  if (selected && userRoleFilter.querySelector('option[value="' + CSS.escape(selected) + '"]')) {
    userRoleFilter.value = selected;
  } else {
    state.userRole = '';
    userRoleFilter.value = '';
  }
}

function updateUserTableMeta(count) {
  if (!userTableMeta) return;
  userTableMeta.textContent = count === state.users.length
    ? formatCount(count, 'person', 'people')
    : count + ' of ' + formatCount(state.users.length, 'person', 'people');
}

function renderUsers() {
  if (!userList) return;
  populateUserRoleFilter();
  if (!state.users.length) {
    updateUserTableMeta(0);
    userList.innerHTML = '<tr><td colspan="7" class="admin-empty">Nobody has dashboard access yet.</td></tr>';
    return;
  }
  var visible = getVisiblePeople();
  updateUserTableMeta(visible.length);
  if (!visible.length) {
    userList.innerHTML = '<tr><td colspan="7" class="admin-empty">No one matches those filters.</td></tr>';
    return;
  }
  var canManageUsers = canEdit('users');
  userList.innerHTML = visible.map(function(user) {
    var isCurrent = currentUserId() === user.uid;
    var perms = permissionsForRole(user.role);
    var status = userStatus(user);
    var roleClass = user.role === 'admin' ? 'admin-pill admin-pill--admin' : 'admin-pill';
    var manager = findUser(user.managerUid);

    // Scope and feature switches sharpen the plain "can see" summary the role
    // gives, because those are per-person and the role summary cannot know them.
    var seeExtras = [];
    var patchLabel = describeUserPatch(user);
    if (patchLabel) seeExtras.push('Bakery Reports limited to ' + patchLabel);
    if (user.myActivity) seeExtras.push('My Activity hub');
    if (user.notificationScope) {
      seeExtras.push('Notified about: ' + notificationScopeLabel(user.notificationScope).toLowerCase());
    }

    return '<tr>'
      + '<td>'
        + '<div class="admin-table__title">' + escapeHtml(userLabel(user)) + '</div>'
        // The cell wraps at any character so long permission prose can fit, which
        // broke email addresses mid-word ("amara.bellweather@gails.ex / ample").
        // The address gets one line and an ellipsis, with the full value on hover.
        + '<div class="admin-status-note admin-user-email" title="' + escapeHtml(user.email || 'Unknown') + '">'
          + escapeHtml(user.email || 'Unknown') + '</div>'
        + '<div class="admin-status-note admin-status-note--' + escapeHtml(status.tone) + '">' + escapeHtml(status.label) + '</div>'
      + '</td>'
      + '<td><div class="admin-department-pill admin-department-pill--' + escapeHtml(user.department || 'unassigned') + '">'
        + escapeHtml(departmentName(user.department)) + '</div></td>'
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
    department: user.department === 'operations' || user.department === 'coffee-team' ? user.department : '',
    myTeamDepartments: {
      operations: !(user.hiddenMyTeamDepartments && user.hiddenMyTeamDepartments.operations === true),
      'coffee-team': !(user.hiddenMyTeamDepartments && user.hiddenMyTeamDepartments['coffee-team'] === true)
    },
    managerUid: user.managerUid || '',
    // The patch reads the new field and falls back to the original
    // users/{uid}.opsArea name, so nobody's existing scope is lost on the way
    // through. Saving stamps the current bakeries onto it — see js/patch.js.
    patch: patchApi()
      ? patchApi().normalizePatch(user.patch || user.opsArea)
      : { opsAreas: [], regions: [] },
    // Blank means "whatever their role says", which is what makes the role
    // default meaningful. Only an explicit choice is stored.
    notificationScope: user.notificationScope || '',
    myActivity: user.myActivity === true
  };
}

function hiddenMyTeamDepartmentsForDraft(draft) {
  var hidden = {};
  DEPARTMENTS.forEach(function(department) {
    if (!draft.myTeamDepartments || draft.myTeamDepartments[department.id] !== true) {
      hidden[department.id] = true;
    }
  });
  return Object.keys(hidden).length ? hidden : null;
}

function renderAccessReadout() {
  if (!state.accessDraft) return;
  var perms = permissionsForRole(state.accessDraft.role);
  var seeParts = [describeVisibility(perms)];
  var patchLabel = describeDraftPatch();
  if (patchLabel) seeParts.push('Bakery Reports limited to ' + patchLabel);
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

function describeUserPatch(user) {
  var api = patchApi();
  if (!api) return user && user.opsArea ? user.opsArea : '';
  var patch = (user && (user.patch || user.opsArea)) || null;
  if (api.isEmptyPatch(patch)) return '';
  return api.describePatch(api.resolvePatch(patch, state.siteMetaDraft));
}

// The patch in words, or '' for somebody who looks after the whole estate.
function describeDraftPatch() {
  var api = patchApi();
  if (!api || !state.accessDraft) return '';
  if (api.isEmptyPatch(state.accessDraft.patch)) return '';
  return api.describePatch(api.resolvePatch(state.accessDraft.patch, state.siteMetaDraft));
}

// Everything still reading the original single-area field gets the first area
// of the patch. A regional manager has no single ops area, so they get none —
// which is also what they had before the patch existed.
function firstPatchOpsArea(storedPatch) {
  var areas = (storedPatch && storedPatch.opsAreas) || [];
  return areas.length === 1 ? areas[0].opsArea : '';
}

function directReportCount(uid) {
  var api = teamApi();
  if (!api || !uid) return 0;
  return api.teamUnder(uid, state.users).length;
}

function resetUserPasswordPanel() {
  if (userAccessNewPassword) {
    userAccessNewPassword.value = '';
    userAccessNewPassword.type = 'password';
  }
  if (userAccessConfirmPassword) {
    userAccessConfirmPassword.value = '';
    userAccessConfirmPassword.type = 'password';
  }
  if (userAccessShowPassword) userAccessShowPassword.checked = false;
  if (userAccessPasswordSubmit) userAccessPasswordSubmit.disabled = false;
  clearMessage(userAccessPasswordMsg);
}

function closeUserPasswordPanel() {
  resetUserPasswordPanel();
  if (userAccessPasswordPanel) userAccessPasswordPanel.hidden = true;
  if (userAccessSetPassword) userAccessSetPassword.setAttribute('aria-expanded', 'false');
}

function openUserPasswordPanel() {
  if (!state.isFullAdmin || state.accessUserUid === currentUserId() || !userAccessPasswordPanel) return;
  resetUserPasswordPanel();
  userAccessPasswordPanel.hidden = false;
  if (userAccessSetPassword) userAccessSetPassword.setAttribute('aria-expanded', 'true');
  window.requestAnimationFrame(function() {
    if (userAccessNewPassword) userAccessNewPassword.focus();
  });
}

function managedPasswordErrorMessage(error) {
  var code = String(error && error.code || '').replace(/^functions\//, '');
  if (code === 'permission-denied') return 'Only a full administrator can set another person\'s password.';
  if (code === 'unauthenticated') return 'Your session has expired. Sign in again and retry.';
  if (code === 'failed-precondition') return error.message || 'That account is not ready for a password change.';
  if (code === 'not-found' || code === 'unimplemented') return 'The secure password service has not been deployed yet.';
  return error && error.message ? error.message : 'The password could not be changed. Please try again.';
}

function openAccessModal(uid) {
  var user = findUser(uid);
  if (!user || !userAccessModal) return;
  var isCurrent = currentUserId() === uid;
  var editable = canEdit('users') && !isCurrent;

  markDraftDirty('access', false);
  state.accessUserUid = uid;
  state.accessDraft = accessDraftFor(user);
  clearMessage(userAccessMsg);
  closeUserPasswordPanel();

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
  if (userAccessDepartment) {
    userAccessDepartment.innerHTML = departmentOptionsHtml(state.accessDraft.department, false);
    userAccessDepartment.disabled = !canEdit('users');
  }
  if (userAccessDepartmentOperations) {
    userAccessDepartmentOperations.checked = state.accessDraft.myTeamDepartments.operations;
    userAccessDepartmentOperations.disabled = !canEdit('users');
  }
  if (userAccessDepartmentCoffeeTeam) {
    userAccessDepartmentCoffeeTeam.checked = state.accessDraft.myTeamDepartments['coffee-team'];
    userAccessDepartmentCoffeeTeam.disabled = !canEdit('users');
  }
  if (userAccessManager) {
    userAccessManager.innerHTML = managerOptionsHtml(uid, state.accessDraft.managerUid);
    userAccessManager.disabled = !editable;
  }
  if (userAccessNotifications) {
    userAccessNotifications.innerHTML = notificationScopeOptionsHtml(
      state.accessDraft.notificationScope,
      state.accessDraft.role
    );
    userAccessNotifications.disabled = !canEdit('users');
  }
  renderPatchEditor(editable);
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
    userAccessResetPw.textContent = isInvite ? 'Resend invitation' : 'Send reset email';
    userAccessResetPw.hidden = !canEdit('users') || isCurrent;
  }
  if (userAccessSetPassword) {
    userAccessSetPassword.hidden = !state.isFullAdmin || isCurrent;
    userAccessSetPassword.disabled = false;
  }
  if (userAccessRemove) userAccessRemove.hidden = !editable;
  if (userAccessSave) userAccessSave.hidden = !canEdit('users');

  renderAccessReadout();
  userAccessModal.style.display = 'flex';
  window.requestAnimationFrame(function() {
    var firstControl = userAccessFirstName && !userAccessFirstName.disabled
      ? userAccessFirstName
      : userAccessClose;
    if (firstControl) firstControl.focus();
  });
}

function closeAccessModal() {
  markDraftDirty('access', false);
  closeUserPasswordPanel();
  state.accessUserUid = null;
  state.accessDraft = null;
  if (userAccessModal) userAccessModal.style.display = 'none';
}

async function requestCloseAccessModal() {
  if (!dirtyDrafts.has('access')) {
    closeAccessModal();
    return;
  }
  var choice = await promptUnsavedChanges('Save these access settings before closing?');
  if (choice === 'save') {
    if (userAccessSave) userAccessSave.click();
  } else if (choice === 'discard') {
    closeAccessModal();
  }
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

  renderScopeOptions(roleTeamScope, 'roleTeamScope', TEAM_SCOPES, 'none');
  renderScopeOptions(roleNotificationScope, 'roleNotificationScope', NOTIFICATION_SCOPES, 'area');
}

// The two three-way role settings — team view and notifications — are the same
// control, so they are drawn by the same function.
function renderScopeOptions(container, name, scopes, defaultKey) {
  if (!container) return;
  container.innerHTML = scopes.map(function(scope) {
    return '<label class="access-team__option">'
      + '<input type="radio" name="' + escapeHtml(name) + '" value="' + escapeHtml(scope.key) + '"'
      + (scope.key === defaultKey ? ' checked' : '') + '>'
      + '<span class="access-team__option-body">'
      + '<strong>' + escapeHtml(scope.label) + '</strong>'
      + '<span>' + escapeHtml(scope.description) + '</span>'
      + '</span>'
      + '</label>';
  }).join('');
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
  var perms = normalizePermissions(permissions);
  checkScopeOption(roleTeamScope, normalizeTeamScope(perms.teamScope));
  checkScopeOption(roleNotificationScope, normalizeNotificationScope(perms.notificationScope));
}

function checkScopeOption(container, value) {
  var radio = container && container.querySelector('[value="' + value + '"]');
  if (radio) radio.checked = true;
}

function checkedScopeValue(container, name, fallback) {
  var checked = container && container.querySelector('[name="' + name + '"]:checked');
  return checked ? checked.value : fallback;
}

function collectRoleGridValues() {
  var grid = {};
  ACCESS_ROWS_ALL().forEach(function(row) {
    var seeBox = roleAccessGrid && roleAccessGrid.querySelector('[data-access-see="' + row.key + '"]');
    var editBox = roleAccessGrid && roleAccessGrid.querySelector('[data-access-edit="' + row.key + '"]');
    grid[row.key] = { see: !!(seeBox && seeBox.checked), edit: !!(editBox && editBox.checked) };
  });
  return permissionsFromAccessGrid(
    grid,
    checkedScopeValue(roleTeamScope, 'roleTeamScope', 'none'),
    checkedScopeValue(roleNotificationScope, 'roleNotificationScope', 'area')
  );
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
  markDraftDirty('role', false);
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
  markDraftDirty('role', false);
  state.editingRoleId = null;
  if (roleEditorModal) roleEditorModal.style.display = 'none';
  clearMessage(roleEditorMsg);
}

async function requestCloseRoleEditor() {
  if (!dirtyDrafts.has('role')) {
    closeRoleEditor();
    return;
  }
  var choice = await promptUnsavedChanges('Save this role before closing the editor?');
  if (choice === 'save') {
    if (roleForm) roleForm.requestSubmit();
  } else if (choice === 'discard') {
    closeRoleEditor();
  }
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
      + '<td><div class="admin-status-note">' + escapeHtml(teamScopeLabel(perms.teamScope)) + '</div>'
      + '<div class="admin-status-note">Notified about: ' + escapeHtml(notificationScopeLabel(perms.notificationScope).toLowerCase()) + '</div></td>'
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

function regionCover(row) {
  var cover = row && row.cover;
  return {
    enabled: !!(cover && cover.enabled),
    areas: (cover && Array.isArray(cover.areas)) ? cover.areas : []
  };
}

function regionCoverAreasHtml(row, inputDisabled) {
  var cover = regionCover(row);
  if (!cover.enabled) return '';

  if (!cover.areas.length) {
    return '<tr class="admin-table__row--cover">'
      + '<td colspan="4" class="admin-empty">This region has no ops areas in the directory yet, so there is'
      + ' nothing to hand out \u2014 it stays with the region\u2019s own Coffee Partner and Coffee Trainer.</td>'
      + '</tr>';
  }

  return cover.areas.map(function(area) {
    var attrs = ' data-region="' + escapeHtml(row.region) + '"'
      + ' data-ops-area="' + escapeHtml(area.opsArea) + '"';
    // Both notes are display-only, and clear once the change is saved.
    var note = '';
    if (area.renamedFrom) {
      note = '<div class="admin-table__rename-note" title="Cover came across with this area\u2019s bakeries.">'
        + 'Renamed from ' + escapeHtml(area.renamedFrom) + '</div>';
    } else if (area.retained) {
      note = '<div class="admin-table__rename-note" title="This ops area is not in the current directory, and nobody has been dropped.">'
        + 'Not in the current directory</div>';
    }

    return '<tr class="admin-table__row--cover">'
      + '<td><div class="admin-table__cover-area">' + escapeHtml(area.opsArea) + '</div>' + note + '</td>'
      + '<td><input type="text" value="' + escapeHtml(regionAssignmentDisplayName(area, 'coffeePartner')) + '"'
        + attrs + ' data-field="coffeePartner"'
        + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Stays with the region"' + inputDisabled + '></td>'
      + '<td><input type="text" value="' + escapeHtml(regionAssignmentDisplayName(area, 'coffeeTrainer')) + '"'
        + attrs + ' data-field="coffeeTrainer"'
        + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Stays with the region"' + inputDisabled + '></td>'
      + '<td></td>'
      + '</tr>';
  }).join('');
}

function regionAssignmentsMetaText(rows) {
  var withTeam = 0;
  var onCover = 0;
  rows.forEach(function(row) {
    if (row.coffeePartner || row.coffeePartnerUid ||
        row.coffeeTrainer || row.coffeeTrainerUid) withTeam++;
    if (regionCover(row).enabled) onCover++;
  });
  return rows.length + ' detected region' + (rows.length === 1 ? '' : 's')
    + ' \u2022 ' + withTeam + ' with team details'
    + (onCover ? ' \u2022 ' + onCover + ' on cover' : '')
    + (state.siteMetaDirty ? ' \u2022 unsaved changes' : ' \u2022 all changes saved');
}

function renderRegionAssignments() {
  if (!regionAssignmentList) return;
  renderRegionAssignmentPeople();
  var rows = visibleRegionAssignments();

  if (regionAssignmentMeta) {
    regionAssignmentMeta.textContent = regionAssignmentsMetaText(rows);
  }

  if (!rows.length) {
    regionAssignmentList.innerHTML = '<tr><td colspan="4" class="admin-empty">Upload or add site data to detect regions.</td></tr>';
    return;
  }

  var assignmentsEditable = canEdit('sites');
  var inputDisabled = assignmentsEditable ? '' : ' disabled';
  regionAssignmentList.innerHTML = rows.map(function(row) {
    var cover = regionCover(row);
    var covering = cover.areas.filter(function(area) {
      return !!(area.coffeePartner || area.coffeePartnerUid ||
        area.coffeeTrainer || area.coffeeTrainerUid);
    }).length;
    var coverLabel = cover.enabled
      ? (covering ? covering + ' area' + (covering === 1 ? '' : 's') + ' covered' : 'No areas covered yet')
      : 'Off';

    return '<tr' + (cover.enabled ? ' class="admin-table__row--on-cover"' : '') + '>'
      + '<td><div class="admin-table__title">' + escapeHtml(row.region) + '</div></td>'
      + '<td><input type="text" value="' + escapeHtml(regionAssignmentDisplayName(row, 'coffeePartner')) + '"'
        + ' data-region="' + escapeHtml(row.region) + '" data-field="coffeePartner"'
        + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Type a person’s name"' + inputDisabled + '></td>'
      + '<td><input type="text" value="' + escapeHtml(regionAssignmentDisplayName(row, 'coffeeTrainer')) + '"'
        + ' data-region="' + escapeHtml(row.region) + '" data-field="coffeeTrainer"'
        + ' list="regionAssignmentPeople" autocomplete="off" placeholder="Type a person’s name"' + inputDisabled + '></td>'
      + '<td><label class="admin-cover-toggle">'
        + '<input type="checkbox" data-action="toggle-region-cover"'
        + ' data-region="' + escapeHtml(row.region) + '"'
        + (cover.enabled ? ' checked' : '')
        + ' aria-label="Cover ' + escapeHtml(row.region) + ' by ops area"'
        + inputDisabled + '>'
        + '<span>' + escapeHtml(coverLabel) + '</span>'
        + '</label></td>'
      + '</tr>'
      + regionCoverAreasHtml(row, inputDisabled);
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
    siteList.innerHTML = '<tr><td colspan="5" class="admin-empty">No sites match the current search.</td></tr>';
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
      + '<td><div class="admin-table__coords">'
      + '<input type="text" inputmode="decimal" value="' + escapeHtml(Array.isArray(row.entry.ll) ? row.entry.ll[0] : '') + '" data-site="' + escapeHtml(row.name) + '" data-coord="lat" placeholder="Latitude"' + siteInputDis + '>'
      + '<input type="text" inputmode="decimal" value="' + escapeHtml(Array.isArray(row.entry.ll) ? row.entry.ll[1] : '') + '" data-site="' + escapeHtml(row.name) + '" data-coord="lon" placeholder="Longitude"' + siteInputDis + '>'
      + '</div></td>'
      + '<td>' + (sitesEditable
          ? '<div class="admin-table__actions"><button type="button" class="admin-inline-danger" data-action="remove-site" data-site="' + escapeHtml(row.name) + '">Remove</button></div>'
          : '<div class="admin-status-note">View only</div>')
      + '</td>'
      + '</tr>';
  }).join('');
}

// Only facts about the dataset. This grid used to carry two cards that said
// nothing — "Current Browser Session — Admin page, no session data", and a site
// metadata count that belongs to (and is shown on) a different panel.
function renderDataControls() {
  var s = buildSummaryStats();
  dataGrid.innerHTML = [
    { label: 'Shared Workbook', value: s.recordCount ? s.recordCount + ' records' : 'No shared data',   meta: s.monthCount ? formatCount(s.monthCount, 'synced month', 'synced months') : 'Upload needed' },
    { label: 'Source File',     value: (state.datasetInfo && state.datasetInfo.sourceName) || 'None',   meta: s.recordCount ? 'Replaced whenever a new workbook is uploaded' : 'The dashboard has nothing to show' },
    { label: 'Last Sync',       value: s.updatedAt ? formatDate(s.updatedAt) : 'Not synced yet',        meta: s.updatedBy ? 'Updated by ' + s.updatedBy : 'No sync activity recorded' }
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
  if (state.visitType) {
    rows = rows.filter(function(v) {
      // A routine visit is the one kind with no `type` written on it.
      var kind = v.type || 'routine';
      return kind === state.visitType;
    });
  }
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
  var actionCount = (record.actionPlan || []).length;
  lines.push(actionCount + ' action item' + (actionCount === 1 ? '' : 's') + ' read from the action plan.');
  if (record.summary) {
    lines.push('Summary paragraph captured.');
  }
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
  window.requestAnimationFrame(function() {
    if (cqvConfirmBakery) cqvConfirmBakery.focus();
  });
}

function closeCqvConfirmModal() {
  cqvConfirmModal.style.display = 'none';
  state.cqvPending = null;
}

async function requestCloseCqvConfirmModal() {
  if (!state.cqvPending) {
    closeCqvConfirmModal();
    return;
  }
  var choice = await promptUnsavedChanges('Save this parsed visit report before closing?');
  if (choice === 'save') {
    saveCqvRecord();
  } else if (choice === 'discard') {
    closeCqvConfirmModal();
  }
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

// One action-plan item as the admin visit detail renders it. GoAudits prints
// the same block on a CQV and an NBO Coffee Visit export (see the shared
// collector in js/cqv-parser.js), so both detail views share this.
function visitActionItemsHtml(actionPlanItems) {
  return (actionPlanItems || []).map(function(a) {
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
}

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
  var actionItemsHtml = visitActionItemsHtml(actionPlanItems);

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

  // Summary and Action Plan come from the PDF (see js/nbo-parser.js) and are
  // only shown when it had them — imports predating that parsing carry
  // neither, and an empty card there would read as "the visit had none".
  var summaryHtml = visit.summary
    ? '<div class="visit-detail-section"><h4>Summary</h4><p class="visit-report-comment">' + escapeHtml(visit.summary) + '</p></div>'
    : '';
  var actionPlanHtml = (visit.actionPlan && visit.actionPlan.length)
    ? '<div class="visit-detail-section"><h4>Action Plan (' + visit.actionPlan.length + ')</h4>'
      + visitActionItemsHtml(visit.actionPlan) + '</div>'
    : '';

  return '<div class="visit-detail-section"><h4>Details</h4><div class="visit-detail-grid">' + basicHtml + '</div></div>'
    + '<div class="visit-detail-section"><h4>Derived Result</h4>'
    + '<p style="font-size:1.4rem; font-weight:800; color:var(--text);">' + escapeHtml(window.GAILS.NBOShared.pctText(visit)) + '</p>'
    + '<p class="visit-report-note">' + escapeHtml((counts.yes || 0) + ' Yes, ' + (counts.no || 0) + ' No'
      + (counts.na ? ', ' + counts.na + ' N/A' : '')) + '. This percentage is derived from the responses; the NBO PDF has no score of its own.</p>'
    + '</div>'
    + summaryHtml
    + sectionsHtml
    + actionPlanHtml
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
      var sectionData = window.getVisitSectionData(visit, section);
      var fieldsHtml = window.visibleSectionFields(section, sectionData).map(function(field) {
        return fieldInputHtml(section.key, field, window.getFieldValue(sectionData, field));
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
  markDraftDirty('visit', false);
  state.visitDetailId = id;
  visitDetailBody.innerHTML = buildVisitDetailHtml(visitForAttributionEdit(visit));
  if (window.GAILS.MentionField) window.GAILS.MentionField.enhanceAll(visitDetailBody);
  visitDetailModal.style.display = 'flex';
  window.requestAnimationFrame(function() {
    if (visitDetailClose) visitDetailClose.focus();
  });
}

function closeVisitDetail() {
  markDraftDirty('visit', false);
  visitDetailModal.style.display = 'none';
  visitDetailBody.innerHTML = '';
  state.visitDetailId = null;
}

async function requestCloseVisitDetail() {
  if (!dirtyDrafts.has('visit')) {
    closeVisitDetail();
    return;
  }
  var choice = await promptUnsavedChanges('Save the changes to this visit before closing?');
  if (choice === 'save') {
    var saveButton = visitDetailBody.querySelector('[data-action="save-visit-detail"]');
    if (saveButton) saveButton.click();
  } else if (choice === 'discard') {
    closeVisitDetail();
  }
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

// The type-to-confirm dialog. It used to be hard-wired to one job — deleting a
// single visit — while clearing the shared dataset for the whole company and
// restoring the default site map went through a native confirm(), a grey OS box
// where Enter defaults to OK. The severity ordering was exactly inverted, so the
// dialog now takes what it is confirming.
function openDeleteConfirmModal(promptText, options) {
  var opts = options || {};
  var word = (opts.confirmWord || 'delete record').toLowerCase();
  var confirmLabel = opts.confirmLabel || 'Delete visit';
  var pendingLabel = opts.pendingLabel || 'Deleting...';
  return new Promise((resolve) => {
    deleteConfirmPromptText.textContent = promptText;
    if (deleteConfirmTitle) deleteConfirmTitle.textContent = opts.title || 'Delete visit record';
    if (deleteConfirmWord) deleteConfirmWord.textContent = word;
    deleteConfirmInput.value = '';
    deleteConfirmInput.placeholder = word;
    deleteConfirmSubmitBtn.disabled = true;
    deleteConfirmSubmitBtn.textContent = confirmLabel;
    deleteConfirmModal.style.display = 'flex';
    window.requestAnimationFrame(function() {
      deleteConfirmInput.focus();
    });

    function onInput() {
      var matches = deleteConfirmInput.value.trim().toLowerCase() === word;
      deleteConfirmSubmitBtn.disabled = !matches;
    }

    async function onSubmit() {
      if (deleteConfirmInput.value.trim().toLowerCase() !== word) return;
      deleteConfirmSubmitBtn.disabled = true;
      deleteConfirmSubmitBtn.textContent = pendingLabel;
      cleanup();
      resolve(true);
    }
    
    function onCancel() {
      cleanup();
      deleteConfirmModal.style.display = 'none';
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
// The fallback when a panel is opened before its nav button exists (a deep link
// resolved during boot). The nav button's own label wins when there is one, so
// the two can never drift the way the old hard-coded banner default did.
var PANEL_TITLES = {
  overview: 'Overview',
  access: 'People & Access',
  sites: 'Site Data',
  data: 'Dataset',
  visits: 'Visits'
};

function switchPanel(panelName) {
  state.activePanel = panelName;
  // Searches deliberately survive a panel change. They used to be wiped here,
  // so stepping over to check something and coming back cost you the query.
  var activeButton = null;
  Array.from(nav.querySelectorAll('[data-admin-panel]')).forEach(function(btn) {
    var isActive = btn.dataset.adminPanel === panelName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    if (isActive) activeButton = btn;
  });
  panels.forEach(function(panel) {
    var isActive = panel.dataset.adminPanelContent === panelName;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', String(!isActive));
  });
  if (activeButton) {
    // The banner title is authored here rather than harvested out of the nav
    // button's hidden eyebrow/meta spans, which is what it used to do — ten
    // display:none spans maintained in admin.html purely to feed this line.
    var title = activeButton.querySelector('.admin-pg-nav__content strong');
    var label = title ? title.textContent.trim() : PANEL_TITLES[panelName] || 'Admin';
    if (panelTitle) panelTitle.textContent = label;
    document.title = label + ' — GAIL’s Admin';
  }
  if (panelName === 'overview') renderActivityLog();
}

async function resolveSiteChangesBeforeLeaving(message) {
  if (!hasSiteChanges()) return true;
  var choice = await promptUnsavedChanges(message || 'Save the site directory changes before continuing?');
  if (choice === 'save') return saveSiteData();
  if (choice === 'discard') {
    discardSiteChanges();
    return true;
  }
  return false;
}

async function navigateToAdminPanel(panelName) {
  if (!panelName || panelName === state.activePanel) return true;
  if (state.activePanel === 'sites') {
    var canLeave = await resolveSiteChangesBeforeLeaving('Save the site directory changes before switching admin views?');
    if (!canLeave) return false;
  }
  switchPanel(panelName);
  window.history.replaceState(null, '', 'admin.html#' + panelName);
  if (compactSidebarMedia.matches) setSidebarCollapsed(true);
  scrollPanelToTop();
  return true;
}

// Panels are long and share one scrolling canvas, so switching view would
// otherwise open the new panel wherever the last one happened to be scrolled
// to — part-way down, with its heading and controls out of sight. The window
// is reset too, for the narrow layout where the page itself scrolls.
function scrollPanelToTop() {
  if (workspaceMain) workspaceMain.scrollTop = 0;
  window.scrollTo(0, 0);
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
  var hiddenMyTeamDepartments = hiddenMyTeamDepartmentsForDraft(draft);

  // The signed-in admin may safely update their own name, but their role and
  // reporting line remain locked to prevent an accidental lockout.
  if (uid === currentUserId()) {
    await update(ref(db, 'users/' + uid), {
      firstName: firstName,
      lastName: lastName,
      department: normalizeDepartment(draft.department) || null,
      hiddenMyTeamDepartments: hiddenMyTeamDepartments
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

  // Stamping records the bakeries each ops area holds right now, which is what
  // lets the assignment follow that area through a rename. js/patch.js returns
  // null for an empty patch, so "looks after nothing in particular" leaves no
  // record behind.
  var storedPatch = patchApi() ? patchApi().toStored(draft.patch, state.siteMetaDraft) : null;

  await update(ref(db, 'users/' + uid), {
    firstName: firstName,
    lastName: lastName,
    role: draft.role,
    department: normalizeDepartment(draft.department) || null,
    hiddenMyTeamDepartments: hiddenMyTeamDepartments,
    patch: storedPatch,
    // Kept in step for everything still reading the original single-area field,
    // including the team directory the My Team page publishes.
    opsArea: firstPatchOpsArea(storedPatch),
    notificationScope: draft.notificationScope || null,
    managerUid: draft.managerUid,
    myActivity: draft.myActivity === true
  });
  // Only full admins may write the admins/ mirror (rules enforce this too) — and
  // that is state.isFullAdmin, read from the admins/ node itself. state.isAdmin is
  // also true for a custom role holding admin areas, so gating on it sent a
  // role-only admin into PERMISSION_DENIED *after* users/{uid} had been written,
  // leaving the two records out of step with no way to tell from the UI.
  if (state.isFullAdmin) {
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
      department: normalizeDepartment(user.department),
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
      department: person.department,
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
  if (state.isFullAdmin) {
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

// Both boxes write into the same [lat, lon] pair, so a coordinate is only
// saved once both halves parse - typing just one half leaves ll untouched
// rather than saving a broken single-number pin.
function updateSiteCoordinateDraft(name, part, value) {
  if (!state.siteMetaDraft[name]) state.siteMetaDraft[name] = { r: '', o: '' };
  var entry = state.siteMetaDraft[name];
  var current = Array.isArray(entry.ll) ? entry.ll : [null, null];
  var lat = part === 'lat' ? value : (current[0] != null ? current[0] : '');
  var lon = part === 'lon' ? value : (current[1] != null ? current[1] : '');
  var latText = String(lat == null ? '' : lat).trim();
  var lonText = String(lon == null ? '' : lon).trim();

  if (!latText && !lonText) {
    entry.ll = null;
  } else {
    var latNum = Number(latText);
    var lonNum = Number(lonText);
    if (latText && lonText && isFinite(latNum) && isFinite(lonNum) &&
        latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180) {
      entry.ll = [latNum, lonNum];
    }
    // An incomplete or out-of-range pair is left as-is in the draft (not
    // written to entry.ll) so a half-typed value can't be saved as a pin.
  }
  setDirty(true);
  updateSiteTableMeta(getVisibleSiteMeta().length);
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
  afterRegionAssignmentEdit();
}

// Deliberately does not re-render the table: the admin is typing into one of
// its inputs, and replacing the row would drop the caret.
function afterRegionAssignmentEdit() {
  setDirty(true);
  updateSiteTableMeta(getVisibleSiteMeta().length);
  if (regionAssignmentMeta) {
    regionAssignmentMeta.textContent = regionAssignmentsMetaText(visibleRegionAssignments());
  }
  renderSummary();
  renderOverview();
  renderDataControls();
}

// Cover for one ops area inside a region whose Coffee Partner or Coffee Trainer
// has left. Leaving a box empty is not a gap \u2014 that area simply stays with the
// region's own pair.
function updateRegionCoverDraft(region, opsArea, field, value, userUid) {
  var regions = detectedSiteRegions(state.siteMetaDraft);
  var next = regionAssignmentApi().updateCoverAssignment(
    regions,
    state.regionAssignmentsDraft,
    region,
    opsArea,
    field,
    value
  );
  next = regionAssignmentApi().updateCoverAssignment(
    regions,
    next,
    region,
    opsArea,
    field + 'Uid',
    userUid || ''
  );
  state.regionAssignmentsDraft = next;
  afterRegionAssignmentEdit();
  refreshRegionCoverLabel(region);
}

// The count beside a region's Cover toggle, kept current without repainting the
// table the admin is typing into.
function refreshRegionCoverLabel(region) {
  if (!regionAssignmentList) return;
  var toggle = regionAssignmentList.querySelector(
    '[data-action="toggle-region-cover"][data-region=' + JSON.stringify(String(region)) + ']'
  );
  var label = toggle && toggle.parentElement
    ? toggle.parentElement.querySelector('span')
    : null;
  if (!label) return;
  var covered = regionAssignmentApi().coveredAreas(state.regionAssignmentsDraft, region).length;
  label.textContent = covered
    ? formatCount(covered, 'area', 'areas') + ' covered'
    : 'No areas covered yet';
}

// Switching cover on opens a row per ops area; switching it off hands the whole
// region back to its own Coffee Partner and Coffee Trainer, which is what
// happens once a permanent replacement is in post. Because that discards the
// split, an admin ending cover that somebody is actually providing is asked
// first. Repaints either way \u2014 the shape of the table changes.
function toggleRegionCover(region, enabled) {
  if (!enabled) {
    var covered = regionAssignmentApi().coveredAreas(state.regionAssignmentsDraft, region);
    if (covered.length && !confirm(
      'End cover for ' + region + '?\n\n'
      + formatCount(covered.length, 'ops area', 'ops areas')
      + ' will go back to the region\u2019s own Coffee Partner and Coffee Trainer, '
      + 'and who was covering them will not be kept.'
    )) {
      renderRegionAssignments();
      return;
    }
  }

  state.regionAssignmentsDraft = regionAssignmentApi().setCover(
    detectedSiteRegions(state.siteMetaDraft),
    state.regionAssignmentsDraft,
    region,
    enabled
  );
  afterRegionAssignmentEdit();
  renderRegionAssignments();
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
            department: normalizeDepartment(users[uid].department),
            opsArea: users[uid].opsArea || '',
            // Which part of the estate they look after — see js/patch.js. The
            // original single-area field above is kept in step alongside it.
            patch: users[uid].patch || null,
            // Blank means "follow my role", so it is stored only when someone
            // has actually chosen for themselves.
            notificationScope: users[uid].notificationScope || '',
            // The whole reporting hierarchy is derived from this one field.
            managerUid: users[uid].managerUid || '',
            // Absent means off: My Activity is opt-in, so a user who has never
            // been granted it does not have it.
            myActivity: users[uid].myActivity === true,
            hiddenMyTeamDepartments: users[uid].hiddenMyTeamDepartments || null,
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
      resetSitesBtn,
      restoreMetaBtn,
      syncCoordinatesBtn
    ],
    // Restore Default Site Map and Sync Coordinates Only both write the SITE
    // DIRECTORY, not the dataset — portalData/siteMeta, which database.rules.json
    // gates on admin.sites === 'edit'. Gating them on `dataset` showed them to a
    // dataset-only role, whose click either failed with PERMISSION_DENIED after
    // the local state had already been overwritten, or left the portal
    // permanently dirty with the Save and Discard controls hidden.
    dataset: [
      document.querySelector('[data-admin-panel-content="data"] .admin-dataset-upload'),
      clearDatasetBtn
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
    // Independent reads, so one round trip rather than two before the portal
    // can decide what to show.
    var gateSnaps = await Promise.all([
      get(ref(db, 'admins/' + user.uid)),
      get(ref(db, 'users/'  + user.uid))
    ]);
    var adminSnap = gateSnaps[0];
    var userSnap  = gateSnaps[1];

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
    state.isFullAdmin = adminSnap.exists() && adminSnap.val() === true;
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
[unsavedChangesClose, unsavedChangesCancel].forEach(function(control) {
  if (control) control.addEventListener('click', function() {
    settleUnsavedChanges('cancel');
  });
});
if (unsavedChangesDiscard) {
  unsavedChangesDiscard.addEventListener('click', function() {
    settleUnsavedChanges('discard');
  });
}
if (unsavedChangesSave) {
  unsavedChangesSave.addEventListener('click', function() {
    settleUnsavedChanges('save');
  });
}
if (unsavedChangesModal) {
  unsavedChangesModal.addEventListener('click', function(event) {
    if (event.target === unsavedChangesModal) settleUnsavedChanges('cancel');
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

// ── Modal focus management ──
// Seven dialogs on this page declared aria-modal="true" and none of them behaved
// modally: Tab walked straight out of the person access modal into the People
// table behind it, closing dropped focus on <body>, and the wheel scrolled the
// table under the overlay. js/drilldown.js — the Focus Bakery modal — already
// solves all three; this is the same idea fitted to this page's shape.
//
// Every modal here is opened and closed by writing style.display, from a lot of
// different call sites. Rather than find and wrap each one, this watches the
// overlays for that attribute changing, so a modal opened from anywhere is
// covered — including any added later.
var modalOverlays = Array.from(document.querySelectorAll('.modal-overlay'));
var modalReturnFocus = new WeakMap();
var lockedWorkspaceScroll = null;

function isModalOpen(modal) {
  return !!modal && modal.style.display !== 'none' && modal.style.display !== '';
}

function openModals() {
  return modalOverlays.filter(isModalOpen);
}

function focusableWithin(modal) {
  return Array.prototype.slice.call(modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]),'
    + ' textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
  )).filter(function(el) {
    return !el.hidden && el.offsetParent !== null;
  });
}

function onModalOpened(modal) {
  // Whatever had focus is where focus goes back to on close — usually the row
  // button that opened the dialog, which is the row you want to carry on from.
  modalReturnFocus.set(modal, document.activeElement);
  // The page shell is fixed at 100dvh, so the thing that scrolls behind an
  // overlay is .admin-workspace__main, not <body>.
  if (workspaceMain && lockedWorkspaceScroll === null) {
    lockedWorkspaceScroll = workspaceMain.scrollTop;
    workspaceMain.style.overflow = 'hidden';
  }
}

function onModalClosed(modal) {
  var returnTo = modalReturnFocus.get(modal);
  modalReturnFocus.delete(modal);
  if (!openModals().length && workspaceMain && lockedWorkspaceScroll !== null) {
    workspaceMain.style.overflow = '';
    workspaceMain.scrollTop = lockedWorkspaceScroll;
    lockedWorkspaceScroll = null;
  }
  // Take focus back when it is adrift — on <body>, on nothing, or still sitting
  // on a control inside the dialog that has just been hidden. A close that
  // deliberately moved focus somewhere else keeps it there.
  //
  // This runs from a MutationObserver, so the browser may not have moved focus
  // off the hidden subtree yet; treating "still inside the closed modal" as
  // adrift is what makes the restore reliable rather than timing-dependent.
  if (!returnTo || !document.contains(returnTo)) return;
  var active = document.activeElement;
  var adrift = !active || active === document.body || modal.contains(active);
  if (!adrift) return;
  try { returnTo.focus(); } catch { /* element became unfocusable */ }
}

modalOverlays.forEach(function(modal) {
  var wasOpen = isModalOpen(modal);
  new MutationObserver(function() {
    var nowOpen = isModalOpen(modal);
    if (nowOpen === wasOpen) return;
    wasOpen = nowOpen;
    if (nowOpen) onModalOpened(modal);
    else onModalClosed(modal);
  }).observe(modal, { attributes: true, attributeFilter: ['style'] });
});

document.addEventListener('keydown', function(event) {
  if (event.key !== 'Tab') return;
  var stack = openModals();
  if (!stack.length) return;
  // The topmost dialog owns the tab ring, matching the Escape priority chain.
  var modal = stack[stack.length - 1];
  var focusable = focusableWithin(modal);
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (!modal.contains(document.activeElement)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

Array.from(document.querySelectorAll('a[href]')).forEach(function(anchor) {
  anchor.addEventListener('click', async function(event) {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!hasSiteChanges()) return;
    event.preventDefault();
    var canLeave = await resolveSiteChangesBeforeLeaving('Save the site directory changes before leaving Admin?');
    if (canLeave) window.location.href = anchor.href;
  });
});

signOutBtn.addEventListener('click', async function() {
  setProfileMenuOpen(false);
  var canLeave = await resolveSiteChangesBeforeLeaving('Save the site directory changes before signing out?');
  if (!canLeave) return;
  if (usersUnsubscribe) { usersUnsubscribe(); usersUnsubscribe = null; }
  if (visitsUnsubscribe) { visitsUnsubscribe(); visitsUnsubscribe = null; }
  if (rolesUnsubscribe) { rolesUnsubscribe(); rolesUnsubscribe = null; }
  await signOut(primaryAuth);
  window.location.href = 'index.html';
});

// Every keystroke used to rebuild the whole table body — for the visits table
// that means re-parsing mentions on every row, on every letter. A short debounce
// keeps typing responsive without changing what the search matches.
function debounce(fn, wait) {
  var timer = null;
  return function() {
    var args = arguments;
    var self = this;
    window.clearTimeout(timer);
    timer = window.setTimeout(function() { fn.apply(self, args); }, wait || 150);
  };
}

var renderVisitsDebounced = debounce(renderVisits, 150);
var renderUsersDebounced = debounce(renderUsers, 150);
var renderSitesDebounced = debounce(renderSites, 150);

visitSearchInput.addEventListener('input', function(e) {
  state.visitSearch = e.target.value;
  renderVisitsDebounced();
});

if (visitTypeFilter) {
  visitTypeFilter.addEventListener('change', function(e) {
    state.visitType = e.target.value;
    renderVisits();
  });
}

// ── People table controls ──
if (userSearchInput) {
  userSearchInput.addEventListener('input', function(e) {
    state.userSearch = e.target.value;
    renderUsersDebounced();
  });
}

[
  [userDepartmentFilter, 'userDepartment'],
  [userRoleFilter, 'userRole'],
  [userStatusFilter, 'userStatus'],
  [userSortSelect, 'userSort']
].forEach(function(pair) {
  var el = pair[0];
  var key = pair[1];
  if (!el) return;
  el.addEventListener('change', function(e) {
    state[key] = e.target.value;
    renderUsers();
  });
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

['input', 'change'].forEach(function(eventName) {
  visitDetailBody.addEventListener(eventName, function(event) {
    if (state.visitDetailId && event.target.matches('[data-field]')) {
      markDraftDirty('visit', true);
    }
  });
});

if (visitDetailClose) {
  visitDetailClose.addEventListener('click', requestCloseVisitDetail);
}

visitDetailModal.addEventListener('click', function(e) {
  if (e.target === visitDetailModal) requestCloseVisitDetail();
});

nav.addEventListener('click', async function(e) {
  var btn = e.target.closest('[data-admin-panel]');
  if (!btn) return;
  await navigateToAdminPanel(btn.dataset.adminPanel);
});

document.addEventListener('click', async function(e) {
  var link = e.target.closest('[data-admin-panel-target]');
  if (!link) return;
  await navigateToAdminPanel(link.dataset.adminPanelTarget);
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
  markDraftDirty('invite', false);
  clearMessage(inviteMsg);
  createUserForm.reset();
  populateRoleSelects();
  renderInviteSummary();
  inviteUserModal.style.display = 'flex';
  if (newFirstNameInput) newFirstNameInput.focus();
}

function closeInviteModal() {
  markDraftDirty('invite', false);
  if (inviteUserModal) inviteUserModal.style.display = 'none';
}

async function requestCloseInviteModal() {
  if (!dirtyDrafts.has('invite')) {
    closeInviteModal();
    return;
  }
  var choice = await promptUnsavedChanges('Send this invitation before closing?');
  if (choice === 'save') {
    if (createUserForm) createUserForm.requestSubmit();
  } else if (choice === 'discard') {
    closeInviteModal();
  }
}

// The same read-out the access modal shows, so what an invitation grants is
// visible before it is sent rather than after.
function renderInviteSummary() {
  if (!inviteSummary) return;
  var perms = permissionsForRole(roleSelect ? roleSelect.value : 'viewer');
  var manager = newManagerSelect && newManagerSelect.value ? managerLabel(newManagerSelect.value) : '';
  var department = normalizeDepartment(newDepartmentSelect ? newDepartmentSelect.value : '');
  var parts = ['They will see ' + describeVisibility(perms).toLowerCase() + '.'];
  parts.push('They can edit: ' + describeEditing(perms).toLowerCase() + '.');
  if (department) parts.push('Department: ' + departmentName(department) + '.');
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
    var department = normalizeDepartment(newDepartmentSelect ? newDepartmentSelect.value : '');
    var managerUid = newManagerSelect ? newManagerSelect.value : '';
    var opsArea = newOpsSelect ? newOpsSelect.value : '';
    if (!firstName || !lastName) throw new Error('Enter their first and last name.');
    if (!department) throw new Error('Choose Operations or Coffee Team.');
    var pass = createInvitationPassword();
    var cred  = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    var uid   = cred.user.uid;
    var invitedAt = nowIso();
    await set(ref(db, 'users/' + uid), {
      firstName: firstName,
      lastName: lastName,
      email: email,
      role: role,
      department: department,
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
    if (role === 'admin' && state.isFullAdmin) await set(ref(db, 'admins/' + uid), true);

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
    markDraftDirty('invite', false);
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
if (userAccessDepartment) {
  userAccessDepartment.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.department = normalizeDepartment(userAccessDepartment.value);
  });
}
[userAccessDepartmentOperations, userAccessDepartmentCoffeeTeam].forEach(function(checkbox) {
  if (!checkbox) return;
  checkbox.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.myTeamDepartments[checkbox.value] = checkbox.checked;
  });
});
if (userAccessManager) {
  userAccessManager.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.managerUid = userAccessManager.value;
    renderAccessReadout();
  });
}
if (userAccessNotifications) {
  userAccessNotifications.addEventListener('change', function() {
    if (!state.accessDraft) return;
    state.accessDraft.notificationScope = userAccessNotifications.value;
    markDraftDirty('access', true);
    renderAccessReadout();
  });
}
if (userAccessPatchList) {
  userAccessPatchList.addEventListener('change', function(event) {
    if (!state.accessDraft) return;
    var box = event.target.closest('input[type="checkbox"]');
    if (!box) return;
    if (box.dataset.patchRegionAll) {
      togglePatchRegion(box.dataset.patchRegionAll, box.checked);
    } else if (box.dataset.patchOpsArea) {
      togglePatchOpsArea(box.dataset.patchRegion, box.dataset.patchOpsArea, box.checked);
    } else {
      return;
    }
    markDraftDirty('access', true);
    // Ticking a whole region disables the areas inside it, so the list is
    // redrawn rather than patched in place.
    renderPatchEditor(true);
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

if (userAccessSetPassword) {
  userAccessSetPassword.addEventListener('click', function() {
    if (userAccessPasswordPanel && !userAccessPasswordPanel.hidden) closeUserPasswordPanel();
    else openUserPasswordPanel();
  });
}

if (userAccessPasswordCancel) {
  userAccessPasswordCancel.addEventListener('click', closeUserPasswordPanel);
}

if (userAccessShowPassword) {
  userAccessShowPassword.addEventListener('change', function() {
    var type = userAccessShowPassword.checked ? 'text' : 'password';
    if (userAccessNewPassword) userAccessNewPassword.type = type;
    if (userAccessConfirmPassword) userAccessConfirmPassword.type = type;
  });
}

if (userAccessPasswordPanel) {
  userAccessPasswordPanel.addEventListener('submit', async function(event) {
    event.preventDefault();
    var uid = state.accessUserUid;
    var user = findUser(uid);
    if (!user || !state.isFullAdmin || uid === currentUserId()) return;

    clearMessage(userAccessPasswordMsg);
    var password = userAccessNewPassword ? userAccessNewPassword.value : '';
    var confirmationValue = userAccessConfirmPassword ? userAccessConfirmPassword.value : '';
    if (password.length < 12) {
      setMessage(userAccessPasswordMsg, 'error', 'The new password must be at least 12 characters.');
      if (userAccessNewPassword) userAccessNewPassword.focus();
      return;
    }
    if (password !== confirmationValue) {
      setMessage(userAccessPasswordMsg, 'error', 'The two password entries do not match.');
      if (userAccessConfirmPassword) userAccessConfirmPassword.focus();
      return;
    }
    if (!confirm('Replace the password for ' + (user.email || userLabel(user)) + '? Their existing sign-in sessions will be invalidated.')) return;

    userAccessPasswordSubmit.disabled = true;
    userAccessSetPassword.disabled = true;
    setMessage(userAccessPasswordMsg, 'info', 'Setting the new password...');
    try {
      var result = await setUserPasswordCall({ uid: uid, password: password });
      var changedFor = result.data && result.data.email ? result.data.email : (user.email || userLabel(user));
      var auditWarning = result.data && result.data.auditRecorded === false
        ? ' The password changed, but its audit entry could not be saved.'
        : '';
      closeUserPasswordPanel();
      setMessage(userAccessMsg, auditWarning ? 'info' : 'success', 'New password set for ' + changedFor + '. Existing sessions cannot renew and will require the new password.' + auditWarning);
    } catch (error) {
      setMessage(userAccessPasswordMsg, 'error', managedPasswordErrorMessage(error));
    } finally {
      userAccessPasswordSubmit.disabled = false;
      userAccessSetPassword.disabled = false;
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
  if (control) control.addEventListener('click', requestCloseAccessModal);
});
if (userAccessModal) {
  ['input', 'change'].forEach(function(eventName) {
    userAccessModal.addEventListener(eventName, function(event) {
      if (!state.accessDraft || !event.target.matches('input, select, textarea')) return;
      if (event.target.closest('#userAccessPasswordPanel')) return;
      if (event.target === userAccessMyActivity && state.accessUserUid === currentUserId()) return;
      markDraftDirty('access', true);
    });
  });
  userAccessModal.addEventListener('click', function(event) {
    if (event.target === userAccessModal) requestCloseAccessModal();
  });
}

// ── Invite modal ──
if (inviteUserBtn) inviteUserBtn.addEventListener('click', openInviteModal);
[inviteUserClose, inviteUserCancel].forEach(function(control) {
  if (control) control.addEventListener('click', requestCloseInviteModal);
});
if (inviteUserModal) {
  inviteUserModal.addEventListener('click', function(event) {
    if (event.target === inviteUserModal) requestCloseInviteModal();
  });
}
[createUserForm].forEach(function(form) {
  if (!form) return;
  ['input', 'change'].forEach(function(eventName) {
    form.addEventListener(eventName, function() {
      markDraftDirty('invite', true);
    });
  });
});
[roleSelect, newDepartmentSelect, newManagerSelect, newOpsSelect].forEach(function(select) {
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
  ['input', 'change'].forEach(function(eventName) {
    roleForm.addEventListener(eventName, function() {
      markDraftDirty('role', true);
    });
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
  if (control) control.addEventListener('click', requestCloseRoleEditor);
});
if (roleEditorModal) {
  roleEditorModal.addEventListener('click', function(event) {
    if (event.target === roleEditorModal) requestCloseRoleEditor();
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

// Escape closes the topmost admin dialog without affecting anything beneath it.
document.addEventListener('keydown', function(event) {
  if (event.key !== 'Escape') return;
  if (unsavedChangesModal && unsavedChangesModal.style.display === 'flex') settleUnsavedChanges('cancel');
  else if (deleteConfirmModal && deleteConfirmModal.style.display === 'flex') deleteConfirmCancel.click();
  else if (cqvConfirmModal && cqvConfirmModal.style.display === 'flex') requestCloseCqvConfirmModal();
  else if (visitDetailModal && visitDetailModal.style.display === 'flex') requestCloseVisitDetail();
  else if (userAccessModal && userAccessModal.style.display === 'flex') requestCloseAccessModal();
  else if (roleEditorModal && roleEditorModal.style.display === 'flex') requestCloseRoleEditor();
  else if (inviteUserModal && inviteUserModal.style.display === 'flex') requestCloseInviteModal();
});

siteSearchInput.addEventListener('input', function(e) {
  state.siteSearch = e.target.value;
  renderSitesDebounced();
});

function stageSiteEntry() {
  var name   = siteNameInput.value.trim();
  var region = siteRegionInput.value.trim();
  var ops    = siteOpsInput.value.trim();
  if (!name && !region && !ops) return true;
  if (!name || !region || !ops) {
    setMessage(siteMsg, 'error', 'Enter a bakery name, region, and ops area to add a site.');
    var missingInput = !name ? siteNameInput : (!region ? siteRegionInput : siteOpsInput);
    if (missingInput) missingInput.focus();
    return false;
  }
  state.siteMetaDraft[name] = { r: region, o: ops };
  siteNameInput.value  = '';
  siteRegionInput.value = '';
  siteOpsInput.value   = '';
  setDirty(true);
  setMessage(siteMsg, 'success', 'Added ' + name + ' to the site directory.');
  renderPortal();
  return true;
}

siteForm.addEventListener('submit', function(e) {
  e.preventDefault();
  stageSiteEntry();
});
siteForm.addEventListener('input', updateSiteSaveControls);

siteList.addEventListener('input', function(e) {
  var input = e.target;
  if (!input.dataset.site) return;
  if (input.dataset.coord) {
    updateSiteCoordinateDraft(input.dataset.site, input.dataset.coord, input.value);
    return;
  }
  if (!input.dataset.field) return;
  updateSiteDraft(input.dataset.site, input.dataset.field, input.value);
});

siteList.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action="remove-site"]');
  if (btn) removeSite(btn.dataset.site);
});

if (regionAssignmentList) {
  // A row carrying an ops area is cover for that area alone; without one the
  // input is the region's own Coffee Partner or Coffee Trainer.
  var applyRegionAssignmentInput = function(input, user) {
    var name = user ? userLabel(user) : input.value;
    var uid = user ? user.uid : '';
    if (input.dataset.opsArea) {
      updateRegionCoverDraft(
        input.dataset.region,
        input.dataset.opsArea,
        input.dataset.field,
        name,
        uid
      );
      return;
    }
    updateRegionAssignmentDraft(input.dataset.region, input.dataset.field, name, uid);
  };

  regionAssignmentList.addEventListener('input', function(e) {
    var input = e.target;
    if (!input.dataset.region || !input.dataset.field) return;
    applyRegionAssignmentInput(input, resolveRegionAssignmentUser(input.value));
  });

  // Picking from the people list stores the readable name rather than the
  // "Name — email" option text the datalist puts in the box.
  regionAssignmentList.addEventListener('change', function(e) {
    var input = e.target;
    if (input.dataset.action === 'toggle-region-cover') {
      toggleRegionCover(input.dataset.region, input.checked);
      return;
    }
    if (!input.dataset.region || !input.dataset.field) return;
    var user = resolveRegionAssignmentUser(input.value);
    if (!user) return;
    input.value = userLabel(user);
    applyRegionAssignmentInput(input, user);
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

async function saveSiteData() {
  if (!stageSiteEntry()) return false;
  if (!state.siteMetaDirty) return true;
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
    announceDataUpdate('the site directory', (payload && payload.siteCount ? payload.siteCount + ' sites' : ''));
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
    return true;
  } catch (err) {
    setMessage(siteMsg, 'error', 'Error: ' + err.message);
    return false;
  } finally {
    saveSitesBtn.disabled = false;
  }
}

function discardSiteChanges() {
  state.siteMetaDraft = cloneMeta(state.siteMetaSource);
  state.regionAssignmentsDraft = cloneMeta(state.regionAssignmentsSource);
  state.opsAreaAssignmentsDraft = cloneMeta(state.opsAreaAssignmentsSource);
  state.siteImportInfo = state.siteMetaSourceInfo ? cloneMeta(state.siteMetaSourceInfo) : null;
  siteNameInput.value = '';
  siteRegionInput.value = '';
  siteOpsInput.value = '';
  setDirty(false);
  clearMessage(siteMsg);
  renderPortal();
}

saveSitesBtn.addEventListener('click', function() {
  saveSiteData();
});

// "Discard changes" throws away the site directory draft, the region assignments
// draft and the ops area assignments draft at once, and there is no undo. It used
// to do that on a single unconfirmed click, while deleting one visit required
// typing "delete record" — the severity ordering was inverted. It now routes
// through the same three-way dialog every other exit from a dirty state uses.
resetSitesBtn.addEventListener('click', async function() {
  if (!hasSiteChanges()) return;
  var choice = await promptUnsavedChanges('Discard your unsaved site directory changes? This cannot be undone.');
  if (choice === 'discard') discardSiteChanges();
  else if (choice === 'save') await saveSiteData();
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

// The "← Go to Dashboard" button that used to sit here duplicated the link in the
// top bar, and shared its button chrome with "Clear Shared Dataset" one slot away.
// The remaining top-bar link is an <a href>, and the click interceptor already
// routes every anchor on the page through resolveSiteChangesBeforeLeaving, so the
// unsaved-changes guard is unchanged.

clearDatasetBtn.addEventListener('click', async function() {
  var months = state.datasetInfo && state.datasetInfo.monthCount;
  var records = state.datasetInfo && state.datasetInfo.recordCount;
  var scale = records
    ? records + ' records across ' + formatCount(months || 0, 'month', 'months')
    : 'the shared workbook';
  var ok = await openDeleteConfirmModal(
    'This removes ' + scale + ' for every dashboard user. Until a new workbook is '
    + 'uploaded, nobody in the business can see any customer experience data.',
    {
      title: 'Clear the shared dataset',
      confirmWord: 'clear dataset',
      confirmLabel: 'Clear dataset',
      pendingLabel: 'Clearing…'
    }
  );
  if (!ok) return;
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
  var siteCount = Object.keys(state.siteMetaDraft || {}).length;
  var ok = await openDeleteConfirmModal(
    'This replaces the current directory of ' + formatCount(siteCount, 'bakery', 'bakeries')
    + ' with the mapping built into this app. Every region and ops area you have imported '
    + 'or edited is lost, along with the Coffee Team and Area Head Barista assignments '
    + 'attached to them.',
    {
      title: 'Restore the default site map',
      confirmWord: 'restore defaults',
      confirmLabel: 'Restore defaults',
      pendingLabel: 'Restoring…'
    }
  );
  if (!ok) return;
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
    announceDataUpdate('the site directory', 'restored to the default site map');
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

// Coordinates only, unlike Restore Default Site Map: region/ops area
// assignments (and any bakeries only present live, not in the built-in
// directory) are left untouched. Stages the change into the draft rather
// than saving immediately, so the admin can review the Sites tab first.
syncCoordinatesBtn.addEventListener('click', function() {
  var defaults = window.GAILS && window.GAILS.DEFAULT_BAKERY_META ? window.GAILS.DEFAULT_BAKERY_META : {};
  var updated = 0;
  Object.keys(state.siteMetaDraft || {}).forEach(function(name) {
    var key = window.GAILS && typeof window.GAILS.resolveBakeryMetaKey === 'function'
      ? window.GAILS.resolveBakeryMetaKey(name)
      : name;
    var fallback = defaults[key] || defaults[name];
    if (!fallback || !Array.isArray(fallback.ll)) return;
    var entry = state.siteMetaDraft[name];
    var current = Array.isArray(entry.ll) ? entry.ll : null;
    if (current && Number(current[0]) === Number(fallback.ll[0]) && Number(current[1]) === Number(fallback.ll[1])) return;
    entry.ll = fallback.ll.slice();
    updated += 1;
  });

  if (!updated) {
    setMessage(dataMsg, 'info', 'Coordinates already match the built-in directory - nothing to update.');
    return;
  }
  setDirty(true);
  renderSites();
  renderDataControls();
  setMessage(dataMsg, 'success', 'Updated coordinates for ' + updated + ' site' + (updated === 1 ? '' : 's') + ' in the Sites tab. Review them there, then Save to publish.');
});

// Read-only snapshot of the live site directory (region/ops area/coordinates)
// for manual backups before bulk edits - e.g. a full coordinate correction
// pass. Exports the saved data, not unsaved draft edits, so the file matches
// what's actually published.
exportSiteMetaBtn.addEventListener('click', function() {
  var meta = cloneMeta(state.siteMetaSource || {});
  var blob = new Blob([JSON.stringify(meta, null, 2)], { type: 'application/json' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'gails-site-directory-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
  setMessage(dataMsg, 'success', 'Exported ' + Object.keys(meta).length + ' site' + (Object.keys(meta).length === 1 ? '' : 's') + ' to a JSON file.');
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

if (cqvConfirmClose) cqvConfirmClose.addEventListener('click', requestCloseCqvConfirmModal);
if (cqvConfirmCancel) cqvConfirmCancel.addEventListener('click', requestCloseCqvConfirmModal);
if (cqvConfirmModal) {
  cqvConfirmModal.addEventListener('click', function(e) {
    if (e.target === cqvConfirmModal) requestCloseCqvConfirmModal();
  });
}
if (cqvConfirmSubmitBtn) cqvConfirmSubmitBtn.addEventListener('click', saveCqvRecord);
