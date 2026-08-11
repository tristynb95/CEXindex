const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('renders Visit History as a native table using the Bakery Directory surface', () => {
  assert.match(source, /<div class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory table-wrap--visit-history">/);
  assert.match(source, /<table class="bakery-directory visit-history-table" data-table-fullscreen="off">/);
  assert.match(source, /<caption>Visit history<\/caption>/);
  assert.match(source, /return '<thead><tr>'/);
  [
    'Date',
    'Bakery',
    'Partner / auditor',
    'Score',
    'Visit type &amp; notes'
  ].forEach((heading) => {
    assert.match(source, new RegExp('<th scope="col">' + heading.replace('/', '\\/') + '<\\/th>'));
  });
});

test('keeps report actions, expandable notes, and grouped rows in the table', () => {
  assert.match(source, /<tr class="visit-history-table__row" data-visit-report-id=/);
  assert.match(source, /<tr class="visit-history-table__details-row"/);
  assert.match(source, /<td colspan="6"><div class="visit-log-row__notes-full">/);
  assert.match(source, /class="visit-log-row__btn">View Report<\/button>/);
  assert.match(source, /class="visit-history-table__expand-btn"[^>]*aria-expanded="false"[^>]*aria-controls=/);
  assert.match(source, /expandButton\.setAttribute\('aria-expanded', expanded \? 'true' : 'false'\)/);
  assert.match(source, /table\.querySelectorAll\('\[data-visit-report-id\]\.expanded'\)/);
  assert.match(source, /if \(openRow !== row\) setVisitLogRowExpanded\(openRow, false\)/);
  assert.match(source, /setVisitLogRowExpanded\(row, expanded\)/);
  assert.match(source, /<tr class="bakery-directory__group-row/);
  assert.match(source, /setVisitLogGroupedRowHidden\(row, willCollapse\)/);
  assert.doesNotMatch(source, /return '<div class="visit-log-row" data-visit-report-id=/);
});

test('uses compact fixed Visit History columns and responsive horizontal scrolling', () => {
  assert.match(styles, /\.table-wrap--visit-history \.visit-history-table\s*\{\s*min-width:\s*960px;/);
  assert.match(styles, /\.visit-history-table thead th:nth-child\(6\)\s*\{\s*width:\s*13%;/);
  assert.match(styles, /\.visit-history-table__details-row \.visit-log-row__notes-full\s*\{[^}]*display:\s*block;/s);
  assert.match(styles, /@media \(max-width:\s*640px\)\s*\{\s*\.table-wrap--visit-history \.visit-history-table\s*\{\s*min-width:\s*900px;/);
});
