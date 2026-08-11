const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('every bakery report type shares one modal banner layout', () => {
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

  assert.match(
    styles,
    /#visitReportModal \.drill-modal-header,\s*#focusDetailModal \.drill-modal-header \{[\s\S]*?gap: 18px;[\s\S]*?padding: 13px 20px 11px;/
  );
  assert.match(
    styles,
    /#visitReportModal \.drill-modal-eyebrow,\s*#focusDetailModal \.drill-modal-eyebrow \{[\s\S]*?margin-bottom: 3px;/
  );
  assert.match(
    styles,
    /#visitReportModal \.drill-modal-subtitle,\s*#focusDetailModal \.drill-modal-subtitle \{[\s\S]*?margin-top: 3px;/
  );
  assert.match(
    styles,
    /\.drill-modal--visit-report \.visit-report-header-actions \{[\s\S]*?display: flex;[\s\S]*?align-items: center;[\s\S]*?gap: 8px;/
  );

  assert.doesNotMatch(
    styles,
    /#visitReportModal\[data-report-type=['"][^'"]+['"]\]\s+(?:\.drill-modal-(?:header|eyebrow|title|subtitle|title-row|heading)|\.visit-report-(?:header-actions|history-nav|print-btn)|\.modal-close-btn)/
  );
});
