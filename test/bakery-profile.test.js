const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'bakery-profile.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'js', 'bakery-profile.js'), 'utf8');
const configScript = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const utilsScript = fs.readFileSync(path.join(root, 'js', 'utils.js'), 'utf8');
const directoryScript = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
const leagueScript = fs.readFileSync(path.join(root, 'js', 'tables.js'), 'utf8');
const drilldownScript = fs.readFileSync(path.join(root, 'js', 'drilldown.js'), 'utf8');
const targetsScript = fs.readFileSync(path.join(root, 'js', 'targets.js'), 'utf8');
const adminScript = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
const profileStyles = fs.readFileSync(path.join(root, 'css', 'bakery-profile.css'), 'utf8');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

test('bakery profile contains every requested dashboard section', () => {
  [
    'bakeryProfileMap',
    'bakeryProfileStats',
    'bakeryPerformanceChart',
    'bakeryVisitLog',
    'bakeryTaskList',
    'bakeryNotesList'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));

  assert.match(html, /Nearby bakeries &amp; coffee shops/);
  assert.match(html, /js\/bakery-profile\.js/);
});

test('bakery profile labels NBO imports and opening check-ins accurately', () => {
  const match = script.match(/function formatVisitType\(visit\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'formatVisitType helper should exist');
  const context = {
    G: {
      NBOShared: {
        visitLabel(visit) {
          return 'NBO: Coffee Visit ' + (visit.visitNumber || 1);
        }
      }
    },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(match[0] + '\nresult = formatVisitType;', context);

  assert.equal(context.result({ type: 'nbo', visitNumber: 1 }), 'NBO: Coffee Visit 1');
  assert.equal(
    context.result({ type: 'siteVisit', visitKind: 'nboOpening' }),
    'NBO: Opening'
  );
  assert.equal(
    context.result({ type: 'siteVisit', visitKind: 'checkin' }),
    'Check-in'
  );

  const sharedHelperPosition = html.indexOf('js/nbo-shared.js');
  const profileScriptPosition = html.indexOf('js/bakery-profile.js');
  assert.ok(sharedHelperPosition >= 0 && sharedHelperPosition < profileScriptPosition);
  assert.match(script, /formatVisitType\(lastVisit\)/);
  assert.match(script, /formatVisitType\(visit\)/);
});

test('bakery profile opens visit reports in the shared modal', () => {
  ['visitReportModal', 'visitReportTitle', 'visitReportSubtitle', 'visitReportBody'].forEach((id) => {
    assert.match(html, new RegExp('id="' + id + '"'));
  });
  assert.match(html, /js\/visit-schema\.js/);
  assert.match(html, /js\/cqv-shared\.js/);
  assert.match(html, /js\/nbo-shared\.js/);
  assert.match(html, /js\/visit-report\.js/);
  assert.match(script, /data-bakery-visit-report="/);
  assert.match(script, /G\._allVisitsObj = value/);
  assert.match(script, /G\.openVisitReportById\(reportButton\.getAttribute\('data-bakery-visit-report'\)\)/);
  assert.match(profileStyles, /\.bakery-activity-row__report \{/);

  const reportPosition = html.indexOf('js/visit-report.js');
  const profilePosition = html.indexOf('js/bakery-profile.js');
  assert.ok(reportPosition >= 0 && reportPosition < profilePosition);
});

test('bakery profile shows an all-time score trend above the local area', () => {
  const chartPosition = html.indexOf('id="bakeryPerformanceChart"');
  const mapPosition = html.indexOf('class="bakery-profile-grid bakery-profile-grid--map"');

  assert.ok(chartPosition >= 0 && chartPosition < mapPosition);
  assert.match(html, /Score trend vs company average and target score/);
  assert.match(html, />All time</);
  assert.match(script, /const TARGET_SCORE = 75/);
  assert.match(script, /label: 'Company average'/);
  assert.match(script, /label: 'Target Score \(' \+ TARGET_SCORE \+ '\)'/);
  assert.match(script, /Object\.keys\(bakeryRecordsByMonth\)\.sort/);
  assert.doesNotMatch(script, /Exit focus threshold/);
});

test('top-left banner uses the generic bakery profile label', () => {
  assert.match(html, /<strong>Bakery profile<\/strong>/);
  assert.doesNotMatch(html, /id="bakeryProfileHeaderName"/);
  assert.doesNotMatch(script, /getElementById\('bakeryProfileHeaderName'\)/);
});

test('mobile banner keeps every action visible with a compact accessible back button', () => {
  assert.match(html, /css\/bakery-profile\.css\?v=\d{8}-\d+/);
  assert.match(html, /id="bakeryProfileResponsiveHeaderFix"/);
  assert.match(html, /id="bakeryProfileBackLink"[\s\S]{0,260}aria-label="Back to Bakery Directory"/);
  assert.match(html, /class="bakery-profile-header__back-label">Back To Bakery Directory<\/span>/);
  const inlineBanner = html.slice(html.indexOf('id="bakeryProfileResponsiveHeaderFix"'), html.indexOf('</style>'));
  assert.match(inlineBanner, /flex:\s*0 1 260px;[\s\S]*?width:\s*260px;/);
  assert.match(inlineBanner, /grid-template-columns:\s*34px minmax\(0, 180px\) 34px;/);
  assert.match(inlineBanner, /justify-content:\s*end;[\s\S]*?margin-left:\s*auto;/);
  assert.match(inlineBanner, /\.bakery-profile-header__back-label\s*\{\s*display:\s*none !important;/);
  assert.match(inlineBanner, /#bakeryProfileSwitcherName\s*\{[\s\S]*?text-overflow:\s*ellipsis;/);
  assert.match(inlineBanner, /\.bakery-profile-switcher\s*\{[\s\S]*?position:\s*static;/);
  assert.match(inlineBanner, /\.bakery-profile-switcher__menu\s*\{[\s\S]*?right:\s*10px;[\s\S]*?left:\s*10px;[\s\S]*?width:\s*auto;/);
  assert.match(inlineBanner, /@media \(max-width: 380px\)[\s\S]*?width:\s*72px;[\s\S]*?gap:\s*4px;[\s\S]*?right:\s*8px;[\s\S]*?left:\s*8px;/);
  const responsiveBanner = profileStyles.slice(profileStyles.lastIndexOf('@media (max-width: 820px)'));
  assert.match(responsiveBanner, /\.bakery-profile-header__back\s*\{[\s\S]*?flex:\s*0 0 34px;[\s\S]*?width:\s*34px;/);
  assert.match(responsiveBanner, /\.bakery-profile-header__back-label\s*\{\s*display:\s*none;/);
  assert.match(responsiveBanner, /\.bakery-profile-header__actions\s*\{[\s\S]*?flex:\s*0 1 260px;[\s\S]*?width:\s*260px;[\s\S]*?grid-template-columns:\s*34px minmax\(0, 180px\) 34px;[\s\S]*?margin-left:\s*auto;/);
  assert.match(responsiveBanner, /\.bakery-profile-switcher\s*\{[\s\S]*?position:\s*static;/);
  assert.match(responsiveBanner, /\.bakery-profile-switcher__menu\s*\{[\s\S]*?right:\s*10px;[\s\S]*?left:\s*10px;[\s\S]*?width:\s*auto;/);
  assert.match(script, /backLabel\.textContent = text/);
  assert.doesNotMatch(script, /backLink\.textContent = text/);
});

test('profile display name omits the GAILs brand prefix', () => {
  const source = script
    .match(/function profileDisplayBakeryName\(value\) \{[\s\S]*?\n\}/)[0]
    .replace('function profileDisplayBakeryName(value)',
      'result = function profileDisplayBakeryName(value)');
  const context = { result: null };
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.equal(context.result("GAIL's Abbeville"), 'Abbeville');
  assert.equal(context.result('GAIL’S Clapham Old Town'), 'Clapham Old Town');
  assert.equal(context.result('Balham'), 'Balham');
  assert.match(script, /bakeryProfileTitle'\)\.textContent = title/);
});

test('top banner provides an accessible bakery profile switcher', () => {
  assert.match(html, /Bakery Directory[\s\S]*id="bakeryProfileSwitcherToggle"/);
  [
    'bakeryProfileSwitcherToggle',
    'bakeryProfileSwitcherName',
    'bakeryProfileSwitcherMenu',
    'bakeryProfileSwitcherSearch',
    'bakeryProfileSwitcherOptions',
    'bakeryProfileSwitcherCount'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));
  assert.match(html, /aria-haspopup="listbox"/);
  assert.match(html, /role="listbox"/);
  assert.match(script, /bakerySwitcherName\.textContent = profileDisplayBakeryName\(bakeryName\)/);
  assert.match(script, /bakerySwitcherCount\.textContent = query/);
  assert.doesNotMatch(script, /bakery-profile-switcher__initial/);
  assert.match(script, /profileUrlFor\(name\)/);
  assert.match(script, /encodeQueryValue\(profileReturnContext\.url\)/);
  assert.match(script, /if \(!reportScopeActive\) return true/);
  assert.match(script, /meta\.o === currentUserProfile\.opsArea/);
  assert.match(script, /event\.key === 'Escape'/);
  assert.match(script, /event\.key === 'ArrowDown'/);
  assert.match(script, /!bakerySwitcher\.contains\(event\.target\)/);
});

test('follow-up tasks are added through a dialog opened from the section', () => {
  assert.match(html, /id="bakeryTaskAddToggle"[\s\S]*?aria-haspopup="dialog"[\s\S]*?aria-controls="bakeryTaskModal"/);
  assert.match(html, /id="bakeryTaskModal"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"[\s\S]*?aria-labelledby="bakeryTaskModalTitle"[\s\S]*?hidden>/);
  assert.match(html, /id="bakeryTaskModalBackdrop"/);

  const modal = html.slice(html.indexOf('id="bakeryTaskModal"'));
  [
    'bakeryTaskForm',
    'bakeryTaskTitle',
    'bakeryTaskDetail',
    'bakeryTaskDueDate',
    'bakeryTaskPriority',
    'bakeryTaskCancel',
    'bakeryTaskSubmit'
  ].forEach((id) => assert.match(modal, new RegExp('id="' + id + '"')));

  // The form only ever renders inside the dialog, so it carries no hidden state of its own.
  assert.doesNotMatch(html, /<form id="bakeryTaskForm"[^>]*\shidden/);
  assert.match(profileStyles, /\.bakery-profile-modal__dialog \{/);
  assert.match(profileStyles, /body\.bakery-profile-modal-open \{/);

  assert.match(script, /setModalOpen\(taskModal, true\)/);
  assert.match(script, /classList\.toggle\('bakery-profile-modal-open'/);
  assert.match(script, /\[taskCancel, taskModalClose, taskModalBackdrop\]/);
  assert.match(script, /function trapModalFocus/);
  assert.match(script, /function dismissTaskForm\(\) \{\s*if \(taskSaving\) return;/);
  assert.match(script, /data-task-add/);
});

test('uses Google Maps with a no-key directions handoff', () => {
  assert.doesNotMatch(html, /leaflet/i);
  assert.match(html, /id="bakeryDirectionsLink"/);
  assert.match(script, /https:\/\/maps\.google\.com\/maps\?q=/);
  assert.match(script, /https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/);
  assert.match(script, /travelmode=driving/);
});

test('nearby competition is live, cached, and linked to Google Maps', () => {
  [
    'bakeryCompetitionList',
    'bakeryCompetitionStatusTag',
    'bakeryCompetitionResultCount'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));

  assert.doesNotMatch(html, /Next phase|ready to connect|Not connected/);
  assert.match(html, /OpenStreetMap contributors/);
  assert.match(html, /Food Standards Agency/);
  assert.match(script, /api\.ratings\.food\.gov\.uk\/Establishments/);
  assert.match(script, /'x-api-version': '2'/);
  assert.match(script, /overpass-api\.de\/api\/interpreter/);
  assert.match(script, /\["shop"="bakery"\]/);
  assert.match(script, /\["amenity"="cafe"\]/);
  assert.match(script, /COMPETITION_RADIUS_METRES = 1000/);
  assert.match(script, /COMPETITION_CACHE_TTL = 12 \* 60 \* 60 \* 1000/);
  assert.match(script, /maps\/search\/\?api=1&query=/);
  assert.match(script, /travelmode=walking/);
});

test('Banbury uses the shopping park centre and includes current Greggs records', () => {
  assert.match(configScript, /"Banbury Gateway":[^{]*\{[^}]*"ll": \[52\.076677, -1\.318543\]/);
  assert.match(script, /\["name"~"Greggs","i"\]/);
  assert.match(script, /namePattern = \/bakery\|cafe\|coffee\|patisserie\|tearoom\|greggs/);
  assert.match(script, /'Banbury Gateway': \{\s*removeNames: \['starbucks'\]/);
});

test('a current Greggs record supersedes a stale Starbucks record at the same location', () => {
  const functionNames = [
    'distanceMetres',
    'normalisedPlaceName',
    'sameCompetitionPlace',
    'mergeCompetitionSources'
  ];
  const source = functionNames.map((name) => {
    const match = script.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    assert.ok(match, name + ' helper should exist');
    return match[0];
  }).join('\n') +
    '\nfunction applyCompetitionCorrections(places) { return places; }' +
    '\nresult = mergeCompetitionSources;';
  const context = { result: null };
  vm.createContext(context);
  vm.runInContext(source, context);

  const places = context.result(
    [{ name: 'Starbucks', lat: 52.0766, lon: -1.3185, distance: 50 }],
    [{ name: 'Greggs', lat: 52.0767, lon: -1.3185, distance: 45 }]
  );
  assert.deepEqual(Array.from(places, (place) => place.name), ['Greggs']);
});

test('nearby competition excludes GAILs, removes duplicates, and sorts by distance', () => {
  const functionNames = [
    'distanceMetres',
    'normalisedPlaceName',
    'competitionCategory',
    'competitionAddress',
    'isClosedCompetitionTags',
    'normaliseCompetitionElements'
  ];
  const source = functionNames.map((name) => {
    const match = script.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    assert.ok(match, name + ' helper should exist');
    return match[0];
  }).join('\n') + '\nresult = normaliseCompetitionElements;';
  const context = { result: null };
  vm.createContext(context);
  vm.runInContext(source, context);

  const places = context.result([
    { lat: 51.5100, lon: -0.1200, tags: { name: "GAIL's", shop: 'bakery' } },
    { lat: 51.5090, lon: -0.1200, tags: { name: 'Far Coffee', amenity: 'cafe' } },
    { lat: 51.5078, lon: -0.1200, tags: { name: 'Near Bakery', shop: 'bakery' } },
    { lat: 51.5078, lon: -0.1200, tags: { name: 'Near Bakery', shop: 'bakery' } },
    { lat: 51.5075, lon: -0.1200, tags: { amenity: 'cafe' } }
  ], [51.5074, -0.1200]);

  assert.deepEqual(Array.from(places, (place) => place.name), ['Near Bakery', 'Far Coffee']);
  assert.equal(places[0].category, 'Bakery');
  assert.ok(places[0].distance < places[1].distance);
});

test('every table with a bakery-name column links that name to the profile', () => {
  assert.match(leagueScript, /G\.bakeryProfileLink\(b\.b,[\s\S]*?returnLabel: 'League Table'/);
  assert.match(drilldownScript, /GAILS\.bakeryProfileLink\(row\.b,[\s\S]*?returnLabel: 'Overview'/);
  assert.match(targetsScript, /GAILS\.bakeryProfileLink\(item\.bakery,[\s\S]*?returnLabel: mapKey === 'target' \? 'Focus Bakeries' : 'Map'/);
  assert.match(targetsScript, /G\.bakeryProfileLink\(r\.name,[\s\S]*?className: 'focus-qrow__name',[\s\S]*?returnLabel: 'Focus Bakeries'/);
  assert.equal((targetsScript.match(/G\.bakeryProfileLink\((?:r\.name|b\.b|t\.name),/g) || []).length, 3);
  assert.match(directoryScript, /GAILS\.bakeryProfileLink\(row\.bakery,[\s\S]*?returnLabel: 'Bakery Directory'/);
  assert.match(adminScript, /GAILS\.bakeryProfileLink\(row\.name,[\s\S]*?returnLabel: 'Site Data'/);
  assert.match(adminScript, /GAILS\.bakeryProfileLink\(v\.bakery,[\s\S]*?returnLabel: 'Bakery Visits'/);
  assert.doesNotMatch(targetsScript, /<button[^>]*class="focus-name-link"/);
});

test('profile links encode their bakery and originating page', () => {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(utilsScript, context);

  const url = context.GAILS.getBakeryProfileUrl("King's Road", {
    returnUrl: 'index.html#table',
    returnLabel: 'League Table'
  });
  assert.equal(
    url,
    'bakery-profile.html?bakery=King%27s%20Road&from=index.html%23table&fromLabel=League%20Table'
  );
  assert.match(context.GAILS.bakeryProfileLink('Worthing', {
    returnUrl: 'index.html#target',
    returnLabel: 'Focus Bakeries'
  }), /<a class="bakery-profile-link" href="bakery-profile\.html\?bakery=Worthing&amp;from=index\.html%23target&amp;fromLabel=Focus%20Bakeries"/);
});

test('profile back control uses and preserves the named originating page', () => {
  assert.match(html, /id="bakeryProfileBackLink"[\s\S]*?Back To Bakery Directory/);
  assert.match(script, /params\.get\('from'\)/);
  assert.match(script, /params\.get\('fromLabel'\)/);
  assert.match(script, /backLabel\.textContent = text/);
  assert.match(script, /'Back To ' \+ profileReturnContext\.label/);
  assert.match(script, /escapeHtml\(profileUrlFor\(name\)\)/);
  assert.match(script, /RETURN_PAGES\.indexOf\(pageName\) === -1/);
  // The allowlist is what stops ?from bouncing someone off the site.
  assert.match(script, /const RETURN_PAGES = \['index\.html', 'admin\.html', 'my-activity\.html'\]/);
});

test('profile resolves a safe named return destination from its link parameters', () => {
  const source = [
    script.match(/const RETURN_LABELS = \{[\s\S]*?\n\};/)[0],
    script.match(/const RETURN_PAGES = \[[^\]]*\];/)[0],
    ...['safeReturnUrl', 'labelFromReturnUrl', 'getProfileReturnContext'].map((name) => {
      const match = script.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
      assert.ok(match, name + ' helper should exist');
      return match[0];
    }),
    'result = getProfileReturnContext();'
  ].join('\n');
  const context = {
    URL,
    URLSearchParams,
    document: { referrer: '' },
    location: {
      href: 'https://example.test/bakery-profile.html?bakery=Worthing&from=index.html%23table&fromLabel=League%20Table',
      origin: 'https://example.test',
      search: '?bakery=Worthing&from=index.html%23table&fromLabel=League%20Table'
    },
    result: null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context);

  assert.deepEqual(
    JSON.parse(JSON.stringify(context.result)),
    { url: 'index.html#table', label: 'League Table' }
  );

  // A bakery opened from the My Activity hub goes back to the hub, and to the
  // section it was opened from.
  assert.deepEqual(JSON.parse(JSON.stringify(context.safeReturnUrl('my-activity.html#section-visits'))),
    'my-activity.html#section-visits');
  assert.equal(context.labelFromReturnUrl('my-activity.html#section-visits'), 'My Activity');
  assert.equal(context.labelFromReturnUrl('my-activity.html'), 'My Activity');
  // Somewhere else entirely is still discarded.
  assert.equal(context.safeReturnUrl('https://evil.test/index.html'), '');
  assert.equal(context.safeReturnUrl('login.html'), '');
});

test('profile uses the shared data nodes and author-attributed server-timestamped notes', () => {
  assert.match(script, /ref\(db, 'dashboardData'\)/);
  assert.match(script, /ref\(db, 'routineVisits'\)/);
  assert.match(script, /ref\(db, 'followUpActions'\)/);
  assert.match(script, /ref\(db, 'bakeryNotes\/' \+ bakeryPathKey\(bakeryName\)\)/);
  assert.match(script, /createdAt: serverTimestamp\(\)/);
  assert.match(script, /createdBy: author/);
  assert.match(script, /updatedAt: serverTimestamp\(\)/);
  assert.match(script, /updatedBy: author/);
});

test('notes have authenticated read/write rules and validated author metadata', () => {
  const noteRules = rules.rules.bakeryNotes;
  assert.equal(noteRules['.read'], 'auth != null');
  const entryRules = noteRules.$bakeryKey.$noteId;
  assert.match(entryRules['.write'], /auth != null/);
  assert.match(entryRules['.validate'], /createdBy/);
  assert.match(entryRules['.validate'], /auth\.uid/);
});

test('a note is editable by its author or an admin, and deletable only by admins', () => {
  const source = ['isNoteAuthor', 'canEditNote', 'canDeleteNote'].map((name) => {
    const match = script.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}'));
    assert.ok(match, name + ' helper should exist');
    return match[0];
  }).join('\n') + '\nresult = { isNoteAuthor, canEditNote, canDeleteNote };';
  const context = { currentUser: null, isAdmin: false, canEdit: true, result: null };
  vm.createContext(context);
  vm.runInContext(source, context);
  const own = { createdBy: { uid: 'me' } };
  const theirs = { createdBy: { uid: 'someone-else' } };
  const legacy = { createdBy: 'someone@example.test' };

  // Signed out: nothing is editable.
  assert.equal(context.result.canEditNote(own), false);
  assert.equal(context.result.canDeleteNote(), false);

  context.currentUser = { uid: 'me' };
  assert.equal(context.result.canEditNote(own), true);
  assert.equal(context.result.canEditNote(theirs), false);
  assert.equal(context.result.canEditNote(legacy), false);
  assert.equal(context.result.canDeleteNote(), false);

  // Without the logVisits action even your own note is read-only.
  context.canEdit = false;
  assert.equal(context.result.canEditNote(own), false);

  // Admins edit anything and are the only ones who can delete.
  context.isAdmin = true;
  assert.equal(context.result.canEditNote(own), true);
  assert.equal(context.result.canEditNote(theirs), true);
  assert.equal(context.result.canEditNote(legacy), true);
  assert.equal(context.result.canDeleteNote(), true);
});

test('note rules limit edits to the author or an admin and deletes to admins', () => {
  const entryRules = rules.rules.bakeryNotes.$bakeryKey.$noteId;
  const write = entryRules['.write'];
  const admin = "root.child('admins').child(auth.uid).val() === true || " +
    "root.child('users').child(auth.uid).child('role').val() === 'admin'";

  assert.ok(write.includes("!data.exists() && newData.exists()"), 'creates stay permission-gated');
  assert.ok(write.includes("data.exists() && newData.exists() && " +
    "(data.child('createdBy').child('uid').val() === auth.uid || " + admin + ")"),
  'edits are limited to the note author or an admin');
  assert.ok(write.includes("data.exists() && !newData.exists() && (" + admin + ")"),
    'deletes are admin-only');
  // An admin editing someone else's note must not rewrite who wrote it.
  assert.ok(entryRules['.validate'].includes(
    "newData.child('createdBy').child('uid').val() === data.child('createdBy').child('uid').val()"),
  'edits preserve the original author');
});

test('deleting a note goes through an admin confirmation dialog', () => {
  assert.match(html, /id="bakeryNoteDeleteModal"[\s\S]*?role="alertdialog"[\s\S]*?aria-modal="true"[\s\S]*?hidden>/);
  [
    'bakeryNoteDeleteBackdrop',
    'bakeryNoteDeleteClose',
    'bakeryNoteDeleteCancel',
    'bakeryNoteDeleteConfirm',
    'bakeryNoteDeleteAuthor',
    'bakeryNoteDeletePreview'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));

  assert.match(script, /data-note-delete/);
  assert.match(script, /function openNoteDelete\(id\) \{\s*var note = notes\[id\];\s*if \(!note \|\| !canDeleteNote\(\)/);
  assert.match(script, /function dismissNoteDelete\(\) \{\s*if \(noteDeleting\) return;/);
  assert.match(script, /\[noteDeleteCancel, noteDeleteClose, noteDeleteBackdrop\]/);
  // The dialog names and quotes the note before it is destroyed.
  assert.match(script, /noteDeleteAuthor\.textContent = noteAuthor\(note\)/);
  assert.match(script, /noteDeletePreview\.textContent = note\.body/);
  assert.match(script, /await remove\(ref\(db, 'bakeryNotes\/' \+ bakeryPathKey\(bakeryName\) \+ '\/' \+ id\)\)/);
  assert.match(profileStyles, /\.bakery-note-entry__delete \{/);
});

test('bakery note path keys are safe for Firebase paths', () => {
  const source = script
    .match(/function bakeryPathKey\(value\) \{[\s\S]*?\n\}/)[0]
    .replace('function bakeryPathKey(value)', 'result = function bakeryPathKey(value)');
  const context = {
    encodeURIComponent,
    canonicalName(value) { return value; },
    result: null
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const key = context.result("GAIL's Test./#[$]");
  assert.doesNotMatch(key, /[.#$/[\]]/);
});

test('company rank counts each bakery once, not each stored row', () => {
  const source = ['isScoredRecord', 'companyRecordsForMonth', 'companyRankForRecord']
    .map((name) => script.match(new RegExp('function ' + name + '\\(.*?\\) \\{[\\s\\S]*?\\n\\}'))[0])
    .join('\n');
  const record = (b, ac, extra) => Object.assign({ b, m: 'Jun 26', ac, v: 20 }, extra);
  const context = {
    bakeryName: 'Union Street, Bath',
    // The dataset carries this site twice under punctuation variants — the
    // shared alias lookup collapses both onto one canonical name.
    dashboardRecords: [
      record('Union Street, Bath', 80),
      record('Union Street - Bath', 80, { v: 4 }),
      record('Alpha', 90),
      record('Bravo', 70),
      record('Charlie', 60, { noData: true }),
      record('Delta', 95, { m: 'May 26' })
    ],
    canonicalName(value) {
      const name = String(value || '').trim();
      return name === 'Union Street - Bath' ? 'Union Street, Bath' : name;
    },
    sameBakery(value) { return context.canonicalName(value) === context.bakeryName; },
    Number, Object, isNaN, Math
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  const rank = context.companyRankForRecord(record('Union Street, Bath', 80));
  // Alpha, Union Street, Bravo — the duplicate row and the unscored bakery are
  // both out, and other months never join the cohort.
  assert.equal(rank.total, 3);
  assert.equal(rank.rank, 2);
  assert.equal(rank.topPercent, 67);
  assert.equal(context.companyRecordsForMonth('Jun 26').length, 3);
});
