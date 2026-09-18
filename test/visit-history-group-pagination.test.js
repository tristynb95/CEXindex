// Visit History pages its rows so a big "All Time" list stays cheap to render,
// but the budget used to be spent in group order: with three regions and one
// chunk of budget, London and North consumed all 150 rows and South Region was
// dropped entirely — header, count and all — so a whole grouping only existed
// behind the "Show more" button. The budget is now shared across the groups.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

function loadAllocator() {
  const start = source.indexOf('function allocateVisitRowBudget');
  assert.notEqual(start, -1, 'allocateVisitRowBudget should exist');
  const end = source.indexOf('\r\n  }', start);
  const context = {};
  vm.runInNewContext(source.slice(start, end + 5) + '\nthis.allocate = allocateVisitRowBudget;', context);
  return context.allocate;
}

test('the row budget is shared out so every group keeps rows on screen', () => {
  const allocate = loadAllocator();
  // The reported case: 227 visits over three regions, one 150-row chunk.
  assert.deepEqual(allocate([80, 78, 69], 150), [50, 50, 50]);
  // A group smaller than its share hands the remainder back rather than
  // stranding budget it cannot use.
  assert.deepEqual(allocate([3, 2, 400], 150), [3, 2, 145]);
  // Enough budget for everything renders everything.
  assert.deepEqual(allocate([80, 78, 69], 300), [80, 78, 69]);
  // Degenerate inputs must not spin or over-allocate.
  assert.deepEqual(allocate([], 150), []);
  assert.deepEqual(allocate([5, 0, 5], 0), [0, 0, 0]);
  assert.deepEqual(allocate([227], 150), [150]);
  const many = allocate([1, 1, 1, 1, 1], 3);
  assert.equal(many.reduce((sum, n) => sum + n, 0), 3);
});

test('no group is skipped when the render budget runs out', () => {
  // The old pager returned '' for a whole group once the budget was gone.
  assert.doesNotMatch(source, /if \(remaining <= 0\) return '';/);
  assert.match(source, /var groupBudget = groupRowBudget\[groupIndex\];/);
  assert.match(source, /var visibleVisits = groupVisits\.length > groupBudget \? groupVisits\.slice\(0, groupBudget\) : groupVisits;/);
});

test('Show more counts what was actually rendered, not the nominal limit', () => {
  assert.match(source, /var renderedCount = groupRowBudget\.reduce\(function \(sum, n\) \{ return sum \+ n; \}, 0\);/);
  assert.match(source, /if \(renderedCount < filtered\.length\) \{/);
  assert.match(source, /Show more \(' \+ \(filtered\.length - renderedCount\) \+ ' remaining\)/);
});
