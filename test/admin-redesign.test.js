const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('admin.html');
const css = read('css/admin.css');
const script = read('js/admin-page.js');

test('the whole admin surface uses its own scoped application design', () => {
  assert.match(html, /<body class="admin-body">/);
  assert.match(html, /css\/styles\.css[^>]+>\s*<link rel="stylesheet" href="css\/admin\.css/);
  assert.match(css, /\.admin-body\s*\{/);

  const panelNames = ['overview', 'access', 'sites', 'data', 'visits'];
  panelNames.forEach((name) => {
    assert.match(html, new RegExp(`data-admin-panel="${name}"`));
    assert.match(html, new RegExp(`data-admin-panel-content="${name}"`));
  });
});

test('the admin guard reuses the main loading logo and text dimensions', () => {
  assert.match(html, /<div id="authGuard" class="admin-page-guard">[\s\S]*?class="auth-loading-content"[\s\S]*?class="auth-loading__logo"[\s\S]*?class="auth-loading__text"/);
  assert.match(html, /class="auth-loading__text">Verifying Admin Access\.\.\. <span class="auth-small-spinner">/);
  assert.match(css, /\.admin-body \.auth-loading__logo\s*\{\s*box-sizing:\s*content-box;\s*\}/);
  assert.doesNotMatch(css, /\.admin-body \.auth-loading__text/);
  assert.doesNotMatch(css, /\.admin-body \.auth-loading-content/);
  assert.match(css, /\.admin-body \.admin-page-guard\s*\{[\s\S]*?var\(--admin-sidebar\)/);
});

test('the redesign uses compact navigation, controls, rows, and content cards', () => {
  assert.match(css, /admin-workspace__hero[\s\S]*?flex:\s*0 0 58px/);
  assert.match(css, /admin-workspace__sidebar\s*\{[\s\S]*?width:\s*224px/);
  assert.match(css, /input\[type="email"\][\s\S]*?min-height:\s*34px/);
  assert.match(css, /admin-table th,[\s\S]*?height:\s*38px/);
  assert.match(css, /admin-section\s*\{[\s\S]*?padding:\s*15px/);
});

test('the people table wraps access summaries and keeps Manage visible', () => {
  assert.match(css, /admin-table--people\s*\{[\s\S]*?table-layout:\s*fixed/);
  assert.match(css, /admin-table--people td\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(css, /admin-table--people th:last-child,[\s\S]*?position:\s*sticky;[\s\S]*?right:\s*0/);
  assert.match(css, /admin-table--people td:last-child \.admin-table__actions\s*\{[\s\S]*?flex-wrap:\s*nowrap/);
});

test('every admin modal has a consistent accessible frame', () => {
  [
    'visitDetailModal',
    'deleteConfirmModal',
    'cqvConfirmModal',
    'userAccessModal',
    'roleEditorModal',
    'inviteUserModal'
  ].forEach((id) => assert.match(html, new RegExp(`id="${id}"`)));

  assert.match(html, /role="alertdialog" aria-modal="true" aria-labelledby="deleteConfirmTitle"/);
  assert.match(html, /id="cqvConfirmModal"[\s\S]*?role="dialog" aria-modal="true"/);
  assert.match(html, /id="visitDetailModal"[\s\S]*?role="dialog" aria-modal="true"/);
  assert.match(css, /\.admin-body \.access-modal\s*\{[\s\S]*?max-height:\s*calc\(100dvh - 32px\)/);
  assert.match(css, /\.admin-body \.admin-dialog\s*\{/);
});

test('the Manage Access body scrolls without collapsing its lower controls', () => {
  assert.match(css, /\.admin-body \.access-modal__body\s*\{[\s\S]*?min-height:\s*0/);
  assert.match(css, /#userAccessModal \.access-modal__body > \*\s*\{\s*flex-shrink:\s*0/);
});

test('panel context and dialog dismissal stay synchronized in JavaScript', () => {
  assert.match(script, /btn\.setAttribute\('aria-current', isActive \? 'page' : 'false'\)/);
  assert.match(script, /panel\.setAttribute\('aria-hidden', String\(!isActive\)\)/);
  assert.match(script, /panelDescription\.textContent = description/);
  assert.match(script, /deleteConfirmModal\.style\.display = 'none';\s*resolve\(false\)/);
  assert.match(script, /cqvConfirmModal[\s\S]*?closeCqvConfirmModal\(\)[\s\S]*?visitDetailModal[\s\S]*?closeVisitDetail\(\)/);
});

test('the compact shell adapts at tablet, mobile, and short-screen sizes', () => {
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(max-height: 680px\) and \(min-width: 981px\)/);
  assert.match(css, /data-sidebar-collapsed="true"[\s\S]*?admin-workspace__nav[\s\S]*?display:\s*none/);
});
