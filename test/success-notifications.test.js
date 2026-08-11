const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const utils = read('js/utils.js');
const styles = read('css/styles.css');
const auth = read('js/auth.js');
const visitReport = read('js/visit-report.js');
const myActivity = read('js/my-activity.js');
const bakeryProfile = read('js/bakery-profile.js');

test('success notifications are subtle, accessible, bounded, and dismissible', () => {
  assert.match(utils, /window\.GAILS\.notifySuccess = function\(message, options\)/);
  assert.match(utils, /region\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(utils, /toast\.setAttribute\('role', 'status'\)/);
  assert.match(utils, /while \(region\.children\.length >= 3\)/);
  assert.match(utils, /close\.setAttribute\('aria-label', 'Dismiss notification'\)/);
  assert.match(utils, /Math\.max\(1600, Number\(options\.duration\) \|\| 3200\)/);
  assert.match(styles, /\.app-toast-region\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(styles, /\.app-toast\s*\{[\s\S]*?opacity:\s*0[\s\S]*?transform:\s*translateY\(8px\)/);
  assert.match(styles, /\.app-toast\.is-visible\s*\{[\s\S]*?opacity:\s*1/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-toast/);
});

test('every page that can surface the shared workflow loads the notification assets', () => {
  // Both assets are cache-busted by version string. A page left on an older
  // one serves stale CSS or a stale utils.js to that page alone, so the check
  // is that every page asks for the same version rather than for a literal
  // that has to be re-pinned here on each bump.
  const files = ['index.html', 'my-activity.html', 'bakery-profile.html', 'admin.html', 'my-team.html'];
  ['css/styles.css', 'js/utils.js'].forEach((asset) => {
    const pattern = new RegExp(asset.replace(/[/.]/g, '\\$&') + '\\?v=([^"\']+)');
    const versions = files.map((file) => {
      const match = pattern.exec(read(file));
      assert.ok(match, file + ' must cache-bust ' + asset);
      return match[1];
    });
    assert.equal(new Set(versions).size, 1, 'pages disagree on ' + asset + ': ' + versions.join(', '));
  });
});

// The gaps allow for the notification event each write also records
// (js/notification-write.js) — the guarantee under test is that the toast still
// fires inside the success path, after the await, and never before it.
test('shared Firebase mutations notify only after successful writes', () => {
  assert.match(auth, /await set\(newVisitRef, payload\);[\s\S]{0,560}notifyMutation\(/);
  assert.match(auth, /await set\(newRef, payload\);[\s\S]{0,700}notifyMutation\('Task created'/);
  assert.match(auth, /await update\(ref\(db, 'followUpActions\/' \+ taskId\)[\s\S]{0,1000}notifyMutation\(done \? 'Task signed off' : 'Task reopened'/);
  assert.match(auth, /updateFollowUpAction:[\s\S]{0,650}notifyMutation\('Task updated'/);
  assert.match(auth, /if \(options && options\.silent\) return/);
});

test('a combined check-in produces one useful notification without duplicate task toasts', () => {
  assert.match(visitReport, /saveSiteVisit\(record, \{ silent: true \}\)/);
  assert.match(visitReport, /completeFollowUpAction\(id, true, \{ silent: true \}\)/);
  assert.match(visitReport, /saveFollowUpAction\(\{[\s\S]{0,520}\}, \{ silent: true \}\)/);
  assert.match(visitReport, /'Check-in saved'/);
  assert.match(visitReport, /' task created'/);
  assert.match(visitReport, /' task signed off'/);
  assert.match(visitReport, /window\.GAILS\.notifySuccess\(successParts\.join\(' · '\)\)/);
});

test('direct-write task surfaces notify for create, edit, sign-off, and reopen', () => {
  assert.match(myActivity, /await set\(taskRef, payload\);[\s\S]{0,100}G\.notifySuccess\('Task created'\)/);
  assert.match(myActivity, /await update\(ref\(db, 'followUpActions\/' \+ taskId\)[\s\S]{0,420}G\.notifySuccess\('Task updated'\)/);
  assert.match(myActivity, /G\.notifySuccess\(done \? 'Task signed off' : 'Task reopened'\)/);
  assert.match(bakeryProfile, /await set\(taskRef,[\s\S]{0,1400}G\.notifySuccess\('Task created'\)/);
  assert.match(bakeryProfile, /await update\(ref\(db, 'followUpActions\/' \+ task\.id\)[\s\S]{0,900}G\.notifySuccess\(done \? 'Task signed off' : 'Task reopened'\)/);
});
