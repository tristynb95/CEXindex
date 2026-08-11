const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

test('desktop dashboard uses a docked rail and fluid content column', () => {
  assert.match(html, /<div class="container" id="dashboardContainer"/);
  assert.match(styles, /@media \(min-width: 981px\)[\s\S]*?#dashboardContainer \{[\s\S]*?max-width:\s*none;/);
  assert.match(styles, /#dashboardContainer \{[\s\S]*?padding:\s*0 clamp\(18px, 1\.5vw, 30px\) 28px 0;/);
  assert.match(styles, /#dashboardContent \{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\);/);
  assert.match(styles, /#dashboardContent > \.dashboard-workspace \{\s*display:\s*contents;/);
  assert.match(styles, /#dashboardContent \.dashboard-sidebar \{[\s\S]*?grid-row:\s*1 \/ span 2;/);
  assert.match(styles, /--dashboard-header-h:\s*57px;/);
  assert.match(styles, /\.header \{[\s\S]*?height:\s*var\(--dashboard-header-h\);[\s\S]*?min-height:\s*var\(--dashboard-header-h\);/);
  // The rail itself is a plain equal-height column (align-self: stretch), not
  // an independently sticky, viewport-height box — a fixed height there can
  // exceed its own containing block on short-content tabs, forcing sticky to
  // shove it up behind the header once the page's scroll runs out. It also
  // must not inherit the base rule's overflow:hidden, which would silently
  // cancel the sticky pinned-head/nav wrapper inside it.
  assert.match(styles, /#dashboardContent \.dashboard-sidebar \{[\s\S]*?align-self:\s*stretch;[\s\S]*?overflow:\s*visible;/);
  assert.doesNotMatch(
    styles.match(/#dashboardContent \.dashboard-sidebar \{[^}]*\}/)[0],
    /position:\s*sticky|height:\s*calc\(100dvh/
  );
  // The menu title/collapse control and the nav list are grouped in one
  // .dashboard-sidebar__pinned wrapper (see index.html) so they scroll and
  // stick together — the part that actually has to stay on screen, so it
  // carries the sticky positioning and its own scroll/overflow handling.
  assert.match(html, /<div class="dashboard-sidebar__pinned">[\s\S]*?dashboard-sidebar__head[\s\S]*?<nav class="dashboard-nav"/);
  assert.match(styles, /#dashboardContent \.dashboard-sidebar__pinned \{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*var\(--dashboard-header-h\);[\s\S]*?max-height:\s*calc\(100dvh - var\(--dashboard-header-h\)\);/);
  assert.match(styles, /#dashboardContent > \.filter-bar,[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*1;/);
  assert.match(styles, /#dashboardContent > \.filter-bar,[\s\S]*?margin:\s*12px 0 0;/);
  assert.match(styles, /#dashboardContent \.dashboard-sidebar \{[\s\S]*?border:\s*0;[\s\S]*?border-right:[\s\S]*?border-radius:\s*0;[\s\S]*?box-shadow:\s*none;/);
  assert.match(styles, /#dashboardContent \.dashboard-workspace__main \{[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*2;/);
});

test('dashboard reveal removes the upload-state override instead of defeating the desktop grid', () => {
  assert.doesNotMatch(app, /dashboardContent'\)\.style\.display\s*=\s*'block'/);
  assert.match(app, /function revealDashboardContent\(\)[\s\S]*?style\.removeProperty\('display'\)/);

  const start = app.indexOf('function revealDashboardContent()');
  const end = app.indexOf('// ========== INITIALISE DASHBOARD ==========', start);
  const removed = [];
  const dashboardContent = {
    style: {
      display: 'none',
      removeProperty(name) {
        removed.push(name);
        if (name === 'display') this.display = '';
      }
    }
  };
  const sandbox = {
    document: {
      getElementById(id) {
        return id === 'dashboardContent' ? dashboardContent : null;
      }
    }
  };

  require('node:vm').runInNewContext(app.slice(start, end) + '\nrevealDashboardContent();', sandbox);

  assert.deepEqual(removed, ['display']);
  assert.equal(dashboardContent.style.display, '');
});
