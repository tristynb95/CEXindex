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
