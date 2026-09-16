// The Visit History search box. Records arrive straight from Firebase, so the
// filter has to cope with a field that is not the string it usually is: the
// predicate runs after renderVisitLog has already rewritten the page header,
// so a throw in there left the previous, unfiltered list and its counts on
// screen under a header that named the search term — the search looked dead.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'visit-report.js'), 'utf8');

function loadNboShared() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'js', 'nbo-shared.js'), 'utf8'), context);
  return context.window.GAILS.NBOShared;
}

test('the Visit History search coerces record fields instead of calling string methods on them', () => {
  assert.match(source, /function searchHaystack\(value\) \{\s*return String\(value == null \? '' : value\)\.toLowerCase\(\);/);
  assert.match(source, /var bakeryMatch = searchHaystack\(v\.bakery\)\.indexOf\(searchVal\) !== -1;/);
  assert.match(source, /var opsMatch = searchHaystack\(G\.getBakeryOps \? G\.getBakeryOps\(v\.bakery\) : ''\)\.indexOf\(searchVal\) !== -1;/);
  assert.match(source, /var auditorMatch = searchHaystack\(v\.auditorName\)\.indexOf\(searchVal\) !== -1;/);
  // Unvisited Sites shares the box and read the same fields raw.
  assert.match(source, /if \(searchHaystack\(bName\)\.indexOf\(searchVal\) === -1 && !opsMatch\) return;/);
  assert.doesNotMatch(source, /v\.bakery\.toLowerCase\(\)/);
  assert.doesNotMatch(source, /v\.auditorName\.toLowerCase\(\)/);
  assert.doesNotMatch(source, /bName\.toLowerCase\(\)/);
});

test('one unreadable check-in degrades to a placeholder row rather than aborting the list', () => {
  assert.match(source, /function historyRowHtml\(v\) \{/);
  assert.match(source, /function historyFallbackRowHtml\(v\) \{/);
  assert.match(source, /try \{\s*return historyRowHtml\(v\);\s*\} catch \(error\) \{/);
  assert.match(source, /console\.error\('Could not render check-in ' \+ \(v && v\.id\), error\);/);
  assert.match(source, /return historyFallbackRowHtml\(v \|\| \{\}\);/);
  // The placeholder still has to fill all six columns or the table shears.
  const fallback = source.slice(source.indexOf('function historyFallbackRowHtml'));
  const body = fallback.slice(0, fallback.indexOf('</tr>'));
  assert.equal((body.match(/<td data-label=/g) || []).length, 6);
});

test('NBO scoring survives a questions list Firebase handed back as an object map', () => {
  const NBOShared = loadNboShared();
  const asObjectMap = {
    questions: {
      0: { response: 'Yes' },
      2: { response: 'No' },
      5: { response: 'N/A' }
    }
  };
  // Compared field by field: the helper is built in a vm realm, so its objects
  // fail deepEqual's prototype check even when the values match.
  const counts = NBOShared.scorable(asObjectMap);
  assert.equal(counts.yes, 1);
  assert.equal(counts.total, 2);
  assert.equal(NBOShared.overallPct(asObjectMap), 50);
  // Arrays, the usual shape, are untouched; anything else reads as empty.
  const asArray = [{ response: 'Yes' }];
  assert.equal(NBOShared.questionList(asArray), asArray);
  assert.equal(NBOShared.questionList(null).length, 0);
  assert.equal(NBOShared.questionList('nope').length, 0);
  assert.equal(NBOShared.questionList(asObjectMap.questions).length, 3);
  assert.equal(NBOShared.overallPct({ questions: { 0: { response: 'N/A' } } }), null);
});

test('the visit log reads NBO questions through the same normalisation', () => {
  assert.match(source, /function nboQuestionList\(questions\) \{/);
  assert.match(source, /var questions = nboQuestionList\(record\.questions\);/);
  assert.match(source, /var coaching = nboQuestionList\(v\.questions\)\.filter\(/);
});
