const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

const adminHtml = read('admin.html');
const adminScript = read('js/admin-page.js');
const authScript = read('js/auth.js');
const teamScript = read('js/my-team.js');
const teamHtml = read('my-team.html');
const profileScript = read('js/profile-page.js');
const standaloneMenuScript = read('js/standalone-profile-menu.js');
const rules = JSON.parse(read('database.rules.json'));

// ── One place for both questions ──────────────────────────────────────────

test('Users and Roles are one panel, reachable from one nav entry', () => {
  assert.match(adminHtml, /data-admin-panel="access"/);
  assert.match(adminHtml, /data-admin-panel-content="access"/);
  // The two old panels are gone, not merely hidden.
  assert.doesNotMatch(adminHtml, /data-admin-panel-content="users"/);
  assert.doesNotMatch(adminHtml, /data-admin-panel-content="roles"/);
  assert.doesNotMatch(adminHtml, /data-admin-panel="roles"/);

  // Both tables now live inside that one panel.
  const panelStart = adminHtml.indexOf('data-admin-panel-content="access"');
  const panel = adminHtml.slice(panelStart, adminHtml.indexOf('</section>', panelStart));
  assert.match(panel, /id="adminUserList"/);
  assert.match(panel, /id="adminRoleList"/);
  assert.match(panel, /id="reportVisibilityToggle"/);
});

test('an old #users or #roles link still lands on People & Access', () => {
  assert.match(adminScript, /RENAMED_PANELS = \{ users: 'access', roles: 'access' \}/);
  assert.match(adminScript, /if \(RENAMED_PANELS\[panelName\]\) panelName = RENAMED_PANELS\[panelName\]/);
  // The panel is still gated on the same permission area it always was.
  assert.match(adminScript, /PANEL_AREAS = \{ access: 'users'/);
});

test('every row of the people table answers "can see" and "can edit"', () => {
  const header = adminHtml.slice(adminHtml.indexOf('admin-table--people'), adminHtml.indexOf('id="adminUserList"'));
  ['Person', 'Department', 'Role', 'Reports to', 'Can see', 'Can edit'].forEach((column) => {
    assert.ok(header.includes('<th>' + column + '</th>'), 'missing column: ' + column);
  });
  // Both summaries come from the shared describers, so a role reads the same
  // wherever it is shown.
  assert.match(adminScript, /describeVisibility\(perms\)/);
  assert.match(adminScript, /describeEditing\(perms\)/);
});

test('the roles table shows visibility, editing, and team view side by side', () => {
  const header = adminHtml.slice(adminHtml.indexOf('admin-table--roles'), adminHtml.indexOf('id="adminRoleList"'));
  ['Role', 'Can see', 'Can edit', 'Team view', 'People'].forEach((column) => {
    assert.ok(header.includes('<th>' + column + '</th>'), 'missing column: ' + column);
  });
});

// ── The access modals ─────────────────────────────────────────────────────

test('one dialog holds every profile and access decision about a person', () => {
  [
    'userAccessFirstName', 'userAccessLastName',
    'userAccessRole', 'userAccessDepartment', 'userAccessManager', 'userAccessMyActivity',
    'userAccessDepartmentOperations', 'userAccessDepartmentCoffeeTeam',
    // Which part of the estate they look after, and what reaches their bell.
    'userAccessPatchList', 'userAccessNotifications'
  ].forEach((id) => {
    assert.match(adminHtml, new RegExp('id="' + id + '"'));
  });
  // And shows what those choices add up to, before they are saved.
  ['userAccessSee', 'userAccessEdit', 'userAccessTeam'].forEach((id) => {
    assert.match(adminHtml, new RegExp('id="' + id + '"'));
  });
  assert.match(adminScript, /function renderAccessReadout\(\)/);
});

test('users can be assigned to one of the two fixed departments', () => {
  assert.match(adminScript, /const DEPARTMENTS = \[[\s\S]*?id: 'operations', name: 'Operations'[\s\S]*?id: 'coffee-team', name: 'Coffee Team'/);
  assert.match(adminHtml, /id="newDepartmentSelect" required/);
  assert.match(adminScript, /department: department/);
  assert.match(adminScript, /department: normalizeDepartment\(users\[uid\]\.department\)/);
  assert.match(adminScript, /department: normalizeDepartment\(draft\.department\) \|\| null/);
});

test('department visibility is configured in Manage Access, not on the People card', () => {
  assert.doesNotMatch(adminHtml, /id="departmentVisibilityControls"/);
  assert.match(adminHtml, /id="userAccessTeamDepartments"/);
  assert.match(adminHtml, /Departments visible in My Team/);
  assert.match(adminScript, /function hiddenMyTeamDepartmentsForDraft\(draft\)/);
  assert.match(adminScript, /hiddenMyTeamDepartments: hiddenMyTeamDepartments/);
});

test('My Team applies Manage Access department visibility without page-level checkboxes', () => {
  assert.doesNotMatch(teamHtml, /id="myTeamDepartmentControls"/);
  assert.match(teamScript, /let accessibleRoster = \[\]/);
  assert.match(teamScript, /function applyDepartmentVisibility\(\)/);
  assert.match(teamScript, /hiddenMyTeamDepartments\[department\] !== true/);
  assert.match(teamScript, /userProfile && userProfile\.hiddenMyTeamDepartments/);
  assert.doesNotMatch(teamScript, /data-team-department|departmentControls/);
  assert.match(teamScript, /import \{ ref, get, onValue \}/);
});

test('department values and assignments are protected by database rules', () => {
  const userRule = rules.rules.users.$uid;
  assert.match(userRule['.validate'], /department'\)\.val\(\) === 'operations'/);
  assert.match(userRule['.validate'], /department'\)\.val\(\) === 'coffee-team'/);
  assert.match(userRule['.write'], /newData\.child\('department'\)\.val\(\) === data\.child\('department'\)\.val\(\)/);
  assert.match(userRule.hiddenMyTeamDepartments.$department['.validate'], /\$department === 'coffee-team'/);
});

test('the role editor is a see/edit grid built from the shared row list', () => {
  assert.match(adminHtml, /id="roleAccessGrid"/);
  assert.match(adminHtml, /id="roleTeamScope"/);
  assert.match(adminScript, /accessRowsForGroup\(group\.key\)/);
  assert.match(adminScript, /data-access-see=/);
  assert.match(adminScript, /data-access-edit=/);
  // The three-state none/view/edit radio grid is gone.
  assert.doesNotMatch(adminHtml, /roleAreaMatrix|roleTabMatrix/);
  assert.doesNotMatch(adminScript, /roleArea-/);
});

test('ticking Edit ticks See, and clearing See clears Edit', () => {
  const start = adminScript.indexOf('function syncAccessGridPair(');
  const fn = adminScript.slice(start, adminScript.indexOf('\n}', start));
  assert.match(fn, /changed === editBox && editBox\.checked\) seeBox\.checked = true/);
  assert.match(fn, /changed === seeBox && !seeBox\.checked\) editBox\.checked = false/);
});

test('an admin cannot demote or orphan their own account', () => {
  const start = adminScript.indexOf('function openAccessModal(');
  const fn = adminScript.slice(start, adminScript.indexOf('\nfunction closeAccessModal', start));
  assert.match(fn, /var editable = canEdit\('users'\) && !isCurrent/);
  assert.match(fn, /userAccessRole\.disabled = !editable/);
  assert.match(fn, /userAccessManager\.disabled = !editable/);
  assert.match(fn, /userAccessSave\.hidden = !canEdit\('users'\)/);
  assert.match(fn, /userAccessRemove\.hidden = !editable/);
  // The self-save branch writes only names, then returns before role or
  // reporting-line updates.
  assert.match(adminScript, /if \(uid === currentUserId\(\)\) \{[\s\S]*?firstName: firstName,[\s\S]*?lastName: lastName[\s\S]*?return;/);
});

// ── Reporting lines ───────────────────────────────────────────────────────

test('a reporting line cannot be bent into a loop', () => {
  // The picker never offers a manager that would create one…
  assert.match(adminScript, /return !api\.assignmentWouldCycle\(subjectUid, user\.uid, state\.users\)/);
  // …and the save refuses it even if one were submitted.
  assert.match(adminScript, /if \(draft\.managerUid && api && api\.assignmentWouldCycle\(uid, draft\.managerUid, state\.users\)\)/);
});

test('removing someone detaches their reports instead of stranding them', () => {
  const start = adminScript.indexOf('async function revokeUser(');
  const fn = adminScript.slice(start, adminScript.indexOf('\nfunction updateSiteDraft', start));
  // The admin is warned before it happens.
  assert.match(fn, /currently reports to them and will be left without a manager/);
  // Their reports keep their accounts; only the line is cleared.
  assert.match(fn, /update\(ref\(db, 'users\/' \+ report\.uid\), \{ managerUid: '' \}\)/);
  // And they leave both shared directories.
  assert.match(fn, /remove\(ref\(db, 'userDirectory\/' \+ uid\)\)/);
  assert.match(fn, /remove\(ref\(db, 'teamDirectory\/' \+ uid\)\)/);
});

test('the team directory is published alongside the mention directory', () => {
  const start = adminScript.indexOf('function publishDirectoryEntries(');
  const fn = adminScript.slice(start, adminScript.indexOf('\nasync function revokeUser', start));
  assert.match(fn, /set\(ref\(db, 'teamDirectory\/' \+ person\.uid\)/);
  assert.match(fn, /managerUid: person\.managerUid/);
  // Only someone who can edit access may publish it.
  assert.match(fn, /if \(!canEdit\('users'\)\) return;/);
  // A rejected write warns rather than breaking the list it runs off.
  assert.match(fn, /Could not publish[\s\S]*?to the team directory/);
});

// ── My Team ───────────────────────────────────────────────────────────────

test('My Team is granted by the role, not a per-user switch', () => {
  assert.match(teamScript, /var permissions = resolveRolePermissions\(roleId, customRole\);\s*\r?\n\s*teamScope = teamScopeOf\(permissions\)/);
  // Hidden in the menu without it…
  ['index.html', 'admin.html'].forEach((page) => {
    assert.match(read(page), /data-my-team-link hidden/);
  });
  assert.match(read('profile.html'), /data-standalone-account-menu/);
  assert.match(standaloneMenuScript, /data-standalone-team-link hidden/);
  assert.match(profileScript, /showTeam: canSeeTeam\(currentPermissions\)/);
  assert.match(authScript, /function applyMyTeamAccess\(permissions\)/);
  assert.match(authScript, /link\.hidden = !canSeeTeam\(permissions\)/);
  // …and the page refuses a typed URL, which a hidden menu entry cannot do.
  assert.match(teamScript, /if \(teamScope === 'none'\) \{/);
  assert.match(teamScript, /showGuardError\('My Team is not switched on for your role/);
});

test('Admin Portal is available from every profile menu only with admin access', () => {
  assert.match(read('index.html'), /data-admin-portal-link hidden/);
  assert.match(authScript, /adminPortalLink\.hidden = !\(isAdmin \|\| hasAdminPanelAccess\(permissions\)\)/);

  assert.match(standaloneMenuScript, /href="admin\.html" role="menuitem"[\s\S]*?data-admin-portal-link hidden/);
  assert.match(standaloneMenuScript, /import \{ hasAdminPanelAccess \} from '\.\/permissions\.js'/);
  assert.match(standaloneMenuScript, /adminLink\.hidden = !hasAdminPanelAccess\(settings\.permissions\)/);

  assert.match(adminHtml, /href="admin\.html" role="menuitem"[\s\S]*?data-admin-portal-link hidden/);
  assert.match(adminScript, /adminPortalLink\.hidden = !hasAdminPanelAccess\(state\.permissions\)/);

  [
    'js/profile-page.js',
    'js/my-activity.js',
    'js/my-team.js',
    'js/bakery-profile.js'
  ].forEach((file) => {
    assert.match(read(file), /mountStandaloneProfileMenu\(\{[\s\S]*?permissions: [a-zA-Z]+/, file);
  });
});

test('the roster is read from teamDirectory, never from /users', () => {
  assert.match(teamScript, /get\(ref\(db, 'teamDirectory'\)\)/);
  // /users carries roles and ops areas and stays unreadable to ordinary users;
  // My Team only reads the signed-in person's own record.
  assert.doesNotMatch(teamScript, /ref\(db, 'users'\)/);
  assert.match(teamScript, /get\(ref\(db, 'users\/' \+ user\.uid\)\)/);
});

test('a role without a team view cannot read the roster at all', () => {
  const teamRead = rules.rules.teamDirectory['.read'];
  assert.match(teamRead, /teamScope'\)\.val\(\) === 'direct'/);
  assert.match(teamRead, /teamScope'\)\.val\(\) === 'all'/);
  assert.match(teamRead, /admins'\)\.child\(auth\.uid\)\.val\(\) === true/);

  // Only someone who can edit access may write it — nobody can add themselves
  // to a team, which is what makes the roster trustworthy.
  const teamWrite = rules.rules.teamDirectory.$uid['.write'];
  assert.match(teamWrite, /admin'\)\.child\('users'\)\.val\(\) === 'edit'/);
  assert.doesNotMatch(teamWrite, /\$uid === auth\.uid/);
});

test('a non-admin cannot move themselves under a different manager', () => {
  const selfWrite = rules.rules.users.$uid['.write'];
  assert.match(selfWrite,
    /auth\.uid === \$uid[\s\S]*?newData\.child\('managerUid'\)\.val\(\) === data\.child\('managerUid'\)\.val\(\)/);
});

test('My Team groups records it already had access to, and adds none', () => {
  // The same two nodes every signed-in user can already read. Visits come
  // through the shared scoped reader (js/visit-feed.js) rather than a raw
  // whole-node listener, but it is the same node — narrowed by date, never
  // widened to anything this page could not read before.
  assert.match(teamScript, /subscribeVisits\(\{/);
  assert.match(teamScript, /import \{ subscribeVisits \} from '\.\/visit-feed\.js'/);
  const feed = read('js/visit-feed.js');
  assert.match(feed, /opts\.path \|\| 'routineVisits'/);
  // No caller may point the shared feed at a node of its own choosing.
  assert.doesNotMatch(teamScript, /subscribeVisits\(\{[\s\S]{0,400}?path:/);
  assert.match(teamScript, /onValue\(ref\(db, 'followUpActions'\)/);
  // Read-only: a manager reviewing workload cannot close somebody else's task.
  assert.doesNotMatch(teamScript, /data-task-toggle/);
  assert.doesNotMatch(teamScript, /update\(ref\(db, 'followUpActions/);
});

test('the team page credits work by the same rules as My Activity', () => {
  assert.match(teamScript, /G\.Attribution\.forVisit\(visit\)/);
  assert.match(teamScript, /G\.Attribution\.forTask\(task, sourceVisit\)/);
  assert.match(teamScript, /G\.Attribution\.actorsForTask\(task, sourceVisit\)/);
  assert.match(teamScript, /G\.Attribution\.matches\(list, identity\)/);
  // A one-word name is too weak to attribute a visit on, here as there.
  assert.match(teamScript, /if \(name && name\.indexOf\(' '\) !== -1\) names\.add\(name\)/);
  assert.match(teamHtml, /src="js\/attribution\.js"/);
  assert.match(teamHtml, /src="js\/team\.js"/);
});

test('open actions are not hidden by the period filter', () => {
  const start = teamScript.indexOf('function teamTasks()');
  const fn = teamScript.slice(start, teamScript.indexOf('\n}', start));
  // A task raised eight months ago and still open is exactly what a manager
  // needs to see.
  assert.doesNotMatch(fn, /isDateWithinPeriod/);
  assert.match(teamScript.slice(teamScript.indexOf('function teamVisits()')), /isDateWithinPeriod/);
});

test('selecting a coffee partner shows their whole area', () => {
  assert.match(teamScript, /G\.Team\.branchUids\(uid, roster\)/);
  const start = teamScript.indexOf('function forSelected(');
  const fn = teamScript.slice(start, teamScript.indexOf('\n}', start));
  assert.match(fn, /branch\.indexOf\(owner\.uid\) !== -1/);
});

test('the roster renders the reporting tree, not a flat list', () => {
  assert.match(teamScript, /accessibleRoster = G\.Team \? G\.Team\.visibleTeam\(user\.uid, teamScope, directory\) : \[\]/);
  assert.match(teamScript, /rosterRows = G\.Team \? G\.Team\.teamRows\(currentUserUid, 'all', roster\) : \[\]/);
  assert.match(teamScript, /--team-depth:' \+ row\.depth/);
  assert.match(read('css/my-team.css'), /\.my-team-person--nested/);
  // A manager's own figures and their area's roll-up are stated separately.
  assert.match(teamScript, /Area total: /);
});
