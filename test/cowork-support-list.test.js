const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildSupportList } = require(path.join(__dirname, '..', 'tools', 'cowork-snapshot', 'app-logic.js'));

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The last `count` closed months, oldest first, as dashboard month labels.
function closedMonths(count) {
  const now = new Date();
  const labels = [];
  for (let age = count; age >= 1; age--) {
    const d = new Date(now.getFullYear(), now.getMonth() - age, 1);
    labels.push(MONTHS[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2));
  }
  return labels;
}

function record(bakery, month, ac) {
  return { b: bakery, m: month, ac, c: ac, ac_raw: ac, c_raw: ac, n: 50, dr: 85, ef: 85, fr: 85, s2: 60, v: 20, co: 'High', noData: false };
}

function db(series) {
  const months = closedMonths(6);
  const records = [];
  Object.entries(series).forEach(([bakery, scores]) => {
    scores.forEach((ac, i) => records.push(record(bakery, months[i], ac)));
  });
  return {
    dashboardData: { records, months },
    portalData: {
      siteMeta: {
        entries: {
          Sliding: { o: 'Area One', r: 'London Region' },
          Steady: { o: 'Area One', r: 'London Region' },
          Close: { o: 'Area Two', r: 'South Region' }
        }
      }
    },
    routineVisits: {
      v1: { bakery: 'Close', date: new Date().toISOString().slice(0, 10) }
    }
  };
}

test('runs the dashboard support code over an export and applies its classifications', () => {
  const out = buildSupportList(db({
    Sliding: [70, 65, 60, 55, 45, 30],
    Steady: [88, 90, 91, 89, 92, 90],
    Close: [72, 73, 72, 74, 73, 72]
  }));

  const names = out.supportList.map((r) => r.bakery);
  assert.deepEqual(names, ['Sliding', 'Close'], 'Meeting bakeries stay off the list, highest support score first');

  const [sliding, close] = out.supportList;
  assert.equal(sliding.ceiBand, 'Below Standard');
  assert.equal(sliding.trend.direction, 'down');
  assert.equal(sliding.visitStatus, 'No visit recorded');
  assert.equal(sliding.scoreParts.visitCoverage, 10);
  assert.equal(
    sliding.supportScore,
    sliding.scoreParts.headroom + sliding.scoreParts.momentum + sliding.scoreParts.duration + sliding.scoreParts.visitCoverage
  );

  assert.equal(close.ceiBand, 'Approaching');
  assert.equal(close.visitStatus, 'Visited recently');
  assert.equal(close.nearlyThere, true);
  assert.equal(close.opsArea, 'Area Two');

  out.supportList.forEach((r) => {
    const expected = r.supportScore >= 60 ? 'High Priority' : r.supportScore >= 35 ? 'Medium Priority' : 'Monitor';
    assert.equal(r.priorityLevel, expected);
  });
  assert.equal(out.referenceMonth, closedMonths(1)[0]);
});

test('can run the dashboard as of an earlier day, seeing only visits logged by then', () => {
  const { loadApp } = require(path.join(__dirname, '..', 'tools', 'cowork-snapshot', 'app-logic.js'));
  const data = db({ Sliding: [70, 65, 60, 55, 45, 30], Steady: [88, 90, 91, 89, 92, 90], Close: [72, 73, 72, 74, 73, 72] });
  data.routineVisits.v1.date = '2026-01-15';
  const G = loadApp(data, new Date(2026, 0, 10));

  assert.equal(G.getLastVisitDate('Close'), null, 'a visit after the as-of date is not known yet');
  assert.equal(buildSupportList(data, G).referenceMonth, 'Dec 25');
});

test('rewrites the current month in the history and keeps earlier months', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { updateHistory, parseCsv } = require(path.join(__dirname, '..', 'tools', 'cowork-snapshot', 'support-history.js'));
  const data = db({ Sliding: [70, 65, 60, 55, 45, 30], Steady: [88, 90, 91, 89, 92, 90], Close: [72, 73, 72, 74, 73, 72] });
  const current = buildSupportList(data);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-history-')), 'history.csv');

  fs.writeFileSync(file, updateHistory(data, current, file));
  const first = parseCsv(fs.readFileSync(file, 'utf8'));
  const recorded = first.filter((r) => r.recorded_as === 'recorded');
  assert.deepEqual(recorded.map((r) => r.bakery), ['Sliding', 'Close']);
  assert.ok(recorded.every((r) => r.reference_month === current.referenceMonth));

  fs.writeFileSync(file, updateHistory(data, current, file));
  assert.equal(parseCsv(fs.readFileSync(file, 'utf8')).length, first.length, 'a second run does not duplicate rows');
});
