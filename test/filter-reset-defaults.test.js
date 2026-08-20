const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Reset restores View to Bakeries and Period to Last Month, so those are the
// values the badge and the Reset button have to measure "unfiltered" against —
// otherwise a grouped view or a widened period sits on the dashboard with
// nothing offering to clear it.
test('the dashboard defaults Reset restores are the defaults the badge measures', () => {
  assert.match(html, /<option value="bakeries" selected>Bakeries<\/option>/);
  assert.match(html, /<option value="1" selected>Last Month<\/option>/);
  assert.match(app, /state\.dashboardView = 'bakeries';\s*var dashboardViewSelect/);
  assert.match(app, /rollingWindow\.value = '1';/);
});

test('View and Period count towards the filter badge once they leave their defaults', () => {
  assert.match(app, /function countActiveFilters\(\) \{[\s\S]*?if \(isNonDefaultDashboardView\(\)\) count\+\+;\s*if \(isNonDefaultPeriod\(\)\) count\+\+;/);
  assert.match(app, /function isNonDefaultDashboardView\(\)[\s\S]*?state\.dashboardView !== 'bakeries'/);
  assert.match(app, /function isNonDefaultPeriod\(\)[\s\S]*?return rollingWindow\.value !== '1';/);
  // The badge count is what disables Reset, so a non-default View or Period
  // switches the button on with no other filter set.
  assert.match(app, /filterPanelReset\.disabled = n === 0/);
});

test('a pinned month counts as one filter, not two', () => {
  // Picking a month parks Period on All Time, so Period's own non-default test
  // must not fire a second time for the same decision.
  assert.match(app, /document\.getElementById\('rollingWindow'\)\.value = '0';/);
  assert.match(app, /if \(monthSelect\.value\) return true;\s*return rollingWindow\.value !== '1';/);
});

test('the badge ignores controls the active tab does not offer', () => {
  // View is hidden on the tabs fixed to bakery level, and Period is locked on
  // Focus Bakeries — neither is a filter the user chose there.
  assert.match(app, /DASHBOARD_VIEW_SCOPED_TABS && DASHBOARD_VIEW_SCOPED_TABS\[currentTab\]/);
  assert.match(app, /if \(monthSelect\.disabled\) return false;/);
  // Both tests are tab-dependent, so switching tab or Focus sub-tab re-reads
  // them rather than waiting for the next filter change.
  assert.match(app, /updateBandFilterOptions\(\);[\s\S]{0,200}?syncFilterBadge\(\);/);
  assert.match(app, /syncFocusPeriodControls\(\);[\s\S]{0,200}?syncFilterBadge\(\);/);
});

test('Reset defaults the parked period rather than the one the Focus map holds', () => {
  assert.match(app, /if \(focusMapPeriodMemo\) \{[\s\S]*?focusMapPeriodMemo = \{ month: '', rolling: '1' \};\s*\} else \{/);
});

// The banner Reset button (js/utils.js HEADER_RESET_BTN) has no chip of its
// own for Period, since Period lives in the always-shown core pill — so its
// visibility has to fold in isNonDefaultPeriod() directly rather than relying
// solely on hasActiveFilterPills(pills).
test('the banner reset button also reacts to a non-default period, not just filter chips', () => {
  assert.match(app, /var showReset = \(G\.hasActiveFilterPills && G\.hasActiveFilterPills\(pills\)\) \|\| isNonDefaultPeriod\(\);/);
});
