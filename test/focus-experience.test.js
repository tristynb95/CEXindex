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

test('returns to the top Priorities view when Focus Bakeries is revisited', () => {
  assert.match(app, /function activateTargetSubtab\(name, options\)/);
  assert.match(app, /var shouldScrollNav = !\(options && options\.scrollNav === false\)/);
  assert.match(app, /if \(name === 'target' && previousName && previousName !== 'target'\) \{\s*activateTargetSubtab\('summary', \{ scrollNav: false \}\);/);
  assert.match(app, /activateDashboardTab\(t\.dataset\.tab\);\s*scrollToTop\(\);/);
});

test('moves the Peer and Benchmark toggle to the top of compact filters', () => {
  assert.match(app, /var globalIndexToggleMobileParent = document\.querySelector\('#filterControlsPanel \.filter-controls-body'\)/);
  assert.match(app, /var useMobilePlacement = compactDashboardSidebarMedia\.matches/);
  assert.match(app, /globalIndexToggleMobileParent\.insertBefore\(globalIndexToggle, globalIndexToggleMobileParent\.firstChild\)/);
  assert.match(app, /globalIndexToggle\.classList\.toggle\('is-mobile-filter', useMobilePlacement\)/);
  assert.match(styles, /\.header-index-toggle\.is-mobile-filter \{[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(styles, /\.header-index-toggle\.is-mobile-filter \.overview-rankings-toggle__btn\.active \{[\s\S]*?#B5312A[\s\S]*?#A32520/);
});

test('shows the active index type on the mobile filter button', () => {
  assert.match(html, /id="filterSideTabLabel">Peer<\/span>/);
  assert.match(app, /var indexLabel = state\.indexType === 'absolute' \? 'Benchmark' : 'Peer'/);
  assert.match(app, /filterTabLabel\.textContent = indexLabel/);
  assert.match(app, /'Open filters — ' \+ indexLabel \+ ' index'/);
  assert.match(styles, /\.filter-side-tab \{[\s\S]*?width: auto;[\s\S]*?min-width: 104px/);
});

test('puts the recommendation and action list before secondary analysis', () => {
  const start = html.indexOf('class="target-subtab-panel active"');
  const end = html.indexOf('data-target-subtab-panel="priority"', start);
  const summary = html.slice(start, end);

  assert.ok(summary.indexOf('id="targetHubQueue"') < summary.indexOf('id="focusAreaDetails"'));
  assert.ok(summary.indexOf('id="focusAreaDetails"') < summary.indexOf('id="focusInsightsDetails"'));
  assert.match(summary, /How support priority is calculated/);
  assert.match(html, /<span>Priorities<\/span>/);
  assert.doesNotMatch(html, /<span>Where to focus<\/span>/);
  assert.match(summary, /<h2>Priority Overview<\/h2>/);
  assert.doesNotMatch(summary, /Focus bakery action plan|Focus bakery priorities/);
  assert.doesNotMatch(summary, /top priority highlighted below/);
  assert.doesNotMatch(summary, /Start with the recommended bakery/);
  assert.match(summary, /six most recent completed months/);
  assert.match(summary, /remaining weights are rebalanced/);
  assert.match(summary, /recent time in focus/);
  assert.doesNotMatch(summary, /id="targetSummary"/);
});

test('uses plain-language performance, priority, trend and visit labels', () => {
  assert.match(targets, /Why this bakery:/);
  assert.match(targets, /Recommended next step:/);
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

test('groups unavailable main-map results under one Not Scored state', () => {
  const networkLegend = targets.slice(targets.indexOf('var NETWORK_LEGEND'), targets.indexOf('var NETWORK_HINT'));
  const networkHint = html.match(/id="networkMapLegendHint"[\s\S]*?<\/p>/)[0];

  assert.match(networkLegend, /label: 'Not Scored'/);
  assert.doesNotMatch(networkLegend, /label: '(?:Incomplete|No Data)'/);
  assert.match(networkHint, /Not Scored/);
  assert.match(targets, /var statusLabel = 'Not Scored'/);
  assert.match(targets, /Some data is available, but not enough to calculate a score/);
  assert.match(targets, /No performance data is available for this period/);
  assert.match(targets, /site' \+ \(noDataCount === 1 \? '' : 's'\) \+ ' not scored this period\.'/);
});

test('classifies the focus bakery map by support-priority tier, not performance band', () => {
  // The focus map deliberately colours by priority tier (High/Medium/Monitor)
  // so it is never mistaken for the network performance-band map.
  assert.match(targets, /key: 'target',[\s\S]*?colorMode: 'priority',[\s\S]*?legendItems: TARGET_PRIORITY_LEGEND/);
  assert.match(targets, /TARGET_PRIORITY_LEGEND = \[[\s\S]*?'High'[\s\S]*?'Medium'[\s\S]*?'Monitor'/);
  // Scope the hint check to the target legend element itself — the network map
  // hint elsewhere on the page still (correctly) names the performance bands.
  const targetHint = html.match(/id="targetMapLegendHint"[\s\S]*?<\/p>/)[0];
  assert.match(targetHint, /High[\s\S]*?Medium[\s\S]*?Monitor/);
  assert.doesNotMatch(targetHint, /Low Performance|Below Average/);
  // Tier is carried onto the snapshot the map is fed, before the map is stored.
  assert.match(targets, /rec\.supportTier = p\.tier/);
  assert.ok(targets.indexOf('_renderFocusHub(targets, data') < targets.indexOf('G.storeMapTargets(targets)'));
});

test('shades focus-map territories by focus density (share of area in focus), not performance', () => {
  // Area boundaries on the focus map show the share of each ops area's bakeries
  // (focus and not) that are in focus: blue = few, through green/amber, to red.
  // The network map keeps its performance-band colouring.
  assert.match(targets, /function getAreaDensityColor\(density\)/);
  assert.match(targets, /function buildAreaDensityTooltip\(/);
  // Blue (low) -> green -> amber -> red (high) density bands.
  assert.match(targets, /DENSITY_BANDS = \[[\s\S]*?0\.50[\s\S]*?#B22A24[\s\S]*?0\.10[\s\S]*?#1D9E5C[\s\S]*?#1E70C4/);
  // Denominator is the full directory per area (focus + non-focus), under filters.
  assert.match(targets, /getFilteredBakeryNames\(\)\.forEach[\s\S]*?_areaDirTotals\[ops\]/);
  // Priority branch computes density and drives colour + tooltip; band path stays on network.
  assert.match(targets, /if \(_isPriorityAreas\) \{[\s\S]*?focusCount \/ areaBakeryTotal[\s\S]*?getAreaDensityColor\(density\)[\s\S]*?buildAreaDensityTooltip\(/);
  assert.match(targets, /\} else \{[\s\S]*?getAreaBandColor\([\s\S]*?buildAreaTooltip\(/);
});

test('provides readable labels and a card layout on narrow screens', () => {
  assert.match(styles, /\.focus-qrow__who small[\s\S]*?font-size: 0\.75rem/);
  assert.match(styles, /\.focus-qrow--lead\s*\{[\s\S]*?border-radius: 12px/);
  assert.doesNotMatch(styles, /\.focus-qrow--lead\s*\{[\s\S]*?inset[^;]*var\(--accent\)/);
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

  assert.match(getElement('focusQueueGrid').innerHTML, /focus-qrow--lead/);
  assert.match(getElement('focusQueueGrid').innerHTML, /Why this bakery:/);
  assert.match(getElement('focusQueueGrid').innerHTML, /Recommended next step:/);
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
