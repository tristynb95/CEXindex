/**
 * Weekly follow-up digest for the GAIL's coffee dashboard.
 *
 * Every Monday morning this emails all admin users a summary of open
 * Follow-up Actions (stored in Firebase RTDB at followUpActions/{id} by the
 * dashboard — see js/visit-report.js and js/auth.js), split into three buckets:
 *   - OVERDUE       (deadline before this Monday, still open)
 *   - DUE THIS WEEK (deadline within this Mon–Sun)
 *   - DUE NEXT WEEK (deadline within next Mon–Sun)
 * Open tasks with no deadline are listed separately so they aren't forgotten.
 *
 * This is a STANDALONE script, separate from RoutineVisitSync.gs (which is
 * bound to the Google Form). It only reads Firebase over REST and sends email.
 *
 * SETUP
 * 1. Go to https://script.google.com > New project. Paste this file into
 *    Code.gs.
 * 2. Project Settings (gear icon) > Script Properties > add the SAME two
 *    properties used by RoutineVisitSync.gs:
 *      FIREBASE_DB_URL    = https://cexindex-default-rtdb.firebaseio.com
 *      FIREBASE_DB_SECRET = <a Database Secret — Firebase console > Project
 *                            settings > Service accounts > Database secrets
 *                            (legacy)>. Never put this in client-side code.
 * 3. (Optional) Add a Script Property DIGEST_TEST_RECIPIENT = you@gails.com to
 *    force every send to a single address while you're testing.
 * 4. Triggers (clock icon) > Add Trigger > function: sendWeeklyFollowUpDigest,
 *    event source: Time-driven, type: Week timer, day: Monday, time: 7am–8am.
 * 5. Run sendWeeklyFollowUpDigest once from the editor to authorise the
 *    Gmail/UrlFetch scopes and confirm the email renders, THEN rely on the
 *    trigger.
 *
 * NOTE: "week" boundaries use Monday 00:00 in Europe/London (GMT/BST),
 * matching how visit dates are treated in RoutineVisitSync.gs, regardless of
 * the Apps Script project's own timezone setting.
 */

var DIGEST_TIMEZONE = 'Europe/London';

function sendWeeklyFollowUpDigest() {
  var props = PropertiesService.getScriptProperties();
  var dbUrl = props.getProperty('FIREBASE_DB_URL');
  var secret = props.getProperty('FIREBASE_DB_SECRET');
  if (!dbUrl || !secret) {
    throw new Error('Set FIREBASE_DB_URL and FIREBASE_DB_SECRET in Script Properties first.');
  }

  var actions = readFirebase(dbUrl, secret, 'followUpActions') || {};
  var users = readFirebase(dbUrl, secret, 'users') || {};
  var siteMetaRaw = readFirebase(dbUrl, secret, 'portalData/siteMeta') || {};
  var siteEntries = (siteMetaRaw && siteMetaRaw.entries) ? siteMetaRaw.entries : siteMetaRaw;

  var recipients = collectAdminEmails(users, props.getProperty('DIGEST_TEST_RECIPIENT'));
  if (!recipients.length) {
    console.warn('No admin recipients found — nothing sent.');
    return;
  }

  var weekStart = mondayOf(new Date());              // this Monday 00:00
  var nextWeekStart = addDays(weekStart, 7);         // next Monday 00:00
  var weekAfterStart = addDays(weekStart, 14);       // Monday after next

  var buckets = { overdue: [], thisWeek: [], nextWeek: [], undated: [] };

  Object.keys(actions).forEach(function (id) {
    var t = actions[id] || {};
    if ((t.status || 'open') === 'done') return; // only open tasks

    var row = {
      bakery: t.bakery || 'Unknown',
      title: t.title || 'Untitled task',
      detail: t.detail || '',
      dueDate: t.dueDate || null,
      priority: normalizePriority(t.priority),
      region: metaField(siteEntries, t.bakery, 'r'),
      ops: metaField(siteEntries, t.bakery, 'o')
    };

    if (!t.dueDate) { buckets.undated.push(row); return; }
    var due = parseIsoDate(t.dueDate);
    if (!due) { buckets.undated.push(row); return; }

    if (due < weekStart) buckets.overdue.push(row);
    else if (due < nextWeekStart) buckets.thisWeek.push(row);
    else if (due < weekAfterStart) buckets.nextWeek.push(row);
    // Deadlines beyond next week are intentionally not chased yet.
  });

  var totalActionable = buckets.overdue.length + buckets.thisWeek.length + buckets.nextWeek.length;
  if (totalActionable === 0 && buckets.undated.length === 0) {
    console.log('No open follow-ups to report — no email sent.');
    return;
  }

  Object.keys(buckets).forEach(function (k) { buckets[k].sort(compareRows); });

  var subject = 'GAIL\'s follow-ups: ' + buckets.overdue.length + ' overdue, ' +
    buckets.thisWeek.length + ' due this week';
  var htmlBody = buildDigestHtml(buckets, weekStart, nextWeekStart);

  MailApp.sendEmail({
    to: recipients.join(','),
    subject: subject,
    htmlBody: htmlBody
  });
  console.log('Sent weekly follow-up digest to: ' + recipients.join(', '));
}

// ---- Firebase REST read ----
function readFirebase(dbUrl, secret, path) {
  var url = dbUrl.replace(/\/$/, '') + '/' + path + '.json?auth=' + secret;
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Firebase read failed for ' + path + ' (' + resp.getResponseCode() + '): ' + resp.getContentText());
  }
  var text = resp.getContentText();
  return text && text !== 'null' ? JSON.parse(text) : null;
}

// Recipients are every user whose role is 'admin'. A DIGEST_TEST_RECIPIENT
// property, when set, overrides the list entirely for safe testing.
function collectAdminEmails(users, testRecipient) {
  if (testRecipient) return [testRecipient];
  var emails = {};
  Object.keys(users || {}).forEach(function (uid) {
    var u = users[uid] || {};
    if (u.role === 'admin' && u.email) emails[u.email] = true;
  });
  return Object.keys(emails);
}

function metaField(entries, bakery, field) {
  if (!entries || !bakery) return '';
  var entry = entries[bakery];
  return entry && entry[field] ? entry[field] : '';
}

// ---- Date helpers (Monday-anchored, Europe/London) ----
function ymdInTz(date) {
  return Utilities.formatDate(date, DIGEST_TIMEZONE, 'yyyy-MM-dd');
}

function parseIsoDate(iso) {
  // Anchor to London midday so DST offsets can't shift the calendar day.
  var d = new Date(iso + 'T12:00:00');
  return isNaN(d.getTime()) ? null : startOfLondonDay(d);
}

function startOfLondonDay(date) {
  return new Date(ymdInTz(date) + 'T00:00:00');
}

function mondayOf(date) {
  var d = startOfLondonDay(date);
  // JS getDay(): 0=Sun..6=Sat. Shift so Monday is the week start.
  var dow = d.getDay();
  var deltaToMonday = (dow === 0) ? -6 : (1 - dow);
  return addDays(d, deltaToMonday);
}

function addDays(date, n) {
  var d = new Date(date.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

// Mirrors the dashboard's ordering (js/visit-report.js): deadline leads,
// priority breaks ties, then bakery name.
var PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
var PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', none: '—' };

function normalizePriority(value) {
  var v = String(value || '').toLowerCase();
  return PRIORITY_ORDER[v] !== undefined ? v : 'none';
}

function priorityColor(p) {
  if (p === 'high') return '#B22A24';
  if (p === 'medium') return '#C97F12';
  if (p === 'low') return '#0E8074';
  return '#9a9488';
}

function compareRows(a, b) {
  var da = a.dueDate || '';
  var db = b.dueDate || '';
  if (da !== db) return da < db ? -1 : 1;
  var pa = PRIORITY_ORDER[a.priority], pb = PRIORITY_ORDER[b.priority];
  if (pa !== pb) return pa - pb;
  return (a.bakery || '').localeCompare(b.bakery || '');
}

// ---- HTML ----
function buildDigestHtml(buckets, weekStart, nextWeekStart) {
  var fmt = function (d) { return Utilities.formatDate(d, DIGEST_TIMEZONE, 'd MMM yyyy'); };
  var sundayThis = addDays(nextWeekStart, -1);
  var sundayNext = addDays(nextWeekStart, 6);

  var parts = [];
  parts.push('<div style="font-family:Arial,Helvetica,sans-serif; color:#221F1A; max-width:680px;">');
  parts.push('<h2 style="margin:0 0 4px;">Weekly follow-up digest</h2>');
  parts.push('<p style="margin:0 0 20px; color:#757575; font-size:13px;">Open bakery follow-up actions as of ' +
    fmt(weekStart) + '.</p>');

  parts.push(bucketSection('&#9888; Overdue', '#B22A24', buckets.overdue));
  parts.push(bucketSection('Due this week (' + fmt(weekStart) + ' – ' + fmt(sundayThis) + ')', '#C97F12', buckets.thisWeek));
  parts.push(bucketSection('Due next week (' + fmt(nextWeekStart) + ' – ' + fmt(sundayNext) + ')', '#0E8074', buckets.nextWeek));

  if (buckets.undated.length) {
    parts.push(bucketSection('Open, no deadline set', '#757575', buckets.undated));
  }

  parts.push('<p style="margin-top:24px; color:#9a9488; font-size:12px;">Sent automatically from the GAIL\'s coffee dashboard. ' +
    'Manage these in the Bakery Reports &rsaquo; Follow-ups view.</p>');
  parts.push('</div>');
  return parts.join('');
}

function bucketSection(heading, color, rows) {
  var html = '<h3 style="margin:22px 0 8px; color:' + color + '; font-size:15px;">' +
    heading + ' (' + rows.length + ')</h3>';
  if (!rows.length) {
    return html + '<p style="margin:0 0 8px; color:#9a9488; font-size:13px;">Nothing here — nice.</p>';
  }
  html += '<table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; font-size:13px;">';
  html += '<tr style="text-align:left; color:#757575; border-bottom:1px solid #e5e2dc;">' +
    '<th style="padding:6px 8px;">Bakery</th>' +
    '<th style="padding:6px 8px;">Action</th>' +
    '<th style="padding:6px 8px; white-space:nowrap;">Priority</th>' +
    '<th style="padding:6px 8px; white-space:nowrap;">Due</th>' +
    '<th style="padding:6px 8px;">Ops Area</th></tr>';
  rows.forEach(function (r) {
    var due = r.dueDate ? Utilities.formatDate(parseIsoDate(r.dueDate), DIGEST_TIMEZONE, 'd MMM') : '—';
    html += '<tr style="border-bottom:1px solid #f0eee9;">' +
      '<td style="padding:6px 8px; font-weight:bold;">' + escapeHtml(r.bakery) + '</td>' +
      '<td style="padding:6px 8px;">' + escapeHtml(r.title) +
      (r.detail ? '<br><span style="color:#757575;">' + escapeHtml(r.detail) + '</span>' : '') + '</td>' +
      '<td style="padding:6px 8px; white-space:nowrap; font-weight:bold; color:' + priorityColor(r.priority) + ';">' +
      escapeHtml(PRIORITY_LABELS[r.priority]) + '</td>' +
      '<td style="padding:6px 8px; white-space:nowrap;">' + escapeHtml(due) + '</td>' +
      '<td style="padding:6px 8px; color:#4D463C;">' + escapeHtml(r.ops || '—') + '</td>' +
      '</tr>';
  });
  html += '</table>';
  return html;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
