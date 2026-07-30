const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const ceiSource = fs.readFileSync(path.join(root, 'js', 'cei.js'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function configuredObject(name) {
  const match = configSource.match(new RegExp(`window\\.GAILS\\.${name}\\s*=\\s*(\\{[^;]+\\})`));
  assert.ok(match, `${name} should be declared in config.js`);
  return vm.runInNewContext(`(${match[1]})`);
}

function methodologyAttributes(key) {
  const row = html.match(new RegExp(`<tr[^>]*data-methodology-key="${key}"[^>]*>`));
  assert.ok(row, `methodology should include a ${key} input row`);
  return Object.fromEntries(Array.from(row[0].matchAll(/data-([\w-]+)="([^"]+)"/g), (match) => [match[1], match[2]]));
}

const weights = configuredObject('CEI_WEIGHTS');
const benchmarks = configuredObject('BENCHMARKS');
const floors = configuredObject('BENCHMARK_FLOORS');

test('methodology input metadata stays aligned with the scoring configuration', () => {
  assert.equal(Object.values(weights).reduce((total, value) => total + value, 0), 1);

  Object.entries(weights).forEach(([key, weight]) => {
    const attrs = methodologyAttributes(key);
    assert.equal(Number(attrs.weight), weight, `${key} weight should match config.js`);

    if (key !== 'time') {
      assert.equal(Number(attrs.target), benchmarks[key], `${key} target should match config.js`);
      assert.equal(Number(attrs.floor), floors[key], `${key} floor should match config.js`);
    }
  });
});

test('worked example reproduces the score shown on the page', () => {
  const GAILS = { CEI_WEIGHTS: weights, BENCHMARKS: benchmarks, BENCHMARK_FLOORS: floors };
  const context = vm.createContext({ window: { GAILS }, GAILS, Date, Math, console });
  vm.runInContext(ceiSource, context);

  const components = [
    GAILS.computeAbsoluteComponent(50, benchmarks.nps, floors.nps),
    GAILS.computeAbsoluteComponent(88, benchmarks.dr, floors.dr),
    GAILS.computeAbsoluteComponent(85, benchmarks.ef, floors.ef),
    GAILS.computeAbsoluteComponent(92, benchmarks.fr, floors.fr),
    GAILS.computeCoffeeEfficiencyComponent(65, 88, null, 1.2),
    GAILS.computeAbsoluteWaitComponent(122)
  ];

  assert.deepEqual(components, [50, 80, 50, 100, 81.8, 60]);
  const raw = Math.round((
    components[0] * weights.nps +
    components[1] * weights.dr +
    components[2] * weights.ef +
    components[3] * weights.fr +
    components[4] * weights.time +
    components[5] * weights.at
  ) * 10) / 10;

  assert.equal(raw, 70.2);
  assert.match(html, new RegExp(`data-example-score="${raw}"`));
});

test('methodology records the implemented audit and adjustment rules', () => {
  assert.match(html, /data-methodology="auditable"/);
  assert.match(html, /simple arithmetic mean of the available monthly values/);
  assert.match(html, /it is not weighted by\s+monthly response volume/);
  assert.match(html, /blank\s+average wait remains missing; the current calculation gives it 100 benchmark component points/);
  assert.match(html, /75% raw \+ 25% cohort mean/);
  assert.match(html, /35% raw \+ 65% cohort mean/);
  assert.match(html, /85% raw \+ 15% cohort mean/);
  assert.match(html, /55% raw \+ 45% cohort mean/);
  assert.match(html, /filters are applied after the company score and rank are fixed/);
  assert.match(html, /Peer tie-break calculation/);
  assert.match(html, /KPI card labels/);
});

test('methodology tables never receive fullscreen controls', () => {
  const start = html.indexOf('<!-- COFFEE EXPERIENCE INDEX METHODOLOGY -->');
  const end = html.indexOf('<!-- LEAGUE TABLE -->', start);
  const methodology = html.slice(start, end);
  const tables = methodology.match(/<table\b[^>]*>/g) || [];

  assert.equal(tables.length, 3);
  tables.forEach((table) => assert.match(table, /data-table-fullscreen="off"/));
  assert.doesNotMatch(methodology, /data-table-fullscreen-anchor|data-table-fullscreen-button|fullscreen-toggle-btn/);
});

test('methodology uses the redesigned hero, contents rail, and six chapters', () => {
  assert.match(html, /class="method-hero"/);
  assert.match(html, /class="method-weight-map"/);
  assert.match(html, /class="method-layout"/);
  assert.match(html, /class="method-toc"/);

  const anchors = html.match(/data-method-anchor="method-[^"]+"/g) || [];
  const chapters = html.match(/class="method-chapter[^"]*" id="method-[^"]+"/g) || [];
  assert.equal(anchors.length, 6);
  assert.equal(chapters.length, 6);
  assert.match(appSource, /closest\('\[data-method-anchor\]'\)/);
  assert.match(appSource, /scrollIntoView\(\{/);
  assert.match(appSource, /chapter\.focus\(\{ preventScroll: true \}\)/);
});
