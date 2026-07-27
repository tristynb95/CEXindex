const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'region-assignments.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const assignments = context.window.GAILS_REGION_ASSIGNMENTS;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('keeps partner and trainer details when an upload detects the same regions', () => {
  const existing = [
    { region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' },
    { region: 'North Region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' }
  ];

  const merged = plain(assignments.assignmentsForRegions(
    [' north   region ', 'SOUTH REGION'],
    existing
  ));

  assert.deepEqual(merged, [
    {
      region: 'north region',
      coffeePartner: 'Sam',
      coffeePartnerUid: '',
      coffeeTrainer: 'Taylor',
      coffeeTrainerUid: ''
    },
    {
      region: 'SOUTH REGION',
      coffeePartner: 'Alex',
      coffeePartnerUid: '',
      coffeeTrainer: 'Jordan',
      coffeeTrainerUid: ''
    }
  ]);
});

test('adds newly detected regions without copying another region assignment', () => {
  const merged = plain(assignments.assignmentsForRegions(
    ['North Region', 'New Region'],
    [{ region: 'North Region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' }]
  ));

  assert.deepEqual(merged, [
    {
      region: 'New Region',
      coffeePartner: '',
      coffeePartnerUid: '',
      coffeeTrainer: '',
      coffeeTrainerUid: ''
    },
    {
      region: 'North Region',
      coffeePartner: 'Sam',
      coffeePartnerUid: '',
      coffeeTrainer: 'Taylor',
      coffeeTrainerUid: ''
    }
  ]);
});

test('retains meaningful assignments for regions temporarily absent from an upload', () => {
  const merged = plain(assignments.mergeDetectedRegions(
    ['South Region'],
    [
      { region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' },
      { region: 'North Region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' },
      { region: 'Empty Region', coffeePartner: '', coffeeTrainer: '' }
    ]
  ));

  assert.deepEqual(merged, [
    {
      region: 'South Region',
      coffeePartner: 'Alex',
      coffeePartnerUid: '',
      coffeeTrainer: 'Jordan',
      coffeeTrainerUid: ''
    },
    {
      region: 'North Region',
      coffeePartner: 'Sam',
      coffeePartnerUid: '',
      coffeeTrainer: 'Taylor',
      coffeeTrainerUid: ''
    }
  ]);
});

test('updates one regional role without replacing the other saved role', () => {
  const updated = plain(assignments.updateAssignment(
    ['South Region'],
    [{ region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }],
    'South Region',
    'coffeePartner',
    'Morgan'
  ));

  assert.deepEqual(updated, [
    {
      region: 'South Region',
      coffeePartner: 'Morgan',
      coffeePartnerUid: '',
      coffeeTrainer: 'Jordan',
      coffeeTrainerUid: ''
    }
  ]);
});

test('keeps stable user ids with the readable regional names', () => {
  const updated = assignments.updateAssignment(
    ['South Region'],
    [{ region: 'South Region', coffeePartner: 'Alex', coffeePartnerUid: 'u-alex' }],
    'South Region',
    'coffeeTrainerUid',
    'u-jordan'
  );

  assert.deepEqual(plain(updated), [
    {
      region: 'South Region',
      coffeePartner: 'Alex',
      coffeePartnerUid: 'u-alex',
      coffeeTrainer: '',
      coffeeTrainerUid: 'u-jordan'
    }
  ]);
});

// Cover: what happens while a region's Coffee Partner or Coffee Trainer has
// left and their patch is split between colleagues covering individual areas.
const southWithAreas = [{
  region: 'South Region',
  opsAreas: [
    { opsArea: 'Safa Aden', bakeries: ['Clapham', 'Balham'] },
    { opsArea: 'Remi Cole', bakeries: ['Brixton'] }
  ]
}];

test('a region off cover offers no ops area rows at all', () => {
  const rows = plain(assignments.assignmentsForRegions(
    southWithAreas,
    [{ region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }]
  ));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].cover, undefined);
});

test('switching cover on opens a row for every ops area, covered or not', () => {
  const updated = assignments.setCover(
    southWithAreas,
    [{ region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }],
    'South Region',
    true
  );

  const rows = plain(assignments.assignmentsForRegions(southWithAreas, updated));
  assert.equal(rows[0].cover.enabled, true);
  assert.deepEqual(rows[0].cover.areas.map((area) => area.opsArea), ['Remi Cole', 'Safa Aden']);
  assert.equal(rows[0].cover.areas[0].coffeePartner, '');
});

test('covering one area leaves the rest of the region with its own pair', () => {
  const onCover = assignments.setCover(
    southWithAreas,
    [{ region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }],
    'South Region',
    true
  );
  const updated = assignments.updateCoverAssignment(
    southWithAreas, onCover, 'South Region', 'Safa Aden', 'coffeePartner', 'Morgan'
  );

  // Only the area somebody covers is stored, and it keeps the bakeries it holds
  // so it can be followed if the area is renamed.
  const stored = plain(assignments.mergeDetectedRegions(southWithAreas, updated));
  assert.deepEqual(stored[0].cover, {
    enabled: true,
    areas: [{
      opsArea: 'Safa Aden',
      coffeePartner: 'Morgan',
      coffeePartnerUid: '',
      coffeeTrainer: '',
      coffeeTrainerUid: '',
      bakeries: ['Balham', 'Clapham']
    }]
  });

  assert.equal(
    assignments.resolveAssignment(stored[0], 'Safa Aden').coffeePartner,
    'Morgan'
  );
  assert.equal(
    assignments.resolveAssignment(stored[0], 'Remi Cole').coffeePartner,
    'Alex'
  );
  // Nobody covers the Coffee Trainer, so that role is untouched everywhere.
  assert.equal(
    assignments.resolveAssignment(stored[0], 'Safa Aden').coffeeTrainer,
    'Jordan'
  );
});

test('ending cover returns the region to its own pair and clears the split', () => {
  const covered = assignments.updateCoverAssignment(
    southWithAreas,
    assignments.setCover(
      southWithAreas,
      [{ region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }],
      'South Region',
      true
    ),
    'South Region', 'Safa Aden', 'coffeePartner', 'Morgan'
  );

  assert.equal(assignments.coveredAreas(covered, 'South Region').length, 1);

  const ended = plain(assignments.setCover(southWithAreas, covered, 'South Region', false));
  assert.equal(ended[0].cover, undefined);
  assert.equal(ended[0].coffeePartner, 'Alex');
  assert.equal(assignments.resolveAssignment(ended[0], 'Safa Aden').coffeePartner, 'Alex');
});

test('cover follows an ops area renamed after a change of ops manager', () => {
  const covered = assignments.updateCoverAssignment(
    southWithAreas,
    assignments.setCover(southWithAreas, [{ region: 'South Region' }], 'South Region', true),
    'South Region', 'Safa Aden', 'coffeePartner', 'Morgan'
  );

  // Same bakeries, new ops manager, so a new name on the same area.
  const renamed = [{
    region: 'South Region',
    opsAreas: [
      { opsArea: 'Pat Nolan', bakeries: ['Clapham', 'Balham'] },
      { opsArea: 'Remi Cole', bakeries: ['Brixton'] }
    ]
  }];

  const stored = plain(assignments.mergeDetectedRegions(renamed, covered));
  assert.deepEqual(stored[0].cover.areas.map((area) => area.opsArea), ['Pat Nolan']);
  assert.equal(stored[0].cover.areas[0].coffeePartner, 'Morgan');

  const shown = plain(assignments.assignmentsForRegions(renamed, covered));
  const carried = shown[0].cover.areas.find((area) => area.opsArea === 'Pat Nolan');
  assert.equal(carried.renamedFrom, 'Safa Aden');
});

test('an ops area missing from an upload keeps whoever was covering it', () => {
  const covered = assignments.updateCoverAssignment(
    southWithAreas,
    assignments.setCover(southWithAreas, [{ region: 'South Region' }], 'South Region', true),
    'South Region', 'Safa Aden', 'coffeePartner', 'Morgan'
  );

  const withoutArea = [{
    region: 'South Region',
    opsAreas: [{ opsArea: 'Remi Cole', bakeries: ['Brixton'] }]
  }];

  const stored = plain(assignments.mergeDetectedRegions(withoutArea, covered));
  const retained = stored[0].cover.areas.find((area) => area.opsArea === 'Safa Aden');
  assert.equal(retained.coffeePartner, 'Morgan');
});

test('wires the cover toggle and per-area rows into the admin region table', () => {
  const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

  assert.match(adminHtml, /<th>Cover<\/th>/);
  assert.match(adminSource, /data-action="toggle-region-cover"/);
  assert.match(adminSource, /toggleRegionCover\(input\.dataset\.region, input\.checked\)/);
  assert.match(adminSource, /updateCoverAssignment\(/);
  // Ending cover discards the split, so it is confirmed before anything goes.
  assert.match(adminSource, /coveredAreas\(state\.regionAssignmentsDraft, region\)[\s\S]*?confirm\(/);
  assert.match(authSource, /cloneRegionCover/);
});

test('wires the region table and preserved assignments into admin saves and uploads', () => {
  const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

  assert.match(adminHtml, /id="regionAssignmentList"/);
  assert.match(adminHtml, /id="regionAssignmentPeople"/);
  assert.match(adminHtml, /src="js\/region-assignments\.js"/);
  assert.match(adminSource, /list="regionAssignmentPeople"/);
  assert.match(adminSource, /user \? user\.uid : ''/);
  assert.match(adminSource, /regionAssignments:\s*mergeRegionAssignmentsForMeta\(entries, regionAssignments\)/);
  assert.match(adminSource, /preservedRegionAssignments[\s\S]*buildSiteMetaPayload\([\s\S]*?preservedRegionAssignments/);
  assert.match(authSource, /existingPayload && existingPayload\.regionAssignments/);
});

test('carries the picked person’s uid through the save, rather than only their name', () => {
  const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

  assert.match(authSource, /coffeePartnerUid: String\(record && record\.coffeePartnerUid/);
  assert.match(authSource, /coffeeTrainerUid: String\(record && record\.coffeeTrainerUid/);
});
