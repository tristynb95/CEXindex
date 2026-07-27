const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const adminScript = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'admin-page.js'),
  'utf8'
);
const styles = fs.readFileSync(
  path.join(__dirname, '..', 'css', 'styles.css'),
  'utf8'
);

test('admin visit editor renders imported NBO visits with their own report schema', () => {
  assert.match(adminScript, /function buildNboDetailHtml\(visit\)/);
  assert.match(adminScript, /var isNbo = visit\.type === 'nbo'/);
  assert.match(adminScript, /if \(isNbo\) \{\s*return headerHtml \+ buildNboDetailHtml\(visit\);\s*\}/);
  assert.match(adminScript, /admin-badge admin-badge--nbo/);
  assert.match(adminScript, /NBO Coffee Visit ' \+ escapeHtml\(visit\.visitNumber \|\| 1\)/);
  assert.match(adminScript, /from an imported NBO PDF/);
  assert.match(styles, /\.admin-badge--nbo\s*\{/);
});

test('saving an NBO metadata edit preserves its imported questions', () => {
  assert.match(adminScript, /if \(!existing\.type \|\| existing\.type === 'routine'\) \{\s*VISIT_SECTIONS\.forEach/);
  assert.doesNotMatch(adminScript, /existing\.type !== 'siteVisit' && existing\.type !== 'cqv'/);
});
