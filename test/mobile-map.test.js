const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const targets = fs.readFileSync(path.join(root, 'js', 'targets.js'), 'utf8');

test('gives the network and Focus Bakery maps one shared mobile control layout', () => {
  const targetHint = html.match(/<p class="target-hint map-legend-key" id="targetMapLegendHint"[\s\S]*?<\/p>/);

  assert.ok(targetHint);
  assert.match(targetHint[0], /map-legend-key__note/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.map-toggle-group\s*\{[\s\S]*?grid-column: 1 \/ -1/);
  assert.match(styles, /#tab-map \.map-canvas-wrap[\s\S]*?#tab-target \[data-target-subtab-panel="map"\] \.map-canvas-wrap/);
  assert.match(styles, /#tab-map #networkMap,[\s\S]*?#tab-target \[data-target-subtab-panel="map"\] #targetMap\s*\{[\s\S]*?height: clamp\(420px, 68dvh, 600px\)/);
});

test('keeps the mobile map useful in fullscreen without the desktop filter rail', () => {
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.map-panel\.is-fullscreen\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.map-panel\.is-fullscreen \.map-filter-summary\s*\{\s*display: none;/);
  assert.match(styles, /\.map-fullscreen-btn::before\s*\{[\s\S]*?inset: -6px/);
});

test('uses compact map bounds on phone-sized viewports', () => {
  assert.match(targets, /window\.matchMedia\('\(max-width: 640px\)'\)\.matches/);
  assert.match(targets, /padding: compactMap \? \[24, 24\] : \[50, 50\]/);
  assert.match(targets, /maxZoom: compactMap \? 12 : 13/);
});
