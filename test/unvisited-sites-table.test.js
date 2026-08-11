const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('renders Unvisited Sites as a native table using the Bakery Directory surface', () => {
  assert.match(source, /class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory table-wrap--unvisited"/);
  assert.match(source, /<table class="bakery-directory unvisited-sites-table" data-table-fullscreen="off">/);
  assert.match(source, /<caption>Unvisited sites<\/caption>/);
  ['Bakery', 'Ops Area', 'Region', 'Last Visit', 'Days Since'].forEach((heading) => {
    assert.match(source, new RegExp('<th scope="col">' + heading + '<\\/th>'));
  });
  assert.doesNotMatch(source, /<div class="unvisited-bakery-item">/);
});

test('keeps grouping, visit recency, and Log Visit actions in table rows', () => {
  assert.match(source, /<th scope="row" data-label="Bakery">/);
  assert.match(source, /<td data-label="Last Visit">/);
  assert.match(source, /<td data-label="Days Since">/);
  assert.match(source, /class="unvisited-log-btn" data-bakery=/);
  assert.match(source, /<tr class="bakery-directory__group-row/);
  assert.match(source, /<em>' \+ count \+ ' unvisited<\/em>/);
});

test('uses a compact fixed layout with responsive horizontal scrolling', () => {
  assert.match(styles, /\.table-wrap--unvisited \.unvisited-sites-table\s*\{\s*min-width:\s*760px;/);
  assert.match(styles, /\.unvisited-sites-table thead th:nth-child\(6\)\s*\{\s*width:\s*12%;/);
  assert.match(styles, /\.unvisited-sites-table tbody td:last-child\s*\{\s*text-align:\s*right;/);
  assert.match(styles, /@media \(max-width:\s*640px\)\s*\{\s*\.table-wrap--unvisited \.unvisited-sites-table\s*\{\s*min-width:\s*720px;/);
});
