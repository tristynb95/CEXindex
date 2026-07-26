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
const mentionsSource = fs.readFileSync(path.join(root, 'js', 'mentions.js'), 'utf8');
const attributionSource = fs.readFileSync(path.join(root, 'js', 'attribution.js'), 'utf8');

// Ownership runs through the shared window.GAILS helpers, so the classic
// scripts that provide them are loaded for real rather than stubbed.
function gails(people) {
  const host = { window: {}, console: { warn() {} } };
  vm.createContext(host);
  vm.runInContext(mentionsSource, host);
  vm.runInContext(attributionSource, host);
  host.window.GAILS.Mentions.setPeople(people || []);
  return host.window.GAILS;
}

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

test('no file is written until the download is confirmed', () => {
  const start = script.indexOf('function requestExport(data)');
  const handler = script.slice(start, script.indexOf('\n}', start));

  assert.ok(start >= 0);
  assert.match(handler, /openConfirmModal\(\{/);
  assert.match(handler, /onConfirm: function \(\) \{ downloadWorkbook\(data\); \}/);
  assert.doesNotMatch(handler, /triggerDownload\(/);
  // Both exportable sections route through the one confirmed path, each passing
  // the rows its own filters produced.
  assert.match(script, /visitsExportBtn\.addEventListener\('click', function \(\) \{ requestExport\(pendingVisitExport\); \}\)/);
  assert.match(script, /actionsExportBtn\.addEventListener\('click', function \(\) \{ requestExport\(pendingActionsExport\); \}\)/);

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
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-admin', name: 'Ada Admin', email: 'admin@gailsbread.co.uk' }]),
      identity: { uid: 'uid-admin', emails: new Set(['admin@gailsbread.co.uk']), names: new Set(['ada admin']) }
    }
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

test('importing a CQV does not put it in the importer\'s hub', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-admin', name: 'Ada Admin', email: 'admin@gailsbread.co.uk' }]),
      identity: { uid: 'uid-admin', emails: new Set(['admin@gailsbread.co.uk']), names: new Set(['ada admin']) }
    }
  );

  // Exactly what saveCqvRecord writes: no createdBy at all, updatedBy stamped
  // with the importer, and createdAt identical to updatedAt because the record
  // was created and stamped in the same breath. That trio used to satisfy the
  // legacy "never edited, so updatedBy is the author" fallback and pulled every
  // report an admin imported into their own hub — which is the whole reason
  // meta.importedBy is recorded separately in the first place.
  const imported = (auditorName) => ({
    bakery: 'Cheapside',
    type: 'cqv',
    auditorName: auditorName,
    meta: {
      source: 'pdf-import',
      createdAt: '2026-07-24T10:00:00.000Z',
      importedBy: 'admin@gailsbread.co.uk',
      createdBy: 'admin@gailsbread.co.uk',
      updatedAt: '2026-07-24T10:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  });

  assert.equal(context.visitIsMine(imported('George Austin')), false);
  // A PDF naming two auditors resolves to neither of them as a directory
  // person, which must not fall back to the importer either.
  assert.equal(context.visitIsMine(imported('George Austin  Lauryn Brown')), false);
  // The importer still gets it when they really are the auditor on the report.
  assert.equal(context.visitIsMine(imported('Ada Admin')), true);
});

test('a check-in is not claimed by whoever was on the bar', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam.partner@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam.partner@gailsbread.co.uk']), names: new Set(['sam partner']) }
    }
  );

  // On a check-in, Coffee Partner is free text about who was working the bar,
  // so being named there is not a claim to have done the visit. js/attribution
  // .js excludes it for exactly this reason.
  assert.equal(context.visitIsMine({
    bakery: 'Balham', type: 'siteVisit', coffeePartner: 'Sam Partner'
  }), false);

  // The person who logged that check-in still owns it.
  assert.equal(context.visitIsMine({
    bakery: 'Balham', type: 'siteVisit', coffeePartner: 'Someone Else',
    meta: { createdByUid: 'uid-1', createdBy: 'sam.partner@gailsbread.co.uk' }
  }), true);

  // On a routine visit, Coffee Partner *is* a record of who did it.
  assert.equal(context.visitIsMine({ bakery: 'Balham', coffeePartner: 'Sam Partner' }), true);
});

test('visits are attributed by form respondent and by printed auditor name', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam.partner@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam.partner@gailsbread.co.uk']), names: new Set(['sam partner']) }
    }
  );

  // Google Forms records the respondent's email on routine visits.
  assert.equal(context.visitIsMine({ bakery: 'Balham', email: 'Sam.Partner@gailsbread.co.uk' }), true);
  // CQV/NBO PDFs only ever carry a printed name; punctuation and case vary.
  assert.equal(context.visitIsMine({ bakery: 'Balham', type: 'cqv', auditorName: "Sam O'Partner" }), false);
  assert.equal(context.visitIsMine({ bakery: 'Balham', type: 'cqv', auditorName: 'SAM PARTNER' }), true);
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    type: 'nbo',
    auditorName: 'Someone Else',
    coffeePartner: 'Sam Partner'
  }), false);
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
      'taskAttribution', 'attributedToMe', 'taskRaisedByMe', 'taskCompletedByMe', 'taskIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set() }
    }
  );

  const task = { createdBy: 'other@gailsbread.co.uk', completedByUid: 'uid-1' };
  assert.equal(context.taskRaisedByMe(task), false);
  assert.equal(context.taskCompletedByMe(task), true);
  assert.equal(context.taskIsMine(task), true);
  assert.equal(context.taskIsMine({ createdBy: 'other@gailsbread.co.uk' }), false);
});

test('a legacy task linked to my visit is restored to My Activity', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName',
      'taskAttribution', 'attributedToMe', 'taskIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set(['sam partner']) },
      visitsObj: {
        source: { type: 'cqv', auditorName: 'Sam Partner' }
      }
    }
  );

  assert.equal(context.taskIsMine({
    sourceVisitId: 'source',
    createdBy: 'other@gailsbread.co.uk'
  }), true);
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
  // Built from the local calendar date, not toISOString(): dueMeta compares
  // against local midnight, and west of UTC — or anywhere on summer time —
  // toISOString() on a local midnight lands on the previous day and shifts
  // every expectation here by one.
  const iso = (offsetDays) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
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

test('open actions can be filtered by bakery, ops area, and searched', () => {
  ['myActionsSearch', 'myActionsOps', 'myActionsBakery', 'myActionsSort'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' control is missing');
    assert.match(script, new RegExp("getElementById\\('" + id + "'\\)"), id + ' is never read');
  });
  // The Site list is built from the user's own actions, not the whole estate.
  assert.match(script, /function syncActionFilterOptions\(\)/);
  assert.match(script, /myTasks\(\)\.forEach\(function \(task\) \{\s*if \(!task\.bakery\) return;\s*opsSet\.add\(bakeryOps\(task\.bakery\)\);\s*bakerySet\.add\(task\.bakery\);/);
  assert.match(script, /if \(filters\.bakery && task\.bakery !== filters\.bakery\) return false;/);
  assert.match(script, /if \(filters\.ops && bakeryOps\(task\.bakery\) !== filters\.ops\) return false;/);
});

test('open actions offer the same orderings as the dashboard follow-up list', () => {
  ['dueAsc', 'dueDesc', 'priority', 'createdDesc', 'createdAsc', 'bakeryAsc'].forEach((value) => {
    assert.match(html, new RegExp('value="' + value + '"'), value + ' sort option is missing');
  });

  const context = extract(
    ['taskIsDone', 'todayMidnight', 'formatIsoDate', 'dueMeta', 'normalizePriority',
      'taskSortByDue', 'toMillis', 'bakeryLabel', 'bakerySiteName', 'actionSorter'],
    { G: {}, PRIORITY_ORDER: { high: 0, medium: 1, low: 2, none: 3 } }
  );

  const tasks = [
    { title: 'Later', dueDate: '2026-09-01', priority: 'high', bakery: 'Zeta' },
    { title: 'Sooner', dueDate: '2026-08-01', priority: 'low', bakery: 'Alpha' },
    { title: 'Finished', status: 'done', completedAt: '2026-07-01T00:00:00.000Z', bakery: 'Beta' }
  ];

  assert.deepEqual(tasks.slice().sort(context.actionSorter('dueAsc')).map((t) => t.title),
    ['Sooner', 'Later', 'Finished']);
  assert.deepEqual(tasks.slice().sort(context.actionSorter('dueDesc')).map((t) => t.title),
    ['Later', 'Sooner', 'Finished']);
  assert.deepEqual(tasks.slice().sort(context.actionSorter('priority')).map((t) => t.title),
    ['Later', 'Sooner', 'Finished']);
  assert.deepEqual(tasks.slice().sort(context.actionSorter('bakeryAsc')).map((t) => t.title),
    ['Sooner', 'Later', 'Finished']);
  // Completed work sinks below open work whichever ordering is chosen.
  ['dueAsc', 'dueDesc', 'priority', 'bakeryAsc', 'createdAsc'].forEach((sort) => {
    assert.equal(tasks.slice().sort(context.actionSorter(sort)).at(-1).title, 'Finished', sort);
  });
});

test('open actions export the filtered list, not the whole hub', () => {
  assert.match(html, /id="myActionsExportBtn"/);
  assert.match(script, /pendingActionsExport = buildActionsExportData\(shown, filters\)/);
  // Nothing to export means nothing to click.
  assert.match(script, /if \(actionsExportBtn\) actionsExportBtn\.disabled = !shown\.length;/);
  assert.match(script, /pendingActionsExport = null;/);

  const start = script.indexOf('function buildActionsExportData(');
  const builder = script.slice(start, script.indexOf('\n}', start));
  ['Bakery', 'Region', 'Ops Area', 'Action', 'Detail', 'Priority', 'Due Date',
    'Days Overdue', 'Status', 'Added', 'Completed', 'Assigned To'].forEach((label) => {
    assert.ok(builder.includes("label: '" + label + "'"), 'export is missing the ' + label + ' column');
  });
  assert.match(builder, /sheetName: 'My Actions'/);
});

test('the bakery names drop the GAIL\'s prefix everywhere on the page', () => {
  const context = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: (name) => "GAIL's " + name }
  });

  assert.equal(context.bakerySiteName('Balham'), 'Balham');
  assert.equal(context.bakerySiteName('Battersea Square'), 'Battersea Square');

  // Whatever shape the stored display name takes.
  const curly = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: () => 'GAIL’s Kings Cross' }
  });
  assert.equal(curly.bakerySiteName('x'), 'Kings Cross');
  const plainPrefix = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: () => 'Gails Wandsworth' }
  });
  assert.equal(plainPrefix.bakerySiteName('x'), 'Wandsworth');
  // A name that merely contains the word is left alone.
  const unrelated = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: () => 'Nightingale Gails Corner' }
  });
  assert.equal(unrelated.bakerySiteName('x'), 'Nightingale Gails Corner');

  // Every card, filter option, ordering, and export column on the page uses the
  // short name — one section keeping the prefix would read as a bug.
  assert.match(script, /escapeHtml\(bakerySiteName\(visit\.bakery\)\) \+ '<\/a>'/);
  assert.match(script, /escapeHtml\(bakerySiteName\(task\.bakery\)\) \+ '<\/a>'/);
  assert.match(script, /escapeHtml\(bakerySiteName\(event\.bakery\)\)/);
  assert.match(script, /\}\), 'All Bakeries', bakerySiteName\);/);
  assert.match(script, /sortVal === 'nameAsc'\) return bakerySiteName/);
  // Both exports name the column after the filter beside it.
  assert.match(script, /\{ label: 'Bakery', type: 'text', width: 26 \}/);
  assert.match(script, /\{ label: 'Bakery', type: 'text', width: 24 \}/);
  // "Site" was never the word this estate uses for a bakery.
  assert.doesNotMatch(script, /'All Sites'|label: 'Site'/);
  assert.doesNotMatch(html, />All Sites</);
  // Only the search haystacks keep the full label, so a bakery is still found
  // whether or not someone types the prefix.
  assert.match(script, /bakeryLabel\(v\.bakery\), bakerySiteName\(v\.bakery\)/);
  assert.match(script, /bakerySiteName\(task\.bakery\), bakeryLabel\(task\.bakery\)/);
});

test('a visit report opens in a modal on the hub itself', () => {
  // The dashboard's own modal markup, so js/visit-report.js renders into it
  // unchanged rather than the report being reimplemented here.
  ['visitReportModal', 'visitReportTitle', 'visitReportSubtitle', 'visitReportBody'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'));
  });
  assert.match(html, /src="js\/visit-report\.js"/);

  // js/visit-report.js reads GAILS.CQVShared at load time, and CQVShared calls
  // CQVCriticals — so this order is load-bearing, not cosmetic.
  // Matched on the src attribute, not the bare filename — the comment above
  // these tags names js/visit-report.js too.
  const order = ['js/cqv-criticals.js', 'js/cqv-shared.js', 'js/visit-report.js']
    .map((src) => html.indexOf('src="' + src + '"'));
  assert.ok(order.every((at) => at > 0), 'a report dependency is missing');
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'report dependencies load out of order');

  assert.match(script, /G\.openVisitReportById\(visitId\)/);
});

test('the report link degrades to the dashboard when the renderer is absent', () => {
  // It stays a real anchor with a working href: the modal is an enhancement,
  // and openReportModal reports whether it handled the click.
  assert.match(script, /href="index\.html\?visit=' \+ encodeURIComponent\(visit\.id\)/);
  const start = script.indexOf('function openReportModal(');
  const fn = script.slice(start, script.indexOf('\n}', start));
  assert.match(fn, /if \(typeof G\.openVisitReportById !== 'function'\) return false;/);
  assert.match(script, /if \(openReportModal\([\s\S]*?\)\) event\.preventDefault\(\)/);

  // Ctrl/cmd/middle-click still open the dashboard report in a new tab.
  assert.match(script, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(script, /event\.button !== 0/);
});

test('the hub does not collide with the dashboard\'s own report trigger', () => {
  // js/visit-report.js binds a document click handler to [data-visit-report]
  // and reads it as a *bakery name*. Reusing that attribute for a visit id
  // would fire both handlers on every click.
  assert.match(visitReportScript, /closest\('\[data-visit-report\]'\)/);
  assert.match(script, /data-open-visit-report=/);
  assert.doesNotMatch(script, /data-visit-report=/);
});

test('the report\'s history arrows stay inside the user\'s own visits', () => {
  const start = script.indexOf('function syncReportSource(');
  const fn = script.slice(start, script.indexOf('\n}', start));

  // Seeded from myVisits(), not the whole estate: those arrows walk
  // _allVisitsObj for other visits to the same bakery and apply no ops-area
  // scoping, so the full set would page a scoped user into bakeries their
  // Bakery Reports tab hides from them.
  assert.match(fn, /myVisits\(\)\.forEach/);
  assert.match(fn, /G\._allVisitsObj = mine/);
  assert.doesNotMatch(fn, /G\._allVisitsObj = visitsObj/);

  // And the renderer gets the permissions it would have had on the dashboard.
  assert.match(script, /G\.permissions = permissions;/);
});

test('a bakery opened from the hub comes back to the hub', () => {
  const start = script.indexOf('function bakeryProfileHref(');
  const builder = script.slice(start, script.indexOf('\n}', start));

  assert.match(builder, /'my-activity\.html#' \+ \(section \|\| 'section-actions'\)/);
  assert.match(builder, /fromLabel=' \+ encodeURIComponent\('My Activity'\)/);
  // Each section sends people back to where they were.
  assert.match(script, /bakeryProfileHref\(task\.bakery, 'section-actions'\)/);
  assert.match(script, /bakeryProfileHref\(visit\.bakery, 'section-visits'\)/);
  assert.match(script, /bakeryProfileHref\(task\.bakery, 'section-timeline'\)/);
});

test('My Activity is opt-in per user and off by default', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const profilePage = fs.readFileSync(path.join(root, 'js', 'profile-page.js'), 'utf8');
  const profileHtml = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

  // Absent means off, everywhere it is read.
  assert.match(adminScript, /myActivity: users\[uid\]\.myActivity === true/);
  [authScript, adminScript, profilePage, script].forEach((source) => {
    assert.match(source, /myActivity === true/);
  });

  // Every entry point starts hidden in the markup, so it can never flash before
  // the profile has loaded.
  [indexHtml, adminHtml].forEach((page) => {
    assert.match(page, /data-my-activity-link hidden/);
  });
  const standaloneMenu = fs.readFileSync(path.join(root, 'js', 'standalone-profile-menu.js'), 'utf8');
  assert.match(profileHtml, /data-standalone-account-menu/);
  assert.match(standaloneMenu, /data-standalone-activity-link hidden/);
  assert.match(profilePage, /showActivity: profileRecord\.myActivity === true/);

  // The page refuses a typed URL, which the hidden menu entry alone cannot do.
  assert.match(script, /showGuardError\('My Activity is not switched on for your account/);

  // ...and a non-admin cannot grant it to themselves by writing their own record.
  const selfWrite = rules.rules.users.$uid['.write'];
  assert.match(selfWrite, /auth\.uid === \$uid[\s\S]*?newData\.child\('myActivity'\)\.val\(\) === data\.child\('myActivity'\)\.val\(\)/);
});

test('the access modal can switch My Activity on and off', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');

  // The switch lives in the person's access modal, alongside every other
  // decision about them.
  assert.match(adminHtml, /id="userAccessMyActivity"/);
  assert.match(adminScript, /userAccessMyActivity\.checked = state\.accessDraft\.myActivity/);

  // Saving the modal writes it with the rest of that person's access, so the
  // four fields can never end up half-applied.
  const saveStart = adminScript.indexOf('async function saveAccessModal()');
  const save = adminScript.slice(saveStart, adminScript.indexOf('\n}', saveStart));
  assert.match(save, /myActivity: draft\.myActivity === true/);
  assert.match(save, /role: draft\.role/);
  assert.match(save, /managerUid: draft\.managerUid/);

  // Role and reporting line lock on your own account so an admin cannot demote
  // or orphan themselves — but the feature switch stays live, written on its
  // own, because with a lone admin nobody else could ever turn it on.
  assert.match(adminScript, /userAccessMyActivity\.disabled = !canEdit\('users'\)/);
  assert.match(adminScript, /uid !== currentUserId\(\)[\s\S]{0,200}update\(ref\(db, 'users\/' \+ uid\), \{ myActivity: next \}\)/);

  // A view-only role can read the state without changing it.
  assert.match(adminScript, /userAccessRole\.disabled = !editable/);
});

test('the access modal reads a person back, including a missing flag', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const start = adminScript.indexOf('function accessDraftFor(');
  const source = adminScript.slice(start, adminScript.indexOf('\n}', start) + 2);

  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source + '\nthis.accessDraftFor = accessDraftFor;', sandbox);

  const on = sandbox.accessDraftFor({
    firstName: 'Alex',
    lastName: 'Partner',
    role: 'admin',
    myActivity: true,
    opsArea: 'North',
    managerUid: 'm1'
  });
  assert.deepEqual({ ...on }, {
    firstName: 'Alex',
    lastName: 'Partner',
    role: 'admin',
    managerUid: 'm1',
    opsArea: 'North',
    myActivity: true
  });

  // Absent means off, and an unset role means Viewer — a record that predates
  // any of these fields is readable, not broken.
  const bare = sandbox.accessDraftFor({});
  assert.deepEqual({ ...bare }, {
    firstName: '',
    lastName: '',
    role: 'viewer',
    managerUid: '',
    opsArea: '',
    myActivity: false
  });
});
