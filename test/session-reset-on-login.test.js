const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const utils = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
const visitReport = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const myActivity = fs.readFileSync(path.join(root, 'js', 'my-activity.js'), 'utf8');
const myTeam = fs.readFileSync(path.join(root, 'js', 'my-team.js'), 'utf8');
const signOutNotice = fs.readFileSync(path.join(root, 'js', 'sign-out-notice.js'), 'utf8');

function resetBody() {
  const match = app.match(/function resetDashboardSession\(\) \{[\s\S]*?\r?\n  \}/);
  assert.ok(match, 'js/app.js should define resetDashboardSession');
  return match[0];
}

// Signing out never reloads the page — the login form goes up over a dashboard
// still holding the last session's tab, filters and open modal — so a new
// sign-in has to be walked back to the Overview deliberately.
test('a new session starts on the Overview with nothing of the last one open', () => {
  const body = resetBody();
  assert.match(body, /closeDrillDown/);
  assert.match(body, /closeFocusDetail/);
  assert.match(body, /closeVisitReport/);
  assert.match(body, /activateDashboardTab\('overview'\)/);
  // A hash left behind by a deep link is re-applied on load and on every
  // hashchange, so it would pull the new session straight back out again.
  assert.match(body, /window\.history\.replaceState\(null, '', window\.location\.pathname \+ window\.location\.search\)/);
  assert.match(app, /G\.resetDashboardSession = resetDashboardSession;/);
});

test('the reset clears every filter set, not just the shared filter bar', () => {
  const body = resetBody();
  assert.match(body, /resetAllFilters\(\);/);
  assert.match(body, /G\.resetFocusFilters\(\)/);
  assert.match(body, /G\.resetVisitLogFilters\(\)/);
  assert.match(body, /G\.clearStoredFilterState\(\)/);
});

test('both ends of the gap between sessions run the reset', () => {
  // As a session ends, so the login form is never laid over an open full-bleed
  // modal — those pin <body> and would strand it.
  assert.match(auth, /\} else \{[\s\S]*?resetDashboardForNewSession\(\);\r?\n    stopSiteMetaSync\(\);/);
  // And as the next sign-in starts, since a session can also end on My
  // Activity or My Team, which sign out back to the dashboard without it ever
  // seeing the sign-out.
  assert.match(auth, /_freshLogin = true;[\s\S]*?resetDashboardForNewSession\(\);\r?\n    await signInWithEmailAndPassword/);
  // A dashboard that fails to reset must not surface as a failed sign-in.
  assert.match(auth, /function resetDashboardForNewSession\(\) \{\s*try \{[\s\S]*?catch \(resetErr\) \{\s*console\.warn/);
});

// Bakery Reports, My Activity and My Team each persist their filters under a
// key of their own — those modules load, and are tested, without utils.js in
// front of them — so the list the reset clears is a second copy. A key renamed
// on one side and not the other would quietly survive the reset, which is what
// this pins.
test('the keys the reset clears are the keys the modules actually write', () => {
  const list = utils.match(/window\.GAILS\.FILTER_STORAGE_KEYS = \{([\s\S]*?)\};/);
  assert.ok(list, 'js/utils.js should list the persisted filter keys');
  const listed = {};
  list[1].replace(/(\w+): '([^']+)'/g, function (whole, name, key) { listed[name] = key; return whole; });
  assert.deepEqual(listed, {
    visitLog: 'gails.visitLogFilters',
    myActivity: 'gails_my_activity_filters',
    myTeam: 'gails_my_team_filters'
  });
  assert.ok(visitReport.includes("VISIT_LOG_FILTER_STORAGE_KEY = '" + listed.visitLog + "'"));
  assert.ok(myActivity.includes("FILTER_STORAGE_KEY = '" + listed.myActivity + "'"));
  assert.ok(myTeam.includes("FILTER_STORAGE_KEY = '" + listed.myTeam + "'"));
  assert.match(utils, /window\.GAILS\.clearStoredFilterState = function \(\) \{[\s\S]*?removeItem\(window\.GAILS\.FILTER_STORAGE_KEYS\[name\]\)/);
});

// Bakery Reports restores its stored filters on the first render after data
// loads, so the reset has to reach the stored copy as well as the live
// controls the tab leaves behind when it was opened.
test('Bakery Reports clears its stored filters whether or not the tab was opened', () => {
  assert.match(visitReport, /window\.GAILS\.resetVisitLogFilters = function \(\) \{[\s\S]*?removeItem\(VISIT_LOG_FILTER_STORAGE_KEY\)[\s\S]*?resetVisitLogView\(\);[\s\S]*?if \(visitLogFilterReset\) visitLogFilterReset\(\);/);
  assert.match(visitReport, /visitLogFilterReset = handleVisitLogFilterReset;/);
});

// The idle sign-out notice used to promise the session would be waiting.
test('the idle sign-out notice no longer promises a resumed session', () => {
  assert.doesNotMatch(signOutNotice, /pick up where you left off/);
});
