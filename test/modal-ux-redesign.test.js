const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

test('overview drill-down puts one toolbar row above a full-height table', () => {
  const html = read('index.html');
  const script = read('js/drilldown.js');
  const styles = read('css/styles.css');

  assert.match(html, /id="drillModal"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="drillEyebrow"/);
  assert.match(html, /id="drillHeaderCount"/);
  assert.match(script, /data-drill-search/);
  assert.match(script, /data-drill-toggle-details/);
  assert.match(script, /Show all metrics/);
  assert.match(script, /detailMetricColumns/);
  assert.match(script, /column\.detail = index > 2/);
  assert.match(script, /data-table-fullscreen="off"/);
  assert.match(script, /className: 'drill-column--bakery'/);
  assert.match(script, /className: 'drill-column--benchmark'/);
  assert.match(script, /className: 'drill-column--nps'/);
  assert.match(script, /className: 'drill-column--confidence'/);
  assert.match(script, /className: 'drill-column--friendliness'/);

  // Stats and controls share one toolbar row so the table gets the height,
  // and the panel opens on the full metric set where it fits.
  assert.match(script, /function renderDrillToolbar/);
  assert.match(script, /class="drill-toolbar"/);
  assert.match(script, /class="drill-toolbar__actions"/);
  assert.match(script, /renderDrillToolbar\(rows\) \+ renderTableWrap/);
  assert.match(script, /matchMedia\('\(min-width: 1280px\)'\)/);
  assert.match(script, /setDetailColumns\(fitsAllMetrics\)/);
  assert.doesNotMatch(script, /drill-insight-section|renderTableControls/);

  // One count, not four. The Bakeries stat card is the live filtered count,
  // so the standalone chip is gone and the caller's subtitle stops restating
  // what the header badge already says.
  assert.match(script, /data-drill-count aria-live="polite"/);
  assert.match(script, /countMeta\.textContent = visible === total \? 'in this segment' : 'of ' \+ total/);
  assert.doesNotMatch(script, /drill-result-count/);
  assert.doesNotMatch(read('css/styles.css'), /drill-result-count/);
  assert.doesNotMatch(read('js/charts.js'), /bakeries\.length \+ ' bakeries in this band'/);

  assert.match(styles, /#drillModal \.drill-table \.drill-column--bakery[\s\S]*?width: 180px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--benchmark[\s\S]*?width: 110px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--nps[\s\S]*?width: 88px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--confidence[\s\S]*?width: 68px/);
  assert.match(styles, /#drillModal \.drill-table \.drill-column--friendliness[\s\S]*?min-width: 118px/);
  assert.match(styles, /\.drill-modal--overview \.drill-detail-column\s*\{[\s\S]*?display: none/);
  assert.match(styles, /\.drill-modal--overview \.drill-show-details \.drill-detail-column/);
  assert.match(styles, /#drillModal \.drill-card,[\s\S]*?#visitReportModal \.drill-card[\s\S]*?min-height: 66px/);
  assert.match(styles, /\.drillInner \{[\s\S]*?border-top: 3px solid var\(--drill-accent/);

  // #drillBody itself no longer scrolls: the toolbar is fixed and the table
  // takes the rest, with its heading row pinned.
  assert.match(styles, /#drillModal\.drill-modal--overview #drillBody \{[\s\S]*?display: flex;[\s\S]*?overflow: hidden/);
  assert.match(styles, /#drillModal\.drill-modal--overview \.drill-table-wrap \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0/);
  assert.match(styles, /#drillModal\.drill-modal--overview \.drill-table thead th \{[\s\S]*?position: sticky/);
  assert.doesNotMatch(
    styles,
    /\.overview-drill-inner::before,[\s\S]*?\.visit-report-inner::before\s*\{[\s\S]*?background:\s*var\(--drill-accent/
  );
});

test('drill-down and report panels fill the workspace below the page banner', () => {
  const styles = read('css/styles.css');
  const utils = read('js/utils.js');

  // The banner is measured rather than hard-coded: each host page uses a
  // different element and they all reflow at mobile widths.
  assert.match(utils, /\.header, \.bakery-profile-header, \.my-activity-header/);
  assert.match(utils, /setProperty\('--app-banner-h'/);
  assert.match(utils, /\['drillModal', 'focusDetailModal', 'visitReportModal'\]/);
  assert.match(utils, /classList\.toggle\(OPEN_CLASS, open\)/);

  assert.match(styles, /:root \{\s*--app-banner-h: 0px;/);
  assert.match(
    styles,
    /\.drill-modal--overview,\s*\.drill-modal--focus,\s*\.drill-modal--visit-report \{[\s\S]*?top: var\(--app-banner-h/
  );
  assert.match(
    styles,
    /\.drill-modal--overview > \.drillInner,[\s\S]*?height: 100% !important;[\s\S]*?border-radius: 0 !important/
  );
  // The 3px semantic top accent survives the square corners.
  assert.match(styles, /\.drill-modal--visit-report > \.drillInner \{[\s\S]*?border-width: 3px 0 0 !important/);

  // The scroll lock pins <body>, which would drag a sticky banner off screen.
  assert.match(styles, /html\.fullbleed-modal-open \.header,[\s\S]*?position: fixed/);

  // Print must not inherit any of it — the report still prints as A4.
  assert.match(styles, /@media screen \{[\s\S]*?\.drill-modal--overview,\s*\.drill-modal--focus/);
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
  assert.match(script, /followup: \{[^}]*badge: 'CQV follow-up'[^}]*accent: '#B22A24'/);
  assert.match(script, /nbo: \{[^}]*maxWidth: 1060/);
  assert.match(script, /checkin: \{[^}]*maxWidth: 1180/);
  assert.match(script, /empty: \{[^}]*maxWidth: 640/);
  assert.match(script, /--visit-report-max-width/);
  assert.match(script, /function visitReportHeadingLabel/);
  assert.match(script, /node\.nodeType === 3/);
  assert.match(script, /function enhanceVisitReportBody/);
  assert.match(script, /className = 'visit-report-toc'/);
  assert.match(script, /visit-report-section-wrapper--wide/);
  assert.match(script, /visit-action-item/);
  assert.match(script, /visit-question-layout/);
  assert.match(script, /<dl class="drill-summary visit-report-overview"[^>]*aria-label="Report overview"/);
  assert.match(script, /<dt class="drill-card__label">/);
  assert.match(script, /<dd class="drill-card__value"/);
  assert.match(script, /setVisitReportPresentation\(record\.isFollowUp \? 'followup' : 'cqv', record\)/);
  // A follow-up leads with the score profile — whether the score recovered is
  // the question it exists to answer — and a CQV leads with its write-up.
  // Both put the action plan ahead of the two score tables.
  assert.match(script, /record\.isFollowUp[\s\S]*?chartHtml \+ summaryHtml \+ actionPlanHtml \+ categoryHtml \+ sectionHtml/);
  assert.match(script, /summaryHtml \+ chartHtml \+ actionPlanHtml \+ categoryHtml \+ sectionHtml/);

  // Quick stats stack above the persistent section links in the left rail,
  // leaving the full report height available to the scrolling content pane.
  assert.match(script, /layout\.className = 'visit-report-layout'/);
  assert.match(script, /content\.className = 'visit-report-content'/);
  assert.match(script, /rail\.className = 'visit-report-rail'/);
  assert.match(script, /if \(summary\) rail\.appendChild\(summary\)/);
  assert.match(script, /classList\.toggle\('visit-report-body--railed', !!nav\)/);
  assert.match(script, /function trackVisitReportSection/);
  assert.match(script, /setAttribute\('aria-current', 'true'\)/);
  assert.doesNotMatch(script, /visit-report-overview-stack/);

  assert.match(styles, /#visitReportModal\.drill-modal--visit-report #visitReportBody \{[\s\S]*?display: flex;[\s\S]*?overflow: hidden/);
  assert.match(styles, /\.visit-report-body--railed \.visit-report-layout \{[\s\S]*?grid-template-columns: 236px/);
  // The sections grid takes its column count from how many narrow sections
  // the report has. An auto-fit count left a CQV — which has exactly two —
  // with a permanently empty third track, because the full-width Action Plan
  // below it keeps that track from collapsing.
  assert.match(styles, /#visitReportModal \.visit-report-content \{[\s\S]*?grid-template-columns: repeat\(var\(--report-cols, 2\), minmax\(0, 1fr\)\)/);
  assert.match(styles, /#visitReportModal \.visit-report-rail \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column/);
  // The label column fits "COFFEE PARTNER" — the widest label any report type
  // uses — on one line. Wrapping it pushed those rows to ~45px, which is what
  // made a seven-fact routine rail taller than the panel it sits in.
  assert.match(styles, /#visitReportModal \.visit-report-overview \.visit-report-stat \{[\s\S]*?min-height: 36px/);
  assert.match(styles, /#visitReportModal \.visit-report-overview \.visit-report-stat \{[\s\S]*?grid-template-columns: 106px minmax\(0, 1fr\)/);
  // The rail itself never scrolls; if anything overflows it is the jump list,
  // inside itself, with no scrollbar chrome.
  assert.match(styles, /#visitReportModal \.visit-report-rail \{[\s\S]*?overflow: hidden/);
  assert.match(styles, /#visitReportModal \.visit-report-rail \.visit-report-toc > div \{[\s\S]*?overflow-y: auto;[\s\S]*?scrollbar-width: none/);
  // Short windows tighten the rail by steps so every jump link stays visible
  // rather than part of the list scrolling out of sight.
  assert.match(styles, /@media screen and \(max-height: 860px\)[\s\S]*?\.visit-report-stat \{[\s\S]*?min-height: 32px/);
  assert.match(styles, /@media screen and \(max-height: 720px\)[\s\S]*?\.visit-report-stat \{[\s\S]*?min-height: 26px/);
  // A clicked jump link stays marked, rather than the scroll spy immediately
  // handing the highlight to whichever peer shares the top of its grid row.
  assert.match(script, /pinnedId = id;/);
  assert.match(script, /function releasePin/);
  assert.doesNotMatch(script, /data-in-view/);
  assert.match(styles, /#visitReportModal \.visit-report-overview \.drill-card__value \{[\s\S]*?overflow-wrap: anywhere/);
  assert.match(styles, /#visitReportModal \.visit-report-rail > \.visit-report-overview \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(script, /setProperty\('--report-cols', Math\.max\(1, Math\.min\(3, narrowCount\)\)\)/);
  assert.match(script, /setProperty\('--report-cols-md'/);
  assert.match(styles, /@media \(max-width: 1080px\)[\s\S]*?grid-template-columns: repeat\(var\(--report-cols-md, 2\)/);

  // Check-ins mirror the CQV composition: quick facts in a narrow left rail,
  // the visit note in the main pane, and compact site context on the right.
  assert.match(
    styles,
    /data-report-type='checkin'\] #visitReportBody[\s\S]*?\{[\s\S]*?display: flex;[\s\S]*?overflow: hidden/
  );
  assert.match(styles, /\.visit-report-checkin-workspace \{[\s\S]*?align-items: stretch;[\s\S]*?grid-template-columns: 260px minmax\(0, 1fr\) 280px/);
  assert.match(styles, /\.visit-report-checkin-rail \{[\s\S]*?flex-direction: column/);
  assert.match(styles, /\.visit-report-checkin-details-list \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column/);
  assert.match(styles, /\.visit-report-checkin-details-list > div \{[\s\S]*?justify-content: space-between;[\s\S]*?min-height: 42px/);
  assert.match(styles, /data-report-type='checkin'\] \.visit-report-section--comments \{[\s\S]*?padding: 0;[\s\S]*?border: 1px solid[\s\S]*?border-radius: 14px/);
  assert.match(styles, /\.visit-report-comments-heading \{[\s\S]*?align-items: center;[\s\S]*?min-height: 40px;[\s\S]*?border-bottom:/);
  assert.match(styles, /\.visit-report-comment-byline \{[\s\S]*?display: flex/);
  assert.match(styles, /\.visit-report-notes \{[\s\S]*?flex: 1 1 auto;[\s\S]*?overflow-y: auto;[\s\S]*?border: 0;/);
  assert.doesNotMatch(styles, /data-report-type='checkin'\] \.drill-modal-header \{[\s\S]*?calc\(\(100vw - var\(--visit-report-max-width/);
  assert.doesNotMatch(styles, /\.visit-report-notes::before/);
  assert.match(styles, /#visitReportModal \.visit-report-rail \.visit-report-toc \{[\s\S]*?position: sticky/);
  assert.match(styles, /\.visit-report-toc a\[aria-current="true"\]/);
  assert.match(styles, /@media \(max-width: 1080px\)[\s\S]*?\.visit-report-checkin-workspace \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  // Below the two-pane threshold the rail falls back to a horizontal bar.
  assert.match(styles, /@media \(max-width: 1080px\)[\s\S]*?\.visit-report-rail \.visit-report-toc \{[\s\S]*?position: static/);
  assert.doesNotMatch(styles, /\.visit-report-overview-stack/);
  assert.match(styles, /@media print \{\s*#visitReportModal \.visit-report-rail/);
});

test('check-in reports use visit facts, central notes, and compact site context', () => {
  const script = read('js/visit-report.js');
  const styles = read('css/styles.css');
  const profile = read('js/bakery-profile.js');
  const activity = read('js/my-activity.js');

  assert.match(script, /function buildCheckinContextHtml/);
  assert.doesNotMatch(script, /function buildCheckinSummaryHtml/);
  assert.match(script, /class="visit-report-checkin-workspace"/);
  assert.match(script, /class="visit-report-checkin-rail" aria-label="Visit details and bakery snapshot"/);
  assert.match(script, /id="visitDetailsTitle">Visit details/);
  assert.match(script, /<dt>Region · Ops<\/dt>/);
  assert.match(script, /<dt>Visited<\/dt>/);
  assert.doesNotMatch(script, /<dt>Region<\/dt>|<dt>Ops area<\/dt>|<dt>Visit history<\/dt>/);
  assert.match(script, /<span>Monthly snapshot<\/span>/);
  assert.match(styles, /\.visit-context-monthly-heading \{[\s\S]*?justify-content: space-between/);
  assert.match(script, /class="visit-report-comments-heading"/);
  assert.match(script, /class="visit-report-notes" role="region" aria-label="Visit notes" tabindex="0"/);
  assert.match(script, /function buildCheckinSupportHtml/);
  assert.match(script, /class="visit-report-checkin-context visit-report-checkin-support"/);
  assert.match(script, /data-visit-context-map/);
  assert.match(script, /visit-context-weather-card/);
  assert.match(script, /OpenStreetMap/);
  assert.match(script, /Open-Meteo/);
  assert.match(script, /https:\/\/archive-api\.open-meteo\.com\/v1\/archive/);
  assert.match(script, /function weatherCodeMeta/);
  assert.match(script, /function visitWeatherIcon/);
  assert.match(script, /function closestVisitWeatherHour/);
  assert.match(script, /hourly=weather_code,temperature_2m,precipitation,is_day/);
  assert.match(script, /loadVisitWeather\(context, ll, record\.date, record\.time, runId\)/);
  assert.match(script, /weatherMetric\('Temperature', weatherValue\(snapshot\.temperature, 1, '°C'\)\)/);
  assert.match(script, /weatherMetric\('Hourly rainfall', weatherValue\(snapshot\.rainfall, 1, ' mm'\)\)/);
  assert.doesNotMatch(script, /NASA POWER|WS10M|Average wind|weatherMetric\('High'|weatherMetric\('Low'/);
  assert.match(script, /function buildVisitMonthHtml/);
  assert.match(script, /function visitMonthSnapshot/);
  assert.match(script, /G\.state && Array\.isArray\(G\.state\.ALL\)/);
  assert.match(script, /Array\.isArray\(G\._dashboardRecords\)/);
  assert.match(script, /visitMonthMetric\('Benchmark'/);
  assert.match(script, /visitMonthMetric\('Drink \+ Meal NPS'/);
  assert.match(script, /visitMonthMetric\('Within 2 minutes'/);
  assert.match(script, /visitMonthMetric\('Reports logged'/);
  assert.match(script, /function hydrateCheckinContext/);
  assert.match(script, /var workspace = bodyEl\.querySelector\('\.visit-report-checkin-workspace'\)/);
  assert.match(script, /if \(!workspace && context\.parentNode !== bodyEl\) bodyEl\.appendChild\(context\)/);
  assert.match(script, /function visitDaysAgoLabel/);
  assert.match(script, /hydrateCheckinContext\(bodyEl, record\);/);
  assert.match(profile, /G\._dashboardRecords = dashboardRecords/);
  assert.match(activity, /G\._dashboardRecords = performanceRecords/);

  assert.match(styles, /\.visit-context-monthly \{[\s\S]*?display: block;[\s\S]*?padding: 0;/);
  assert.match(styles, /\.visit-context-monthly-stats \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column/);
  assert.match(styles, /\.visit-context-monthly-stat \{[\s\S]*?justify-content: space-between;[\s\S]*?min-height: 42px;[\s\S]*?border-radius: 9px/);
  assert.match(styles, /\.visit-report-checkin-support \{[\s\S]*?grid-template-columns: minmax\(240px, 320px\) minmax\(0, 1fr\)/);
  assert.match(styles, /data-report-type='checkin'\] \.visit-report-comment--primary[\s\S]*?\{[\s\S]*?1\.02rem[\s\S]*?line-height: 1\.72;[\s\S]*?white-space: pre-wrap/);
  assert.match(styles, /\.visit-context-source \{[\s\S]*?align-self: flex-end/);
  assert.match(styles, /\.visit-context-map \{[\s\S]*?height: clamp\(190px, 28vh, 230px\);[\s\S]*?aspect-ratio: auto/);
  assert.match(styles, /\.visit-context-weather-list \{[\s\S]*?display: flex;[\s\S]*?flex-direction: column/);
  assert.match(styles, /\.visit-context-weather-metric \{[\s\S]*?justify-content: space-between;[\s\S]*?min-height: 34px/);
  assert.match(styles, /\.visit-context-weather-overview \{[\s\S]*?display: flex;[\s\S]*?align-items: center/);
  assert.match(styles, /\.visit-context-weather-symbol \{[\s\S]*?width: 58px;[\s\S]*?height: 58px/);
  assert.doesNotMatch(script, /visit-context-card-footer/);
  assert.doesNotMatch(styles, /\.visit-context-card-footer/);
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
  assert.match(styles, /#visitReportModal \.drill-modal-header,\s*#focusDetailModal \.drill-modal-header \{[\s\S]*?padding: 13px 20px 11px/);
  assert.match(styles, /#visitReportModal \.drill-modal-title,\s*#focusDetailModal \.drill-modal-title \{[\s\S]*?1\.28rem/);

  // Placement in the full-bleed panel is explicit: the trend chart, the
  // history table and the visit-report button run the full width, leaving the
  // driver bars and the next steps to share a row.
  assert.match(
    styles,
    /#focusDetailModal\.drill-modal--focus #focusDetailBody \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
  );
  assert.match(styles, /#focusDetailBody > \.focus-detail-section--history,[\s\S]*?#focusDetailBody > \.focus-detail__visitbtn \{\s*grid-column: 1 \/ -1/);
});
