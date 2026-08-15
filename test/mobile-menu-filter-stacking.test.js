const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('opening the mobile nav drawer marks the body so the filter FAB drops behind it', () => {
  // The floating filter tab sits at z-index:45, above the nav drawer's
  // z-index:40, so it stays visible/tappable over an open drawer unless
  // something explicitly hides it while the drawer is open.
  assert.match(app, /function setDashboardSidebarOpen\(open\) \{[\s\S]*?document\.body\.classList\.toggle\('dashboard-nav-open', !!open\)[\s\S]*?\}/);
  assert.match(styles, /body\.dashboard-nav-open \.filter-side-tab \{[\s\S]*?pointer-events: none;[\s\S]*?\}/);
});
