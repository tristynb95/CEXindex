const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const configSource = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const ceiSource = fs.readFileSync(path.join(root, 'js', 'cei.js'), 'utf8');
const calcSource = fs.readFileSync(path.join(root, 'js', 'method-calc.js'), 'utf8');

function configuredObject(name) {
  const match = configSource.match(new RegExp(`window\\.GAILS\\.${name}\\s*=\\s*(\\{[^;]+\\})`));
  assert.ok(match, `${name} should be declared in config.js`);
  return vm.runInNewContext(`(${match[1]})`);
}

function methodologyAttributes(key) {
  const card = html.match(new RegExp(`<article[^>]*data-methodology-key="${key}"[^>]*>`, 's'));
  assert.ok(card, `methodology should include a ${key} component card`);
  return Object.fromEntries(Array.from(card[0].matchAll(/data-([\w-]+)="([^"]+)"/g), (match) => [match[1], match[2]]));
}

function calculatorMarkup() {
  const start = html.indexOf('data-benchmark-calculator');
  assert.ok(start > 0, 'the methodology should include the calculator');
  return html.slice(start, html.indexOf('id="method-detail"', start));
}

// Default values the calculator ships with, read straight out of the page so a
// change to the markup can never leave the documented example behind.
function calculatorDefaults() {
  const calculator = calculatorMarkup();
  const defaults = {};
  for (const [, key, attrs] of calculator.matchAll(/data-calc-input="(\w+)"([^>]*)>/g)) {
    const value = attrs.match(/\svalue="([^"]+)"/);
    assert.ok(value, `${key} input should declare a starting value`);
    defaults[key] = Number(value[1]);
  }
  return defaults;
}

const weights = configuredObject('CEI_WEIGHTS');
const benchmarks = configuredObject('BENCHMARKS');
const floors = configuredObject('BENCHMARK_FLOORS');

function scoringContext() {
  const GAILS = { CEI_WEIGHTS: weights, BENCHMARKS: benchmarks, BENCHMARK_FLOORS: floors };
  const context = vm.createContext({ window: { GAILS }, GAILS, Date, Math, console });
  vm.runInContext(ceiSource, context);
  return GAILS;
}

test('methodology component metadata stays aligned with the scoring configuration', () => {
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

test('the calculator starts on the worked example advertised on the page', () => {
  const GAILS = scoringContext();
  const defaults = calculatorDefaults();

  assert.deepEqual(Object.keys(defaults).sort(), ['at', 'cohort', 'dr', 'ef', 'fr', 'nps', 'o5', 's2', 's3', 'v']);
  assert.ok(defaults.v >= 15, 'the shipped example should sit above the low-volume threshold');

  const components = [
    GAILS.computeAbsoluteComponent(defaults.nps, benchmarks.nps, floors.nps),
    GAILS.computeAbsoluteComponent(defaults.dr, benchmarks.dr, floors.dr),
    GAILS.computeAbsoluteComponent(defaults.ef, benchmarks.ef, floors.ef),
    GAILS.computeAbsoluteComponent(defaults.fr, benchmarks.fr, floors.fr),
    GAILS.computeCoffeeEfficiencyComponent(defaults.s2, defaults.s3, null, defaults.o5),
    GAILS.computeAbsoluteWaitComponent(defaults.at)
  ];

  assert.deepEqual(components, [50, 80, 50, 100, 0, 60]);
  const raw = Math.round((
    components[0] * weights.nps +
    components[1] * weights.dr +
    components[2] * weights.ef +
    components[3] * weights.fr +
    components[4] * weights.time +
    components[5] * weights.at
  ) * 10) / 10;

  assert.equal(raw, 62);
  assert.match(html, new RegExp(`data-example-score="${raw}"`));
});

test('the calculator scores through the live scoring code rather than its own maths', () => {
  ['computeAbsoluteComponent', 'computeCoffeeEfficiencyComponent', 'computeAbsoluteWaitComponent', 'confidenceAdjust', 'ensureBands']
    .forEach((fn) => assert.match(calcSource, new RegExp(`G\\.${fn}\\(`), `calculator should call GAILS.${fn}`));
  assert.match(calcSource, /G\.CEI_WEIGHTS\[/, 'weights should be read from config.js');
  assert.match(calcSource, /G\.BENCHMARKS\.\w+, G\.BENCHMARK_FLOORS\.\w+/, 'targets and floors should be read from config.js');
  assert.doesNotMatch(calcSource, /Math\.round\([^)]*\* 0\.[12]/, 'the calculator should not re-implement the weighting');
});

// The three coffee-efficiency thresholds are the one set of numbers the page
// prints that config.js does not expose, so they are pinned to the behaviour of
// the live scorer instead.
test('the coffee efficiency pass marks on the page match the scorer', () => {
  const GAILS = scoringContext();
  const pass = (s2, s3, o5) => GAILS.computeCoffeeEfficiencyComponent(s2, s3, null, o5);

  assert.equal(pass(70, 0, 100), 25, '70% within 2 minutes should pass and be worth a quarter');
  assert.equal(pass(69.9, 0, 100), 0);
  assert.equal(pass(0, 90, 100), 25, '90% within 3 minutes should pass and be worth a quarter');
  assert.equal(pass(0, 89.9, 100), 0);
  assert.equal(pass(0, 0, 1), 50, '1% over 5 minutes should pass and be worth a half');
  assert.equal(pass(0, 0, 1.1), 0);

  const calculator = calculatorMarkup();
  assert.match(calculator, /needs 70%\+/);
  assert.match(calculator, /needs 90%\+/);
  assert.match(calculator, /needs 1% or less/);
  assert.match(html, /<strong>70%\+<\/strong><span>served within 2 minutes<\/span><em>25%<\/em>/);
  assert.match(html, /<strong>90%\+<\/strong><span>served within 3 minutes<\/span><em>25%<\/em>/);
  assert.match(html, /<strong>1% or fewer<\/strong><span>orders over 5 minutes<\/span><em>50%<\/em>/);
});

test('every calculator input is labelled and paired with its slider', () => {
  const calculator = calculatorMarkup();
  const inputIds = Array.from(calculator.matchAll(/<input[^>]*id="(calc\w+)"/g), (match) => match[1]);

  assert.ok(inputIds.length >= 10);
  inputIds.forEach((id) => {
    assert.match(calculator, new RegExp(`<label for="${id}"`), `${id} should have a label`);
  });
  // Sliders duplicate a labelled number field, so they are removed from the tab
  // order and carry their own accessible name.
  Array.from(calculator.matchAll(/<input type="range"[^>]*>/g)).forEach((slider) => {
    assert.match(slider[0], /aria-label="/);
    assert.match(slider[0], /tabindex="-1"/);
    assert.match(slider[0], /data-calc-slider="\w+"/);
  });
});

test('methodology records the implemented audit and adjustment rules', () => {
  assert.match(html, /data-methodology="auditable"/);
  assert.match(html, /simple arithmetic mean of the bakery's scored monthly values/);
  assert.match(html, /it is not\s+weighted by monthly response volume/);
  assert.match(html, /months with no scored data are left out of the\s+average rather than counted as zero/);
  assert.match(html, /scored for the period once it has three scored months and\s+is still reporting/);
  assert.match(html, /blank average wait remains missing; the current calculation gives it 100 benchmark/);
  assert.match(html, /75% raw \+ 25% cohort mean/);
  assert.match(html, /35% raw \+ 65% cohort mean/);
  assert.match(html, /85% raw \+ 15% cohort mean/);
  assert.match(html, /55% raw \+ 45% cohort mean/);
  assert.match(html, /filters are applied after the company score and rank are fixed/);
  assert.match(html, /Peer tie-break calculation/);
  assert.match(html, /KPI card labels/);
  assert.match(html, /How to reproduce a result/);
});

test('methodology tables never receive fullscreen controls', () => {
  const start = html.indexOf('<!-- COFFEE EXPERIENCE INDEX METHODOLOGY -->');
  const end = html.indexOf('<!-- LEAGUE TABLE -->', start);
  const methodology = html.slice(start, end);
  const tables = methodology.match(/<table\b[^>]*>/g) || [];

  assert.equal(tables.length, 1);
  tables.forEach((table) => assert.match(table, /data-table-fullscreen="off"/));
  assert.doesNotMatch(methodology, /data-table-fullscreen-anchor|data-table-fullscreen-button|fullscreen-toggle-btn/);
});

test('methodology reads as hero, six component cards, calculator, then detail', () => {
  assert.match(html, /class="method-hero"/);
  assert.match(html, /class="method-weight-map"/);
  assert.match(html, /class="method-body"/);

  const chapters = html.match(/class="method-chapter[^"]*" id="method-[^"]+"/g) || [];
  const parts = html.match(/class="method-part method-part--[^"]+"/g) || [];
  assert.equal(chapters.length, 3);
  assert.equal(parts.length, 6);
  assert.match(html, /id="method-parts"/);
  assert.match(html, /id="method-calculator"/);
  assert.match(html, /id="method-detail"/);
});
