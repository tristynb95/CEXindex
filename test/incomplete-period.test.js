const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const filtersSource = fs.readFileSync(path.join(root, 'js', 'filters.js'), 'utf8');
const tablesSource = fs.readFileSync(path.join(root, 'js', 'tables.js'), 'utf8');

function monthlyRecord(bakery, month, score) {
  const record = {
    b: bakery, m: month, c: score, ac: score, n: score, v: 10,
    s2: score, s3: score, s4: score, o5: score, ov: score,
    fr: score, dr: score, ef: score, ep: score, dp: score,
    fp: score, np: score, s2w: score, ats: score, a_at: score,
    c_raw: score, ac_raw: score, s30: score, td: 10, at: score,
    at12: score, at9: score, nc: score, nm: score, nd: score,
    vc: 10, vf: 0, na: score, va: 10, noData: false
  };
  return record;
}

test('keeps incomplete company results visible but unranked below complete bakeries', () => {
  const records = [
    monthlyRecord('Complete Bakery', 'Apr 26', 20),
    monthlyRecord('Complete Bakery', 'May 26', 20),
    monthlyRecord('Complete Bakery', 'Jun 26', 20),
    monthlyRecord('Skewed Bakery', 'Jun 26', 99)
  ];
  const GAILS = {
    state: {
      ALL: records,
      selectedMonths: ['Apr 26', 'May 26', 'Jun 26'],
      MONTHS: ['Apr 26', 'May 26', 'Jun 26'],
      regionFilter: [], opsFilter: [], searchBakery: [], bandFilter: ''
    },
    getBakeryRegion() { return 'Region'; },
    getBakeryOps() { return 'Area'; },
    hasScoredData(record) { return !record.noData; },
    markDataCoverage(record) {
      record.noData = !!record.incompletePeriod;
      record.co = record.incompletePeriod ? 'Incomplete' : 'High';
    },
    ensureBands(record) {
      record.cb = record.incompletePeriod ? 'Incomplete' : 'Low Performance';
      record.acb = record.incompletePeriod ? 'Incomplete' : 'Below Standard';
    },
    recomputeTimelinessRanks() {}
  };
  const context = { window: { GAILS }, GAILS, document: {}, console, Object, Set };
  vm.createContext(context);
  vm.runInContext(filtersSource, context);

  const result = GAILS.getData();
  assert.deepEqual(Array.from(result, (record) => record.b), ['Complete Bakery', 'Skewed Bakery']);
  assert.equal(result[0].cr, 1);
  assert.equal(result[1].cb, 'Incomplete');
  assert.equal(result[1].cr, null);
  assert.equal(result[1].noData, true);
  assert.match(tablesSource, /data-rank-eligible/);
  assert.match(tablesSource, /aRankable !== bRankable/);
});
