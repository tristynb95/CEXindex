// The NBO Coffee Visit report modal. The PDF's summary paragraph and its
// closing action plan are parsed (js/nbo-parser.js) and must reach the report;
// records imported before that parsing existed carry neither, and must not
// render empty cards for them.
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
    NBOShared: {
      pctText() { return '60%'; },
      scorable() { return { yes: 3, total: 5 }; },
      visitLabel(record) { return 'NBO: Coffee Visit ' + (record.visitNumber || 1); }
    },
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

function renderNbo(record) {
  const fixture = loadVisitReport();
  fixture.GAILS._allVisitsObj = {
    v1: Object.assign({
      type: 'nbo',
      visitNumber: 1,
      bakery: 'Kings Cross Station',
      date: '2026-07-30',
      auditorName: 'Tristen Bayley',
      counts: { yes: 3, no: 2, na: 2 },
      questions: [
        { qNum: 3, section: 'Efficiency', label: 'Are the coffee positions in line with Barista Routine phase 2?', response: 'NO', note: 'Deployment can be elevated with assigned roles.' },
        { qNum: 22, section: 'Equipment', label: 'Is all coffee related equipment working?', response: 'YES', note: '' }
      ]
    }, record)
  };
  fixture.GAILS.openVisitReportById('v1');
  return fixture.body.innerHTML;
}

test('shows the summary paragraph and the action plan the PDF carried', () => {
  const html = renderNbo({
    summary: 'Very positive coffee visit at Kings Cross Station today.',
    actionPlan: [{
      sectionPath: 'Visit 1 >> Efficiency',
      questionRef: 'GA100000',
      questionLabel: 'Are the coffee positions in line with Barista Routine phase 2?',
      findings: 'Deployment can be elevated with assigned roles.',
      actionRequired: 'BM & HB to collaboratively work on shift planner.',
      assignee: 'Kings Cross Station',
      priority: 'Medium',
      dueDate: '02 Aug 26'
    }]
  });

  assert.match(html, /<h4>Summary<\/h4>/);
  assert.match(html, /Very positive coffee visit at Kings Cross Station today\./);
  assert.match(html, /<h4>Action Plan \(1\)<\/h4>/);
  assert.match(html, /BM &amp; HB to collaboratively work on shift planner\.|BM & HB to collaboratively work on shift planner\./);
  assert.match(html, /Due 02 Aug 26/);
  assert.match(html, /<h4>Coaching Notes \(1\)<\/h4>/);
});

test('omits both sections for a record imported before they were parsed', () => {
  const html = renderNbo({});

  assert.equal(/<h4>Summary<\/h4>/.test(html), false);
  assert.equal(/<h4>Action Plan/.test(html), false);
  assert.equal(html.includes('No action items were flagged on this visit.'), false);
  // The questions themselves still render.
  assert.match(html, /Is all coffee related equipment working\?/);
});
