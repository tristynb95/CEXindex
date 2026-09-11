const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const visualPass = styles.slice(styles.indexOf('VISUAL ELEVATION PASS'));

test('dashboard canvas and passive cards use calm, flat surfaces', () => {
  assert.match(visualPass, /\.glass-bg \{\s*background:\s*var\(--surface-canvas\);\s*background-size:\s*auto;/);
  assert.match(visualPass, /\.header::after \{\s*display:\s*none;/);
  assert.match(visualPass, /\.kpi \{[\s\S]*?background:\s*var\(--surface-panel\);[\s\S]*?border-radius:\s*14px;[\s\S]*?box-shadow:\s*var\(--elev-rest\);/);
  assert.match(visualPass, /\.kpi:hover \{[\s\S]*?transform:\s*none;[\s\S]*?box-shadow:\s*var\(--elev-rest\);/);
  assert.match(visualPass, /\.overview-card,\s*\.trend-card \{[\s\S]*?background:\s*var\(--surface-panel\);/);
  assert.match(visualPass, /\.trend-card::before,\s*\.kpi::before \{\s*display:\s*none;/);
});

test('interactive chrome retains clear keyboard focus and usable targets', () => {
  assert.match(visualPass, /\.dashboard-sidebar__toggle:focus-visible \{[\s\S]*?outline:\s*2px solid var\(--accent\);/);
  assert.match(visualPass, /#profileMenuBtn:focus-visible \{[\s\S]*?outline:\s*2px solid rgba\(255, 255, 255, 0\.9\);/);
  assert.match(visualPass, /\.header \.header-pill__clear \{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/);
});

test('wide-screen header chips stay on one scrollable line', () => {
  assert.match(styles, /@media \(min-width: 1181px\) \{[\s\S]*?\.header \.sub \{[\s\S]*?display:\s*flex;[\s\S]*?white-space:\s*nowrap;[\s\S]*?overflow-x:\s*auto;/);
  assert.match(styles, /\.header \.header-sub-pillwrap \{[\s\S]*?display:\s*inline-flex;[\s\S]*?flex-wrap:\s*nowrap;/);
});
