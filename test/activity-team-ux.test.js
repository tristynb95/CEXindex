const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const activityHtml = read('my-activity.html');
const activityScript = read('js/my-activity.js');
const activityStyles = read('css/my-activity.css');
const teamHtml = read('my-team.html');
const teamScript = read('js/my-team.js');
const teamStyles = read('css/my-team.css');
const sharedStyles = read('css/styles.css');
const standaloneMenu = read('js/standalone-profile-menu.js');

test('My Activity has bounded, searchable long-form sections', () => {
  ['myVisitsMore', 'myTimelineSearch', 'myTimelineSummary'].forEach((id) => {
    assert.match(activityHtml, new RegExp('id="' + id + '"'));
    assert.match(activityScript, new RegExp("getElementById\\('" + id + "'\\)"));
  });
  assert.match(activityScript, /const VISIT_CHUNK = 30/);
  assert.match(activityScript, /visits\.slice\(0, visitLimit\)/);
  assert.match(activityScript, /timelineSearch\.value\.trim\(\)\.toLowerCase\(\)/);
});

test('Show more pagers stop at the available results and stay hidden at the end', () => {
  assert.match(sharedStyles, /\.visit-log-show-more\[hidden\]\s*\{\s*display: none;/);

  assert.match(teamScript, /Math\.max\(0, visits\.length - visibleVisits\.length\)/);
  assert.match(teamScript, /visitLimit = Math\.min\(visitResultCount, visitLimit \+ VISIT_CHUNK\)/);
  assert.doesNotMatch(teamScript, /visits\.length - visitLimit/);

  assert.match(activityScript, /Math\.max\(0, visits\.length - shown\.length\)/);
  assert.match(activityScript, /visitLimit = Math\.min\(visitResultCount, visitLimit \+ VISIT_CHUNK\)/);
  assert.match(activityScript, /Math\.max\(0, events\.length - visible\.length\)/);
  assert.match(activityScript, /timelineLimit = Math\.min\(timelineResultCount, timelineLimit \+ TIMELINE_CHUNK\)/);
});

test('summary metrics and section navigation are actionable on both pages', () => {
  assert.match(activityScript, /href="#' \+ destinations\[index\]/);
  assert.match(teamScript, /href="#' \+ destinations\[index\]/);
  assert.match(activityHtml, /id="myActivityJump"/);
  assert.match(teamHtml, /id="myTeamJump"/);
  assert.match(activityScript, /new IntersectionObserver/);
  assert.match(teamScript, /new IntersectionObserver/);
});

test('the compact page overviews combine context, navigation and live priorities', () => {
  assert.match(activityHtml, /class="my-activity-overview"/);
  assert.match(activityHtml, /id="myActivityFocus"/);
  assert.match(activityScript, /function renderFocus\(\)/);
  assert.match(activityScript, /renderFocus\(\);\s*renderStats\(\)/);
  assert.match(teamHtml, /class="my-activity-overview my-team-overview"/);
  assert.match(activityStyles, /\.my-activity-overview__top/);
  assert.match(activityScript, /All clear — nothing overdue or due in the next seven days/);
});

test('My Activity keeps desktop filter controls on efficient rows', () => {
  assert.match(activityStyles, /#section-actions \.my-activity-filters[\s\S]*?grid-template-columns:/);
  assert.match(activityStyles, /#section-visits \.my-activity-filters[\s\S]*?grid-template-columns:/);
  assert.match(activityStyles, /\.my-activity-card \{[\s\S]*?scroll-margin-top: 82px/);
});

test('My Team provides data-backed manager charts and an actionable insight', () => {
  [
    'myTeamContributionChart',
    'myTeamWorkloadChart',
    'myTeamTrendChart',
    'myTeamInsightCallout'
  ].forEach((id) => {
    assert.match(teamHtml, new RegExp('id="' + id + '"'));
    assert.match(teamScript, new RegExp("getElementById\\('" + id + "'\\)"));
  });
  assert.match(teamScript, /function renderAnalytics\(\)/);
  assert.match(teamScript, /function visitTrend\(visits\)/);
  assert.match(teamScript, /data-chart-person/);
  assert.match(teamScript, /renderAnalytics\(\);/);
  assert.match(teamStyles, /\.my-team-chart-grid/);
  assert.match(teamStyles, /\.my-team-trend-chart/);
});

test('shared visits count once in team contribution totals', () => {
  assert.match(teamHtml, /Shared visits split one contribution across everyone credited/);
  assert.match(teamScript, /G\.Team\.contributionShares\(visits/);
  assert.match(teamScript, /contributionTotal\.textContent = visits\.length/);
  assert.match(teamScript, /chartRowsHtml\(rows, 'contribution'/);
  assert.doesNotMatch(teamScript, /sum \+ row\.visits/);
});

test('team actions recover legacy source-visit attribution and completers', () => {
  assert.match(teamScript, /task\.sourceVisitId \? visitsObj\[task\.sourceVisitId\] : null/);
  assert.match(teamScript, /G\.Attribution\.forTask\(task, sourceVisit\)/);
  assert.match(teamScript, /G\.Attribution\.actorsForTask\(task, sourceVisit\)/);
  assert.match(activityScript, /G\.Attribution\.actorsForTask\(task, sourceVisit\)/);
});

test('My Team provides manager-grade search and ordering controls', () => {
  [
    'myTeamRosterSearch', 'myTeamRosterSort',
    'myTeamActionsSearch', 'myTeamActionsSort',
    'myTeamVisitsSearch', 'myTeamVisitsSort'
  ].forEach((id) => {
    assert.match(teamHtml, new RegExp('id="' + id + '"'));
    assert.match(teamScript, new RegExp("getElementById\\('" + id + "'\\)"));
  });
  assert.match(teamHtml, /data-status="soon"/);
  assert.match(teamScript, /function taskIsDueSoon/);
  assert.match(teamScript, /function filteredRosterRows/);
  assert.match(teamScript, /function teamActionSorter/);
});

test('My Team opens visit reports in-place without losing manager context', () => {
  assert.match(teamHtml, /id="visitReportModal"/);
  assert.match(teamHtml, /id="visitReportBody"/);
  assert.match(teamHtml, /src="js\/visit-report\.js"/);
  assert.match(teamScript, /data-open-visit-report=/);
  assert.match(teamScript, /function openReportModal\(visitId\)/);
  assert.match(teamScript, /var link = event\.target\.closest\('\[data-open-visit-report\]'\)/);
  assert.match(teamScript, /if \(openReportModal\(link\.getAttribute\('data-open-visit-report'\)\)\) event\.preventDefault\(\)/);
  assert.match(teamScript, /forSelected\(teamVisits\(\)\)\.forEach/);
  assert.doesNotMatch(teamScript, /data-visit-report=/);
});

test('filter reset buttons show a crossed funnel only when filters are active', () => {
  ['myActionsResetBtn', 'myVisitsResetBtn'].forEach((id) => {
    assert.match(activityHtml, new RegExp('id="' + id + '"'));
  });
  ['myTeamRosterReset', 'myTeamActionsReset', 'myTeamVisitsReset'].forEach((id) => {
    assert.match(teamHtml, new RegExp('id="' + id + '"'));
    assert.match(teamScript, new RegExp("getElementById\\('" + id + "'\\)"));
  });
  [activityHtml, teamHtml].forEach((page) => {
    assert.match(page, /visit-log-reset-btn__icon--plain/);
    assert.match(page, /visit-log-reset-btn__icon--active/);
  });
  assert.match(activityScript, /button\.classList\.toggle\('has-active-filters', !!active\)/);
  assert.match(teamScript, /button\.classList\.toggle\('has-active-filters', !!active\)/);
  assert.match(sharedStyles, /\.visit-log-reset-btn\.has-active-filters \.visit-log-reset-btn__icon--active/);
});

test('selecting a person exposes clear context and scopes the headline metrics', () => {
  ['myTeamSelection', 'myTeamSelectionText', 'myTeamSelectionClear'].forEach((id) => {
    assert.match(teamHtml, new RegExp('id="' + id + '"'));
  });
  assert.match(teamScript, /function renderSelection/);
  assert.match(teamScript, /var visits = forSelected\(teamVisits\(\)\)/);
  assert.match(teamScript, /selectionClear\.addEventListener/);
});

test('team bakery totals use saved regional ownership rather than visited sites', () => {
  assert.match(teamScript, /G\.Team\.assignedBakeries\(/);
  assert.match(teamScript, /G\.getRegionAssignmentsSnapshot\(\)/);
  assert.match(teamScript, /G\.getBakeryMetaSnapshot\(\)/);
  assert.match(teamScript, /G\.setRegionAssignments\(\(sitePayload && sitePayload\.regionAssignments\) \|\| \[\]\)/);
  assert.doesNotMatch(
    teamScript,
    /bakeries:\s*new Set\(theirVisits\.map\(function \(visit\) \{ return visit\.bakery; \}\)\)\.size/
  );
});

test('the page shell and result rows use the compact density system', () => {
  assert.match(activityStyles, /\.my-activity-header \{[\s\S]*?min-height: 60px/);
  assert.match(activityStyles, /\.my-activity-main \{[\s\S]*?gap: 14px/);
  assert.match(activityStyles, /\.my-activity-stat \{[\s\S]*?padding: 11px 14px/);
  assert.match(activityStyles, /\.my-activity-action \{[\s\S]*?padding: 11px 14px/);
  assert.match(activityStyles, /\.my-activity-visit \{[\s\S]*?padding: 10px 14px/);
  assert.match(teamStyles, /\.my-team-person \{[\s\S]*?padding: 10px 13px/);
  assert.match(teamStyles, /@media \(max-width: 860px\)/);
});

test('My Activity and My Team keep their top banner visible while scrolling', () => {
  assert.match(activityHtml, /<header class="my-activity-header">/);
  assert.match(teamHtml, /<header class="my-activity-header">/);
  assert.match(
    activityStyles,
    /\.my-activity-header \{[\s\S]*?position: sticky;[\s\S]*?top: 0;[\s\S]*?z-index: 100;/
  );
  assert.match(activityStyles, /\.my-activity-jump \{[\s\S]*?position: static;/);
});

test('standalone pages share the dashboard profile dropdown and button style', () => {
  ['profile.html', 'my-activity.html', 'my-team.html', 'bakery-profile.html'].forEach((file) => {
    const page = read(file);
    assert.match(page, /data-standalone-account-menu/, file + ' is missing the shared account menu');
    assert.doesNotMatch(page, />Sign out<\/button>/, file + ' still has a separate sign-out button');
  });

  ['Profile', 'My Activity', 'My Team', 'Sign out'].forEach((label) => {
    assert.match(standaloneMenu, new RegExp(label.replace(' ', '\\s*')));
  });
  assert.match(standaloneMenu, /activityLink\.hidden = settings\.showActivity !== true/);
  assert.match(standaloneMenu, /teamLink\.hidden = settings\.showTeam !== true/);
  assert.match(sharedStyles, /\.standalone-profile-menu__trigger/);
  assert.match(sharedStyles, /min-height: 34px/);
  assert.match(sharedStyles, /border-radius: var\(--r-pill\)/);
  assert.match(read('bakery-profile.html'), /bakery-profile-switcher__toggle standalone-header-button/);
  assert.match(sharedStyles, /\.admin-workspace__actions \.admin-secondary-btn/);
});

test('opening the profile menu lets sibling header dropdowns close', () => {
  assert.doesNotMatch(
    standaloneMenu,
    /btn\.addEventListener\('click'[\s\S]{0,160}event\.stopPropagation\(\)/
  );
  assert.match(standaloneMenu, /if \(!menu\.contains\(event\.target\)\) ui\.setOpen\(false\)/);
});
