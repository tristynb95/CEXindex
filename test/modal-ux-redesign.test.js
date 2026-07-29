const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('overview drill-down defaults to a compact, searchable comparison', () => {
  const html = read('index.html');
  const script = read('js/drilldown.js');
  const styles = read('css/styles.css');

  assert.match(html, /id="drillModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="drillEyebrow"/);
  assert.match(html, /id="drillHeaderCount"/);
  assert.match(script, /At a glance/);
  assert.match(script, /data-drill-search/);
  assert.match(script, /data-drill-toggle-details/);
  assert.match(script, /Show all metrics/);
  assert.match(script, /detailMetricColumns/);
  assert.match(script, /column\.detail = index > 2/);
  assert.match(script, /data-table-fullscreen="off"/);
  assert.match(script, /renderTableControls\(false, rows\.length\)/);
  assert.match(script, /className: 'drill-column--bakery'/);
  assert.match(script, /className: 'drill-column--benchmark'/);
  assert.match(script, /className: 'drill-column--nps'/);
  assert.match(script, /className: 'drill-column--confidence'/);
  assert.match(script, /className: 'drill-column--friendliness'/);
  assert.match(styles, /#drillModal\.drill-modal--overview \.overview-drill-inner[\s\S]*?width: min\(96vw, 1480px\)/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--bakery[\s\S]*?width: 180px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--benchmark[\s\S]*?width: 110px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--nps[\s\S]*?width: 88px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--confidence[\s\S]*?width: 68px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--friendliness[\s\S]*?min-width: 118px/);
  assert.match(styles, /\.drill-modal--overview \.drill-detail-column\s*\{[\s\S]*?display: none/);
  assert.match(styles, /\.drill-modal--overview \.drill-show-details \.drill-detail-column/);
  assert.match(styles, /#drillModal \.drill-card,[\s\S]*?#visitReportModal \.drill-card[\s\S]*?min-height: 66px/);
  assert.match(styles, /\.drillInner \{[\s\S]*?border-top: 3px solid var\(--drill-accent/);
  assert.doesNotMatch(
    styles,
    /\.overview-drill-inner::before,[\s\S]*?\.visit-report-inner::before\s*\{[\s\S]*?background:\s*var\(--drill-accent/
  );
});

test('every Bakery Report host uses the shared accessible report shell', () => {
  ['index.html', 'my-activity.html', 'my-team.html', 'bakery-profile.html'].forEach((file) => {
    const html = read(file);
    assert.match(html, /id="visitReportModal" class="drill-modal drill-modal--visit-report"/);
    assert.match(html, /id="visitReportModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
    assert.match(html, /class="drillInner visit-report-inner"/);
    assert.match(html, /id="visitReportEyebrow"/);
    assert.match(html, /id="visitReportTypeBadge"/);
  });
});

test('Bakery Reports identify report type and provide navigable responsive sections', () => {
  const script = read('js/visit-report.js');
  const styles = read('css/styles.css');

  assert.match(script, /function setVisitReportPresentation/);
  assert.match(script, /routine: \{[^}]*maxWidth: 1180/);
  assert.match(script, /nbo: \{[^}]*maxWidth: 1060/);
  assert.match(script, /checkin: \{[^}]*maxWidth: 820/);
  assert.match(script, /empty: \{[^}]*maxWidth: 640/);
  assert.match(script, /--visit-report-max-width/);
  assert.match(script, /function visitReportHeadingLabel/);
  assert.match(script, /node\.nodeType === 3/);
  assert.match(script, /function enhanceVisitReportBody/);
  assert.match(script, /className = 'visit-report-toc'/);
  assert.match(script, /overview\.className = 'visit-report-overview-stack'/);
  assert.match(script, /overview\.appendChild\(summary\);[\s\S]*?overview\.appendChild\(nav\)/);
  assert.match(script, /visit-report-section-wrapper--wide/);
  assert.match(script, /visit-action-item/);
  assert.match(script, /visit-question-layout/);
  assert.match(styles, /#visitReportBody\.visit-report-body--enhanced\s*\{[\s\S]*?grid-template-columns: repeat\(2/);
  assert.match(styles, /\.visit-report-overview-stack\s*\{[\s\S]*?display: flex;[\s\S]*?flex-direction: column/);
  assert.match(styles, /\.visit-report-overview-stack > \.drill-summary,[\s\S]*?position: static !important/);
  assert.match(styles, /\.visit-report-toc\s*\{[\s\S]*?position: static/);
  assert.match(styles, /#visitReportModal\.drill-modal--visit-report \.visit-report-inner \{[\s\S]*?var\(--visit-report-max-width, 1180px\)/);
  assert.match(styles, /#visitReportModal\[data-report-type="checkin"\] #visitReportBody\.visit-report-body--enhanced,[\s\S]*?display: flex;[\s\S]*?flex-direction: column/);
  assert.doesNotMatch(styles, /\.visit-report-toc\s*\{[^}]*position: sticky/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?#visitReportBody\.visit-report-body--enhanced[\s\S]*?grid-template-columns: 1fr/);
});

test('Focus Bakery uses the shared modal header and grouped queue navigation', () => {
  const html = read('index.html');
  const targets = read('js/targets.js');
  const styles = read('css/styles.css');

  assert.match(html, /id="focusDetailModal" class="drill-modal drill-modal--focus"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /class="drill-modal-heading"[\s\S]*?class="drill-modal-eyebrow">Focus bakery/);
  assert.match(html, /class="drill-modal-title-row"[\s\S]*?id="focusDetailTitle"[\s\S]*?id="focusDetailBadges"/);
  assert.match(html, /class="focus-detail-nav"[^>]*role="group"[^>]*aria-label="Focus bakery queue"/);
  assert.match(targets, /Previous bakery: ' \+ names\[idx - 1\]/);
  assert.match(targets, /Next bakery: ' \+ names\[idx \+ 1\]/);
  assert.match(styles, /\.focus-detail-nav \{[\s\S]*?gap: 0;[\s\S]*?height: 36px;[\s\S]*?overflow: hidden/);
  assert.match(styles, /\.focus-detail-nav__btn \{[\s\S]*?width: 34px;[\s\S]*?border: 0;[\s\S]*?border-radius: 0/);
  assert.match(styles, /#focusDetailModal \.modal-close-btn \{[\s\S]*?width: 36px;[\s\S]*?border-radius: 10px/);
});
