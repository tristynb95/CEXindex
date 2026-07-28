const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'my-activity.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js', 'my-activity.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'css', 'my-activity.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const authScript = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const visitReportScript = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const eslintConfig = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');
const mentionsSource = fs.readFileSync(path.join(root, 'js', 'mentions.js'), 'utf8');
const attributionSource = fs.readFileSync(path.join(root, 'js', 'attribution.js'), 'utf8');

// Ownership runs through the shared window.GAILS helpers, so the classic
// scripts that provide them are loaded for real rather than stubbed.
function gails(people) {
  const host = { window: {}, console: { warn() {} } };
  vm.createContext(host);
  vm.runInContext(mentionsSource, host);
  vm.runInContext(attributionSource, host);
  host.window.GAILS.Mentions.setPeople(people || []);
  return host.window.GAILS;
}

// Top-level functions in js/my-activity.js are lifted out one at a time and run
// in a bare context, which is how the rest of this suite tests browser-only
// modules without a DOM.
function extract(names, context) {
  const source = names.map((name) => {
    const start = script.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'missing function ' + name);
    const end = script.indexOf('\n}', start);
    assert.ok(end > start, 'could not delimit function ' + name);
    return script.slice(start, end + 2);
  }).join('\n');

  const sandbox = Object.assign({}, context);
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox;
}

test('the profile menu opens My Activity from the dashboard and the admin portal', () => {
  [indexHtml, adminHtml].forEach((page) => {
    const popoverStart = page.indexOf('class="profile-menu__popover"');
    const menuItem = page.indexOf('href="my-activity.html"', popoverStart);
    assert.ok(popoverStart >= 0);
    assert.ok(menuItem > popoverStart, 'My Activity is missing from the profile popover');
    assert.match(page.slice(menuItem, menuItem + 400), /My Activity/);
  });
});

test('the hub carries all three requested sections', () => {
  ['section-actions', 'section-visits', 'section-timeline'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'));
  });
  assert.match(html, /id="myActionsList"/);
  assert.match(html, /id="myVisitsList"/);
  assert.match(html, /id="myTimelineList"/);
  assert.match(html, /<script type="module" src="js\/my-activity\.js(?:\?[^"]+)?">/);
  assert.match(html, /css\/my-activity\.css/);
});

test('the landing brief separates assigned-patch priorities from follow-up work', () => {
  [
    'section-brief',
    'myActivityPriorities',
    'myActivityFollowUps',
    'myActivityMomentum',
    'myActivityLatestVisit'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));

  assert.match(script, /function renderFieldBrief\(\)/);
  assert.match(script, /var patch = assignedPatchBakeries\(\)/);
  assert.match(script, /var priorities = patch\.map\(function \(bakery\)/);
  assert.match(script, /\}\)\.slice\(0, 10\)/);
  assert.match(script, /Colleague covered; your field view is still needed/);
  assert.match(script, /class="my-activity-priority__reason"/);
  assert.match(script, /<b>Ops area<\/b>/);
  assert.match(script, /<b>Coverage<\/b>/);
  assert.match(script, /<b>Recent result/);
  assert.match(script, /brief\.performance\.latestScore/);
  assert.match(script, /'↑ ' \+ Math\.abs\(resultDelta\) \+ ' pts'/);
  assert.match(script, /'↓ ' \+ Math\.abs\(resultDelta\) \+ ' pts'/);
  assert.match(script, /<b>Actions<\/b>/);
  assert.match(styles, /\.my-activity-priorities\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,/);
  assert.match(styles, /\.my-activity-priority\s*\{[\s\S]*?min-height:\s*106px[\s\S]*?padding:\s*13px/);
  assert.match(styles, /\.my-activity-priority__head > a\s*\{[\s\S]*?font-size:\s*0\.84rem/);
  assert.doesNotMatch(styles, /\.my-activity-priority::before/);
  assert.match(script, /briefFollowUpsEl\.innerHTML = nextFollowUps\.map/);
  assert.match(script, /completedThisMonth/);
});

test('the four work views behave as accessible, deep-linkable tabs', () => {
  ['Brief', 'Actions', 'Visits', 'History'].forEach((label) => {
    assert.match(html, new RegExp('role="tab"[\\s\\S]{0,320}' + label));
  });
  assert.match(script, /function activateActivitySection\(sectionId, options\)/);
  assert.match(script, /panel\.hidden = !active/);
  assert.match(script, /window\.history\.pushState\(null, '', '#' \+ targetId\)/);
  assert.match(script, /window\.addEventListener\('popstate'/);
  assert.match(styles, /\[data-activity-panel\]\[hidden\]/);
});

test('the section menu stays in the document flow and cannot obscure activity rows', () => {
  const tabWrap = styles.slice(styles.indexOf('.my-activity-tabs-wrap {'));
  assert.match(tabWrap, /\.my-activity-tabs-wrap\s*\{\s*position:\s*static;/);
  assert.doesNotMatch(tabWrap.slice(0, tabWrap.indexOf('}')), /position:\s*sticky|top:\s*\d/);
});

test('a profile-allocated visit is described as completed rather than delegated', () => {
  assert.match(script, /loggedHere \? 'Logged a visit' : 'Completed a visit'/);
  assert.doesNotMatch(script, /Was assigned a visit|Assigned to you|Assigned by/);
  assert.match(script, /function jointVisitLabel\(visit\)/);
  assert.match(script, /'Visited by you and ' \+ G\.Attribution\.label\(others\)/);
});

test('visit type chips keep the Bakery Reports colour key, including assigned History visits', () => {
  const context = extract(['visitTypeTone'], {});
  assert.equal(context.visitTypeTone({ type: 'routine' }), 'gold');
  assert.equal(context.visitTypeTone({ type: 'siteVisit', visitKind: 'checkin' }), 'teal');
  assert.equal(context.visitTypeTone({ type: 'siteVisit', visitKind: 'nboOpening' }), 'purple');
  assert.equal(context.visitTypeTone({ type: 'nbo' }), 'purple');
  assert.equal(context.visitTypeTone({ type: 'cqv' }), 'red');

  // An assigned visit can retain a blue timeline icon, but its type chip must
  // remain gold/teal/purple/red just like the Bakery Reports list.
  assert.match(script, /tagTone: visitTypeTone\(visit\)/);
  assert.match(script, /event\.tagTone \|\| event\.tone/);
  assert.match(visitReportScript, /color:var\(--gold\);background:var\(--gold-d\)/);
  assert.match(visitReportScript, /color:var\(--purple\);background:var\(--purple-d\)/);
  assert.match(visitReportScript, /color:#B22A24;background:rgba\(178, 42, 36,0\.15\)/);
  assert.match(visitReportScript, /\? \{ color: 'var\(--purple\)', bg: 'var\(--purple-d\)' \}/);
  assert.match(visitReportScript, /: \{ color: 'var\(--teal\)', bg: 'var\(--teal-d\)' \}/);
});

test('Coffee Partner and Area Head Barista assignments both build the bakery patch', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'bakeryLabel', 'bakerySiteName', 'assignmentPersonMatches', 'assignedPatchBakeries'],
    {
      identity: {
        uid: 'u-field',
        emails: new Set(['alex.partner@gailsbread.co.uk']),
        names: new Set(['alex partner'])
      },
      G: {
        getBakeryMetaSnapshot: () => ({
          Balham: { r: 'South', o: 'Ops One' },
          Dulwich: { r: 'South', o: 'Ops Two' },
          Soho: { r: 'Central', o: 'Ops Three' }
        }),
        getRegionAssignmentsSnapshot: () => ([
          { region: 'South', coffeePartner: 'Alex Partner', coffeePartnerUid: 'u-field' }
        ]),
        getOpsAreaAssignmentsSnapshot: () => ([
          {
            region: 'Central',
            opsArea: 'Ops Three',
            baristas: [{ name: 'Alex Partner', uid: 'u-field' }]
          }
        ])
      }
    }
  );

  assert.deepEqual(Array.from(context.assignedPatchBakeries()), ['Balham', 'Dulwich', 'Soho']);
});

test('the Visits list includes patch visits and the user’s own out-of-area visits', () => {
  const context = extract(
    ['canonicalBakeryName', 'allVisits', 'patchVisits', 'activityVisits', 'visitIsOutOfArea'],
    {
      visitsObj: {
        mine: { bakery: 'Balham', date: '2026-07-24', assignedTo: [{ name: 'Sam Partner' }] },
        colleague: { bakery: "GAIL's Dulwich", date: '2026-07-23', assignedTo: [{ name: 'Jamie Smith' }] },
        outsideMine: { bakery: 'Soho', date: '2026-07-22', assignedTo: [{ name: 'Sam Partner' }] },
        outsideColleague: { bakery: 'Mayfair', date: '2026-07-21', assignedTo: [{ name: 'Ada Auditor' }] }
      },
      assignedPatchBakeries: () => ['Balham', 'Dulwich'],
      visitIsMine: (visit) => (visit.assignedTo || []).some((person) => person.name === 'Sam Partner'),
      G: {
        resolveBakeryMetaKey: (name) => String(name).replace(/^GAIL'?s\s+/i, '')
      }
    }
  );

  assert.deepEqual(
    Array.from(context.patchVisits(), (visit) => visit.id).sort(),
    ['colleague', 'mine']
  );
  assert.deepEqual(
    Array.from(context.activityVisits(), (visit) => visit.id).sort(),
    ['colleague', 'mine', 'outsideMine']
  );
  assert.equal(context.visitIsOutOfArea(context.activityVisits().find((visit) => visit.id === 'outsideMine')), true);
  assert.equal(context.visitIsOutOfArea(context.activityVisits().find((visit) => visit.id === 'mine')), false);
  assert.match(script, /function syncVisitFilterOptions\(\)[\s\S]{0,460}var visits = activityVisits\(\)/);
  assert.match(script, /function filteredVisits\(\)[\s\S]{0,220}var visits = activityVisits\(\)\.filter/);
  assert.match(script, /my-activity-tag--slate">Out of area visit/);
  assert.match(styles, /\.my-activity-tag--slate\s*\{/);
  assert.match(html, /out-of-area\s+visits completed by you/);
});

test('assigned tasks can be edited and deleted with an explicit confirmation', () => {
  [
    'myActivityTaskModal',
    'myActivityTaskBakery',
    'myActivityTaskTitle',
    'myActivityTaskDueDate',
    'myActivityTaskPriority',
    'myActivityTaskDelete'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.match(script, /data-task-edit=/);
  assert.match(script, /data-task-delete=/);
  assert.match(script, /function taskCanManage\(task\)/);
  assert.match(script, /taskAssignedToMe\(task\) \|\| taskRaisedByMe\(task\)/);
  assert.match(script, /await update\(ref\(db, 'followUpActions\/' \+ taskId\)/);
  assert.match(script, /await remove\(ref\(db, 'followUpActions\/' \+ taskId\)\)/);
  assert.match(script, /title: 'Delete follow-up task\?'/);
  assert.match(script, /tone: 'danger'/);
});

test('users can create a new action allocated to their own profile', () => {
  assert.match(html, /id="myActionsNewBtn"[\s\S]*?New action/);
  assert.match(html, /Actions created here are saved to your profile/);
  assert.match(script, /import \{ ref, get, onValue, update, remove, push, set \}/);
  assert.match(script, /function openNewTaskModal\(returnFocus\)/);
  assert.match(script, /taskDeleteBtn\.hidden = true/);
  assert.match(script, /taskSaveBtn\.textContent = 'Create action'/);
  assert.match(script, /actionsNewBtn\.addEventListener\('click'/);
  assert.match(script, /if \(actionsNewBtn\) actionsNewBtn\.hidden = !canEdit/);
  assert.match(script, /var taskRef = push\(ref\(db, 'followUpActions'\)\)/);
  assert.match(script, /assignedTo: \[profile\]/);
  assert.match(script, /createdByUid: currentUser\.uid/);
  assert.match(script, /await set\(taskRef, payload\)/);
  assert.match(script, /actionsStatus = 'open'/);
});

test('action rows align with the compact visit-card density', () => {
  assert.match(styles, /VISIT-ALIGNED ACTION ROWS[\s\S]*?#section-actions\s*\{[\s\S]*?padding:\s*18px/);
  assert.match(styles, /#section-actions \.my-activity-actions-list\s*\{[\s\S]*?gap:\s*6px/);
  assert.match(styles, /#section-actions \.my-activity-action\s*\{[\s\S]*?height:\s*84px[\s\S]*?grid-template-columns:\s*22px minmax\(0,\s*1fr\) 138px[\s\S]*?border-radius:\s*12px/);
  assert.match(styles, /#section-visits \.my-activity-visits-scroll \.my-activity-visit\s*\{[\s\S]*?height:\s*84px[\s\S]*?border-radius:\s*12px/);
  assert.match(styles, /grid-template-areas:\s*"priority due"\s*"controls controls"/);
});

test('Visits uses the main Maps-page treatment and waits for a visible canvas', () => {
  assert.match(html, /id="myActivityPatchMap"/);
  assert.match(html, /leaflet@1\.9\.4/);
  assert.match(html, /href="https:\/\/unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css">/);
  assert.doesNotMatch(html, /Q8X0bK5JrQ4Y0/);
  assert.match(html, /class="map-canvas-wrap my-activity-patch-map-wrap"/);
  assert.match(html, /class="target-map-status my-activity-patch-card__status"/);
  assert.match(styles, /\.my-activity-visits-workspace\s*\{[\s\S]*?grid-template-columns:[\s\S]*?1fr/);
  assert.match(styles, /\.my-activity-patch-map\s*\{[\s\S]*?height:\s*clamp\(400px,\s*calc\(100vh - 300px\),\s*600px\)/);
  assert.doesNotMatch(styles, /\.my-activity-patch-map\s*\{[\s\S]*?aspect-ratio:\s*1/);
  assert.match(script, /function renderPatchMap\(\)/);
  assert.match(script, /if \(!patchMapIsVisible\(\)\) return;/);
  assert.match(script, /new window\.ResizeObserver\(schedulePatchMapLayout\)/);
  assert.match(script, /function mountPatchMap\(\)/);
  assert.match(script, /mountPatchMap\(\);[\s\S]{0,160}patchMap\.invalidateSize\(\{ animate: false, pan: false \}\)/);
  assert.match(script, /https:\/\/tile\.openstreetmap\.org\/\{z\}\/\{x\}\/\{y\}\.png/);
  assert.match(script, /patchMapTiles\.redraw\(\)/);
  assert.match(script, /window\.L\.DomUtil\.create\('div', 'map-legend'\)/);
  assert.match(script, /className: 'map-name-tooltip'/);
  assert.match(script, /marker\.bindPopup\(patchMapPopupHtml/);
  assert.match(script, /function patchVisitCreditLabel\(visit\)/);
  assert.match(script, /jointVisitLabel\(visit\) \|\| 'Visited by you'/);
  assert.match(script, /'<div class="map-popup__mgr">' \+ escapeHtml\(visitorLine\)/);
  assert.match(script, /state: 'you', latest: visits\[0\]/);
  assert.match(script, /radius: 9,[\s\S]{0,120}color: '#fff',[\s\S]{0,80}weight: 2/);
  assert.match(script, /you: \{ label: 'Visited by you'/);
  assert.match(script, /colleague: \{ label: 'Colleague only'/);
  assert.match(script, /unvisited: \{ label: 'Not visited'/);
  ['you', 'colleague', 'unvisited'].forEach((state) => {
    assert.match(script, new RegExp(state + ':'), state + ' map state is missing');
  });
});

test('the patch map names the most recent visitor, including joint visits', () => {
  const context = extract(
    ['visitAttribution', 'attributedToMe', 'jointVisitLabel', 'patchVisitCreditLabel'],
    {
      G: gails([
        { uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' },
        { uid: 'uid-2', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }
      ]),
      identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set(['sam partner']) },
      visitIsMine: (visit) => (visit.assignedTo || []).some((person) => person.uid === 'uid-1'),
      visitPersonLabel: () => ''
    }
  );
  const sam = { uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' };
  const jamie = { uid: 'uid-2', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' };

  assert.equal(context.patchVisitCreditLabel({ type: 'siteVisit', assignedTo: [sam] }), 'Visited by you');
  assert.equal(
    context.patchVisitCreditLabel({ type: 'siteVisit', assignedTo: [sam, jamie] }),
    'Visited by you and Jamie Smith'
  );
  assert.equal(
    context.patchVisitCreditLabel({ type: 'siteVisit', assignedTo: [jamie] }),
    'Visited by Jamie Smith'
  );
});

test('Visits shows a six-card scroll viewport aligned with a taller map', () => {
  assert.match(html, /class="my-activity-visits-scroll" tabindex="0"/);
  assert.match(html, /Six visits are visible; scroll for more/);
  assert.doesNotMatch(html, /id="myVisitsMore"/);
  assert.match(script, /visits\.map\(visitRowHtml\)\.join/);
  // The count line stays a plain "N visits across N bakeries" — the scroll hint
  // is carried by the viewport's aria-label alone.
  assert.doesNotMatch(script, /scroll for/);
  assert.match(styles, /COMPACT VISITS VIEWPORT[\s\S]*?--my-activity-visits-height:\s*clamp\(500px,\s*calc\(100vh - 180px\),\s*580px\)/);
  assert.match(styles, /#section-visits \.my-activity-visits-scroll \.my-activity-visit\s*\{[\s\S]*?height:\s*84px/);
  assert.match(styles, /\.my-activity-visits-list-pane,[\s\S]*?\.my-activity-patch-card\s*\{[\s\S]*?height:\s*var\(--my-activity-visits-height\)/);
  assert.match(styles, /\.my-activity-patch-map\s*\{[\s\S]*?height:\s*100%/);
  assert.match(script, /padding:\s*\[28,\s*28\]/);
});

test('the performance slideshow owns the larger overview card and Today’s focus stays compact', () => {
  ['Top performer', 'Bottom performer', 'Most improved', 'Biggest decline', 'One to watch', 'Rising star']
    .forEach((label) => assert.ok(script.includes(label), label + ' insight is missing'));
  assert.match(script, /get\(ref\(db, 'dashboardData'\)\)/);
  assert.match(script, /G\.buildFocusDataset\(\{/);
  assert.match(script, /setInterval\(function \(\) \{[\s\S]*?renderPerformanceSlide\(\)/);
  assert.match(html, /class="my-activity-insight"[\s\S]{0,900}class="my-activity-overview__compact"/);
  assert.match(html, /class="my-activity-overview__compact"[\s\S]{0,260}id="myActivityFocus"/);
  assert.match(styles, /\.my-activity-overview__compact\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,/);
  assert.match(styles, /COMPACT HEADLINE BAND[\s\S]*?\.my-activity-overview__compact\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*0\.78fr\)\)\s*minmax\(190px,\s*1\.2fr\)/);
  assert.match(styles, /@media \(min-width:\s*1040px\)\s*\{[\s\S]*?grid-template-columns:\s*minmax\(300px,\s*0\.9fr\)\s*minmax\(0,\s*2\.5fr\)[\s\S]*?repeat\(3,\s*minmax\(0,\s*0\.75fr\)\)\s*minmax\(230px,\s*1\.25fr\)/);
  assert.match(styles, /COMPACT HEADLINE BAND[\s\S]*?\.my-activity-overview\s*>\s*\.my-activity-insight\s*\{[\s\S]*?height:\s*96px[\s\S]*?min-height:\s*0/);
  assert.match(styles, /COMPACT HEADLINE BAND[\s\S]*?\.my-activity-overview > \.my-activity-insight\s*\{[\s\S]*?background:\s*rgba\(255,\s*255,\s*255,\s*0\.82\)/);
  assert.match(styles, /box-shadow:[\s\S]{0,100}0 4px 12px rgba\(72,\s*48,\s*29,\s*0\.045\)/);
  assert.doesNotMatch(styles, /\.my-activity-overview > \.my-activity-insight::after/);
  assert.match(styles, /COMPACT HEADLINE BAND[\s\S]*?\.my-activity-overview__compact \.my-activity-stat,[\s\S]*?height:\s*96px[\s\S]*?min-height:\s*0/);
  assert.match(script, /performanceInsightEl\.addEventListener\('click'/);
  assert.match(script, /class="my-activity-focus__top"/);
  assert.match(script, /class="my-activity-focus__count"/);
  assert.match(script, /class="my-activity-focus__body"/);
  assert.match(script, /class="my-activity-focus__action"/);
  const focusRedesign = styles.slice(styles.indexOf("/* Today's focus uses a clear status rail"));
  const focusCardRule = focusRedesign.slice(
    focusRedesign.indexOf('.my-activity-overview__compact .my-activity-focus {'),
    focusRedesign.indexOf('}', focusRedesign.indexOf('.my-activity-overview__compact .my-activity-focus {')) + 1
  );
  assert.match(focusCardRule, /border:\s*1px solid rgba\(74,\s*59,\s*48,\s*0\.12\)/);
  assert.doesNotMatch(focusCardRule, /border-left/);
  assert.match(styles, /\.my-activity-overview__compact \.my-activity-focus--warning\s*\{[\s\S]*?rgba\(251,\s*240,\s*238,\s*0\.92\)/);
  assert.match(styles, /\.my-activity-focus--warning \.my-activity-focus__top > span::before\s*\{[\s\S]*?background:\s*var\(--red\)/);
  assert.match(styles, /\.my-activity-focus--warning \.my-activity-focus__count\s*\{[\s\S]*?background:\s*var\(--red\)[\s\S]*?color:\s*#fff/);
  assert.match(styles, /\.my-activity-overview__compact \.my-activity-focus \.my-activity-focus__action\s*\{[\s\S]*?color:\s*#963a34/);
  assert.match(html, /src="js\/focus-data\.js"/);
  assert.doesNotMatch(script, /Average visit score|Average score|Avg\. score/);
});

test('the visit list offers search, date, sorting, ops area and bakery filters', () => {
  ['myVisitsSearch', 'myVisitsPeriod', 'myVisitsSort', 'myVisitsOps', 'myVisitsBakery'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' filter is missing');
    assert.match(script, new RegExp("getElementById\\('" + id + "'\\)"), id + ' is never read');
  });
  // A custom from/to range sits behind the period select, so "date" is not
  // limited to the canned periods.
  assert.match(html, /id="myVisitsFrom"/);
  assert.match(html, /id="myVisitsTo"/);
  assert.match(script, /period === 'custom'/);
});

test('the activity feed covers visits, notes, and tasks added, completed, and edited', () => {
  [
    'Logged a ',
    'Added a bakery note',
    'Edited a bakery note',
    'Added a follow-up task',
    'Completed a follow-up task',
    'Edited a follow-up task'
  ].forEach((label) => assert.ok(script.includes(label), 'timeline is missing "' + label + '"'));

  // Newest first.
  assert.match(script, /\.sort\(function \(a, b\) \{ return b\.at - a\.at; \}\)/);
});

test('no file is written until the download is confirmed', () => {
  const start = script.indexOf('function requestExport(data)');
  const handler = script.slice(start, script.indexOf('\n}', start));

  assert.ok(start >= 0);
  assert.match(handler, /openConfirmModal\(\{/);
  assert.match(handler, /onConfirm: function \(\) \{ downloadWorkbook\(data\); \}/);
  assert.doesNotMatch(handler, /triggerDownload\(/);
  // Both exportable sections route through the one confirmed path, each passing
  // the rows its own filters produced.
  assert.match(script, /visitsExportBtn\.addEventListener\('click', function \(\) \{ requestExport\(pendingVisitExport\); \}\)/);
  assert.match(script, /actionsExportBtn\.addEventListener\('click', function \(\) \{ requestExport\(pendingActionsExport\); \}\)/);

  // The dashboard owns the codebase's only XLSX.writeFile call
  // (test/excel-export-confirmation.test.js asserts there is exactly one), so
  // this page writes the identical workbook through XLSX.write + a Blob.
  assert.doesNotMatch(script, /XLSX\.writeFile/);
  assert.match(script, /window\.XLSX\.write\(wb, \{ bookType: 'xlsx', type: 'array' \}\)/);
});

test('the confirmation button cannot fire twice', () => {
  assert.match(script, /confirmBtn\.onclick = async function performConfirm\(\) \{\s*if \(confirmBtn\.disabled\) return;\s*confirmBtn\.disabled = true;/);
  assert.match(script, /await options\.onConfirm\(\);\s*closeConfirmModal\(\);/);
  assert.match(script, /confirmBtn\.onclick = performConfirm;/);
});

test('a check-in records its author separately from whoever last edited it', () => {
  const start = authScript.indexOf('saveSiteVisit: async function');
  const saveVisit = authScript.slice(start, authScript.indexOf('deleteSiteVisit:', start));

  assert.match(saveVisit, /createdBy: auth\.currentUser\.email \|\| auth\.currentUser\.uid/);
  assert.match(saveVisit, /createdByUid: auth\.currentUser\.uid/);
});

test('an admin editing someone else\'s visit does not inherit it', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-admin', name: 'Ada Admin', email: 'admin@gailsbread.co.uk' }]),
      identity: { uid: 'uid-admin', emails: new Set(['admin@gailsbread.co.uk']), names: new Set(['ada admin']) }
    }
  );

  // A visit logged by a colleague, later corrected by the signed-in admin:
  // updatedBy now names the admin, but createdBy still names its author.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    meta: {
      createdBy: 'field@gailsbread.co.uk',
      createdByUid: 'uid-field',
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-04T11:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  }), false);

  // A legacy check-in from before createdBy existed, never edited since, is
  // still attributable through updatedBy.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    meta: {
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-01T09:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  }), true);

  // ...but the same legacy record, once edited, is not claimed on that basis.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    meta: {
      createdAt: '2026-05-01T09:00:00.000Z',
      updatedAt: '2026-05-09T09:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  }), false);
});

test('importing a CQV does not put it in the importer\'s hub', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-admin', name: 'Ada Admin', email: 'admin@gailsbread.co.uk' }]),
      identity: { uid: 'uid-admin', emails: new Set(['admin@gailsbread.co.uk']), names: new Set(['ada admin']) }
    }
  );

  // Exactly what saveCqvRecord writes: no createdBy at all, updatedBy stamped
  // with the importer, and createdAt identical to updatedAt because the record
  // was created and stamped in the same breath. That trio used to satisfy the
  // legacy "never edited, so updatedBy is the author" fallback and pulled every
  // report an admin imported into their own hub — which is the whole reason
  // meta.importedBy is recorded separately in the first place.
  const imported = (auditorName) => ({
    bakery: 'Cheapside',
    type: 'cqv',
    auditorName: auditorName,
    meta: {
      source: 'pdf-import',
      createdAt: '2026-07-24T10:00:00.000Z',
      importedBy: 'admin@gailsbread.co.uk',
      createdBy: 'admin@gailsbread.co.uk',
      updatedAt: '2026-07-24T10:00:00.000Z',
      updatedBy: 'admin@gailsbread.co.uk'
    }
  });

  assert.equal(context.visitIsMine(imported('George Austin')), false);
  // A PDF naming two auditors resolves to neither of them as a directory
  // person, which must not fall back to the importer either.
  assert.equal(context.visitIsMine(imported('George Austin  Lauryn Brown')), false);
  // The importer still gets it when they really are the auditor on the report.
  assert.equal(context.visitIsMine(imported('Ada Admin')), true);
});

test('a check-in is not claimed by whoever was on the bar', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam.partner@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam.partner@gailsbread.co.uk']), names: new Set(['sam partner']) }
    }
  );

  // On a check-in, Coffee Partner is free text about who was working the bar,
  // so being named there is not a claim to have done the visit. js/attribution
  // .js excludes it for exactly this reason.
  assert.equal(context.visitIsMine({
    bakery: 'Balham', type: 'siteVisit', coffeePartner: 'Sam Partner'
  }), false);

  // The person who logged that check-in still owns it.
  assert.equal(context.visitIsMine({
    bakery: 'Balham', type: 'siteVisit', coffeePartner: 'Someone Else',
    meta: { createdByUid: 'uid-1', createdBy: 'sam.partner@gailsbread.co.uk' }
  }), true);

  // Choosing another profile is authoritative: entering the visit does not
  // keep a second copy in the poster's own Visits list.
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    type: 'siteVisit',
    assignedTo: [{ uid: 'uid-2', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }],
    meta: { createdByUid: 'uid-1', createdBy: 'sam.partner@gailsbread.co.uk' }
  }), false);

  // On a routine visit, Coffee Partner *is* a record of who did it.
  assert.equal(context.visitIsMine({ bakery: 'Balham', coffeePartner: 'Sam Partner' }), true);
});

test('the visit list credits joint visits and visits completed by colleagues', () => {
  const context = extract(
    ['visitAttribution', 'attributedToMe', 'jointVisitLabel', 'visitListCreditLabel'],
    {
      G: gails([
        { uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' },
        { uid: 'uid-2', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' }
      ]),
      identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set(['sam partner']) },
      visitIsMine: (visit) => (visit.assignedTo || []).some((person) => person.uid === 'uid-1')
    }
  );
  const sam = { uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' };
  const jamie = { uid: 'uid-2', name: 'Jamie Smith', email: 'jamie@gailsbread.co.uk' };

  assert.equal(context.jointVisitLabel({ type: 'siteVisit', assignedTo: [sam] }), '');
  assert.equal(context.visitListCreditLabel({ type: 'siteVisit', assignedTo: [sam] }), '');
  assert.equal(
    context.visitListCreditLabel({ type: 'siteVisit', assignedTo: [sam, jamie] }),
    'Visited by you and Jamie Smith'
  );
  assert.equal(
    context.visitListCreditLabel({ type: 'siteVisit', assignedTo: [jamie] }),
    'Visited by Jamie Smith'
  );
});

test('visits are attributed by form respondent and by printed auditor name', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName', 'matchesMyUid',
      'wasImported', 'visitAttribution', 'attributedToMe', 'visitIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam.partner@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam.partner@gailsbread.co.uk']), names: new Set(['sam partner']) }
    }
  );

  // Google Forms records the respondent's email on routine visits.
  assert.equal(context.visitIsMine({ bakery: 'Balham', email: 'Sam.Partner@gailsbread.co.uk' }), true);
  // CQV/NBO PDFs only ever carry a printed name; punctuation and case vary.
  assert.equal(context.visitIsMine({ bakery: 'Balham', type: 'cqv', auditorName: "Sam O'Partner" }), false);
  assert.equal(context.visitIsMine({ bakery: 'Balham', type: 'cqv', auditorName: 'SAM PARTNER' }), true);
  assert.equal(context.visitIsMine({
    bakery: 'Balham',
    type: 'nbo',
    auditorName: 'Someone Else',
    coffeePartner: 'Sam Partner'
  }), false);
  assert.equal(context.visitIsMine({ bakery: 'Balham', coffeePartner: 'Sam Partner' }), true);
  assert.equal(context.visitIsMine({ bakery: 'Balham', coffeePartner: 'Someone Else' }), false);
});

test('a single-word name is too weak to attribute a visit on', () => {
  const context = extract(['normalizeName', 'normalizeEmail', 'buildIdentity'], {});
  const identity = context.buildIdentity(
    { uid: 'uid-1', email: 'sam@gailsbread.co.uk', displayName: 'Sam' },
    { firstName: 'Sam', lastName: '' }
  );

  assert.equal(identity.names.size, 0);
  assert.ok(identity.emails.has('sam@gailsbread.co.uk'));
});

test('task allocation controls the queue while completion still counts in History', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName',
      'taskOwners', 'attributedToMe', 'taskRaisedByMe', 'taskCompletedByMe', 'taskIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' }]),
      visitsObj: {},
      identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set() }
    }
  );

  const task = { createdBy: 'other@gailsbread.co.uk', completedByUid: 'uid-1' };
  assert.equal(context.taskRaisedByMe(task), false);
  assert.equal(context.taskCompletedByMe(task), true);
  assert.equal(context.taskIsMine(task), false);
  assert.equal(context.taskIsMine({
    createdBy: 'other@gailsbread.co.uk',
    assignedTo: [{ uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' }]
  }), true);
  assert.equal(context.taskIsMine({ createdBy: 'other@gailsbread.co.uk' }), false);
});

test('a legacy task linked to my visit is restored to My Activity', () => {
  const context = extract(
    ['normalizeName', 'normalizeEmail', 'matchesMyEmail', 'matchesMyName',
      'taskOwners', 'attributedToMe', 'taskIsMine'],
    {
      G: gails([{ uid: 'uid-1', name: 'Sam Partner', email: 'sam@gailsbread.co.uk' }]),
      identity: { uid: 'uid-1', emails: new Set(['sam@gailsbread.co.uk']), names: new Set(['sam partner']) },
      visitsObj: {
        source: { type: 'cqv', auditorName: 'Sam Partner' }
      }
    }
  );

  assert.equal(context.taskIsMine({
    sourceVisitId: 'source',
    createdBy: 'other@gailsbread.co.uk'
  }), true);
});

test('the custom date range bounds the visit list inclusively', () => {
  const context = extract(['gailsQuarterStart', 'isDateWithinPeriod'], {});

  assert.equal(context.isDateWithinPeriod('2026-03-10', 'custom', '2026-03-01', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-03-01', 'custom', '2026-03-01', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-03-31', 'custom', '2026-03-01', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-04-01', 'custom', '2026-03-01', '2026-03-31'), false);
  // An open-ended range still filters on the bound that was supplied.
  assert.equal(context.isDateWithinPeriod('2020-01-01', 'custom', '', '2026-03-31'), true);
  assert.equal(context.isDateWithinPeriod('2026-01-01', 'custom', '2025-12-01', ''), true);
  assert.equal(context.isDateWithinPeriod('', 'custom', '', ''), false);
});

test('GAIL\'s reporting quarters start in March, matching the dashboard', () => {
  const context = extract(['gailsQuarterStart'], {});

  assert.equal(context.gailsQuarterStart(new Date(2026, 3, 15)).toISOString().slice(0, 7), '2026-03');
  assert.equal(context.gailsQuarterStart(new Date(2026, 0, 15)).toISOString().slice(0, 7), '2025-12');
});

test('unscored check-ins sort last rather than as a zero', () => {
  const context = extract(
    ['visitScorePct', 'bakeryLabel', 'visitTypeLabel', 'visitSorter'],
    { G: {} }
  );

  const sorted = [
    { type: 'siteVisit', bakery: 'A', date: '2026-01-01' },
    { type: 'cqv', overallPct: 40, bakery: 'B', date: '2026-01-02' },
    { type: 'cqv', overallPct: 90, bakery: 'C', date: '2026-01-03' }
  ].sort(context.visitSorter('scoreDesc'));

  assert.deepEqual(sorted.map((v) => v.bakery), ['C', 'B', 'A']);
});

test('a due date reads the same here as it does on the dashboard', () => {
  const context = extract(['todayMidnight', 'formatIsoDate', 'dueMeta'], {});
  // Built from the local calendar date, not toISOString(): dueMeta compares
  // against local midnight, and west of UTC — or anywhere on summer time —
  // toISOString() on a local midnight lands on the previous day and shifts
  // every expectation here by one.
  const iso = (offsetDays) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  assert.equal(context.dueMeta(iso(-3)).state, 'overdue');
  assert.equal(context.dueMeta(iso(-1)).label, '1 day overdue');
  assert.equal(context.dueMeta(iso(0)).state, 'today');
  assert.equal(context.dueMeta(iso(4)).state, 'soon');
  assert.equal(context.dueMeta(iso(30)).state, 'future');
  assert.equal(context.dueMeta(null).state, 'none');
});

test('serverTimestamp notes and ISO visit stamps share one ordering', () => {
  const context = extract(['toMillis'], {});

  assert.equal(context.toMillis(1758000000000), 1758000000000);
  assert.equal(context.toMillis('2026-05-01T09:00:00.000Z'), Date.parse('2026-05-01T09:00:00.000Z'));
  assert.equal(context.toMillis(null), 0);
  assert.equal(context.toMillis('not a date'), 0);
});

test('a visit deep link is honoured once and only once', () => {
  const start = visitReportScript.indexOf('window.GAILS.openVisitFromDeepLink');
  const handler = visitReportScript.slice(start, visitReportScript.indexOf('\n  };', start));

  assert.ok(start >= 0);
  assert.match(handler, /if \(!visits\[pendingVisitDeepLinkId\]\) return;/);
  assert.match(handler, /pendingVisitDeepLinkId = '';/);
  assert.match(authScript, /window\.GAILS\.openVisitFromDeepLink\(\);/);
  assert.match(script, /index\.html\?visit=' \+ encodeURIComponent/);
});

test('the hub is registered as an ES module for linting', () => {
  assert.match(eslintConfig, /'js\/my-activity\.js'/);
});

test('the page styles cover both the desktop grid and small screens', () => {
  assert.match(styles, /\.my-activity-visit \{/);
  assert.match(styles, /@media \(max-width: 720px\)/);
  assert.match(styles, /\.my-activity-modal__dialog/);
});

test('open actions can be filtered by bakery, ops area, and searched', () => {
  ['myActionsSearch', 'myActionsOps', 'myActionsBakery', 'myActionsSort'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'), id + ' control is missing');
    assert.match(script, new RegExp("getElementById\\('" + id + "'\\)"), id + ' is never read');
  });
  // The Site list is built from the user's own actions, not the whole estate.
  assert.match(script, /function syncActionFilterOptions\(\)/);
  assert.match(script, /myTasks\(\)\.forEach\(function \(task\) \{\s*if \(!task\.bakery\) return;\s*opsSet\.add\(bakeryOps\(task\.bakery\)\);\s*bakerySet\.add\(task\.bakery\);/);
  assert.match(script, /if \(filters\.bakery && task\.bakery !== filters\.bakery\) return false;/);
  assert.match(script, /if \(filters\.ops && bakeryOps\(task\.bakery\) !== filters\.ops\) return false;/);
});

test('open actions offer the same orderings as the dashboard follow-up list', () => {
  ['dueAsc', 'dueDesc', 'priority', 'createdDesc', 'createdAsc', 'bakeryAsc'].forEach((value) => {
    assert.match(html, new RegExp('value="' + value + '"'), value + ' sort option is missing');
  });

  const context = extract(
    ['taskIsDone', 'todayMidnight', 'formatIsoDate', 'dueMeta', 'normalizePriority',
      'taskSortByDue', 'toMillis', 'bakeryLabel', 'bakerySiteName', 'actionSorter'],
    { G: {}, PRIORITY_ORDER: { high: 0, medium: 1, low: 2, none: 3 } }
  );

  const tasks = [
    { title: 'Later', dueDate: '2026-09-01', priority: 'high', bakery: 'Zeta' },
    { title: 'Sooner', dueDate: '2026-08-01', priority: 'low', bakery: 'Alpha' },
    { title: 'Finished', status: 'done', completedAt: '2026-07-01T00:00:00.000Z', bakery: 'Beta' }
  ];

  assert.deepEqual(tasks.slice().sort(context.actionSorter('dueAsc')).map((t) => t.title),
    ['Sooner', 'Later', 'Finished']);
  assert.deepEqual(tasks.slice().sort(context.actionSorter('dueDesc')).map((t) => t.title),
    ['Later', 'Sooner', 'Finished']);
  assert.deepEqual(tasks.slice().sort(context.actionSorter('priority')).map((t) => t.title),
    ['Later', 'Sooner', 'Finished']);
  assert.deepEqual(tasks.slice().sort(context.actionSorter('bakeryAsc')).map((t) => t.title),
    ['Sooner', 'Later', 'Finished']);
  // Completed work sinks below open work whichever ordering is chosen.
  ['dueAsc', 'dueDesc', 'priority', 'bakeryAsc', 'createdAsc'].forEach((sort) => {
    assert.equal(tasks.slice().sort(context.actionSorter(sort)).at(-1).title, 'Finished', sort);
  });
});

test('open actions export the filtered list, not the whole hub', () => {
  assert.match(html, /id="myActionsExportBtn"/);
  assert.match(script, /pendingActionsExport = buildActionsExportData\(shown, filters\)/);
  // Nothing to export means nothing to click.
  assert.match(script, /if \(actionsExportBtn\) actionsExportBtn\.disabled = !shown\.length;/);
  assert.match(script, /pendingActionsExport = null;/);

  const start = script.indexOf('function buildActionsExportData(');
  const builder = script.slice(start, script.indexOf('\n}', start));
  ['Bakery', 'Region', 'Ops Area', 'Action', 'Detail', 'Priority', 'Due Date',
    'Days Overdue', 'Status', 'Added', 'Completed', 'Profiles'].forEach((label) => {
    assert.ok(builder.includes("label: '" + label + "'"), 'export is missing the ' + label + ' column');
  });
  assert.match(builder, /sheetName: 'My Actions'/);
});

test('the bakery names drop the GAIL\'s prefix everywhere on the page', () => {
  const context = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: (name) => "GAIL's " + name }
  });

  assert.equal(context.bakerySiteName('Balham'), 'Balham');
  assert.equal(context.bakerySiteName('Battersea Square'), 'Battersea Square');

  // Whatever shape the stored display name takes.
  const curly = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: () => 'GAIL’s Kings Cross' }
  });
  assert.equal(curly.bakerySiteName('x'), 'Kings Cross');
  const plainPrefix = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: () => 'Gails Wandsworth' }
  });
  assert.equal(plainPrefix.bakerySiteName('x'), 'Wandsworth');
  // A name that merely contains the word is left alone.
  const unrelated = extract(['bakeryLabel', 'bakerySiteName'], {
    G: { getBakeryMapLabel: () => 'Nightingale Gails Corner' }
  });
  assert.equal(unrelated.bakerySiteName('x'), 'Nightingale Gails Corner');

  // Every card, filter option, ordering, and export column on the page uses the
  // short name — one section keeping the prefix would read as a bug.
  assert.match(script, /escapeHtml\(bakerySiteName\(visit\.bakery\)\) \+ '<\/a>'/);
  assert.match(script, /escapeHtml\(bakerySiteName\(task\.bakery\)\) \+ '<\/a>'/);
  assert.match(script, /escapeHtml\(bakerySiteName\(event\.bakery\)\)/);
  assert.match(script, /\}\), 'All Bakeries', bakerySiteName\);/);
  assert.match(script, /sortVal === 'nameAsc'\) return bakerySiteName/);
  // Both exports name the column after the filter beside it.
  assert.match(script, /\{ label: 'Bakery', type: 'text', width: 26 \}/);
  assert.match(script, /\{ label: 'Bakery', type: 'text', width: 24 \}/);
  // "Site" was never the word this estate uses for a bakery.
  assert.doesNotMatch(script, /'All Sites'|label: 'Site'/);
  assert.doesNotMatch(html, />All Sites</);
  // Only the search haystacks keep the full label, so a bakery is still found
  // whether or not someone types the prefix.
  assert.match(script, /bakeryLabel\(v\.bakery\), bakerySiteName\(v\.bakery\)/);
  assert.match(script, /bakerySiteName\(task\.bakery\), bakeryLabel\(task\.bakery\)/);
});

test('a visit report opens in a modal on the hub itself', () => {
  // The dashboard's own modal markup, so js/visit-report.js renders into it
  // unchanged rather than the report being reimplemented here.
  ['visitReportModal', 'visitReportTitle', 'visitReportSubtitle', 'visitReportBody'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'));
  });
  assert.match(html, /src="js\/visit-report\.js(?:\?[^"]+)?"/);

  // js/visit-report.js reads GAILS.CQVShared at load time, and CQVShared calls
  // CQVCriticals — so this order is load-bearing, not cosmetic.
  // Matched on the src attribute, not the bare filename — the comment above
  // these tags names js/visit-report.js too.
  const order = ['js/cqv-criticals.js', 'js/cqv-shared.js', 'js/visit-report.js']
    .map((src) => html.indexOf('src="' + src));
  assert.ok(order.every((at) => at > 0), 'a report dependency is missing');
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'report dependencies load out of order');

  assert.match(script, /G\.openVisitReportById\(visitId\)/);
});

test('the report link degrades to the dashboard when the renderer is absent', () => {
  // It stays a real anchor with a working href: the modal is an enhancement,
  // and openReportModal reports whether it handled the click.
  assert.match(script, /href="index\.html\?visit=' \+ encodeURIComponent\(visit\.id\)/);
  const start = script.indexOf('function openReportModal(');
  const fn = script.slice(start, script.indexOf('\n}', start));
  assert.match(fn, /if \(typeof G\.openVisitReportById !== 'function'\) return false;/);
  assert.match(script, /if \(openReportModal\([\s\S]*?\)\) event\.preventDefault\(\)/);

  // Ctrl/cmd/middle-click still open the dashboard report in a new tab.
  assert.match(script, /event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey/);
  assert.match(script, /event\.button !== 0/);
});

test('the hub does not collide with the dashboard\'s own report trigger', () => {
  // js/visit-report.js binds a document click handler to [data-visit-report]
  // and reads it as a *bakery name*. Reusing that attribute for a visit id
  // would fire both handlers on every click.
  assert.match(visitReportScript, /closest\('\[data-visit-report\]'\)/);
  assert.match(script, /data-open-visit-report=/);
  assert.doesNotMatch(script, /data-visit-report=/);
});

test('the report\'s history arrows stay inside the activity visit list', () => {
  const start = script.indexOf('function syncReportSource(');
  const fn = script.slice(start, script.indexOf('\n}', start));

  // Seeded from activityVisits(), not the whole estate: those arrows can
  // include patch colleagues and the user's own out-of-area visits.
  assert.match(fn, /activityVisits\(\)\.forEach/);
  assert.match(fn, /G\._allVisitsObj = patch/);
  assert.doesNotMatch(fn, /G\._allVisitsObj = visitsObj/);

  // And the renderer gets the permissions it would have had on the dashboard.
  assert.match(script, /G\.permissions = permissions;/);
});

test('a bakery opened from the hub comes back to the hub', () => {
  const start = script.indexOf('function bakeryProfileHref(');
  const builder = script.slice(start, script.indexOf('\n}', start));

  assert.match(builder, /'my-activity\.html#' \+ \(section \|\| 'section-actions'\)/);
  assert.match(builder, /fromLabel=' \+ encodeURIComponent\('My Activity'\)/);
  // Each section sends people back to where they were.
  assert.match(script, /bakeryProfileHref\(task\.bakery, 'section-actions'\)/);
  assert.match(script, /bakeryProfileHref\(visit\.bakery, 'section-visits'\)/);
  assert.match(script, /bakeryProfileHref\(task\.bakery, 'section-timeline'\)/);
});

test('My Activity is opt-in per user and off by default', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const profilePage = fs.readFileSync(path.join(root, 'js', 'profile-page.js'), 'utf8');
  const profileHtml = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

  // Absent means off, everywhere it is read.
  assert.match(adminScript, /myActivity: users\[uid\]\.myActivity === true/);
  [authScript, adminScript, profilePage, script].forEach((source) => {
    assert.match(source, /myActivity === true/);
  });

  // Every entry point starts hidden in the markup, so it can never flash before
  // the profile has loaded.
  [indexHtml, adminHtml].forEach((page) => {
    assert.match(page, /data-my-activity-link hidden/);
  });
  const standaloneMenu = fs.readFileSync(path.join(root, 'js', 'standalone-profile-menu.js'), 'utf8');
  assert.match(profileHtml, /data-standalone-account-menu/);
  assert.match(standaloneMenu, /data-standalone-activity-link hidden/);
  assert.match(profilePage, /showActivity: profileRecord\.myActivity === true/);

  // The page refuses a typed URL, which the hidden menu entry alone cannot do.
  assert.match(script, /showGuardError\('My Activity is not switched on for your account/);

  // ...and a non-admin cannot grant it to themselves by writing their own record.
  const selfWrite = rules.rules.users.$uid['.write'];
  assert.match(selfWrite, /auth\.uid === \$uid[\s\S]*?newData\.child\('myActivity'\)\.val\(\) === data\.child\('myActivity'\)\.val\(\)/);
});

test('the access modal can switch My Activity on and off', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');

  // The switch lives in the person's access modal, alongside every other
  // decision about them.
  assert.match(adminHtml, /id="userAccessMyActivity"/);
  assert.match(adminScript, /userAccessMyActivity\.checked = state\.accessDraft\.myActivity/);

  // Saving the modal writes it with the rest of that person's access, so the
  // four fields can never end up half-applied.
  const saveStart = adminScript.indexOf('async function saveAccessModal()');
  const save = adminScript.slice(saveStart, adminScript.indexOf('\n}', saveStart));
  assert.match(save, /myActivity: draft\.myActivity === true/);
  assert.match(save, /role: draft\.role/);
  assert.match(save, /managerUid: draft\.managerUid/);

  // Role and reporting line lock on your own account so an admin cannot demote
  // or orphan themselves — but the feature switch stays live, written on its
  // own, because with a lone admin nobody else could ever turn it on.
  assert.match(adminScript, /userAccessMyActivity\.disabled = !canEdit\('users'\)/);
  assert.match(adminScript, /uid !== currentUserId\(\)[\s\S]{0,200}update\(ref\(db, 'users\/' \+ uid\), \{ myActivity: next \}\)/);

  // A view-only role can read the state without changing it.
  assert.match(adminScript, /userAccessRole\.disabled = !editable/);
});

test('the access modal reads a person back, including a missing flag', () => {
  const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const start = adminScript.indexOf('function accessDraftFor(');
  const source = adminScript.slice(start, adminScript.indexOf('\n}', start) + 2);

  // The draft reads the patch through js/patch.js, so the real module is loaded
  // rather than stubbed — an ops area that arrives as a bare name has to come
  // back out as a patch.
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'patch.js'), 'utf8'), sandbox);
  vm.runInContext(
    'function patchApi() { return window.GAILS.Patch; }\n' + source +
    '\nthis.accessDraftFor = accessDraftFor;',
    sandbox
  );

  const plain = (value) => JSON.parse(JSON.stringify(value));
  const on = sandbox.accessDraftFor({
    firstName: 'Alex',
    lastName: 'Partner',
    role: 'admin',
    department: 'coffee-team',
    hiddenMyTeamDepartments: { operations: true },
    myActivity: true,
    opsArea: 'North',
    managerUid: 'm1'
  });
  assert.deepEqual(plain(on), {
    firstName: 'Alex',
    lastName: 'Partner',
    role: 'admin',
    department: 'coffee-team',
    myTeamDepartments: {
      operations: false,
      'coffee-team': true
    },
    managerUid: 'm1',
    // The original single-area field reads back as a one-area patch, so nobody
    // loses their scope on the way through.
    patch: { opsAreas: [{ region: '', opsArea: 'North', bakeries: [] }], regions: [] },
    notificationScope: '',
    myActivity: true
  });

  // Absent means off, and an unset role means Viewer — a record that predates
  // any of these fields is readable, not broken.
  const bare = sandbox.accessDraftFor({});
  assert.deepEqual(plain(bare), {
    firstName: '',
    lastName: '',
    role: 'viewer',
    department: '',
    myTeamDepartments: {
      operations: true,
      'coffee-team': true
    },
    managerUid: '',
    patch: { opsAreas: [], regions: [] },
    notificationScope: '',
    myActivity: false
  });
});
