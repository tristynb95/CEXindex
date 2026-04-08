import { firebaseConfig, db, auth as primaryAuth } from './firebase-config.js';
import { ref, set, remove, onValue, get, query, limitToLast, orderByKey } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

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
const newEmailInput   = document.getElementById('newEmailInput');
const newPassInput    = document.getElementById('newPassInput');
const roleSelect      = document.getElementById('newRoleSelect');
const createMsg       = document.getElementById('createMsg');
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

// ── State ──
const state = {
  activePanel: 'overview',
  users: [],
  editingUserUid: null,
  siteMetaSource: {},
  siteMetaSourceInfo: null,
  siteMetaDraft: {},
  siteMetaDirty: false,
  siteSearch: '',
  datasetInfo: null,
  siteImportInfo: null
};

let usersUnsubscribe = null;

function nowIso() {
  return new Date().toISOString();
}

// ── Helpers ──
function cloneMeta(meta) {
  return JSON.parse(JSON.stringify(meta || {}));
}

function formatDate(iso) {
  if (!iso) return 'Not recorded yet';
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Not recorded yet';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function buildDashboardDataPayload(records, months, sourceName) {
  return {
    records: records,
    months: months,
    recordCount: records.length,
    monthCount: months.length,
    sourceName: sourceName || '',
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

function buildSiteMetaPayload(meta, sourceInfo) {
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

  return confirm('Importing a workbook will immediately replace the shared site directory for all dashboard users. Continue?');
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

    var payload = buildSiteMetaPayload(imported.meta, importInfo);
    await set(ref(db, 'portalData/siteMeta'), payload);

    state.siteMetaDraft = cloneMeta(imported.meta);
    state.siteMetaSource = cloneMeta(imported.meta);
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
    setMessage(siteMsg, 'success', summary);
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

    var payload = buildDashboardDataPayload(parsed.records, parsed.months || [], file.name);
    await set(ref(db, 'dashboardData'), payload);
    var meta = {
      recordCount: payload.recordCount,
      monthCount: payload.monthCount,
      sourceName: payload.sourceName,
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
    { label: 'Ops Managers', value: s.managerCount, meta: state.siteMetaDirty ? 'Unsaved changes' : 'Directory synced' },
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
    { label: 'Site Directory',   value: s.siteCount + ' bakeries mapped',                                           meta: s.managerCount + ' ops managers across ' + s.regionCount + ' regions.' },
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
        + '<td><div class="' + roleClass + '">' + escapeHtml(entry.role === 'admin' ? 'Admin' : 'Viewer') + '</div></td>'
        + '<td><div class="' + eventClass + '">' + escapeHtml(eventLabel) + '</div></td>'
        + '<td>' + escapeHtml(formatDate(entry.timestamp)) + '</td>'
        + '</tr>';
    }).join('');
  } catch (e) {
    console.error('Could not load activity log:', e);
    activityLogList.innerHTML = '<tr><td colspan="4" class="admin-empty">Failed to load activity log.</td></tr>';
  }
}

function renderUsers() {
  if (!state.users.length) {
    userList.innerHTML = '<tr><td colspan="4" class="admin-empty">No users found yet.</td></tr>';
    return;
  }
  userList.innerHTML = state.users.map(function(user) {
    var isCurrent    = currentUserId() === user.uid;
    var isEditing    = state.editingUserUid === user.uid;
    var roleClass    = user.role === 'admin' ? 'admin-pill admin-pill--admin' : 'admin-pill';
    var selAdmin     = user.role === 'admin'  ? 'selected' : '';
    var selViewer    = user.role === 'viewer' ? 'selected' : '';
    var dis          = isCurrent ? 'disabled' : '';

    var roleHtml, statusHtml, actionsHtml;

    if (isEditing) {
      roleHtml = '<select data-user-role="' + escapeHtml(user.uid) + '" ' + dis + '>'
          + '<option value="viewer" ' + selViewer + '>Viewer</option>'
          + '<option value="admin"  ' + selAdmin  + '>Admin</option>'
        + '</select>';
      statusHtml = '<div class="admin-status-note" style="color:var(--accent);">Editing access settings</div>';
      actionsHtml = '<div class="admin-table__actions">'
        + '<button type="button" class="admin-inline-btn" data-action="save-user-role" data-uid="' + escapeHtml(user.uid) + '" ' + dis + '>Save Role</button>'
        + '<button type="button" class="admin-inline-btn" data-action="cancel-edit-user">Cancel</button>'
        + '<button type="button" class="admin-inline-btn" data-action="send-password-reset" data-email="' + escapeHtml(user.email) + '" ' + dis + '>Reset Password</button>'
        + '<button type="button" class="admin-inline-danger" data-action="revoke-user" data-uid="' + escapeHtml(user.uid) + '" ' + dis + '>Remove</button>'
      + '</div>';
    } else {
      roleHtml = '<div class="' + roleClass + '">' + escapeHtml(user.role === 'admin' ? 'Admin' : 'Viewer') + '</div>';
      var status       = isCurrent ? 'Current session' : 'Active access';
      var statusNote   = isCurrent ? 'You cannot edit or remove the logged-in admin.' : 'Managed through Firebase dashboard access rules.';
      statusHtml = '<div class="admin-status-note">' + escapeHtml(status) + '</div><div class="admin-status-note">' + escapeHtml(statusNote) + '</div>';
      actionsHtml = '<div class="admin-table__actions">'
        + '<button type="button" class="admin-inline-btn" data-action="edit-user" data-uid="' + escapeHtml(user.uid) + '" ' + dis + '>Edit</button>'
      + '</div>';
    }

    return '<tr>'
      + '<td><div class="admin-table__title">' + escapeHtml(user.email || 'Unknown') + '</div></td>'
      + '<td>' + roleHtml + '</td>'
      + '<td>' + statusHtml + '</td>'
      + '<td>' + actionsHtml + '</td>'
      + '</tr>';
  }).join('');
}

function renderDatalists() {
  var meta     = cloneMeta(state.siteMetaDraft);
  var regions  = [...new Set(Object.values(meta).map(function(e) { return e.r; }).filter(Boolean))].sort();
  var managers = [...new Set(Object.values(meta).map(function(e) { return e.o; }).filter(Boolean))].sort();
  regionList.innerHTML  = regions.map(function(r) { return '<option value="' + escapeHtml(r) + '">'; }).join('');
  managerList.innerHTML = managers.map(function(m) { return '<option value="' + escapeHtml(m) + '">'; }).join('');
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
  siteList.innerHTML = rows.map(function(row) {
    return '<tr>'
      + '<td><div class="admin-table__title">' + escapeHtml(row.name) + '</div></td>'
      + '<td><input type="text" value="' + escapeHtml(row.entry.r || '') + '" list="adminRegionList"  data-site="' + escapeHtml(row.name) + '" data-field="r" placeholder="Region"></td>'
      + '<td><input type="text" value="' + escapeHtml(row.entry.o || '') + '" list="adminManagerList" data-site="' + escapeHtml(row.name) + '" data-field="o" placeholder="Ops manager"></td>'
      + '<td><div class="admin-table__actions"><button type="button" class="admin-inline-danger" data-action="remove-site" data-site="' + escapeHtml(row.name) + '">Remove</button></div></td>'
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

function renderPortal() {
  renderSummary();
  renderOverview();
  renderActivityLog();
  renderUsers();
  renderSites();
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
    state.siteImportInfo = state.siteMetaSourceInfo ? cloneMeta(state.siteMetaSourceInfo) : null;
  }
  renderSummary();
  renderOverview();
  renderSites();
  renderDataControls();
  renderImportZones();
}

async function saveUserRole(uid) {
  var user = state.users.find(function(u) { return u.uid === uid; });
  if (!user || uid === currentUserId()) return;
  var select = userList.querySelector('[data-user-role="' + uid + '"]');
  var nextRole = select ? select.value : user.role;
  await set(ref(db, 'users/' + uid), { email: user.email, role: nextRole });
  if (nextRole === 'admin') {
    await set(ref(db, 'admins/' + uid), true);
  } else {
    await remove(ref(db, 'admins/' + uid));
  }
  setMessage(createMsg, 'success', 'Updated access level for ' + (user.email || 'user') + '.');
}

async function revokeUser(uid) {
  var user = state.users.find(function(u) { return u.uid === uid; });
  if (!user || uid === currentUserId()) return;
  if (!confirm('Remove dashboard access for ' + (user.email || 'this user') + '?')) return;
  await remove(ref(db, 'users/' + uid));
  await remove(ref(db, 'admins/' + uid));
  setMessage(createMsg, 'success', 'Removed access for ' + (user.email || 'user') + '.');
}

function updateSiteDraft(name, field, value) {
  if (!state.siteMetaDraft[name]) state.siteMetaDraft[name] = { r: '', o: '' };
  state.siteMetaDraft[name][field] = String(value || '').trim();
  setDirty(true);
  updateSiteTableMeta(getVisibleSiteMeta().length);
  renderSummary();
  renderOverview();
  renderDataControls();
}

function removeSite(name) {
  if (!confirm('Remove ' + name + ' from the shared site directory?')) return;
  delete state.siteMetaDraft[name];
  setDirty(true);
  renderSites();
  renderSummary();
  renderOverview();
  renderDataControls();
}

function ensurePortalSync() {
  if (usersUnsubscribe) return;
  usersUnsubscribe = onValue(ref(db, 'users'), function(snapshot) {
    state.users = [];
    if (snapshot.exists()) {
      var users = snapshot.val();
      state.users = Object.keys(users).map(function(uid) {
        return { uid: uid, email: users[uid].email || 'Unknown', role: users[uid].role === 'admin' ? 'admin' : 'viewer' };
      }).sort(function(a, b) { return a.email.localeCompare(b.email); });
    }
    renderSummary();
    renderOverview();
    renderUsers();
  }, function(err) {
    console.error('Failed to sync users:', err);
    setMessage(createMsg, 'error', 'Could not load active users from Firebase.');
  });

  get(ref(db, 'portalData/siteMeta')).then(function(snapshot) {
    if (snapshot.exists()) {
      var payload = snapshot.val();
      syncSiteMetaFromSource(payload);
    }
  }).catch(function(err) {
    console.error('Failed to load site metadata snapshot:', err);
  });
}

// ── Auth guard ──
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
    if (userSnap.exists() && userSnap.val() && userSnap.val().role === 'admin') isAdmin = true;

    if (!isAdmin) {
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
  ensurePortalSync();
  switchPanel('overview');
  renderPortal();
  refreshDatasetInfo();
});

// ── Event listeners ──
signOutBtn.addEventListener('click', async function() {
  if (usersUnsubscribe) { usersUnsubscribe(); usersUnsubscribe = null; }
  await signOut(primaryAuth);
  window.location.href = 'index.html';
});

nav.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-admin-panel]');
  if (!btn) return;
  switchPanel(btn.dataset.adminPanel);
  if (compactSidebarMedia.matches) setSidebarCollapsed(true);
});

document.addEventListener('click', function(e) {
  var link = e.target.closest('[data-admin-panel-target]');
  if (!link) return;
  switchPanel(link.dataset.adminPanelTarget);
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

createUserForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  setMessage(createMsg, 'info', 'Creating user…');
  var btn = createUserForm.querySelector('button');
  btn.disabled = true;
  try {
    var email = newEmailInput.value.trim();
    var pass  = newPassInput.value.trim();
    var role  = roleSelect.value;
    var cred  = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    var uid   = cred.user.uid;
    await set(ref(db, 'users/' + uid), { email: email, role: role });
    if (role === 'admin') await set(ref(db, 'admins/' + uid), true);
    await signOut(secondaryAuth);
    newEmailInput.value = '';
    newPassInput.value  = '';
    roleSelect.value    = 'viewer';
    setMessage(createMsg, 'success', 'User created and added to the portal.');
  } catch (err) {
    setMessage(createMsg, 'error', 'Error: ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

userList.addEventListener('click', async function(e) {
  var btn = e.target.closest('[data-action]');
  if (!btn) return;
  var uid = btn.dataset.uid;
  var action = btn.dataset.action;

  if (action === 'edit-user') {
    state.editingUserUid = uid;
    renderUsers();
    return;
  }
  if (action === 'cancel-edit-user') {
    state.editingUserUid = null;
    renderUsers();
    return;
  }
  if (action === 'send-password-reset') {
    var email = btn.dataset.email;
    if (!confirm('Send a password reset email to ' + email + '?')) return;
    btn.disabled = true;
    try {
      if (typeof sendPasswordResetEmail === 'function' && primaryAuth) {
        await sendPasswordResetEmail(primaryAuth, email);
        setMessage(createMsg, 'success', 'Password reset email sent to ' + email + '.');
      } else {
         setMessage(createMsg, 'error', 'Password reset not available.');
      }
    } catch (err) {
      setMessage(createMsg, 'error', 'Error sending password reset: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
    return;
  }

  btn.disabled = true;
  try {
    if (action === 'save-user-role') {
      await saveUserRole(uid);
      state.editingUserUid = null;
      renderUsers();
    }
    if (action === 'revoke-user') {
      await revokeUser(uid);
      if (state.editingUserUid === uid) state.editingUserUid = null;
    }
  } catch (err) {
    setMessage(createMsg, 'error', 'Error: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
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
    setMessage(siteMsg, 'error', 'Enter a bakery name, region, and ops manager to add a site.');
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

saveSitesBtn.addEventListener('click', async function() {
  saveSitesBtn.disabled = true;
  setMessage(siteMsg, 'info', 'Saving site data to Firebase…');
  try {
    var payload;
    if (window.GAILS_Firebase && typeof window.GAILS_Firebase.saveSiteMeta === 'function') {
      payload = await window.GAILS_Firebase.saveSiteMeta(state.siteMetaDraft, state.siteImportInfo);
    } else {
      payload = buildSiteMetaPayload(state.siteMetaDraft, state.siteImportInfo);
      await set(ref(db, 'portalData/siteMeta'), payload);
    }
    state.siteMetaSource = cloneMeta(state.siteMetaDraft);
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
    var payload = buildSiteMetaPayload(defaults, { fileName: 'Default site map', siteCount: Object.keys(defaults).length });
    await set(ref(db, 'portalData/siteMeta'), payload);
    state.siteMetaSource = cloneMeta(defaults);
    state.siteMetaDraft  = cloneMeta(defaults);
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
