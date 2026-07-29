const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const filtersSource = fs.readFileSync(path.join(root, 'js', 'filters.js'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');

// A multi-month refresh reads state.ALL directly instead of copying every record
// first — that copy was the most expensive step of a refresh. The tests below
// pin the invariant that makes it safe: nothing on the aggregation path may
// write to a stored record. If that ever stops holding, the dashboard would
// quietly corrupt the dataset it was handed rather than just run slower.

const METRICS = ['n', 's2', 's3', 'o5', 'ov', 'fr', 'dr', 'ef', 'ep', 'dp', 'fp',
  'np', 'c', 's2w', 'ac', 'ats', 'c_raw', 'ac_raw', 's4', 'a_at', 's30', 'at',
  'at12', 'at9', 'nc', 'nm', 'nd', 'na', 'td', 'vc', 'vf', 'va'];

function record(bakery, month, score) {
  const row = { b: bakery, m: month, v: 20, co: 'High', noData: false };
  METRICS.forEach((key) => { row[key] = score; });
  return row;
}

function context(months) {
  const GAILS = {
    state: {
      ALL: [
        record('Alpha', 'Apr 26', 80), record('Alpha', 'May 26', 60), record('Alpha', 'Jun 26', 40),
        record('Bravo', 'Apr 26', 20), record('Bravo', 'May 26', 30), record('Bravo', 'Jun 26', 70)
      ],
      MONTHS: ['Apr 26', 'May 26', 'Jun 26'],
      selectedMonths: months,
      searchBakery: [], bandFilter: '', regionFilter: [], opsFilter: []
    },
    getBakeryRegion() { return 'Region'; },
    getBakeryOps() { return 'Area'; },
    hasScoredData(row) { return !row.noData; },
    markDataCoverage(row) { row.noData = !!row.incompletePeriod; row.co = 'High'; return row; },
    ensureBands(row) { row.acb = row.ac >= 50 ? 'Exceeding' : 'Below Standard'; row.cb = row.acb; return row; },
    recomputeTimelinessRanks() {}
  };
  const ctx = vm.createContext({
    window: { GAILS }, GAILS, Object, Set,
    document: { getElementById() { return { value: '0' }; } }
  });
  vm.runInContext(filtersSource, ctx);
  return GAILS;
}

test('a multi-month refresh leaves the stored records untouched', () => {
  const G = context(['Apr 26', 'May 26', 'Jun 26']);
  const before = JSON.stringify(G.state.ALL);

  G.getData();
  G.getAvailableBands();
  G.getData();

  assert.equal(JSON.stringify(G.state.ALL), before);
});

test('a single-month refresh also leaves the stored records untouched', () => {
  // This path does stamp bands onto the rows it returns, so it still has to
  // hand back copies rather than the stored records themselves.
  const G = context(['Jun 26']);
  const before = JSON.stringify(G.state.ALL);

  const rows = G.getData();
  assert.ok(rows.length);
  assert.ok(rows.every((row) => !G.state.ALL.includes(row)), 'returned a stored record, not a copy');
  assert.equal(JSON.stringify(G.state.ALL), before);
});

test('period aggregates average across the selected months', () => {
  const G = context(['Apr 26', 'May 26', 'Jun 26']);
  const rows = G.getData();
  const alpha = rows.find((row) => row.b === 'Alpha');
  const bravo = rows.find((row) => row.b === 'Bravo');

  assert.equal(alpha.ac, 60);                 // (80 + 60 + 40) / 3
  assert.equal(bravo.ac, 40);                 // (20 + 30 + 70) / 3
  assert.equal(alpha.td, 180);                // summed, not averaged
  assert.equal(alpha.v, 60);                  // volume is a period total
  assert.equal(alpha.monthsCovered, 3);
  assert.equal(alpha.incompletePeriod, false);
});

test('a bakery missing months is marked incomplete against the months present', () => {
  const G = context(['Apr 26', 'May 26', 'Jun 26']);
  G.state.ALL = G.state.ALL.filter((row) => !(row.b === 'Bravo' && row.m !== 'Jun 26'));

  const bravo = G.getData().find((row) => row.b === 'Bravo');
  assert.equal(bravo.monthsCovered, 1);
  assert.equal(bravo.monthsExpected, 3);
  assert.equal(bravo.incompletePeriod, true);
});

test('resolving a bakery name is cached but re-resolves after the directory changes', () => {
  const ctx = vm.createContext({ window: {}, console, Object, Set });
  vm.runInContext(configSource, ctx);
  const G = ctx.window.GAILS;

  // Aliases collapse to the same canonical key, and repeat lookups must keep
  // agreeing with a cold one.
  const cold = G.resolveBakeryMetaKey("GAIL's Bakery Blackfriars");
  assert.equal(G.resolveBakeryMetaKey("GAIL's Bakery Blackfriars"), cold);
  assert.equal(G.resolveBakeryMetaKey('Black Friars'), 'Blackfriars');

  // A name only the new directory knows about must resolve once it is loaded,
  // rather than being pinned to the miss cached beforehand.
  const unknown = 'Totally New Site';
  assert.equal(G.resolveBakeryMetaKey(unknown), unknown);
  G.setBakeryMeta(Object.assign({}, G.DEFAULT_BAKERY_META, {
    [unknown]: { r: 'London Region', o: 'Someone', ll: [51.5, -0.1] }
  }));
  assert.equal(G.getBakeryRegion(unknown), 'London Region');
  assert.equal(G.getBakeryRegion("GAIL's " + unknown), 'London Region');
});
