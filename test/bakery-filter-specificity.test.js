const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Picking "Hampstead" in the bakery filter used to select every site whose name
// merely contains it — Hampstead Heath and West Hampstead came along for the
// ride, so the whole dashboard reported on three bakeries when one was chosen.
// The filter is a pick-list of whole site names, so a selection identifies
// exactly the site that was ticked.

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

const METRICS = ['n', 's2', 's3', 's4', 'o5', 'ov', 'fr', 'dr', 'ef', 'ep', 'dp',
  'fp', 'np', 'c', 's2w', 'ac', 'ats', 'a_at', 'c_raw', 'ac_raw', 's30', 'at',
  'at12', 'at9', 'nc', 'nm', 'nd', 'na'];

function record(bakery, month, score) {
  const row = { b: bakery, m: month, v: 40, td: 100, vc: 10, vf: 2, va: 30 };
  METRICS.forEach((key) => { row[key] = score; });
  return row;
}

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

// Three real-world overlapping names: one is a strict prefix of the second and
// a suffix of the third, so a substring test matches all three either way.
const SCORES = { 'Hampstead': 55, 'Hampstead Heath': 70, 'West Hampstead': 95 };

function seed(G) {
  const rows = [];
  Object.keys(SCORES).forEach((bakery) => {
    MONTHS.forEach((month) => rows.push(record(bakery, month, SCORES[bakery])));
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

// Arrays built inside the vm carry that realm's Array prototype, so rebuild the
// list here to keep comparisons about the names.
function names(rows) {
  return Array.from(rows, (row) => row.b).sort();
}

test('a bakery selection matches only its own site', () => {
  const G = loadDashboard();

  assert.equal(G.isSelectedBakery('Hampstead', ['Hampstead']), true);
  assert.equal(G.isSelectedBakery('Hampstead Heath', ['Hampstead']), false);
  assert.equal(G.isSelectedBakery('West Hampstead', ['Hampstead']), false);

  // Several ticked sites still each match themselves and nothing else.
  assert.equal(G.isSelectedBakery('West Hampstead', ['Hampstead', 'West Hampstead']), true);
  assert.equal(G.isSelectedBakery('Hampstead Heath', ['Hampstead', 'West Hampstead']), false);

  // An empty selection is "All Bakeries", and casing or stray whitespace in a
  // stored selection still resolves to the site it names.
  assert.equal(G.isSelectedBakery('Hampstead Heath', []), true);
  assert.equal(G.isSelectedBakery('Hampstead Heath', ['  hampstead heath ']), true);
});

test('the dashboard dataset narrows to the selected bakery alone', () => {
  const G = loadDashboard();
  seed(G);

  assert.deepEqual(names(G.getData()), ['Hampstead', 'Hampstead Heath', 'West Hampstead']);

  G.state.searchBakery = ['Hampstead'];
  G.invalidateCompanyPeriodData();
  assert.deepEqual(names(G.getData()), ['Hampstead']);

  G.state.searchBakery = ['Hampstead Heath'];
  G.invalidateCompanyPeriodData();
  assert.deepEqual(names(G.getData()), ['Hampstead Heath']);

  G.state.searchBakery = ['Hampstead', 'West Hampstead'];
  G.invalidateCompanyPeriodData();
  assert.deepEqual(names(G.getData()), ['Hampstead', 'West Hampstead']);
});

test('the focus dataset narrows to the selected bakery alone', () => {
  const G = loadDashboard();
  seed(G);

  G.state.searchBakery = ['Hampstead'];
  G.invalidateFocusDataset();
  const narrowed = G.buildFocusDataset({ isAbsolute: true, referenceDate: NOW });
  assert.deepEqual(names(narrowed.data), ['Hampstead']);
});
