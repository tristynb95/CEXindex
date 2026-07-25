const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('visited summary stays uncluttered and relies on the Visit Type filter', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
  const renderStart = source.indexOf('function renderVisitLogSummary(');
  const renderEnd = source.indexOf('\n  function renderUnvisitedSummary(', renderStart);
  const render = source.slice(renderStart, renderEnd);

  assert.ok(renderStart >= 0);
  assert.match(render, /class="visit-log-summary__total"/);
  assert.match(render, /class="visit-log-summary__actions"/);
  assert.doesNotMatch(render, /visit-log-summary__chip|chipsHtml|VISIT_TYPE_META/);
  assert.doesNotMatch(source, /visit-log-summary__chip|VISIT_TYPE_META/);
  assert.doesNotMatch(styles, /\.visit-log-summary__chip/);
});

test('follow-up tasks expose dedicated grouping and sorting controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  assert.match(html, /id="followUpGroup"[\s\S]*?<option value="bakery">Bakery<\/option>[\s\S]*?<option value="region">Region<\/option>[\s\S]*?<option value="ops">Ops Area<\/option>[\s\S]*?<option value="priority">Priority<\/option>[\s\S]*?<option value="status">Status<\/option>[\s\S]*?<option value="none">None<\/option>/);
  assert.match(html, /id="followUpSort"[\s\S]*?<option value="dueAsc">Due Date \(Soonest\)<\/option>[\s\S]*?<option value="priority">Priority \(High-Low\)<\/option>[\s\S]*?<option value="createdDesc">Date Added \(Newest\)<\/option>[\s\S]*?<option value="bakeryAsc">Bakery Name \(A-Z\)<\/option>/);
  assert.match(source, /getFollowUpGroupKey\(t, followUpGroupVal\)/);
  assert.match(source, /taskGroups\[k\]\.sort\(followUpTaskSorter\(followUpSortVal\)\)/);
  assert.match(source, /followUpGroup:\s*followUpGroupVal/);
  assert.match(source, /followUpSort:\s*followUpSortVal/);
});

test('follow-up task cards promote bakery context and do not repeat their group heading', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

  assert.match(source, /function followUpTaskBakeryHtml\(task, groupVal\)[\s\S]*?if \(groupVal === 'bakery'\) return ''/);
  assert.match(source, /function followUpBakeryLabel\(task\)\s*\{\s*return getDirectoryBakeryLabel\(task\.bakery\)/);
  assert.match(source, /class="follow-up-item__bakery"/);
  assert.match(source, /function followUpTaskContextHtml\(task, groupVal\)/);
  assert.match(source, /key: 'ops',[\s\S]*?label: 'Ops Area'[\s\S]*?key: 'region',[\s\S]*?label: 'Region'/);
  assert.match(source, /return item\.key !== groupVal/);
  assert.match(source, /followUpTaskBakeryHtml\(t, followUpGroupVal\)[\s\S]*?class="follow-up-item__title"/);
  assert.match(source, /followUpTaskContextHtml\(t, followUpGroupVal\)/);
  assert.match(styles, /\.follow-up-item__bakery\s*\{/);
  assert.match(styles, /\.follow-up-item__context\s*\{/);
  assert.match(styles, /\.follow-up-item__context-item\s*\{/);
});
