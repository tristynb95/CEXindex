const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'team.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const Team = context.window.GAILS.Team;

// A small coffee team:
//   head            — Head of Operations, reports to nobody
//   ├── manager     — coffee team manager
//   │   ├── partnerA
//   │   └── partnerB
//   └── trainer
const ROSTER = {
  head: { name: 'Harriet Head', email: 'Harriet@GAILS.com', role: 'head-of-ops' },
  manager: { name: 'Morgan Manager', email: 'morgan@gails.com', managerUid: 'head', role: 'coffee-manager' },
  partnerA: { name: 'Alex Partner', email: 'alex@gails.com', managerUid: 'manager', role: 'coffee-partner' },
  partnerB: { name: 'Blake Partner', email: 'blake@gails.com', managerUid: 'manager', role: 'coffee-partner' },
  trainer: { name: 'Tam Trainer', email: 'tam@gails.com', managerUid: 'head', role: 'coffee-trainer' }
};

// team.js is evaluated in its own vm realm, so the arrays it returns do not
// share this realm's Array.prototype and strict deep-equality rejects them on
// that alone. A JSON round-trip brings them home.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function uids(list) {
  return plain(list).map((person) => person.uid);
}

test('normalizes both roster shapes into the same person record', () => {
  const fromDirectory = Team.normalizePerson('u1', { name: '  Alex   Partner ', email: 'Alex@GAILS.com', managerUid: ' m1 ' });
  const fromAdminList = Team.normalizePerson('u1', { firstName: 'Alex', lastName: 'Partner', email: 'alex@gails.com', managerUid: 'm1', role: 'coffee-partner' });

  assert.equal(fromDirectory.name, 'Alex Partner');
  assert.equal(fromDirectory.email, 'alex@gails.com');
  assert.equal(fromDirectory.managerUid, 'm1');
  assert.equal(fromAdminList.name, 'Alex Partner');
  assert.equal(fromAdminList.roleId, 'coffee-partner');
});

test('a person with no uid cannot be placed in the tree', () => {
  const roster = Team.normalizeRoster([{ name: 'Nameless' }, { uid: 'u1', name: 'Alex Partner' }]);
  assert.deepEqual(uids(roster), ['u1']);
});

test('direct reports are only the people one level down', () => {
  assert.deepEqual(uids(Team.directReports('head', ROSTER)).sort(), ['manager', 'trainer']);
  assert.deepEqual(uids(Team.directReports('manager', ROSTER)).sort(), ['partnerA', 'partnerB']);
  assert.deepEqual(uids(Team.directReports('partnerA', ROSTER)), []);
});

test('a manager sees their reports and their reports\' reports', () => {
  assert.deepEqual(uids(Team.teamUnder('head', ROSTER)).sort(), ['manager', 'partnerA', 'partnerB', 'trainer']);
  assert.deepEqual(uids(Team.teamUnder('manager', ROSTER)).sort(), ['partnerA', 'partnerB']);
  assert.deepEqual(uids(Team.teamUnder('partnerA', ROSTER)), []);
});

test('a manager never appears inside their own team', () => {
  assert.ok(!uids(Team.teamUnder('head', ROSTER)).includes('head'));
});

test('direct reports are listed before people further down the tree', () => {
  assert.deepEqual(uids(Team.teamUnder('head', ROSTER)).slice(0, 2).sort(), ['manager', 'trainer']);
});

test('a reporting loop terminates instead of hanging, and lists each person once', () => {
  const looped = {
    a: { name: 'A Person', managerUid: 'c' },
    b: { name: 'B Person', managerUid: 'a' },
    c: { name: 'C Person', managerUid: 'b' }
  };
  const team = uids(Team.teamUnder('a', looped)).sort();
  assert.deepEqual(team, ['b', 'c']);
});

test('someone managing themselves is not their own report', () => {
  const selfManaged = { a: { name: 'A Person', managerUid: 'a' } };
  assert.deepEqual(uids(Team.teamUnder('a', selfManaged)), []);
  assert.deepEqual(uids(Team.directReports('a', selfManaged)), []);
});

test('the manager chain runs upwards, nearest manager first', () => {
  assert.deepEqual(uids(Team.managerChain('partnerA', ROSTER)), ['manager', 'head']);
  assert.deepEqual(uids(Team.managerChain('head', ROSTER)), []);
});

test('a manager chain in a loop stops instead of repeating', () => {
  const looped = { a: { managerUid: 'b', name: 'A' }, b: { managerUid: 'a', name: 'B' } };
  assert.deepEqual(uids(Team.managerChain('a', looped)), ['b']);
});

test('refuses the assignment that would create a loop', () => {
  // Making the head report to one of their own reports is a loop.
  assert.equal(Team.assignmentWouldCycle('head', 'partnerA', ROSTER), true);
  assert.equal(Team.assignmentWouldCycle('head', 'head', ROSTER), true);
  // Moving a partner to a different manager is fine.
  assert.equal(Team.assignmentWouldCycle('partnerA', 'trainer', ROSTER), false);
  // Clearing a manager is always fine.
  assert.equal(Team.assignmentWouldCycle('partnerA', '', ROSTER), false);
});

test('team scope decides the roster: none sees nobody, direct follows the line, all sees everyone', () => {
  assert.deepEqual(uids(Team.visibleTeam('manager', 'none', ROSTER)), []);
  assert.deepEqual(uids(Team.visibleTeam('manager', 'direct', ROSTER)).sort(), ['partnerA', 'partnerB']);
  assert.deepEqual(
    uids(Team.visibleTeam('manager', 'all', ROSTER)).sort(),
    ['head', 'partnerA', 'partnerB', 'trainer']
  );
});

test('the whole-team scope still leaves the viewer out of their own team list', () => {
  assert.ok(!uids(Team.visibleTeam('head', 'all', ROSTER)).includes('head'));
});

test('a scope the role does not have falls through to nobody', () => {
  assert.deepEqual(uids(Team.visibleTeam('manager', undefined, ROSTER)), []);
  assert.deepEqual(uids(Team.visibleTeam('manager', 'everything', ROSTER)), []);
});

// The real shape this has to support: area head baristas report to coffee
// partners, coffee partners report to the coffee manager. The manager must see
// both levels, with each barista under the partner they belong to.
//
//   manager
//   ├── partnerA
//   │   ├── baristaA1
//   │   └── baristaA2
//   └── partnerB
//       └── baristaB1
const THREE_LEVELS = {
  manager: { name: 'Morgan Manager', role: 'coffee-manager' },
  partnerA: { name: 'Alex Partner', managerUid: 'manager', role: 'coffee-partner' },
  partnerB: { name: 'Blake Partner', managerUid: 'manager', role: 'coffee-partner' },
  baristaA1: { name: 'Ash Barista', managerUid: 'partnerA', role: 'area-head-barista' },
  baristaA2: { name: 'Bo Barista', managerUid: 'partnerA', role: 'area-head-barista' },
  baristaB1: { name: 'Cam Barista', managerUid: 'partnerB', role: 'area-head-barista' }
};

test('a coffee manager sees the partners and the baristas reporting to them', () => {
  assert.deepEqual(
    uids(Team.teamUnder('manager', THREE_LEVELS)).sort(),
    ['baristaA1', 'baristaA2', 'baristaB1', 'partnerA', 'partnerB']
  );
  // A partner sees only their own baristas, not the other partner's.
  assert.deepEqual(uids(Team.teamUnder('partnerA', THREE_LEVELS)).sort(), ['baristaA1', 'baristaA2']);
});

test('team rows nest each barista under the partner they report to', () => {
  const rows = plain(Team.teamRows('manager', 'direct', THREE_LEVELS));

  assert.deepEqual(rows.map((row) => [row.person.uid, row.depth]), [
    ['partnerA', 0],
    ['baristaA1', 1],
    ['baristaA2', 1],
    ['partnerB', 0],
    ['baristaB1', 1]
  ]);
});

test('team rows count direct reports and the whole branch separately', () => {
  const rows = plain(Team.teamRows('manager', 'direct', THREE_LEVELS));
  const partnerA = rows.find((row) => row.person.uid === 'partnerA');
  const baristaA1 = rows.find((row) => row.person.uid === 'baristaA1');

  assert.equal(partnerA.reportCount, 2);
  assert.equal(partnerA.teamSize, 2);
  assert.equal(baristaA1.reportCount, 0);
  assert.equal(baristaA1.teamSize, 0);
});

test('a deeper chain still rolls the whole branch up to the top row', () => {
  // manager → partner → barista → trainee: the partner's branch is 2 people
  // deep even though only one reports to them directly.
  const deep = {
    manager: { name: 'Morgan Manager' },
    partner: { name: 'Alex Partner', managerUid: 'manager' },
    barista: { name: 'Ash Barista', managerUid: 'partner' },
    trainee: { name: 'Tal Trainee', managerUid: 'barista' }
  };
  const rows = plain(Team.teamRows('manager', 'direct', deep));
  const partner = rows.find((row) => row.person.uid === 'partner');

  assert.deepEqual(rows.map((row) => row.depth), [0, 1, 2]);
  assert.equal(partner.reportCount, 1);
  assert.equal(partner.teamSize, 2);
});

test('rows only count people the viewer can see', () => {
  // From partnerA's own seat, partnerB's barista is not theirs to count.
  const rows = plain(Team.teamRows('partnerA', 'direct', THREE_LEVELS));
  assert.deepEqual(rows.map((row) => row.person.uid).sort(), ['baristaA1', 'baristaA2']);
  assert.equal(rows.every((row) => row.depth === 0), true);
});

test('the whole-team scope shows the top of the tree at depth zero', () => {
  const rows = plain(Team.teamRows('someone-else', 'all', THREE_LEVELS));
  const manager = rows.find((row) => row.person.uid === 'manager');
  assert.equal(manager.depth, 0);
  assert.equal(manager.teamSize, 5);
  assert.equal(rows.length, 6);
});

test('a person caught in a reporting loop is still listed, exactly once', () => {
  const looped = {
    lead: { name: 'Lee Lead' },
    a: { name: 'A Person', managerUid: 'b' },
    b: { name: 'B Person', managerUid: 'a' }
  };
  const rows = plain(Team.teamRows('viewer', 'all', looped));
  const listed = rows.map((row) => row.person.uid).sort();
  assert.deepEqual(listed, ['a', 'b', 'lead']);
});

test('a branch is the person plus everyone beneath them', () => {
  assert.deepEqual(plain(Team.branchUids('partnerA', THREE_LEVELS)).sort(), ['baristaA1', 'baristaA2', 'partnerA']);
  assert.deepEqual(plain(Team.branchUids('baristaA1', THREE_LEVELS)), ['baristaA1']);
  assert.deepEqual(plain(Team.branchUids('', THREE_LEVELS)), []);
});
