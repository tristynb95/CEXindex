const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'support-score.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);

const compute = context.window.GAILS.computeSupportPriority;

function score(overrides) {
  return compute(Object.assign({
    score: 75,
    escapeLine: 75,
    severeLine: 60,
    trend: {},
    focusMonths: 1,
    focusStreak: 1,
    monthsWithData: 1,
    visitedInPeriod: true,
    hasVisitEver: true
  }, overrides));
}

test('normalizes severity to equivalent band positions in both score modes', () => {
  assert.equal(score({ score: 75 }).severity, 0);
  assert.equal(score({ score: 60 }).severity, 20);
  assert.equal(score({ score: 0 }).severity, 50);

  assert.equal(score({ score: 50, escapeLine: 50, severeLine: 25 }).severity, 0);
  assert.equal(score({ score: 25, escapeLine: 50, severeLine: 25 }).severity, 20);
  assert.equal(score({ score: 0, escapeLine: 50, severeLine: 25 }).severity, 50);
});

test('does not call a single observation persistent', () => {
  assert.equal(score({ focusMonths: 1, focusStreak: 1, monthsWithData: 1 }).persistence, 0);
  assert.equal(score({ focusMonths: 3, focusStreak: 3, monthsWithData: 3 }).persistence, 15);
});

test('does not count the latest decline again in the three-month signal', () => {
  const latestOnly = score({
    trend: { prev: true, ceiChange: -10, threePrev: true, cei3mChange: -10 }
  });
  const sustained = score({
    trend: { prev: true, ceiChange: -10, threePrev: true, cei3mChange: -20 }
  });
  assert.equal(latestOnly.momentum, 15);
  assert.equal(sustained.momentum, 25);
});

test('uses visit coverage as a bounded guardrail', () => {
  assert.equal(score({ visitedInPeriod: true, hasVisitEver: true }).coverage, 0);
  assert.equal(score({ visitedInPeriod: false, hasVisitEver: true }).coverage, 6);
  assert.equal(score({ visitedInPeriod: false, hasVisitEver: false }).coverage, 10);
  assert.equal(score({ monthsSinceVisit: 2, visitedInPeriod: false, hasVisitEver: true }).coverage, 0);
  assert.equal(score({ monthsSinceVisit: 8, visitedInPeriod: true, hasVisitEver: true }).coverage, 6);
  assert.equal(score({ monthsSinceVisit: 14, visitedInPeriod: true, hasVisitEver: true }).coverage, 10);
});

test('keeps the total bounded and assigns stable tier thresholds', () => {
  const urgent = score({
    score: 0,
    trend: { prev: true, ceiChange: -10, threePrev: true, cei3mChange: -20 },
    focusMonths: 3,
    focusStreak: 3,
    monthsWithData: 3,
    visitedInPeriod: false,
    hasVisitEver: false
  });
  assert.equal(urgent.priority, 100);
  assert.equal(urgent.tier, 'critical');
  assert.equal(score({ score: 0 }).tier, 'high');
  assert.equal(score({ score: 75 }).tier, 'watch');
});

test('severity never increases as performance improves', () => {
  let previous = Infinity;
  for (let value = 0; value <= 100; value += 1) {
    const current = score({ score: value }).severity;
    assert.ok(current <= previous, 'severity increased at score ' + value);
    previous = current;
  }
});
