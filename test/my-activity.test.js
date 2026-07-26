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
      'visitAttribution', 'attributedToMe', 'visitIsMine'],
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

test('visits are attributed by form respondent and by printed auditor name', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'visitAttribution', 'attributedToMe', 'visitIsMine'],
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
    'Days Overdue', 'Status', 'Added', 'Completed', 'Attributed To'].forEach((label) => {
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
  [indexHtml, adminHtml, profileHtml].forEach((page) => {
    assert.match(page, /data-my-activity-link hidden/);
  });

  // The page refuses a typed URL, which the hidden menu entry alone cannot do.
  assert.match(script, /showGuardError\('My Activity is not switched on for your account/);

  // ...and a non-admin cannot grant it to themselves by writing their own record.
  const selfWrite = rules.rules.users.$uid['.write'];
  assert.match(selfWrite, /auth\.uid === \$uid[\s\S]*?newData\.child\('myActivity'\)\.val\(\) === data\.child\('myActivity'\)\.val\(\)/);
});

test('the admin users table can switch My Activity on and off', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');

  assert.match(adminScript, /data-action="toggle-my-activity"/);
  // Writes the one field, so it never disturbs role or reports scope.
  assert.match(adminScript, /update\(ref\(db, 'users\/' \+ uid\), \{ myActivity: next \}\)/);
  // Available on every row including the signed-in admin's, which the role
  // editor deliberately locks — otherwise a lone admin could never enable it.
  const start = adminScript.indexOf('var myActivityHtml =');
  const markup = adminScript.slice(start, adminScript.indexOf('\n\n', start));
  assert.doesNotMatch(markup, /\bdis\b/);
  assert.match(markup, /canManageUsers \? '' : ' disabled'/);
  // View-only admins cannot flip it.
  assert.match(adminScript, /if \(!canEdit\('users'\)\) \{\s*toggle\.checked = user\.myActivity;/);
});

test('the My Activity switch renders checked, unchecked, and read-only', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const start = adminScript.indexOf('var myActivityHtml =');
  const end = adminScript.indexOf(";\n", adminScript.indexOf("'</label>'", start));
  const sandbox = {
    escapeHtml: (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c])),
    user: null,
    canManageUsers: true,
    myActivityHtml: ''
  };
  vm.createContext(sandbox);
  const render = (user, canManageUsers) => {
    sandbox.user = user;
    sandbox.canManageUsers = canManageUsers;
    vm.runInContext(adminScript.slice(start, end + 1), sandbox);
    return sandbox.myActivityHtml;
  };

  const on = render({ uid: 'u1', myActivity: true }, true);
  assert.match(on, /class="admin-user-toggle is-on"/);
  assert.match(on, / checked/);
  assert.doesNotMatch(on, / disabled/);

  const off = render({ uid: 'u2', myActivity: false }, true);
  assert.match(off, /class="admin-user-toggle"/);
  assert.doesNotMatch(off, / checked/);

  // A user record with no flag at all is off, not broken.
  assert.doesNotMatch(render({ uid: 'u3' }, true), / checked/);

  // Users & Roles at 'view' renders the state without letting anyone change it.
  assert.match(render({ uid: 'u4', myActivity: true }, false), / disabled/);
});
