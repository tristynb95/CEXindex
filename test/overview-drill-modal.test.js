const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('uses the compact Focus modal sizing for every Overview chart drilldown', () => {
  const html = read('index.html');
  const styles = read('css/styles.css');
  const drilldown = read('js/drilldown.js');

  assert.match(html, /id="drillModal"[\s\S]*?class="drillInner overview-drill-inner"/);
  assert.match(drilldown, /document\.getElementById\('drillModal'\)/);
  assert.match(drilldown, /modal\.style\.display = 'flex'/);
  assert.doesNotMatch(drilldown, /modal\.style\.display = 'block'/);
  assert.match(styles, /#drillModal \.overview-drill-inner\s*\{[\s\S]*?width: min\(96vw, 1080px\)/);
  assert.match(styles, /#drillModal #drillHeader\s*\{[\s\S]*?padding: 18px 24px 15px/);
  assert.match(styles, /#drillModal #drillTitle\s*\{[\s\S]*?font-size: 1\.45rem/);
  assert.match(styles, /#drillModal #drillSubtitle\s*\{[\s\S]*?font-size: 0\.86rem/);
  assert.match(styles, /#drillModal #drillBody\s*\{[\s\S]*?padding: 14px 24px 24px/);
  assert.match(styles, /#drillModal \.drill-card\s*\{[\s\S]*?padding: 9px 14px/);
  assert.match(styles, /@media \(max-width: 960px\)[\s\S]*?#drillModal \.overview-drill-inner\s*\{[\s\S]*?1080px/);
});
