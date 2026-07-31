const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// A refresh used to rebuild the same two datasets two or three times over, and
// the map's visit filter re-scanned every routine visit once per bakery. Those
// results are now cached and indexed, which is only safe while the caches
// notice everything that can change the answer.
//
// These tests pin the two halves of that bargain: the cached answer must equal
// the uncached one, and every input that changes it must invalidate it.

const root = path.resolve(__dirname, '..');
const FILES = ['js/state.js', 'js/utils.js', 'js/config.js', 'js/cei.js',
  'js/support-score.js', 'js/focus-data.js', 'js/filters.js'];

function elementStub() {
  return {
    value: '0', style: {}, children: [], innerHTML: '', textContent: '',
    classList: { contains: () => false, toggle() {}, add() {}, remove() {} },
    appendChild() {}, addEventListener() {},
    querySelector: () => null, querySelectorAll: () => []
  };
}

// The dashboard's real modules, loaded in order into one namespace, the way the
// <script> tags in index.html load them.
function loadDashboard() {
  const context = {
    console, Set, Map, Object, Date, Array, JSON, Math, String, Number,
    isNaN, parseInt, parseFloat, setTimeout, clearTimeout,
    document: {
      getElementById: () => elementStub(),
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: () => elementStub(),
      addEventListener() {},
      readyState: 'complete',
      head: { appendChild() {} },
      currentScript: null
    },
    requestAnimationFrame: (fn) => fn(),
    addEventListener() {}
  };
  context.window = context;
  vm.createContext(context);
  for (const file of FILES) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return context.window.GAILS;
}

// Arrays built inside the vm carry that realm's Array prototype, which
// deepEqual treats as a difference. Rebuilding the list here keeps comparisons
// about the names rather than which realm made the array.
function names(rows) {
  return Array.from(rows, (row) => row.b);
}

const METRICS = ['n', 's2', 's3', 's4', 'o5', 'ov', 'fr', 'dr', 'ef', 'ep', 'dp',
  'fp', 'np', 'c', 's2w', 'ac', 'ats', 'a_at', 'c_raw', 'ac_raw', 's30', 'at',
  'at12', 'at9', 'nc', 'nm', 'nd', 'na'];

function record(bakery, month, score) {
  const row = { b: bakery, m: month, v: 40, td: 100, vc: 10, vf: 2, va: 30 };
  METRICS.forEach((key) => { row[key] = score; });
  return row;
}

// Six closed months ending the month before `now`, so every bakery below clears
// the Focus eligibility floor.
function closedMonths(now, count) {
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentKey = now.getFullYear() * 12 + now.getMonth();
  const months = [];
  for (let age = count; age >= 1; age--) {
    const key = currentKey - age;
    const year = Math.floor(key / 12);
    months.push(SHORT[key - year * 12] + ' ' + String(year).slice(-2));
  }
  return months;
}

const NOW = new Date('2026-07-15T00:00:00Z');
const MONTHS = closedMonths(NOW, 8);

// Two bakeries that sit in different benchmark bands, and one that sits in a
// third, so band filtering has something to distinguish.
function seed(G, options = {}) {
  const scores = options.scores || { Balham: 55, Barnes: 70, Putney: 95 };
  const rows = [];
  Object.keys(scores).forEach((bakery) => {
    MONTHS.forEach((month) => rows.push(record(bakery, month, scores[bakery])));
  });
  rows.forEach(G.ensureBands);
  G.state.ALL = rows;
  G.state.MONTHS = MONTHS.slice();
  G.state.selectedMonths = MONTHS.slice();
  G.state.regionFilter = [];
  G.state.opsFilter = [];
  G.state.searchBakery = [];
  G.state.bandFilter = '';
  G.invalidateCompanyPeriodData();
  G.invalidateFocusDataset();
  return rows;
}

// ---------------------------------------------------------------- percentiles

test('the percentile index returns exactly what the per-call sort returned', () => {
  const G = loadDashboard();
  // The behaviour being preserved, written out plainly: sort a copy, then take
  // the midpoint of the run the value occupies.
  const reference = (values, value, invert) => {
    const sorted = [...values].sort((a, b) => (invert ? b - a : a - b));
    if (sorted.length <= 1) return 50;
    return (((sorted.indexOf(value) + sorted.lastIndexOf(value)) / 2) / (sorted.length - 1)) * 100;
  };

  const cohorts = [
    [],
    [7],
    [1, 2, 3, 4, 5],
    [5, 5, 5, 1, 9],            // ties take the midpoint of their run
    [3, 1, 2],
    [0, -0, 4],
    [10, 20, 30, 40]
  ];
  for (const cohort of cohorts) {
    for (const invert of [false, true]) {
      const lookup = G.buildPercentileIndex(cohort, invert);
      // Values in the cohort, plus one that is not in it and a NaN — both of
      // which the old indexOf pair reported as -1.
      for (const value of cohort.concat([99, NaN])) {
        assert.equal(lookup(value), reference(cohort, value, invert),
          `cohort ${JSON.stringify(cohort)} value ${String(value)} invert=${invert}`);
      }
    }
  }
});

test('percentileRank still works on its own', () => {
  const G = loadDashboard();
  assert.equal(G.percentileRank([1, 2, 3], 3, false), 100);
  assert.equal(G.percentileRank([1, 2, 3], 1, false), 0);
  assert.equal(G.percentileRank([1, 2, 3], 3, true), 0);
  assert.equal(G.percentileRank([5], 5, false), 50);
});

test('monthSortKey orders months correctly whether or not it has seen them', () => {
  const G = loadDashboard();
  assert.ok(G.monthSortKey('Dec 25') < G.monthSortKey('Jan 26'));
  assert.ok(G.monthSortKey('Jan 26') < G.monthSortKey('Feb 26'));
  // Second time round comes from the cache; it must still agree.
  assert.equal(G.monthSortKey('Dec 25'), G.monthSortKey('Dec 25'));
  assert.equal(G.monthSortKey('Jan 26') - G.monthSortKey('Dec 25'), 1);
});

// ------------------------------------------------------------- visit indexing

test('the visit index answers what the per-bakery scan answered', () => {
  const G = loadDashboard();
  const [first, second] = MONTHS.slice(-2);
  const iso = (month) => {
    const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const [name, year] = month.split(' ');
    return '20' + year + '-' + String(SHORT.indexOf(name) + 1).padStart(2, '0') + '-15';
  };

  G._allVisitsObj = {
    a: { bakery: 'Balham', date: iso(first) },
    b: { bakery: 'Barnes', date: iso(second) },
    c: { bakery: 'Putney' },                    // no date — never counts
    d: { date: iso(first) }                     // no bakery — never counts
  };

  assert.equal(G.isBakeryVisitedInPeriod('Balham', [first]), true);
  assert.equal(G.isBakeryVisitedInPeriod('Balham', [second]), false);
  assert.equal(G.isBakeryVisitedInPeriod('Barnes', [first, second]), true);
  assert.equal(G.isBakeryVisitedInPeriod('Putney', [first, second]), false);
  // An empty month list asks "visited at all", not "visited in nothing".
  assert.equal(G.isBakeryVisitedInPeriod('Balham', []), true);
  assert.equal(G.isBakeryVisitedInPeriod('Putney', []), false);
  assert.equal(G.isBakeryVisitedInPeriod('Nowhere At All', []), false);
});

test('a visit logged under an alias counts for the bakery it resolves to', () => {
  const G = loadDashboard();
  const month = MONTHS[MONTHS.length - 1];
  const [name, year] = month.split(' ');
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = '20' + year + '-' + String(SHORT.indexOf(name) + 1).padStart(2, '0') + '-02';

  // "Union Bath" is an alias of the "Union Street, Bath" directory entry.
  G._allVisitsObj = { a: { bakery: 'Union Bath', date } };
  assert.equal(G.isBakeryVisitedInPeriod('Union Street, Bath', [month]), true);
});

test('replacing the visits object is picked up', () => {
  const G = loadDashboard();
  const month = MONTHS[MONTHS.length - 1];
  const [name, year] = month.split(' ');
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = '20' + year + '-' + String(SHORT.indexOf(name) + 1).padStart(2, '0') + '-02';

  G._allVisitsObj = {};
  assert.equal(G.isBakeryVisitedInPeriod('Balham', [month]), false);

  // What a fresh Firebase snapshot does.
  G._allVisitsObj = { a: { bakery: 'Balham', date } };
  assert.equal(G.isBakeryVisitedInPeriod('Balham', [month]), true);

  G._allVisitsObj = {};
  assert.equal(G.isBakeryVisitedInPeriod('Balham', [month]), false);
});

test('a bakery directory change re-resolves indexed visits', () => {
  const G = loadDashboard();
  const month = MONTHS[MONTHS.length - 1];
  const [name, year] = month.split(' ');
  const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = '20' + year + '-' + String(SHORT.indexOf(name) + 1).padStart(2, '0') + '-02';

  G._allVisitsObj = { a: { bakery: 'Balham Renamed', date } };
  // Nothing resolves that name yet, so it indexes under itself.
  assert.equal(G.isBakeryVisitedInPeriod('Balham', [month]), false);

  // Now the directory names it, and the same visits must resolve to it.
  G.setBakeryMeta(Object.assign({}, G.DEFAULT_BAKERY_META, {
    'Balham Renamed': { r: 'South Region', o: 'Safa Aden', ll: [51.4437, -0.1536] }
  }));
  assert.equal(G.isBakeryVisitedInPeriod('Balham Renamed', [month]), true);
});

// ------------------------------------------------------------- focus datasets

test('the focus dataset is the band filter applied to its own snapshots', () => {
  const G = loadDashboard();
  seed(G);

  const unfiltered = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.ok(unfiltered.allSnapshots.length >= 2, 'expected eligible bakeries');
  assert.deepEqual(names(unfiltered.data), names(unfiltered.allSnapshots));

  const band = unfiltered.allSnapshots[0].acb;
  G.state.bandFilter = 'abs:' + band;
  const filtered = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });

  assert.deepEqual(
    names(filtered.data),
    names(unfiltered.allSnapshots.filter((row) => row.acb === band))
  );
  // The band filter narrows the view, never the underlying set.
  assert.equal(filtered.allSnapshots.length, unfiltered.allSnapshots.length);
});

test('getFocusAvailableBands and a filtered render see the same snapshots', () => {
  const G = loadDashboard();
  seed(G);
  G.state.bandFilter = 'abs:Below Standard';

  // This is the pair a refresh on the Focus tab makes, in order.
  const available = G.getFocusAvailableBands();
  const rendered = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });

  // Every band the picker offers is a band some snapshot actually has, and the
  // filtered render is a subset of those same snapshots.
  const bands = new Set(rendered.allSnapshots.map((row) => row.acb));
  assert.deepEqual(Array.from(available.absolute).sort(), Array.from(bands).sort());
  rendered.data.forEach((row) => {
    assert.ok(rendered.allSnapshots.includes(row));
    assert.equal(row.acb, 'Below Standard');
  });
});

test('a bakery filter change rebuilds the focus dataset', () => {
  const G = loadDashboard();
  seed(G);

  const all = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.ok(all.data.length > 1);

  G.state.searchBakery = ['Balham'];
  const narrowed = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.deepEqual(names(narrowed.data), ['Balham']);

  G.state.searchBakery = [];
  const widened = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.deepEqual(names(widened.data), names(all.data));
});

test('a new dataset rebuilds the focus dataset', () => {
  const G = loadDashboard();
  seed(G);
  const before = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.ok(before.data.some((row) => row.b === 'Putney'));

  seed(G, { scores: { Balham: 55, Barnes: 70 } });
  const after = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.ok(!after.data.some((row) => row.b === 'Putney'));
});

test('each focus caller gets its own list to sort', () => {
  const G = loadDashboard();
  seed(G);

  const first = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  const second = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.notEqual(first.data, second.data, 'callers share one array they may reorder');

  first.data.reverse();
  const third = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.deepEqual(names(third.data), names(second.data));
});

// ---------------------------------------------------------- company aggregate

test('the two aggregate readers in a refresh agree with each other', () => {
  const G = loadDashboard();
  seed(G);

  // updateBandFilterOptions() then getData(), the order refresh() uses.
  const bands = G.getAvailableBands();
  const rows = G.getData();

  const rendered = new Set(rows.map((row) => row.acb));
  rendered.forEach((band) => assert.ok(bands.absolute.has(band), `missing band ${band}`));
});

test('a period change rebuilds the company aggregate', () => {
  const G = loadDashboard();
  seed(G);

  const wide = G.getData().find((row) => row.b === 'Balham');
  assert.equal(wide.monthsCovered, MONTHS.length);

  G.state.selectedMonths = MONTHS.slice(-2);
  const narrow = G.getData().find((row) => row.b === 'Balham');
  assert.equal(narrow.monthsCovered, 2);

  G.state.selectedMonths = MONTHS.slice();
  const wideAgain = G.getData().find((row) => row.b === 'Balham');
  assert.equal(wideAgain.monthsCovered, MONTHS.length);
});

test('a new dataset rebuilds the company aggregate', () => {
  const G = loadDashboard();
  seed(G);
  assert.ok(G.getData().some((row) => row.b === 'Putney'));

  seed(G, { scores: { Balham: 55, Barnes: 70 } });
  assert.ok(!G.getData().some((row) => row.b === 'Putney'));
});

test('each aggregate caller gets its own list to sort', () => {
  const G = loadDashboard();
  seed(G);

  const first = G.getCompanyPeriodData();
  const second = G.getCompanyPeriodData();
  assert.notEqual(first, second, 'callers share one array they may reorder');

  first.reverse();
  const third = G.getCompanyPeriodData();
  assert.deepEqual(names(third), names(second));
});

test('alternating callers with different datasets never see each other\'s snapshots', () => {
  const G = loadDashboard();
  seed(G);

  // My Activity asks for its own record set through a state object it builds
  // fresh each time, while the dashboard asks for state.ALL. Alternating
  // between them must give each its own answer every time.
  const mine = G.state.ALL.filter((row) => row.b === 'Barnes');
  const activityOptions = () => ({
    records: mine,
    referenceDate: NOW,
    isAbsolute: true,
    ignoreBandFilter: true,
    state: { regionFilter: [], opsFilter: [], searchBakery: [], bandFilter: '' }
  });

  for (let i = 0; i < 3; i++) {
    assert.deepEqual(names(G.buildFocusDataset(activityOptions()).data), ['Barnes']);
    assert.deepEqual(
      names(G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW }).data),
      ['Balham', 'Barnes', 'Putney']
    );
  }
});

test('a different state object with the same filters is still the same question', () => {
  const G = loadDashboard();
  seed(G);
  const options = () => ({
    records: G.state.ALL,
    referenceDate: NOW,
    isAbsolute: true,
    state: { regionFilter: [], opsFilter: [], searchBakery: ['Barnes'], bandFilter: '' }
  });

  assert.deepEqual(names(G.buildFocusDataset(options()).data), ['Barnes']);
  assert.deepEqual(names(G.buildFocusDataset(options()).data), ['Barnes']);
});
