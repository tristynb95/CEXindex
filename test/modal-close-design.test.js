const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function modalCloseButtons(html) {
  return (html.match(/<button\b[\s\S]*?<\/button>/g) || [])
    .filter((button) => /\bmodal-close-btn\b/.test(button));
}

test('uses one accessible close-button component across every modal surface', () => {
  const index = read('index.html');
  const admin = read('admin.html');
  const profile = read('profile.html');
  const bakeryProfile = read('bakery-profile.html');
  const visitReport = read('js/visit-report.js');
  const styles = read('css/styles.css');
  const staticButtons = [
    ...modalCloseButtons(index),
    ...modalCloseButtons(admin),
    ...modalCloseButtons(profile),
    ...modalCloseButtons(bakeryProfile)
  ];

  assert.equal(modalCloseButtons(index).length, 8);
  assert.equal(modalCloseButtons(admin).length, 3);
  assert.equal(modalCloseButtons(profile).length, 1);
  assert.equal(modalCloseButtons(bakeryProfile).length, 2);

  staticButtons.forEach((button) => {
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="Close [^"]+"/);
    assert.match(button, /title="Close"/);
    assert.match(button, />\s*&#10005;\s*<\/button>$/);
  });

  assert.match(visitReport, /class="modal-close-btn"[\s\S]*aria-label="Close visit report"/);
  assert.doesNotMatch(index + admin + profile + bakeryProfile,
    /admin-portal__close|profile-modal__close|map-unmapped-panel__close/);
  assert.match(styles, /\.modal-close-btn\s*\{/);
  assert.match(styles, /\.modal-close-btn:focus-visible\s*\{/);
});
