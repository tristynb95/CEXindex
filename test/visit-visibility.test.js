const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

// Ops areas are named after their manager, so "own sites" = bakeries whose ops
// area equals the signed-in user's assigned opsArea.
const OPS_BY_BAKERY = {
  Henley: 'Bobby Holmes',
  Marlow: 'Bobby Holmes',
  Highgate: 'Kate Downes',
  Islington: 'Kate Downes'
};

function loadVisitReport() {
  const context = {
    console,
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    setTimeout,
    clearTimeout,
    GAILS: {
      CQVShared: {
        hasCriticalFail() { return false; },
        band() { return ''; },
        bandColor() { return ''; },
        priorityColor() { return ''; },
        criticalTag() { return ''; },
        lostPointItems() { return []; }
      },
      NBOShared: {
        pctText() { return ''; },
        scorable() { return []; },
        visitLabel() { return ''; }
      },
      escapeHtml(v) { return String(v == null ? '' : v); },
      resolveBakeryMetaKey(name) { return String(name || '').trim().toLowerCase(); },
      getBakeryMapLabel(name) { return name; },
      getBakeryOps(name) { return OPS_BY_BAKERY[name] || 'Unknown'; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.GAILS;
}

function setScope(GAILS, opts) {
  GAILS.isAdmin = !!opts.isAdmin;
  GAILS.reportVisibilityEnabled = !!opts.enabled;
  GAILS.userOpsArea = opts.userOpsArea || '';
}

test('exposes the scope predicate on GAILS', () => {
  const GAILS = loadVisitReport();
  assert.equal(typeof GAILS.reportBakeryAllowed, 'function');
  assert.equal(typeof GAILS.reportScopeActive, 'function');
});

test('everyone sees all sites when the master switch is off', () => {
  const GAILS = loadVisitReport();
  setScope(GAILS, { isAdmin: false, enabled: false, userOpsArea: 'Bobby Holmes' });
  assert.equal(GAILS.reportScopeActive(), false);
  assert.equal(GAILS.reportBakeryAllowed('Henley'), true);
  assert.equal(GAILS.reportBakeryAllowed('Highgate'), true);
});

test('admins always see all sites, even with the switch on and an area set', () => {
  const GAILS = loadVisitReport();
  setScope(GAILS, { isAdmin: true, enabled: true, userOpsArea: 'Bobby Holmes' });
  assert.equal(GAILS.reportScopeActive(), false);
  assert.equal(GAILS.reportBakeryAllowed('Highgate'), true);
});

test('unassigned users (coffee team, head of ops) see all sites', () => {
  const GAILS = loadVisitReport();
  setScope(GAILS, { isAdmin: false, enabled: true, userOpsArea: '' });
  assert.equal(GAILS.reportScopeActive(), false);
  assert.equal(GAILS.reportBakeryAllowed('Henley'), true);
  assert.equal(GAILS.reportBakeryAllowed('Highgate'), true);
});

test('an assigned ops manager only sees their own ops area when the switch is on', () => {
  const GAILS = loadVisitReport();
  setScope(GAILS, { isAdmin: false, enabled: true, userOpsArea: 'Bobby Holmes' });
  assert.equal(GAILS.reportScopeActive(), true);
  assert.equal(GAILS.reportBakeryAllowed('Henley'), true);   // own area
  assert.equal(GAILS.reportBakeryAllowed('Marlow'), true);   // own area
  assert.equal(GAILS.reportBakeryAllowed('Highgate'), false); // another area
  assert.equal(GAILS.reportBakeryAllowed('Islington'), false);
});

test('filtering a mixed list keeps only the manager\'s own sites', () => {
  const GAILS = loadVisitReport();
  setScope(GAILS, { isAdmin: false, enabled: true, userOpsArea: 'Kate Downes' });
  const visits = [
    { bakery: 'Henley' }, { bakery: 'Highgate' },
    { bakery: 'Marlow' }, { bakery: 'Islington' }
  ];
  const kept = visits.filter(function (v) { return GAILS.reportBakeryAllowed(v.bakery); });
  assert.deepEqual(kept.map(function (v) { return v.bakery; }), ['Highgate', 'Islington']);
});

test('the scope is wired into every Bakery Reports source list', () => {
  // Guards against a future edit silently dropping the enforcement at one of
  // the three source builders (follow-ups, visit history, bakery pickers).
  assert.match(source, /\.filter\(function \(t\) \{ return reportBakeryAllowed\(t\.bakery\); \}\)/); // follow-ups
  assert.match(source, /\.filter\(function \(v\) \{ return reportBakeryAllowed\(v\.bakery\); \}\)/); // visit history
  assert.match(source, /\.filter\(reportBakeryAllowed\)/); // unvisited list + Log Visit pickers
});
