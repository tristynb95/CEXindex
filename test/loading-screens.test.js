const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = [
  'index.html',
  'admin.html',
  'my-activity.html',
  'my-team.html',
  'profile.html',
  'bakery-profile.html'
];

test('every full-page loading message ends with three dots', () => {
  pages.forEach((page) => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const match = html.match(/<p[^>]*class="[^"]*auth-loading__text[^"]*"[^>]*>([\s\S]*?)<span\s+class="auth-small-spinner"/);
    assert.ok(match, `${page} should include the shared loading message`);
    const message = match[1].replace(/<[^>]+>/g, '').trim();
    assert.ok(message.endsWith('...'), `${page} loading text should end with ...`);
  });
});
