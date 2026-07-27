const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

function classListStub() {
  return {
    add() {},
    remove() {},
    contains() { return false; },
    toggle() {}
  };
}

function loadVisitReport() {
  const actions = { innerHTML: '' };
  const modal = {
    style: { display: 'none' },
    querySelector(selector) {
      return selector === '.visit-report-header-actions' ? actions : null;
    }
  };
  const title = { textContent: '' };
  const subtitle = { textContent: '' };
  const body = { innerHTML: '', scrollTop: 0, style: {} };
  const elements = {
    visitReportModal: modal,
    visitReportTitle: title,
    visitReportSubtitle: subtitle,
    visitReportBody: body
  };
  const scrollCalls = [];
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
    NBOShared: {
      pctText() { return ''; },
      scorable() { return []; },
      visitLabel() { return ''; }
    },
    escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    resolveBakeryMetaKey(name) {
      return String(name || '').replace(/^GAIL'S\s+/i, '').trim().toLowerCase();
    },
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
    scrollY: 321,
    pageXOffset: 0,
    pageYOffset: 321,
    scrollTo(x, y) { scrollCalls.push([x, y]); },
    print() {}
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, GAILS, actions, modal, subtitle, scrollCalls };
}

function navButtonIsDisabled(html, direction) {
  const button = html.match(new RegExp('<button[^>]*openAdjacentVisit\\(\\\'' + direction + '\\\'\\)[^>]*>'));
  assert.ok(button, direction + ' navigation button should be rendered');
  return /\sdisabled(?:\s|>)/.test(button[0]);
}

test('moves through one bakery history while numbering the newest report first', () => {
  const fixture = loadVisitReport();
  fixture.GAILS._allVisitsObj = {
    newest: { type: 'siteVisit', bakery: "GAIL'S The Cut", date: '2026-07-10', time: '10:02' },
    unrelated: { type: 'siteVisit', bakery: 'Highgate', date: '2026-06-01', time: '12:00' },
    oldest: { type: 'siteVisit', bakery: 'The Cut', date: '2026-01-12', time: '09:00' },
    middle: { type: 'siteVisit', bakery: 'The Cut', date: '2026-04-18', time: '14:30' }
  };

  fixture.GAILS.openVisitReportById('middle');
  assert.equal(fixture.GAILS._activeVisitReportId, 'middle');
  assert.match(fixture.actions.innerHTML, />2 of 3</);
  assert.equal(navButtonIsDisabled(fixture.actions.innerHTML, 'previous'), false);
  assert.equal(navButtonIsDisabled(fixture.actions.innerHTML, 'next'), false);

  fixture.context.scrollY = 0;
  fixture.context.pageYOffset = 0;
  fixture.GAILS.openAdjacentVisit('previous');
  assert.equal(fixture.GAILS._activeVisitReportId, 'oldest');
  assert.match(fixture.actions.innerHTML, />3 of 3</);
  assert.equal(navButtonIsDisabled(fixture.actions.innerHTML, 'previous'), true);
  assert.equal(navButtonIsDisabled(fixture.actions.innerHTML, 'next'), false);

  fixture.GAILS.openAdjacentVisit('next');
  fixture.GAILS.openAdjacentVisit('next');
  assert.equal(fixture.GAILS._activeVisitReportId, 'newest');
  assert.match(fixture.actions.innerHTML, />1 of 3</);
  assert.equal(navButtonIsDisabled(fixture.actions.innerHTML, 'previous'), false);
  assert.equal(navButtonIsDisabled(fixture.actions.innerHTML, 'next'), true);

  fixture.GAILS.closeVisitReport();
  assert.deepEqual(fixture.scrollCalls.at(-1), [0, 321]);
});
