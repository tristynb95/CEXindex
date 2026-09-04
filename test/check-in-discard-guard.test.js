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
test('Escape backs out of the Log Visit modal through the same guard', () => {
  const start = source.indexOf("if (event.key !== 'Escape') return;");
  const end = source.indexOf('window.GAILS.closeVisitReport();', start);
  const escape = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  // The discard prompt is checked first, so Escape on the prompt keeps the
  // check-in rather than dismissing the form underneath it too.
  assert.ok(escape.indexOf('saveConfirmModal') < escape.indexOf('addSiteVisitModal'));
  assert.match(escape, /closeSaveConfirmModal\(\);\s*return;/);
  assert.match(escape, /requestCloseAddSiteVisitModal\(\)/);
  // Never falls through to closing the visit report while the form is open.
  assert.match(escape, /if \(!ownedByField\) window\.GAILS\.requestCloseAddSiteVisitModal\(\);\s*return;\s*\}\s*$/);
});

test('Escape is left to the dropdown and mention menu that own it', () => {
  const start = source.indexOf("var logVisit = document.getElementById('addSiteVisitModal');");
  const escape = source.slice(start, source.indexOf('window.GAILS.closeVisitReport();', start));

  // Both widgets handle Escape on the element itself, which runs before this
  // document listener, so the target is the only reliable signal left.
  assert.match(escape, /event\.target\.closest\('\.filter-select, \.mention-field'\)/);

  // The reason the target is all we have: neither widget stops the event, and
  // both have already closed themselves by the time it reaches the document.
  // If either ever starts calling stopPropagation, this check can go.
  const customSelects = fs.readFileSync(path.join(root, 'js', 'custom-selects.js'), 'utf8');
  const mentionField = fs.readFileSync(path.join(root, 'js', 'mention-field.js'), 'utf8');
  assert.match(customSelects, /event\.key === 'Escape'\) \{\s*closeMenu\(\);/);
  assert.match(mentionField, /else if \(event\.key === 'Escape'\) \{\s*event\.preventDefault\(\);\s*closeMenu\(\);/);
  assert.doesNotMatch(customSelects, /'Escape'[\s\S]{0,120}?stopPropagation/);
  assert.doesNotMatch(mentionField, /'Escape'[\s\S]{0,120}?stopPropagation/);

  // The wrapper class names the guard keys off are the ones the widgets build.
  assert.match(customSelects, /closest\('\.filter-select'\)/);
  assert.match(mentionField, /wrapper\.className = 'mention-field';/);
});
