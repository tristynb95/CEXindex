const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('uses the branded map segmented control on both dashboard maps', () => {
  const controls = html.match(/<div class="map-segmented-control"[\s\S]*?<\/div>/g) || [];
  assert.equal(controls.length, 4);
  controls.forEach((control) => {
    assert.match(control, /role="group"/);
    assert.match(control, /map-segmented-control__btn active/);
    assert.match(control, /aria-pressed="true"/);
  });

  assert.match(styles, /\.map-segmented-control__btn\.active,[\s\S]*?background:\s*var\(--accent\)/);
  assert.match(styles, /\.map-segmented-control__btn:focus-visible\s*\{/);
  assert.doesNotMatch(html.match(/id="networkMapAreaToggle"[\s\S]*?<\/div>/)[0], /overview-rankings-toggle/);
  assert.doesNotMatch(html.match(/id="targetMapAreaToggle"[\s\S]*?<\/div>/)[0], /overview-rankings-toggle/);
});

test('keeps pressed state in sync with each map filter', () => {
  assert.match(app, /function syncMapSegmentedControl\(selector, dataKey, value\)/);
  assert.match(app, /toggleBtn\.setAttribute\('aria-pressed', selected \? 'true' : 'false'\)/);
  assert.match(app, /syncMapSegmentedControl\('\[data-map-area\]', 'mapArea', nextArea\)/);
  assert.match(app, /syncMapSegmentedControl\('\[data-target-map-area\]', 'targetMapArea', nextArea\)/);
  assert.match(app, /syncMapSegmentedControl\('\[data-map-visit\]', 'mapVisit', nextVisit\)/);
  assert.match(app, /syncMapSegmentedControl\('\[data-target-map-visit\]', 'targetMapVisit', nextVisit\)/);
});
