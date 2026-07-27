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
