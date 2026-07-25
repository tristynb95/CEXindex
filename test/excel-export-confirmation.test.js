const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('confirms every Excel report export before creating a download', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const exportStart = source.indexOf('function exportVisitLogFile()');
  const exportEnd = source.indexOf('\n  // Comparator behind', exportStart);
  const exportHandler = source.slice(exportStart, exportEnd);

  assert.ok(exportStart >= 0);
  assert.match(exportHandler, /window\.GAILS\.openSaveConfirmModal\(\{/);
  assert.match(exportHandler, /confirmLabel: isExcel \? 'Download Excel' : 'Download CSV'/);
  assert.match(exportHandler, /onConfirm: function \(\) \{\s*downloadVisitLogFile\(data\);/);
  assert.doesNotMatch(exportHandler, /XLSX\.writeFile/);
});

test('the shared confirmation action can only fire once per dialog', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  assert.match(source, /confirmBtn\.onclick = function \(\) \{\s*if \(confirmBtn\.disabled\) return;\s*confirmBtn\.disabled = true;\s*confirmBtn\.onclick = null;/);
});

test('keeps the file writer isolated behind the confirmed callback', () => {
  const scripts = fs.readdirSync(path.join(root, 'js'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(root, 'js', name), 'utf8'))
    .join('\n');

  assert.equal((scripts.match(/XLSX\.writeFile\(/g) || []).length, 1);
  assert.match(scripts, /function downloadVisitLogFile\(data\)[\s\S]*?window\.XLSX\.writeFile\(wb, data\.filename\);/);
});
