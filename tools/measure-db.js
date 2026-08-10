#!/usr/bin/env node
/**
 * Measures what each page actually downloads from the Realtime Database, and
 * what the rolling visit window (js/visit-feed.js) removes from that.
 *
 * Answers three questions the code alone cannot:
 *   1. How much smaller is a windowed visit feed than the whole-node read it
 *      replaced — in bytes, per page load, per page.
 *   2. Had the old localStorage dataset cache already passed the ~5MB quota
 *      that made it fail silently and re-download on every load?
 *   3. Which page is now the most expensive, so the next fix goes to the right
 *      place.
 *
 * Each node is fetched ONCE in full and split locally, so measuring costs one
 * download rather than two — and it works whether or not the new .indexOn
 * rules have been deployed yet.
 *
 * USAGE
 *   FIREBASE_DB_SECRET=<secret> node tools/measure-db.js
 *   node tools/measure-db.js --secret=<secret>
 *
 * The secret is the same Database Secret the Google Form sync already uses —
 * Firebase console > Project settings > Service accounts > Database secrets.
 * It is read-only here; nothing in this script writes.
 */

'use strict';

const DB_URL = 'https://cexindex-default-rtdb.firebaseio.com';

// Mirrors defaultWindowStart() in js/visit-feed.js — the start of the previous
// calendar year. Kept in step by test/visit-query-scoping.test.js.
function windowStart(now) {
  const today = now || new Date();
  return (today.getFullYear() - 1) + '-01-01';
}

function readSecret() {
  const flag = process.argv.find((a) => a.startsWith('--secret='));
  const secret = flag ? flag.slice('--secret='.length) : process.env.FIREBASE_DB_SECRET;
  if (!secret) {
    console.error(
      'No database secret supplied.\n\n' +
      '  FIREBASE_DB_SECRET=<secret> node tools/measure-db.js\n\n' +
      'Find it in the Firebase console under Project settings > Service\n' +
      'accounts > Database secrets. It is the same one the Google Form sync\n' +
      'uses (see apps-script/RoutineVisitSync.gs).'
    );
    process.exit(1);
  }
  return secret;
}

async function fetchNode(path, secret) {
  const url = DB_URL + '/' + path + '.json?auth=' + encodeURIComponent(secret);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(path + ': ' + response.status + ' ' + response.statusText);
  }
  // Measured as bytes on the wire would be ideal, but the response is gzipped
  // and Content-Length reflects that. The uncompressed size is the honest
  // figure for "what the client has to parse and hold", and is what scales.
  const text = await response.text();
  return { bytes: Buffer.byteLength(text, 'utf8'), value: JSON.parse(text) };
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / (1024 * 1024)).toFixed(2) + ' MB';
}

function fmtPct(part, whole) {
  if (!whole) return '—';
  return Math.round((part / whole) * 100) + '%';
}

// The size one record contributes to the payload, measured the same way the
// whole node was: its own JSON plus the key that addresses it.
function recordBytes(key, value) {
  return Buffer.byteLength(JSON.stringify(value) + JSON.stringify(key) + 2, 'utf8');
}

function splitByWindow(node, start) {
  const entries = Object.entries(node || {});
  const inWindow = { count: 0, bytes: 0 };
  const outside = { count: 0, bytes: 0 };
  const undated = { count: 0, bytes: 0 };
  const perBakery = new Map();

  entries.forEach(([key, value]) => {
    const size = recordBytes(key, value);
    const date = value && value.date;
    let bucket;
    // A record with no date sorts before every string key, so it falls outside
    // an orderByChild('date') window — which matches what the consumers always
    // did with it (both the report list and the last-visit fold skip it).
    if (!date) bucket = undated;
    else if (String(date) >= start) bucket = inWindow;
    else bucket = outside;
    bucket.count += 1;
    bucket.bytes += size;

    const bakery = (value && value.bakery) || '(none)';
    const current = perBakery.get(bakery) || { count: 0, bytes: 0 };
    current.count += 1;
    current.bytes += size;
    perBakery.set(bakery, current);
  });

  return { total: entries.length, inWindow, outside, undated, perBakery };
}

function reportNode(label, bytes, split) {
  const kept = split.inWindow.bytes;
  const dropped = split.outside.bytes + split.undated.bytes;
  console.log('\n' + label);
  console.log('  records            ' + split.total);
  console.log('  full node          ' + fmtBytes(bytes));
  console.log('  within window      ' + fmtBytes(kept) + '  (' + split.inWindow.count
    + ' records, ' + fmtPct(kept, bytes) + ' of payload)');
  console.log('  outside window     ' + fmtBytes(split.outside.bytes) + '  ('
    + split.outside.count + ' records)');
  if (split.undated.count) {
    console.log('  no date            ' + fmtBytes(split.undated.bytes) + '  ('
      + split.undated.count + ' records — excluded by the query, as before)');
  }
  console.log('  SAVED PER LOAD     ' + fmtBytes(dropped) + '  ('
    + fmtPct(dropped, bytes) + ' less)');
  return { kept, dropped, bytes };
}

async function main() {
  const secret = readSecret();
  const start = windowStart();

  console.log('Rolling window starts ' + start + ' (start of the previous calendar year)');
  console.log('Fetching nodes — this downloads each one once…');

  const [visits, tasks, meta] = await Promise.all([
    fetchNode('routineVisits', secret),
    fetchNode('followUpActions', secret),
    fetchNode('dashboardMeta', secret)
  ]);

  const visitSplit = splitByWindow(visits.value, start);
  const taskSplit = splitByWindow(tasks.value, start);

  console.log('\n' + '='.repeat(64));
  console.log('WHAT THE WINDOW REMOVES');
  console.log('='.repeat(64));
  const v = reportNode('routineVisits', visits.bytes, visitSplit);
  // Follow-ups are still read whole; this shows whether that is worth changing.
  console.log('\nfollowUpActions  (still read in full — shown for comparison)');
  console.log('  records            ' + taskSplit.total);
  console.log('  full node          ' + fmtBytes(tasks.bytes));

  // The dataset behind the dashboard, and whether the old cache could hold it.
  const LOCALSTORAGE_LIMIT = 5 * 1024 * 1024;
  let datasetBytes = null;
  try {
    const dataset = await fetchNode('dashboardData', secret);
    datasetBytes = dataset.bytes;
  } catch (e) {
    console.log('\nCould not read dashboardData: ' + e.message);
  }

  console.log('\n' + '='.repeat(64));
  console.log('THE DATASET CACHE');
  console.log('='.repeat(64));
  if (datasetBytes !== null) {
    console.log('  dashboardData      ' + fmtBytes(datasetBytes));
    console.log('  localStorage cap   ' + fmtBytes(LOCALSTORAGE_LIMIT));
    if (datasetBytes >= LOCALSTORAGE_LIMIT) {
      console.log('  VERDICT            OVER the old quota — the localStorage cache was');
      console.log('                     already failing silently, so every load was');
      console.log('                     re-downloading this in full. IndexedDB fixes it.');
    } else {
      const headroom = LOCALSTORAGE_LIMIT - datasetBytes;
      console.log('  VERDICT            under the old quota, with ' + fmtBytes(headroom)
        + ' to spare');
      console.log('                     (' + fmtPct(datasetBytes, LOCALSTORAGE_LIMIT)
        + ' used — note JSON.stringify inflates this, and');
      console.log('                     some browsers count UTF-16, halving the real cap)');
    }
    if (meta.value && meta.value.updatedAt) {
      console.log('  last uploaded      ' + meta.value.updatedAt);
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log('PER PAGE LOAD, BEFORE → AFTER');
  console.log('='.repeat(64));
  const pages = [
    { name: 'index.html (dashboard)', before: visits.bytes + tasks.bytes,
      after: v.kept + tasks.bytes, note: 'windowed' },
    { name: 'my-activity.html', before: visits.bytes + tasks.bytes,
      after: v.kept + tasks.bytes, note: 'windowed' },
    { name: 'my-team.html', before: visits.bytes + tasks.bytes,
      after: v.kept + tasks.bytes, note: 'windowed' },
    { name: 'bakery-profile.html', before: visits.bytes + tasks.bytes,
      after: visits.bytes + tasks.bytes, note: 'NOT YET SCOPED' },
    { name: 'admin.html', before: visits.bytes,
      after: visits.bytes, note: 'NOT YET SCOPED' }
  ];
  pages.forEach((page) => {
    const saved = page.before - page.after;
    console.log('  ' + page.name.padEnd(24) + fmtBytes(page.before).padStart(10)
      + ' → ' + fmtBytes(page.after).padStart(10)
      + '   ' + (saved > 0 ? '-' + fmtPct(saved, page.before) : page.note));
  });

  // What a bakery profile actually needs versus what it pulls in.
  const busiest = [...visitSplit.perBakery.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)[0];
  if (busiest) {
    console.log('\n  bakery-profile downloads every visit in the estate to show one');
    console.log('  site\'s. Its busiest site is ' + busiest[0] + ' at '
      + fmtBytes(busiest[1].bytes) + ' (' + busiest[1].count + ' visits) —');
    console.log('  ' + fmtPct(busiest[1].bytes, visits.bytes)
      + ' of what the page currently loads. Scoping it needs the bakeryKey');
    console.log('  backfill; the index is already deployed for it.');
  }

  console.log('\n' + '='.repeat(64));
  console.log('MONTHLY BANDWIDTH (Realtime Database bills ~$5/GB downloaded)');
  console.log('='.repeat(64));
  console.log('  Set LOADS_PER_DAY to your real figure (users x page views).');
  const loadsPerDay = Number(process.env.LOADS_PER_DAY || 100);
  const before = visits.bytes + tasks.bytes;
  const after = v.kept + tasks.bytes;
  const gbMonth = (n) => (n * loadsPerDay * 30) / (1024 * 1024 * 1024);
  console.log('  at ' + loadsPerDay + ' loads/day:');
  console.log('    before           ' + gbMonth(before).toFixed(2) + ' GB/mo  ≈ $'
    + (gbMonth(before) * 5).toFixed(2));
  console.log('    after            ' + gbMonth(after).toFixed(2) + ' GB/mo  ≈ $'
    + (gbMonth(after) * 5).toFixed(2));
  console.log('    saved            $'
    + ((gbMonth(before) - gbMonth(after)) * 5).toFixed(2) + '/mo');
  console.log('\n  Caveat: anyone who habitually selects "All Time" re-fetches the');
  console.log('  full node, so treat this as the best case for that user.\n');
}

// Exported so the bucketing can be tested without a live database; the report
// itself only runs when this file is the entry point.
module.exports = { windowStart, splitByWindow, recordBytes, fmtBytes };

if (require.main === module) {
  main().catch((error) => {
    console.error('\nMeasurement failed:', error.message);
    if (/401|403/.test(error.message)) {
      console.error('That looks like an auth problem — check the secret is current.');
    }
    process.exit(1);
  });
}
