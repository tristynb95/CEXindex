const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

test('every user-driven exit from the Log Visit modal goes through the guard', () => {
  // Clicking the backdrop is the accidental one the guard exists for; the close
  // button routes the same way so there is no unguarded way to lose a check-in.
  assert.match(html, /id="addSiteVisitModal"[\s\S]*?onclick="if\(event\.target===this\)GAILS\.requestCloseAddSiteVisitModal\(\)"/);
  assert.match(html, /onclick="GAILS\.requestCloseAddSiteVisitModal\(\)"\s*\n?\s*aria-label="Close log visit form"/);
  // Saving still dismisses the form outright — no discard prompt after a save.
  assert.match(source, /notifySuccess\(successParts\.join\(' · '\)\);[\s\S]{0,40}?window\.GAILS\.closeAddSiteVisitModal\(\);/);
});

test('the guard only prompts when there is unsaved work', () => {
  assert.match(source, /window\.GAILS\.requestCloseAddSiteVisitModal = function \(\) \{[\s\S]*?if \(!addSiteVisitIsDirty\(\)\) \{\s*window\.GAILS\.closeAddSiteVisitModal\(\);\s*return;\s*\}/);
  // A snapshot taken after the modal's own defaults are applied, so the
  // prefilled date, time, partner and preset bakery never read as edits.
  assert.match(source, /lockBackgroundScroll\(\);[\s\S]{0,240}?addSiteVisitPristine = addSiteVisitSnapshot\(\);/);
  assert.match(source, /closeAddSiteVisitModal = function \(\) \{[\s\S]*?addSiteVisitPristine = null;/);
  assert.match(source, /if \(addSiteVisitPristine === null\) return false;/);
});

test('the snapshot covers the notes and both halves of the follow-ups column', () => {
  const start = source.indexOf('function addSiteVisitSnapshot()');
  const end = source.indexOf('function addSiteVisitIsDirty()', start);
  const snapshot = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  for (const id of ['addVisitBakery', 'addVisitType', 'addVisitDate', 'addVisitTime',
    'addVisitPartner', 'addVisitMod', 'addVisitComments']) {
    assert.ok(snapshot.includes("val('" + id + "')"), id + ' is not in the snapshot');
  }
  assert.match(snapshot, /#addVisitOpenTasksList \.follow-up-check__box:checked/);
  assert.match(snapshot, /\.follow-up-builder__title[\s\S]*?\.follow-up-builder__date[\s\S]*?\.follow-up-builder__priority/);
});

test('the prompt offers continue or discard, defaulting to keeping the work', () => {
  const start = source.indexOf('window.GAILS.requestCloseAddSiteVisitModal');
  const end = source.indexOf('window.GAILS.openAddSiteVisitModal', start);
  const guard = source.slice(start, end);

  assert.match(guard, /title: 'Discard this check-in\?'/);
  assert.match(guard, /confirmLabel: 'Discard check-in'/);
  assert.match(guard, /cancelLabel: 'Continue check-in'/);
  // tone: 'danger' is what puts the initial focus on the button that keeps the
  // check-in, so Enter on the prompt never throws the work away.
  assert.match(guard, /tone: 'danger'/);
  assert.match(source, /opts\.tone === 'danger' && cancelBtn \? cancelBtn : confirmBtn/);
  assert.match(guard, /onConfirm: function \(\) \{ window\.GAILS\.closeAddSiteVisitModal\(\); \}/);
});

test('the shared confirm dialog can rename its cancel button and puts it back', () => {
  assert.match(source, /if \(cancelBtn\) cancelBtn\.textContent = opts\.cancelLabel \|\| 'Cancel';/);
  assert.match(source, /closeSaveConfirmModal = function \(\) \{[\s\S]*?cancelBtn\.textContent = 'Cancel';/);
});
