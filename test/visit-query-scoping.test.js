// Visit/task reads are scoped rather than whole-node.
//
// Every page used to subscribe to all of `routineVisits` and `followUpActions`
// and filter client-side, so boot cost grew with the estate's entire history —
// a bakery profile downloaded every visit ever logged to show one site's. These
// tests pin the server-side indexes those scoped queries depend on.
//
// `bakeryKey` rather than `bakery`: the raw stored name is a free-text variant
// ("Union Street - Bath" vs "Union Street, Bath") that only resolves through the
// fuzzy normaliser in js/config.js, so an equalTo() on it would silently drop
// visits. The canonical key is written alongside it at save time instead.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'database.rules.json'), 'utf8'));

test('routineVisits is indexed for date-windowed and per-bakery queries', () => {
  const visits = rules.rules.routineVisits;
  assert.deepEqual(visits['.indexOn'], ['date', 'bakeryKey']);
  // Scoping is a read-path change only — everyone signed in still reads it.
  assert.equal(visits['.read'], 'auth != null');
});

test('followUpActions is indexed for per-bakery, status and raised-by queries', () => {
  const tasks = rules.rules.followUpActions;
  assert.deepEqual(tasks['.indexOn'], ['bakeryKey', 'status', 'createdByUid']);
  assert.equal(tasks['.read'], 'auth != null');
});

test('the shared feed orders by the indexed field and bounds the window', () => {
  const feed = fs.readFileSync(path.join(root, 'js/visit-feed.js'), 'utf8');
  assert.match(feed, /orderByChild\('date'\), startAt\(windowStart\)/);
  // Start of the previous calendar year: the earliest date any preset period
  // can reach, so every preset is answerable from the window alone.
  assert.match(feed, /\(today\.getFullYear\(\) - 1\) \+ '-01-01'/);
});

test('a widened feed keeps the history it pulled in', () => {
  const feed = fs.readFileSync(path.join(root, 'js/visit-feed.js'), 'utf8');
  // Without this merge the next live update on the windowed query would snap
  // the view back to the window the user had just widened past.
  assert.match(feed, /allTime \? Object\.assign\(\{\}, allTime, windowed\) : windowed/);
  // Expanding twice must not re-download the node.
  assert.match(feed, /if \(allTime\) return Promise\.resolve\(\);/);
});

test('every page that windows its feed can still reach the full history', () => {
  // The dashboard splits these: js/auth.js owns the subscription, and the
  // period control that asks to widen it lives in js/visit-report.js.
  const cases = [
    { subscribes: 'js/auth.js', widens: 'js/visit-report.js' },
    { subscribes: 'js/my-activity.js', widens: 'js/my-activity.js' },
    { subscribes: 'js/my-team.js', widens: 'js/my-team.js' }
  ];
  cases.forEach(({ subscribes, widens }) => {
    const feedSrc = fs.readFileSync(path.join(root, subscribes), 'utf8');
    assert.match(feedSrc, /subscribeVisits\(\{/, subscribes + ' should use the scoped feed');

    const widenSrc = fs.readFileSync(path.join(root, widens), 'utf8');
    assert.match(widenSrc, /expandToAllTime|loadAllTimeVisits/,
      widens + ' should be able to widen the window');
    // A failed expansion has to clear its own latch, or the period stays
    // permanently unable to load what it is asking for.
    assert.match(widenSrc, /allTimeVisitsRequested = false;/,
      widens + ' should reset the latch when the fetch fails');
  });
});

test('my-activity treats an open-ended custom range as needing full history', () => {
  const src = fs.readFileSync(path.join(root, 'js/my-activity.js'), 'utf8');
  // A custom range with no From date reaches back as far as there is data, and
  // one starting before the window obviously does too.
  assert.match(src, /return !filters\.from \|\| filters\.from < defaultWindowStart\(\);/);
});

// The measurement script reports what the window removes. If its idea of the
// window drifted from the app's, it would report a saving nobody is getting.
test('the measurement tool uses the same window as the app', () => {
  const { windowStart, splitByWindow } = require('../tools/measure-db.js');
  const at = new Date('2026-08-10T12:00:00Z');
  assert.equal(windowStart(at), '2025-01-01');

  const feed = fs.readFileSync(path.join(root, 'js/visit-feed.js'), 'utf8');
  assert.match(feed, /\(today\.getFullYear\(\) - 1\) \+ '-01-01'/,
    'js/visit-feed.js should still derive the window the same way');

  // startAt() is inclusive, so a visit dated exactly on the boundary is inside
  // the window — the tool must bucket it the same way or it overstates savings.
  const split = splitByWindow({
    onBoundary: { bakery: 'B', date: '2025-01-01' },
    justBefore: { bakery: 'B', date: '2024-12-31' },
    undated: { bakery: 'B' }
  }, windowStart(at));
  assert.equal(split.inWindow.count, 1);
  assert.equal(split.outside.count, 1);
  // A dateless record sorts before every string key, so an orderByChild('date')
  // query never returns it — counted separately, not as a saving.
  assert.equal(split.undated.count, 1);
});

test('indexed fields are ones the writers actually set', () => {
  const auth = fs.readFileSync(path.join(root, 'js/auth.js'), 'utf8');
  // A query orders by a child that is missing from the record it should match,
  // so the index is only worth having if every write populates it.
  ['date', 'bakeryKey'].forEach((field) => {
    assert.ok(
      rules.rules.routineVisits['.indexOn'].includes(field),
      field + ' should be indexed on routineVisits'
    );
  });
  assert.match(auth, /createdByUid/, 'follow-ups record who raised them');
  assert.match(auth, /status:\s*'open'/, 'follow-ups record a status');
});
