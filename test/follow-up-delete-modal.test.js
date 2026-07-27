const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('follow-up deletion uses the branded confirmation modal instead of a browser prompt', () => {
  const start = source.indexOf("var deleteBtn = closest('[data-followup-delete]')");
  const end = source.indexOf('\n          if (closest(\'.visit-log-show-more\'))', start);
  const handler = source.slice(start, end);

  assert.ok(start >= 0);
  assert.match(handler, /window\.GAILS\.openSaveConfirmModal\(\{/);
  assert.match(handler, /title: 'Delete follow-up task\?'/);
  assert.match(handler, /confirmLabel: 'Delete task'/);
  assert.match(handler, /tone: 'danger'/);
  assert.match(handler, /onConfirm: function \(\) \{[\s\S]*?deleteFollowUpAction\(deleteId\)/);
  assert.doesNotMatch(handler, /window\.confirm|\bconfirm\(/);
});

test('the confirmation modal is announced and starts destructive confirmations on Cancel', () => {
  assert.match(html, /role="alertdialog" aria-modal="true" aria-labelledby="saveConfirmTitle" aria-describedby="saveConfirmMessage"/);
  assert.match(html, /data-save-confirm-cancel/);
  assert.match(source, /opts\.tone === 'danger' && cancelBtn \? cancelBtn : confirmBtn/);
  assert.match(source, /event\.key === 'Tab'[\s\S]*?openConfirm\.contains\(document\.activeElement\)/);
});
