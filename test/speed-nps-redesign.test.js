const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const chartsSource = fs.readFileSync(path.join(root, 'js', 'charts.js'), 'utf8');

function speedTab() {
  const start = html.indexOf('<!-- SPEED vs NPS -->');
  const end = html.indexOf('<!-- COFFEE EXPERIENCE INDEX METHODOLOGY -->', start);
  assert.ok(start >= 0 && end > start, 'Speed vs NPS tab boundaries should exist');
  return html.slice(start, end);
}

test('Speed vs NPS uses the compact evidence-first layout and preserves every chart hook', () => {
  const page = speedTab();

  assert.match(page, /class="speed-nps__intro"/);
  assert.match(page, /class="speed-nps__signal-grid"/);
  assert.match(page, /class="speed-nps__evidence-grid"/);
  assert.match(page, /01 &middot; Bakery-level comparison/);
  assert.match(page, /02 &middot; Quartile check/);
  assert.match(page, /03 &middot; Measure check/);

  ['speedVsNps', 'effVsNps', 'quartileCompare', 'corrCompare'].forEach((id) => {
    assert.equal((page.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} should appear once`);
  });

  assert.doesNotMatch(page, /verdict-pill|The answer is clear|Every Speed Metric Tells the Same Story/);
});

test('analysis language defines the measures and does not present association as causation', () => {
  const page = speedTab();

  assert.match(page, /recorded coffee timing/);
  assert.match(page, /customer&rsquo;s rating of overall efficiency/);
  assert.match(page, /Each dot is one bakery/);
  assert.match(page, /R&sup2; reports how much/);
  assert.match(page, /does not establish cause/);
  assert.match(page, /not proof that changing one measure will produce a specific change in NPS/);
});

test('Speed vs NPS styling has bounded charts and responsive layout changes', () => {
  assert.match(css, /#tab-speed\s*\{/);
  assert.match(css, /\.speed-nps__chart canvas\s*\{[\s\S]*?height:\s*100% !important/);
  assert.match(css, /\.speed-nps__chart--scatter\s*\{[\s\S]*?height:\s*245px/);
  assert.match(css, /@media \(max-width: 780px\)[\s\S]*?\.speed-nps__signal-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.speed-nps__gap-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test('live sample, gap and R-squared summaries update from the filtered data', () => {
  const elements = Object.fromEntries([
    'speedSampleVal', 'speedGapVal', 'effGapVal', 'speedR2Val', 'effR2Val'
  ].map((id) => [id, { textContent: '' }]));
  const chartConfigs = {};
  const GAILS = {
    avg(rows, key) {
      return rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
    },
    makeChart(id, config) {
      chartConfigs[id] = config;
    }
  };
  const context = vm.createContext({
    window: { GAILS },
    GAILS,
    document: { getElementById: (id) => elements[id] || { textContent: '' } },
    Math,
    console
  });
  vm.runInContext(chartsSource, context);
  GAILS.makeChart = (id, config) => { chartConfigs[id] = config; };

  const data = Array.from({ length: 8 }, (_, index) => ({
    b: `Bakery ${index + 1}`,
    n: 32 + index * 7,
    s2: 44 + index * 5,
    s3: 62 + index * 4,
    o5: 20 - index * 2,
    ef: 50 + index * 6,
    fr: 68 + index * 3,
    dr: 70 + index * 2,
    ov: 60 + index * 4,
    v: 10 + index
  }));
  GAILS.renderSpeedCharts(data);

  assert.equal(elements.speedSampleVal.textContent, 8);
  assert.match(elements.speedGapVal.textContent, /^\d+ pts$/);
  assert.match(elements.effGapVal.textContent, /^\d+ pts$/);
  assert.match(elements.speedR2Val.textContent, /^\d+\.\d%$/);
  assert.match(elements.effR2Val.textContent, /^\d+\.\d%$/);
  assert.deepEqual(Object.keys(chartConfigs), ['speedVsNps', 'effVsNps', 'quartileCompare', 'corrCompare']);
  Object.values(chartConfigs).forEach((config) => assert.equal(config.options.maintainAspectRatio, false));
});
