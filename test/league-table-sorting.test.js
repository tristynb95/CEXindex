const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tables = fs.readFileSync(path.join(root, 'js', 'tables.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

// The League Table has exactly one control that reorders it: the "Sort by"
// dropdown in its toolbar. Header clicks were a second, undiscoverable one
// that left the dropdown showing a metric the table was no longer sorted by.
test('renderLeagueTable never wires up header-click sorting', () => {
  const body = tables.slice(tables.indexOf('window.GAILS.renderLeagueTable'));
  assert.ok(body.length > 0);
  assert.doesNotMatch(body, /G\.makeSortable\(/);
  // The dropdown-driven sort and the rank renumbering both stay.
  assert.match(body, /document\.getElementById\('sortBy'\)\.value/);
  assert.match(body, /G\.renumberRankedTable\(table\)/);
});

test('the Sort by dropdown is still the table\'s sort control', () => {
  assert.match(indexHtml, /<select id="sortBy"/);
  assert.match(app, /getElementById\('sortBy'\)\.addEventListener\('change', refresh\)/);
});

test('league table headers carry no sort affordance', () => {
  const rule = styles.match(/\.league-table th \{([^}]*)\}/);
  assert.ok(rule);
  assert.match(rule[1], /cursor:\s*default/);
  // th:hover would otherwise inherit the shared "this is clickable" colour shift.
  assert.match(styles, /\.league-table th:hover\s*\{[^}]*color:\s*var\(--muted\)/);
});
