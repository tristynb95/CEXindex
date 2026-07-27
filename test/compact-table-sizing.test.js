const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

test('uses Bakery Directory sizing across the requested native tables', () => {
  const headerRule = styles.match(
    /\.league-table th,\s*#bakeryTrackerTable table th,\s*\.trend-detail-table th,\s*\.drill-table th,\s*\.support-priority-table th\s*\{([^}]*)\}/
  );
  const bodyRule = styles.match(
    /\.league-table td,\s*#bakeryTrackerTable table td,\s*\.trend-detail-table td,\s*\.drill-table td,\s*\.support-priority-table td\s*\{([^}]*)\}/
  );

  assert.ok(headerRule);
  assert.match(headerRule[1], /padding:\s*8px 10px/);
  assert.match(headerRule[1], /font-size:\s*0\.63rem/);
  assert.match(headerRule[1], /line-height:\s*1\.2/);
  assert.match(headerRule[1], /white-space:\s*normal/);

  assert.ok(bodyRule);
  assert.match(bodyRule[1], /padding:\s*8px 10px/);
  assert.match(bodyRule[1], /font-size:\s*0\.8rem/);
  assert.match(bodyRule[1], /line-height:\s*1\.3/);
  assert.match(bodyRule[1], /white-space:\s*normal/);
});

test('uses the same compact density for the Focus Priority Overview grid', () => {
  assert.match(
    styles,
    /#tab-target \[data-target-subtab-panel="summary"\] \.focus-qhead,\s*#tab-target \[data-target-subtab-panel="summary"\] \.focus-qrow\s*\{[^}]*gap:\s*10px;[^}]*padding:\s*8px 10px;/s
  );
  assert.match(
    styles,
    /#tab-target \[data-target-subtab-panel="summary"\] \.focus-qhead\s*\{[^}]*font-size:\s*0\.63rem;[^}]*line-height:\s*1\.2;/s
  );
  assert.match(
    styles,
    /#tab-target \[data-target-subtab-panel="summary"\] \.focus-qrow\s*\{[^}]*font-size:\s*0\.8rem;[^}]*line-height:\s*1\.3;/s
  );
});
