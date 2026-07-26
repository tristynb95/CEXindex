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
  ['Person', 'Role', 'Reports to', 'Can see', 'Can edit'].forEach((column) => {
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
    'userAccessRole', 'userAccessManager', 'userAccessOps', 'userAccessMyActivity'
  ].forEach((id) => {
    assert.match(adminHtml, new RegExp('id="' + id + '"'));
  });
  // And shows what those choices add up to, before they are saved.
  ['userAccessSee', 'userAccessEdit', 'userAccessTeam'].forEach((id) => {
    assert.match(adminHtml, new RegExp('id="' + id + '"'));
  });
  assert.match(adminScript, /function renderAccessReadout\(\)/);
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
  assert.match(teamScript, /teamScope = teamScopeOf\(resolveRolePermissions\(roleId, customRole\)\)/);
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
  // The same two nodes every signed-in user can already read.
  assert.match(teamScript, /onValue\(ref\(db, 'routineVisits'\)/);
  assert.match(teamScript, /onValue\(ref\(db, 'followUpActions'\)/);
  // Read-only: a manager reviewing workload cannot close somebody else's task.
  assert.doesNotMatch(teamScript, /data-task-toggle/);
  assert.doesNotMatch(teamScript, /update\(ref\(db, 'followUpActions/);
});

test('the team page credits work by the same rules as My Activity', () => {
  assert.match(teamScript, /G\.Attribution\.forVisit\(visit\)/);
  assert.match(teamScript, /G\.Attribution\.forTask\(task\)/);
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
  assert.match(teamScript, /rosterRows = G\.Team \? G\.Team\.teamRows\(user\.uid, teamScope, directory\) : \[\]/);
  assert.match(teamScript, /--team-depth:' \+ row\.depth/);
  assert.match(read('css/my-team.css'), /\.my-team-person--nested/);
  // A manager's own figures and their area's roll-up are stated separately.
  assert.match(teamScript, /Area total: /);
});
