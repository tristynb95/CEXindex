// Check-ins and NBO openings share the exact same facts-rail workspace.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

function classListStub() {
  return { add() {}, remove() {}, contains() { return false; }, toggle() {} };
}

function loadVisitReport() {
  const actions = { innerHTML: '' };
  const modal = {
    style: { display: 'none' },
    querySelector(selector) { return selector === '.visit-report-header-actions' ? actions : null; }
  };
  const body = { innerHTML: '', scrollTop: 0, style: {} };
  const elements = {
    visitReportModal: modal,
    visitReportTitle: { textContent: '' },
    visitReportSubtitle: { textContent: '' },
    visitReportBody: body
  };
  const document = {
    documentElement: { classList: classListStub(), style: { setProperty() {} } },
    body: { classList: classListStub(), style: {} },
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
  return { GAILS, body };
}

function renderSiteVisit(record) {
  const fixture = loadVisitReport();
  fixture.GAILS._allVisitsObj = {
    v1: Object.assign({
      type: 'siteVisit',
      bakery: 'The Cut',
      date: '2026-07-10',
      time: '10:02',
      mod: 'Sam',
      meta: { createdBy: 'Tristen Bayley' }
    }, record)
  };
  fixture.GAILS.openVisitReportById('v1');
  return fixture.body.innerHTML;
}

function cardCount(html) {
  return (html.match(/drill-card__label/g) || []).length;
}

test('a check-in report drops the Logged By card and keeps the rest', () => {
  const html = renderSiteVisit({ visitKind: 'checkin' });

  assert.equal(html.includes('Logged By'), false);
  assert.equal(cardCount(html), 0);
  assert.doesNotMatch(html, /visit-report-comment-byline/);
  assert.match(html, /visit-report-notes/);
  assert.match(html, /Visited by/);
  assert.match(html, /Barista/);
  assert.match(html, /Visit notes/);
  assert.match(html, /visit-report-checkin-rail/);
  assert.match(html, /Monthly snapshot/);
  assert.match(html, /visit-report-checkin-support/);
  assert.match(html, /visit-context-weather-card/);
});

test('a visit with no recorded kind is a check-in and drops the card too', () => {
  // siteVisitKindLabel() already labels these "Check-in".
  const html = renderSiteVisit({});

  assert.equal(html.includes('Logged By'), false);
  assert.match(html, /Visited by/);
});

test('an NBO opening mirrors the check-in workspace with no Logged by row', () => {
  const html = renderSiteVisit({ visitKind: 'nboOpening' });

  assert.equal(html.includes('Logged by'), false);
  assert.equal(cardCount(html), 0);
  assert.match(html, /visit-report-checkin-workspace/);
  assert.match(html, /visit-report-checkin-rail/);
  assert.match(html, /visit-report-notes/);
  assert.match(html, /Visited by/);
  assert.match(html, /Barista/);
  assert.match(html, /Monthly snapshot/);
  assert.match(html, /visit-report-checkin-support/);
  assert.match(html, /visit-context-weather-card/);
});
