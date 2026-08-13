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
    // Real G.avg (js/utils.js) — used both by buildGroupAggregate and by
    // these tests, so a test's expectation is computed the exact same way
    // production computes the Overview KPI it must agree with.
    avg(arr, k) {
      const vs = (arr || [])
        .map((r) => (r ? r[k] : undefined))
        .filter((v) => typeof v === 'number' && !isNaN(v));
      return vs.length ? vs.reduce((a, v) => a + v, 0) / vs.length : 0;
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

test('getGroupedViewData rolls bakeries up to plain-average ops-area rows', () => {
  const G = createGroupingContext();
  const rows = G.getGroupedViewData('ops').sort((a, b) => a.b.localeCompare(b.b));

  assert.equal(rows.length, 3);

  const northA = rows.find((r) => r.b === 'North Ops A');
  assert.equal(northA.isGroup, true);
  assert.equal(northA.groupType, 'ops');
  assert.equal(northA.region, 'North');
  assert.equal(northA.memberCount, 2);
  assert.equal(northA.v, 40); // 10 + 30, still summed
  assert.equal(northA.ac, 85); // (80 + 90) / 2 — plain mean, not weighted by v
  assert.equal(northA.n, 60); // (50 + 70) / 2
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

test('getGroupedViewData rolls bakeries up to plain-average region rows', () => {
  const G = createGroupingContext();
  const rows = G.getGroupedViewData('region').sort((a, b) => a.b.localeCompare(b.b));

  assert.equal(rows.length, 2);

  const north = rows.find((r) => r.b === 'North');
  assert.equal(north.groupType, 'region');
  assert.equal(north.memberCount, 3);
  assert.equal(north.v, 45); // 10 + 30 + 5, still summed
  assert.equal(north.ac, 76.7); // (80 + 90 + 60) / 3, rounded to 1dp
  assert.equal(north.n, 53.3); // (50 + 70 + 40) / 3, rounded to 1dp

  const south = rows.find((r) => r.b === 'South');
  assert.equal(south.memberCount, 1);
  assert.equal(south.v, 15);
  assert.equal(south.ac, 70);
});

test('a group\'s score matches the same G.avg an Overview KPI would show for its bakeries', () => {
  // This is the exact bug report: switching View to Ops Areas read a higher
  // Benchmark Score than filtering Bakery view down to that same ops area.
  // The two have to agree, since a user reasonably expects them to be two
  // views of the same number, not two different formulas.
  const G = createGroupingContext();
  const northAMembers = G.state.ALL.filter((r) => r.b === 'Alpha' || r.b === 'Bravo');
  const overviewKpiWouldShow = Math.round(G.avg(northAMembers, 'ac')); // KPI rounds for display
  const northA = G.getGroupedViewData('ops').find((r) => r.b === 'North Ops A');
  assert.equal(Math.round(northA.ac), overviewKpiWouldShow);
});

test('grouped rows are ranked against the group cohort, not the bakery cohort', () => {
  const G = createGroupingContext();
  const rows = G.getGroupedViewData('ops');
  assert.equal(rows[0].companyCohortSize, 3); // 3 ops areas, not 4 bakeries
  const ranks = rows.map((r) => r.companyRank).sort();
  assert.equal(ranks.join(','), '1,2,3');
});

test('Benchmark Band filters the groups\' own aggregate, not the bakeries under them', () => {
  const G = createGroupingContext();
  G.state.bandFilter = 'abs:Exceeding';
  const rows = G.getGroupedViewData('ops');
  // North Ops A's real average, (Alpha 80 + Bravo 90) / 2 = 85, is Meeting —
  // not Exceeding, even though Bravo alone is. Filtering the bakeries first
  // (the old, buggy behaviour) would have built North Ops A from Bravo alone
  // and shown it as Exceeding; no ops area's own aggregate actually reaches
  // Exceeding, so none should be returned.
  assert.equal(rows.length, 0);
});

test('Benchmark Band still returns groups whose own aggregate matches', () => {
  const G = createGroupingContext();
  G.state.bandFilter = 'abs:Approaching';
  const names = G.getGroupedViewData('ops').map((r) => r.b).sort();
  // North Ops B (Charlie, 60) and South Ops (Delta, 70) land in Approaching
  // on their own aggregate; North Ops A (85, Meeting) does not.
  assert.equal(names.join(','), 'North Ops B,South Ops');
});

test('getGroupedAvailableBands reflects the groups\' own bands, not their bakeries\'', () => {
  const G = createGroupingContext();
  const available = G.getGroupedAvailableBands('ops');
  // No ops area's own aggregate reaches Exceeding, even though Bravo alone
  // does, so it must not be offered as a selectable option here — matching
  // getGroupedViewData actually returning nothing for it above.
  assert.equal(available.absolute.has('Exceeding'), false);
  assert.equal(available.absolute.has('Meeting'), true);
  assert.equal(available.absolute.has('Approaching'), true);
});
