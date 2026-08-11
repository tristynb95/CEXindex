const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const configSource = fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8');
const visitReportSource = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadConfig() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(configSource, context);
  return context.window.GAILS;
}

function loadDirectoryBuilder() {
  const GAILS = {
    CQVShared: {
      hasCriticalFail() { return false; },
      band() { return ''; },
      bandColor() { return ''; },
      priorityColor() { return ''; },
      criticalTag() { return ''; },
      lostPointItems() { return []; }
    },
    NBOShared: {
      pctText() { return ''; },
      scorable() { return []; },
      visitLabel() { return ''; }
    },
    escapeHtml(value) { return String(value == null ? '' : value); }
  };
  const context = {
    console,
    document: {
      addEventListener() {},
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; }
    },
    setTimeout,
    clearTimeout,
    GAILS
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(visitReportSource, context);
  return GAILS;
}

test('normalizes regional coffee-team assignments for directory lookups', () => {
  const GAILS = loadConfig();
  GAILS.setRegionAssignments([
    {
      region: '  South   Region ',
      coffeePartner: ' Alex ',
      coffeeTrainer: ' Jordan '
    }
  ]);

  assert.deepEqual(plain(GAILS.getRegionAssignment('south region')), {
    region: 'South Region',
    coffeePartner: 'Alex',
    coffeeTrainer: 'Jordan',
    coverEnabled: false,
    partnerFromCover: false,
    trainerFromCover: false
  });
});

test('a region on cover resolves each role from the ops area, falling back to the region', () => {
  const GAILS = loadConfig();
  GAILS.setRegionAssignments([
    {
      region: 'South Region',
      coffeePartner: 'Alex',
      coffeeTrainer: 'Jordan',
      cover: {
        enabled: true,
        areas: [
          { opsArea: 'Safa Aden', coffeePartner: 'Morgan', coffeePartnerUid: 'u-morgan' }
        ]
      }
    }
  ]);

  // The covered area takes Morgan as its Coffee Partner, but nobody covers the
  // Coffee Trainer there, so Jordan still has it.
  assert.deepEqual(plain(GAILS.getRegionAssignment('South Region', 'safa aden')), {
    region: 'South Region',
    coffeePartner: 'Morgan',
    coffeeTrainer: 'Jordan',
    coverEnabled: true,
    partnerFromCover: true,
    trainerFromCover: false
  });

  // Every other ops area in the region carries on unchanged.
  assert.deepEqual(plain(GAILS.getRegionAssignment('South Region', 'Other Area')), {
    region: 'South Region',
    coffeePartner: 'Alex',
    coffeeTrainer: 'Jordan',
    coverEnabled: true,
    partnerFromCover: false,
    trainerFromCover: false
  });
});

test('cover switched off hands every ops area back to the region', () => {
  const GAILS = loadConfig();
  GAILS.setRegionAssignments([
    {
      region: 'South Region',
      coffeePartner: 'Alex',
      coffeeTrainer: 'Jordan',
      cover: {
        enabled: false,
        areas: [{ opsArea: 'Safa Aden', coffeePartner: 'Morgan' }]
      }
    }
  ]);

  const resolved = plain(GAILS.getRegionAssignment('South Region', 'Safa Aden'));
  assert.equal(resolved.coffeePartner, 'Alex');
  assert.equal(resolved.coverEnabled, false);
  assert.equal(resolved.partnerFromCover, false);
});

test('builds the bakery directory with exactly the requested fields', () => {
  const GAILS = loadDirectoryBuilder();
  GAILS.BAKERY_META = {
    Beta: { r: 'North Region', o: 'Ops Two' },
    Alpha: { r: 'South Region', o: 'Ops One' }
  };
  GAILS.getBakeryRegion = function (name) { return GAILS.BAKERY_META[name].r; };
  GAILS.getBakeryOps = function (name) { return GAILS.BAKERY_META[name].o; };
  GAILS.getBakeryMapLabel = function (name) {
    return name === 'Beta' ? 'GAIL\u2019s ' + name : "GAIL's " + name;
  };
  GAILS.getRegionAssignment = function (region) {
    return region === 'South Region'
      ? { coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }
      : { coffeePartner: 'Sam', coffeeTrainer: 'Taylor' };
  };
  GAILS.getOpsAreaAssignment = function (ops) {
    return ops === 'Ops One'
      ? { areaHeadBarista: 'Robin', homeBakery: 'Alpha' }
      : { areaHeadBarista: 'Ash', homeBakery: 'Beta' };
  };

  const rows = plain(GAILS.buildBakeryDirectoryRows({}));

  assert.deepEqual(rows, [
    {
      bakery: 'Alpha',
      ops: 'Ops One',
      region: 'South Region',
      coffeePartner: 'Alex',
      coffeeTrainer: 'Jordan',
      areaHeadBarista: 'Robin'
    },
    {
      bakery: 'Beta',
      ops: 'Ops Two',
      region: 'North Region',
      coffeePartner: 'Sam',
      coffeeTrainer: 'Taylor',
      areaHeadBarista: 'Ash'
    }
  ]);
  assert.deepEqual(Object.keys(rows[0]), [
    'bakery',
    'ops',
    'region',
    'coffeePartner',
    'coffeeTrainer',
    'areaHeadBarista'
  ]);
});

test('filters the directory across bakery, ops, region, partner and trainer', () => {
  const GAILS = loadDirectoryBuilder();
  GAILS.BAKERY_META = {
    Alpha: { r: 'South Region', o: 'Ops One' },
    Beta: { r: 'North Region', o: 'Ops Two' }
  };
  GAILS.getBakeryRegion = function (name) { return GAILS.BAKERY_META[name].r; };
  GAILS.getBakeryOps = function (name) { return GAILS.BAKERY_META[name].o; };
  GAILS.getRegionAssignment = function (region) {
    return region === 'South Region'
      ? { coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }
      : { coffeePartner: 'Sam', coffeeTrainer: 'Taylor' };
  };

  GAILS.getOpsAreaAssignment = function (ops) {
    return ops === 'Ops One' ? { areaHeadBarista: 'Robin' } : { areaHeadBarista: 'Ash' };
  };

  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ search: 'taylor' })).map((row) => row.bakery),
    ['Beta']
  );
  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ search: 'robin' })).map((row) => row.bakery),
    ['Alpha']
  );
  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ region: 'South Region', ops: 'Ops One' })).map((row) => row.bakery),
    ['Alpha']
  );
  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ region: ['South Region', 'North Region'] })).map((row) => row.bakery),
    ['Alpha', 'Beta']
  );
  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ ops: ['Ops Two'], bakery: ['Alpha', 'Beta'] })).map((row) => row.bakery),
    ['Beta']
  );
  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ bakery: 'Beta' })).map((row) => row.bakery),
    ['Beta']
  );
  assert.deepEqual(
    plain(GAILS.buildBakeryDirectoryRows({ sort: 'nameDesc' })).map((row) => row.bakery),
    ['Beta', 'Alpha']
  );
});

test('provides the complete bakery directory filter set and table grouping controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  [
    'visitLogSearch',
    'visitLogRegion',
    'visitLogOps',
    'visitLogBakery',
    'visitLogDirectorySort',
    'visitLogDirectoryGroup'
  ].forEach((id) => assert.match(html, new RegExp('id="' + id + '"')));

  assert.match(source, /class="bakery-directory__group-row/);
  assert.match(source, /bakery-directory__group-toggle/);
  assert.match(source, /class="table-wrap table-wrap--league table-wrap--floating table-wrap--directory"/);
  assert.match(source, /<table class="bakery-directory" data-table-fullscreen="off">/);
  assert.doesNotMatch(source, /bakery-directory-wrap/);
  assert.match(source, /sheetName: 'Bakery Directory'/);
  assert.match(source, /filename: buildExportFilename\('Bakery Directory'\)/);
  assert.match(source, /Download the filtered bakery directory as a formatted Excel workbook/);
  assert.match(source, /<th scope="col">Area Head Barista<\/th>/);
  assert.match(source, /data-label="Area Head Barista">.*row\.areaHeadBarista \|\| '-'/);
});

test('Bakery Reports region, ops area, and bakery filters use shared multi-select controls', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const customSelects = fs.readFileSync(path.join(root, 'js', 'custom-selects.js'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

  ['Region', 'Ops', 'Bakery'].forEach((key) => {
    assert.match(html, new RegExp('id="visitLog' + key + '"[^>]*multiple[^>]*hidden'));
    assert.match(html, new RegExp('id="visitLog' + key + 'Multiselect"'));
    assert.match(html, new RegExp('id="visitLog' + key + 'MsList"[^>]*aria-multiselectable="true"'));
  });
  assert.match(source, /function createVisitLogMultiSelect\(config\)/);
  assert.match(source, /var regionVal = getVisitLogFilterValues\('visitLogRegion'\)/);
  assert.match(source, /visitLogFilterMatches\(regionVal,/);
  assert.match(source, /event\.composedPath \? event\.composedPath\(\) : \[\][\s\S]*?if \(isOpen && !clickedInside\) close\(\)/);
  assert.match(customSelects, /if \(!select \|\| select\.multiple \|\| select\.dataset\.customSelectReady/);
  assert.match(styles, /\.bakery-ms__search\s*\{[^}]*flex:\s*1 1 0;[^}]*width:\s*0;[^}]*min-width:\s*0;/s);
  assert.match(styles, /\.visit-log-filters \.visit-log-ms \.bakery-ms__dropdown\s*\{[^}]*padding:\s*6px;[^}]*border-radius:\s*14px;/s);
  assert.match(styles, /\.visit-log-filters \.visit-log-ms \.bakery-ms__option\s*\{[^}]*padding:\s*8px 9px;[^}]*font-size:\s*0\.82rem;/s);
});

test('uses a hyphen for unassigned area head baristas in directory exports', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  assert.match(source, /row\.areaHeadBarista \|\| '-'/);
});

test('does not add a full-screen control to the bakery directory table', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');
  const tables = fs.readFileSync(path.join(root, 'js', 'tables.js'), 'utf8');

  assert.match(source, /data-table-fullscreen="off"/);
  assert.match(tables, /table\.getAttribute\('data-table-fullscreen'\) === 'off'/);
  assert.match(tables, /root\.matches\(HOST_SELECTOR\) && hostAllowsFullscreen\(root\)/);
});

test('keeps all six bakery directory columns visible in a compact fixed layout', () => {
  const styles = fs.readFileSync(path.join(root, 'css', 'styles.css'), 'utf8');

  assert.match(styles, /\.table-wrap--directory \.bakery-directory\s*\{[^}]*min-width:\s*820px;[^}]*table-layout:\s*fixed;/s);
  assert.match(styles, /\.bakery-directory thead th:nth-child\(6\)\s*\{\s*width:\s*15%;\s*\}/);
  assert.match(styles, /\.bakery-directory tbody th\s*\{[^}]*padding:\s*8px 10px;[^}]*white-space:\s*normal;/s);
  assert.match(styles, /\.bakery-directory tbody td\s*\{[^}]*padding:\s*8px 10px;[^}]*white-space:\s*normal;/s);
});

test('opens Bakery Reports on the Bakery Directory by default', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const GAILS = loadDirectoryBuilder();

  assert.match(html, /class="target-subtab active" data-view="bakeries"/);
  assert.match(html, /data-view="bakeries"[\s\S]*?<span>Bakery Directory<\/span>/);
  assert.doesNotMatch(html, /<span>Bakery List<\/span>/);
  assert.doesNotMatch(html, /class="target-subtab active" data-view="history"/);

  GAILS._activeVisitLogView = 'history';
  GAILS.resetVisitLogView();
  assert.equal(GAILS._activeVisitLogView, 'bakeries');
});

test('does not restore or persist Bakery Directory searches across refreshes', () => {
  const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

  assert.match(source, /searchEl\.value = saved\.view === 'bakeries'\s*\?\s*''/);
  assert.match(source, /search: view === 'bakeries'\s*\?\s*''/);
});
