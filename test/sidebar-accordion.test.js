const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('Focus Bakery and Bakery Reports views live under their main-menu parents', () => {
  const navEnd = html.indexOf('</nav>');
  const focusWorkspace = html.indexOf('id="targetTabWorkspace"');
  const reportsPanel = html.indexOf('id="tab-visit-log"');

  assert.ok(html.indexOf('data-nav-accordion="target"') < navEnd);
  assert.ok(html.indexOf('data-target-subtab="summary"') < navEnd);
  assert.ok(html.indexOf('data-nav-accordion="visit-log"') < navEnd);
  assert.ok(html.indexOf('id="visitLogViewToggle"') < navEnd);
  assert.ok(html.indexOf('data-target-subtab="summary"') < focusWorkspace);
  assert.ok(html.indexOf('id="visitLogViewToggle"') < reportsPanel);
  assert.equal((html.match(/id="visitLogViewToggle"/g) || []).length, 1);
});

test('the parent buttons expose accessible accordion state', () => {
  assert.match(html, /data-nav-accordion-toggle="target"[^>]*aria-expanded="false"[^>]*aria-controls="dashboardNavTargetSubmenu"/s);
  assert.match(html, /data-nav-accordion-toggle="visit-log"[^>]*aria-expanded="false"[^>]*aria-controls="visitLogViewToggle"/s);
  assert.match(html, /id="dashboardNavTargetSubmenu"[^>]*data-nav-accordion-panel="target"[^>]*hidden/);
  assert.match(html, /id="visitLogViewToggle"[^>]*data-nav-accordion-panel="visit-log"[^>]*hidden/);
});

test('one shared state update closes every accordion except the requested branch', () => {
  assert.match(app, /function setDashboardNavAccordion\(name\) \{[\s\S]*?document\.querySelectorAll\('\[data-nav-accordion\]'\)\.forEach/);
  assert.match(app, /var isOpen = !!name && branch\.dataset\.navAccordion === name/);
  assert.match(app, /toggle\.setAttribute\('aria-expanded', String\(isOpen\)\)/);
  assert.match(app, /panel\.hidden = !isOpen/);
  assert.match(app, /setDashboardNavAccordion\(shouldOpen \? accordionName : ''\)/);

  const makeBranch = (key) => {
    const toggle = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const panel = { hidden: true };
    return {
      dataset: { navAccordion: key },
      toggle,
      panel,
      querySelector(selector) {
        return selector === '[data-nav-accordion-toggle]' ? toggle : panel;
      }
    };
  };
  const branches = [makeBranch('target'), makeBranch('visit-log')];
  const start = app.indexOf('function setDashboardNavAccordion');
  const end = app.indexOf('function syncDashboardSidebarForViewport', start);
  const sandbox = {
    document: { querySelectorAll: () => branches }
  };
  vm.runInNewContext(app.slice(start, end) + '\nsetDashboardNavAccordion("target");', sandbox);
  assert.equal(branches[0].panel.hidden, false);
  assert.equal(branches[1].panel.hidden, true);
  assert.equal(branches[0].toggle.attributes['aria-expanded'], 'true');

  vm.runInNewContext(app.slice(start, end) + '\nsetDashboardNavAccordion("visit-log");', sandbox);
  assert.equal(branches[0].panel.hidden, true);
  assert.equal(branches[1].panel.hidden, false);
  assert.equal(branches[0].toggle.attributes['aria-expanded'], 'false');
  assert.equal(branches[1].toggle.attributes['aria-expanded'], 'true');
});

test('the accordion stays usable in the collapsed rail and mobile drawer', () => {
  assert.match(app, /if \(railIsCollapsed\) setDashboardSidebarCollapsed\(false\)/);
  assert.match(app, /activateDashboardTab\(t\.dataset\.tab, \{ keepSidebarOpen: true \}\)/);
  assert.match(app, /document\.querySelectorAll\('\[data-target-subtab\]'\)/);
  assert.match(app, /document\.querySelectorAll\('#visitLogViewToggle \[data-view\]'\)/);
  assert.match(styles, /\.dashboard-nav__submenu\[hidden\] \{\s*display: none;/);
  assert.match(styles, /data-sidebar-collapsed="true"\] \.dashboard-nav__submenu \{\s*display: none;/);
});

test('submenu rows use the parent width without a left active accent', () => {
  assert.match(styles, /\.dashboard-nav__submenu \{[^}]*margin:\s*0 0 2px;[^}]*padding:\s*1px 0 1px 5px;[^}]*border:\s*0;/s);
  assert.match(styles, /\.dashboard-nav__submenu \.target-subtab \{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;/s);
  assert.match(styles, /\.dashboard-nav__submenu \.target-subtab\.active \{[^}]*box-shadow:\s*none;/s);
  assert.doesNotMatch(styles, /\.dashboard-nav__submenu \.target-subtab\.active \{[^}]*inset\s+\d+px\s+0/s);
});

test('submenu rows reserve icons for top-level navigation', () => {
  assert.doesNotMatch(html, /target-subtab__icon/);
  assert.doesNotMatch(styles, /\.target-subtab__icon/);
  assert.match(styles, /\.dashboard-nav__submenu \.target-subtab \{[^}]*padding:\s*5px 8px 5px 31px;/s);
});

test('the menu prioritizes real destinations and keeps their purpose icons', () => {
  const nav = html.slice(html.indexOf('<nav class="dashboard-nav"'), html.indexOf('</nav>'));
  assert.doesNotMatch(nav, /Telemetry|coming soon|aria-disabled="true"/i);
  assert.equal((nav.match(/class="tab dashboard-nav__btn/g) || []).length, 7);
  assert.equal((nav.match(/class="dashboard-nav__icon"/g) || []).length, 7);
});

test('desktop density keeps expanded branches from burying later destinations', () => {
  assert.match(styles, /\.dashboard-nav__btn \{[^}]*min-height:\s*var\(--control-h\);[^}]*padding:\s*7px 10px;/s);
  assert.match(styles, /\.dashboard-nav__submenu \.target-subtab \{[^}]*min-height:\s*28px;/s);
  assert.match(styles, /\.dashboard-nav__group-title \{[^}]*margin:\s*6px 0 1px;[^}]*font-size:\s*0\.6rem;/s);
  assert.match(styles, /\.dashboard-nav__btn\.active \{[^}]*background:\s*rgba\(178, 42, 36, 0\.085\);[^}]*box-shadow:\s*none;/s);
  assert.doesNotMatch(styles, /\.dashboard-nav__btn\.active \{[^}]*linear-gradient/s);
});
