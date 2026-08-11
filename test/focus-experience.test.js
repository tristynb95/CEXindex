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
  assert.match(app, /syncFocusPeriodControls\(name\)/);
  assert.match(app, /setFocusPeriodControls\(name === 'target' && !onFocusMap, onFocusMap\)/);
  assert.match(app, /\{ id: 'rollingWindow', label: 'All Time' \}/);
  assert.match(app, /select\.dataset\.lockedLabel = config\.label/);
  assert.match(customSelects, /select\.dataset\.lockedLabel/);
  assert.ok(html.indexOf('js/focus-data.js') < html.indexOf('js/targets.js'));
  assert.doesNotMatch(html, /id="focusPeriodContext"/);
});

test('the Focus map unlocks the period controls, and only that sub-tab', () => {
  assert.match(app, /var onFocusMap = name === 'target' && activeTargetSubtab === 'map'/);
  // The sub-tab switch re-syncs, so stepping between Focus sub-tabs locks and
  // unlocks without leaving the tab.
  assert.match(app, /activeTargetSubtab = name;/);
  assert.match(app, /panel\.classList\.toggle\('active', panel\.dataset\.targetSubtabPanel === name\);\s*\}\);[\s\S]{0,220}?syncFocusPeriodControls\(\);/);
  // Unlocked, the controls say what they move: the map overlay, not the scores.
  assert.match(app, /Sets which period the map counts as visited\. Focus scores still use all completed history\./);
});

test('the Focus map opens on all months and hands the period back when it is left', () => {
  assert.match(app, /applyPeriodSelection\('', '0'\)/);
  assert.match(app, /focusMapPeriodMemo = \{\s*month: monthSelect \? monthSelect\.value : '',\s*rolling: rollingWindow \? rollingWindow\.value : '1'\s*\}/);
  // Leaving restores whatever the rest of the dashboard was set to, so
  // borrowing the controls never rewrites the user's own period.
  assert.match(app, /\} else if \(!onFocusMap && focusMapPeriodMemo\) \{[\s\S]*?applyPeriodSelection\(memo\.month, memo\.rolling\)/);
  assert.match(app, /state\.selectedMonths = month\s*\?\s*\[month\]\s*:\s*G\.resolvePeriodMonths\(rolling, state\.MONTHS, state\.ALL\)/);
});

test('both maps read visited from the selected period, not a fixed six-month rule', () => {
  assert.doesNotMatch(targets, /wasRecentlyVisited/);
  assert.match(targets, /function getPeriodMonths\(\) \{/);
  assert.doesNotMatch(targets, /getPeriodMonths\(cfg\.key\)|getPeriodMonths\(mapKey\)/);
  // One helper answers for both maps, for the marker filter and the area
  // coverage tooltip alike, so the two can never disagree.
  assert.match(targets, /function isVisitedInPeriod\(name, months\) \{\s*return GAILS\.isBakeryVisitedInPeriod \? GAILS\.isBakeryVisitedInPeriod\(name, months\) : false;/);
  assert.match(targets, /var visited = isVisitedInPeriod\(item\.b, months\)/);
  assert.match(targets, /if \(isVisitedInPeriod\(item\.b, _periodMonths\)\) areaVisited\[ops\]\+\+/);
  assert.match(targets, /var visitLabel = 'visited this period'/);
});

test('returns to the top Priorities view when Focus Bakeries is revisited', () => {
  assert.match(app, /function activateTargetSubtab\(name, options\)/);
  assert.match(app, /var shouldScrollNav = !\(options && options\.scrollNav === false\)/);
  assert.match(app, /if \(name === 'target' && previousName && previousName !== 'target'\) \{\s*activateTargetSubtab\('summary', \{ scrollNav: false \}\);/);
  assert.match(app, /activateDashboardTab\(t\.dataset\.tab\);\s*scrollToTop\(\);/);
});

test('preserves a profile-return hash through the final dashboard startup sync', () => {
  assert.match(app, /var target = String\(window\.location\.hash \|\| ''\)\.replace\(\/\^\#\(\?:tab-\)\?\/, ''\)/);
  assert.ok(app.indexOf('activateDashboardHashTarget();') < app.indexOf('var initialActiveTab'));
  assert.match(app, /var initialActiveTab = document\.querySelector\('\.tab-content\.active'\)[\s\S]*?updateDashboardActiveView\(initialActiveTab\);\s*syncDashboardKpis\(initialActiveTab\)/);
  assert.doesNotMatch(app, /updateDashboardActiveView\('overview'\);\s*syncDashboardKpis\('overview'\)/);
  assert.match(app, /var dashboardTabsWithKpis = \{\s*overview: true\s*\}/);
});

test('uses Benchmark as the single user-facing performance lens', () => {
  assert.doesNotMatch(html, /id="globalIndexToggle"|data-global-index=/);
  assert.doesNotMatch(app, /globalIndexToggle|state\.indexType|state\.rankingsMetric|state\.targetMetric/);
  assert.doesNotMatch(html, /Peer Score Band|<th>Peer Score<\/th>|<th>Peer Band<\/th>/);
  assert.match(html, /id="bandFilterLabel">Benchmark Band<\/label>/);
  // Benchmark is also the league table's default sort, so the option carries
  // an explicit selected attribute rather than relying on document order.
  assert.match(html, /<option value="ac" selected>Benchmark Score<\/option>/);
  assert.doesNotMatch(html, /<option value="c">/);
});

test('uses a neutral label on the mobile filter button', () => {
  assert.match(html, /id="filterSideTabLabel">Filters<\/span>/);
  assert.match(app, /var indexLabel = 'Filters'/);
  assert.match(app, /filterTabLabel\.textContent = indexLabel/);
  assert.match(app, /'Open dashboard filters'/);
  assert.match(styles, /\.filter-side-tab \{[\s\S]*?width: auto;[\s\S]*?min-width: 104px/);
});

test('puts the recommendation and action list before secondary analysis', () => {
  const start = html.indexOf('class="target-subtab-panel active"');
  const end = html.indexOf('data-target-subtab-panel="priority"', start);
  const summary = html.slice(start, end);

  assert.ok(summary.indexOf('id="targetHubQueue"') < summary.indexOf('id="focusAreaDetails"'));
  assert.ok(summary.indexOf('id="focusAreaDetails"') < summary.indexOf('id="focusInsightsDetails"'));
  assert.match(summary, /How is support priority calculated\?/);
  assert.match(summary, /class="focus-method focus-method--overlay focus-priority-help"/);
  assert.match(summary, /class="focus-priority-help__tooltip"[^>]*role="tooltip"/);
  assert.match(styles, /\.focus-priority-help,\s*\.focus-priority-help\[open\] \{[\s\S]*?margin-left: auto/);
  assert.match(html, /<span>Priority Overview<\/span>/);
  assert.doesNotMatch(html, /<span>Where to focus<\/span>/);
  assert.match(summary, /<h1>Priority Overview<\/h1>/);
  assert.doesNotMatch(summary, /Focus bakery action plan|Focus bakery priorities/);
  assert.doesNotMatch(summary, /top priority highlighted below/);
  assert.doesNotMatch(summary, /Start with the recommended bakery/);
  assert.match(summary, /six most recent completed months/);
  assert.match(summary, /remaining weights are rebalanced/);
  assert.match(summary, /recent time in focus/i);
  assert.doesNotMatch(summary, /id="targetSummary"/);
});

test('uses plain-language performance, priority, trend and visit labels', () => {
  assert.match(targets, /Why this bakery:/);
  assert.match(targets, /Recommended next step:/);
  assert.match(targets, /role="columnheader">Priority</);
  assert.match(targets, /vs Prev Month/);
  assert.match(targets, /Routine visit/);
  assert.match(targets, /Review bakery/);
  assert.doesNotMatch(targets, /Dipping MoM/);
  assert.doesNotMatch(targets, /safe at/);
  assert.doesNotMatch(targets, /bakeries'\) \+ ' excluded/);
});

test('keeps performance and activity filters independent and reports results', () => {
  // The two activity filters are independent checkboxes held as separate
  // booleans, so a bakery that is both falling and overdue can be isolated.
  assert.match(targets, /dipping: prevDipping, novisit: prevNovisit, band: prevBand/);
  assert.match(targets, /if \(s\.band === 'band-high'\)/);
  assert.match(targets, /if \(s\.dipping && !isDipping\(r\)\) return false;/);
  assert.match(targets, /if \(s\.novisit && !isVisitDue\(r\)\) return false;/);
  // Older state stored them as one mutually exclusive string; that is migrated
  // rather than dropped, so an applied filter survives a re-render.
  assert.match(targets, /if \(prevStatus === 'dipping'\) prevDipping = true;/);
  assert.match(targets, /Showing <strong>/);
  assert.match(targets, /Performance: /);
});

test('groups unavailable main-map results under one Not Scored state', () => {
  const networkLegend = targets.slice(targets.indexOf('var NETWORK_LEGEND'), targets.indexOf('var NETWORK_HINT'));
  const networkHint = html.match(/id="networkMapLegendHint"[\s\S]*?<\/p>/)[0];

  assert.match(networkLegend, /label: 'Not Scored'/);
  assert.doesNotMatch(networkLegend, /label: '(?:Incomplete|No Data)'/);
  assert.match(networkHint, /Not Scored/);
  assert.match(targets, /var statusLabel = 'Not Scored'/);
  assert.match(targets, /Fewer than three scored months in this period/);
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
  assert.match(styles, /\.focus-qrow--lead\s*\{[\s\S]*?border-radius: 0 12px 0 12px/);
  assert.doesNotMatch(styles, /\.focus-qrow--lead\s*\{[\s\S]*?inset[^;]*var\(--accent\)/);
  assert.match(styles, /#targetHubQueue\s*\{[\s\S]*?margin-bottom: clamp\(16px, 2vw, 24px\)/);
  assert.match(styles, /\.focus-secondary\s*\+\s*\.focus-secondary\s*\{[\s\S]*?margin-top: 20px/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?grid-template-areas:[\s\S]*?"who action"/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?"visit"[\s\S]*?"action"/);
});

test('simplifies the bakery review and uses benchmark-based RAG analysis', () => {
  assert.match(targets, /class="focus-review-summary focus-at-a-glance"/);
  assert.doesNotMatch(html, /id="focusDetailSummary"/);
  assert.match(targets, /class="focus-month-table-heading" data-table-fullscreen-anchor="true"/);
  assert.match(targets, /At a glance/);
  assert.match(targets, /if \(row\.tier === 'critical'\) return 'High Priority'/);
  assert.match(targets, /if \(row\.tier === 'high'\) return 'Medium Priority'/);
  assert.match(targets, /return 'Monitor'/);
  assert.doesNotMatch(targets, /support need/);
  assert.doesNotMatch(targets, /Start here/);
  assert.match(targets, /class="focus-review-summary__facts"/);
  assert.match(targets, /<small>Focus run<\/small>/);
  assert.match(targets, /<small>Routine visit<\/small>/);
  assert.match(targets, /var focusStreak = _countFocusStreak\(trend\.hist, bf, highBand, lowBand\)/);
  assert.doesNotMatch(targets, /_countFocusStreak\(recentTrend\.hist/);
  assert.match(targets, /if \(isAbsolute\) \{\s*trendDatasets\.push/);
  assert.match(targets, /label: 'Exit focus threshold \(' \+ _hubState\.escapeLine \+ '\)'/);
  assert.match(targets, /data: FM\.map\(function \(\) \{ return _hubState\.escapeLine; \}\)/);
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
  assert.match(styles, /#visitReportModal \.drill-modal-title,\s*#focusDetailModal \.drill-modal-title \{[\s\S]*?1\.28rem/);
  assert.match(styles, /#focusDetailBody \{[\s\S]*?padding: 22px 24px 24px;[\s\S]*?gap: 22px/);
  assert.match(styles, /\.focus-review-summary \{[\s\S]*?background: var\(--card\)/);
  assert.match(styles, /\.focus-review-summary__facts \{[\s\S]*?grid-template-columns: repeat\(5/);
  assert.doesNotMatch(styles, /\.focus-review-summary__action/);
  assert.match(styles, /#focusDetailModal \.focus-detail-section--trend\s*>\s*\.focus-at-a-glance \{[\s\S]*?margin-bottom: 22px/);
  assert.doesNotMatch(targets, /focus-quickstats|focus-quickstat/);
  assert.match(targets, /class="focus-detail-section focus-detail-section--trend"/);
  assert.match(targets, /class="focus-detail-section focus-detail-section--trend">' \+\s*summaryHtml \+\s*'<h4 class="focus-section-title">Score trend vs selection and company average/);
  assert.match(targets, /class="focus-detail-section focus-detail-section--drivers"/);
  assert.match(targets, /class="focus-detail-section focus-detail-section--actions"/);
  assert.match(targets, /class="focus-detail-section focus-detail-section--history"/);
  assert.match(styles, /#focusDetailModal \.focus-detail-section \{[\s\S]*?gap: 8px/);
  assert.ok(targets.indexOf('At a glance') < targets.indexOf('Score trend vs selection and company average'));
  assert.ok(targets.indexOf('Score trend vs selection and company average') < targets.indexOf('Where to focus first'));
  assert.ok(targets.indexOf('Where to focus first') < targets.indexOf('Suggested next steps'));
  assert.ok(targets.indexOf('Suggested next steps') < targets.indexOf('Historical results'));
  assert.match(targets, /<details class="focus-history-disclosure">/);
  assert.match(targets, /<strong>Historical results<\/strong>/);
  assert.match(styles, /\.focus-actions \{[\s\S]*?gap: 0;[\s\S]*?border: 1px solid var\(--card-border\)/);
  assert.match(styles, /\.focus-history-disclosure \{[\s\S]*?background: var\(--card\)/);
  assert.match(styles, /\.focus-history-disclosure\s*>\s*summary \{/);
  assert.match(styles, /\.focus-history-disclosure__body \{[\s\S]*?background: var\(--card\)/);
  assert.match(styles, /\.focus-detail__visitbtn \{[\s\S]*?background: var\(--card\);[\s\S]*?color: var\(--text-2\)/);
  assert.match(styles, /\.focus-detail__visitbtn:hover \{[\s\S]*?background: var\(--accent-light\);[\s\S]*?color: var\(--accent\)/);
  assert.match(styles, /\.focus-chart-wrap \{[\s\S]*?height: 195px/);
  assert.doesNotMatch(styles, /\.focus-quickstats?\b|\.focus-quickstat__/);
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
      this.options = [];
      this.style = { setProperty() { } };
      this.attributes = {};
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    scrollIntoView() { }
    querySelector() { return null; }
  }

  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      const element = new FakeElement(id);
      if (id === 'focusQueueTier') element.options = Array.from({ length: 4 }, () => ({}));
      if (id === 'focusQueueStatus') element.options = Array.from({ length: 3 }, () => ({}));
      elements.set(id, element);
    }
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
       bakeryProfileLink(name) { return `<a class="bakery-profile-link">${this.escapeHtml(name)}</a>`; },
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

  assert.equal(context._countFocusStreak(
    Array.from({ length: 9 }, () => ({ cb: 'Low Performance' })),
    'cb', 'Low Performance', 'Below Average'
  ), 9);

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
  // Support priority is a dropdown whose options carry live counts; the two
  // activity filters are independent checkboxes with their own counts beside
  // them, so neither can hide the other's result set.
  assert.equal(getElement('focusQueueTier').options[0].textContent, 'All (1)');
  assert.equal(getElement('focusQueueTier').value, 'all');
  // Counts use the same predicates the list filters by (_visitStatus for
  // "visit due"), so a checkbox can never advertise a number the list then
  // fails to show — the previous counts read r.visitedInPeriod while the
  // filter read _visitStatus, and the two could disagree.
  assert.equal(getElement('focusQueueDippingCount').textContent, 1);
  assert.equal(getElement('focusQueueNovisitCount').textContent, 0);
  assert.equal(getElement('focusQueueDipping').checked, false);
  assert.doesNotMatch(getElement('focusQueueChips').innerHTML, /focus-chip__count/);

  context._renderTargetTable(latest.slice().reverse(), 'cb', 'c', 'Low Performance', false);
  const allBakeryTable = getElement('targetTable').innerHTML;
  const expectedTop = context._hubState.rows[0];
  // "Priority" on desktop, "#" on phones — see .th-label-full/.th-label-short
  assert.match(allBakeryTable, /<th><span class="th-label-full">Priority<\/span><span class="th-label-short">#<\/span><\/th>/);
  assert.match(allBakeryTable, /class="table-wrap table-wrap--support-priority table-wrap--floating"/);
  assert.match(allBakeryTable, /class="support-priority-table nps-splits-collapsed"/);
  assert.doesNotMatch(allBakeryTable, /<th>Support Urgency<\/th>/);
  assert.match(allBakeryTable, /Average Drinks Per Month/);
  assert.match(allBakeryTable, /<tbody><tr><td style="font-weight:700">1<\/td>/);
  assert.doesNotMatch(allBakeryTable, /title="Performance gap/);
  assert.ok(allBakeryTable.indexOf(expectedTop.name) < allBakeryTable.indexOf(expectedTop.name === 'Henley' ? 'Highgate' : 'Henley'));
  assert.match(allBakeryTable, /12345/);
  assert.doesNotMatch(allBakeryTable, /LOW VOL/);
  assert.doesNotMatch(allBakeryTable, /Ranked lowest Score first/);
  assert.match(styles, /\.support-priority-table th:first-child,[\s\S]*?position: sticky;[\s\S]*?left: 0;/);
  assert.match(styles, /\.support-priority-table th:nth-child\(2\),[\s\S]*?position: sticky;[\s\S]*?left: var\(--support-priority-rank-width\);/);

  context.GAILS.openFocusDetail('Henley');
  const review = getElement('focusDetailBody').innerHTML;
  assert.match(review, /class="focus-review-summary focus-at-a-glance"/);
  assert.match(review, /At a glance/);
  assert.match(review, /(?:High Priority|Medium Priority|Monitor)/);
  assert.doesNotMatch(review, /Start here|Focus history:|Current run:/);
  assert.doesNotMatch(review, /No routine visit has been logged for this bakery yet/);
  assert.match(review, /<small>Score<\/small>/);
  assert.match(review, /<small>Latest change<\/small>/);
  assert.match(review, /<small>Focus run<\/small>/);
  assert.match(review, /<small>Routine visit<\/small>/);
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
  assert.doesNotMatch(review, /focus-quickstat/);
  assert.ok(review.indexOf('At a glance') < review.indexOf('Score trend vs selection and company average'));
  assert.ok(review.indexOf('Where to focus first') < review.indexOf('Suggested next steps'));
});
