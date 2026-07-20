const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('uses one fullscreen toggle component for maps and generated tables', () => {
  const index = read('index.html');
  const tables = read('js/tables.js');
  const mapButtons = (index.match(/<button\b[\s\S]*?data-map-fullscreen=[\s\S]*?<\/button>/g) || []);

  assert.equal(mapButtons.length, 2);
  mapButtons.forEach((button) => {
    assert.match(button, /class="[^"]*\bfullscreen-toggle-btn\b[^"]*"/);
    assert.match(button, /aria-label="Open full screen map view"/);
    assert.match(button, /aria-pressed="false"/);
    assert.match(button, /title="Open full screen"/);
    assert.match(button, /\bfullscreen-toggle-btn__icon\b/);
  });

  assert.match(tables, /button\.className = 'fullscreen-toggle-btn table-fullscreen-btn'/);
  assert.match(tables, /icon\.setAttribute\('class', 'fullscreen-toggle-btn__icon table-fullscreen-btn__icon'\)/);
  assert.match(tables, /label\.className = 'fullscreen-toggle-btn__label table-fullscreen-btn__label'/);
});

test('fullscreen toggles expose matching expand and restore states', () => {
  const app = read('js/app.js');
  const tables = read('js/tables.js');

  assert.match(tables, /var EXPAND_ICON_PATH = '[^']+'/);
  assert.match(tables, /var RESTORE_ICON_PATH = '[^']+'/);
  assert.match(tables, /active \? RESTORE_ICON_PATH : EXPAND_ICON_PATH/);
  assert.match(tables, /setAttribute\('aria-pressed', active \? 'true' : 'false'\)/);
  assert.match(tables, /active \? 'Exit full screen table view' : 'Open full screen table view'/);

  assert.match(app, /button\.classList\.toggle\('is-active', active\)/);
  assert.match(app, /setAttribute\('aria-pressed', active \? 'true' : 'false'\)/);
  assert.match(app, /active \? 'Exit full screen map view' : 'Open full screen map view'/);
  assert.match(app, /active \? 'Exit full screen' : 'Open full screen'/);
});

test('shared fullscreen sizing is not overridden by surface-specific variants', () => {
  const styles = read('css/styles.css');
  const componentRule = styles.match(/\.fullscreen-toggle-btn\s*\{([\s\S]*?)\}/);
  const activeMapRule = styles.match(/\.map-panel\.is-fullscreen \.map-fullscreen-btn\s*\{([\s\S]*?)\}/);

  assert.ok(componentRule);
  assert.match(componentRule[1], /width:\s*32px/);
  assert.match(componentRule[1], /height:\s*32px/);
  assert.match(componentRule[1], /border-radius:\s*8px/);
  assert.match(componentRule[1], /background:\s*var\(--card\)/);
  assert.match(styles, /\.fullscreen-toggle-btn:focus-visible\s*\{/);
  assert.match(styles, /\.fullscreen-toggle-btn\[aria-pressed="true"\]\s*\{/);

  assert.ok(activeMapRule);
  assert.doesNotMatch(activeMapRule[1], /\b(?:width|height|border-radius|background|color):/);
  assert.doesNotMatch(styles, /\.admin-table th \.table-fullscreen-btn\s*\{/);
});
