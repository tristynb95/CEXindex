const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const targets = fs.readFileSync(path.join(root, 'js', 'targets.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const customSelects = fs.readFileSync(path.join(root, 'js', 'custom-selects.js'), 'utf8');

test('locks the Focus period controls to a clear All Time display without changing the saved period', () => {
  assert.match(app, /setFocusPeriodControls\(name === 'target'\)/);
  assert.match(app, /\{ id: 'rollingWindow', label: 'All Time' \}/);
  assert.match(app, /select\.dataset\.lockedLabel = config\.label/);
  assert.match(customSelects, /select\.dataset\.lockedLabel/);
  assert.ok(html.indexOf('js/focus-data.js') < html.indexOf('js/targets.js'));
  assert.doesNotMatch(html, /id="focusPeriodContext"/);
});

test('puts the recommendation and action list before secondary analysis', () => {
  const start = html.indexOf('class="target-subtab-panel active"');
  const end = html.indexOf('data-target-subtab-panel="priority"', start);
  const summary = html.slice(start, end);

  assert.ok(summary.indexOf('id="focusSpotlight"') < summary.indexOf('id="targetHubQueue"'));
  assert.ok(summary.indexOf('id="targetHubQueue"') < summary.indexOf('id="focusAreaDetails"'));
  assert.ok(summary.indexOf('id="focusAreaDetails"') < summary.indexOf('id="focusInsightsDetails"'));
  assert.match(summary, /How support priority is calculated/);
  assert.match(html, /<span>Priorities<\/span>/);
  assert.doesNotMatch(html, /<span>Where to focus<\/span>/);
  assert.match(summary, /<h2>Priority Overview<\/h2>/);
  assert.doesNotMatch(summary, /Focus bakery action plan|Focus bakery priorities/);
  assert.match(summary, /top priority highlighted below/);
  assert.doesNotMatch(summary, /Start with the recommended bakery/);
  assert.match(summary, /six most recent completed months/);
  assert.match(summary, /remaining weights are rebalanced/);
  assert.match(summary, /recent time in focus/);
  assert.doesNotMatch(summary, /id="targetSummary"/);
});

test('uses plain-language performance, priority, trend and visit labels', () => {
  assert.match(targets, /Top Priority/);
  assert.match(targets, /Support priority/);
  assert.match(targets, /Change since last month/);
  assert.match(targets, /Routine visit/);
  assert.match(targets, /Review bakery/);
  assert.doesNotMatch(targets, /Dipping MoM/);
  assert.doesNotMatch(targets, /safe at/);
  assert.doesNotMatch(targets, /bakeries'\) \+ ' excluded/);
});

test('keeps performance and activity filters independent and reports results', () => {
  assert.match(targets, /status: prevStatus, band: prevBand/);
  assert.match(targets, /if \(s\.band === 'band-high'\)/);
  assert.match(targets, /if \(s\.status === 'dipping'\)/);
  assert.match(targets, /Showing <strong>/);
  assert.match(targets, /All priority levels/);
  assert.match(targets, /Performance: /);
});

test('initialises the focus bakery map in peer mode', () => {
  assert.match(targets, /key: 'target',[\s\S]*?bandField: 'cb',[\s\S]*?legendItems: TARGET_LEGEND\.relative/);
  assert.match(html, /id="targetMapLegendHint"[\s\S]*?Low Performance[\s\S]*?Below Average/);
});

test('provides readable labels and a card layout on narrow screens', () => {
  assert.match(styles, /\.focus-qrow__who small[\s\S]*?font-size: 0\.75rem/);
  assert.match(styles, /\.focus-action\s*\{[\s\S]*?margin-bottom: clamp\(30px, 3vw, 42px\)/);
  assert.match(styles, /#targetHubQueue\s*\{[\s\S]*?margin-bottom: clamp\(30px, 3vw, 40px\)/);
  assert.match(styles, /\.focus-secondary \+ \.focus-secondary\s*\{[\s\S]*?margin-top: 20px/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?grid-template-areas:[\s\S]*?"who action"/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?"visit"[\s\S]*?"action"/);
});

test('simplifies the bakery review and uses benchmark-based RAG analysis', () => {
  assert.match(targets, /class="focus-review-summary"/);
  assert.match(targets, /At a glance/);
  assert.match(targets, /Start here/);
  assert.match(targets, /Bar colour shows target status · length shows progress to target/);
  assert.match(targets, /Math\.round\(d\.attainment\)/);
  assert.match(targets, /focus-driver__movement-icon--/);
  assert.match(targets, /metricRagColor\(d\.key, d\.value\)/);
  assert.match(targets, /focus-driver__fill" style="[^"]*background:/);
  assert.doesNotMatch(targets, /class="focus-driver__rag/);
  assert.doesNotMatch(targets, /Why this bakery is in focus/);
  assert.doesNotMatch(targets, /Ranked against other bakeries · longer bars are better/);
  assert.match(targets, /metricRagStyle\('n', r\.n\)/);
  assert.match(targets, /metricRagStyle\('at', r\.at\)/);
  assert.match(styles, /\.focus-review-summary/);
  assert.match(styles, /\.focus-driver__movement-icon--up/);
  assert.match(styles, /\.focus-driver__movement-icon--down/);
  assert.doesNotMatch(styles, /\.focus-driver__rag--red/);
});

test('shares the corrected two-minute wait benchmark and established RAG rules', () => {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(config, context);
  const G = context.window.GAILS;

  assert.equal(G.BENCHMARKS.at, 120);
  assert.equal(G.BENCHMARK_FLOORS.at, 125);
  assert.equal(G.metricRagTone('at', 120), 'green');
  assert.equal(G.metricRagTone('at', 122), 'amber');
  assert.equal(G.metricRagTone('at', 125), 'red');
  assert.equal(G.metricRagTone('ef', 90), 'green');
  assert.equal(G.metricRagTone('ef', 85), 'amber');
  assert.equal(G.metricRagTone('ef', 79), 'red');
  assert.equal(G.metricRagTone('ts', 75), 'green');
  assert.equal(G.metricRagTone('ts', 60), 'amber');
  assert.equal(G.metricBenchmarkAttainment('ef', 45, 90), 50);
  assert.equal(G.metricBenchmarkAttainment('at', 150, 120), 80);
  assert.match(app, /Target: ≤ 2:00/);
  assert.doesNotMatch(app, /Target: ≤ 1:55/);
  assert.match(html, /2:00 \(120s\) or less/);
});

test('renders a plain-language action card and accurate filtered count', () => {
  class FakeElement {
    constructor(id) {
      this.id = id;
      this.innerHTML = '';
      this.className = '';
      this.value = '';
      this.style = { setProperty() { } };
      this.attributes = {};
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    scrollIntoView() { }
    querySelector() { return null; }
  }

  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, new FakeElement(id));
    return elements.get(id);
  };
  const document = {
    addEventListener() { },
    getElementById: getElement,
    documentElement: { classList: { add() { }, remove() { } } },
    body: { classList: { add() { }, remove() { } }, style: {} },
  };

  const records = [
    { b: 'Henley', m: 'Jun 26', c: 25, cb: 'Low Performance', dr: 55, ef: 62, fr: 65, n: 40, ts: 60, at: 117 },
    { b: 'Henley', m: 'Jul 26', c: 20, cb: 'Low Performance', dp: 4, dr: 50, ep: 12, ef: 60, fp: 20, fr: 70, np: 8, n: 35, ap: 10, ts: 55, atp: 15, at: 119, tdMonthlyAvg: 12345 },
    { b: 'Highgate', m: 'Jun 26', c: 44, cb: 'Below Average' },
    { b: 'Highgate', m: 'Jul 26', c: 48, cb: 'Below Average', dp: 30, dr: 70, ep: 25, ef: 68, fp: 40, fr: 80, np: 20, n: 45, ap: 28, ts: 70, atp: 32, at: 125 },
  ];
  const latest = records.filter((record) => record.m === 'Jul 26');
  const context = {
    console,
    document,
    setTimeout,
    clearTimeout,
    addEventListener() { },
    scrollTo() { },
    GAILS: {
      state: { selectedMonths: ['Jun 26', 'Jul 26'], MONTHS: ['Jun 26', 'Jul 26'], ALL: records },
      BENCHMARKS: { dr: 75, ef: 75, fr: 80, nps: 55, time: 80, at: 120 },
      metricBenchmarkAttainment(metric, value, benchmark) {
        const ratio = metric === 'at' ? benchmark / Math.max(1, value) : Math.max(0, value) / benchmark;
        return Math.max(0, Math.min(100, ratio * 100));
      },
      metricRagTone(metric, value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '';
        if (metric === 'at') return value <= 120 ? 'green' : value < 125 ? 'amber' : 'red';
        return value >= 75 ? 'green' : value >= 60 ? 'amber' : 'red';
      },
      metricRagColor(metric, value) {
        const tone = this.metricRagTone(metric, value);
        return tone ? `var(--${tone})` : 'var(--muted)';
      },
      metricRagStyle(metric, value) {
        const tone = this.metricRagTone(metric, value);
        return tone ? ` style="color:var(--${tone})"` : '';
      },
      escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); },
      bc(value) { return String(value).replaceAll(' ', '-'); },
      COL: { 'Low Performance': '#B22A24', 'Below Average': '#C97F12' },
      ABSCOL: {},
      formatSecs(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        return `${Math.floor(value / 60)}:${String(Math.round(value % 60)).padStart(2, '0')}`;
      },
      makeChart() { },
      makeSortable() { },
      npsSplitToggleHtml() { return ''; },
      syncNpsSplitTables() { },
      monthSortKey(month) { return month === 'Jun 26' ? 1 : 2; },
      focusMonthLabelFromKey(key) { return key === 1 ? 'Jun 26' : key === 2 ? 'Jul 26' : ''; },
      getBakeryOps(name) { return name === 'Henley' ? 'Bobby Holmes' : 'Kate Downes'; },
      getBakeryRegion() { return 'North Region'; },
      isBakeryVisitedInPeriod(name) { return name === 'Highgate'; },
      getLastVisitDate(name) { return name === 'Henley' ? '2026-05-10' : '2026-07-10'; },
      avg(items, field) { return items.reduce((sum, item) => sum + item[field], 0) / items.length; },
    },
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'support-score.js'), 'utf8'), context);
  vm.runInContext(targets, context);

  context._renderFocusHub(latest, latest, 'cb', 'c', 'Low Performance', 'Below Average', false);

  assert.match(getElement('focusSpotlight').innerHTML, /Top Priority/);
  assert.match(getElement('focusSpotlight').innerHTML, /Performance/);
  assert.match(getElement('focusSpotlight').innerHTML, /Support priority/);
  assert.match(getElement('focusQueueGrid').innerHTML, /Main focus/);
  assert.match(getElement('focusQueueGrid').innerHTML, /Last visited/);
  assert.doesNotMatch(getElement('focusQueueGrid').innerHTML, /focus-qdot/);

  context.GAILS.filterQueueFromStat('band-high');
  assert.match(getElement('focusQueueChips').innerHTML, /Performance: Low Performance/);
  assert.match(getElement('focusQueueSummary').innerHTML, /Showing <strong>1<\/strong> of 1 matching bakeries/);
  assert.match(getElement('focusQueueSummary').innerHTML, /2 total focus bakeries/);
  assert.match(getElement('focusQueueChips').innerHTML, /All priority levels<span class="focus-chip__count">1<\/span>/);

  context._renderTargetTable(latest.slice().reverse(), 'cb', 'c', 'Low Performance', false);
  const allBakeryTable = getElement('targetTable').innerHTML;
  const expectedTop = context._hubState.rows[0];
  assert.match(allBakeryTable, /<th>Priority<\/th>/);
  assert.doesNotMatch(allBakeryTable, /<th>Support Urgency<\/th>/);
  assert.match(allBakeryTable, /Average Drinks Per Month/);
  assert.match(allBakeryTable, /<tbody><tr><td style="font-weight:700">1<\/td>/);
  assert.doesNotMatch(allBakeryTable, /title="Performance gap/);
  assert.ok(allBakeryTable.indexOf(expectedTop.name) < allBakeryTable.indexOf(expectedTop.name === 'Henley' ? 'Highgate' : 'Henley'));
  assert.match(allBakeryTable, /12345/);
  assert.doesNotMatch(allBakeryTable, /Ranked lowest Score first/);

  context.GAILS.openFocusDetail('Henley');
  const review = getElement('focusDetailBody').innerHTML;
  assert.match(review, /class="focus-review-summary"/);
  assert.match(review, /(?:support need|Monitor this bakery)/);
  assert.match(review, /Start here/);
  assert.match(review, /Target 2:00/);
  assert.match(review, /Coffee Efficiency/);
  assert.match(review, /Average Wait Time/);
  assert.doesNotMatch(review, /Drinks Served Within 2 Minutes/);
  assert.doesNotMatch(review, /Average Drink Wait/);
  assert.match(review, /aria-label="80% of benchmark ·/);
  assert.match(review, /focus-driver__movement-icon--up/);
  assert.match(review, /focus-driver__movement-icon--down/);
  assert.match(review, /focus-driver__fill" style="width:100%;background:var\(--green\)"/);
  assert.match(review, /focus-driver__fill" style="[^"]*background:var\(--red\)"/);
  assert.doesNotMatch(review, /class="focus-driver__rag/);
  assert.match(review, /style="color:var\(--red\)"/);
  assert.doesNotMatch(review, /target-stat-card/);
  assert.doesNotMatch(review, /focus-reason/);
});
