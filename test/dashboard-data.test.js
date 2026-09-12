// The estate dataset is the largest payload this app moves. The cached read
// that avoids re-downloading it used to live inside js/auth.js, where only
// index.html could reach it — so My Activity and Bakery Profile fetched the
// whole thing on every load. These pin the shared contract that replaced it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/dashboard-data.js'), 'utf8');
const activityScript = fs.readFileSync(path.join(root, 'js/my-activity.js'), 'utf8');
const profileScript = fs.readFileSync(path.join(root, 'js/bakery-profile.js'), 'utf8');
const eslintConfig = fs.readFileSync(path.join(root, 'eslint.config.mjs'), 'utf8');

test('the shared read checks the server stamp before downloading the dataset', () => {
  assert.match(source, /ref\(db, 'dashboardMeta'\)/);
  assert.match(source, /ref\(db, 'dashboardData'\)/);
  assert.match(source, /readDatasetCache\(\)/);
  // The whole point: a cached copy is only trusted when it matches the stamp
  // the admin upload wrote alongside the data.
  assert.match(source, /cached\.ts === stamp/);
  assert.match(source, /writeDatasetCache\(stamp, data\)/);
});

test('a missing dataset resolves null rather than throwing', () => {
  assert.match(source, /if \(!snap\.exists\(\)\) return null;/);
});

test('both estate pages go through the shared read, not a raw fetch', () => {
  assert.match(activityScript, /import \{ loadDashboardData \} from '\.\/dashboard-data\.js';/);
  assert.match(profileScript, /import \{ loadDashboardData \} from '\.\/dashboard-data\.js';/);
  // The uncached read is what this replaced; it must not creep back in.
  assert.doesNotMatch(activityScript, /get\(ref\(db, 'dashboardData'\)\)/);
  assert.doesNotMatch(profileScript, /get\(ref\(db, 'dashboardData'\)\)/);
});

test('it is registered as an ES module for linting', () => {
  assert.match(eslintConfig, /'js\/dashboard-data\.js'/);
});
