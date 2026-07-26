const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'my-activity.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js', 'my-activity.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'my-activity.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const authScript = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const visitReportScript = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const eslintConfig = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');

// Top-level functions in js/my-activity.js are lifted out one at a time and run
// in a bare context, which is how the rest of this suite tests browser-only
// modules without a DOM.
function extract(names, context) {
  const source = names.map((name) => {
    const start = script.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'missing function ' + name);
    const end = script.indexOf('\n}', start);
    assert.ok(end > start, 'could not delimit function ' + name);
    return script.slice(start, end + 2);
  }).join('\n');

  const sandbox = Object.assign({}, context);
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

test('the profile menu opens My Activity from the dashboard and the admin portal', () => {
  [indexHtml, adminHtml].forEach((page) => {
    const popoverStart = page.indexOf('class="profile-menu__popover"');
    const menuItem = page.indexOf('href="my-activity.html"', popoverStart);
    assert.ok(popoverStart >= 0);
    assert.ok(menuItem > popoverStart, 'My Activity is missing from the profile popover');
    assert.match(page.slice(menuItem, menuItem + 400), /My Activity/);
  });
});

test('the hub carries all three requested sections', () => {
  ['section-actions', 'section-visits', 'section-timeline'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'));
  });
  assert.match(html, /id="myActionsList"/);
  assert.match(html, /id="myVisitsList"/);
  assert.match(html, /id="myTimelineList"/);
  assert.match(html, /<script type="module" src="js\/my-activity\.js">/);
  assert.match(html, /css\/my-activity\.css/);
});

test('the visit list offers search, date, sorting, ops area and bakery filters', () => {
  ['myVisitsSearch', 'myVisitsPeriod', 'myVisitsSort', 'myVisitsOps', 'myVisitsBakery'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' filter is missing');
    assert.match(script, new RegExp("getElementById\\('" + id + "'\\)"), id + ' is never read');
  });
  // A custom from/to range sits behind the period select, so "date" is not
  // limited to the canned periods.
  assert.match(html, /id="myVisitsFrom"/);
  assert.match(html, /id="myVisitsTo"/);
  assert.match(script, /period === 'custom'/);
});

test('the activity feed covers visits, notes, and tasks added, completed, and edited', () => {
  [
    'Logged a ',
    'Added a bakery note',
    'Edited a bakery note',
    'Added a follow-up task',
    'Completed a follow-up task',
    'Edited a follow-up task'
  ].forEach((label) => assert.ok(script.includes(label), 'timeline is missing "' + label + '"'));

  // Newest first.
  assert.match(script, /\.sort\(function \(a, b\) \{ return b\.at - a\.at; \}\)/);
});

test('no visit file is written until the download is confirmed', () => {
  const start = script.indexOf('function requestVisitExport()');
  const handler = script.slice(start, script.indexOf('\n}', start));

  assert.ok(start >= 0);
  assert.match(handler, /openConfirmModal\(\{/);
  assert.match(handler, /onConfirm: function \(\) \{ downloadWorkbook\(data\); \}/);
  assert.doesNotMatch(handler, /triggerDownload\(/);

  // The dashboard owns the codebase's only XLSX.writeFile call
  // (test/excel-export-confirmation.test.js asserts there is exactly one), so
  // this page writes the identical workbook through XLSX.write + a Blob.
  assert.doesNotMatch(script, /XLSX\.writeFile/);
  assert.match(script, /window\.XLSX\.write\(wb, \{ bookType: 'xlsx', type: 'array' \}\)/);
});

test('the confirmation button cannot fire twice', () => {
  assert.match(script, /confirmBtn\.onclick = function \(\) \{\s*if \(confirmBtn\.disabled\) return;\s*confirmBtn\.disabled = true;\s*confirmBtn\.onclick = null;/);
});

test('a check-in records its author separately from whoever last edited it', () => {
  const start = authScript.indexOf('saveSiteVisit: async function');
  const saveVisit = authScript.slice(start, authScript.indexOf('deleteSiteVisit:', start));

  assert.match(saveVisit, /createdBy: auth\.currentUser\.email \|\| auth\.currentUser\.uid/);
  assert.match(saveVisit, /createdByUid: auth\.currentUser\.uid/);
});

test('an admin editing someone else\'s visit does not inherit it', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid', 'visitIsMine'],
    { identity: { uid: 'uid-admin', emails: new Set(['admin@gailsbread.co.uk']), names: new Set(['ada admin']) } }
  );

  // A visit logged by a colleague, later corrected by the signed-in admin:
  // updatedBy now names the admin, but createdBy still names its author.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    meta: {
      createdBy: 'field@gailsbread.co.uk',
      createdByUid: 'uid-field',
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-04T11:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  }), false);

  // A legacy check-in from before createdBy existed, never edited since, is
  // still attributable through updatedBy.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    meta: {
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-01T09:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  }), true);

  // ...but the same legacy record, once edited, is not claimed on that basis.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    meta: {
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-09T09:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  }), false);
});

test('visits are attributed by form respondent and by printed auditor name', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid', 'visitIsMine'],
    { identity: { uid: 'uid-1', emails: new Set(['sam.partner@gailsbread.co.uk']), names: new Set(['sam partner']) } }
  );

  // Google Forms records the respondent's email on routine visits.
  assert.equal(context.visitIsMine({ bakery: 'Balham', email: 'Sam.Partner@gailsbread.co.uk' }), true);
  // CQV/NBO PDFs only ever carry a printed name; punctuation and case vary.
  assert.equal(context.visitIsMine({ bakery: 'Balham', type: 'cqv', auditorName: "Sam O'Partner" }), false);
  assert.equal(context.visitIsMine({ bakery: 'Balham', type: 'cqv', auditorName: 'SAM PARTNER' }), true);
  assert.equal(context.visitIsMine({ bakery: 'Balham', coffeePartner: 'Sam Partner' }), true);
  assert.equal(context.visitIsMine({ bakery: 'Balham', coffeePartner: 'Someone Else' }), false);
});

test('a single-word name is too weak to attribute a visit on', () => {
  const context = extract(['normalizeName', 'normalizeEmail', 'buildIdentity'], {});
  const identity = context.buildIdentity(
    { uid: 'uid-1', email: 'sam@gailsbread.co.uk', displayName: 'Sam' },
    { firstName: 'Sam', lastName: '' }
  );

  assert.equal(identity.names.size, 0);
  assert.ok(identity.emails.has('sam@gailsbread.co.uk'));
});

test('a task completed by this user counts even when a colleague raised it', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName',
      'taskRaisedByMe', 'taskCompletedByMe', 'taskIsMine'],
    { identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set() } }
  );

  const task = { createdBy: 'other@gailsbread.co.uk', completedBy: 'sam@gailsbread.co.uk' };
  assert.equal(context.taskRaisedByMe(task), false);
  assert.equal(context.taskCompletedByMe(task), true);
  assert.equal(context.taskIsMine(task), true);
  assert.equal(context.taskIsMine({ createdBy: 'other@gailsbread.co.uk' }), false);
});

test('the custom date range bounds the visit list inclusively', () => {
  const context = extract(['gailsQuarterStart', 'isDateWithinPeriod'], {});

  assert.equal(context.isDateWithinPeriod('2026-03-10', 'custom', '2026-03-01', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-03-01', 'custom', '2026-03-01', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-03-31', 'custom', '2026-03-01', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-04-01', 'custom', '2026-03-01', '2026-03-31'), false);
  // An open-ended range still filters on the bound that was supplied.
  assert.equal(context.isDateWithinPeriod('2020-01-01', 'custom', '', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-01-01', 'custom', '2025-12-01', ''), true);
  assert.equal(context.isDateWithinPeriod('', 'custom', '', ''), false);
});

test('GAIL\'s reporting quarters start in March, matching the dashboard', () => {
  const context = extract(['gailsQuarterStart'], {});

  assert.equal(context.gailsQuarterStart(new Date(2026, 3, 15)).toISOString().slice(0, 7), '2026-03');
  assert.equal(context.gailsQuarterStart(new Date(2026, 0, 15)).toISOString().slice(0, 7), '2025-12');
});

test('unscored check-ins sort last rather than as a zero', () => {
  const context = extract(
    ['visitScorePct', 'bakeryLabel', 'visitTypeLabel', 'visitSorter'],
    { G: {} }
  );

  const sorted = [
    { type: 'siteVisit', bakery: 'A', date: '2026-01-01' },
    { type: 'cqv', overallPct: 40, bakery: 'B', date: '2026-01-02' },
    { type: 'cqv', overallPct: 90, bakery: 'C', date: '2026-01-03' }
  ].sort(context.visitSorter('scoreDesc'));

  assert.deepEqual(sorted.map((v) => v.bakery), ['C', 'B', 'A']);
});

test('a due date reads the same here as it does on the dashboard', () => {
  const context = extract(['todayMidnight', 'formatIsoDate', 'dueMeta'], {});
  const iso = (offsetDays) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  assert.equal(context.dueMeta(iso(-3)).state, 'overdue');
  assert.equal(context.dueMeta(iso(-1)).label, '1 day overdue');
  assert.equal(context.dueMeta(iso(0)).state, 'today');
  assert.equal(context.dueMeta(iso(4)).state, 'soon');
  assert.equal(context.dueMeta(iso(30)).state, 'future');
  assert.equal(context.dueMeta(null).state, 'none');
});

test('serverTimestamp notes and ISO visit stamps share one ordering', () => {
  const context = extract(['toMillis'], {});

  assert.equal(context.toMillis(1758000000000), 1758000000000);
  assert.equal(context.toMillis('2026-05-01T09:00:00.000Z'), Date.parse('2026-05-01T09:00:00.000Z'));
  assert.equal(context.toMillis(null), 0);
  assert.equal(context.toMillis('not a date'), 0);
});

test('a visit deep link is honoured once and only once', () => {
  const start = visitReportScript.indexOf('window.GAILS.openVisitFromDeepLink');
  const handler = visitReportScript.slice(start, visitReportScript.indexOf('\n  };', start));

  assert.ok(start >= 0);
  assert.match(handler, /if \(!visits\[pendingVisitDeepLinkId\]\) return;/);
  assert.match(handler, /pendingVisitDeepLinkId = '';/);
  assert.match(authScript, /window\.GAILS\.openVisitFromDeepLink\(\);/);
  assert.match(script, /index\.html\?visit=' \+ encodeURIComponent/);
});

test('the hub is registered as an ES module for linting', () => {
  assert.match(eslintConfig, /'js\/my-activity\.js'/);
});

test('the page styles cover both the desktop grid and small screens', () => {
  assert.match(styles, /\.my-activity-visit \{/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.my-activity-modal__dialog/);
});
