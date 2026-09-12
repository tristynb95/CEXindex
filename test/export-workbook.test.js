// Bakery Reports, My Activity and My Team each carried their own copy of the
// export writer, and the copies had drifted apart. These run the shared module
// for real rather than pattern-matching it, because the drift was in behaviour:
// one copy had lost percentage support altogether, and the two that kept it
// disagreed about precision.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/export-workbook.js'), 'utf8');

function load() {
  const context = { console, Object, Math, Number, String, Date, Array, RegExp, isNaN };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'js/export-workbook.js' });
  return context.window.GAILS.ExportWorkbook;
}

test('numbers, dates and blanks reach the sheet as the right cell types', () => {
  const EW = load();
  assert.equal(EW.cellValue('', 'number'), null, 'blank must be null, not an empty string');
  assert.equal(EW.cellValue(null, 'text'), null);
  assert.equal(EW.cellValue(0, 'number'), 0, '0 is a real score and must survive');
  assert.equal(EW.cellValue('12', 'number'), 12);
  assert.equal(EW.cellValue('not a number', 'number'), 'not a number');
  assert.ok(EW.cellValue('2026-09-12', 'date') instanceof Date);
});

// The regression that prompted this: My Team's copy handled only 'number', so a
// percentage column would have been written as text while its own sheet format
// still said '0.0%'.
test('percentages are written as numbers, not text', () => {
  const EW = load();
  assert.equal(EW.cellValue(0.873, 'percent'), 0.873);
  assert.equal(typeof EW.cellValue('0.5', 'percent'), 'number');
});

test('the CSV fallback takes its precision from the sheet number format', () => {
  const EW = load();
  // Bakery Reports exports whole percentages...
  assert.equal(EW.cellText(0.873, 'percent', { percent: '0%' }), '87%');
  // ...the personal hubs export one decimal. Both follow from one declaration,
  // so the CSV and the XLSX can no longer disagree.
  assert.equal(EW.cellText(0.873, 'percent', { percent: '0.0%' }), '87.3%');
  assert.equal(EW.percentDecimals('0%'), 0);
  assert.equal(EW.percentDecimals('0.0%'), 1);
  assert.equal(EW.percentDecimals('0.00%'), 2);
});

test('cell text falls back sanely without a format', () => {
  const EW = load();
  assert.equal(EW.cellText(null, 'number'), '');
  assert.equal(EW.cellText(0, 'number'), '0');
  assert.equal(EW.cellText(0.873, 'percent'), '87.3%');
});

test('no page keeps a private copy of the export writer', () => {
  ['js/visit-report.js', 'js/my-activity.js', 'js/my-team.js'].forEach((file) => {
    const script = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(script, /function exportCellValue\(/, file + ' still defines its own cell writer');
    assert.doesNotMatch(script, /function buildExport?DataSheet\(/, file + ' still builds its own sheet');
  });
});
