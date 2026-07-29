const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const charts = fs.readFileSync(path.join(root, 'js', 'charts.js'), 'utf8');

test('NPS split trends use colour, dash and marker shape to distinguish series', () => {
  assert.match(charts, /k: 'n',[\s\S]*?c: '#315FA8'[\s\S]*?pointStyle: 'circle'/);
  assert.match(charts, /k: 'nc',[\s\S]*?c: '#0E8074'[\s\S]*?dash: \[7, 4\][\s\S]*?pointStyle: 'triangle'/);
  assert.match(charts, /k: 'nm',[\s\S]*?c: '#C97F12'[\s\S]*?dash: \[2, 4\][\s\S]*?pointStyle: 'rectRot'/);
  assert.match(charts, /k: 'na',[\s\S]*?c: '#6B4FA8'[\s\S]*?pointStyle: 'rect'/);
  assert.match(charts, /pointBackgroundColor: tk\.pointFill/);
  assert.match(charts, /pointBorderColor: tk\.c/);
  assert.match(charts, /pointStyleWidth: 14, usePointStyle: true/);
});
