const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const charts = fs.readFileSync(path.join(root, 'js', 'charts.js'), 'utf8');

function coffeeTimingBlock() {
  const start = charts.indexOf('// Coffee timing mix:');
  const end = charts.indexOf('// Absolute CEI band distribution over time', start);
  assert.ok(start >= 0 && end > start, 'coffee timing chart block should exist');
  return charts.slice(start, end);
}

test('Coffee Timing chart uses three readable operational bands and one axis', () => {
  const block = coffeeTimingBlock();

  assert.match(block, /label: '<2 min'/);
  assert.match(block, /label: '2-3 min'/);
  assert.match(block, /label: '>3 min'/);
  assert.match(block, /text: '% of Drinks'/);
  assert.doesNotMatch(block, /customerEfficiency|yAxisID: 'y1'|Overall Efficiency \(customer-rated\)/);
});

test('Coffee Timing chart matches the adjacent Benchmark styling and keeps slow-band detail', () => {
  const block = coffeeTimingBlock();

  assert.match(html, /The monthly share of drinks served/);
  assert.match(block, /backgroundColor: '#1D9E5Ccc'/);
  assert.match(block, /backgroundColor: '#1E70C4cc'/);
  assert.match(block, /backgroundColor: '#C97F12cc'/);
  assert.match(block, /legend: \{ position: 'bottom', labels: \{ font: \{ size: 10 \} \} \}/);
  assert.match(block, /x: \{ stacked: true \}/);
  assert.doesNotMatch(block, /timingTargetLine|timingPrimaryLabels|borderRadius|maxBarThickness|layout: \{ padding/);
  assert.match(block, /'Slow-drink detail'/);
  assert.match(block, /'3-4 min: '/);
  assert.match(block, /'4-5 min: '/);
  assert.match(block, /'>5 min: '/);
});
