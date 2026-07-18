const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'focus-data.js'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');

function createContext(records, stateOverrides = {}) {
  const canonical = (name) => ({
    'Union Bath': 'Union Street, Bath',
    'Union Street - Bath': 'Union Street, Bath',
    'College Green': 'Bristol College Green',
    'College Green Bristol': 'Bristol College Green'
  }[name] || name);
  const GAILS = {
    MONTH_SHORT: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    monthSortKey(label) {
      const [month, year] = label.split(' ');
      return (2000 + Number(year)) * 12 + this.MONTH_SHORT.indexOf(month);
    },
    resolveBakeryMetaKey: canonical,
    getBakeryRegion(name) {
      return ['Union Street, Bath', 'Bristol College Green'].includes(canonical(name)) ? 'South Region' : 'London';
    },
    getBakeryOps() { return 'Area One'; },
    state: Object.assign({
      ALL: records,
      targetMetric: 'relative',
      regionFilter: [],
      opsFilter: [],
      searchBakery: [],
      bandFilter: ''
    }, stateOverrides)
  };
  const context = { window: { GAILS }, Set, Object, Date, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.GAILS;
}

function record(bakery, month, score) {
  return {
    b: bakery,
    m: month,
    c: score,
    ac: score,
    c_raw: score,
    ac_raw: score,
    n: score,
    dr: score,
    ef: score,
    fr: score,
    dp: score,
    ep: score,
    fp: score,
    np: score,
    ts: score,
    ap: score,
    v: 10,
    noData: false
  };
}

const referenceDate = new Date('2026-07-18T12:00:00Z');

test('excludes the current month and weights the latest closed months 60/25/15', () => {
  const records = [
    record('Recovery', 'Apr 26', 10),
    record('Recovery', 'May 26', 10),
    record('Recovery', 'Jun 26', 80),
    record('Recovery', 'Jul 26', 0)
  ];
  const G = createContext(records);
  const result = G.buildFocusDataset({ referenceDate });

  assert.equal(result.latestClosedMonth, 'Jun 26');
  assert.deepEqual(Array.from(result.data[0].focusSourceMonths), ['Apr 26', 'May 26', 'Jun 26']);
  assert.equal(result.data[0].c, 52);
  assert.equal(result.data[0].cb, 'Above Average');
  assert.equal(result.data[0].focusDataStatus, 'complete');
  assert.equal(result.data[0].monthsExpected, 3);
});

test('keeps a bakery in onboarding until three usable closed-month results exist', () => {
  const records = [
    record('New Bakery', 'May 26', 20),
    record('New Bakery', 'Jun 26', 20),
    record('New Bakery', 'Jul 26', 20),
    record('Current Month Only', 'Jul 26', 20)
  ];
  const G = createContext(records);
  const result = G.buildFocusDataset({ referenceDate });

  assert.equal(result.data.length, 0);
  assert.equal(result.onboarding.length, 2);
  assert.equal(result.onboarding.find((item) => item.name === 'New Bakery').completedMonths, 2);
  assert.equal(result.onboarding.find((item) => item.name === 'New Bakery').monthsNeeded, 1);
  assert.equal(result.onboarding.find((item) => item.name === 'Current Month Only').completedMonths, 0);
});

test('calculates average drinks per month for the focus bakery table', () => {
  const records = [
    record('Monthly Drinks', 'Apr 26', 20),
    record('Monthly Drinks', 'May 26', 20),
    record('Monthly Drinks', 'Jun 26', 20)
  ];
  records[0].td = 9000;
  records[1].td = 12000;
  records[2].td = 15000;
  const G = createContext(records);
  const result = G.buildFocusDataset({ referenceDate });

  assert.equal(result.data[0].td, 36000);
  assert.equal(result.data[0].tdMonthlyAvg, 12000);
});

test('includes poor incomplete evidence provisionally and separates stale or unconfirmed data', () => {
  const records = [
    record('Provisional Focus', 'Oct 25', 10),
    record('Provisional Focus', 'Nov 25', 10),
    record('Provisional Focus', 'Dec 25', 10),
    record('Provisional Focus', 'Jan 26', 10),
    record('Provisional Focus', 'Mar 26', 10),
    record('Provisional Focus', 'May 26', 20),
    record('Stale Bakery', 'Jan 26', 70),
    record('Stale Bakery', 'Feb 26', 70),
    record('Stale Bakery', 'Mar 26', 70),
    record('Unconfirmed Healthy', 'Oct 25', 80),
    record('Unconfirmed Healthy', 'Nov 25', 80),
    record('Unconfirmed Healthy', 'Dec 25', 80),
    record('Unconfirmed Healthy', 'Jan 26', 80),
    record('Unconfirmed Healthy', 'Mar 26', 80),
    record('Unconfirmed Healthy', 'May 26', 80)
  ];
  const G = createContext(records);
  const result = G.buildFocusDataset({ referenceDate });
  const provisional = result.data.find((item) => item.b === 'Provisional Focus');

  assert.ok(provisional);
  assert.equal(provisional.focusDataStatus, 'provisional');
  assert.equal(provisional.cb, 'Low Performance');
  assert.equal(result.data.some((item) => item.b === 'Stale Bakery'), false);
  assert.equal(result.data.some((item) => item.b === 'Unconfirmed Healthy'), false);
  assert.equal(result.allSnapshots.some((item) => item.b === 'Unconfirmed Healthy'), false);
  assert.match(result.dataReview.find((item) => item.name === 'Stale Bakery').reason, /extended completed-month data gap/);
  assert.match(result.dataReview.find((item) => item.name === 'Unconfirmed Healthy').reason, /cannot be confirmed/);
});

test('uses completed calendar slots rather than treating missing months as adjacent', () => {
  const records = [
    record('Gap Bakery', 'Oct 25', 20),
    record('Gap Bakery', 'Nov 25', 20),
    record('Gap Bakery', 'Dec 25', 20),
    record('Gap Bakery', 'Feb 26', 20),
    record('Gap Bakery', 'Apr 26', 30),
    record('Gap Bakery', 'Jun 26', 40),
    record('Established Gap', 'Oct 25', 20),
    record('Established Gap', 'Nov 25', 20),
    record('Established Gap', 'Dec 25', 20),
    record('Established Gap', 'Jan 26', 20),
    record('Established Gap', 'May 26', 20),
    record('Established Gap', 'Jun 26', 20)
  ];
  const G = createContext(records);
  const result = G.buildFocusDataset({ referenceDate });
  const establishedGap = result.data.find((item) => item.b === 'Established Gap');

  assert.deepEqual(Array.from(result.recentMonths), ['Jan 26', 'Feb 26', 'Mar 26', 'Apr 26', 'May 26', 'Jun 26']);
  assert.equal(result.data.find((item) => item.b === 'Gap Bakery').focusDataStatus, 'provisional');
  assert.equal(result.data.find((item) => item.b === 'Gap Bakery').focusRecentMonthsCovered, 3);
  assert.equal(establishedGap.focusDataStatus, 'provisional');
  assert.equal(establishedGap.monthsExpected, 6);
  assert.equal(establishedGap.monthsCovered, 3);
});

test('requires an ever-achieved run of three consecutive months and merges bakery aliases before region filtering', () => {
  const records = [
    record('Union Bath', 'Oct 25', 20),
    record('Union Street - Bath', 'Nov 25', 20),
    record('Union Street, Bath', 'Dec 25', 20),
    record('Union Bath', 'Jun 26', 20),
    record('College Green', 'Oct 25', 20),
    record('College Green Bristol', 'Nov 25', 20),
    record('Bristol College Green', 'Dec 25', 20),
    record('Never Consecutive', 'Jan 26', 20),
    record('Never Consecutive', 'Mar 26', 20),
    record('Never Consecutive', 'May 26', 20)
  ];
  const G = createContext(records, { regionFilter: ['South Region'] });
  const result = G.buildFocusDataset({ referenceDate });

  assert.equal(result.bakeryCount, 2);
  assert.equal(result.onboarding.some((item) => item.name === 'Union Street, Bath'), false);
  assert.equal(result.onboarding.some((item) => item.name === 'Bristol College Green'), false);
  assert.ok(result.dataReview.find((item) => item.name === 'Union Street, Bath'));
  assert.ok(result.dataReview.find((item) => item.name === 'Bristol College Green'));
  assert.equal(result.dataReview.every((item) => item.region === 'South Region'), true);
});

test('keeps three non-consecutive lifetime results in onboarding', () => {
  const records = [
    record('Never Consecutive', 'Jan 26', 20),
    record('Never Consecutive', 'Mar 26', 20),
    record('Never Consecutive', 'May 26', 20)
  ];
  const G = createContext(records);
  const result = G.buildFocusDataset({ referenceDate });
  const onboarding = result.onboarding.find((item) => item.name === 'Never Consecutive');

  assert.ok(onboarding);
  assert.equal(onboarding.completedMonths, 1);
  assert.equal(onboarding.usableLifetimeMonths, 3);
});

test('resolves the known Bristol College Green and Union Bath aliases', () => {
  const context = { window: { GAILS: {} }, console };
  vm.createContext(context);
  vm.runInContext(configSource, context);

  assert.equal(context.window.GAILS.resolveBakeryMetaKey('College Green'), 'Bristol College Green');
  assert.equal(context.window.GAILS.resolveBakeryMetaKey('College Green Bristol'), 'Bristol College Green');
  assert.equal(context.window.GAILS.resolveBakeryMetaKey('Union Bath'), 'Union Street, Bath');
});

test('keeps built-in Westbourne Grove map metadata when the live directory omits it', () => {
  const context = { window: { GAILS: {} }, console };
  vm.createContext(context);
  vm.runInContext(configSource, context);
  const G = context.window.GAILS;

  G.setBakeryMeta({ Balham: G.DEFAULT_BAKERY_META.Balham });

  assert.equal(G.resolveBakeryMetaKey("GAIL's Westbourne Grove"), 'Westbourne Grove');
  assert.deepEqual(Array.from(G.getBakeryMeta("GAIL's Westbourne Grove").ll), [51.5137, -0.1969]);
  assert.equal(G.getBakeryRegion("GAIL's Westbourne Grove"), 'London Region');
  assert.equal(G.getBakeryOps("GAIL's Westbourne Grove"), 'Sandra Cano Cardona');
});
