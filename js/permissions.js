// Shared role/permission definitions used by the dashboard (js/auth.js), the
// admin portal (js/admin-page.js), My Activity, and My Team.
//
// A role's permissions have four parts:
//   tabs      — which dashboard tabs the role can SEE (true/false per tab key,
//               matching the data-tab attributes in index.html).
//   actions   — things the role can DO on the dashboard itself (true/false),
//               e.g. logging visits from the Bakery Reports tab. Seeing a tab
//               and acting on it are separate: an ops manager can be given the
//               Bakery Reports tab without the ability to log visits.
//   admin     — per admin-portal area access: 'none' | 'view' | 'edit'.
//   teamScope — how much of the coffee team's work the role can see on the My
//               Team page: 'none' | 'direct' | 'all'. See TEAM_SCOPES.
//
// Those four shapes predate the admin UI that edits them, and they are what is
// stored at roles/{roleId}. ACCESS_ROWS below re-presents all of it as one flat
// "can see / can edit" grid so the portal can offer a single control surface
// without changing a byte of stored data.
//
// Custom roles are stored in Firebase at roles/{roleId}. The two built-in
// roles below ('admin' and 'viewer') are hardcoded so existing user records
// keep working and can never be edited or deleted from the role creator.

export const DASHBOARD_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'target', label: 'Focus Bakeries' },
  { key: 'map', label: 'Map' },
  { key: 'trends', label: 'Trends' },
  { key: 'table', label: 'League Table' },
  { key: 'feedback', label: 'Customer Feedback' },
  { key: 'visit-log', label: 'Bakery Reports' }
];

export const DASHBOARD_ACTIONS = [
  { key: 'logVisits', label: 'Log visits', description: 'Can log new bakery check-ins from the Bakery Reports tab and the unvisited sites list.' }
];

export const ADMIN_AREAS = [
  { key: 'visits', label: 'Bakery Visits', description: 'Visit records, CQV PDF imports, and visit detail edits.' },
  { key: 'sites', label: 'Site Directory', description: 'Bakery region and ops area mapping.' },
  { key: 'dataset', label: 'Shared Dataset', description: 'The synced customer experience workbook.' },
  { key: 'users', label: 'People & Access', description: 'User accounts, roles, reporting lines, and access controls.' }
];

export const AREA_LEVELS = ['none', 'view', 'edit'];

// How much of the team a role can see on the My Team page.
//
// 'direct' follows the reporting line stored on each user (users/{uid}.managerUid)
// downwards — a manager sees their reports, and their reports' reports. 'all'
// ignores the line entirely and shows everyone, which is what the Head of
// Operations needs. Neither grants any *extra* record access: My Team reads the
// same visits and follow-ups every signed-in user can already read, it just
// groups them by person.
export const TEAM_SCOPES = [
  { key: 'none', label: 'No team view', description: 'My Team is hidden. They only ever see their own work.' },
  { key: 'direct', label: 'Their own team', description: 'Sees everyone who reports to them, and anyone reporting to those people.' },
  { key: 'all', label: 'The whole coffee team', description: 'Sees every person in the directory, whoever they report to.' }
];

export const TEAM_SCOPE_KEYS = TEAM_SCOPES.map(function(scope) { return scope.key; });

// How much of the estate's activity the role hears about in the header bell.
//
// This is the *default* for everyone holding the role. A person can widen or
// narrow it for themselves on their profile page (users/{uid}.notificationScope),
// which then wins — so changing the role default only moves the people who have
// never expressed a preference of their own.
//
// There is deliberately no "off". The narrowest setting still delivers their own
// tasks and their own bakeries, because a task somebody assigns you is not
// something you get to stop being told about.
//
// The delivery rule these keys drive lives in js/notifications.js, which is a
// classic script and cannot import this module; it holds the keys, this holds
// how they read.
export const NOTIFICATION_SCOPES = [
  { key: 'all', label: 'Everything', description: 'Every report, task and note from across the whole estate.' },
  { key: 'area', label: 'Just their bakeries', description: 'Anything that happens at the bakeries they look after, plus their own tasks and any time the shared data is updated.' }
];

export const NOTIFICATION_SCOPE_KEYS = NOTIFICATION_SCOPES.map(function(scope) { return scope.key; });

function allTabs(value) {
  var tabs = {};
  DASHBOARD_TABS.forEach(function(tab) { tabs[tab.key] = value; });
  return tabs;
}

function allAreas(level) {
  var areas = {};
  ADMIN_AREAS.forEach(function(area) { areas[area.key] = level; });
  return areas;
}

function allActions(value) {
  var actions = {};
  DASHBOARD_ACTIONS.forEach(function(action) { actions[action.key] = value; });
  return actions;
}

// The built-in Viewer keeps logVisits: true because, historically, every
// signed-in user could log a check-in — existing accounts must not lose
// that. Use a custom role to take it away.
export const BUILTIN_ROLES = {
  admin: {
    name: 'Admin',
    description: 'Full access to the dashboard, every admin panel, and the whole team.',
    builtIn: true,
    permissions: { tabs: allTabs(true), actions: allActions(true), admin: allAreas('edit'), teamScope: 'all', notificationScope: 'all' }
  },
  viewer: {
    name: 'Viewer',
    description: 'Sees the full dashboard and can log visits. No admin portal access.',
    builtIn: true,
    permissions: { tabs: allTabs(true), actions: allActions(true), admin: allAreas('none'), teamScope: 'none', notificationScope: 'area' }
  }
};

// ── The one grid ──────────────────────────────────────────────────────────
// Every capability in the app as a flat list of rows with a "see" cell and an
// "edit" cell, so one table in the admin portal can answer both questions at
// once. Each row knows how to read itself out of a normalized permission
// object and how to write itself back — the storage shape stays exactly as it
// was, and the UI never has to know which of the four sub-objects a row lives
// in.
//
//   editable: false  — the row has no meaningful edit action (a chart tab).
//
// Ordering is the order the rows appear in the portal.

function tabRow(tab) {
  return {
    key: 'tab:' + tab.key,
    group: 'dashboard',
    label: tab.label,
    // Bakery Reports is the only tab with something to do on it, so it is the
    // only dashboard row whose Edit cell means anything.
    editable: tab.key === 'visit-log',
    editLabel: 'Log visits and raise follow-ups',
    read: function(perms) {
      return {
        see: perms.tabs[tab.key] === true,
        edit: tab.key === 'visit-log' && perms.actions.logVisits === true
      };
    },
    write: function(perms, see, edit) {
      perms.tabs[tab.key] = !!see;
      if (tab.key === 'visit-log') perms.actions.logVisits = !!(see && edit);
    }
  };
}

function areaRow(area) {
  return {
    key: 'area:' + area.key,
    group: 'admin',
    label: area.label,
    description: area.description,
    editable: true,
    editLabel: 'Make changes',
    read: function(perms) {
      var level = perms.admin[area.key];
      return { see: level === 'view' || level === 'edit', edit: level === 'edit' };
    },
    write: function(perms, see, edit) {
      // Edit without See is not a state the levels can express, and would be a
      // lie if it were — anyone editing a panel can read it.
      perms.admin[area.key] = edit ? 'edit' : (see ? 'view' : 'none');
    }
  };
}

export const ACCESS_GROUPS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Which tabs open on the main dashboard, and what they can do there.'
  },
  {
    key: 'admin',
    label: 'Admin portal',
    description: 'Ticking anything here lets the role open the admin portal.'
  }
];

export const ACCESS_ROWS = DASHBOARD_TABS.map(tabRow).concat(ADMIN_AREAS.map(areaRow));

export function accessRowsForGroup(groupKey) {
  return ACCESS_ROWS.filter(function(row) { return row.group === groupKey; });
}

// Reads the grid out of a permission object: { 'tab:map': { see, edit }, … }.
export function readAccessGrid(permissions) {
  var perms = normalizePermissions(permissions);
  var grid = {};
  ACCESS_ROWS.forEach(function(row) {
    grid[row.key] = row.read(perms);
  });
  return grid;
}

// Turns a grid back into a stored permission object. teamScope and
// notificationScope ride alongside because they are part of the same "what does
// this role reach" decision, but each is a three-way choice rather than a
// see/edit pair.
export function permissionsFromAccessGrid(grid, teamScope, notificationScope) {
  var perms = normalizePermissions(null);
  ACCESS_ROWS.forEach(function(row) {
    var cell = (grid && grid[row.key]) || {};
    row.write(perms, !!cell.see, !!cell.edit);
  });
  perms.teamScope = normalizeTeamScope(teamScope);
  perms.notificationScope = normalizeNotificationScope(notificationScope);
  return perms;
}

export function normalizeTeamScope(value) {
  return TEAM_SCOPE_KEYS.indexOf(value) === -1 ? 'none' : value;
}

// Unlike teamScope, an unset notification scope is not "off": a role created
// before the bell existed should still hear about its own tasks and its own
// patch, so the absent value means 'area'. The retired 'none' setting falls
// through the same door, which is what un-silences anyone who was switched off
// before the option was withdrawn.
export function normalizeNotificationScope(value) {
  return NOTIFICATION_SCOPE_KEYS.indexOf(value) === -1 ? 'area' : value;
}

export function notificationScopeOf(permissions) {
  return normalizePermissions(permissions).notificationScope;
}

export function notificationScopeLabel(scope) {
  var match = NOTIFICATION_SCOPES.find(function(entry) { return entry.key === normalizeNotificationScope(scope); });
  return match ? match.label : 'Just their bakeries';
}

// Fills in any missing keys on a stored permission object so callers can
// rely on every tab/area being present.
export function normalizePermissions(permissions) {
  var source = permissions || {};
  var tabs = {};
  DASHBOARD_TABS.forEach(function(tab) {
    tabs[tab.key] = !!(source.tabs && source.tabs[tab.key]);
  });
  var actions = {};
  DASHBOARD_ACTIONS.forEach(function(action) {
    actions[action.key] = !!(source.actions && source.actions[action.key]);
  });
  var admin = {};
  ADMIN_AREAS.forEach(function(area) {
    var level = source.admin && source.admin[area.key];
    admin[area.key] = AREA_LEVELS.indexOf(level) === -1 ? 'none' : level;
  });
  // Roles created before My Team existed carry no teamScope at all, which is
  // exactly the same as not being granted it.
  return {
    tabs: tabs,
    actions: actions,
    admin: admin,
    teamScope: normalizeTeamScope(source.teamScope),
    notificationScope: normalizeNotificationScope(source.notificationScope)
  };
}

// Resolves a user's role id to a normalized permission object. customRoleDef
// is the roles/{roleId} record from Firebase (or null/undefined). Unknown or
// deleted roles safely fall back to viewer permissions.
export function resolveRolePermissions(roleId, customRoleDef) {
  if (BUILTIN_ROLES[roleId]) {
    return normalizePermissions(BUILTIN_ROLES[roleId].permissions);
  }
  if (customRoleDef && customRoleDef.permissions) {
    return normalizePermissions(customRoleDef.permissions);
  }
  return normalizePermissions(BUILTIN_ROLES.viewer.permissions);
}

// Whether this role should be allowed into admin.html at all.
export function hasAdminPanelAccess(permissions) {
  var perms = normalizePermissions(permissions);
  return ADMIN_AREAS.some(function(area) { return perms.admin[area.key] !== 'none'; });
}

export function canViewArea(permissions, areaKey) {
  var perms = normalizePermissions(permissions);
  return perms.admin[areaKey] === 'view' || perms.admin[areaKey] === 'edit';
}

export function canEditArea(permissions, areaKey) {
  var perms = normalizePermissions(permissions);
  return perms.admin[areaKey] === 'edit';
}

export function canDoAction(permissions, actionKey) {
  var perms = normalizePermissions(permissions);
  return perms.actions[actionKey] === true;
}

export function teamScopeOf(permissions) {
  return normalizePermissions(permissions).teamScope;
}

// Whether the My Team page should open for this role at all.
export function canSeeTeam(permissions) {
  return teamScopeOf(permissions) !== 'none';
}

export function teamScopeLabel(scope) {
  var match = TEAM_SCOPES.find(function(entry) { return entry.key === normalizeTeamScope(scope); });
  return match ? match.label : 'No team view';
}

// ── Plain-English summaries ───────────────────────────────────────────────
// Used in the roles table, the person rows, and the access modal, so the same
// role always reads the same way wherever it is shown.

export function describeVisibility(permissions) {
  var perms = normalizePermissions(permissions);
  var visible = DASHBOARD_TABS.filter(function(tab) { return perms.tabs[tab.key]; });
  var parts = [];
  if (visible.length === DASHBOARD_TABS.length) parts.push('The whole dashboard');
  else if (!visible.length) parts.push('No dashboard tabs');
  else parts.push(visible.length + ' of ' + DASHBOARD_TABS.length + ' dashboard tabs');

  var adminAreas = ADMIN_AREAS.filter(function(area) { return perms.admin[area.key] !== 'none'; });
  if (adminAreas.length === ADMIN_AREAS.length) parts.push('every admin panel');
  else if (adminAreas.length) parts.push(adminAreas.map(function(area) { return area.label; }).join(', '));

  if (perms.teamScope === 'all') parts.push('the whole team');
  else if (perms.teamScope === 'direct') parts.push('their own team');

  return parts.join(' · ');
}

export function describeEditing(permissions) {
  var perms = normalizePermissions(permissions);
  var parts = [];
  if (perms.actions.logVisits) parts.push('Log visits');
  ADMIN_AREAS.forEach(function(area) {
    if (perms.admin[area.key] === 'edit') parts.push(area.label);
  });
  return parts.length ? parts.join(' · ') : 'Nothing — read only';
}
