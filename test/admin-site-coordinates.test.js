const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'admin-page.js'), 'utf8');

// admin-page.js is an ES module full of Firebase imports, so the coordinate
// helpers are lifted out on their own and run against a stub of the bits of
// state and rendering they touch.
function functionSource(name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start > -1, name + ' should be declared in admin-page.js');
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail('could not find the end of ' + name);
}

function coordinateEditor(draft) {
  const context = {
    state: { siteMetaDraft: draft },
    setDirty() {},
    updateSiteTableMeta() {},
    getVisibleSiteMeta() { return []; },
    renderDataControls() {}
  };
  vm.runInNewContext(
    [
      functionSource('siteCoordinateText'),
      functionSource('stripSiteCoordinateText'),
      functionSource('updateSiteCoordinateDraft')
    ].join('\n'),
    context
  );
  return context;
}

// Arrays built inside the vm context belong to another realm, so deepStrictEqual
// would reject them on prototype alone. Compare their contents.
function pair(value) {
  return Array.isArray(value) || (value && typeof value.length === 'number')
    ? Array.from(value)
    : value;
}

// The regression this guards: a half-typed coordinate used to be discarded, so
// the second box read the first one back as empty and a bakery with no pin yet
// could never be given one.
test('typing both halves pins a bakery that had no coordinates', () => {
  const draft = { 'Kings Cross': { r: 'London', o: 'Sam' } };
  const editor = coordinateEditor(draft);
  const entry = draft['Kings Cross'];

  '51.5155'.split('').reduce((typed, char) => {
    editor.updateSiteCoordinateDraft('Kings Cross', 'lat', typed + char);
    return typed + char;
  }, '');
  assert.ok(!Array.isArray(entry.ll), 'a lone latitude is not a pin');
  assert.deepEqual(pair(editor.siteCoordinateText(entry)), ['51.5155', ''], 'the typed half stays in its box');

  '-0.1426'.split('').reduce((typed, char) => {
    editor.updateSiteCoordinateDraft('Kings Cross', 'lon', typed + char);
    return typed + char;
  }, '');
  assert.deepEqual(pair(entry.ll), [51.5155, -0.1426]);
});

test('an out-of-range half keeps the last good pin but stays visible', () => {
  const draft = { 'Kings Cross': { r: 'London', o: 'Sam', ll: [51.5155, -0.1426] } };
  const editor = coordinateEditor(draft);
  const entry = draft['Kings Cross'];

  editor.updateSiteCoordinateDraft('Kings Cross', 'lat', '999');
  assert.deepEqual(pair(entry.ll), [51.5155, -0.1426]);
  assert.deepEqual(pair(editor.siteCoordinateText(entry)), ['999', '-0.1426']);

  editor.updateSiteCoordinateDraft('Kings Cross', 'lat', '51.52');
  assert.deepEqual(pair(entry.ll), [51.52, -0.1426]);
});

test('clearing both boxes clears the pin, and the typed text never ships', () => {
  const draft = { 'Kings Cross': { r: 'London', o: 'Sam', ll: [51.5155, -0.1426] } };
  const editor = coordinateEditor(draft);
  const entry = draft['Kings Cross'];

  editor.updateSiteCoordinateDraft('Kings Cross', 'lat', '');
  editor.updateSiteCoordinateDraft('Kings Cross', 'lon', '');
  assert.equal(entry.ll, null);
  assert.deepEqual(pair(editor.siteCoordinateText(entry)), ['', '']);

  editor.updateSiteCoordinateDraft('Kings Cross', 'lat', '51.5');
  const published = editor.stripSiteCoordinateText(JSON.parse(JSON.stringify(draft)));
  assert.deepEqual(Object.keys(published['Kings Cross']).sort(), ['ll', 'o', 'r']);
});

// Saving publishes a stripped copy, and the coordinate sync drops the scratch
// pad so a synced value is not hidden behind text typed before it.
test('the save and sync paths drop the half-typed scratch pad', () => {
  assert.match(source, /var meta = stripSiteCoordinateText\(cloneMeta\(state\.siteMetaDraft\)\);/);
  assert.match(source, /entry\.ll = fallback\.ll\.slice\(\);[\s\S]{0,160}?delete entry\.llText;/);
});
