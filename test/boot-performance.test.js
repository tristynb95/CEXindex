// Nothing on the dashboard renders until the signed-in user's dataset arrives,
// so the boot path is a chain where every avoidable step is felt on every
// single visit. These tests pin the shape of that chain: work that does not
// depend on the profile must not queue behind it, and nothing may reintroduce a
// timer where a direct call will do.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const authScript = read('js/auth.js');
const PAGES = [
  'index.html',
  'admin.html',
  'my-activity.html',
  'my-team.html',
  'bakery-profile.html',
  'profile.html'
];

test('the dataset render is called directly, never polled for', () => {
  // js/app.js is a deferred classic script and js/auth.js is a module, so the
  // init function is always published before auth resolves. Polling for it on
  // an interval cost a guaranteed 100ms on every load, because setInterval
  // never fires immediately.
  assert.doesNotMatch(authScript, /setInterval/,
    'the boot path should not poll for anything');
  assert.match(authScript, /if \(window\.GAILS_initDashboard\) runInit\(\);/);
  // The fallback must be an event, not a timer.
  assert.match(authScript, /window\.addEventListener\('load', function\(\) \{/);
});

test('dataset metadata is read alongside the profile, not after it', () => {
  const handlerStart = authScript.indexOf('onAuthStateChanged(auth, async (user)');
  assert.ok(handlerStart >= 0);
  const metaStart = authScript.indexOf('dashboardMetaPromise', handlerStart);
  const profileReads = authScript.indexOf('Promise.all([get(adminRef), get(userRef)])', handlerStart);
  assert.ok(metaStart >= 0, 'the metadata read should be kicked off in the auth handler');
  assert.ok(profileReads >= 0);
  // Started before the reads it used to wait behind.
  assert.ok(metaStart < profileReads,
    'dashboardMeta must be requested before the profile reads are awaited');
  // A rejection here must not surface as an unhandled rejection for a user who
  // is about to be signed back out.
  assert.match(authScript, /get\(ref\(db, 'dashboardMeta'\)\)\.catch/);
});

test('housekeeping writes do not block the dashboard', () => {
  // Repairing a stale stored email address is not something anything below
  // reads back, so it must not be awaited.
  assert.doesNotMatch(authScript, /await update\(userRef, \{\s*\n\s*email: user\.email/,
    'the email repair write should not be awaited');
  assert.match(authScript, /update\(userRef, \{[\s\S]{0,120}?\}\)\.catch\(/);
});

test('every page warms the Firebase origins it is about to use', () => {
  PAGES.forEach((page) => {
    const html = read(page);
    assert.match(html, /rel="preconnect" href="https:\/\/www\.gstatic\.com"/,
      page + ' should preconnect to the SDK origin');
    assert.match(html, /rel="preconnect" href="https:\/\/cexindex-default-rtdb\.firebaseio\.com"/,
      page + ' should preconnect to the database origin');
    // firebase-app.js is the module every other one is discovered through, so
    // declaring it is what collapses the waterfall.
    assert.match(html, /rel="modulepreload"[^>]*firebase-app\.js/,
      page + ' should declare the Firebase app module');
    assert.match(html, /rel="modulepreload"[^>]*firebase-auth\.js/, page + ' auth module');
    assert.match(html, /rel="modulepreload"[^>]*firebase-database\.js/, page + ' database module');
  });
});

test('Bakery Reports does not redraw while it is closed', () => {
  const visitReport = read('js/visit-report.js');
  // The visit and follow-up listeners in js/auth.js call renderVisitLog on
  // every snapshot, which during boot alone is at least three full passes —
  // filter, group, sort and rewrite the list — into a panel that is almost
  // never the one on screen.
  assert.match(visitReport, /window\.GAILS\._visitLogRenderPending = true;\s*\n\s*return;/);
  assert.match(visitReport,
    /var panelEl = document\.getElementById\('tab-visit-log'\);\s*\n\s*if \(panelEl && !panelEl\.classList\.contains\('active'\)\)/);
  // Opening the tab has to be what draws it, or the guard would strand the
  // panel empty.
  const app = read('js/app.js');
  assert.match(app, /if \(name === 'visit-log'\) \{[\s\S]{0,200}?G\.renderVisitLog\(\)/);
});

test('export rows are built on demand, not on every render', () => {
  const visitReport = read('js/visit-report.js');
  assert.match(visitReport, /function withLazyRows\(spec, buildRows\)/);
  // Memoised getter, so `data.rows` still reads as an array for the row count
  // in the confirmation dialog and for the writer.
  assert.match(visitReport, /Object\.defineProperty\(spec, 'rows'/);
  assert.match(visitReport, /if \(!cached\) cached = buildRows\(\);/);
  // Every view that builds an export spec must go through it — one eager
  // holdout would keep paying the cost on every render of that view.
  const specs = visitReport.match(/window\.GAILS\._visitLogExport = (?!null)/g) || [];
  const lazySpecs = visitReport.match(/window\.GAILS\._visitLogExport = withLazyRows\(\{/g) || [];
  assert.equal(specs.length, lazySpecs.length,
    'every _visitLogExport assignment should be wrapped in withLazyRows');
  assert.equal(lazySpecs.length, 4, 'expected the four export views');
  // An empty export is rejected from the cheap count, without building rows.
  assert.match(visitReport, /typeof data\.rowCount === 'number'/);
});

test('the preloaded SDK version matches the one actually imported', () => {
  // A stale modulepreload is worse than none: it downloads a second copy of the
  // SDK that no import ever uses.
  const imported = new Set();
  fs.readdirSync(path.join(root, 'js'))
    .filter((f) => f.endsWith('.js'))
    .forEach((f) => {
      const src = read('js/' + f);
      const matches = src.match(/firebasejs\/([0-9.]+)\//g) || [];
      matches.forEach((m) => imported.add(m));
    });
  assert.equal(imported.size, 1, 'all imports should agree on one SDK version');
  const version = [...imported][0];
  PAGES.forEach((page) => {
    const preloads = read(page).match(/rel="modulepreload"[^>]*firebasejs\/[0-9.]+\//g) || [];
    preloads.forEach((tag) => {
      assert.ok(tag.includes(version), page + ' preloads a different SDK version than it imports');
    });
  });
});
