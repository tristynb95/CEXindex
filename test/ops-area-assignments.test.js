const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'ops-area-assignments.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const opsAreas = context.window.GAILS_OPS_AREA_ASSIGNMENTS;

function loadConfig() {
  const configContext = { window: {}, console };
  vm.createContext(configContext);
  vm.runInContext(fs.readFileSync(path.join(root, 'js', 'config.js'), 'utf8'), configContext);
  return configContext.window.GAILS;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Robin runs the "Bobby Holmes" ops area from A3; Ash runs "Kate Downes" from
// B2. Ops areas are named after their ops manager, so those labels change
// whenever the manager does.
const SOUTH_SIX = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const NORTH_FOUR = ['B1', 'B2', 'B3', 'B4'];

function robinsArea(overrides) {
  return Object.assign({
    region: 'South Region',
    opsArea: 'Bobby Holmes',
    bakeries: SOUTH_SIX,
    baristas: [{ name: 'Robin Fox', uid: 'u-robin', homeBakery: 'A3' }]
  }, overrides || {});
}

function ashsArea(overrides) {
  return Object.assign({
    region: 'South Region',
    opsArea: 'Kate Downes',
    bakeries: NORTH_FOUR,
    baristas: [{ name: 'Ash Green', uid: 'u-ash', homeBakery: 'B2' }]
  }, overrides || {});
}

function bothAreas() {
  return [robinsArea(), ashsArea()];
}

function detect(pairs) {
  return pairs;
}

function byOpsArea(rows) {
  return Object.fromEntries(plain(rows).map((row) => [row.opsArea, row]));
}

function names(row) {
  return row.baristas.map((entry) => entry.name);
}

test('keeps every area head barista with their home bakery when nothing moves', () => {
  const detected = detect([
    { region: 'South Region', opsArea: 'Bobby Holmes', bakeries: SOUTH_SIX },
    { region: 'South Region', opsArea: 'Kate Downes', bakeries: NORTH_FOUR }
  ]);
  const merged = byOpsArea(opsAreas.mergeDetectedOpsAreas(detected, bothAreas()));

  assert.deepEqual(names(merged['Bobby Holmes']), ['Robin Fox']);
  assert.equal(merged['Bobby Holmes'].baristas[0].uid, 'u-robin');
  assert.equal(merged['Bobby Holmes'].baristas[0].homeBakery, 'A3');
  assert.deepEqual(names(merged['Kate Downes']), ['Ash Green']);
});

test('follows an area head barista to whichever area now holds their home bakery', () => {
  // A3 has moved into Kate's area, so Robin is listed there too — alongside
  // Ash rather than instead of them.
  const detected = detect([
    { region: 'South Region', opsArea: 'Bobby Holmes', bakeries: ['A1', 'A2', 'A4', 'A5', 'A6'] },
    { region: 'South Region', opsArea: 'Kate Downes', bakeries: NORTH_FOUR.concat(['A3']) }
  ]);
  const merged = byOpsArea(opsAreas.mergeDetectedOpsAreas(detected, bothAreas()));

  // Insertion order, not alphabetical — see the note in buildMergePlan.
  assert.deepEqual(names(merged['Kate Downes']).sort(), ['Ash Green', 'Robin Fox']);
  assert.deepEqual(names(merged['Bobby Holmes']), []);
});

test('makes them area head of a new area formed around their home bakery', () => {
  const detected = detect([
    { region: 'South Region', opsArea: 'Bobby Holmes', bakeries: ['A1', 'A2', 'A5', 'A6'] },
    { region: 'South Region', opsArea: 'New Ops Area', bakeries: ['A3', 'A4'] },
    { region: 'South Region', opsArea: 'Kate Downes', bakeries: NORTH_FOUR }
  ]);
  const merged = byOpsArea(opsAreas.mergeDetectedOpsAreas(detected, bothAreas()));

  // Robin is based at A3, so the new area is theirs even though most of their
  // old bakeries stayed behind.
  assert.deepEqual(names(merged['New Ops Area']), ['Robin Fox']);
  assert.equal(merged['New Ops Area'].baristas[0].homeBakery, 'A3');
  assert.deepEqual(names(merged['Bobby Holmes']), []);
  assert.deepEqual(names(merged['Kate Downes']), ['Ash Green']);
});

test('lists both area head baristas when two areas merge, rather than dropping one', () => {
  const detected = detect([{
    region: 'South Region',
    opsArea: 'Megan Price',
    bakeries: SOUTH_SIX.concat(NORTH_FOUR)
  }]);
  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, bothAreas()));

  assert.equal(merged.length, 1);
  assert.deepEqual(names(merged[0]).sort(), ['Ash Green', 'Robin Fox']);
  // Each keeps their own home bakery, so a later split separates them again.
  assert.deepEqual(
    merged[0].baristas.map((entry) => entry.homeBakery).sort(),
    ['A3', 'B2']
  );

  const changes = plain(opsAreas.detectChanges(detected, bothAreas()));
  assert.equal(changes.merges.length, 1);
  assert.equal(changes.merges[0].opsArea, 'Megan Price');
  assert.deepEqual(changes.merges[0].baristas.sort(), ['Ash Green', 'Robin Fox']);
  assert.deepEqual(
    changes.merges[0].from.map((item) => item.opsArea).sort(),
    ['Bobby Holmes', 'Kate Downes']
  );
});

test('separates merged area head baristas again when the area is split by home bakery', () => {
  const mergedDetected = detect([{
    region: 'South Region',
    opsArea: 'Megan Price',
    bakeries: SOUTH_SIX.concat(NORTH_FOUR)
  }]);
  const afterMerge = opsAreas.mergeDetectedOpsAreas(mergedDetected, bothAreas());

  const splitDetected = detect([
    { region: 'South Region', opsArea: 'Area One', bakeries: SOUTH_SIX },
    { region: 'South Region', opsArea: 'Area Two', bakeries: NORTH_FOUR }
  ]);
  const split = byOpsArea(opsAreas.mergeDetectedOpsAreas(splitDetected, afterMerge));

  assert.deepEqual(names(split['Area One']), ['Robin Fox']);
  assert.deepEqual(names(split['Area Two']), ['Ash Green']);
});

test('collapses one person appearing twice against the same ops area', () => {
  const stored = [
    robinsArea(),
    ashsArea({ baristas: [{ name: 'Robin Fox', uid: 'u-robin', homeBakery: 'B2' }] })
  ];
  const detected = detect([{
    region: 'South Region',
    opsArea: 'Megan Price',
    bakeries: SOUTH_SIX.concat(NORTH_FOUR)
  }]);
  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, stored));

  assert.deepEqual(names(merged[0]), ['Robin Fox']);
});

test('a removed area head barista stays removed through the next upload', () => {
  const detected = detect([{
    region: 'South Region',
    opsArea: 'Megan Price',
    bakeries: SOUTH_SIX.concat(NORTH_FOUR)
  }]);
  const afterMerge = opsAreas.mergeDetectedOpsAreas(detected, bothAreas());
  const ashIndex = afterMerge[0].baristas.findIndex((entry) => entry.name === 'Ash Green');

  const pruned = opsAreas.removeBarista(
    detected, afterMerge, 'South Region', 'Megan Price', ashIndex
  );
  assert.deepEqual(names(plain(pruned)[0]), ['Robin Fox']);

  const reuploaded = plain(opsAreas.mergeDetectedOpsAreas(detected, pruned));
  assert.deepEqual(names(reuploaded[0]), ['Robin Fox']);
});

test('adds and fills an extra area head barista row that survives a re-merge', () => {
  const detected = detect([
    { region: 'South Region', opsArea: 'Bobby Holmes', bakeries: SOUTH_SIX }
  ]);
  let rows = opsAreas.mergeDetectedOpsAreas(detected, [robinsArea()]);
  rows = opsAreas.addBarista(detected, rows, 'South Region', 'Bobby Holmes');
  assert.equal(plain(rows)[0].baristas.length, 2);

  rows = opsAreas.updateBarista(detected, rows, 'South Region', 'Bobby Holmes', 1, 'name', 'Sam Reed');
  rows = opsAreas.updateBarista(detected, rows, 'South Region', 'Bobby Holmes', 1, 'uid', 'u-sam');
  rows = opsAreas.updateBarista(detected, rows, 'South Region', 'Bobby Holmes', 1, 'homeBakery', 'A5');

  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, rows));
  assert.deepEqual(names(merged[0]), ['Robin Fox', 'Sam Reed']);

  // And splitting the area sends each of them after their own home bakery.
  const splitDetected = detect([
    { region: 'South Region', opsArea: 'Bobby Holmes', bakeries: ['A1', 'A2', 'A3'] },
    { region: 'South Region', opsArea: 'Sam Reed', bakeries: ['A4', 'A5', 'A6'] }
  ]);
  const split = byOpsArea(opsAreas.mergeDetectedOpsAreas(splitDetected, rows));
  assert.deepEqual(names(split['Bobby Holmes']), ['Robin Fox']);
  assert.deepEqual(names(split['Sam Reed']), ['Sam Reed']);
});

test('an empty added row is kept while editing but never saved', () => {
  const detected = detect([
    { region: 'South Region', opsArea: 'Bobby Holmes', bakeries: SOUTH_SIX }
  ]);
  const rows = opsAreas.addBarista(
    opsAreas.mergeDetectedOpsAreas(detected, [robinsArea()]),
    [robinsArea()],
    'South Region',
    'Bobby Holmes'
  );
  const withBlank = plain(opsAreas.mergeDetectedOpsAreas(detected, rows));

  // Still there to type into...
  assert.equal(withBlank[0].baristas.length, 2);
  assert.equal(withBlank[0].baristas[1].name, '');

  // ...and dropped on the way to Firebase (js/auth.js).
  const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
  assert.match(authSource, /return !!\(entry\.name \|\| entry\.homeBakery\);/);
});

test('an ops area renamed with no home bakery recorded still carries its people', () => {
  const noHome = robinsArea({
    baristas: [{ name: 'Robin Fox', uid: 'u-robin', homeBakery: '' }]
  });
  const detected = detect([
    { region: 'South Region', opsArea: 'Tristen Bayley', bakeries: SOUTH_SIX }
  ]);
  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, [noHome]));

  assert.deepEqual(names(merged[0]), ['Robin Fox']);
  const changes = plain(opsAreas.detectChanges(detected, [noHome]));
  assert.equal(changes.renames.length, 1);
  assert.equal(changes.renames[0].from.opsArea, 'Bobby Holmes');
  assert.equal(changes.renames[0].to.opsArea, 'Tristen Bayley');
});

test('retains people whose ops area has vanished from the workbook entirely', () => {
  const detected = detect([
    { region: 'South Region', opsArea: 'Kate Downes', bakeries: NORTH_FOUR }
  ]);
  const merged = byOpsArea(opsAreas.mergeDetectedOpsAreas(detected, bothAreas()));

  assert.deepEqual(names(merged['Bobby Holmes']), ['Robin Fox']);
  // ...but a vanished area is not offered for editing.
  const visible = byOpsArea(opsAreas.assignmentsForOpsAreas(detected, bothAreas()));
  assert.equal(visible['Bobby Holmes'], undefined);
  assert.deepEqual(names(visible['Kate Downes']), ['Ash Green']);
});

test('reads an ops area saved before it could hold more than one barista', () => {
  const legacy = {
    region: 'South Region',
    opsArea: 'Bobby Holmes',
    bakeries: SOUTH_SIX,
    areaHeadBarista: 'Robin Fox',
    areaHeadBaristaUid: 'u-robin',
    homeBakery: 'A3'
  };
  const detected = detect([
    { region: 'South Region', opsArea: 'Tristen Bayley', bakeries: SOUTH_SIX }
  ]);
  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, [legacy]));

  assert.deepEqual(names(merged[0]), ['Robin Fox']);
  assert.equal(merged[0].baristas[0].homeBakery, 'A3');
});

test('does not leak one ops area onto another with the same name in a different region', () => {
  const detected = detect([
    { region: 'North Region', opsArea: 'Central', bakeries: ['N1', 'N2'] },
    { region: 'South Region', opsArea: 'Central', bakeries: ['S1', 'S2'] }
  ]);
  // Both areas are called "Central", so they are only told apart by region.
  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, [{
    region: 'North Region',
    opsArea: 'Central',
    bakeries: ['N1', 'N2'],
    baristas: [{ name: 'Robin Fox', uid: '', homeBakery: 'N1' }]
  }]));
  const byRegion = Object.fromEntries(merged.map((row) => [row.region, row]));

  assert.equal(merged.length, 2);
  assert.deepEqual(names(byRegion['North Region']), ['Robin Fox']);
  assert.deepEqual(names(byRegion['South Region']), []);
});

test('records the membership so the next restructure is judged on the current shape', () => {
  const detected = detect([
    { region: 'South Region', opsArea: 'Tristen Bayley', bakeries: ['A1', 'A2', 'A3'] }
  ]);
  const merged = plain(opsAreas.mergeDetectedOpsAreas(detected, [robinsArea()]));

  assert.deepEqual(merged[0].bakeries, ['A1', 'A2', 'A3']);
});

test('resolves an ops area lookup, preferring the matching region', () => {
  const GAILS = loadConfig();
  GAILS.setOpsAreaAssignments([
    {
      region: '  South   Region ',
      opsArea: ' Ops   One ',
      baristas: [
        { name: ' Robin Fox ', uid: 'u-robin', homeBakery: ' A3 ' },
        { name: 'Ash Green', uid: 'u-ash', homeBakery: 'A5' }
      ]
    }
  ]);

  const record = plain(GAILS.getOpsAreaAssignment('ops one', 'south region'));
  assert.equal(record.region, 'South Region');
  assert.equal(record.opsArea, 'Ops One');
  assert.deepEqual(record.baristas.map((entry) => entry.name), ['Robin Fox', 'Ash Green']);
  // Flattened for the read-only surfaces that just print who looks after an area.
  assert.equal(record.areaHeadBarista, 'Robin Fox · Ash Green');
  assert.equal(GAILS.getOpsAreaAssignment('ops one').areaHeadBarista, 'Robin Fox · Ash Green');
});

test('refuses to guess when the same ops area name exists in two regions', () => {
  const GAILS = loadConfig();
  GAILS.setOpsAreaAssignments([
    { region: 'North Region', opsArea: 'Central', baristas: [{ name: 'Robin Fox' }] },
    { region: 'South Region', opsArea: 'Central', baristas: [{ name: 'Ash Green' }] }
  ]);

  assert.equal(GAILS.getOpsAreaAssignment('Central'), null);
  assert.equal(GAILS.getOpsAreaAssignment('Central', 'South Region').areaHeadBarista, 'Ash Green');
});

test('reads a legacy single-barista record at runtime too', () => {
  const GAILS = loadConfig();
  GAILS.setOpsAreaAssignments([
    {
      region: 'South Region',
      opsArea: 'Ops One',
      areaHeadBarista: 'Robin Fox',
      areaHeadBaristaUid: 'u-robin',
      homeBakery: 'A3'
    }
  ]);

  const record = GAILS.getOpsAreaAssignment('Ops One', 'South Region');
  assert.equal(record.areaHeadBarista, 'Robin Fox');
  assert.equal(record.homeBakery, 'A3');
  assert.deepEqual(plain(record.baristas), [{ name: 'Robin Fox', uid: 'u-robin', homeBakery: 'A3' }]);
});

test('wires the area head barista table into the admin page and the site meta save', () => {
  const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

  assert.match(adminHtml, /id="opsAreaAssignmentList"/);
  assert.match(adminHtml, /id="opsAreaAssignmentBakeries"/);
  assert.match(adminHtml, /Area Head Baristas/);
  assert.match(adminHtml, /<th>Home Bakery<\/th>/);
  assert.match(adminHtml, /src="js\/ops-area-assignments\.js"/);

  // The admin's typed names must ride along with every write of the directory,
  // including the workbook import that replaces the site mapping wholesale.
  assert.match(adminSource, /opsAreaAssignments:\s*mergeOpsAreaAssignmentsForMeta\(entries, opsAreaAssignments\)/);
  assert.match(adminSource, /preservedOpsAreaAssignments[\s\S]*buildSiteMetaPayload\([\s\S]*?preservedOpsAreaAssignments/);
  assert.match(adminSource, /byKey\[key\]\.bakeries\.push\(bakery\)/);
  assert.match(adminSource, /list="opsAreaAssignmentBakeries"/);
  assert.match(authSource, /existingPayload && existingPayload\.opsAreaAssignments/);
  assert.match(authSource, /opsAreaAssignments: cloneOpsAreaAssignments\(opsAreaAssignments\)/);
});

test('gives the admin +/- controls, and confirms before deleting a filled row', () => {
  const adminSource = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');

  assert.match(adminSource, /data-action="add-barista"/);
  assert.match(adminSource, /data-action="remove-barista"/);
  assert.match(adminSource, /addOpsAreaBarista\(addBtn\.dataset\.region/);
  assert.match(adminSource, /removeOpsAreaBarista\(/);
  // Removing someone real asks first; an untouched blank row does not.
  assert.match(
    adminSource,
    /if \(entry && \(entry\.name \|\| entry\.homeBakery\)\)[\s\S]*?confirm\(\s*'Remove '/
  );
});

test('reports renames and merges to the admin after an import', () => {
  const adminSource = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');

  assert.match(adminSource, /opsAreaAssignmentApi\(\)\.detectChanges\(/);
  assert.match(adminSource, /describeOpsAreaRenames\(opsAreaChanges\.renames\)/);
  assert.match(adminSource, /describeOpsAreaMerges\(opsAreaChanges\.merges\)/);
});

test('publishes the area head baristas to the pages that read the site directory', () => {
  const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

  assert.match(read('js/auth.js'), /setOpsAreaAssignments\(payload && payload\.opsAreaAssignments\)/);
  assert.match(read('js/bakery-profile.js'), /getOpsAreaAssignment\(ops, region\)/);
  assert.match(read('js/visit-report.js'), /areaHeadBarista: opsAssignment && opsAssignment\.areaHeadBarista/);
  assert.match(read('js/visit-report.js'), /<th scope="col">Area Head Barista<\/th>/);
  assert.match(read('index.html'), /<option value="barista">Area Head Barista<\/option>/);
  assert.match(read('js/mentions.js'), /input\.opsAreaAssignments/);
});
