// Shared role/permission definitions used by both the dashboard (js/auth.js)
// and the admin portal (js/admin-page.js).
//
// A role's permissions have three parts:
//   tabs    — which dashboard tabs the role can SEE (true/false per tab key,
//             matching the data-tab attributes in index.html).
//   actions — things the role can DO on the dashboard itself (true/false),
//             e.g. logging visits from the Bakery Reports tab. Seeing a tab
//             and acting on it are separate: an ops manager can be given the
//             Bakery Reports tab without the ability to log visits.
//   admin   — per admin-portal area access: 'none' | 'view' | 'edit'.
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
  { key: 'users', label: 'Users & Roles', description: 'User accounts, access levels, and this role creator.' }
];

export const AREA_LEVELS = ['none', 'view', 'edit'];

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
    description: 'Full access to the dashboard and every admin panel.',
    builtIn: true,
    permissions: { tabs: allTabs(true), actions: allActions(true), admin: allAreas('edit') }
  },
  viewer: {
    name: 'Viewer',
    description: 'Sees the full dashboard and can log visits. No admin portal access.',
    builtIn: true,
    permissions: { tabs: allTabs(true), actions: allActions(true), admin: allAreas('none') }
  }
};

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
  return { tabs: tabs, actions: actions, admin: admin };
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
