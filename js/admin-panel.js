import { firebaseConfig, db, auth as primaryAuth } from './firebase-config.js';
import { ref, set, remove, onValue, get } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

const secondaryApp = initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

const modal = document.getElementById('adminModal');
const closeBtn = document.getElementById('adminModalClose');
const adminBtn = document.getElementById('adminBtn');
const nav = document.getElementById('adminPortalNav');
const panels = Array.from(document.querySelectorAll('[data-admin-panel-content]'));
const summaryCards = document.getElementById('adminSummaryCards');
const overviewGrid = document.getElementById('adminOverviewGrid');
const heroSummary = document.getElementById('adminHeroSummary');
const heroMeta = document.getElementById('adminHeroMeta');
const userList = document.getElementById('adminUserList');
const createUserForm = document.getElementById('createUserForm');
const newEmailInput = document.getElementById('newEmailInput');
const newPassInput = document.getElementById('newPassInput');
const roleSelect = document.getElementById('newRoleSelect');
const createMsg = document.getElementById('createMsg');
const siteSearchInput = document.getElementById('siteSearchInput');
const siteForm = document.getElementById('siteForm');
const siteNameInput = document.getElementById('siteNameInput');
const siteRegionInput = document.getElementById('siteRegionInput');
const siteOpsInput = document.getElementById('siteOpsInput');
const siteList = document.getElementById('siteMetaList');
const siteMsg = document.getElementById('siteMsg');
const siteTableMeta = document.getElementById('siteTableMeta');
const saveSitesBtn = document.getElementById('saveSitesBtn');
const resetSitesBtn = document.getElementById('resetSitesBtn');
const regionList = document.getElementById('adminRegionList');
const managerList = document.getElementById('adminManagerList');
const dataGrid = document.getElementById('adminDataGrid');
const dataMsg = document.getElementById('dataMsg');
const portalUploadBtn = document.getElementById('portalUploadBtn');
const clearDatasetBtn = document.getElementById('clearDatasetBtn');
const restoreMetadataBtn = document.getElementById('restoreMetadataBtn');

const state = {
  activePanel: 'overview',
  users: [],
  siteMetaSource: cloneMeta(window.GAILS && window.GAILS.BAKERY_META ? window.GAILS.BAKERY_META : {}),
  siteMetaDraft: cloneMeta(window.GAILS && window.GAILS.BAKERY_META ? window.GAILS.BAKERY_META : {}),
  siteMetaDirty: false,
  siteSearch: '',
  datasetInfo: null
};

let usersUnsubscribe = null;

function cloneMeta(meta) {
  if (window.GAILS && typeof window.GAILS.cloneBakeryMeta === 'function') {
    return window.GAILS.cloneBakeryMeta(meta);
  }
  return JSON.parse(JSON.stringify(meta || {}));
}

function formatDate(iso) {
  if (!iso) return 'Not recorded yet';
  var date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not recorded yet';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function setMessage(element, type, message) {
  if (!element) return;
  element.textContent = message;
  element.className = 'admin-message is-' + type;
  element.style.display = 'block';
}

function clearMessage(element) {
  if (!element) return;
  element.textContent = '';
  element.className = 'admin-message';
  element.style.display = 'none';
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

function getVisibleSiteMeta() {
  var merged = cloneMeta(state.siteMetaDraft);
  var bakeryNames = (window.GAILS && window.GAILS.state && Array.isArray(window.GAILS.state.BAKERIES))
    ? window.GAILS.state.BAKERIES
    : [];

  bakeryNames.forEach(function(name) {
    if (!merged[name]) {
      merged[name] = { r: '', o: '' };
    }
  });

  var search = state.siteSearch.trim().toLowerCase();
  return Object.keys(merged).sort().filter(function(name) {
    if (!search) return true;
    var entry = merged[name] || {};
    return name.toLowerCase().includes(search)
      || String(entry.r || '').toLowerCase().includes(search)
      || String(entry.o || '').toLowerCase().includes(search);
  }).map(function(name) {
    return { name: name, entry: merged[name] || { r: '', o: '' } };
  });
}

function buildSummaryStats() {
  var meta = cloneMeta(state.siteMetaDraft);
  var users = state.users;
  var adminCount = users.filter(function(user) { return user.role === 'admin'; }).length;
  var regions = new Set();
  var managers = new Set();

  Object.values(meta).forEach(function(entry) {
    if (entry.r) regions.add(entry.r);
    if (entry.o) managers.add(entry.o);
  });

  return {
    userCount: users.length,
    adminCount: adminCount,
    siteCount: Object.keys(meta).length,
    regionCount: regions.size,
    managerCount: managers.size,
    recordCount: state.datasetInfo && state.datasetInfo.recordCount != null
      ? state.datasetInfo.recordCount
      : ((window.GAILS && window.GAILS.state && window.GAILS.state.ALL) ? window.GAILS.state.ALL.length : 0),
    monthCount: state.datasetInfo && state.datasetInfo.monthCount != null
      ? state.datasetInfo.monthCount
      : ((window.GAILS && window.GAILS.state && window.GAILS.state.MONTHS) ? window.GAILS.state.MONTHS.length : 0),
    updatedAt: state.datasetInfo ? state.datasetInfo.updatedAt : '',
    updatedBy: state.datasetInfo ? state.datasetInfo.updatedBy : ''
  };
}

function renderSummary() {
  var stats = buildSummaryStats();
  summaryCards.innerHTML = [
    {
      label: 'Users',
      value: stats.userCount,
      meta: stats.adminCount + ' admin' + (stats.adminCount === 1 ? '' : 's')
    },
    {
      label: 'Sites',
      value: stats.siteCount,
      meta: stats.regionCount + ' regions mapped'
    },
    {
      label: 'Ops Managers',
      value: stats.managerCount,
      meta: state.siteMetaDirty ? 'Unsaved site changes pending' : 'Directory synced'
    },
    {
      label: 'Shared Records',
      value: stats.recordCount,
      meta: stats.monthCount + ' month' + (stats.monthCount === 1 ? '' : 's') + ' synced'
    }
  ].map(function(card) {
    return '<div class="admin-summary-card">'
      + '<div class="admin-summary-card__label">' + card.label + '</div>'
      + '<div class="admin-summary-card__value">' + escapeHtml(card.value) + '</div>'
      + '<div class="admin-summary-card__meta">' + escapeHtml(card.meta) + '</div>'
      + '</div>';
  }).join('');

  heroSummary.textContent = stats.recordCount + ' records across ' + stats.monthCount + ' months';
  heroMeta.textContent = stats.updatedAt
    ? 'Last synced ' + formatDate(stats.updatedAt) + ' by ' + (stats.updatedBy || 'Unknown')
    : 'No shared workbook currently synced';
}

function renderOverview() {
  var stats = buildSummaryStats();
  overviewGrid.innerHTML = [
    {
      label: 'Access Health',
      value: stats.userCount ? stats.userCount + ' total users' : 'No users yet',
      meta: stats.adminCount + ' admin accounts can manage the portal.'
    },
    {
      label: 'Site Directory',
      value: stats.siteCount + ' bakeries mapped',
      meta: stats.managerCount + ' ops managers across ' + stats.regionCount + ' regions.'
    },
    {
      label: 'Dataset Status',
      value: stats.recordCount ? 'Shared workbook active' : 'No workbook synced',
      meta: stats.updatedAt ? 'Updated ' + formatDate(stats.updatedAt) : 'Upload a workbook to populate the live dashboard.'
    },
    {
      label: 'Current Session',
      value: currentUserEmail(),
      meta: state.siteMetaDirty ? 'You have unsaved site mapping edits.' : 'All site metadata changes are saved.'
    }
  ].map(function(card) {
    return '<div class="admin-overview-card">'
      + '<div class="admin-overview-card__label">' + escapeHtml(card.label) + '</div>'
      + '<div class="admin-overview-card__value">' + escapeHtml(card.value) + '</div>'
      + '<div class="admin-overview-card__meta">' + escapeHtml(card.meta) + '</div>'
      + '</div>';
  }).join('');
}

function renderUsers() {
  if (!state.users.length) {
    userList.innerHTML = '<tr><td colspan="4" class="admin-empty">No users found yet.</td></tr>';
    return;
  }

  userList.innerHTML = state.users.map(function(user) {
    var isCurrent = currentUserId() === user.uid;
    var roleClass = user.role === 'admin' ? 'admin-pill admin-pill--admin' : 'admin-pill';
    var selectedAdmin = user.role === 'admin' ? 'selected' : '';
    var selectedViewer = user.role === 'viewer' ? 'selected' : '';
    var selectDisabled = isCurrent ? 'disabled' : '';
    var saveDisabled = isCurrent ? 'disabled' : '';
    var removeDisabled = isCurrent ? 'disabled' : '';
    var status = isCurrent ? 'Current session' : 'Active access';
    var statusMeta = isCurrent
      ? 'You cannot remove or downgrade the logged-in admin.'
      : 'Managed through Firebase dashboard access rules.';

    return '<tr>'
      + '<td><div class="admin-table__title">' + escapeHtml(user.email || 'Unknown') + '</div></td>'
      + '<td>'
      + '<div class="' + roleClass + '">' + escapeHtml(user.role === 'admin' ? 'Admin' : 'Viewer') + '</div>'
      + '<select data-user-role="' + escapeHtml(user.uid) + '" ' + selectDisabled + '>'
      + '<option value="viewer" ' + selectedViewer + '>Viewer</option>'
      + '<option value="admin" ' + selectedAdmin + '>Admin</option>'
      + '</select>'
      + '</td>'
      + '<td><div class="admin-status-note">' + escapeHtml(status) + '</div><div class="admin-status-note">' + escapeHtml(statusMeta) + '</div></td>'
      + '<td><div class="admin-table__actions">'
      + '<button type="button" class="admin-inline-btn" data-action="save-user-role" data-uid="' + escapeHtml(user.uid) + '" ' + saveDisabled + '>Save Role</button>'
      + '<button type="button" class="admin-inline-danger" data-action="revoke-user" data-uid="' + escapeHtml(user.uid) + '" ' + removeDisabled + '>Remove Access</button>'
      + '</div></td>'
      + '</tr>';
  }).join('');
}

function renderDatalists() {
  var meta = cloneMeta(state.siteMetaDraft);
  var regions = [...new Set(Object.values(meta).map(function(entry) { return entry.r; }).filter(Boolean))].sort();
  var managers = [...new Set(Object.values(meta).map(function(entry) { return entry.o; }).filter(Boolean))].sort();

  regionList.innerHTML = regions.map(function(region) {
    return '<option value="' + escapeHtml(region) + '"></option>';
  }).join('');

  managerList.innerHTML = managers.map(function(manager) {
    return '<option value="' + escapeHtml(manager) + '"></option>';
  }).join('');
}

function updateSiteTableMeta(count) {
  siteTableMeta.textContent = count + ' visible site' + (count === 1 ? '' : 's')
    + ' of ' + Object.keys(state.siteMetaDraft).length
    + (state.siteMetaDirty ? ' • unsaved changes' : ' • all changes saved');
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
      + '<td><input type="text" value="' + escapeHtml(row.entry.r || '') + '" list="adminRegionList" data-site="' + escapeHtml(row.name) + '" data-field="r" placeholder="Region"></td>'
      + '<td><input type="text" value="' + escapeHtml(row.entry.o || '') + '" list="adminManagerList" data-site="' + escapeHtml(row.name) + '" data-field="o" placeholder="Ops manager"></td>'
      + '<td><div class="admin-table__actions"><button type="button" class="admin-inline-danger" data-action="remove-site" data-site="' + escapeHtml(row.name) + '">Remove</button></div></td>'
      + '</tr>';
  }).join('');
}

function renderDataControls() {
  var stats = buildSummaryStats();
  var sourceRecords = (window.GAILS && window.GAILS.state && window.GAILS.state.ALL) ? window.GAILS.state.ALL.length : 0;
  var sourceMonths = (window.GAILS && window.GAILS.state && window.GAILS.state.MONTHS) ? window.GAILS.state.MONTHS.length : 0;

  dataGrid.innerHTML = [
    {
      label: 'Shared Workbook',
      value: stats.recordCount ? stats.recordCount + ' records' : 'No shared data',
      meta: stats.monthCount ? stats.monthCount + ' synced month' + (stats.monthCount === 1 ? '' : 's') : 'Upload needed'
    },
    {
      label: 'Last Sync',
      value: stats.updatedAt ? formatDate(stats.updatedAt) : 'Not synced yet',
      meta: stats.updatedBy ? 'Updated by ' + stats.updatedBy : 'No sync activity recorded'
    },
    {
      label: 'Current Browser Session',
      value: sourceRecords ? sourceRecords + ' loaded records' : 'No session data loaded',
      meta: sourceMonths ? sourceMonths + ' months currently rendered' : 'Upload or sync data to begin'
    },
    {
      label: 'Site Metadata',
      value: Object.keys(state.siteMetaDraft).length + ' mapped bakeries',
      meta: state.siteMetaDirty ? 'Unsaved site edits pending' : 'Matches the shared portal data'
    }
  ].map(function(card) {
    return '<div class="admin-data-card">'
      + '<div class="admin-data-card__label">' + escapeHtml(card.label) + '</div>'
      + '<div class="admin-data-card__value">' + escapeHtml(card.value) + '</div>'
      + '<div class="admin-data-card__meta">' + escapeHtml(card.meta) + '</div>'
      + '</div>';
  }).join('');
}

function renderPortal() {
  renderSummary();
  renderOverview();
  renderUsers();
  renderSites();
  renderDataControls();
}

function switchPanel(panelName) {
  state.activePanel = panelName;
  Array.from(nav.querySelectorAll('[data-admin-panel]')).forEach(function(button) {
    button.classList.toggle('active', button.dataset.adminPanel === panelName);
  });
  panels.forEach(function(panel) {
    panel.classList.toggle('active', panel.dataset.adminPanelContent === panelName);
  });
}

async function refreshDatasetInfo() {
  try {
    var data = window.GAILS_Firebase && typeof window.GAILS_Firebase.getDashboardData === 'function'
      ? await window.GAILS_Firebase.getDashboardData()
      : null;
    state.datasetInfo = data;
  } catch (error) {
    console.error('Could not load dashboard dataset info:', error);
    state.datasetInfo = null;
  }
  renderSummary();
  renderOverview();
  renderDataControls();
}

function openPortal(panelName) {
  ensurePortalSync();
  modal.style.display = 'flex';
  document.body.classList.add('admin-modal-open');
  clearMessage(createMsg);
  clearMessage(siteMsg);
  clearMessage(dataMsg);
  switchPanel(panelName || state.activePanel);
  renderPortal();
  refreshDatasetInfo();
}

function closePortal() {
  modal.style.display = 'none';
  document.body.classList.remove('admin-modal-open');
  clearMessage(createMsg);
  clearMessage(siteMsg);
  clearMessage(dataMsg);
}

function syncSiteMetaFromSource(meta) {
  state.siteMetaSource = cloneMeta(meta || {});
  if (!state.siteMetaDirty) {
    state.siteMetaDraft = cloneMeta(state.siteMetaSource);
  }
  renderSummary();
  renderOverview();
  renderSites();
  renderDataControls();
}

async function saveUserRole(uid) {
  var user = state.users.find(function(entry) { return entry.uid === uid; });
  if (!user || uid === currentUserId()) return;

  var select = userList.querySelector('[data-user-role="' + uid + '"]');
  var nextRole = select ? select.value : user.role;

  await set(ref(db, `users/${uid}`), {
    email: user.email,
    role: nextRole
  });

  if (nextRole === 'admin') {
    await set(ref(db, `admins/${uid}`), true);
  } else {
    await remove(ref(db, `admins/${uid}`));
  }

  setMessage(createMsg, 'success', 'Updated access level for ' + (user.email || 'user') + '.');
}

async function revokeUser(uid) {
  var user = state.users.find(function(entry) { return entry.uid === uid; });
  if (!user || uid === currentUserId()) return;

  if (!confirm('Remove dashboard access for ' + (user.email || 'this user') + '?')) return;

  await remove(ref(db, `users/${uid}`));
  await remove(ref(db, `admins/${uid}`));
  setMessage(createMsg, 'success', 'Removed access for ' + (user.email || 'user') + '.');
}

function updateSiteDraft(name, field, value) {
  if (!state.siteMetaDraft[name]) {
    state.siteMetaDraft[name] = { r: '', o: '' };
  }
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

if (adminBtn) {
  adminBtn.addEventListener('click', function() {
    openPortal('overview');
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', closePortal);
}

window.addEventListener('click', function(event) {
  if (event.target === modal) closePortal();
});

nav.addEventListener('click', function(event) {
  var navButton = event.target.closest('[data-admin-panel]');

  if (navButton) {
    switchPanel(navButton.dataset.adminPanel);
  }
});

modal.addEventListener('click', function(event) {
  var quickLink = event.target.closest('[data-admin-panel-target]');
  if (quickLink) {
    switchPanel(quickLink.dataset.adminPanelTarget);
  }
});

createUserForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  setMessage(createMsg, 'info', 'Creating user...');
  var button = createUserForm.querySelector('button');
  button.disabled = true;

  try {
    var email = newEmailInput.value.trim();
    var pass = newPassInput.value.trim();
    var role = roleSelect.value;

    var cred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    var uid = cred.user.uid;

    await set(ref(db, `users/${uid}`), { email: email, role: role });
    if (role === 'admin') {
      await set(ref(db, `admins/${uid}`), true);
    }

    await signOut(secondaryAuth);
    newEmailInput.value = '';
    newPassInput.value = '';
    roleSelect.value = 'viewer';
    setMessage(createMsg, 'success', 'User created and added to the portal.');
  } catch (error) {
    setMessage(createMsg, 'error', 'Error: ' + error.message);
  } finally {
    button.disabled = false;
  }
});

userList.addEventListener('click', async function(event) {
  var actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;

  var uid = actionButton.dataset.uid;
  actionButton.disabled = true;

  try {
    if (actionButton.dataset.action === 'save-user-role') {
      await saveUserRole(uid);
    }
    if (actionButton.dataset.action === 'revoke-user') {
      await revokeUser(uid);
    }
  } catch (error) {
    setMessage(createMsg, 'error', 'Error: ' + error.message);
  } finally {
    actionButton.disabled = false;
  }
});

siteSearchInput.addEventListener('input', function(event) {
  state.siteSearch = event.target.value;
  renderSites();
});

siteForm.addEventListener('submit', function(event) {
  event.preventDefault();
  var name = siteNameInput.value.trim();
  var region = siteRegionInput.value.trim();
  var ops = siteOpsInput.value.trim();

  if (!name || !region || !ops) {
    setMessage(siteMsg, 'error', 'Enter a bakery name, region, and ops manager to add a site.');
    return;
  }

  state.siteMetaDraft[name] = { r: region, o: ops };
  siteNameInput.value = '';
  siteRegionInput.value = '';
  siteOpsInput.value = '';
  setDirty(true);
  setMessage(siteMsg, 'success', 'Added ' + name + ' to the site directory.');
  renderPortal();
});

siteList.addEventListener('input', function(event) {
  var input = event.target;
  if (!input.dataset.site || !input.dataset.field) return;
  updateSiteDraft(input.dataset.site, input.dataset.field, input.value);
});

siteList.addEventListener('click', function(event) {
  var actionButton = event.target.closest('[data-action="remove-site"]');
  if (!actionButton) return;
  removeSite(actionButton.dataset.site);
});

saveSitesBtn.addEventListener('click', async function() {
  saveSitesBtn.disabled = true;
  setMessage(siteMsg, 'info', 'Saving site data to Firebase...');

  try {
    if (window.GAILS_Firebase && typeof window.GAILS_Firebase.saveSiteMeta === 'function') {
      await window.GAILS_Firebase.saveSiteMeta(state.siteMetaDraft);
    } else {
      await set(ref(db, 'portalData/siteMeta'), { entries: cloneMeta(state.siteMetaDraft) });
    }

    if (window.GAILS && typeof window.GAILS.setBakeryMeta === 'function') {
      window.GAILS.setBakeryMeta(state.siteMetaDraft);
      if (typeof window.GAILS.rebuildDashboardFilters === 'function') {
        window.GAILS.rebuildDashboardFilters();
      }
    }

    state.siteMetaSource = cloneMeta(state.siteMetaDraft);
    setDirty(false);
    setMessage(siteMsg, 'success', 'Site directory saved for all dashboard users.');
    renderPortal();
  } catch (error) {
    setMessage(siteMsg, 'error', 'Error: ' + error.message);
  } finally {
    saveSitesBtn.disabled = false;
  }
});

resetSitesBtn.addEventListener('click', function() {
  state.siteMetaDraft = cloneMeta(state.siteMetaSource);
  setDirty(false);
  clearMessage(siteMsg);
  renderPortal();
});

portalUploadBtn.addEventListener('click', function() {
  closePortal();
  if (window.GAILS && window.GAILS.resetToUpload) window.GAILS.resetToUpload();
});

clearDatasetBtn.addEventListener('click', async function() {
  if (!confirm('Clear the shared Firebase dataset for everyone?')) return;

  clearDatasetBtn.disabled = true;
  setMessage(dataMsg, 'info', 'Clearing shared dataset...');

  try {
    if (window.GAILS_Firebase && typeof window.GAILS_Firebase.clearDashboardData === 'function') {
      await window.GAILS_Firebase.clearDashboardData();
    } else {
      await remove(ref(db, 'dashboardData'));
    }

    localStorage.removeItem('gails_excel_data');
    localStorage.removeItem('gails_excel_name');
    state.datasetInfo = null;
    var reloadBtn = document.getElementById('reloadBtn');
    if (reloadBtn) reloadBtn.click();
    setMessage(dataMsg, 'success', 'Shared dataset cleared. Upload a fresh workbook to repopulate the dashboard.');
    renderSummary();
    renderOverview();
    renderDataControls();
  } catch (error) {
    setMessage(dataMsg, 'error', 'Error: ' + error.message);
  } finally {
    clearDatasetBtn.disabled = false;
  }
});

restoreMetadataBtn.addEventListener('click', async function() {
  if (!confirm('Restore the shared site directory back to the default mapping in this app?')) return;

  restoreMetadataBtn.disabled = true;
  setMessage(dataMsg, 'info', 'Restoring default site map...');

  try {
    var defaults = cloneMeta(window.GAILS && window.GAILS.DEFAULT_BAKERY_META ? window.GAILS.DEFAULT_BAKERY_META : {});
    if (window.GAILS_Firebase && typeof window.GAILS_Firebase.saveSiteMeta === 'function') {
      await window.GAILS_Firebase.saveSiteMeta(defaults);
    } else {
      await set(ref(db, 'portalData/siteMeta'), { entries: defaults });
    }

    state.siteMetaSource = cloneMeta(defaults);
    state.siteMetaDraft = cloneMeta(defaults);
    setDirty(false);
    setMessage(dataMsg, 'success', 'Default site map restored.');
    renderPortal();
  } catch (error) {
    setMessage(dataMsg, 'error', 'Error: ' + error.message);
  } finally {
    restoreMetadataBtn.disabled = false;
  }
});

window.addEventListener('gails:site-meta-sync', function(event) {
  var meta = event.detail && event.detail.meta ? event.detail.meta : {};
  syncSiteMetaFromSource(meta);
});

function ensurePortalSync() {
  if (usersUnsubscribe) return;

  usersUnsubscribe = onValue(ref(db, 'users'), function(snapshot) {
    state.users = [];
    if (snapshot.exists()) {
      var users = snapshot.val();
      state.users = Object.keys(users).map(function(uid) {
        return {
          uid: uid,
          email: users[uid].email || 'Unknown',
          role: users[uid].role === 'admin' ? 'admin' : 'viewer'
        };
      }).sort(function(a, b) {
        return a.email.localeCompare(b.email);
      });
    }

    renderSummary();
    renderOverview();
    renderUsers();
  }, function(error) {
    console.error('Failed to sync users:', error);
    setMessage(createMsg, 'error', 'Could not load active users from Firebase.');
  });

  get(ref(db, 'portalData/siteMeta')).then(function(snapshot) {
    if (snapshot.exists()) {
      var payload = snapshot.val();
      syncSiteMetaFromSource(payload.entries || payload);
    }
  }).catch(function(error) {
    console.error('Failed to load site metadata snapshot:', error);
  });
}

onAuthStateChanged(primaryAuth, function(user) {
  if (!user && usersUnsubscribe) {
    usersUnsubscribe();
    usersUnsubscribe = null;
    state.users = [];
    renderSummary();
    renderOverview();
    renderUsers();
  }
});

setDirty(false);
renderPortal();
