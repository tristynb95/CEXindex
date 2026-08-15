// The visit report is printed from four different pages (index, my-activity,
// my-team, bakery-profile). The print stylesheet used to hide the dashboard's
// shell by id, so every other host page printed itself alongside the report.
// These tests pin the replacement: a body class the open/close paths set, and
// structural hiding that does not name any one page's shell.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

const HOST_PAGES = ['index.html', 'my-activity.html', 'my-team.html', 'bakery-profile.html'];

function trackingClassList(log, owner) {
  const set = new Set();
  return {
    add(name) { set.add(name); log.push(owner + ':add:' + name); },
    remove(name) { set.delete(name); log.push(owner + ':remove:' + name); },
    contains(name) { return set.has(name); },
    toggle() {}
  };
}

function loadVisitReport() {
  const classLog = [];
  const actions = { innerHTML: '' };
  const modal = {
    style: { display: 'none' },
    querySelector(selector) {
      return selector === '.visit-report-header-actions' ? actions : null;
    }
  };
  const elements = {
    visitReportModal: modal,
    visitReportTitle: { textContent: '' },
    visitReportSubtitle: { textContent: '' },
    visitReportBody: { innerHTML: '', scrollTop: 0, style: {} }
  };
  const bodyClassList = trackingClassList(classLog, 'body');
  const document = {
    documentElement: { classList: trackingClassList(classLog, 'html'), style: { setProperty() {} } },
    body: { classList: bodyClassList, style: {} },
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  const GAILS = {
    CQVShared: {
      hasCriticalFail() { return false; },
      band() { return ''; },
      bandColor() { return ''; },
      priorityColor() { return ''; },
      criticalTag() { return ''; },
      lostPointItems() { return []; }
    },
    NBOShared: { pctText() { return ''; }, scorable() { return []; }, visitLabel() { return ''; } },
    escapeHtml(value) { return String(value == null ? '' : value); },
    resolveBakeryMetaKey(name) { return String(name || '').trim().toLowerCase(); },
    getBakeryMapLabel(name) { return name; }
  };
  const context = {
    console,
    document,
    GAILS,
    requestAnimationFrame(callback) { callback(); },
    setTimeout,
    clearTimeout,
    scrollX: 0,
    scrollY: 0,
    pageXOffset: 0,
    pageYOffset: 0,
    scrollTo() {},
    print() {},
    GAILS_VISIT_SCHEMA: { sections: [] }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { GAILS, modal, bodyClassList };
}

const REPORT_KINDS = {
  routine: { bakery: 'The Cut', date: '2026-07-10', time: '10:02', sections: {} },
  siteVisit: { type: 'siteVisit', bakery: 'The Cut', date: '2026-07-10', time: '10:02' },
  cqv: { type: 'cqv', bakery: 'The Cut', date: '2026-07-10', scores: {} },
  nbo: { type: 'nbo', bakery: 'The Cut', date: '2026-07-10', questions: [] }
};

for (const [kind, record] of Object.entries(REPORT_KINDS)) {
  test('opening a ' + kind + ' report scopes printing to the report', () => {
    const fixture = loadVisitReport();
    fixture.GAILS._allVisitsObj = { v1: record };

    fixture.GAILS.openVisitReportById('v1');
    assert.equal(fixture.modal.style.display, 'flex');
    assert.ok(
      fixture.bodyClassList.contains('visit-report-open'),
      'the print scope class must be set while the report is open'
    );

    fixture.GAILS.closeVisitReport();
    assert.equal(fixture.modal.style.display, 'none');
    assert.equal(
      fixture.bodyClassList.contains('visit-report-open'),
      false,
      'closing the report must release the print scope'
    );
  });
}

test('a missing visit record still scopes printing to the report', () => {
  const fixture = loadVisitReport();
  fixture.GAILS._allVisitsObj = {};

  fixture.GAILS.openVisitReportById('gone');
  assert.equal(fixture.modal.style.display, 'flex');
  assert.ok(fixture.bodyClassList.contains('visit-report-open'));

  fixture.GAILS.closeVisitReport();
  assert.equal(fixture.bodyClassList.contains('visit-report-open'), false);
});

test('opening by bakery name with no logged visit scopes printing to the report', () => {
  const fixture = loadVisitReport();
  fixture.GAILS._allVisitsObj = {};

  fixture.GAILS.openVisitReport('The Cut');
  assert.equal(fixture.modal.style.display, 'flex');
  assert.ok(fixture.bodyClassList.contains('visit-report-open'));
});

test('every path that shows the report goes through the print-scope helper', () => {
  // Guards against a new open path setting display directly and printing the
  // whole host page again.
  const byName = source.indexOf('window.GAILS.openVisitReport = function');
  const byId = source.indexOf('window.GAILS.openVisitReportById = function');
  const openers = [
    source.slice(byName, source.indexOf('window.GAILS.closeVisitReport =', byName)),
    source.slice(byId, source.indexOf('// Deep link support', byId))
  ];
  for (const fn of openers) {
    assert.ok(fn.length > 0);
    assert.equal(
      /modal\.style\.display = 'flex'/.test(fn),
      false,
      'the report modal must be shown via showVisitReportModal()'
    );
  }
});

test('the print stylesheet hides host pages structurally, not by dashboard id', () => {
  const start = styles.indexOf('@media print {');
  const printBlock = styles.slice(start, styles.indexOf('\n}', start));

  assert.match(printBlock, /body\.visit-report-open > \*/);
  assert.match(printBlock, /body\.visit-report-open > \.container > \*/);
  // The report's own ancestor chain is put back on both layouts: a body child
  // on the standalone pages, a .container child on the dashboard.
  assert.match(printBlock, /body\.visit-report-open > #visitReportModal/);
  assert.match(printBlock, /body\.visit-report-open > \.container > #visitReportModal/);

  for (const shellId of ['#dashboardContent', '#uploadZone', '#loginScreen', '#unmappedSitesModal']) {
    assert.equal(
      printBlock.includes(shellId),
      false,
      'printing must not depend on the dashboard-only id ' + shellId
    );
  }
});

test('the check-in / NBO opening workspace has its own print layout, not the bare markup fallback', () => {
  // The on-screen 3-column workspace (details rail, notes, map+weather) is
  // scoped to @media screen, so without a dedicated print block the report
  // prints as unstyled <dt>/<dd> pairs with no cards, dividers or label/value
  // alignment. Pin the print rules that rebuild it into a readable page.
  const printBlocks = Array.from(styles.matchAll(/@media print \{/g)).map((match) => match.index);
  const checkinPrintBlock = printBlocks
    .map((start) => styles.slice(start, styles.indexOf('\n}\n', start)))
    .find((block) => block.includes('.visit-report-checkin-details-list'));

  assert.ok(checkinPrintBlock, 'a print block covering the check-in details list should exist');
  assert.match(checkinPrintBlock, /\.visit-report-checkin-context\s*\{[^}]*display:\s*none\s*!important/);
  assert.match(checkinPrintBlock, /\.visit-report-checkin-details,\s*\n\s*#visitReportModal \.visit-context-monthly\s*\{[^}]*border:\s*1px solid #ccc/);
  assert.match(checkinPrintBlock, /\.visit-report-checkin-details-list > div,\s*\n\s*#visitReportModal \.visit-context-monthly-stat\s*\{[^}]*display:\s*flex\s*!important/);
  assert.match(checkinPrintBlock, /\.visit-report-section--comments\s*\{[^}]*display:\s*block\s*!important/);
  // The redesigned rail reads upright (see the "Upright, not italic" comment
  // on .visit-report-comment) — an older, unconditional rule sets the primary
  // comment to italic, so print must explicitly cancel it back out.
  assert.match(checkinPrintBlock, /\.visit-report-comment--primary\s*\{[^}]*font-style:\s*normal/);
});

test('every page hosting the report keeps it out of the printable page shell', () => {
  for (const page of HOST_PAGES) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const modalIndex = html.indexOf('id="visitReportModal"');
    assert.ok(modalIndex > -1, page + ' should host the visit report modal');
    assert.ok(
      html.includes('class="drill-close-btn visit-report-print-btn" onclick="window.print()"'),
      page + ' should offer the print button'
    );

    // The modal must sit at one of the two levels the print stylesheet
    // unhides: a body child, or a .container child on the dashboard.
    const indent = html.slice(html.lastIndexOf('\n', modalIndex) + 1).match(/^\s*/)[0].length;
    if (page === 'index.html') {
      const container = html.indexOf('<div class="container"');
      assert.ok(container > -1 && container < modalIndex, 'the dashboard report should live in .container');
      assert.ok(modalIndex < html.indexOf('<!-- end container -->'), 'the dashboard report should live in .container');
      assert.equal(indent, 4, 'the dashboard report should be a direct .container child');
    } else {
      assert.equal(indent, 2, page + ' should keep the report as a direct body child');
    }
  }
});
