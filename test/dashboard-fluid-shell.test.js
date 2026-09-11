const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const drawerStyles = styles.slice(styles.indexOf('DESKTOP FILTER DRAWER'));

test('desktop dashboard uses a docked rail and fluid content column', () => {
  assert.match(html, /<div class="container" id="dashboardContainer"/);
  assert.match(styles, /@media \(min-width: 981px\)[\s\S]*?#dashboardContainer \{[\s\S]*?max-width:\s*none;/);
  assert.match(styles, /#dashboardContainer \{[\s\S]*?padding:\s*0 clamp\(12px, 1vw, 20px\) 20px 0;/);
  assert.match(styles, /#dashboardContent \{[\s\S]*?--dashboard-sidebar-w:\s*212px;[\s\S]*?grid-template-columns:\s*var\(--dashboard-sidebar-w\) minmax\(0, 1fr\);/);
  assert.match(styles, /#dashboardContent:has\(> \.dashboard-workspace\[data-sidebar-collapsed=true\]\) \{[\s\S]*?--dashboard-sidebar-w:\s*84px;/);
  assert.match(styles, /#dashboardContent\s*>\s*\.dashboard-workspace \{\s*display:\s*contents;/);
  assert.match(styles, /#dashboardContent \.dashboard-sidebar \{[\s\S]*?grid-row:\s*1 \/ span 2;/);
  // Compact wide screens while retaining the taller fallback where chips may wrap.
  assert.match(styles, /--dashboard-header-h:\s*70px;/);
  assert.match(styles, /@media \(min-width: 1181px\) \{[\s\S]*?--dashboard-header-h:\s*60px;/);
  assert.match(styles, /\.header \{[\s\S]*?height:\s*var\(--dashboard-header-h\);[\s\S]*?min-height:\s*var\(--dashboard-header-h\);/);
  // The complete menu rail is fixed below the header and anchored to the
  // viewport bottom, so the document boundary cannot push it upward.
  assert.match(styles, /#dashboardContent \.dashboard-sidebar \{[\s\S]*?position:\s*fixed;[\s\S]*?top:\s*var\(--dashboard-header-h\);[\s\S]*?bottom:\s*0;[\s\S]*?left:\s*0;[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*hidden;/);
  assert.match(styles, /#dashboardContent \.dashboard-sidebar \{[\s\S]*?width:\s*var\(--dashboard-sidebar-w\);[\s\S]*?flex-basis:\s*var\(--dashboard-sidebar-w\);/);
  // The title/collapse control and nav list share an internal scrolling region
  // for unusually short viewports without moving the rail itself.
  assert.match(html, /<div class="dashboard-sidebar__pinned">[\s\S]*?dashboard-sidebar__head[\s\S]*?<nav class="dashboard-nav"/);
  assert.match(styles, /#dashboardContent \.dashboard-sidebar__pinned \{[\s\S]*?height:\s*100%;[\s\S]*?max-height:\s*100%;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(styles, /#dashboardContent\s*>\s*\.filter-bar,[\s\S]*?grid-column:\s*2;[\s\S]*?grid-row:\s*1;/);
  assert.match(drawerStyles, /@media \(min-width: 721px\) \{[\s\S]*?#dashboardContent\s*>\s*\.filter-bar,[\s\S]*?height:\s*0;[\s\S]*?margin:\s*0;/);
  assert.match(drawerStyles, /\.filter-controls \{[\s\S]*?top:\s*var\(--dashboard-header-h, 70px\);/);
  assert.match(drawerStyles, /\.visit-log-filter-panel \{[\s\S]*?top:\s*var\(--dashboard-header-h, 70px\);/);
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
