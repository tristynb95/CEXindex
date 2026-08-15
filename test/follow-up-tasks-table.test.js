const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('renders Follow-up Tasks as a native table using the Bakery Directory surface', () => {
  assert.match(source, /class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory table-wrap--follow-ups"/);
  assert.match(source, /<table class="bakery-directory follow-up-table" data-table-fullscreen="off">/);
  assert.match(source, /<caption>Follow-up tasks<\/caption>/);
  ['Bakery', 'Action', 'Priority', 'Due', 'Assigned To'].forEach((heading) => {
    assert.match(source, new RegExp('<th scope="col">' + heading + '<\\/th>'));
  });
  assert.doesNotMatch(source, /class="follow-up-item['"]/);
  assert.doesNotMatch(source, /class="unvisited-manager-section/);
});

test('keeps grouping, due/priority tags, and the tick-edit-delete actions in table rows', () => {
  assert.match(source, /<th scope="row" data-label="Bakery">/);
  assert.match(source, /<td data-label="Action">/);
  assert.match(source, /<td data-label="Priority">/);
  assert.match(source, /<td data-label="Due">/);
  assert.match(source, /<td data-label="Assigned To">/);
  assert.match(source, /<tr class="bakery-directory__group-row/);
  assert.match(source, /<em>' \+ tasks\.length \+ ' follow-up' \+ \(tasks\.length === 1 \? '' : 's'\) \+ '<\/em>/);
  assert.match(source, /data-followup-toggle="' \+ escapeHtml\(t\.id\)/);
  assert.match(source, /data-followup-edit="' \+ escapeHtml\(t\.id\)/);
  assert.match(source, /data-followup-delete="' \+ escapeHtml\(t\.id\)/);
});

test('Group By "None" renders a flat table with no group header, like Bakery Directory', () => {
  assert.match(source, /var flatten = followUpGroupVal === 'none'/);
  assert.match(source, /window\.GAILS\._visitLogCurrentGroupNames = flatten \? \[\] : taskGroupsSorted\.slice\(\)/);
  assert.match(source, /renderFollowUpSummary\(filteredTasks\.length, openCount, overdueCount, !flatten\)/);
});

test('uses a compact fixed layout with responsive horizontal scrolling', () => {
  assert.match(styles, /\.table-wrap--follow-ups \.follow-up-table\s*\{\s*min-width:\s*980px;/);
  assert.match(styles, /\.follow-up-table thead th:nth-child\(6\)\s*\{\s*width:\s*19%;/);
  assert.match(styles, /@media \(max-width:\s*640px\)\s*\{\s*\.table-wrap--follow-ups \.follow-up-table\s*\{\s*min-width:\s*920px;/);
});

test('the Actions column never wraps its checkbox/edit/delete cluster onto a second line', () => {
  assert.match(styles, /\.follow-up-table__action-col\s*\{[\s\S]*?flex-wrap:\s*nowrap;/);
});

test('the bakery name matches Visit History\'s row-header sizing, not the larger default', () => {
  assert.match(styles, /\.follow-up-table \.visit-log-row__bakery\s*\{\s*font-size:\s*0\.8rem;/);
});

test('the shared circular done-checkbox still styles the My Activity next-actions list', () => {
  const myActivity = fs.readFileSync(path.join(root, 'js', 'my-activity.js'), 'utf8');
  const myActivityStyles = fs.readFileSync(path.join(root, 'css', 'my-activity.css'), 'utf8');
  assert.match(myActivity, /class="follow-up-item__check/);
  assert.match(styles, /\.follow-up-item__check\s*\{/);
  assert.match(myActivityStyles, /\.my-activity-action \.follow-up-item__check\s*\{/);
});
