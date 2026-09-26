const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'css', 'dashboard.css'), 'utf8');

test('the shared stylesheet is linked without a version string', () => {
  // Was: assert the ?v= string carried "secondary-view-surfaces-05". That scheme
  // is gone (README.md), so the guard is now that it stays gone.
  assert.match(html, /href="css\/styles\.css"/);
  assert.doesNotMatch(html, /css\/styles\.css\?v=/);
});

test('every desktop page starts on the same aligned shell inset', () => {
  assert.match(styles, /#dashboardContent \.dashboard-workspace__main \{\s*margin-top:\s*12px;\s*border:\s*1px solid transparent;/);
});

test('title rows in white workspaces align to the shell top edge', () => {
  assert.match(styles, /@media \(min-width:\s*981px\) \{[\s\S]*?\.league-table-toolbar,[\s\S]*?\.visit-log-section-header \{[\s\S]*?align-items:\s*flex-start;/);
});

test('secondary views use the same quiet data-surface treatment', () => {
  assert.match(styles, /\.table-wrap--floating,\s*\.focus-qlist \{[^}]*?background:\s*var\(--surface-panel\);[^}]*?box-shadow:\s*var\(--elev-rest\);/);
  assert.match(styles, /\.target-stat-card,\s*\.focus-secondary,\s*\.visit-log-summary,\s*\.map-toggle-group \{[^}]*?background:\s*var\(--surface-subtle\);[^}]*?box-shadow:\s*none;/);
  assert.match(styles, /#tab-map \.map-canvas-wrap,[\s\S]*?data-target-subtab-panel="map"\] \.map-canvas-wrap \{[^}]*?border:\s*1px solid var\(--stroke-subtle\);[^}]*?box-shadow:\s*var\(--elev-rest\);/);
});

// css/dashboard.css loads after css/styles.css, so the elevation layer at the end
// of styles.css can no longer be the last word on any class dashboard.css also
// styles. These two rules were moved there for exactly that reason — asserted
// here so they cannot quietly drift back into styles.css and start losing again.
// [^}] rather than [\s\S] so a match cannot run across rule boundaries and pass
// on declarations that belong to some other selector further down the file.
test('surfaces shared with dashboard.css keep the treatment in the file that wins', () => {
  assert.match(dashboard, /\.wc-canvas-wrap,\s*\.wc-sig-panel,\s*\.wc-drift-panel \{[^}]*?background:\s*var\(--surface-panel\);[^}]*?box-shadow:\s*var\(--elev-rest\);[^}]*?border-radius:\s*14px;/);
  assert.match(dashboard, /\.search-pill \{[^}]*?border-color:\s*var\(--stroke-subtle\);[^}]*?background:\s*var\(--surface-subtle\);[^}]*?box-shadow:\s*none;/);
});

// The Priority Overview search sits inside a COLUMN flex box, so .search-pill's
// "flex: 1 1 200px" sizes its HEIGHT rather than its width. The reset has to beat
// that by specificity now that .search-pill lives in a later-loading file: an
// unqualified .focus-queue__search loses and the field renders 200px tall.
test('the Priority Overview search resets the pill flex by specificity', () => {
  assert.match(styles, /\.search-pill\.focus-queue__search \{\s*flex:\s*0 0 auto;\s*width:\s*280px;/);
});

test('secondary page headings and analytical cards use a compact hierarchy', () => {
  assert.match(styles, /\.section-page-title \{\s*font-size:\s*clamp\(1\.4rem, 1\.5vw, 1\.6rem\);/);
  assert.match(styles, /\.focus-page-intro h1,[\s\S]*?#tab-visit-log \.visit-log-section-title,[\s\S]*?font-size:\s*clamp\(1\.3rem, 1\.35vw, 1\.45rem\);/);
  assert.match(styles, /@media \(min-width: 981px\) \{[\s\S]*?\.trend-chart \{\s*height:\s*220px;\s*min-height:\s*220px;/);
});

test('Bakery Reports keeps its controls separate from the result surface', () => {
  assert.match(styles, /\.visit-log-section-header \{\s*margin-bottom:\s*22px;/);
  assert.match(styles, /\.visit-log-list \{\s*margin-top:\s*0;/);
  assert.match(styles, /\.visit-log-list > \.table-wrap--floating,[\s\S]*?background:\s*var\(--surface-panel\);[\s\S]*?box-shadow:\s*var\(--elev-rest\);/);
});
