const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('the secondary-view stylesheet revision is cache-busted', () => {
  assert.match(html, /styles\.css\?v=[^"']*secondary-view-surfaces-05/);
});

test('every desktop page starts on the same aligned shell inset', () => {
  assert.match(styles, /#dashboardContent \.dashboard-workspace__main \{\s*margin-top:\s*12px;\s*border:\s*1px solid transparent;/);
});

test('title rows in white workspaces align to the shell top edge', () => {
  assert.match(styles, /@media \(min-width:\s*981px\) \{[\s\S]*?\.league-table-toolbar,[\s\S]*?\.visit-log-section-header \{[\s\S]*?align-items:\s*flex-start;/);
});

test('secondary views use the same quiet data-surface treatment', () => {
  assert.match(styles, /\.table-wrap--floating,\s*\.focus-qlist,\s*\.wc-canvas-wrap,[\s\S]*?background:\s*var\(--surface-panel\);[\s\S]*?box-shadow:\s*var\(--elev-rest\);/);
  assert.match(styles, /\.target-stat-card,\s*\.focus-secondary,\s*\.visit-log-summary,\s*\.search-pill,\s*\.map-toggle-group \{[\s\S]*?background:\s*var\(--surface-subtle\);[\s\S]*?box-shadow:\s*none;/);
  assert.match(styles, /#tab-map \.map-canvas-wrap,[\s\S]*?data-target-subtab-panel="map"\] \.map-canvas-wrap \{[\s\S]*?border:\s*1px solid var\(--stroke-subtle\);[\s\S]*?box-shadow:\s*var\(--elev-rest\);/);
});

test('secondary page headings and analytical cards use a compact hierarchy', () => {
  assert.match(styles, /\.section-page-title \{\s*font-size:\s*clamp\(1\.4rem, 1\.5vw, 1\.6rem\);/);
  assert.match(styles, /\.focus-page-intro h1,[\s\S]*?#tab-visit-log \.visit-log-section-title,[\s\S]*?font-size:\s*clamp\(1\.3rem, 1\.35vw, 1\.45rem\);/);
  assert.match(styles, /@media \(min-width: 981px\) \{[\s\S]*?\.trend-chart \{\s*height:\s*220px;\s*min-height:\s*220px;/);
});

test('Bakery Reports keeps its controls separate from the result surface', () => {
  assert.match(styles, /\.visit-log-section-header \{\s*margin-bottom:\s*12px;/);
  assert.match(styles, /\.visit-log-list \{\s*margin-top:\s*0;/);
  assert.match(styles, /\.visit-log-list > \.table-wrap--floating,[\s\S]*?background:\s*var\(--surface-panel\);[\s\S]*?box-shadow:\s*var\(--elev-rest\);/);
});
