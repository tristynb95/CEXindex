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
    { region: 'north region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' },
    { region: 'SOUTH REGION', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' }
  ]);
});

test('adds newly detected regions without copying another region assignment', () => {
  const merged = plain(assignments.assignmentsForRegions(
    ['North Region', 'New Region'],
    [{ region: 'North Region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' }]
  ));

  assert.deepEqual(merged, [
    { region: 'New Region', coffeePartner: '', coffeeTrainer: '' },
    { region: 'North Region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' }
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
    { region: 'South Region', coffeePartner: 'Alex', coffeeTrainer: 'Jordan' },
    { region: 'North Region', coffeePartner: 'Sam', coffeeTrainer: 'Taylor' }
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
    { region: 'South Region', coffeePartner: 'Morgan', coffeeTrainer: 'Jordan' }
  ]);
});

test('wires the region table and preserved assignments into admin saves and uploads', () => {
  const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
  const adminSource = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');
  const authSource = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');

  assert.match(adminHtml, /id="regionAssignmentList"/);
  assert.match(adminHtml, /src="js\/region-assignments\.js"/);
  assert.match(adminSource, /regionAssignments:\s*mergeRegionAssignmentsForMeta\(entries, regionAssignments\)/);
  assert.match(adminSource, /preservedRegionAssignments[\s\S]*buildSiteMetaPayload\(imported\.meta, importInfo, preservedRegionAssignments\)/);
  assert.match(authSource, /existingPayload && existingPayload\.regionAssignments/);
});
