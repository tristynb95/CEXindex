const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'js/admin-page.js'), 'utf8');

test('admin provides an accessible save, discard, or keep-editing decision', () => {
  assert.match(html, /id="unsavedChangesModal"[\s\S]*role="alertdialog"/);
  assert.match(html, /id="unsavedChangesCancel"[^>]*>Keep editing</);
  assert.match(html, /id="unsavedChangesDiscard"[^>]*>Discard changes</);
  assert.match(html, /id="unsavedChangesSave"[^>]*>Save changes</);
});

test('refresh and page close are blocked whenever any admin draft is unsaved', () => {
  assert.match(js, /function hasUnsavedAdminChanges\(\)[\s\S]*hasSiteChanges\(\)[\s\S]*dirtyDrafts\.size[\s\S]*state\.cqvPending/);
  assert.match(js, /window\.addEventListener\('beforeunload'[\s\S]*hasUnsavedAdminChanges\(\)[\s\S]*event\.preventDefault\(\)[\s\S]*event\.returnValue = ''/);
});

test('switching admin panels resolves site changes before changing the view', () => {
  assert.match(js, /async function navigateToAdminPanel\(panelName\)[\s\S]*await resolveSiteChangesBeforeLeaving[\s\S]*switchPanel\(panelName\)/);
  assert.match(js, /nav\.addEventListener\('click', async function[\s\S]*await navigateToAdminPanel/);
  assert.match(js, /choice === 'save'\) return saveSiteData\(\)/);
  assert.match(js, /choice === 'discard'[\s\S]*discardSiteChanges\(\)/);
});

test('a partially entered bakery is staged before site data is saved', () => {
  assert.match(js, /function hasSiteEntryDraft\(\)/);
  assert.match(js, /function stageSiteEntry\(\)[\s\S]*if \(!name && !region && !ops\) return true/);
  assert.match(js, /async function saveSiteData\(\)[\s\S]*if \(!stageSiteEntry\(\)\) return false/);
});

test('editable admin dialogs track drafts and guard their close actions', () => {
  for (const context of ['access', 'role', 'invite', 'visit']) {
    assert.match(js, new RegExp(`markDraftDirty\\('${context}', true\\)`));
  }
  for (const closeGuard of [
    'requestCloseAccessModal',
    'requestCloseRoleEditor',
    'requestCloseInviteModal',
    'requestCloseVisitDetail',
    'requestCloseCqvConfirmModal'
  ]) {
    assert.match(js, new RegExp(`function ${closeGuard}\\(`));
  }
});
