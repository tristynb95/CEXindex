const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

function setup() {
  const elements = Object.fromEntries(['overviewAttention', 'overviewAttentionRows', 'overviewAttentionReference'].map(id => [id, { innerHTML: '', textContent: '', hidden: false }]));
  const months = ['Jun 26', 'Jul 26', 'Aug 26'];
  const records = ['Alpha <Bakery>', 'Bravo', 'Charlie', 'Delta', 'Excluded'].flatMap((b, i) => months.map(m => ({ b, m, ac: 30 + i * 5, acb: 'Below Standard', noData: false })));
  const GAILS = {
    MONTH_SHORT: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    state: { ALL: records, selectedMonths: ['Jan 26'], regionFilter: ['North'], opsFilter: [], searchBakery: [], bandFilter: '' },
    BENCHMARKS: {},
    getBakeryRegion: name => name === 'Excluded' ? 'South' : 'North',
    getBakeryOps: name => name === 'Bravo' ? 'Area B' : 'Area A',
    getLastVisitDate: () => null,
    monthSortKey(label) { const [m, y] = label.split(' '); return (2000 + Number(y)) * 12 + this.MONTH_SHORT.indexOf(m); },
    escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'),
  };
  const context = { GAILS, document: { getElementById: id => elements[id] || null, addEventListener() {} }, console, setTimeout, clearTimeout };
  context.window = context;
  vm.createContext(context);
  for (const name of ['focus-data.js', 'support-score.js', 'targets.js']) vm.runInContext(fs.readFileSync(path.join(root, 'js', name), 'utf8'), context);
  const build = GAILS.buildFocusDataset;
  GAILS.buildFocusDataset = options => build({ ...options, referenceDate: new Date('2026-09-05T12:00:00Z') });
  return { G: GAILS, context, elements };
}

test('Overview shows the same first three ranked bakeries as Focus without rendering the deferred hub', () => {
  const { G, context, elements } = setup();
  const staleContext = { latestClosedMonth: 'Jan 20' };
  G._focusDataContext = staleContext;
  G.renderOverviewAttention();
  assert.equal(G._focusDataContext, staleContext);
  const dataset = G.buildFocusDataset({ isAbsolute: true });
  G._focusDataContext = dataset;
  context._renderFocusHub(dataset.data, dataset.data, 'acb', 'ac', 'Below Standard', 'Approaching', true);
  const expected = Array.from(context._hubState.rows.slice(0, 3), row => G.escapeHtml(row.name));
  const actual = Array.from(elements.overviewAttentionRows.innerHTML.matchAll(/data-overview-focus-detail="([^"]+)"/g), match => match[1]);
  assert.deepEqual(actual, expected);
  assert.equal(actual.length, 3);
  assert.doesNotMatch(elements.overviewAttentionRows.innerHTML, /Excluded|<Bakery>/);
  assert.match(elements.overviewAttentionReference.textContent, /Aug 26/);
  assert.match(elements.overviewAttentionReference.textContent, /Separate from the selected chart period/);
  assert.deepEqual(G.state.selectedMonths, ['Jan 26']);
});

test('Overview recomputes scope and band filters, including empty and restored scopes', () => {
  const { G, elements } = setup();
  G.renderOverviewAttention();
  G.state.opsFilter = ['Area B'];
  G.renderOverviewAttention();
  assert.match(elements.overviewAttentionRows.innerHTML, /Bravo/);
  assert.doesNotMatch(elements.overviewAttentionRows.innerHTML, /Alpha|Charlie/);
  G.state.searchBakery = ['Charlie'];
  G.renderOverviewAttention();
  assert.match(elements.overviewAttentionRows.innerHTML, /No eligible bakeries/);
  G.state.opsFilter = [];
  G.state.searchBakery = [];
  G.state.bandFilter = 'Meeting';
  G.renderOverviewAttention();
  assert.match(elements.overviewAttentionRows.innerHTML, /No eligible bakeries/);
  G.state.bandFilter = '';
  G.renderOverviewAttention();
  assert.match(elements.overviewAttentionRows.innerHTML, /Alpha &lt;Bakery&gt;/);
});

test('a role without Focus access cannot see the preview or calculate its data', () => {
  const { G, elements } = setup();
  G.renderOverviewAttention();
  G.permissions = { tabs: { target: false } };
  G.buildFocusDataset = () => { throw new Error('Must not read Focus data'); };
  G.renderOverviewAttention();
  assert.equal(elements.overviewAttention.hidden, true);
  assert.equal(elements.overviewAttentionRows.innerHTML, '');
});

test('missing completed data is explained rather than leaving stale rows', () => {
  const { G, elements } = setup();
  G.renderOverviewAttention();
  G.buildFocusDataset = () => ({ data: [], onboarding: [], dataReview: [], closedMonths: [], recentMonths: [], latestClosedMonth: null });
  G.renderOverviewAttention();
  assert.doesNotMatch(elements.overviewAttentionRows.innerHTML, /data-overview-focus-detail/);
  assert.match(elements.overviewAttentionRows.innerHTML, /once completed-month data is available/);
});

test('preview navigation opens the existing summary before reviewing a bakery and respects role access', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const start = app.indexOf('  function openOverviewPriority(name) {');
  const end = app.indexOf('\n  var overviewPriorityButton', start);
  const calls = [];
  const context = {
    G: { permissions: { tabs: { target: true } }, openFocusDetail: name => calls.push(['detail', name]) },
    closeDashboardNavPopover: () => calls.push('close-menu'),
    activateDashboardTab: tab => calls.push(['tab', tab]),
    setDashboardNavAccordion: tab => calls.push(['menu', tab]),
    activateTargetSubtab: tab => calls.push(['subtab', tab]),
    scrollToTop: () => calls.push('scroll'),
    document: { getElementById: id => ({ setAttribute() {}, focus: () => calls.push(['focus', id]) }) }
  };
  vm.createContext(context);
  vm.runInContext(app.slice(start, end), context);
  context.openOverviewPriority('Bravo');
  assert.deepEqual(calls, ['close-menu', ['tab', 'target'], ['menu', 'target'], ['subtab', 'summary'], 'scroll', ['detail', 'Bravo']]);
  calls.length = 0;
  context.openOverviewPriority();
  assert.deepEqual(calls.at(-1), ['focus', 'focusPriorityOverviewTitle']);
  calls.length = 0;
  context.G.permissions.tabs.target = false;
  context.openOverviewPriority('Bravo');
  assert.deepEqual(calls, []);
});
