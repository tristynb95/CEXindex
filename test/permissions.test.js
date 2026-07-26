const path = require('node:path');
const url = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const modulePath = url.pathToFileURL(path.join(root, 'js', 'permissions.js')).href;

// js/permissions.js is an ES module (it is imported directly by auth.js and the
// admin portal), so it is loaded dynamically rather than required.
let P;
test.before(async () => {
  P = await import(modulePath);
});

test('an unspecified permission object grants nothing at all', () => {
  const perms = P.normalizePermissions(null);
  assert.equal(Object.values(perms.tabs).some(Boolean), false);
  assert.equal(perms.actions.logVisits, false);
  assert.equal(Object.values(perms.admin).every((level) => level === 'none'), true);
  assert.equal(perms.teamScope, 'none');
});

test('a role stored before My Team existed has no team access', () => {
  const legacy = {
    tabs: { overview: true },
    actions: { logVisits: true },
    admin: { visits: 'edit', sites: 'none', dataset: 'none', users: 'none' }
  };
  assert.equal(P.teamScopeOf(legacy), 'none');
  assert.equal(P.canSeeTeam(legacy), false);
  // …and nothing else about it changes.
  assert.equal(P.normalizePermissions(legacy).admin.visits, 'edit');
  assert.equal(P.normalizePermissions(legacy).actions.logVisits, true);
});

test('an unrecognised team scope is treated as no access', () => {
  assert.equal(P.normalizeTeamScope('everyone'), 'none');
  assert.equal(P.normalizeTeamScope(undefined), 'none');
  assert.equal(P.normalizeTeamScope('all'), 'all');
});

test('the built-in roles keep their historic access, and only Admin sees the team', () => {
  const admin = P.normalizePermissions(P.BUILTIN_ROLES.admin.permissions);
  const viewer = P.normalizePermissions(P.BUILTIN_ROLES.viewer.permissions);

  assert.equal(P.hasAdminPanelAccess(admin), true);
  assert.equal(P.hasAdminPanelAccess(viewer), false);
  // Every signed-in user could historically log a check-in — Viewer must keep it.
  assert.equal(viewer.actions.logVisits, true);
  assert.equal(Object.values(viewer.tabs).every(Boolean), true);
  assert.equal(admin.teamScope, 'all');
  assert.equal(viewer.teamScope, 'none');
});

test('the access grid round-trips a permission object without changing it', () => {
  const original = P.normalizePermissions({
    tabs: { overview: true, map: true, 'visit-log': true },
    actions: { logVisits: true },
    admin: { visits: 'edit', sites: 'view', dataset: 'none', users: 'none' },
    teamScope: 'direct'
  });

  const rebuilt = P.permissionsFromAccessGrid(P.readAccessGrid(original), original.teamScope);
  assert.deepEqual(rebuilt, original);
});

test('the grid maps admin levels onto see and edit cells', () => {
  const grid = P.readAccessGrid({ admin: { visits: 'edit', sites: 'view', dataset: 'none' } });
  assert.deepEqual(grid['area:visits'], { see: true, edit: true });
  assert.deepEqual(grid['area:sites'], { see: true, edit: false });
  assert.deepEqual(grid['area:dataset'], { see: false, edit: false });
});

test('edit access to a panel always implies seeing it', () => {
  // "Edit but not see" is not a state the stored levels can express, and would
  // be a lie if it were: anyone who can change a panel can read it.
  const perms = P.permissionsFromAccessGrid({ 'area:visits': { see: false, edit: true } }, 'none');
  assert.equal(perms.admin.visits, 'edit');
  assert.deepEqual(P.readAccessGrid(perms)['area:visits'], { see: true, edit: true });
});

test('logging visits is the Bakery Reports row\'s edit cell, and needs the tab', () => {
  const withTab = P.permissionsFromAccessGrid({ 'tab:visit-log': { see: true, edit: true } }, 'none');
  assert.equal(withTab.tabs['visit-log'], true);
  assert.equal(withTab.actions.logVisits, true);

  // Nobody can log a visit from a tab they cannot open.
  const withoutTab = P.permissionsFromAccessGrid({ 'tab:visit-log': { see: false, edit: true } }, 'none');
  assert.equal(withoutTab.tabs['visit-log'], false);
  assert.equal(withoutTab.actions.logVisits, false);
});

test('only the Bakery Reports tab has an edit cell', () => {
  const editable = P.accessRowsForGroup('dashboard').filter((row) => row.editable).map((row) => row.key);
  assert.deepEqual(editable, ['tab:visit-log']);
  assert.equal(P.accessRowsForGroup('admin').every((row) => row.editable), true);
});

test('the grid covers every tab and every admin area, once each', () => {
  const keys = P.ACCESS_ROWS.map((row) => row.key);
  assert.equal(new Set(keys).size, keys.length);
  P.DASHBOARD_TABS.forEach((tab) => assert.ok(keys.includes('tab:' + tab.key)));
  P.ADMIN_AREAS.forEach((area) => assert.ok(keys.includes('area:' + area.key)));
});

test('a role reads back in plain English', () => {
  const full = P.BUILTIN_ROLES.admin.permissions;
  assert.match(P.describeVisibility(full), /whole dashboard/);
  assert.match(P.describeVisibility(full), /every admin panel/);
  assert.match(P.describeVisibility(full), /whole team/);

  const readOnly = P.normalizePermissions({ tabs: { overview: true }, admin: { visits: 'view' } });
  assert.match(P.describeVisibility(readOnly), /1 of 7 dashboard tabs/);
  assert.equal(P.describeEditing(readOnly), 'Nothing — read only');
});

test('team scope labels are stable enough to show a user', () => {
  assert.equal(P.teamScopeLabel('all'), 'The whole coffee team');
  assert.equal(P.teamScopeLabel('direct'), 'Their own team');
  assert.equal(P.teamScopeLabel('nonsense'), 'No team view');
});
