const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('visited summary stays uncluttered and relies on the Visit Type filter', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
  const renderStart = source.indexOf('function renderVisitLogSummary(');
  const renderEnd = source.indexOf('\n  function renderUnvisitedSummary(', renderStart);
  const render = source.slice(renderStart, renderEnd);

  assert.ok(renderStart >= 0);
  assert.match(render, /class="visit-log-summary__total"/);
  assert.match(render, /class="visit-log-summary__actions"/);
  assert.doesNotMatch(render, /visit-log-summary__chip|chipsHtml|VISIT_TYPE_META/);
  assert.doesNotMatch(source, /visit-log-summary__chip|VISIT_TYPE_META/);
  assert.doesNotMatch(styles, /\.visit-log-summary__chip/);
});

test('follow-up tasks expose dedicated grouping and sorting controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  assert.match(html, /id="followUpGroup"[\s\S]*?<option value="bakery">Bakery<\/option>[\s\S]*?<option value="region">Region<\/option>[\s\S]*?<option value="ops">Ops Area<\/option>[\s\S]*?<option value="priority">Priority<\/option>[\s\S]*?<option value="status">Status<\/option>[\s\S]*?<option value="none">None<\/option>/);
  assert.match(html, /id="followUpSort"[\s\S]*?<option value="dueAsc">Due Date \(Soonest\)<\/option>[\s\S]*?<option value="priority">Priority \(High-Low\)<\/option>[\s\S]*?<option value="createdDesc">Date Added \(Newest\)<\/option>[\s\S]*?<option value="bakeryAsc">Bakery Name \(A-Z\)<\/option>/);
  assert.match(source, /getFollowUpGroupKey\(t, followUpGroupVal\)/);
  assert.match(source, /taskGroups\[k\]\.sort\(followUpTaskSorter\(followUpSortVal\)\)/);
  assert.match(source, /followUpGroup:\s*followUpGroupVal/);
  assert.match(source, /followUpSort:\s*followUpSortVal/);
});

test('the Bakery Reports filters are a page-level bar with a balanced Visit History layout', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  // A sibling of the global filter bar, ahead of the sidebar + content shell —
  // that is what makes it span the page rather than the content column.
  const barAt = html.indexOf('<div class="visit-log-filter-bar"');
  const shellAt = html.indexOf('id="dashboardWorkspaceShell"');
  const tabAt = html.indexOf('id="tab-visit-log"');
  assert.ok(barAt > 0, 'the filter bar must exist');
  assert.ok(barAt < shellAt, 'the filter bar must sit above the workspace shell');
  assert.ok(barAt < tabAt, 'the filter bar must sit outside the tab panel');

  // Exactly one of the two page bars is on screen at a time.
  assert.match(app, /filterBar\.classList\.toggle\('filter-bar--hidden', name === 'visit-log'\)/);
  assert.match(app, /visitLogFilterBar\.classList\.toggle\('visit-log-filter-bar--visible', name === 'visit-log'\)/);

  // The status chips narrow the task list rather than the page's data, so they
  // stay in the card with the counts they change, not up in the bar.
  const chipsAt = html.indexOf('id="followUpStatusToggle"');
  assert.ok(chipsAt > html.indexOf('id="tab-visit-log"'), 'status chips belong in the card');

  // The shared layout remains flexible for the smaller control sets.
  assert.match(styles, /\.visit-log-filter-bar \.visit-log-filters \{\s*display: flex;\s*flex-wrap: wrap;/);
  assert.match(styles, /\.visit-log-filter-bar \.visit-log-filters>\.visit-log-filter-control:first-child \{\s*flex: 0 0 225px;[\s\S]*?max-width: 225px;/);
  assert.match(styles, /\.visit-log-filter-bar \.visit-log-filter-control,[\s\S]*?max-width: 240px;/);

  // Visit History exposes the largest set, so it publishes its view on the
  // filter bar and uses two explicit rows instead of stranding Rating alone.
  assert.match(source, /filterBarEl\.setAttribute\('data-visit-view', view\)/);
  assert.match(styles, /\.visit-log-filter-bar\[data-visit-view="history"\] \.visit-log-filters \{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\) var\(--control-h\);[\s\S]*?"search period region ops \."[\s\S]*?"group sort type rating reset";/);
  ['visitLogRegionControl', 'visitLogOpsControl', 'visitLogGroupControl', 'visitLogSortControl', 'visitLogTypeControl'].forEach((id) => {
    assert.match(html, new RegExp(`id="${id}"`));
  });

  // Search then Period lead the bar — the two controls that decide which
  // records exist, ahead of the ones that narrow and arrange them.
  assert.match(html, /id="visitLogPeriodControl"/);
  assert.match(styles, /\.visit-log-filter-bar \.visit-log-filters>\.visit-log-filter-control:first-child \{\s*order: -2;/);
  assert.match(styles, /\.visit-log-filter-bar #visitLogPeriodControl \{\s*order: -1;/);
});

test('filter drawers cannot open over an active modal', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const reports = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const utils = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');

  assert.match(utils, /isModalOpen = function\(\)/);
  assert.match(utils, /querySelectorAll\('dialog\[open\], \[aria-modal=true\]'\)/);
  assert.match(app, /function openFilterSidePanel\(\) \{[\s\S]*?G\.isModalOpen\(\)[\s\S]*?filterSidePanelOpen = true/);
  assert.match(reports, /function setVisitLogFiltersOpen\(open\) \{[\s\S]*?open && typeof window\.GAILS\.isModalOpen[\s\S]*?isModalOpen\(\)/);
});

test('the header breadcrumb gives each setting its own bubble', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  // Period, Group By and Sort By are three bubbles at every width. The combined
  // "Period · Grouped by · Sorted by" capsule read as one sentence, so finding
  // a single value meant parsing all of it.
  assert.doesNotMatch(source, /coreConfigText = periodText/);
  // Chips are built by GAILS.headerPill now (it does the escaping); what is
  // pinned here is still one bubble per setting, not one combined capsule.
  assert.match(source, /pills\.push\(pill\('header-pill-core', 'period', periodText, false\)\)/);
  assert.match(source, /pill\('header-pill-core', 'group', groupLabels\[groupVal\] \|\| 'Grouped', false\)/);
  assert.match(source, /pill\('header-pill-core', 'sort', sortLabels\[sortVal\] \|\| 'Sorted', false\)/);

  // Unvisited Sites and Follow-up Tasks lost their combined capsules too.
  assert.doesNotMatch(source, /Follow-up Tasks · '/);
  assert.doesNotMatch(source, /'<span class="header-pill-core">Unvisited in ' \+ escapeHtml\(periodText\) \+ ' \\u00b7 '/);
});

test('the bakery directory reports its own list controls, not the view you came from', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  // The directory has no Period, and its Sort By / Group By are a separate pair
  // of dropdowns from the ones the reporting views read.
  assert.match(source, /'Sorted by ' \+ exportFilterLabel\('visitLogDirectorySort', 'Bakery Name \(A-Z\)'\)/);
  assert.match(source, /exportFilterLabel\('visitLogDirectoryGroup', 'None'\)/);

  // The breadcrumb has to be written before the per-view branches, all of which
  // can return early — that is what left the directory showing Visit History's
  // period, grouping and sort.
  const headerAt = source.indexOf('headerSub.innerHTML = window.GAILS.getVisitLogHeaderSummary()');
  const directoryAt = source.indexOf('renderBakeryDirectory({');
  const emptyGuardAt = source.indexOf("if (visitIds.length === 0 && view !== 'followups')");
  assert.ok(headerAt > 0 && directoryAt > 0 && emptyGuardAt > 0);
  assert.ok(headerAt < directoryAt, 'breadcrumb must be written before the directory returns');
  assert.ok(headerAt < emptyGuardAt, 'breadcrumb must be written before the no-visits guard returns');
});

test('follow-up rows always show their real bakery and ops area, matching Visit History', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  assert.match(source, /function followUpBakeryLabel\(task\)\s*\{\s*return getDirectoryBakeryLabel\(task\.bakery\)/);
  // Table rows show the true bakery/ops area regardless of the active
  // Group By value — the row shouldn't rely on the group heading for
  // identity when read out of context (same convention as Visit History).
  assert.match(source, /function followUpRowHtml\(t, groupName, hidden\)[\s\S]*?var bakeryLabel = followUpBakeryLabel\(t\)/);
  assert.match(source, /var opsLabel = \(G\.getBakeryOps \? G\.getBakeryOps\(t\.bakery\) : ''\)/);
  assert.match(source, /class="visit-log-row__bakery-col"/);
});

test('multi-select header chips show counts with hover details', () => {
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  const utils = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
  const reports = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

  assert.match(utils, /headerPill = function \(kind, key, text, clearable, tooltip\)/);
  assert.doesNotMatch(utils, /title=\"' \+ escape\(tooltipText\)/);
  assert.match(utils, /aria-label=\"' \+ escape\(text \+ '\. ' \+ tooltipText\)/);
  assert.match(utils, /class=\"header-pill__tooltip\" aria-hidden=\"true\"/);
  assert.match(utils, /header-pill__tooltip-label/);
  assert.match(utils, /header-pill__tooltip-values/);
  assert.match(styles, /body:has\(#filterControlsPanel\.is-open\) \.header-pill__tooltip,[\s\S]*?body\.visit-log-filter-open \.header-pill__tooltip \{\s*display: none;/);

  assert.match(app, /selRegions\.length \+ ' Regions'[\s\S]*?Selected regions:/);
  assert.match(app, /selOps\.length \+ ' Areas'[\s\S]*?Selected ops areas:/);
  assert.match(app, /selBakeries\.length \+ ' Bakeries'[\s\S]*?Selected bakeries:/);

  assert.match(reports, /function multiSelectPill\(key, values, pluralLabel\)/);
  assert.match(reports, /values\.length === 1 \? values\[0\] : values\.length \+ ' ' \+ pluralLabel/);
  assert.match(reports, /values\.join\(', '\)/);
  assert.match(reports, /multiSelectPill\('region', regionVals, 'Regions'\)/);
  assert.match(reports, /multiSelectPill\('ops', opsVals, 'Ops Areas'\)/);
  assert.match(reports, /multiSelectPill\('bakery', bakeryVals, 'Bakeries'\)/);
});
