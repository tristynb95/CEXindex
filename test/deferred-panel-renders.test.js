const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// A refresh draws the panel you are looking at and remembers the rest, so a
// filter change no longer builds Chart.js instances for four hidden panels.
//
// That is only safe while nothing outside a panel depends on its render having
// run. The one thing that does — the Focus bakery count in the header — is why
// the Focus panel flushes on the spot rather than on the next frame. These
// tests pin both halves.

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// These files explain themselves in comments that name the very calls being
// looked for, so anything reading call order has to read code only.
const withoutComments = (source) => source.replace(/^\s*\/\/.*$/gm, '');

const DEFERRED_PANELS = ['trends', 'speed', 'table', 'target'];

test('every expensive panel render goes through the defer helper', () => {
  const app = read('js/app.js');

  // Both refresh paths — the no-data one and the normal one — hand all four
  // panels to renderOrDeferPanels rather than calling them outright.
  const batches = app.match(/renderOrDeferPanels\(\{[\s\S]*?\n *\}\);/g) || [];
  assert.equal(batches.length, 2, 'expected the two refresh paths to defer');
  batches.forEach((batch) => {
    DEFERRED_PANELS.forEach((panel) => {
      assert.match(batch, new RegExp('\\b' + panel + ':\\s*function'), `${panel} missing from a refresh path`);
    });
  });

  // And app.js calls each of them nowhere else: exactly two call sites apiece,
  // both of them the ones inside the batches above. A third would be a render
  // that runs whether or not its panel is on screen.
  ['renderTrendCharts', 'renderSpeedCharts', 'renderLeagueTable', 'renderTargets'].forEach((fn) => {
    const pattern = new RegExp('G\\.' + fn + '\\(', 'g');
    const total = (withoutComments(app).match(pattern) || []).length;
    const deferred = batches.join('\n').match(pattern) || [];
    assert.equal(deferred.length, 2, `${fn} is not deferred on both refresh paths`);
    assert.equal(total, 2, `${fn} has a call site outside the defer helper`);
  });
});

test('a panel is flushed before anything can read what its render published', () => {
  const app = withoutComments(read('js/app.js'));
  const activate = app.slice(app.indexOf('function activateDashboardTab'));

  const flushAt = activate.indexOf('flushPendingPanel(name)');
  const subtabAt = activate.indexOf("activateTargetSubtab('summary'");
  const headerAt = activate.indexOf('renderHeaderSummary()');

  assert.ok(flushAt > 0, 'activateDashboardTab does not flush a pending render');
  assert.ok(flushAt < subtabAt, 'the Focus sub-tab is chosen before the panel is drawn');
  assert.ok(flushAt < headerAt, 'the header is drawn before the panel it reads from');
});

test('the Focus panel is flushed synchronously, the rest on the next frame', () => {
  const app = read('js/app.js');
  const flush = app.slice(app.indexOf('function flushPendingPanel'));
  const body = flush.slice(0, flush.indexOf('\n  }'));

  // Synchronous for Focus specifically, because renderHeaderSummary() reads
  // G._focusDataContext in the same call and nothing would redraw it later.
  assert.match(body, /if \(name === 'target'\) render\(\);/);
  assert.match(body, /else requestAnimationFrame\(render\);/);
});

test('nothing outside the Focus panel reads the context its render publishes', () => {
  // The safety property behind deferring renderTargets. If a new view starts
  // reading G._focusDataContext, it has to either be inside the Focus panel,
  // carry its own fallback, or be guarded on the Focus tab being active —
  // otherwise it will read whatever the last Focus render left behind.
  const allowed = {
    // Publishes it, and reads it back across its own sub-panels.
    'js/targets.js': null,
    // Its own fallback: `G._focusDataContext || G.buildFocusDataset()`.
    'js/wordcloud.js': /_focusDataContext \|\| \(G\.buildFocusDataset/,
    // Guarded: only consulted when the Focus tab is the active one.
    'js/app.js': /currentTab === 'target' \? G\._focusDataContext : null/
  };

  fs.readdirSync(path.join(root, 'js'))
    .filter((file) => file.endsWith('.js'))
    .forEach((file) => {
      const key = 'js/' + file;
      const source = read(key);
      const reads = (source.match(/_focusDataContext/g) || []).length;
      if (!reads) return;
      assert.ok(key in allowed, `${key} reads G._focusDataContext but is not a known-safe reader`);
      if (allowed[key]) assert.match(source, allowed[key], `${key} lost its guard on G._focusDataContext`);
    });
});

test('the Focus map is fed by the Focus render, and the network map is not', () => {
  const app = read('js/app.js');
  const targets = read('js/targets.js');

  // storeMapTargets is what makes the Focus map's markers current, and it lives
  // inside renderTargets — so deferring that render defers the markers too,
  // which is fine because the map is inside the panel being deferred.
  const renderTargets = targets.slice(targets.indexOf('window.GAILS.renderTargets = function'));
  assert.match(renderTargets.slice(0, renderTargets.indexOf('\n};')), /G\.storeMapTargets\(targets\)/);

  // The network map on the Map tab is fed separately and unconditionally, so it
  // never depended on the Focus render.
  assert.match(app, /G\.storeDashboardMapData\(data\);/);
  const refresh = app.slice(app.indexOf('function refresh()'));
  const mapFeedAt = refresh.indexOf('G.storeDashboardMapData(data)');
  const firstDeferAt = refresh.indexOf('renderOrDeferPanels({');
  assert.ok(mapFeedAt > 0 && mapFeedAt < firstDeferAt, 'the network map feed moved behind the defer helper');
});

test('a deferred panel draws the same data its own refresh would have', () => {
  const app = read('js/app.js');
  const batches = app.match(/renderOrDeferPanels\(\{[\s\S]*?\n *\}\);/g) || [];
  const [noData, normal] = batches;

  // The no-data path has always drawn Focus from the scored rows and the normal
  // path from all of them. Closures are what keep that difference intact once
  // the render is postponed.
  assert.match(noData, /target: function \(\) \{ G\.renderTargets\(scoredData\); \}/);
  assert.match(normal, /target: function \(\) \{ G\.renderTargets\(data\); \}/);
});
