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
  // The banner used to carry an eyebrow and a description as well as the title,
  // and switchPanel read all three out of the active nav button — including two
  // spans that were display:none and existed only to be read. The banner is one
  // line now, so what has to stay synchronized is the title and document.title.
  assert.match(script, /panelTitle\.textContent = label/);
  assert.match(script, /document\.title = label \+ ' — GAIL’s Admin'/);
  assert.doesNotMatch(html, /admin-pg-nav__eyebrow|admin-pg-nav__meta/);
  assert.match(script, /deleteConfirmModal\.style\.display = 'none';\s*resolve\(false\)/);
  assert.match(script, /cqvConfirmModal[\s\S]*?closeCqvConfirmModal\(\)[\s\S]*?visitDetailModal[\s\S]*?closeVisitDetail\(\)/);
});

test('the page has one h1, and it is the panel title', () => {
  // There was no h1 and no h2 on this page at all — a flat run of h3s that mixed
  // panel sections with control labels inside buttons, so a screen reader's
  // heading list had no top-level anchor to navigate by.
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  assert.match(html, /<h1 id="adminPanelTitle">/);
  assert.match(html, /class="admin-skip-link" href="#adminPanelTitle"/);
  assert.ok((html.match(/<h2>/g) || []).length >= 5, 'panel sections should be h2');
});

test('the workspace status is one line in the bar, not a band of its own', () => {
  // The 66px command strip restated the four figures that the Overview panel
  // already showed, on every panel, forever.
  assert.doesNotMatch(html, /admin-command-strip/);
  assert.match(html, /class="admin-topbar__status"[\s\S]*?id="adminHeroSummary"[\s\S]*?id="adminHeroMeta"/);
  // The stat row now lives on Overview, once.
  assert.match(html, /data-admin-panel-content="overview"[\s\S]*?id="adminSummaryCards"/);
  assert.equal((html.match(/id="adminSummaryCards"/g) || []).length, 1);
});

test('unsaved site changes are committed from a bar that names them', () => {
  assert.match(html, /id="adminSaveBar"[^>]*hidden/);
  assert.match(html, /id="resetSitesBtn"[^>]*>Discard changes</);
  assert.match(html, /id="saveSitesBtn"[^>]*>Save changes</);
  assert.match(script, /function describeSiteChanges\(\)/);
  assert.match(css, /\.admin-body \.admin-save-bar\s*\{[\s\S]*?position:\s*sticky/);
  // Discarding drops the site draft, the region assignments and the ops-area
  // assignments at once with no undo, so it asks first.
  assert.match(script, /resetSitesBtn\.addEventListener\('click', async function\(\)[\s\S]*?await promptUnsavedChanges/);
});

test('every admin dialog traps focus, restores it, and locks the page behind it', () => {
  // Seven dialogs declared aria-modal="true" and none of them behaved modally:
  // Tab walked out of the person access modal into the People table behind it,
  // closing dropped focus on <body>, and the wheel scrolled the table under the
  // overlay. js/drilldown.js already solved all three for the Focus Bakery modal.
  assert.match(script, /var modalOverlays = Array\.from\(document\.querySelectorAll\('\.modal-overlay'\)\)/);
  assert.match(script, /function focusableWithin\(modal\)/);
  assert.match(script, /if \(event\.key !== 'Tab'\) return/);
  // The topmost dialog owns the tab ring, matching the Escape priority chain.
  assert.match(script, /var modal = stack\[stack\.length - 1\]/);
  // Focus goes back to whatever opened it.
  assert.match(script, /modalReturnFocus\.set\(modal, document\.activeElement\)/);
  // The page shell is fixed at 100dvh, so the scroller behind an overlay is
  // .admin-workspace__main, not <body>.
  assert.match(script, /workspaceMain\.style\.overflow = 'hidden'/);
  assert.match(script, /workspaceMain\.scrollTop = lockedWorkspaceScroll/);
});

test('estate-wide destructive actions are typed confirmations, not native confirm()', () => {
  // Deleting one visit required typing "delete record"; clearing the shared
  // dataset for the whole company was a grey OS box where Enter means OK.
  assert.match(script, /confirmWord: 'clear dataset'/);
  assert.match(script, /confirmWord: 'restore defaults'/);
  assert.match(html, /id="deleteConfirmWord"/);
  assert.match(script, /var word = \(opts\.confirmWord \|\| 'delete record'\)\.toLowerCase\(\)/);
  // Importing a workbook publishes immediately and drops the draft underneath it.
  assert.match(script, /async function confirmSiteImport\(\)[\s\S]*?await promptUnsavedChanges/);
});

test('directory operations live with the directory they change', () => {
  // Restore / Sync coordinates / Export all write or read portalData/siteMeta,
  // which the database rules gate on admin.sites — but they sat in the Dataset
  // panel, gated on `dataset`, where a dataset-only role could click them.
  const sites = html.slice(
    html.indexOf('data-admin-panel-content="sites"'),
    html.indexOf('data-admin-panel-content="visits"')
  );
  ['syncCoordinatesBtn', 'exportSiteMetaBtn', 'restoreMetadataBtn'].forEach((id) => {
    assert.ok(sites.includes('id="' + id + '"'), id + ' should live in the sites panel');
  });
  assert.match(script, /sites: \[[\s\S]*?restoreMetaBtn,\s*syncCoordinatesBtn/);
  // "← Go to Dashboard" duplicated the top-bar link, one slot from Clear dataset.
  assert.doesNotMatch(html, /portalUploadBtn/);
  assert.doesNotMatch(script, /portalUploadBtn/);
});

test('the admins/ mirror is written only by a real full admin', () => {
  // database.rules.json keys off root.child('admins').child(auth.uid), so these
  // three writes need isFullAdmin. isAdmin is also true for a custom role with
  // admin areas, whose write failed *after* users/{uid} had already been written.
  assert.equal((script.match(/state\.isFullAdmin\) await set\(ref\(db, 'admins\//g) || []).length, 1);
  assert.match(script, /if \(state\.isFullAdmin\) \{\s*if \(draft\.role === 'admin'\)/);
  assert.match(script, /await remove\(ref\(db, 'users\/' \+ uid\)\);\s*if \(state\.isFullAdmin\)/);
});

test('the People table can be searched, filtered and sorted', () => {
  ['userSearchInput', 'userDepartmentFilter', 'userRoleFilter', 'userStatusFilter', 'userSortSelect']
    .forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.match(script, /function getVisiblePeople\(\)/);
  // Searches survive a panel change; they used to be wiped on every switch.
  assert.doesNotMatch(script, /siteSearchInput\.value = '';\s*state\.siteSearch = ''/);
  // Typing rebuilt the whole table body on every keystroke.
  assert.match(script, /function debounce\(fn, wait\)/);
  assert.match(script, /renderUsersDebounced\(\)/);
  // Four kinds of record share the visits table and only the badge told them apart.
  assert.match(html, /id="visitTypeFilter"/);
  assert.match(script, /var kind = v\.type \|\| 'routine'/);
});

test('long tables get taller on taller screens and their headers stick', () => {
  // `min(430px, …)` meant the 430px term won on any viewport over 680px tall, so
  // a 1440px monitor showed the same eleven rows as a 768px laptop.
  assert.match(css, /\.admin-table-wrap--tall\s*\{\s*max-height:\s*max\(320px,/);
  // position: sticky on th resolves against .admin-table-wrap, which only
  // scrolls when it has a height — People and Roles had none.
  const peopleWrap = html.slice(html.indexOf('id="usersMsg"'), html.indexOf('id="adminUserList"'));
  assert.match(peopleWrap, /admin-table-wrap admin-table-wrap--tall/);
  const rolesWrap = html.slice(html.indexOf('id="roleMsg"'), html.indexOf('id="adminRoleList"'));
  assert.match(rolesWrap, /admin-table-wrap admin-table-wrap--tall/);
});

test('the admin surface aliases the brand tokens instead of forking them', () => {
  // css/admin.css opened by declaring a parallel palette — a cool grey-green page
  // background against the brand cream, its own ink, and its own accent red — so
  // a palette change on the dashboard could never reach this page.
  assert.match(css, /--admin-bg: var\(--bg-2\)/);
  assert.match(css, /--admin-ink: var\(--text\)/);
  assert.match(css, /--admin-accent: var\(--accent\)/);
  assert.match(css, /--admin-line: var\(--card-border\)/);
  // Shadows are warm brown, never pure black.
  assert.doesNotMatch(css, /rgba\(0, 0, 0/);
  // Inter is loaded as five static faces; 650 and 750 are not among them.
  assert.doesNotMatch(css, /font-weight:\s*(650|750)\b/);
  // Nothing renders below the legible floor: th was 0.56rem (8.96px at a 16px root).
  const sizes = [...css.matchAll(/font-size:\s*(0\.\d+)rem/g)].map((m) => parseFloat(m[1]));
  const tooSmall = sizes.filter((v) => v < 0.68);
  assert.equal(tooSmall.length, 0, 'font sizes below 0.68rem: ' + tooSmall.join(', '));
});

test('Overview reports what needs doing rather than restating the stat row', () => {
  assert.doesNotMatch(html, /admin-action-card/);
  assert.match(script, /function buildAttentionItems\(\)/);
  // Never point somebody at a panel their role cannot open.
  assert.match(script, /var area = PANEL_AREAS\[item\.panel\];\s*return !area \|\| canView\(area\)/);
});

test('the compact shell adapts at tablet, mobile, and short-screen sizes', () => {
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(max-height: 680px\) and \(min-width: 981px\)/);
  // Collapsing the rail below 980px used to set `display: none` on the nav, and
  // navigateToAdminPanel force-collapses on narrow viewports — so choosing a
  // panel on a tablet made the navigation disappear. Collapsed means icons-only
  // here, the same as it does on the desktop rail.
  assert.match(css, /data-sidebar-collapsed="true"\] \.admin-workspace__nav\s*\{\s*display:\s*grid/);
  assert.match(css, /data-sidebar-collapsed="true"\] \.admin-workspace__nav \.admin-pg-nav__content\s*\{\s*display:\s*none/);
});
