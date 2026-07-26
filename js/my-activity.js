// ========== MY ACTIVITY HUB ==========
// The personal counterpart to the dashboard's Bakery Reports tab: instead of
// "what happened at this bakery", it answers "what have I been doing". Three
// sections, all fed from the same three Firebase nodes the rest of the app
// writes to — routineVisits, followUpActions, and bakeryNotes:
//
//   1. Open actions   — the follow-up tasks this user raised and hasn't closed.
//   2. My visits      — every visit logged under their name, filterable and
//                       exportable to Excel.
//   3. Activity feed  — all three record types merged into one reverse
//                       chronological stream.
//
// Nothing here is bakery-scoped, so it deliberately does NOT apply the ops-area
// report visibility scope that gates Bakery Reports: these are the signed-in
// user's own records, and hiding someone's own work from them would be absurd.

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES, resolveRolePermissions } from './permissions.js';

const G = window.GAILS || {};

const guard = document.getElementById('myActivityGuard');
const guardText = document.getElementById('myActivityGuardText');
const page = document.getElementById('myActivityPage');
const greetingEl = document.getElementById('myActivityGreeting');
const statsEl = document.getElementById('myActivityStats');
const signOutBtn = document.getElementById('myActivitySignOut');
const backLink = document.getElementById('myActivityBackLink');

const actionsStatusToggle = document.getElementById('myActionsStatus');
const actionsList = document.getElementById('myActionsList');
const actionsCount = document.getElementById('myActionsCount');

const visitsSearch = document.getElementById('myVisitsSearch');
const visitsPeriod = document.getElementById('myVisitsPeriod');
const visitsFrom = document.getElementById('myVisitsFrom');
const visitsTo = document.getElementById('myVisitsTo');
const visitsOps = document.getElementById('myVisitsOps');
const visitsBakery = document.getElementById('myVisitsBakery');
const visitsSort = document.getElementById('myVisitsSort');
const visitsReset = document.getElementById('myVisitsResetBtn');
const visitsSummary = document.getElementById('myVisitsSummary');
const visitsListEl = document.getElementById('myVisitsList');
const visitsExportBtn = document.getElementById('myVisitsExportBtn');
const customRangeControls = Array.from(document.querySelectorAll('.my-activity-custom-range'));

const timelineFilter = document.getElementById('myTimelineFilter');
const timelineList = document.getElementById('myTimelineList');
const timelineCount = document.getElementById('myTimelineCount');
const timelineMoreBtn = document.getElementById('myTimelineMore');

const confirmModal = document.getElementById('myActivityConfirmModal');
const confirmBackdrop = document.getElementById('myActivityConfirmBackdrop');
const confirmClose = document.getElementById('myActivityConfirmClose');
const confirmCancel = document.getElementById('myActivityConfirmCancel');
const confirmTitle = document.getElementById('myActivityConfirmTitle');
const confirmMessage = document.getElementById('myActivityConfirmMessage');
const confirmBtn = document.getElementById('myActivityConfirmBtn');

const FILTER_STORAGE_KEY = 'gails_my_activity_filters';
const TIMELINE_CHUNK = 25;

let currentUser = null;
let userProfile = null;
let canEdit = false;

// Every string this user is known by in the data. Visits arriving from Google
// Forms carry the respondent's email; check-ins and tasks carry whatever
// auth.currentUser.email was at the time; CQV/NBO PDFs only ever carry a
// printed auditor name. Matching on all of them is what makes the hub complete
// rather than just showing the records this app happened to stamp with a uid.
let identity = { uid: '', emails: new Set(), names: new Set() };

let visitsObj = {};
let tasksObj = {};
let notesList = [];
let dataReady = { visits: false, tasks: false, notes: false };

let actionsStatus = 'open';
let timelineKind = 'all';
let timelineLimit = TIMELINE_CHUNK;
let visitOptionsSignature = '';
let pendingExport = null;

// ---------- small shared helpers ----------

function escapeHtml(value) {
  if (typeof G.escapeHtml === 'function') return G.escapeHtml(value);
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function bakeryLabel(name) {
  if (!name) return 'Unknown bakery';
  return (typeof G.getBakeryMapLabel === 'function' ? G.getBakeryMapLabel(name) : name) || name;
}

function bakeryOps(name) {
  return (typeof G.getBakeryOps === 'function' ? G.getBakeryOps(name) : '') || 'Unknown';
}

function bakeryRegion(name) {
  return (typeof G.getBakeryRegion === 'function' ? G.getBakeryRegion(name) : '') || 'Unknown';
}

function bakeryProfileHref(name) {
  return 'bakery-profile.html?bakery=' + encodeURIComponent(name || '') +
    '&from=' + encodeURIComponent('index.html#visit-log') + '&fromLabel=' + encodeURIComponent('Bakery Directory');
}

// Names are compared with punctuation and case stripped so "O'Brien" typed into
// a form still matches "Obrien" on the profile record.
function normalizeName(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmail(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

// bakeryNotes writes createdAt with serverTimestamp() (a number of ms), while
// visits and tasks store ISO strings. Everything downstream sorts on millis.
function toMillis(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  var parsed = Date.parse(value);
  return isNaN(parsed) ? 0 : parsed;
}

function formatDay(value) {
  var ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value) {
  var ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function formatIsoDate(iso) {
  var d = new Date(String(iso || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return String(iso || '');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayMidnight() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function relativeLabel(ms) {
  if (!ms) return '';
  var days = Math.round((todayMidnight() - new Date(ms).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 31) return Math.floor(days / 7) + ' week' + (Math.floor(days / 7) === 1 ? '' : 's') + ' ago';
  if (days < 365) return Math.floor(days / 30) + ' month' + (Math.floor(days / 30) === 1 ? '' : 's') + ' ago';
  return Math.floor(days / 365) + ' year' + (Math.floor(days / 365) === 1 ? '' : 's') + ' ago';
}

function plural(count, singular, pluralWord) {
  return count + ' ' + (count === 1 ? singular : (pluralWord || singular + 's'));
}

// ---------- period filtering ----------

// GAIL's reporting year starts in March: Q1 Mar-May, Q2 Jun-Aug, Q3 Sep-Nov,
// Q4 Dec-Feb. Mirrors getGailsQuarterStart in js/visit-report.js so "This
// Quarter" means the same thing on both screens.
function gailsQuarterStart(referenceDate) {
  var month = referenceDate.getMonth();
  var reportingYear = month >= 2 ? referenceDate.getFullYear() : referenceDate.getFullYear() - 1;
  var monthsSinceMarch = (month - 2 + 12) % 12;
  return new Date(reportingYear, 2 + (Math.floor(monthsSinceMarch / 3) * 3), 1);
}

function isDateWithinPeriod(dateStr, period, fromStr, toStr) {
  var d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  var now = new Date();

  if (period === 'custom') {
    if (fromStr && dateStr < fromStr) return false;
    if (toStr && dateStr > toStr) return false;
    return true;
  }
  if (period === 'currentMonth') {
    return d >= new Date(now.getFullYear(), now.getMonth(), 1) && d <= now;
  }
  if (period === 'thisQuarter') {
    return d >= gailsQuarterStart(now) && d <= now;
  }
  if (period === 'lastQuarter') {
    var quarterStart = gailsQuarterStart(now);
    return d >= new Date(quarterStart.getFullYear(), quarterStart.getMonth() - 3, 1) && d < quarterStart;
  }
  if (period === 'thisYear') return d.getFullYear() === now.getFullYear();
  if (period === 'lastYear') return d.getFullYear() === now.getFullYear() - 1;

  var num = parseInt(period, 10);
  if (isNaN(num) || num === 0) return true;

  var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (num === 1) {
    return d >= new Date(now.getFullYear(), now.getMonth() - 1, 1) && d < currentMonthStart;
  }
  return d >= new Date(now.getFullYear(), now.getMonth() - (num - 1), 1) && d <= now;
}

// ---------- ownership ----------

function matchesMyEmail(value) {
  var email = normalizeEmail(value);
  return !!email && identity.emails.has(email);
}

function matchesMyName(value) {
  var name = normalizeName(value);
  return !!name && identity.names.has(name);
}

function matchesMyUid(value) {
  return !!value && identity.uid && String(value) === identity.uid;
}

// A visit is "mine" when the record names me as its author. `meta.createdBy` /
// `meta.createdByUid` are the durable signals (written by GAILS_Firebase
// .saveSiteVisit), `email` is what the Google Form records for routine visits,
// and the printed Coffee Partner / auditor name covers everything imported from
// a PDF. `meta.updatedBy` is only trusted on records that have never been
// edited — an admin correcting someone else's visit overwrites it, and that
// must not silently move the visit into the admin's activity.
function visitIsMine(visit) {
  if (!visit) return false;
  // Credited to me — assigned by @mention, or attributed automatically.
  if (attributedToMe(visitAttribution(visit))) return true;
  var meta = visit.meta || {};
  if (matchesMyUid(meta.createdByUid)) return true;
  if (matchesMyEmail(meta.createdBy) || matchesMyEmail(visit.email) || matchesMyEmail(visit.createdBy)) return true;
  if (!meta.createdBy && meta.updatedBy && (!meta.updatedAt || meta.updatedAt === meta.createdAt) &&
    matchesMyEmail(meta.updatedBy)) return true;
  return matchesMyName(visit.coffeePartner) || matchesMyName(visit.auditorName);
}

// Everyone a record is credited to, derived by js/attribution.js. This is what
// lets a Google Form visit or an imported CQV reach the right hub with nobody
// having assigned it: the resolver falls back through the auditor name, the
// Coffee Partner, and the form respondent's email.
function visitAttribution(visit) {
  return G.Attribution ? G.Attribution.forVisit(visit) : [];
}

function taskAttribution(task) {
  return G.Attribution ? G.Attribution.forTask(task) : [];
}

function attributedToMe(list) {
  return !!G.Attribution && G.Attribution.matches(list, identity);
}

// An explicit @mention hand-over, as opposed to a derived credit. Only these
// are announced as an assignment — telling someone a routine visit was
// "assigned to you" when the form simply carried their name would be a lie.
function visitAssignedToMe(visit) {
  var list = visitAttribution(visit);
  return G.Attribution ? G.Attribution.isExplicit(list) && attributedToMe(list) : false;
}

function visitAssignedToSomeoneElse(visit) {
  var list = visitAttribution(visit);
  if (!G.Attribution || !G.Attribution.isExplicit(list)) return false;
  return list.length > 0 && !attributedToMe(list);
}

function visitAssigneeLabel(visit) {
  return G.Attribution ? G.Attribution.label(visitAttribution(visit)) : '';
}

// Who logged the visit, as opposed to who it was assigned to.
function visitLoggedByMe(visit) {
  if (!visit) return false;
  var meta = visit.meta || {};
  if (matchesMyUid(meta.createdByUid)) return true;
  if (matchesMyEmail(meta.createdBy) || matchesMyEmail(visit.email)) return true;
  return !meta.createdBy && !!meta.updatedBy && (!meta.updatedAt || meta.updatedAt === meta.createdAt) &&
    matchesMyEmail(meta.updatedBy);
}

function taskRaisedByMe(task) {
  return !!task && (matchesMyEmail(task.createdBy) || matchesMyName(task.createdByName));
}

function taskCompletedByMe(task) {
  return !!task && matchesMyEmail(task.completedBy);
}

function taskIsMine(task) {
  return taskRaisedByMe(task) || taskCompletedByMe(task) || attributedToMe(taskAttribution(task));
}

// A follow-up handed over with the visit it was raised on.
function taskAssignedToMe(task) {
  var list = taskAttribution(task);
  return !!G.Attribution && G.Attribution.isExplicit(list) && attributedToMe(list);
}

function noteAuthorIsMine(author) {
  if (!author) return false;
  if (typeof author === 'string') return matchesMyEmail(author) || matchesMyName(author);
  return matchesMyUid(author.uid) || matchesMyEmail(author.email) || matchesMyName(author.name);
}

// ---------- visit presentation ----------

function visitTypeLabel(visit) {
  if (!visit) return 'Visit';
  if (visit.type === 'siteVisit') {
    return (visit.visitKind && visit.visitKind !== 'checkin') ? 'NBO: Opening' : 'Check-in';
  }
  if (visit.type === 'cqv') return visit.isFollowUp ? 'CQV Follow-Up' : 'CQV';
  if (visit.type === 'nbo') {
    return G.NBOShared ? G.NBOShared.visitLabel(visit) : 'NBO: Coffee Visit ' + (visit.visitNumber || 1);
  }
  return 'Routine Coffee Visit';
}

function visitTypeTone(visit) {
  if (!visit) return 'teal';
  if (visit.type === 'cqv') return 'red';
  if (visit.type === 'nbo') return 'purple';
  if (visit.type === 'siteVisit') return (visit.visitKind && visit.visitKind !== 'checkin') ? 'purple' : 'teal';
  return 'gold';
}

// One comparable percentage per visit type, so the Score column and the
// "Score (Highest)" sort mean the same thing across a mixed list. Check-ins
// carry no score at all and stay null.
function visitScorePct(visit) {
  if (!visit) return null;
  if (visit.type === 'siteVisit') return null;
  if (visit.type === 'cqv') return visit.overallPct == null ? null : visit.overallPct;
  if (visit.type === 'nbo') return G.NBOShared ? G.NBOShared.overallPct(visit) : null;
  if (visit.score != null && visit.scoreMax) return (visit.score / visit.scoreMax) * 100;
  return null;
}

function visitScoreText(visit) {
  if (visit.type === 'siteVisit') return '—';
  if (visit.type !== 'cqv' && visit.type !== 'nbo' && visit.score != null) {
    return visit.score + ' / ' + (visit.scoreMax != null ? visit.scoreMax : '—');
  }
  var pct = visitScorePct(visit);
  return pct == null ? '—' : (Math.round(pct * 10) / 10) + '%';
}

// The notes a visit carries, flattened for the row preview and the export.
// Routine visits keep one comment per section; everything else has a single
// free-text field.
function visitNotesText(visit) {
  if (!visit) return '';
  if (visit.type === 'nbo') {
    return (visit.questions || [])
      .filter(function (q) { return q && q.note; })
      .map(function (q) { return q.label + ': ' + q.note; })
      .join(' | ');
  }
  if (visit.type === 'cqv') return visit.summary || '';
  if (visit.type === 'siteVisit') return visit.comments || '';

  var schema = window.GAILS_VISIT_SCHEMA;
  var sections = (schema && schema.sections) || [];
  var parts = [];
  sections.forEach(function (section) {
    var comment = (visit[section.key] || {}).comments;
    if (comment && comment.trim()) parts.push(section.title + ': ' + comment.trim());
  });
  if (!parts.length && visit.comments) parts.push(String(visit.comments).trim());
  return parts.join(' | ');
}

function visitPersonLabel(visit) {
  if (visit.type === 'cqv' || visit.type === 'nbo') return visit.auditorName || '';
  return mentionText(visit.coffeePartner);
}

// The reading form of stored mention text: "@Sam Partner" -> "Sam Partner".
function mentionText(value) {
  var text = String(value == null ? '' : value);
  if (!text) return '';
  return G.Mentions ? G.Mentions.toText(text) : text;
}

function mentionHtml(value) {
  var text = String(value == null ? '' : value);
  if (!text) return '';
  return G.Mentions ? G.Mentions.toHtml(text) : escapeHtml(text);
}

function visitTimestamp(visit) {
  var meta = visit.meta || {};
  return toMillis(meta.createdAt) || toMillis(visit.date ? visit.date + 'T' + (visit.time || '00:00') : '');
}

// Who logged a visit, for an assignee reading their own feed. Falls back to the
// last editor for records saved before authorship was stamped.
function visitLoggerLabel(visit) {
  var meta = (visit && visit.meta) || {};
  return meta.createdBy || visit.email || meta.updatedBy || 'a colleague';
}

// ---------- follow-up presentation ----------

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };

function normalizePriority(value) {
  var v = String(value || '').toLowerCase();
  return PRIORITY_ORDER[v] !== undefined ? v : 'none';
}

function taskIsDone(task) {
  return (task.status || 'open') === 'done';
}

// Presentation metadata for a due date; days is negative when overdue. Mirrors
// dueMeta in js/visit-report.js so a task reads the same on both screens.
function dueMeta(iso) {
  if (!iso) return { state: 'none', label: 'No deadline', days: null };
  var d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return { state: 'none', label: 'No deadline', days: null };
  var days = Math.round((d - todayMidnight()) / 86400000);
  if (days < 0) return { state: 'overdue', label: Math.abs(days) + ' day' + (Math.abs(days) === 1 ? '' : 's') + ' overdue', days: days };
  if (days === 0) return { state: 'today', label: 'Due today', days: 0 };
  if (days <= 7) return { state: 'soon', label: 'Due in ' + days + ' day' + (days === 1 ? '' : 's'), days: days };
  return { state: 'future', label: 'Due ' + formatIsoDate(iso), days: days };
}

function taskIsOverdue(task) {
  return !taskIsDone(task) && dueMeta(task.dueDate).state === 'overdue';
}

function taskIsDueSoon(task) {
  if (taskIsDone(task)) return false;
  var state = dueMeta(task.dueDate).state;
  return state === 'today' || state === 'soon';
}

// Dated tasks first (earliest deadline first), then undated; priority breaks
// ties. Deliberately the same ordering the dashboard's Follow-up Tasks view
// uses — an overdue Low still outranks a High due next month.
function taskSortByDue(a, b) {
  var da = a.dueDate || '';
  var dbv = b.dueDate || '';
  if (da && dbv && da !== dbv) return da < dbv ? -1 : 1;
  if (da && !dbv) return -1;
  if (!da && dbv) return 1;
  return PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)];
}

// ---------- data selection ----------

function myVisits() {
  return Object.keys(visitsObj)
    .map(function (id) { return Object.assign({ id: id }, visitsObj[id]); })
    .filter(function (v) { return v && v.bakery && v.date && visitIsMine(v); });
}

function myTasks() {
  return Object.keys(tasksObj)
    .map(function (id) { return Object.assign({ id: id }, tasksObj[id]); })
    .filter(taskIsMine);
}

function myNotes() {
  return notesList.filter(function (note) {
    return noteAuthorIsMine(note.createdBy) || noteAuthorIsMine(note.updatedBy);
  });
}

// ---------- filter persistence ----------

function readVisitFilters() {
  return {
    search: visitsSearch ? visitsSearch.value.trim() : '',
    period: visitsPeriod ? visitsPeriod.value : '12',
    from: visitsFrom ? visitsFrom.value : '',
    to: visitsTo ? visitsTo.value : '',
    ops: visitsOps ? visitsOps.value : '',
    bakery: visitsBakery ? visitsBakery.value : '',
    sort: visitsSort ? visitsSort.value : 'dateDesc'
  };
}

function saveFilters() {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      visits: readVisitFilters(),
      actionsStatus: actionsStatus,
      timelineKind: timelineKind
    }));
  } catch { /* storage unavailable (private browsing) — filters just don't persist */ }
}

function restoreFilters() {
  var stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || 'null');
  } catch { stored = null; }
  if (!stored) return;

  var v = stored.visits || {};
  if (visitsSearch && v.search) visitsSearch.value = v.search;
  if (visitsPeriod && v.period) visitsPeriod.value = v.period;
  if (visitsFrom && v.from) visitsFrom.value = v.from;
  if (visitsTo && v.to) visitsTo.value = v.to;
  if (visitsSort && v.sort) visitsSort.value = v.sort;
  // Ops/bakery are restored by syncVisitFilterOptions once the option lists
  // exist — setting them here would be overwritten when the lists rebuild.
  if (visitsOps) visitsOps.dataset.pendingValue = v.ops || '';
  if (visitsBakery) visitsBakery.dataset.pendingValue = v.bakery || '';

  if (stored.actionsStatus) {
    actionsStatus = stored.actionsStatus;
    setToggleActive(actionsStatusToggle, 'status', actionsStatus);
  }
  if (stored.timelineKind) {
    timelineKind = stored.timelineKind;
    setToggleActive(timelineFilter, 'kind', timelineKind);
  }
  syncCustomRangeVisibility();
  if (typeof G.syncCustomSelect === 'function') {
    [visitsPeriod, visitsSort].forEach(function (select) {
      if (select) G.syncCustomSelect(select);
    });
  }
}

function setToggleActive(group, attribute, value) {
  if (!group) return;
  group.querySelectorAll('.visit-log-toggle-btn').forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-' + attribute) === value);
  });
}

function syncCustomRangeVisibility() {
  var custom = visitsPeriod && visitsPeriod.value === 'custom';
  customRangeControls.forEach(function (control) { control.hidden = !custom; });
}

// The Ops Area and Bakery lists only ever offer values that appear in this
// user's own visits — an estate-wide list would be mostly dead options.
function syncVisitFilterOptions() {
  // Building the lists before the visits node has arrived would produce two
  // empty dropdowns and, worse, discard the stored Ops Area/Bakery selections
  // that are waiting to be applied to real options.
  if (!dataReady.visits) return;

  var visits = myVisits();
  var opsSet = new Set();
  var bakerySet = new Set();
  visits.forEach(function (v) {
    opsSet.add(bakeryOps(v.bakery));
    bakerySet.add(v.bakery);
  });

  var signature = Array.from(opsSet).sort().join('|') + '::' + Array.from(bakerySet).sort().join('|');
  if (signature === visitOptionsSignature) return;
  visitOptionsSignature = signature;

  fillSelect(visitsOps, Array.from(opsSet).sort(), 'All Areas', function (value) { return value; });
  fillSelect(visitsBakery, Array.from(bakerySet).sort(function (a, b) {
    return bakeryLabel(a).localeCompare(bakeryLabel(b));
  }), 'All Bakeries', bakeryLabel);
}

function fillSelect(select, values, allLabel, labelFor) {
  if (!select) return;
  var desired = select.dataset.pendingValue || select.value || '';
  select.innerHTML = '<option value="">' + escapeHtml(allLabel) + '</option>' +
    values.map(function (value) {
      return '<option value="' + escapeHtml(value) + '">' + escapeHtml(labelFor(value)) + '</option>';
    }).join('');
  select.value = values.indexOf(desired) !== -1 ? desired : '';
  delete select.dataset.pendingValue;
  if (typeof G.syncCustomSelect === 'function') G.syncCustomSelect(select);
}

// ---------- section 1: open actions ----------

function filterActions(tasks) {
  return tasks.filter(function (task) {
    if (actionsStatus === 'open') return !taskIsDone(task);
    if (actionsStatus === 'overdue') return taskIsOverdue(task);
    if (actionsStatus === 'soon') return taskIsDueSoon(task);
    if (actionsStatus === 'done') return taskIsDone(task);
    return true;
  });
}

function actionRowHtml(task) {
  var done = taskIsDone(task);
  var meta = dueMeta(task.dueDate);
  var priority = normalizePriority(task.priority);

  var pill = done
    ? '<span class="follow-up-pill follow-up-pill--done">Done</span>'
    : (task.dueDate ? '<span class="follow-up-pill follow-up-pill--' + meta.state + '">' + escapeHtml(meta.label) + '</span>' : '');

  var footnotes = [];
  if (task.createdAt) footnotes.push('Added ' + formatDay(task.createdAt));
  if (done && task.completedAt) footnotes.push('Completed ' + formatDay(task.completedAt));
  if (!taskRaisedByMe(task) && taskCompletedByMe(task)) footnotes.push('Raised by ' + (task.createdBy || 'a colleague'));
  if (taskAssignedToMe(task) && !taskRaisedByMe(task)) footnotes.push('Assigned to you with a visit');

  return '<div class="my-activity-action' + (done ? ' my-activity-action--done' : '') +
    '" data-task-id="' + escapeHtml(task.id) + '">' +
    '<button type="button" class="follow-up-item__check' + (done ? ' checked' : '') + '" role="checkbox"' +
    ' aria-checked="' + done + '" data-task-toggle="' + escapeHtml(task.id) + '"' +
    (canEdit ? '' : ' disabled') +
    ' title="' + (done ? 'Mark as open' : 'Mark as done') + '">' + (done ? '&#10003;' : '') + '</button>' +
    '<div class="my-activity-action__body">' +
    '<a class="my-activity-action__bakery" href="' + escapeHtml(bakeryProfileHref(task.bakery)) + '">' +
    escapeHtml(bakeryLabel(task.bakery)) + '</a>' +
    '<div class="my-activity-action__title">' + escapeHtml(task.title || 'Untitled task') + '</div>' +
    (task.detail ? '<div class="my-activity-action__detail">' + escapeHtml(task.detail) + '</div>' : '') +
    '<div class="my-activity-action__context">' +
    '<span><strong>Ops Area:</strong> ' + escapeHtml(bakeryOps(task.bakery)) + '</span>' +
    '<span><strong>Region:</strong> ' + escapeHtml(bakeryRegion(task.bakery)) + '</span>' +
    '</div>' +
    (footnotes.length ? '<div class="my-activity-action__meta">' + escapeHtml(footnotes.join(' · ')) + '</div>' : '') +
    '</div>' +
    '<div class="my-activity-action__side">' +
    (priority === 'none' ? '' : '<span class="follow-up-priority follow-up-priority--' + priority + '">' + PRIORITY_LABELS[priority] + '</span>') +
    pill +
    '</div>' +
    '</div>';
}

function renderActions() {
  if (!actionsList) return;
  var tasks = myTasks();
  var openTasks = tasks.filter(function (t) { return !taskIsDone(t); });

  if (actionsCount) {
    actionsCount.textContent = plural(openTasks.length, 'open action');
    actionsCount.classList.toggle('my-activity-pill--alert',
      openTasks.some(taskIsOverdue));
  }

  var shown = filterActions(tasks).sort(function (a, b) {
    var doneA = taskIsDone(a);
    var doneB = taskIsDone(b);
    if (doneA !== doneB) return doneA ? 1 : -1;
    if (doneA && doneB) return toMillis(b.completedAt) - toMillis(a.completedAt);
    return taskSortByDue(a, b);
  });

  if (!shown.length) {
    actionsList.innerHTML = emptyStateHtml('&#9989;', dataReady.tasks
      ? actionsEmptyMessage()
      : 'Loading your actions…');
    return;
  }
  actionsList.innerHTML = shown.map(actionRowHtml).join('');
}

function actionsEmptyMessage() {
  if (actionsStatus === 'done') return 'You have not completed any follow-ups yet.';
  if (actionsStatus === 'overdue') return 'Nothing overdue — you are on top of your actions.';
  if (actionsStatus === 'soon') return 'Nothing due in the next seven days.';
  if (actionsStatus === 'all') return 'No follow-up tasks are linked to you yet.';
  return 'No open actions. Raise one from a check-in or a bakery profile.';
}

function emptyStateHtml(icon, message) {
  return '<div class="visit-log-empty"><div class="visit-log-empty__icon">' + icon + '</div><p>' +
    escapeHtml(message) + '</p></div>';
}

// ---------- section 2: my visits ----------

function filteredVisits() {
  var filters = readVisitFilters();
  var search = filters.search.toLowerCase();

  var visits = myVisits().filter(function (v) {
    if (!isDateWithinPeriod(v.date, filters.period, filters.from, filters.to)) return false;
    if (filters.ops && bakeryOps(v.bakery) !== filters.ops) return false;
    if (filters.bakery && v.bakery !== filters.bakery) return false;
    if (search) {
      var haystack = [
        bakeryLabel(v.bakery), v.bakery, visitTypeLabel(v), visitPersonLabel(v),
        G.Attribution ? G.Attribution.namesText(visitAttribution(v)) : '',
        v.mod, visitNotesText(v), bakeryOps(v.bakery), bakeryRegion(v.bakery)
      ].join(' ').toLowerCase();
      if (haystack.indexOf(search) === -1) return false;
    }
    return true;
  });

  return visits.sort(visitSorter(filters.sort));
}

function visitSorter(sortVal) {
  return function (a, b) {
    if (sortVal === 'nameAsc') return bakeryLabel(a.bakery).localeCompare(bakeryLabel(b.bakery));
    if (sortVal === 'nameDesc') return bakeryLabel(b.bakery).localeCompare(bakeryLabel(a.bakery));
    if (sortVal === 'type') return visitTypeLabel(a).localeCompare(visitTypeLabel(b));
    if (sortVal === 'scoreDesc') {
      // Unscored visits (check-ins) sort last rather than as a zero, which
      // would otherwise bury every genuinely low-scoring visit beneath them.
      var pctA = visitScorePct(a);
      var pctB = visitScorePct(b);
      if (pctA == null && pctB == null) return 0;
      if (pctA == null) return 1;
      if (pctB == null) return -1;
      return pctB - pctA;
    }
    var stampA = a.date + 'T' + (a.time || '00:00');
    var stampB = b.date + 'T' + (b.time || '00:00');
    if (sortVal === 'dateAsc') return stampA.localeCompare(stampB);
    return stampB.localeCompare(stampA);
  };
}

function visitRowHtml(visit) {
  var notes = visitNotesText(visit);
  var preview = notes.length > 140 ? notes.slice(0, 140) + '…' : notes;
  var isAudited = visit.type === 'cqv' || visit.type === 'nbo';
  var personHtml = isAudited ? escapeHtml(visit.auditorName || '') : mentionHtml(visit.coffeePartner);

  // An assigned visit shows in both people's hubs, so each needs to see which
  // side of the handover they are on at a glance.
  var assignmentTag = '';
  if (visitAssignedToMe(visit)) {
    // Named alongside colleagues, say so — "assigned to you" alone would hide
    // that someone else is covering it too.
    var others = visitAttribution(visit).filter(function (entry) {
      return !attributedToMe([entry]);
    });
    assignmentTag = '<span class="my-activity-tag my-activity-tag--blue">' +
      (others.length
        ? 'Assigned to you &amp; ' + escapeHtml(G.Attribution.label(others))
        : 'Assigned to you') + '</span>';
  } else if (visitAssignedToSomeoneElse(visit)) {
    assignmentTag = '<span class="my-activity-tag my-activity-tag--blue">Assigned to ' +
      escapeHtml(visitAssigneeLabel(visit)) + '</span>';
  }

  return '<article class="my-activity-visit" data-visit-id="' + escapeHtml(visit.id) + '">' +
    '<div class="my-activity-visit__date">' +
    '<strong>' + escapeHtml(formatIsoDate(visit.date)) + '</strong>' +
    '<span>' + escapeHtml(visit.time || '—') + '</span>' +
    '</div>' +
    '<div class="my-activity-visit__main">' +
    '<a class="my-activity-visit__bakery" href="' + escapeHtml(bakeryProfileHref(visit.bakery)) + '">' +
    escapeHtml(bakeryLabel(visit.bakery)) + '</a>' +
    '<div class="my-activity-visit__tags">' +
    '<span class="my-activity-tag my-activity-tag--' + visitTypeTone(visit) + '">' + escapeHtml(visitTypeLabel(visit)) + '</span>' +
    assignmentTag +
    '<span class="my-activity-visit__ops">' + escapeHtml(bakeryOps(visit.bakery)) + '</span>' +
    (personHtml ? '<span class="my-activity-visit__ops">' + personHtml + '</span>' : '') +
    '</div>' +
    '<p class="my-activity-visit__notes">' + escapeHtml(preview || 'No notes recorded.') + '</p>' +
    '</div>' +
    '<div class="my-activity-visit__score">' + escapeHtml(visitScoreText(visit)) + '</div>' +
    '<div class="my-activity-visit__action">' +
    '<a class="my-activity-visit__link" href="index.html?visit=' + encodeURIComponent(visit.id) + '#visit-log">View report</a>' +
    '</div>' +
    '</article>';
}

function renderVisits() {
  if (!visitsListEl) return;
  syncVisitFilterOptions();

  var visits = filteredVisits();
  var filters = readVisitFilters();

  if (visitsSummary) {
    if (visits.length) {
      var scored = visits.map(visitScorePct).filter(function (pct) { return pct != null; });
      var averageText = scored.length
        ? ' · Average score ' + (Math.round((scored.reduce(function (sum, pct) { return sum + pct; }, 0) / scored.length) * 10) / 10) + '%'
        : '';
      var bakeries = new Set(visits.map(function (v) { return v.bakery; })).size;
      visitsSummary.textContent = plural(visits.length, 'visit') + ' across ' +
        plural(bakeries, 'bakery', 'bakeries') + averageText;
    } else {
      visitsSummary.textContent = '';
    }
  }

  if (visitsExportBtn) visitsExportBtn.disabled = !visits.length;

  if (!visits.length) {
    visitsListEl.innerHTML = emptyStateHtml('&#128196;', dataReady.visits
      ? 'No visits match these filters. Widen the date range or clear the search.'
      : 'Loading your visits…');
    return;
  }

  visitsListEl.innerHTML = '<div class="my-activity-visit-head" aria-hidden="true">' +
    '<span>Date</span><span>Bakery &amp; notes</span><span>Score</span><span></span></div>' +
    visits.map(visitRowHtml).join('');

  // Cached so the export always mirrors exactly what the filters produced,
  // never a stale list from a previous render.
  pendingExport = buildExportData(visits, filters);
}

// ---------- Excel export ----------

const EXPORT_NUMBER_FORMATS = { date: 'dd mmm yyyy', percent: '0.0%', number: '0' };

function periodLabel() {
  if (!visitsPeriod) return 'All Time';
  if (visitsPeriod.value === 'custom') {
    var from = visitsFrom && visitsFrom.value ? formatIsoDate(visitsFrom.value) : 'the beginning';
    var to = visitsTo && visitsTo.value ? formatIsoDate(visitsTo.value) : 'today';
    return 'Custom: ' + from + ' to ' + to;
  }
  var option = visitsPeriod.options[visitsPeriod.selectedIndex];
  return option ? option.text : 'All Time';
}

function selectLabel(select, allLabel) {
  if (!select) return allLabel;
  if (!select.value) return allLabel;
  var option = select.options[select.selectedIndex];
  return option ? option.text : allLabel;
}

function buildExportData(visits, filters) {
  var meta = [
    ['Owner', identityDisplayName() + (currentUser && currentUser.email ? ' (' + currentUser.email + ')' : '')],
    ['Generated', new Date().toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })],
    ['Period', periodLabel()],
    ['Ops Area', selectLabel(visitsOps, 'All areas')],
    ['Bakery', selectLabel(visitsBakery, 'All bakeries')],
    ['Sorted by', selectLabel(visitsSort, 'Date (Newest)')],
    ['Visits exported', visits.length]
  ];
  if (filters.search) meta.splice(3, 0, ['Search', filters.search]);

  return {
    title: 'GAIL’s — My Visits',
    sheetName: 'My Visits',
    filename: 'GAILs My Visits ' + new Date().toISOString().slice(0, 10) + '.xlsx',
    meta: meta,
    columns: [
      { label: 'Date', type: 'date', width: 13 },
      { label: 'Time', type: 'text', width: 7 },
      { label: 'Bakery', type: 'text', width: 26 },
      { label: 'Region', type: 'text', width: 16 },
      { label: 'Ops Area', type: 'text', width: 18 },
      { label: 'Visit Type', type: 'text', width: 20 },
      { label: 'Coffee Partner / Auditor', type: 'text', width: 24 },
      { label: 'Attributed To', type: 'text', width: 24 },
      { label: 'Score %', type: 'percent', width: 10 },
      { label: 'Points', type: 'number', width: 8 },
      { label: 'Points Available', type: 'number', width: 15 },
      { label: 'Notes', type: 'text', width: 70 }
    ],
    rows: visits.map(function (v) {
      var pct = visitScorePct(v);
      var isRoutine = v.type !== 'cqv' && v.type !== 'nbo' && v.type !== 'siteVisit';
      return [
        v.date,
        v.time || '',
        bakeryLabel(v.bakery),
        bakeryRegion(v.bakery),
        bakeryOps(v.bakery),
        visitTypeLabel(v),
        visitPersonLabel(v),
        G.Attribution ? G.Attribution.namesText(visitAttribution(v)) : '',
        pct == null ? '' : pct / 100,
        isRoutine ? v.score : '',
        isRoutine ? v.scoreMax : '',
        visitNotesText(v)
      ];
    })
  };
}

// Blank cells become null so aoa_to_sheet leaves them genuinely empty rather
// than writing an empty string Excel then treats as text.
function exportCellValue(value, type) {
  if (value == null || value === '') return null;
  if (type === 'date') {
    var d = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? String(value) : d;
  }
  if (type === 'percent' || type === 'number') {
    var n = Number(value);
    return isNaN(n) ? String(value) : n;
  }
  return String(value);
}

function exportCellText(value, type) {
  var v = exportCellValue(value, type);
  if (v == null) return '';
  if (v instanceof Date) return v.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (type === 'percent' && typeof v === 'number') return (Math.round(v * 1000) / 10) + '%';
  return String(v);
}

function buildDataSheet(data) {
  var X = window.XLSX;
  var header = data.columns.map(function (col) { return col.label; });
  var body = data.rows.map(function (row) {
    return row.map(function (cell, i) {
      return exportCellValue(cell, data.columns[i] ? data.columns[i].type : 'text');
    });
  });
  var ws = X.utils.aoa_to_sheet([header].concat(body), { cellDates: true });
  var range = X.utils.decode_range(ws['!ref']);

  data.columns.forEach(function (col, c) {
    var fmt = EXPORT_NUMBER_FORMATS[col.type];
    if (!fmt) return;
    for (var r = 1; r <= range.e.r; r++) {
      var cell = ws[X.utils.encode_cell({ r: r, c: c })];
      if (cell && cell.t !== 's') cell.z = fmt;
    }
  });

  ws['!cols'] = data.columns.map(function (col) { return { wch: col.width || 16 }; });
  // The free SheetJS build cannot write bold headers or frozen panes, so the
  // autofilter does that job: it marks row 1 as the header and lets people
  // slice the export without restructuring it.
  ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: range.e.r, c: range.e.c } }) };
  return ws;
}

function buildInfoSheet(data) {
  var X = window.XLSX;
  var ws = X.utils.aoa_to_sheet([[data.title], []].concat(data.meta || []));
  ws['!cols'] = [{ wch: 22 }, { wch: 54 }];
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  return ws;
}

function triggerDownload(blob, filename) {
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
}

function exportCsvFallback(data) {
  var lines = [[data.title]]
    .concat(data.meta || [])
    .concat([[], data.columns.map(function (col) { return col.label; })])
    .concat(data.rows.map(function (row) {
      return row.map(function (cell, i) {
        return exportCellText(cell, data.columns[i] ? data.columns[i].type : 'text');
      });
    }));
  var csv = lines.map(function (row) {
    return row.map(function (cell) {
      return '"' + String(cell == null ? '' : cell).replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\r\n');
  // BOM so Excel opens it as UTF-8.
  triggerDownload(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }),
    data.filename.replace(/\.xlsx$/, '.csv'));
}

// Writes through XLSX.write + a Blob rather than SheetJS's file writer: the
// dashboard owns the single writeFile call in this codebase (see
// test/excel-export-confirmation.test.js), and the workbook is identical either
// way. Only ever reached from the confirmation dialog's onConfirm.
function downloadWorkbook(data) {
  if (!window.XLSX) {
    exportCsvFallback(data);
    return;
  }
  var wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, buildInfoSheet(data), 'Report Info');
  window.XLSX.utils.book_append_sheet(wb, buildDataSheet(data), data.sheetName);
  var out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  triggerDownload(new Blob([out], { type: 'application/octet-stream' }), data.filename);
}

function openConfirmModal(options) {
  if (!confirmModal) return;
  confirmTitle.textContent = options.title;
  confirmMessage.textContent = options.message;
  confirmBtn.textContent = options.confirmLabel || 'Confirm';
  confirmBtn.disabled = false;
  confirmBtn.onclick = function () {
    if (confirmBtn.disabled) return;
    confirmBtn.disabled = true;
    confirmBtn.onclick = null;
    closeConfirmModal();
    options.onConfirm();
  };
  confirmModal.hidden = false;
  document.body.classList.add('my-activity-modal-open');
  confirmBtn.focus();
}

function closeConfirmModal() {
  if (!confirmModal) return;
  confirmModal.hidden = true;
  confirmBtn.onclick = null;
  document.body.classList.remove('my-activity-modal-open');
}

// No file is created until this dialog is confirmed — the same guarantee the
// dashboard's report exports make, so a double-click can't start two downloads.
function requestVisitExport() {
  var data = pendingExport;
  if (!data || !data.rows.length) return;
  var isExcel = !!window.XLSX;
  var filename = isExcel ? data.filename : data.filename.replace(/\.xlsx$/, '.csv');

  openConfirmModal({
    title: isExcel ? 'Download Excel File' : 'Download CSV File',
    message: 'Download “' + filename + '” with ' + plural(data.rows.length, 'row') + '?',
    confirmLabel: isExcel ? 'Download Excel' : 'Download CSV',
    onConfirm: function () { downloadWorkbook(data); }
  });
}

// ---------- section 3: activity feed ----------

const TIMELINE_ICONS = {
  visit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path><circle cx="12" cy="10" r="2.5"></circle></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"></path><path d="M8 10h8M8 14h6"></path></svg>',
  task: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 12 3 3 5-6"></path><path d="M13 8h7M13 15h7"></path></svg>'
};

// One event per thing that actually happened, attributed to whoever did that
// specific thing. A task raised by a colleague and closed off by this user
// contributes only its "completed" event — which is exactly what belongs in
// their activity.
function buildTimelineEvents() {
  var events = [];

  Object.keys(visitsObj).forEach(function (id) {
    var visit = Object.assign({ id: id }, visitsObj[id]);
    if (!visit.bakery || !visitIsMine(visit)) return;
    var href = 'index.html?visit=' + encodeURIComponent(visit.id) + '#visit-log';

    // A visit assigned to someone else is still theirs to *do* — from this
    // user's side the event is the handover, not the logging.
    var assignedAway = visitAssignedToSomeoneElse(visit);
    var assignedHere = visitAssignedToMe(visit) && !visitLoggedByMe(visit);

    events.push({
      kind: 'visit',
      at: visitTimestamp(visit),
      bakery: visit.bakery,
      // The tag beside the title already names the visit type, and lower-casing
      // it into the sentence would mangle the acronyms ("logged a cqv").
      title: assignedHere
        ? 'Was assigned a visit'
        : (assignedAway ? 'Logged and assigned a visit' : 'Logged a visit'),
      detail: visitNotesText(visit),
      tone: assignedHere ? 'blue' : visitTypeTone(visit),
      tag: visitTypeLabel(visit),
      href: href,
      linkLabel: 'View report',
      footnote: (assignedHere
        ? 'Assigned by ' + visitLoggerLabel(visit) + ' · '
        : (assignedAway ? 'Assigned to ' + visitAssigneeLabel(visit) + ' · ' : '')) +
        'Visit date ' + formatIsoDate(visit.date) + (visit.time ? ' at ' + visit.time : '')
    });
  });

  Object.keys(tasksObj).forEach(function (id) {
    var task = Object.assign({ id: id }, tasksObj[id]);
    if (!task.bakery) return;
    var meta = task.meta || {};

    if (taskRaisedByMe(task) && task.createdAt) {
      events.push({
        kind: 'task',
        at: toMillis(task.createdAt),
        bakery: task.bakery,
        title: 'Added a follow-up task',
        detail: task.title || '',
        tone: 'blue',
        tag: 'Task added',
        href: bakeryProfileHref(task.bakery),
        linkLabel: 'Open bakery',
        footnote: task.dueDate ? 'Due ' + formatIsoDate(task.dueDate) : 'No deadline set'
      });
    }

    if (taskCompletedByMe(task) && task.completedAt) {
      events.push({
        kind: 'task',
        at: toMillis(task.completedAt),
        bakery: task.bakery,
        title: 'Completed a follow-up task',
        detail: task.title || '',
        tone: 'green',
        tag: 'Task completed',
        href: bakeryProfileHref(task.bakery),
        linkLabel: 'Open bakery',
        footnote: taskRaisedByMe(task) ? 'Raised by you' : 'Raised by ' + (task.createdBy || 'a colleague')
      });
    }

    // An edit only counts when the update stamp is meaningfully later than the
    // task's own creation and isn't just the completion write landing a moment
    // later — otherwise every task would generate a phantom "edited" event.
    var updatedAt = toMillis(meta.updatedAt);
    var createdAt = toMillis(task.createdAt);
    var completedAt = toMillis(task.completedAt);
    var isDistinctEdit = updatedAt && (updatedAt - createdAt > 60000) &&
      (!completedAt || Math.abs(updatedAt - completedAt) > 60000);
    if (isDistinctEdit && matchesMyEmail(meta.updatedBy)) {
      events.push({
        kind: 'task',
        at: updatedAt,
        bakery: task.bakery,
        title: 'Edited a follow-up task',
        detail: task.title || '',
        tone: 'gold',
        tag: 'Task edited',
        href: bakeryProfileHref(task.bakery),
        linkLabel: 'Open bakery',
        footnote: taskIsDone(task) ? 'Now marked done' : 'Still open'
      });
    }
  });

  notesList.forEach(function (note) {
    if (!note.bakery) return;
    if (noteAuthorIsMine(note.createdBy) && note.createdAt) {
      events.push({
        kind: 'note',
        at: toMillis(note.createdAt),
        bakery: note.bakery,
        title: 'Added a bakery note',
        detail: note.body || '',
        tone: 'teal',
        tag: 'Note added',
        href: bakeryProfileHref(note.bakery),
        linkLabel: 'Open bakery',
        footnote: ''
      });
    }
    if (note.updatedAt && noteAuthorIsMine(note.updatedBy)) {
      events.push({
        kind: 'note',
        at: toMillis(note.updatedAt),
        bakery: note.bakery,
        title: 'Edited a bakery note',
        detail: note.body || '',
        tone: 'gold',
        tag: 'Note edited',
        href: bakeryProfileHref(note.bakery),
        linkLabel: 'Open bakery',
        footnote: note.createdAt ? 'Originally posted ' + formatDay(note.createdAt) : ''
      });
    }
  });

  return events
    .filter(function (event) { return event.at > 0; })
    .sort(function (a, b) { return b.at - a.at; });
}

function timelineEventHtml(event) {
  var detail = event.detail || '';
  if (detail.length > 220) detail = detail.slice(0, 220) + '…';

  return '<li class="my-activity-event">' +
    '<span class="my-activity-event__icon my-activity-event__icon--' + event.tone + '">' +
    TIMELINE_ICONS[event.kind] + '</span>' +
    '<div class="my-activity-event__body">' +
    '<div class="my-activity-event__head">' +
    '<span class="my-activity-event__title">' + escapeHtml(event.title) + '</span>' +
    '<span class="my-activity-tag my-activity-tag--' + event.tone + '">' + escapeHtml(event.tag) + '</span>' +
    '</div>' +
    '<a class="my-activity-event__bakery" href="' + escapeHtml(event.href) + '">' +
    escapeHtml(bakeryLabel(event.bakery)) + '<span class="my-activity-event__link-hint">' +
    escapeHtml(event.linkLabel) + '</span></a>' +
    (detail ? '<p class="my-activity-event__detail">' + escapeHtml(detail) + '</p>' : '') +
    '<div class="my-activity-event__meta">' +
    '<time datetime="' + new Date(event.at).toISOString() + '">' + escapeHtml(formatDateTime(event.at)) + '</time>' +
    '<span>' + escapeHtml(relativeLabel(event.at)) + '</span>' +
    (event.footnote ? '<span>' + escapeHtml(event.footnote) + '</span>' : '') +
    '</div>' +
    '</div>' +
    '</li>';
}

function renderTimeline() {
  if (!timelineList) return;
  var events = buildTimelineEvents().filter(function (event) {
    return timelineKind === 'all' || event.kind === timelineKind;
  });

  if (timelineCount) timelineCount.textContent = plural(events.length, 'event');

  if (!events.length) {
    timelineList.innerHTML = emptyStateHtml('&#128340;', anyDataReady()
      ? 'Nothing recorded here yet. Log a visit, add a note, or raise a follow-up and it will appear.'
      : 'Loading your activity…');
    if (timelineMoreBtn) timelineMoreBtn.hidden = true;
    return;
  }

  var visible = events.slice(0, timelineLimit);

  // Day headings turn a flat stream into something scannable — "what did I do
  // on Tuesday" is the question this section is actually asked.
  var html = '';
  var lastDay = '';
  visible.forEach(function (event) {
    var day = formatDay(event.at);
    if (day !== lastDay) {
      if (lastDay) html += '</ul>';
      html += '<h3 class="my-activity-timeline__day">' + escapeHtml(day) +
        '<span>' + escapeHtml(relativeLabel(event.at)) + '</span></h3><ul class="my-activity-timeline__list">';
      lastDay = day;
    }
    html += timelineEventHtml(event);
  });
  if (lastDay) html += '</ul>';

  timelineList.innerHTML = html;

  if (timelineMoreBtn) {
    var remaining = events.length - visible.length;
    timelineMoreBtn.hidden = remaining <= 0;
    timelineMoreBtn.textContent = 'Show more (' + remaining + ' remaining)';
  }
}

function anyDataReady() {
  return dataReady.visits && dataReady.tasks && dataReady.notes;
}

// ---------- header stats ----------

function identityDisplayName() {
  var profile = userProfile || {};
  var name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (currentUser && currentUser.displayName) return currentUser.displayName;
  return (currentUser && currentUser.email) || 'You';
}

function renderStats() {
  if (!statsEl) return;
  var visits = myVisits();
  var tasks = myTasks();
  // Counts notes this user wrote, not the wider set the feed covers — a note
  // they only corrected someone else's wording on isn't one they wrote.
  var notesWritten = myNotes().filter(function (note) {
    return noteAuthorIsMine(note.createdBy);
  });

  var thisMonth = visits.filter(function (v) { return isDateWithinPeriod(v.date, 'currentMonth'); }).length;
  var openTasks = tasks.filter(function (t) { return !taskIsDone(t); });
  var overdue = openTasks.filter(taskIsOverdue).length;
  var lastVisit = visits.slice().sort(function (a, b) {
    return (b.date + (b.time || '')).localeCompare(a.date + (a.time || ''));
  })[0];

  var cards = [
    {
      label: 'Open actions',
      value: openTasks.length,
      meta: overdue ? overdue + ' overdue' : 'Nothing overdue',
      tone: overdue ? 'alert' : ''
    },
    { label: 'Visits logged', value: visits.length, meta: thisMonth + ' this month' },
    {
      label: 'Bakeries covered',
      value: new Set(visits.map(function (v) { return v.bakery; })).size,
      meta: lastVisit ? 'Last visit ' + formatIsoDate(lastVisit.date) : 'No visits yet'
    },
    { label: 'Notes written', value: notesWritten.length, meta: plural(tasks.length, 'task') + ' linked to you' }
  ];

  statsEl.innerHTML = cards.map(function (card) {
    return '<div class="my-activity-stat' + (card.tone ? ' my-activity-stat--' + card.tone : '') + '">' +
      '<span class="my-activity-stat__label">' + escapeHtml(card.label) + '</span>' +
      '<strong class="my-activity-stat__value">' + escapeHtml(card.value) + '</strong>' +
      '<span class="my-activity-stat__meta">' + escapeHtml(card.meta) + '</span>' +
      '</div>';
  }).join('');
}

function renderAll() {
  renderStats();
  renderActions();
  renderVisits();
  renderTimeline();
}

// ---------- live data ----------

function startLiveData() {
  onValue(ref(db, 'routineVisits'), function (snapshot) {
    visitsObj = snapshot.exists() ? snapshot.val() : {};
    if (G.Mentions) G.Mentions.addHarvested({ visits: visitsObj });
    dataReady.visits = true;
    renderAll();
  }, function (error) {
    console.error('Could not load visits:', error);
    dataReady.visits = true;
    renderAll();
  });

  onValue(ref(db, 'followUpActions'), function (snapshot) {
    tasksObj = snapshot.exists() ? snapshot.val() : {};
    dataReady.tasks = true;
    renderAll();
  }, function (error) {
    console.error('Could not load follow-up actions:', error);
    dataReady.tasks = true;
    renderAll();
  });

  // bakeryNotes is keyed by a path-safe bakery key, so it is flattened here
  // into one list; each note already carries its own readable bakery name.
  onValue(ref(db, 'bakeryNotes'), function (snapshot) {
    var byBakery = snapshot.exists() ? snapshot.val() : {};
    var flattened = [];
    Object.keys(byBakery).forEach(function (bakeryKey) {
      var notes = byBakery[bakeryKey] || {};
      Object.keys(notes).forEach(function (noteId) {
        var note = notes[noteId];
        if (!note) return;
        flattened.push(Object.assign({ id: noteId, bakeryKey: bakeryKey }, note));
      });
    });
    notesList = flattened;
    if (G.Mentions) G.Mentions.addHarvested({ notes: flattened });
    dataReady.notes = true;
    renderAll();
  }, function (error) {
    console.error('Could not load bakery notes:', error);
    dataReady.notes = true;
    renderAll();
  });
}

// ---------- events ----------

if (actionsStatusToggle) {
  actionsStatusToggle.addEventListener('click', function (event) {
    var btn = event.target.closest('.visit-log-toggle-btn');
    if (!btn) return;
    actionsStatus = btn.getAttribute('data-status') || 'open';
    setToggleActive(actionsStatusToggle, 'status', actionsStatus);
    saveFilters();
    renderActions();
  });
}

if (actionsList) {
  actionsList.addEventListener('click', async function (event) {
    var toggle = event.target.closest('[data-task-toggle]');
    if (!toggle || !canEdit) return;
    var id = toggle.getAttribute('data-task-toggle');
    var task = tasksObj[id];
    if (!task) return;

    var done = !taskIsDone(task);
    var who = currentUser ? (currentUser.email || currentUser.uid) : '';
    var now = new Date().toISOString();
    toggle.disabled = true;
    try {
      await update(ref(db, 'followUpActions/' + id), {
        status: done ? 'done' : 'open',
        completedAt: done ? now : null,
        completedBy: done ? who : null,
        'meta/updatedAt': now,
        'meta/updatedBy': who
      });
      // The live listener re-renders on success.
    } catch (error) {
      console.error('Could not update the follow-up:', error);
      toggle.disabled = false;
    }
  });
}

if (timelineFilter) {
  timelineFilter.addEventListener('click', function (event) {
    var btn = event.target.closest('.visit-log-toggle-btn');
    if (!btn) return;
    timelineKind = btn.getAttribute('data-kind') || 'all';
    timelineLimit = TIMELINE_CHUNK;
    setToggleActive(timelineFilter, 'kind', timelineKind);
    saveFilters();
    renderTimeline();
  });
}

if (timelineMoreBtn) {
  timelineMoreBtn.addEventListener('click', function () {
    timelineLimit += TIMELINE_CHUNK;
    renderTimeline();
  });
}

let searchDebounce = null;
if (visitsSearch) {
  visitsSearch.addEventListener('input', function () {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(function () {
      saveFilters();
      renderVisits();
    }, 200);
  });
}

[visitsPeriod, visitsOps, visitsBakery, visitsSort, visitsFrom, visitsTo].forEach(function (control) {
  if (!control) return;
  control.addEventListener('change', function () {
    syncCustomRangeVisibility();
    saveFilters();
    renderVisits();
  });
});

if (visitsReset) {
  visitsReset.addEventListener('click', function () {
    if (visitsSearch) visitsSearch.value = '';
    if (visitsPeriod) visitsPeriod.value = '12';
    if (visitsFrom) visitsFrom.value = '';
    if (visitsTo) visitsTo.value = '';
    if (visitsOps) visitsOps.value = '';
    if (visitsBakery) visitsBakery.value = '';
    if (visitsSort) visitsSort.value = 'dateDesc';
    if (typeof G.syncCustomSelect === 'function') {
      [visitsPeriod, visitsOps, visitsBakery, visitsSort].forEach(function (select) {
        if (select) G.syncCustomSelect(select);
      });
    }
    syncCustomRangeVisibility();
    saveFilters();
    renderVisits();
  });
}

if (visitsExportBtn) visitsExportBtn.addEventListener('click', requestVisitExport);

[confirmBackdrop, confirmClose, confirmCancel].forEach(function (control) {
  if (control) control.addEventListener('click', closeConfirmModal);
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && confirmModal && !confirmModal.hidden) closeConfirmModal();
});

if (signOutBtn) {
  signOutBtn.addEventListener('click', async function () {
    await signOut(auth);
    window.location.href = 'index.html';
  });
}

// ---------- bootstrap ----------

function showGuardError(message) {
  if (guardText) {
    guardText.innerHTML = escapeHtml(message) +
      '<br><a class="my-activity-header__link" href="index.html">Back to the dashboard</a>';
  }
  if (guard) guard.style.display = '';
  if (page) page.hidden = true;
}

function buildIdentity(user, profile) {
  var emails = new Set();
  [user.email, profile && profile.email].forEach(function (value) {
    var email = normalizeEmail(value);
    if (email) emails.add(email);
  });

  var names = new Set();
  var stored = [profile && profile.firstName, profile && profile.lastName].filter(Boolean).join(' ');
  [stored, user.displayName].forEach(function (value) {
    var name = normalizeName(value);
    // A single-word name is too weak a signal to attribute a visit on — it
    // would sweep in every colleague who shares a first name.
    if (name && name.indexOf(' ') !== -1) names.add(name);
  });

  return { uid: user.uid, emails: emails, names: names };
}

async function loadActivityHub(user) {
  var initial = await Promise.all([
    get(ref(db, 'admins/' + user.uid)),
    get(ref(db, 'users/' + user.uid)),
    get(ref(db, 'portalData/siteMeta')),
    // Best-effort: the directory only sharpens how a mention renders and which
    // uid it resolves to, so a read the rules reject must not block the page.
    get(ref(db, 'userDirectory')).catch(function (error) {
      console.warn('Shared people directory unavailable:', error);
      return null;
    })
  ]);

  var isAdmin = initial[0].exists() && initial[0].val() === true;
  userProfile = initial[1].exists() ? initial[1].val() : null;
  if (userProfile && userProfile.role === 'admin') isAdmin = true;
  if (!isAdmin && !userProfile) {
    await signOut(auth);
    window.location.replace('index.html');
    return;
  }

  var sitePayload = initial[2].exists() ? initial[2].val() : null;
  var siteEntries = sitePayload && sitePayload.entries ? sitePayload.entries : sitePayload;
  if (typeof G.setBakeryMeta === 'function') G.setBakeryMeta(siteEntries);

  if (G.Mentions) {
    var directory = initial[3] && initial[3].exists() ? initial[3].val() : {};
    G.Mentions.addPeople(Object.keys(directory).map(function (uid) {
      return { uid: uid, name: directory[uid] && directory[uid].name, email: directory[uid] && directory[uid].email };
    }));
    G.Mentions.addHarvested({ regionAssignments: (sitePayload && sitePayload.regionAssignments) || [] });
  }

  var roleId = isAdmin ? 'admin' : (userProfile && userProfile.role) || 'viewer';
  var customRole = null;
  if (!BUILTIN_ROLES[roleId]) {
    var roleSnapshot = await get(ref(db, 'roles/' + roleId));
    customRole = roleSnapshot.exists() ? roleSnapshot.val() : null;
  }
  var permissions = resolveRolePermissions(roleId, customRole);
  canEdit = permissions.actions.logVisits === true;

  currentUser = user;
  identity = buildIdentity(user, userProfile);

  if (greetingEl) {
    greetingEl.textContent = identityDisplayName().split(' ')[0] +
      ', here is everything you have logged, raised, and written across the estate.';
  }
  if (backLink && document.referrer && document.referrer.indexOf('admin.html') !== -1) {
    backLink.setAttribute('href', 'admin.html');
    backLink.textContent = '← Admin Portal';
  }

  restoreFilters();
  if (typeof G.initCustomSelects === 'function') {
    G.initCustomSelects(document.querySelector('.my-activity-filters'));
  }

  guard.style.display = 'none';
  page.hidden = false;
  renderAll();
  startLiveData();
}

onAuthStateChanged(auth, function (user) {
  if (!user) {
    window.location.replace('index.html');
    return;
  }
  loadActivityHub(user).catch(function (error) {
    console.error('Could not open My Activity:', error);
    showGuardError('Your activity could not be loaded. Please try again.');
  });
});
