const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('Priority Overview and Bakery Reports promote their own heading into the main shell', () => {
  assert.match(html, /<h1>Priority Overview<\/h1>/);
  assert.match(html, /<h1 class="visit-log-section-title" id="visitLogSectionTitle">Visit History<\/h1>/);
  assert.match(app, /document\.body\.dataset\.targetSubtab = name;/);
  assert.match(styles, /body\[data-dash-tab="visit-log"\] \.section-page-title,[\s\S]*?data-target-subtab="summary"\][\s\S]*?display:\s*none;/);
});

test('the affected views use the dashboard main shell without a second card surface', () => {
  assert.match(styles, /body\[data-dash-tab="visit-log"\] #dashboardContent \.dashboard-workspace__main,[\s\S]*?data-target-subtab="summary"\][\s\S]*?background:\s*#fff;/);
  assert.match(styles, /#tab-visit-log > \.section,[\s\S]*?#tab-target \[data-target-subtab-panel="summary"\] > \.section \{[\s\S]*?padding:\s*0;[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/);
  assert.match(styles, /#tab-visit-log \.visit-log-section-title \{[\s\S]*?font-size:\s*1\.28rem;/);
});
