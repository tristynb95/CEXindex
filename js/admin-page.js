import { firebaseConfig, db, storage, auth as primaryAuth } from './firebase-config.js';
import { ref, set, push, remove, onValue, get, query, limitToLast, orderByKey } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-storage.js";
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
const usersMsg        = document.getElementById('usersMsg');
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

const cqvImportZone       = document.getElementById('cqvImportZone');
const cqvImportBrowseBtn  = document.getElementById('cqvImportBrowseBtn');
const cqvImportInput      = document.getElementById('cqvImportInput');
const cqvImportMsg        = document.getElementById('cqvImportMsg');
const cqvConfirmModal     = document.getElementById('cqvConfirmModal');
const cqvConfirmClose     = document.getElementById('cqvConfirmClose');
const cqvConfirmCancel    = document.getElementById('cqvConfirmCancel');
const cqvConfirmSubmitBtn = document.getElementById('cqvConfirmSubmitBtn');
const cqvConfirmBakery    = document.getElementById('cqvConfirmBakery');
const cqvConfirmDate      = document.getElementById('cqvConfirmDate');
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
  editingUserUid: null,
  siteMetaSource: {},
  siteMetaSourceInfo: null,
  siteMetaDraft: {},
  siteMetaDirty: false,
  siteSearch: '',
  datasetInfo: null,
  siteImportInfo: null,
  visits: [],
  visitSearch: '',
  visitDetailId: null,
  cqvPending: null // { record, warnings, file } awaiting confirmation in cqvConfirmModal
};

let usersUnsubscribe = null;
let visitsUnsubscribe = null;

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
      || String(v.coffeePartner || '').toLowerCase().includes(search)
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
    } else {
      scoreText = (v.score != null && v.score !== '') ? (v.score + (v.scoreMax ? ' / ' + v.scoreMax : '')) : '—';
    }
    var isSiteVisit = v.type === 'siteVisit';
    var isCqv = v.type === 'cqv';
    var typeBadge = isCqv
      ? '<span class="admin-table-badge admin-table-badge--cqv">' + (v.isFollowUp ? 'CQV Follow-Up' : 'CQV') + '</span>'
      : isSiteVisit
        ? '<span class="admin-table-badge admin-table-badge--adhoc">' + escapeHtml(siteVisitKindLabel(v)) + '</span>'
        : '<span class="admin-table-badge admin-table-badge--routine">Routine</span>';

    return '<tr>'
      + '<td>' + escapeHtml(formatVisitDate(v.date)) + '</td>'
      + '<td><div class="admin-table__title-cell">'
      + '  <div class="admin-table__title">' + escapeHtml(v.bakery || 'Unknown') + '</div>'
      + '  ' + typeBadge
      + '</div></td>'
      + '<td>' + escapeHtml(v.coffeePartner || '—') + '</td>'
      + '<td>' + escapeHtml(scoreText) + '</td>'
      + '<td>' + escapeHtml(v.mod || '—') + '</td>'
      + '<td><div class="admin-table__actions admin-table__actions--icons">'
      + '<button type="button" class="admin-icon-btn" data-action="view-visit" data-id="' + escapeHtml(v.id) + '" title="View / Edit" aria-label="View / Edit">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>'
      + '</button>'
      + '<button type="button" class="admin-icon-btn admin-icon-btn--danger" data-action="remove-visit" data-id="' + escapeHtml(v.id) + '" title="Delete" aria-label="Delete">'
      +   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>'
      + '</button>'
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
    lines.push('<span style="color:#B22A24;">&#9888; Rated Red: a Critical Point or Allergen Point question failed</span>' +
      (record.printedBand && record.printedBand !== 'Red' ? ' (overrides the ' + escapeHtml(record.printedBand) + ' shown in the PDF header).' : '.'));
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

function openCqvConfirmModal(record, warnings, file) {
  state.cqvPending = { record: record, warnings: warnings || [], file: file };
  cqvConfirmBakery.innerHTML = bakeryOptionsHtml(guessBakeryMatch(record.bakery));
  cqvConfirmDate.value = record.date || '';
  cqvConfirmSummary.innerHTML = cqvSummaryHtml(record, warnings);
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
    if (!window.GAILS.CQV || typeof window.GAILS.CQV.buildRecordFromPdf !== 'function') {
      throw new Error('CQV parser did not load. Refresh the page and try again.');
    }
    var result = await window.GAILS.CQV.buildRecordFromPdf(bytes.buffer);
    if (!result.record.overallPct && !result.record.score && !result.record.questions.length) {
      throw new Error('Could not find any CQV score data in this PDF. Make sure it\'s the standard GoAudits CQV export.');
    }
    clearMessage(cqvImportMsg);
    openCqvConfirmModal(result.record, result.warnings, file);
  } catch (err) {
    console.error('Failed to parse CQV PDF:', err);
    setMessage(cqvImportMsg, 'error', 'Could not read that PDF: ' + err.message);
  } finally {
    if (cqvImportBrowseBtn) cqvImportBrowseBtn.disabled = false;
    if (cqvImportInput) cqvImportInput.value = '';
    if (cqvImportZone) cqvImportZone.classList.remove('drag-over');
  }
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

  var duplicate = state.visits.find(function(v) {
    return v.type === 'cqv' && v.bakery === bakery && v.date === date;
  });
  if (duplicate) {
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-error';
    cqvConfirmWarning.textContent = 'A CQV for ' + bakery + ' on ' + formatVisitDate(date) + ' is already saved. Delete that record first if you need to replace it.';
    return;
  }

  cqvConfirmSubmitBtn.disabled = true;
  var originalText = cqvConfirmSubmitBtn.textContent;
  cqvConfirmSubmitBtn.textContent = 'Saving…';

  try {
    var newRef = push(ref(db, 'routineVisits'));
    var pathSafeBakery = bakery.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var storagePath = 'cqvPdfs/' + pathSafeBakery + '/' + newRef.key + '-' + pending.file.name.replace(/[^a-z0-9.\-]+/gi, '_');
    var fileRef = storageRef(storage, storagePath);

    var bytes = await readFileAsBytes(pending.file);
    await uploadBytes(fileRef, bytes, { contentType: 'application/pdf' });
    var pdfUrl = await getDownloadURL(fileRef);

    var nowIsoStr = nowIso();
    var record = Object.assign({}, pending.record, {
      bakery: bakery,
      date: date,
      pdfUrl: pdfUrl,
      pdfPath: storagePath,
      pdfFileName: pending.file.name,
      meta: {
        source: 'pdf-import',
        createdAt: nowIsoStr,
        updatedAt: nowIsoStr,
        updatedBy: currentUserEmail()
      }
    });

    await set(newRef, record);
    closeCqvConfirmModal();
    setMessage(visitMsg, 'success', 'Saved CQV for ' + bakery + ' on ' + formatVisitDate(date) + '.');
  } catch (err) {
    console.error('Failed to save CQV:', err);
    cqvConfirmWarning.style.display = 'block';
    cqvConfirmWarning.className = 'admin-message is-error';
    cqvConfirmWarning.textContent = 'Could not save this CQV: ' + err.message;
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

var SITE_VISIT_KIND_LABELS = {
  checkin: 'Check-in',
  nboOpening: 'NBO: Opening',
  nbo2wk: 'NBO: 2WK Check-in',
  nbo4wk: 'NBO: 4WK Check-in'
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
  var dataAttrs = 'data-section="' + escapeHtml(sectionKey || '') + '" data-field="' + escapeHtml(field.key) + '" data-type="' + escapeHtml(field.type) + '"';
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

function cqvHasLostAllergensOrCritical(scores) {
  return Object.keys(scores || {}).some(function(name) {
    var s = scores[name];
    var isCritical = (s.code === 'CRTCL' || s.code === 'ALRG') || /^(critical|allergen)\b/i.test(name);
    return isCritical && s.actual < s.target;
  });
}

// Recomputed live from categoryScores rather than trusting the stored
// criticalFail flag, so records saved before this override existed (or with
// a stale value) still show correctly without needing a re-import.
function cqvHasCriticalFail(visit) {
  if (visit.criticalFail) return true;
  return cqvHasLostAllergensOrCritical(visit.categoryScores);
}

// Falls back to deriving the band from overallPct for records saved before
// band computation existed (see js/cqv-parser.js), rather than showing
// blank, and re-applies the critical-fail override live in case the stored
// band predates it.
function cqvBand(visit) {
  if (cqvHasCriticalFail(visit)) return 'Red';
  if (visit.band) return visit.band;
  if (visit.overallPct == null) return '';
  return visit.overallPct >= 90 ? 'Green' : visit.overallPct >= 70 ? 'Yellow' : 'Red';
}

function cqvBandColor(band) {
  if (band === 'Green') return '#1D9E5C';
  if (band === 'Yellow') return '#C97F12';
  if (band === 'Red') return '#B22A24';
  return null;
}

function cqvPriorityColor(priority) {
  if (/^high$/i.test(priority)) return '#B22A24';
  if (/^medium$/i.test(priority)) return '#C97F12';
  if (/^low$/i.test(priority)) return '#0E8074';
  return null;
}

// Questions tagged "(allergen point)" / "(critical point)" are GAIL's
// zero-tolerance categories — losing a single one forces the whole visit
// Red — so an action item on one of them gets its own warning flag. An
// action item only exists because the point was lost, so every match is by
// definition a failed critical/allergen point.
function cqvCriticalTag(label) {
  if (/\ballergen point\b/i.test(label || '')) return 'Allergen Point';
  if (/\bcritical point\b/i.test(label || '')) return 'Critical Point';
  return null;
}

// Follow-up CQVs sometimes skip the written "Comments & Action Plan" block
// entirely (see js/cqv-parser.js's action-plan parsing) even though
// individual questions still lost points — falling back to those lost
// questions keeps the Action Plan section useful instead of showing "no
// action items" on a visit that clearly didn't score 100%.
function cqvLostPointItems(visit) {
  return (visit.questions || [])
    .filter(function(q) { return q.score != null && q.max != null && q.score < q.max; })
    .map(function(q) {
      var lost = q.max - q.score;
      return {
        sectionPath: q.section + (q.subsection ? ' >> ' + q.subsection : ''),
        questionLabel: (q.label || ('Question ' + (q.qNum || ''))) + ' (−' + lost + ' pt' + (lost === 1 ? '' : 's') + ')',
        findings: q.note || '',
        actionRequired: '',
        assignee: visit.bakery || '',
        priority: '',
        dueDate: ''
      };
    });
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
    { key: 'date', label: 'Visit date', type: 'date' }
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
    + '<div class="visit-detail-section' + (cqvHasLostAllergensOrCritical(visit.sectionScores) ? ' visit-detail-section--danger' : '') + '"><h4>Score by Section</h4>' + (sectionRows || '<p class="visit-report-note">Not parsed.</p>') + '</div>'
    + '<div class="visit-detail-section' + (cqvHasLostAllergensOrCritical(visit.categoryScores) ? ' visit-detail-section--danger' : '') + '"><h4>Score by Category</h4>' + (categoryRows || '<p class="visit-report-note">Not parsed.</p>') + '</div>'
    + '<div class="visit-detail-section"><h4>Action Plan (' + (actionPlanItems || []).length + ')</h4>'
    + (actionPlanIsDerived ? '<p class="visit-report-note" style="margin-bottom:10px;">This follow-up report didn\'t include a written action plan &mdash; showing the questions that lost points instead.</p>' : '')
    + actionItemsHtml + '</div>'
    + '<div class="visit-detail-section"><h4>Original Report</h4>' + pdfLinkHtml + '</div>'
    + '<div class="visit-detail-actions">'
    + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
    + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Bakery / Date</button>'
    + '</div>';
}

function buildVisitDetailHtml(visit) {
  var isSiteVisit = visit.type === 'siteVisit';
  var isCqv = visit.type === 'cqv';
  var badgeHtml = isCqv
    ? '<span class="admin-badge admin-badge--cqv">' + (visit.isFollowUp ? 'CQV Follow-Up' : 'Coffee Quality Visit (CQV)') + '</span>'
    : isSiteVisit
      ? '<span class="admin-badge admin-badge--adhoc">' + escapeHtml(siteVisitKindLabel(visit)) + '</span>'
      : '<span class="admin-badge admin-badge--routine">Routine Coffee Visit</span>';

  var recorderText = '';
  if (visit.meta) {
    var actionWord = isSiteVisit ? 'Logged' : 'Recorded';
    var datePart = formatVisitDate(visit.date);
    var userPart = visit.meta.updatedBy ? ' by ' + visit.meta.updatedBy : '';
    var sourcePart = (visit.meta.source === 'form') ? ' via the Routine Coffee Visit form.'
      : (visit.meta.source === 'pdf-import') ? ' from an imported CQV PDF.'
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

  if (isSiteVisit) {
    var adhocFields = [
      { key: 'bakery', label: 'Bakery', type: 'text' },
      { key: 'visitKind', label: 'Visit Type', type: 'siteVisitKind' },
      { key: 'date', label: 'Visit date', type: 'date' },
      { key: 'time', label: 'Visit time', type: 'time' },
      { key: 'coffeePartner', label: 'Coffee Partner', type: 'text' },
      { key: 'mod', label: 'MOD', type: 'text' },
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
      + '<div class="visit-detail-actions">'
      + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
      + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Changes</button>'
      + '</div>';
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
      + '<div class="visit-detail-actions">'
      + '  <button type="button" class="admin-inline-danger" data-action="delete-visit-detail" data-id="' + escapeHtml(visit.id) + '">Delete Visit</button>'
      + '  <button type="button" class="btn" data-action="save-visit-detail" data-id="' + escapeHtml(visit.id) + '">Save Changes</button>'
      + '</div>';
  }
}

function openVisitDetail(id) {
  var visit = state.visits.find(function(v) { return v.id === id; });
  if (!visit) return;
  state.visitDetailId = id;
  visitDetailBody.innerHTML = buildVisitDetailHtml(visit);
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

async function saveVisitDetail(id) {
  var existing = state.visits.find(function(v) { return v.id === id; });
  if (!existing) return;

  var collected = collectVisitFormValues();
  if (!collected.general.bakery || !collected.general.date) {
    setMessage(visitMsg, 'error', 'A visit needs at least a bakery name and a date.');
    return;
  }

  var payload = Object.assign({}, existing, collected.general);
  if (existing.type !== 'siteVisit' && existing.type !== 'cqv') {
    VISIT_SECTIONS.forEach(function(section) {
      payload[section.key] = collected[section.key];
    });
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
  renderSites();
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

  visitsUnsubscribe = onValue(ref(db, 'routineVisits'), function(snapshot) {
    state.visits = [];
    if (snapshot.exists()) {
      var visits = snapshot.val();
      state.visits = Object.keys(visits).map(function(id) {
        return Object.assign({ id: id }, visits[id]);
      });
    }
    renderVisits();
  }, function(err) {
    console.error('Failed to sync routine visits:', err);
    setMessage(visitMsg, 'error', 'Could not load visit history from Firebase.');
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
  if (visitsUnsubscribe) { visitsUnsubscribe(); visitsUnsubscribe = null; }
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
  clearMessage(createMsg);
  clearMessage(usersMsg);
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

    var emailSent = false;
    try {
      await sendPasswordResetEmail(secondaryAuth, email);
      emailSent = true;
    } catch (emailErr) {
      console.warn('Failed to send auto-reset email:', emailErr);
    }

    await signOut(secondaryAuth);
    newEmailInput.value = '';
    newPassInput.value  = '';
    roleSelect.value    = 'viewer';

    if (emailSent) {
      setMessage(createMsg, 'success', 'User created successfully and password reset email sent.');
    } else {
      setMessage(createMsg, 'success', 'User created, but failed to send password reset email automatically. Please reset manually.');
    }
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

  clearMessage(createMsg);
  clearMessage(usersMsg);

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
        setMessage(usersMsg, 'success', 'Password reset email sent to ' + email + '.');
      } else {
         setMessage(usersMsg, 'error', 'Password reset not available.');
      }
    } catch (err) {
      setMessage(usersMsg, 'error', 'Error sending password reset: ' + err.message);
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
      setMessage(usersMsg, 'success', 'User role updated successfully.');
    }
    if (action === 'revoke-user') {
      await revokeUser(uid);
      if (state.editingUserUid === uid) state.editingUserUid = null;
      setMessage(usersMsg, 'success', 'User access revoked successfully.');
    }
  } catch (err) {
    setMessage(usersMsg, 'error', 'Error: ' + err.message);
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

// ── CQV import zone + confirm modal ──
if (cqvImportBrowseBtn) {
  cqvImportBrowseBtn.addEventListener('click', function(event) {
    event.stopPropagation();
    if (cqvImportInput) cqvImportInput.click();
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
