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
  assert.match(script, /backLink\.textContent = text/);
  assert.match(script, /'← Back To ' \+ profileReturnContext\.label/);
  assert.match(script, /escapeHtml\(profileUrlFor\(name\)\)/);
  assert.match(script, /pageName !== 'index\.html' && pageName !== 'admin\.html'/);
});

test('profile resolves a safe named return destination from its link parameters', () => {
  const source = [
    script.match(/const RETURN_LABELS = \{[\s\S]*?\n\};/)[0],
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
