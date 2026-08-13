const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const filtersSource = fs.readFileSync(path.join(root, 'js', 'filters.js'), 'utf8');

// Four bakeries across two ops areas and two regions, so ops-level and
// region-level grouping produce genuinely different cohorts:
//   North Ops A: Alpha, Bravo   (region North)
//   North Ops B: Charlie        (region North)
//   South Ops:   Delta          (region South)
const BAKERY_META = {
  Alpha: { ops: 'North Ops A', region: 'North', ll: [10, 10] },
  Bravo: { ops: 'North Ops A', region: 'North', ll: [20, 20] },
  Charlie: { ops: 'North Ops B', region: 'North', ll: [30, 30] },
  Delta: { ops: 'South Ops', region: 'South', ll: [40, 40] }
};

function createGroupingContext() {
  const GAILS = {
    state: {
      ALL: [
        { b: 'Alpha', m: 'Jun 26', n: 50, ac: 80, v: 10 },
        { b: 'Bravo', m: 'Jun 26', n: 70, ac: 90, v: 30 },
        { b: 'Charlie', m: 'Jun 26', n: 40, ac: 60, v: 5 },
        { b: 'Delta', m: 'Jun 26', n: 60, ac: 70, v: 15 }
      ],
      MONTHS: ['Jun 26'],
      selectedMonths: ['Jun 26'],
      searchBakery: [],
      bandFilter: '',
      regionFilter: [],
      opsFilter: []
    },
    recomputeTimelinessRanks(records) {
      records.forEach((record) => this.ensureBands(record));
    },
    ensureBands(record) {
      record.acb = record.ac >= 90 ? 'Exceeding' : record.ac >= 75 ? 'Meeting' : record.ac >= 60 ? 'Approaching' : 'Below Standard';
      return record;
    },
    markDataCoverage(record) {
      record.noData = !!record.incompletePeriod;
      return record;
    },
    hasScoredData(record) {
      return !record.noData;
    },
    getBakeryRegion(name) {
      return (BAKERY_META[name] && BAKERY_META[name].region) || 'Unknown';
    },
    getBakeryOps(name) {
      return (BAKERY_META[name] && BAKERY_META[name].ops) || 'Unknown';
    },
    getBakeryMeta(name) {
      return BAKERY_META[name] ? { ll: BAKERY_META[name].ll } : null;
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

test('getGroupedViewData rolls bakeries up to volume-weighted ops-area rows', () => {
  const G = createGroupingContext();
  const rows = G.getGroupedViewData('ops').sort((a, b) => a.b.localeCompare(b.b));

  assert.equal(rows.length, 3);

  const northA = rows.find((r) => r.b === 'North Ops A');
  assert.equal(northA.isGroup, true);
  assert.equal(northA.groupType, 'ops');
  assert.equal(northA.region, 'North');
  assert.equal(northA.memberCount, 2);
  assert.equal(northA.v, 40); // 10 + 30, summed
  assert.equal(northA.ac, 87.5); // (80*10 + 90*30) / 40
  assert.equal(northA.n, 65); // (50*10 + 70*30) / 40
  // Cross-vm-realm arrays aren't assert.deepEqual-comparable, so check elements.
  assert.equal(northA.ll[0], 15); // centroid of [10,10] and [20,20]
  assert.equal(northA.ll[1], 15);

  const northB = rows.find((r) => r.b === 'North Ops B');
  assert.equal(northB.memberCount, 1);
  assert.equal(northB.ac, 60);
  assert.equal(northB.v, 5);

  const south = rows.find((r) => r.b === 'South Ops');
  assert.equal(south.memberCount, 1);
  assert.equal(south.ac, 70);
});

test('getGroupedViewData rolls bakeries up to volume-weighted region rows', () => {
  const G = createGroupingContext();
  const rows = G.getGroupedViewData('region').sort((a, b) => a.b.localeCompare(b.b));

  assert.equal(rows.length, 2);

  const north = rows.find((r) => r.b === 'North');
  assert.equal(north.groupType, 'region');
  assert.equal(north.memberCount, 3);
  assert.equal(north.v, 45); // 10 + 30 + 5
  assert.equal(north.ac, 84.4); // (80*10 + 90*30 + 60*5) / 45, rounded to 1dp
  assert.equal(north.n, 62.2); // (50*10 + 70*30 + 40*5) / 45, rounded to 1dp

  const south = rows.find((r) => r.b === 'South');
  assert.equal(south.memberCount, 1);
  assert.equal(south.v, 15);
  assert.equal(south.ac, 70);
});

test('a single large bakery is not diluted by several small ones in the same group', () => {
  // A plain (unweighted) mean of [80, 90, 60] would read 76.7 — this asserts
  // the actual result (87.5, weighted toward Bravo's 30-response volume) is
  // what a volume-weighted rollup is supposed to produce, not that mean.
  const G = createGroupingContext();
  const northA = G.getGroupedViewData('ops').find((r) => r.b === 'North Ops A');
  const naivePlainMean = (80 + 90) / 2;
  assert.notEqual(northA.ac, naivePlainMean);
  assert.equal(northA.ac, 87.5);
});

test('grouped rows are ranked against the group cohort, not the bakery cohort', () => {
  const G = createGroupingContext();
  const rows = G.getGroupedViewData('ops');
  assert.equal(rows[0].companyCohortSize, 3); // 3 ops areas, not 4 bakeries
  const ranks = rows.map((r) => r.companyRank).sort();
  assert.equal(ranks.join(','), '1,2,3');
});
