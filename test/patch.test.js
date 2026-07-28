const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'patch.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const Patch = context.window.GAILS.Patch;

// patch.js runs in its own vm realm, so its arrays fail strict deep-equality on
// prototype identity alone. A JSON round-trip brings them home.
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Two ops areas in one region, named after the managers who run them.
const ESTATE = {
  Henley: { r: 'North Region', o: 'Bobby Holmes' },
  Marlow: { r: 'North Region', o: 'Bobby Holmes' },
  Reading: { r: 'North Region', o: 'Bobby Holmes' },
  Thame: { r: 'North Region', o: 'Bobby Holmes' },
  Highgate: { r: 'North Region', o: 'Kate Downes' },
  Buxton: { r: 'North Region', o: 'Kate Downes' },
  Balham: { r: 'South Region', o: 'Safa Aden' },
  Putney: { r: 'South Region', o: 'Safa Aden' }
};

// The same estate after Bobby Holmes leaves and Priya Shah takes the area on:
// identical bakeries, brand new name.
const AFTER_RENAME = {
  Henley: { r: 'North Region', o: 'Priya Shah' },
  Marlow: { r: 'North Region', o: 'Priya Shah' },
  Reading: { r: 'North Region', o: 'Priya Shah' },
  Thame: { r: 'North Region', o: 'Priya Shah' },
  Highgate: { r: 'North Region', o: 'Kate Downes' },
  Buxton: { r: 'North Region', o: 'Kate Downes' },
  Balham: { r: 'South Region', o: 'Safa Aden' },
  Putney: { r: 'South Region', o: 'Safa Aden' }
};

const BOBBYS_PATCH = {
  opsAreas: [{
    region: 'North Region',
    opsArea: 'Bobby Holmes',
    bakeries: ['Henley', 'Marlow', 'Reading', 'Thame']
  }],
  regions: []
};

// ── Normalizing ───────────────────────────────────────────────────────────

test('reads the original users/{uid}.opsArea string as a one-area patch', () => {
  assert.deepEqual(plain(Patch.normalizePatch('Bobby Holmes')), {
    opsAreas: [{ region: '', opsArea: 'Bobby Holmes', bakeries: [] }],
    regions: []
  });
});

test('reads a single-area object, and treats nothing as an empty patch', () => {
  assert.deepEqual(plain(Patch.normalizePatch({ opsArea: 'Kate Downes', region: 'North Region' })), {
    opsAreas: [{ region: 'North Region', opsArea: 'Kate Downes', bakeries: [] }],
    regions: []
  });
  [null, undefined, '', {}].forEach((value) => {
    assert.equal(Patch.isEmptyPatch(value), true);
  });
});

test('deduplicates areas and regions, and drops blank entries', () => {
  const normalized = plain(Patch.normalizePatch({
    opsAreas: [
      { region: 'North Region', opsArea: 'Bobby Holmes' },
      { region: 'north region', opsArea: 'bobby holmes' },
      { opsArea: '  ' }
    ],
    regions: ['North Region', ' north region ', '']
  }));
  assert.equal(normalized.opsAreas.length, 1);
  assert.deepEqual(normalized.regions, ['North Region']);
});

// ── Surviving a rename ────────────────────────────────────────────────────

test('an ops area renamed after its manager is still found by its bakeries', () => {
  const resolved = plain(Patch.resolvePatch(BOBBYS_PATCH, AFTER_RENAME));
  assert.equal(resolved.opsAreas.length, 1);
  assert.equal(resolved.opsAreas[0].opsArea, 'Priya Shah');
  assert.equal(resolved.opsAreas[0].matchedBy, 'bakeries');
  assert.equal(resolved.opsAreas[0].renamed, true);
  assert.equal(resolved.opsAreas[0].savedAs.opsArea, 'Bobby Holmes');
  assert.deepEqual(resolved.bakeries, ['Henley', 'Marlow', 'Reading', 'Thame']);
});

test('an unrenamed area matches by name when no bakeries were ever stamped', () => {
  const resolved = plain(Patch.resolvePatch('Bobby Holmes', ESTATE));
  assert.equal(resolved.opsAreas[0].opsArea, 'Bobby Holmes');
  assert.equal(resolved.opsAreas[0].matchedBy, 'name');
  assert.equal(resolved.opsAreas[0].renamed, false);
  // The name match still hands back the area's current membership.
  assert.deepEqual(resolved.bakeries, ['Henley', 'Marlow', 'Reading', 'Thame']);
});

test('a legacy name-only patch cannot follow a rename — that is what stamping fixes', () => {
  const before = plain(Patch.resolvePatch('Bobby Holmes', AFTER_RENAME));
  assert.deepEqual(before.opsAreas, []);
  assert.equal(before.unresolved.length, 1);
  assert.equal(before.unresolved[0].opsArea, 'Bobby Holmes');

  // Saving the person against the estate they were assigned in stamps the
  // membership, and the patch survives the rename from then on.
  const stamped = plain(Patch.stampPatch('Bobby Holmes', ESTATE));
  assert.deepEqual(stamped.opsAreas[0].bakeries, ['Henley', 'Marlow', 'Reading', 'Thame']);
  const after = plain(Patch.resolvePatch(stamped, AFTER_RENAME));
  assert.equal(after.opsAreas[0].opsArea, 'Priya Shah');
});

test('a majority carry-over wins; a minority scattering does not', () => {
  // Three of four bakeries move to one new area — that area is the old one.
  const mostlyMoved = {
    Henley: { r: 'North Region', o: 'Priya Shah' },
    Marlow: { r: 'North Region', o: 'Priya Shah' },
    Reading: { r: 'North Region', o: 'Priya Shah' },
    Thame: { r: 'North Region', o: 'Kate Downes' }
  };
  assert.equal(plain(Patch.resolvePatch(BOBBYS_PATCH, mostlyMoved)).opsAreas[0].opsArea, 'Priya Shah');

  // An even split is nobody's carry-over, so it is reported rather than guessed.
  const splitInHalf = {
    Henley: { r: 'North Region', o: 'Priya Shah' },
    Marlow: { r: 'North Region', o: 'Priya Shah' },
    Reading: { r: 'North Region', o: 'Kate Downes' },
    Thame: { r: 'North Region', o: 'Kate Downes' }
  };
  const split = plain(Patch.resolvePatch(BOBBYS_PATCH, splitInHalf));
  assert.deepEqual(split.opsAreas, []);
  assert.equal(split.unresolved.length, 1);
});

test('an area that disappears entirely is kept and reported, never dropped', () => {
  const resolved = plain(Patch.resolvePatch(BOBBYS_PATCH, {
    Highgate: { r: 'North Region', o: 'Kate Downes' }
  }));
  assert.deepEqual(resolved.opsAreas, []);
  assert.deepEqual(resolved.bakeries, []);
  assert.equal(resolved.unresolved[0].opsArea, 'Bobby Holmes');
  // Stamping does not empty it either — the assignment survives a bad upload.
  const stamped = plain(Patch.stampPatch(BOBBYS_PATCH, {}));
  assert.deepEqual(stamped.opsAreas[0].bakeries, ['Henley', 'Marlow', 'Reading', 'Thame']);
});

test('the same ops area name in two regions never resolves by name alone', () => {
  const duplicated = {
    Henley: { r: 'North Region', o: 'Sam Cover' },
    Balham: { r: 'South Region', o: 'Sam Cover' }
  };
  // No region recorded, and the name is ambiguous — better nothing than the
  // wrong region's bakeries.
  assert.deepEqual(plain(Patch.resolvePatch('Sam Cover', duplicated)).opsAreas, []);
  // With the region recorded it is unambiguous again.
  const withRegion = plain(Patch.resolvePatch({
    opsAreas: [{ region: 'South Region', opsArea: 'Sam Cover' }]
  }, duplicated));
  assert.deepEqual(withRegion.bakeries, ['Balham']);
});

// ── Regions ───────────────────────────────────────────────────────────────

test('a regional manager owns every bakery in their regions', () => {
  const resolved = plain(Patch.resolvePatch({ regions: ['North Region'] }, ESTATE));
  assert.deepEqual(resolved.bakeries, ['Buxton', 'Henley', 'Highgate', 'Marlow', 'Reading', 'Thame']);
  assert.equal(resolved.regions[0].missing, false);
});

test('regions and ops areas combine into one deduplicated bakery list', () => {
  const resolved = plain(Patch.resolvePatch({
    opsAreas: [{ region: 'North Region', opsArea: 'Bobby Holmes', bakeries: ['Henley'] }],
    regions: ['South Region']
  }, ESTATE));
  assert.deepEqual(resolved.bakeries, ['Balham', 'Henley', 'Marlow', 'Putney', 'Reading', 'Thame']);
});

test('a region missing from the current directory is flagged, not discarded', () => {
  const resolved = plain(Patch.resolvePatch({ regions: ['London Region'] }, ESTATE));
  assert.equal(resolved.regions[0].region, 'London Region');
  assert.equal(resolved.regions[0].missing, true);
  assert.deepEqual(resolved.bakeries, []);
});

// ── Storage ───────────────────────────────────────────────────────────────

test('an empty patch is stored as null so it leaves no record behind', () => {
  assert.equal(Patch.toStored({ opsAreas: [], regions: [] }, ESTATE), null);
  assert.equal(Patch.toStored('', ESTATE), null);
  const stored = plain(Patch.toStored('Bobby Holmes', ESTATE));
  assert.deepEqual(stored.opsAreas[0].bakeries, ['Henley', 'Marlow', 'Reading', 'Thame']);
});

test('stamping records the area under the name it now carries', () => {
  const stamped = plain(Patch.stampPatch(BOBBYS_PATCH, AFTER_RENAME));
  assert.equal(stamped.opsAreas[0].opsArea, 'Priya Shah');
  assert.equal(stamped.opsAreas[0].region, 'North Region');
});

test('patchBakeries is the flat list, and an empty patch owns nothing', () => {
  assert.deepEqual(plain(Patch.patchBakeries(BOBBYS_PATCH, ESTATE)), ['Henley', 'Marlow', 'Reading', 'Thame']);
  assert.deepEqual(plain(Patch.patchBakeries(null, ESTATE)), []);
});

test('describePatch names the areas, and says so when an area has gone missing', () => {
  assert.equal(Patch.describePatch(Patch.resolvePatch(BOBBYS_PATCH, ESTATE)), 'Bobby Holmes');
  assert.equal(Patch.describePatch(Patch.resolvePatch(null, ESTATE)), 'The whole estate');
  assert.match(
    Patch.describePatch(Patch.resolvePatch(BOBBYS_PATCH, { Highgate: { r: 'North Region', o: 'Kate Downes' } })),
    /not in the site directory/
  );
});
