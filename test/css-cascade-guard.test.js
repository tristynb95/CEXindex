const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// css/styles.css is source-order driven and ends with a section whose own header
// says it is "kept as one final layer". Page stylesheets load AFTER it, so any
// class they also style outranks that layer purely on file order — the layer
// stops being final for exactly those classes. That is how the Priority Overview
// search box came to render 200px tall: .search-pill moved into dashboard.css and
// started beating the .focus-queue__search reset that had always contained it.
//
// This test does not claim the overlaps below are correct. It pins the set so a
// NEW one cannot appear unnoticed.
function classesIn(src) {
  const set = new Set();
  const re = /([^{}]+)\{/g;
  let m;
  while ((m = re.exec(src))) {
    const sel = m[1].trim();
    if (sel.startsWith('@')) continue;
    const c = /\.([A-Za-z0-9_-]+)/g;
    let x;
    while ((x = c.exec(sel))) set.add(x[1]);
  }
  return set;
}

function elevationClasses() {
  const lines = read('css/styles.css').split(/\r?\n/);
  const start = lines.findIndex((l) => l.includes('VISUAL ELEVATION PASS'));
  assert.notEqual(start, -1, 'the final override layer is no longer labelled in css/styles.css');
  return classesIn(lines.slice(start).join('\n').replace(/\/\*[\s\S]*?\*\//g, ''));
}

// Verified against the pre-extraction build by computed style: dashboard.css wins
// these two on specificity, not order, so they rendered identically before and
// after the extraction. The rest are inherited from earlier extractions and are
// NOT verified — see the note in the second test.
const PINNED = {
  'dashboard.css': ['kpi', 'overview-card'],
  'admin.css': ['active', 'btn', 'glass-bg'],
  'bakery-profile.css': ['btn', 'is-open'],
  'my-activity.css': ['btn', 'visit-log-filter-control', 'visit-log-input'],
  'my-team.css': ['visit-log-empty', 'visit-log-filter-control', 'visit-log-input', 'visit-log-reset-btn'],
};

test('no page stylesheet adds a new collision with the final override layer', () => {
  const elev = elevationClasses();
  for (const [sheet, pinned] of Object.entries(PINNED)) {
    const src = read('css/' + sheet).replace(/\/\*[\s\S]*?\*\//g, '');
    const overlap = [...classesIn(src)].filter((c) => elev.has(c)).sort();
    assert.deepEqual(overlap, pinned,
      'css/' + sheet + ' now overlaps the final layer on: ' + overlap.join(', ') +
      '\n  Either move the layer rule into css/' + sheet + ' (so it still wins), or' +
      '\n  qualify the override so it wins by specificity rather than by file order.');
  }
});

test('the page stylesheet still loads after the shared one', () => {
  // The fixes above assume this order. If it ever flips, the rules moved into the
  // page stylesheets would start losing instead of winning.
  const html = read('index.html');
  const shared = html.indexOf('css/styles.css');
  const page = html.indexOf('css/dashboard.css');
  assert.notEqual(shared, -1);
  assert.notEqual(page, -1);
  assert.ok(shared < page, 'css/dashboard.css must load after css/styles.css');
});
