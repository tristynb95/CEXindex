const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const filtersSource = fs.readFileSync(path.join(root, 'js', 'filters.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const charts = fs.readFileSync(path.join(root, 'js', 'charts.js'), 'utf8');
const tables = fs.readFileSync(path.join(root, 'js', 'tables.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

function createRankingContext() {
  const GAILS = {
    state: {
      ALL: [
        { b: 'Alpha', m: 'Jun 26', ac: 90, c: 20, v: 20, noData: false, incompletePeriod: false, acb: 'Exceeding', region: 'South' },
        { b: 'Bravo', m: 'Jun 26', ac: 90, c: 80, v: 20, noData: false, incompletePeriod: false, acb: 'Exceeding', region: 'North' },
        { b: 'Charlie', m: 'Jun 26', ac: 80, c: 50, v: 20, noData: false, incompletePeriod: false, acb: 'Meeting', region: 'North' }
      ],
      MONTHS: ['Jun 26'],
      selectedMonths: ['Jun 26'],
      searchBakery: [],
      bandFilter: '',
      regionFilter: [],
      opsFilter: []
    },
    recomputeTimelinessRanks(records) {
      records.forEach(record => this.ensureBands(record));
    },
    ensureBands(record) {
      record.acb = record.ac >= 90 ? 'Exceeding' : record.ac >= 75 ? 'Meeting' : 'Below Standard';
      return record;
    },
    markDataCoverage(record) {
      record.noData = false;
      return record;
    },
    hasScoredData(record) {
      return !record.noData;
    },
    getBakeryRegion(name) {
      return this.state.ALL.find(record => record.b === name).region;
    },
    getBakeryOps() {
      return 'Area';
    }
  };
  const context = vm.createContext({
    window: { GAILS },
    GAILS,
    document: { getElementById() { return { value: '0' }; } },
    Set
  });
  vm.runInContext(filtersSource, context);
  return GAILS;
}

test('company rank is fixed against the full selected-period cohort before filters', () => {
  const G = createRankingContext();
  G.state.regionFilter = ['South'];
  const filtered = G.getData();

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].b, 'Alpha');
  assert.equal(filtered[0].companyRank, 2);
  assert.equal(filtered[0].companyCohortSize, 3);
  assert.equal(filtered[0].companyTopPercent, 67);

  G.state.regionFilter = [];
  const all = G.getData();
  assert.deepEqual(Array.from(all, row => row.b), ['Bravo', 'Alpha', 'Charlie']);
  assert.deepEqual(Array.from(all, row => row.companyRank), [1, 2, 3]);
});

test('the product exposes one benchmark score plus comparison context', () => {
  assert.doesNotMatch(html, /id="globalIndexToggle"|data-global-index=|Peer Score Band/);
  assert.match(html, /<th>Rank<\/th>[\s\S]*?<th>Top %<\/th>/);
  assert.match(tables, /\? b\.companyRank\s*:/);
  assert.match(charts, /Company rank:/);
  assert.doesNotMatch(app, /state\.(?:indexType|rankingsMetric|targetMetric)/);
});

test('the benchmark KPI names the Meeting score as its target', () => {
  assert.match(app, /var BENCHMARK_MEETING_SCORE = 75;/);
  assert.equal((app.match(/meta: 'Target: ' \+ BENCHMARK_MEETING_SCORE/g) || []).length, 2);
  assert.doesNotMatch(app, /vs company benchmark/);
});

test('the benchmark KPI explains the score in plain language', () => {
  assert.match(app, /<details class="kpi-info">/);
  assert.match(app, /aria-label="How the Benchmark Score is calculated"/);
  assert.match(app, /Six results make one score out of 100/);
  assert.match(app, /Drink quality[\s\S]*Customer-rated efficiency[\s\S]*Friendliness[\s\S]*Drink \+ Meal NPS[\s\S]*Coffee efficiency[\s\S]*Average wait time/);
  assert.match(app, /G\.CEI_WEIGHTS\[part\.weightKey\]/);
  assert.match(app, /Points earned/);
  assert.match(app, /benchmarkComponentScore\(record, part\.weightKey\) \* weight/);
  assert.match(app, /publishedScore - rawScore/);
  assert.match(app, /Volume adjustment/);
  assert.match(app, /kpi-info__total[\s\S]*?<span>Score<\/span>/);
  assert.match(app, /benchmarkScoreInfoHtml\(scoredData, acei\)/);
  assert.doesNotMatch(app, /Your points/i);
  assert.match(app, /data-benchmark-methodology/);
  assert.match(app, /activateDashboardTab\('cei'\)/);
  assert.match(app, /floatingDisclosureSelector = '\.focus-method--overlay, \.kpi-info'/);
  assert.match(app, /activateDashboardHashTarget[\s\S]*?dashboard-footer__link\[data-footer-tab=/);
  assert.match(styles, /\.kpi-info summary\s*\{[\s\S]*?width: 20px;[\s\S]*?height: 20px;/);
  assert.match(styles, /\.kpi-info summary::marker\s*\{\s*content: '';/);
  assert.match(styles, /\.kpi-info__panel\s*\{[\s\S]*?position: absolute;[\s\S]*?width: min\(330px, calc\(100vw - 32px\)\)/);
  assert.match(styles, /\.kpi-info__columns,[\s\S]*?\.kpi-info__weights li\s*\{[\s\S]*?display: grid;/);
  assert.doesNotMatch(app, /<table class="kpi-info__breakdown">/);
  assert.match(styles, /\.kpi\.kpi-blue \.kpi__status\s*\{\s*background:/);
  assert.doesNotMatch(styles, /\.kpi\.kpi-blue \.kpi__status\s*\{[^}]*\.kpi--has-info/);
});

test('the benchmark KPI breakdown shows weighted points and reconciles adjustments', () => {
  const start = app.indexOf('var BENCHMARK_MEETING_SCORE');
  const end = app.indexOf('function formatSelectedPeriod', start);
  const source = app.slice(start, end);
  const G = {
    CEI_WEIGHTS: { nps: 0.15, ef: 0.25, dr: 0.25, fr: 0.25, time: 0.05, at: 0.05 },
    BENCHMARKS: { nps: 55, ef: 90, dr: 90, fr: 90, at: 120 },
    BENCHMARK_FLOORS: { nps: 45, ef: 80, dr: 80, fr: 80, at: 125 },
    computeAbsoluteComponent(value, benchmark, floor) {
      if (value >= benchmark) return 100;
      if (value <= floor) return 0;
      return ((value - floor) / (benchmark - floor)) * 100;
    },
    computeAbsoluteWaitComponent(seconds) {
      if (seconds <= 120) return 100;
      if (seconds >= 125) return 0;
      return ((125 - seconds) / 5) * 100;
    },
    computeCoffeeEfficiencyComponent() {
      throw new Error('stored coffee-efficiency component should be used');
    }
  };
  const { benchmarkScoreInfoHtml } = vm.runInNewContext(
    `(function () { ${source}; return { benchmarkScoreInfoHtml }; }())`,
    { G, Array, Math, isNaN }
  );
  const record = {
    n: 50,
    dr: 88,
    ef: 85,
    fr: 92,
    ats: 81.8,
    a_at: 60
  };

  const rawHtml = benchmarkScoreInfoHtml([record], 72.1);
  assert.match(rawHtml, /Drink quality[\s\S]*?Weight 25%[\s\S]*?Points earned 20\.0/);
  assert.match(rawHtml, /Customer-rated efficiency[\s\S]*?Weight 25%[\s\S]*?Points earned 12\.5/);
  assert.match(rawHtml, /Friendliness[\s\S]*?Weight 25%[\s\S]*?Points earned 25\.0/);
  assert.match(rawHtml, /Drink \+ Meal NPS[\s\S]*?Weight 15%[\s\S]*?Points earned 7\.5/);
  assert.match(rawHtml, /Coffee efficiency[\s\S]*?Weight 5%[\s\S]*?Points earned 4\.1/);
  assert.match(rawHtml, /Average wait time[\s\S]*?Weight 5%[\s\S]*?Points earned 3\.0/);
  assert.match(rawHtml, /kpi-info__points[^>]*>20\.0<\/span>/);
  assert.doesNotMatch(rawHtml, /<strong class="kpi-info__points"/);
  assert.match(rawHtml, /kpi-info__total[\s\S]*?<span>Score<\/span>[\s\S]*?72\.1/);
  assert.doesNotMatch(rawHtml, /Published score/);
  assert.doesNotMatch(rawHtml, /Volume adjustment/);

  const adjustedHtml = benchmarkScoreInfoHtml([record], 70);
  assert.match(adjustedHtml, /kpi-info__adjustment[\s\S]*?Volume adjustment[\s\S]*?-2\.1/);
  assert.match(adjustedHtml, /kpi-info__total[\s\S]*?<span>Score<\/span>[\s\S]*?70\.0/);
});
