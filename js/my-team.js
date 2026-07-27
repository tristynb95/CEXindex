// ========== MY TEAM ==========
// The management counterpart to My Activity. Where that page answers "what have
// I been doing", this one answers "what is my team doing" — for a coffee team
// manager looking at their own reports, and for the Head of Operations looking
// at everyone.
//
// Three things a manager actually asks, in order:
//   1. The team      — one row per person: visits, bakeries covered, open and
//                      overdue actions, and when they were last out.
//   2. Open actions  — everything the team has raised and not closed.
//   3. Recent visits — where they have actually been.
//
// Two pieces of access control meet here, and they are deliberately separate:
//
//   The ROLE decides whether this page opens at all, and how wide it reaches —
//   permissions.teamScope is 'none', 'direct' (their own reporting line), or
//   'all' (the whole team). Set per role in the admin portal.
//
//   The REPORTING LINE decides who is in a 'direct' manager's team —
//   users/{uid}.managerUid, set per person. js/team.js walks it.
//
// The roster itself is read from teamDirectory, not /users: /users carries roles
// and ops areas and is deliberately unreadable to ordinary users, so the org
// chart is mirrored into its own node that only team-scoped roles can read. The
// admin portal maintains it — see publishDirectoryEntries in js/admin-page.js.
//
// Visits and follow-ups are the same records every signed-in user can already
// read; this page only groups them by person. Nothing here widens what anyone
// can see about a bakery — it changes whose work is in view, not which sites.

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES, resolveRolePermissions, teamScopeOf } from './permissions.js';
import { mountStandaloneProfileMenu } from './standalone-profile-menu.js';

const G = window.GAILS || {};

const guard = document.getElementById('myTeamGuard');
const guardText = document.getElementById('myTeamGuardText');
const page = document.getElementById('myTeamPage');
const greetingEl = document.getElementById('myTeamGreeting');
const backLink = document.getElementById('myTeamBackLink');

const periodSelect = document.getElementById('myTeamPeriod');
const scopeNote = document.getElementById('myTeamScopeNote');
const statsEl = document.getElementById('myTeamStats');
const insightsSection = document.getElementById('section-team-insights');
const insightsBadge = document.getElementById('myTeamInsightsBadge');
const insightCallout = document.getElementById('myTeamInsightCallout');
const contributionChart = document.getElementById('myTeamContributionChart');
const contributionTotal = document.getElementById('myTeamContributionTotal');
const workloadChart = document.getElementById('myTeamWorkloadChart');
const trendChart = document.getElementById('myTeamTrendChart');
const trendDirection = document.getElementById('myTeamTrendDirection');

const rosterEl = document.getElementById('myTeamRoster');
const rosterCount = document.getElementById('myTeamRosterCount');
const rosterSummary = document.getElementById('myTeamRosterSummary');
const rosterSearch = document.getElementById('myTeamRosterSearch');
const rosterSort = document.getElementById('myTeamRosterSort');
const rosterReset = document.getElementById('myTeamRosterReset');

const actionsFilter = document.getElementById('myTeamActionsFilter');
const actionsList = document.getElementById('myTeamActionsList');
const actionsCount = document.getElementById('myTeamActionsCount');
const actionsSearch = document.getElementById('myTeamActionsSearch');
const actionsSort = document.getElementById('myTeamActionsSort');
const actionsSummary = document.getElementById('myTeamActionsSummary');
const actionsReset = document.getElementById('myTeamActionsReset');

const visitsList = document.getElementById('myTeamVisitsList');
const visitsCount = document.getElementById('myTeamVisitsCount');
const visitsMoreBtn = document.getElementById('myTeamVisitsMore');
const visitsSearch = document.getElementById('myTeamVisitsSearch');
const visitsSort = document.getElementById('myTeamVisitsSort');
const visitsSummary = document.getElementById('myTeamVisitsSummary');
const visitsReset = document.getElementById('myTeamVisitsReset');

const selectionBar = document.getElementById('myTeamSelection');
const selectionText = document.getElementById('myTeamSelectionText');
const selectionClear = document.getElementById('myTeamSelectionClear');
const jumpNav = document.getElementById('myTeamJump');

const FILTER_STORAGE_KEY = 'gails_my_team_filters';
const VISIT_CHUNK = 20;
const DEPARTMENTS = [
  { id: 'operations', name: 'Operations' },
  { id: 'coffee-team', name: 'Coffee Team' }
];

let teamScope = 'none';
let currentUserUid = '';
let accessibleRoster = [];
let roster = [];            // [{ uid, name, email, managerUid, roleName, … }]
let rosterRows = [];        // the same people in tree order: { person, depth, reportCount, teamSize }
let identities = {};        // uid -> { uid, emails:Set, names:Set } for attribution
let hiddenMyTeamDepartments = {};
let visitsObj = {};
let tasksObj = {};
let dataReady = { visits: false, tasks: false };

let period = '3';
let actionsStatus = 'open';
let visitLimit = VISIT_CHUNK;
let visitResultCount = 0;
let selectedUid = '';       // '' means the whole team

// ---------- shared formatting ----------
// Deliberately the same helpers My Activity uses, so a visit or a task reads
// identically whether a person is looking at their own work or their manager is.

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

function bakerySiteName(name) {
  return bakeryLabel(name).replace(/^gail['’]?s\s+/i, '');
}

function bakeryOps(name) {
  return (typeof G.getBakeryOps === 'function' ? G.getBakeryOps(name) : '') || 'Unknown';
}

function bakeryProfileHref(name, section) {
  return 'bakery-profile.html?bakery=' + encodeURIComponent(name || '') +
    '&from=' + encodeURIComponent('my-team.html#' + (section || 'section-roster')) +
    '&fromLabel=' + encodeURIComponent('My Team');
}

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

function relativeLabel(iso) {
  var ms = toMillis(String(iso || '').slice(0, 10) + 'T00:00:00');
  if (!ms) return '';
  var days = Math.round((todayMidnight() - new Date(ms).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 31) return Math.floor(days / 7) + ' week' + (Math.floor(days / 7) === 1 ? '' : 's') + ' ago';
  if (days < 365) return Math.floor(days / 30) + ' month' + (Math.floor(days / 30) === 1 ? '' : 's') + ' ago';
  return 'over a year ago';
}

function plural(count, singular, pluralWord) {
  return count + ' ' + (count === 1 ? singular : (pluralWord || singular + 's'));
}

function normalizeDepartment(value) {
  var normalized = String(value || '').trim().toLowerCase();
  return DEPARTMENTS.some(function (department) { return department.id === normalized; })
    ? normalized
    : '';
}

function sanitizeHiddenDepartments(value) {
  var source = value && typeof value === 'object' ? value : {};
  var hidden = {};
  DEPARTMENTS.forEach(function (department) {
    if (source[department.id] === true) hidden[department.id] = true;
  });
  return hidden;
}

function applyDepartmentVisibility() {
  roster = accessibleRoster.filter(function (person) {
    var department = normalizeDepartment(person.department);
    return !department || hiddenMyTeamDepartments[department] !== true;
  });

  identities = {};
  roster.forEach(function (person) {
    identities[person.uid] = buildIdentity(person);
  });

  // The role/reporting-line check has already produced accessibleRoster. Using
  // an all-scope layout here only rebuilds the hierarchy among the filtered
  // people, lifting a visible report to the top when their manager is hidden.
  rosterRows = G.Team ? G.Team.teamRows(currentUserUid, 'all', roster) : [];
  if (selectedUid && !roster.some(function (person) { return person.uid === selectedUid; })) {
    selectedUid = '';
  }
}

// GAIL's reporting periods, matching js/my-activity.js so "last 3 months" spans
// the same dates on both pages.
function isDateWithinPeriod(dateStr, periodValue) {
  var d = new Date(String(dateStr || '').slice(0, 10) + 'T00:00:00');
  if (isNaN(d.getTime())) return false;
  var now = new Date();

  if (periodValue === 'currentMonth') {
    return d >= new Date(now.getFullYear(), now.getMonth(), 1) && d <= now;
  }
  var num = parseInt(periodValue, 10);
  if (isNaN(num) || num === 0) return true;
  var currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (num === 1) {
    return d >= new Date(now.getFullYear(), now.getMonth() - 1, 1) && d < currentMonthStart;
  }
  return d >= new Date(now.getFullYear(), now.getMonth() - (num - 1), 1) && d <= now;
}

function periodLabel() {
  var option = periodSelect && periodSelect.options[periodSelect.selectedIndex];
  return option ? option.textContent.toLowerCase() : 'this period';
}

// ---------- visit and task presentation ----------

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

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2, none: 3 };
const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' };

function normalizePriority(value) {
  var v = String(value || '').toLowerCase();
  return PRIORITY_ORDER[v] !== undefined ? v : 'none';
}

function taskIsDone(task) {
  return (task.status || 'open') === 'done';
}

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
  var state = dueMeta(task.dueDate).state;
  return !taskIsDone(task) && (state === 'today' || state === 'soon');
}

function taskSortByDue(a, b) {
  var da = a.dueDate || '';
  var dbv = b.dueDate || '';
  if (da && dbv && da !== dbv) return da < dbv ? -1 : 1;
  if (da && !dbv) return -1;
  if (!da && dbv) return 1;
  return PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)];
}

function includesSearch(values, query) {
  if (!query) return true;
  return values.join(' ').toLowerCase().indexOf(query.toLowerCase()) !== -1;
}

// ---------- attribution ----------
// Each team member gets the same identity shape My Activity builds for the
// signed-in user, so js/attribution.js credits a record to them by exactly the
// same rules. A visit that would appear in someone's own hub appears here under
// their name, and one that would not, does not.

function buildIdentity(person) {
  var emails = new Set();
  var email = normalizeEmail(person.email);
  if (email) emails.add(email);

  var names = new Set();
  var name = normalizeName(person.name);
  // A single-word name is too weak a signal to attribute a visit on — it would
  // sweep in every colleague who shares a first name.
  if (name && name.indexOf(' ') !== -1) names.add(name);

  return { uid: person.uid, emails: emails, names: names };
}

function creditedTo(list, uid) {
  var identity = identities[uid];
  return !!identity && !!G.Attribution && G.Attribution.matches(list, identity);
}

function visitOwners(visit) {
  var list = G.Attribution ? G.Attribution.forVisit(visit) : [];
  return roster.filter(function (person) { return creditedTo(list, person.uid); });
}

function taskOwners(task) {
  if (!G.Attribution) return [];
  var sourceVisit = task && task.sourceVisitId ? visitsObj[task.sourceVisitId] : null;
  var responsible = G.Attribution.forTask(task, sourceVisit);
  var owners = roster.filter(function (person) { return creditedTo(responsible, person.uid); });
  if (owners.length) return owners;

  // If the responsible owner sits outside the viewer's roster, keep a
  // completed task visible under the team member who actually completed it.
  var actors = G.Attribution.actorsForTask(task, sourceVisit);
  return roster.filter(function (person) { return creditedTo(actors, person.uid); });
}

// ---------- data selection ----------

function allVisits() {
  return Object.keys(visitsObj)
    .map(function (id) { return Object.assign({ id: id }, visitsObj[id]); })
    .filter(function (v) { return v && v.bakery && v.date; });
}

function allTasks() {
  return Object.keys(tasksObj)
    .map(function (id) { return Object.assign({ id: id }, tasksObj[id]); })
    .filter(Boolean);
}

// Every visit in the period credited to at least one person on the team, each
// carrying the list of team members it belongs to. A visit covered by two
// people appears once, under both names.
function teamVisits() {
  return allVisits()
    .filter(function (visit) { return isDateWithinPeriod(visit.date, period); })
    .map(function (visit) { return Object.assign({ owners: visitOwners(visit) }, visit); })
    .filter(function (visit) { return visit.owners.length > 0; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
}

// Tasks are deliberately NOT period-filtered: an action raised eight months ago
// and still open is exactly what a manager needs to see, and hiding it because
// the filter says "last 3 months" would be the opposite of useful.
function teamTasks() {
  return allTasks()
    .map(function (task) { return Object.assign({ owners: taskOwners(task) }, task); })
    .filter(function (task) { return task.owners.length > 0; });
}

// Selecting a coffee partner shows their area, not just them: their own visits
// plus those of the area head baristas reporting into them. Picking a manager
// and being shown only their personal work would be the wrong answer to the
// question the click asks.
function branchOf(uid) {
  if (!uid) return [];
  var branch = G.Team ? G.Team.branchUids(uid, roster) : [uid];
  // branchUids walks the full roster, which for a 'direct' scope is already
  // limited to what this viewer may see.
  return branch.length ? branch : [uid];
}

function forSelected(records) {
  if (!selectedUid) return records;
  var branch = branchOf(selectedUid);
  return records.filter(function (record) {
    return record.owners.some(function (owner) { return branch.indexOf(owner.uid) !== -1; });
  });
}

function ownerLabel(owners) {
  var names = owners.map(function (owner) { return owner.name; }).filter(Boolean);
  if (!names.length) return 'the team';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' & ' + names[1];
  return names[0] + ' +' + (names.length - 1);
}

// ---------- per-person figures ----------

// Figures for one person, or for a whole branch when passed several uids. A
// visit covered by two people in the same branch is counted once, because it
// happened once.
function statsFor(uids, visits, tasks) {
  var wanted = Array.isArray(uids) ? uids : [uids];
  function belongs(record) {
    return record.owners.some(function (owner) { return wanted.indexOf(owner.uid) !== -1; });
  }
  var theirVisits = visits.filter(belongs);
  var theirTasks = tasks.filter(belongs);
  var open = theirTasks.filter(function (task) { return !taskIsDone(task); });
  var assignedBakeries = G.Team && typeof G.Team.assignedBakeries === 'function'
    ? G.Team.assignedBakeries(
      wanted,
      roster,
      typeof G.getRegionAssignmentsSnapshot === 'function' ? G.getRegionAssignmentsSnapshot() : [],
      typeof G.getBakeryMetaSnapshot === 'function' ? G.getBakeryMetaSnapshot() : {}
    )
    : [];
  var lastVisit = theirVisits.reduce(function (latest, visit) {
    return !latest || String(visit.date) > String(latest.date) ? visit : latest;
  }, null);

  return {
    visits: theirVisits.length,
    bakeries: assignedBakeries.length,
    open: open.length,
    overdue: open.filter(taskIsOverdue).length,
    completed: theirTasks.length - open.length,
    lastVisit: lastVisit
  };
}

// ---------- rendering ----------

function renderScopeNote() {
  if (!scopeNote) return;
  var base = teamScope === 'all'
    ? 'Showing everyone on the coffee team.'
    : 'Showing everyone who reports to you, and everyone who reports to them.';
  var hiddenNames = DEPARTMENTS.filter(function (department) {
    return hiddenMyTeamDepartments[department.id] === true;
  }).map(function (department) { return department.name; });
  scopeNote.textContent = base + (hiddenNames.length ? ' Hidden: ' + hiddenNames.join(' and ') + '.' : '');
}

function renderStats() {
  if (!statsEl) return;
  var visits = forSelected(teamVisits());
  var tasks = forSelected(teamTasks());
  var open = tasks.filter(function (task) { return !taskIsDone(task); });
  var overdue = open.filter(taskIsOverdue);
  var visiblePeople = selectedUid
    ? roster.filter(function (person) { return branchOf(selectedUid).indexOf(person.uid) !== -1; })
    : roster;
  var active = visiblePeople.filter(function (person) {
    return visits.some(function (visit) {
      return visit.owners.some(function (owner) { return owner.uid === person.uid; });
    });
  });

  var cards = [
    {
      label: 'People',
      value: visiblePeople.length,
      meta: visiblePeople.length
        ? plural(active.length, 'person', 'people') + ' out ' + periodLabel()
        : 'Nobody reports to you yet'
    },
    {
      label: 'Visits',
      value: visits.length,
      meta: plural(new Set(visits.map(function (visit) { return visit.bakery; })).size, 'bakery', 'bakeries') + ' covered'
    },
    {
      label: 'Open actions',
      value: open.length,
      meta: open.length ? 'Raised by the team' : 'Nothing outstanding'
    },
    {
      label: 'Overdue',
      value: overdue.length,
      tone: overdue.length ? 'alert' : '',
      meta: overdue.length ? 'Past their due date' : 'All on track'
    }
  ];

  var destinations = ['section-roster', 'section-team-visits', 'section-team-actions', 'section-team-actions'];
  statsEl.innerHTML = cards.map(function (card, index) {
    return '<a class="my-activity-stat' + (card.tone ? ' my-activity-stat--' + card.tone : '') + '"' +
      ' href="#' + destinations[index] + '" aria-label="' +
      escapeHtml(card.label + ': ' + card.value + '. ' + card.meta) + '">' +
      '<span class="my-activity-stat__label">' + escapeHtml(card.label) + '</span>' +
      '<strong class="my-activity-stat__value">' + escapeHtml(card.value) + '</strong>' +
      '<span class="my-activity-stat__meta">' + escapeHtml(card.meta) + '</span>' +
      '</a>';
  }).join('');
}

function analyticsPeople() {
  if (!selectedUid) return roster.slice();
  var branch = branchOf(selectedUid);
  return roster.filter(function (person) { return branch.indexOf(person.uid) !== -1; });
}

function chartPersonName(person) {
  var name = person.name || person.email || 'Unnamed';
  var parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[0] + ' ' + parts[parts.length - 1].charAt(0) + '.' : name;
}

function chartValue(value) {
  var number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function chartRowHtml(person, value, max, risk, workload) {
  var width = max ? Math.round((value / max) * 100) : 0;
  var riskWidth = value && risk ? Math.round((risk / value) * width) : 0;
  var label = chartPersonName(person);
  var description = workload
    ? label + ': ' + plural(value, 'open action') + (risk ? ', ' + plural(risk, 'overdue action') : '')
    : label + ': ' + chartValue(value) + ' visit contribution';

  return '<button type="button" class="my-team-chart-row" data-chart-person="' +
    escapeHtml(person.uid) + '" aria-label="' + escapeHtml(description) + '">' +
    '<span class="my-team-chart-row__label" title="' + escapeHtml(person.name || label) + '">' +
    escapeHtml(label) + '</span>' +
    '<span class="my-team-chart-row__track" aria-hidden="true">' +
    '<i class="my-team-chart-row__bar' + (workload ? ' my-team-chart-row__bar--workload' : '') +
    (width ? '' : ' is-zero') + '" style="width:' + width + '%"></i>' +
    (risk ? '<i class="my-team-chart-row__risk" style="width:' + riskWidth + '%"></i>' : '') +
    '</span>' +
    '<strong class="my-team-chart-row__value">' + chartValue(value) + '</strong>' +
    '</button>';
}

function chartRowsHtml(rows, valueKey, riskKey, workload) {
  var ordered = rows.slice().sort(function (a, b) {
    return b[valueKey] - a[valueKey] ||
      (riskKey ? b[riskKey] - a[riskKey] : 0) ||
      (a.person.name || '').localeCompare(b.person.name || '');
  });
  var max = ordered.reduce(function (largest, row) { return Math.max(largest, row[valueKey]); }, 0);
  var visible = ordered.slice(0, 6);
  if (!visible.length) {
    return '<div class="my-team-chart-empty">No team members to compare yet.</div>';
  }
  var html = visible.map(function (row) {
    return chartRowHtml(row.person, row[valueKey], max, riskKey ? row[riskKey] : 0, workload);
  }).join('');
  if (ordered.length > visible.length) {
    html += '<p class="my-team-chart-more">Top 6 of ' + ordered.length + ' people shown</p>';
  }
  return html;
}

function monthKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
}

function monthlyTrend(visits, count, endDate) {
  var series = [];
  for (var offset = count - 1; offset >= 0; offset -= 1) {
    var date = new Date(endDate.getFullYear(), endDate.getMonth() - offset, 1);
    series.push({
      key: monthKey(date),
      label: date.toLocaleDateString('en-GB', { month: 'short' }),
      value: 0
    });
  }
  var byKey = {};
  series.forEach(function (point) { byKey[point.key] = point; });
  visits.forEach(function (visit) {
    var date = new Date(String(visit.date || '').slice(0, 10) + 'T00:00:00');
    var point = !isNaN(date.getTime()) && byKey[monthKey(date)];
    if (point) point.value += 1;
  });
  return series;
}

function weeklyMonthTrend(visits, monthDate) {
  var daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  var series = [];
  for (var start = 1; start <= daysInMonth; start += 7) {
    series.push({
      start: start,
      end: Math.min(start + 6, daysInMonth),
      label: start + '–' + Math.min(start + 6, daysInMonth),
      value: 0
    });
  }
  visits.forEach(function (visit) {
    var date = new Date(String(visit.date || '').slice(0, 10) + 'T00:00:00');
    if (isNaN(date.getTime()) || date.getFullYear() !== monthDate.getFullYear() ||
        date.getMonth() !== monthDate.getMonth()) return;
    var point = series[Math.floor((date.getDate() - 1) / 7)];
    if (point) point.value += 1;
  });
  return series;
}

function visitTrend(visits) {
  var now = new Date();
  if (period === 'currentMonth') return weeklyMonthTrend(visits, now);
  if (period === '1') return weeklyMonthTrend(visits, new Date(now.getFullYear(), now.getMonth() - 1, 1));

  var count = parseInt(period, 10);
  if (!count) {
    var dated = visits.map(function (visit) {
      return new Date(String(visit.date || '').slice(0, 10) + 'T00:00:00');
    }).filter(function (date) { return !isNaN(date.getTime()); })
      .sort(function (a, b) { return a - b; });
    var end = dated.length
      ? dated.reduce(function (latest, date) { return date > latest ? date : latest; }, dated[0])
      : now;
    count = dated.length
      ? Math.min(12, Math.max(3, (end.getFullYear() - dated[0].getFullYear()) * 12 +
        end.getMonth() - dated[0].getMonth() + 1))
      : 6;
    return monthlyTrend(visits, count, end);
  }
  return monthlyTrend(visits, count, now);
}

function renderTrend(visits) {
  if (!trendChart) return;
  var series = visitTrend(visits);
  var max = series.reduce(function (largest, point) { return Math.max(largest, point.value); }, 0);
  trendChart.style.setProperty('--trend-count', series.length);
  trendChart.innerHTML = series.map(function (point) {
    var height = max ? Math.max(4, Math.round((point.value / max) * 100)) : 0;
    return '<div class="my-team-trend-column" title="' + escapeHtml(point.label + ': ' + plural(point.value, 'visit')) + '">' +
      '<div class="my-team-trend-column__plot"><div class="my-team-trend-column__bar' +
      (height ? '' : ' is-zero') + '" style="height:' + height + '%">' +
      '<span>' + point.value + '</span></div></div>' +
      '<span class="my-team-trend-column__label">' + escapeHtml(point.label) + '</span>' +
      '</div>';
  }).join('');

  if (!trendDirection) return;
  trendDirection.className = 'my-team-trend-direction';
  var latest = series[series.length - 1] ? series[series.length - 1].value : 0;
  var previous = series[series.length - 2] ? series[series.length - 2].value : 0;
  if (!latest && !previous) {
    trendDirection.textContent = 'No activity yet';
  } else if (latest > previous) {
    trendDirection.textContent = previous ? '↑ ' + (latest - previous) + ' vs prior period' : '↑ Activity increased';
    trendDirection.classList.add('my-team-trend-direction--up');
  } else if (latest < previous) {
    trendDirection.textContent = '↓ ' + (previous - latest) + ' vs prior period';
    trendDirection.classList.add('my-team-trend-direction--down');
  } else {
    trendDirection.textContent = '→ Steady vs prior period';
  }
}

function renderAnalytics() {
  var people = analyticsPeople();
  var visits = forSelected(teamVisits());
  var tasks = forSelected(teamTasks());
  var shares = G.Team && typeof G.Team.contributionShares === 'function'
    ? G.Team.contributionShares(visits, people.map(function(person) { return person.uid; }))
    : {};
  var rows = people.map(function (person) {
    var stats = statsFor([person.uid], visits, tasks);
    return {
      person: person,
      visits: stats.visits,
      contribution: shares[person.uid] || 0,
      open: stats.open,
      overdue: stats.overdue
    };
  });

  if (contributionTotal) contributionTotal.textContent = visits.length;
  if (contributionChart) contributionChart.innerHTML = chartRowsHtml(rows, 'contribution', '', false);
  if (workloadChart) workloadChart.innerHTML = chartRowsHtml(rows, 'open', 'overdue', true);
  if (insightsBadge) {
    var selected = selectedUid && roster.find(function (person) { return person.uid === selectedUid; });
    insightsBadge.textContent = selected ? selected.name + ' area' : plural(people.length, 'person', 'people');
  }

  renderTrend(visits);
  if (!insightCallout) return;

  var risk = rows.slice().sort(function (a, b) {
    return b.overdue - a.overdue || b.open - a.open;
  })[0];
  var inactive = rows.filter(function (row) { return row.visits === 0; });
  var topContributor = rows.slice().sort(function (a, b) {
    return b.contribution - a.contribution;
  })[0];
  var creditedVisits = visits.length;
  var message = '';
  var tone = 'positive';

  if (risk && risk.overdue) {
    tone = 'alert';
    message = 'Priority: ' + (risk.person.name || 'A team member') + ' has ' +
      plural(risk.overdue, 'overdue action') + ' across ' + plural(risk.open, 'open action') + '.';
  } else if (inactive.length) {
    tone = '';
    message = 'Coverage opportunity: ' + plural(inactive.length, 'person', 'people') +
      ' have no credited visits ' + periodLabel() + '.';
  } else if (topContributor && creditedVisits && people.length > 2 &&
      topContributor.contribution / creditedVisits >= 0.5) {
    tone = '';
    message = (topContributor.person.name || 'One person') + ' accounts for ' +
      Math.round((topContributor.contribution / creditedVisits) * 100) +
      '% of visit contribution. Shared visits are split across their credited people.';
  } else if (people.length) {
    message = 'The team has no overdue actions and everyone has credited visit activity ' + periodLabel() + '.';
  } else {
    tone = '';
    message = 'Team insights will appear once people are added to your reporting line.';
  }

  insightCallout.className = 'my-team-insight-callout' +
    (tone ? ' my-team-insight-callout--' + tone : '');
  insightCallout.textContent = message;
}

// A row is indented by its depth in the reporting tree, so a coffee partner's
// area head baristas sit visibly underneath them rather than in the same flat
// list. A manager's own figures cover their work only; the branch roll-up is
// stated separately, because "Alex logged 4 visits" and "Alex's area logged 19"
// are different facts and conflating them would flatter or bury people.
function personRowHtml(row, stats, branchStats) {
  var person = row.person;
  var isSelected = selectedUid === person.uid;
  var lastOut = stats.lastVisit
    ? bakerySiteName(stats.lastVisit.bakery) + ', ' + relativeLabel(stats.lastVisit.date)
    : 'No visits ' + periodLabel();

  var reportsNote = '';
  if (row.teamSize) {
    reportsNote = ' · ' + plural(row.reportCount, 'report') +
      (row.teamSize > row.reportCount ? ' (' + row.teamSize + ' in their area)' : '');
  }

  return '<button type="button" class="my-team-person' + (isSelected ? ' is-selected' : '') +
    (row.depth ? ' my-team-person--nested' : '') + '"' +
    ' style="--team-depth:' + row.depth + '"' +
    ' data-person="' + escapeHtml(person.uid) + '" aria-pressed="' + isSelected + '">' +
    '<div class="my-team-person__id">' +
    '<strong>' + escapeHtml(person.name || person.email || 'Unnamed') + '</strong>' +
    '<span>' + escapeHtml(person.roleName || 'Viewer') + escapeHtml(reportsNote) + '</span>' +
    '</div>' +
    '<div class="my-team-person__figures">' +
    '<span class="my-team-figure"><strong>' + stats.visits + '</strong>visits</span>' +
    '<span class="my-team-figure" title="Bakeries assigned through Region Coffee Team"><strong>' +
    stats.bakeries + '</strong>bakeries</span>' +
    '<span class="my-team-figure"><strong>' + stats.open + '</strong>open</span>' +
    '<span class="my-team-figure' + (stats.overdue ? ' my-team-figure--alert' : '') + '">' +
    '<strong>' + stats.overdue + '</strong>overdue</span>' +
    '</div>' +
    '<div class="my-team-person__last">' + escapeHtml(lastOut) +
    (branchStats
      ? '<span class="my-team-person__branch">Area total: ' + plural(branchStats.visits, 'visit') +
        ', ' + plural(branchStats.open, 'open action') + '</span>'
      : '') +
    '</div>' +
    '</button>';
}

function filteredRosterRows(visits, tasks) {
  var query = rosterSearch ? rosterSearch.value.trim().toLowerCase() : '';
  var sort = rosterSort ? rosterSort.value : 'hierarchy';
  var rows = rosterRows.slice();

  if (query) {
    var keep = new Set();
    rows.forEach(function (row) {
      var person = row.person;
      if (!includesSearch([person.name || '', person.email || '', person.roleName || ''], query)) return;
      keep.add(person.uid);
      // Keep the reporting path so a search result never appears as an
      // unexplained indented row with its manager missing.
      var managerUid = person.managerUid;
      var seen = new Set();
      while (managerUid && !seen.has(managerUid)) {
        seen.add(managerUid);
        keep.add(managerUid);
        var manager = roster.find(function (candidate) { return candidate.uid === managerUid; });
        managerUid = manager ? manager.managerUid : '';
      }
    });
    rows = rows.filter(function (row) { return keep.has(row.person.uid); });
  }

  if (sort !== 'hierarchy') {
    rows = rows.map(function (row) {
      return Object.assign({}, row, { _stats: statsFor([row.person.uid], visits, tasks) });
    });
    rows.sort(function (a, b) {
      if (sort === 'name') return (a.person.name || '').localeCompare(b.person.name || '');
      if (sort === 'visits') return b._stats.visits - a._stats.visits ||
        (a.person.name || '').localeCompare(b.person.name || '');
      return b._stats.overdue - a._stats.overdue || b._stats.open - a._stats.open ||
        (a.person.name || '').localeCompare(b.person.name || '');
    });
    rows = rows.map(function (row) { return Object.assign({}, row, { depth: 0 }); });
  }
  return rows;
}

function renderSelection() {
  if (!selectionBar) return;
  var selected = selectedUid && roster.find(function (person) { return person.uid === selectedUid; });
  selectionBar.hidden = !selected;
  if (!selected || !selectionText) return;
  var branch = branchOf(selected.uid);
  selectionText.textContent = 'Viewing ' + selected.name +
    (branch.length > 1 ? ' and ' + plural(branch.length - 1, 'person', 'people') + ' in their area' : ' only');
}

function renderRoster() {
  if (!rosterEl) return;
  syncRosterResetState();
  if (rosterCount) rosterCount.textContent = plural(roster.length, 'person', 'people');

  if (!roster.length) {
    var allDepartmentsHidden = accessibleRoster.length && accessibleRoster.every(function (person) {
      var department = normalizeDepartment(person.department);
      return department && hiddenMyTeamDepartments[department] === true;
    });
    rosterEl.innerHTML = emptyStateHtml('&#128101;', allDepartmentsHidden
      ? 'Every department in your team is hidden. An administrator can change the departments visible to you from Manage Access.'
      : (teamScope === 'all'
        ? 'No people are published to the team directory yet. An administrator can publish it from the People & Access panel.'
        : 'Nobody reports to you yet. An administrator sets reporting lines in the People & Access panel.'));
    if (rosterSummary) rosterSummary.textContent = '';
    return;
  }

  var visits = teamVisits();
  var tasks = teamTasks();
  var visibleRows = filteredRosterRows(visits, tasks);

  if (rosterCount) {
    rosterCount.textContent = visibleRows.length === roster.length
      ? plural(roster.length, 'person', 'people')
      : visibleRows.length + ' of ' + plural(roster.length, 'person', 'people');
  }

  rosterEl.innerHTML = visibleRows.map(function (row) {
    var stats = row._stats || statsFor([row.person.uid], visits, tasks);
    // Only worth rolling up when there is actually a branch to roll up.
    var branchStats = row.teamSize ? statsFor(branchOf(row.person.uid), visits, tasks) : null;
    return personRowHtml(row, stats, branchStats);
  }).join('');

  if (!visibleRows.length) {
    rosterEl.innerHTML = emptyStateHtml('&#128269;', 'No team members match that search.');
  }

  if (rosterSummary) {
    var selected = selectedUid && roster.find(function (person) { return person.uid === selectedUid; });
    var branch = selected ? branchOf(selected.uid) : [];
    rosterSummary.textContent = rosterSearch && rosterSearch.value.trim()
      ? plural(visibleRows.length, 'matching person', 'matching people')
      : selected
      ? 'Showing ' + selected.name +
        (branch.length > 1 ? ' and the ' + plural(branch.length - 1, 'person', 'people') + ' in their area' : ' only') +
        ' — select them again to see the whole team.'
      : plural(visits.length, 'visit') + ' and ' +
        plural(tasks.filter(function (task) { return !taskIsDone(task); }).length, 'open action') +
        ' across the team ' + periodLabel() + '.';
  }
}

function actionRowHtml(task) {
  var done = taskIsDone(task);
  var meta = dueMeta(task.dueDate);
  var priority = normalizePriority(task.priority);
  var ownerText = ownerLabel(task.owners);
  var raiserText = G.Attribution ? G.Attribution.label(G.Attribution.taskRaiser(task)) : '';
  var completerText = G.Attribution ? G.Attribution.label(G.Attribution.taskCompleter(task)) : '';

  var pill = done
    ? '<span class="follow-up-pill follow-up-pill--done">Done</span>'
    : (task.dueDate ? '<span class="follow-up-pill follow-up-pill--' + meta.state + '">' + escapeHtml(meta.label) + '</span>' : '');

  var footnotes = ['Owner: ' + ownerText];
  if (raiserText && raiserText !== ownerText) footnotes.push('Raised by ' + raiserText);
  if (task.createdAt) footnotes.push('Added ' + formatDay(task.createdAt));
  if (done && completerText) footnotes.push('Completed by ' + completerText);
  if (done && task.completedAt) footnotes.push('Completed ' + formatDay(task.completedAt));

  // Read-only by design: a manager reviewing their team's workload should not
  // be able to close somebody else's action out from under them.
  return '<div class="my-activity-action' + (done ? ' my-activity-action--done' : '') +
    '" data-task-id="' + escapeHtml(task.id) + '">' +
    '<div class="my-activity-action__body">' +
    '<a class="my-activity-action__bakery" href="' + escapeHtml(bakeryProfileHref(task.bakery, 'section-team-actions')) + '">' +
    escapeHtml(bakerySiteName(task.bakery)) + '</a>' +
    '<div class="my-activity-action__title">' + escapeHtml(task.title || 'Untitled task') + '</div>' +
    (task.detail ? '<div class="my-activity-action__detail">' + escapeHtml(task.detail) + '</div>' : '') +
    '<div class="my-activity-action__context">' +
    '<span><strong>Ops Area:</strong> ' + escapeHtml(bakeryOps(task.bakery)) + '</span>' +
    '</div>' +
    '<div class="my-activity-action__meta">' + escapeHtml(footnotes.join(' · ')) + '</div>' +
    '</div>' +
    '<div class="my-activity-action__side">' +
    (priority === 'none' ? '' : '<span class="follow-up-priority follow-up-priority--' + priority + '">' + PRIORITY_LABELS[priority] + '</span>') +
    pill +
    '</div>' +
    '</div>';
}

function teamActionSorter(sort) {
  return function (a, b) {
    if (sort === 'priority') {
      return PRIORITY_ORDER[normalizePriority(a.priority)] - PRIORITY_ORDER[normalizePriority(b.priority)] ||
        taskSortByDue(a, b);
    }
    if (sort === 'owner') {
      return ownerLabel(a.owners).localeCompare(ownerLabel(b.owners)) || taskSortByDue(a, b);
    }
    if (sort === 'bakery') {
      return bakerySiteName(a.bakery).localeCompare(bakerySiteName(b.bakery)) || taskSortByDue(a, b);
    }
    return taskSortByDue(a, b);
  };
}

function renderActions() {
  if (!actionsList) return;
  syncActionsResetState();
  var tasks = forSelected(teamTasks());
  var open = tasks.filter(function (task) { return !taskIsDone(task); });

  if (actionsCount) {
    actionsCount.textContent = plural(open.length, 'open action');
    actionsCount.classList.toggle('my-activity-pill--alert', open.some(taskIsOverdue));
  }

  var query = actionsSearch ? actionsSearch.value.trim().toLowerCase() : '';
  var sort = actionsSort ? actionsSort.value : 'due';
  var shown = tasks.filter(function (task) {
    var matchesStatus = actionsStatus === 'all' ||
      (actionsStatus === 'done' && taskIsDone(task)) ||
      (actionsStatus === 'overdue' && taskIsOverdue(task)) ||
      (actionsStatus === 'soon' && taskIsDueSoon(task)) ||
      (actionsStatus === 'open' && !taskIsDone(task));
    if (!matchesStatus) return false;
    return includesSearch([
      task.title || '', task.detail || '', bakerySiteName(task.bakery),
      bakeryOps(task.bakery), ownerLabel(task.owners)
    ], query);
  }).sort(teamActionSorter(sort));

  if (actionsSummary) {
    actionsSummary.textContent = shown.length
      ? plural(shown.length, 'matching action') + ' across ' +
        plural(new Set(shown.map(function (task) { return task.bakery; })).size, 'bakery', 'bakeries')
      : '';
  }

  if (!shown.length) {
    actionsList.innerHTML = emptyStateHtml('&#9989;', dataReady.tasks
      ? (query ? 'No actions match that search. Try a person, bakery, or action title.' : actionsEmptyMessage())
      : 'Loading the team’s actions…');
    return;
  }
  actionsList.innerHTML = shown.map(actionRowHtml).join('');
}

function actionsEmptyMessage() {
  if (actionsStatus === 'overdue') return 'Nothing overdue — the team is on top of its actions.';
  if (actionsStatus === 'soon') return 'Nothing is due in the next seven days.';
  if (actionsStatus === 'done') return 'The team has not completed any follow-ups yet.';
  if (actionsStatus === 'all') return 'No follow-up tasks are linked to the team yet.';
  return 'No open actions across the team.';
}

function visitRowHtml(visit) {
  return '<article class="my-activity-visit" data-visit-id="' + escapeHtml(visit.id) + '">' +
    '<div class="my-activity-visit__date">' +
    '<strong>' + escapeHtml(formatIsoDate(visit.date)) + '</strong>' +
    '<span>' + escapeHtml(visit.time || '—') + '</span>' +
    '</div>' +
    '<div class="my-activity-visit__main">' +
    '<a class="my-activity-visit__bakery" href="' + escapeHtml(bakeryProfileHref(visit.bakery, 'section-team-visits')) + '">' +
    escapeHtml(bakerySiteName(visit.bakery)) + '</a>' +
    '<div class="my-activity-visit__tags">' +
    '<span class="my-activity-tag my-activity-tag--' + visitTypeTone(visit) + '">' + escapeHtml(visitTypeLabel(visit)) + '</span>' +
    '<span class="my-activity-tag my-activity-tag--blue">' + escapeHtml(ownerLabel(visit.owners)) + '</span>' +
    '<span class="my-activity-visit__ops">' + escapeHtml(bakeryOps(visit.bakery)) + '</span>' +
    '</div>' +
    '</div>' +
    '<div class="my-activity-visit__action">' +
    // Keep a real dashboard href as a fallback and for modified clicks, while
    // ordinary clicks are enhanced into the in-page report modal below.
    '<a class="my-activity-visit__link" data-open-visit-report="' + escapeHtml(visit.id) + '"' +
    ' href="index.html?visit=' + encodeURIComponent(visit.id) + '#visit-log">View report</a>' +
    '</div>' +
    '</article>';
}

function renderVisits() {
  if (!visitsList) return;
  syncVisitsResetState();
  var visits = forSelected(teamVisits());
  if (visitsCount) visitsCount.textContent = plural(visits.length, 'visit');
  var query = visitsSearch ? visitsSearch.value.trim().toLowerCase() : '';
  var sort = visitsSort ? visitsSort.value : 'newest';

  visits = visits.filter(function (visit) {
    return includesSearch([
      bakerySiteName(visit.bakery), bakeryOps(visit.bakery),
      visitTypeLabel(visit), ownerLabel(visit.owners)
    ], query);
  }).sort(function (a, b) {
    if (sort === 'oldest') return String(a.date).localeCompare(String(b.date));
    if (sort === 'owner') {
      return ownerLabel(a.owners).localeCompare(ownerLabel(b.owners)) ||
        String(b.date).localeCompare(String(a.date));
    }
    if (sort === 'bakery') {
      return bakerySiteName(a.bakery).localeCompare(bakerySiteName(b.bakery)) ||
        String(b.date).localeCompare(String(a.date));
    }
    return String(b.date).localeCompare(String(a.date));
  });
  visitResultCount = visits.length;

  if (visitsSummary) {
    visitsSummary.textContent = visits.length
      ? plural(visits.length, 'matching visit') + ' across ' +
        plural(new Set(visits.map(function (visit) { return visit.bakery; })).size, 'bakery', 'bakeries')
      : '';
  }

  if (!visits.length) {
    visitsList.innerHTML = emptyStateHtml('&#128506;', dataReady.visits
      ? (query
        ? 'No visits match that search in this period.'
        : 'No visits credited to the team ' + periodLabel() + '.')
      : 'Loading the team’s visits…');
    if (visitsMoreBtn) {
      visitsMoreBtn.hidden = true;
      visitsMoreBtn.disabled = true;
    }
    return;
  }

  var visibleVisits = visits.slice(0, visitLimit);
  if (visitsSummary && visibleVisits.length < visits.length) {
    visitsSummary.textContent += ' · Showing first ' + visibleVisits.length;
  }
  visitsList.innerHTML = visibleVisits.map(visitRowHtml).join('');
  if (visitsMoreBtn) {
    var remaining = Math.max(0, visits.length - visibleVisits.length);
    visitsMoreBtn.hidden = remaining === 0;
    visitsMoreBtn.disabled = remaining === 0;
    visitsMoreBtn.textContent = 'Show more (' + remaining + ' left)';
  }
}

function emptyStateHtml(icon, message) {
  return '<div class="visit-log-empty"><div class="visit-log-empty__icon">' + icon + '</div><p>' +
    escapeHtml(message) + '</p></div>';
}

function renderAll() {
  renderSelection();
  renderStats();
  renderAnalytics();
  renderRoster();
  renderActions();
  renderVisits();
}

// ---------- visit report modal ----------
// Feed the shared report renderer only visits the manager can currently reach.
// This keeps its previous/next history controls inside the active reporting
// line, selected branch and period instead of exposing the estate-wide cache.
function syncReportSource() {
  var visible = {};
  forSelected(teamVisits()).forEach(function (visit) {
    visible[visit.id] = visitsObj[visit.id];
  });
  G._allVisitsObj = visible;
}

function openReportModal(visitId) {
  if (typeof G.openVisitReportById !== 'function') return false;
  syncReportSource();
  G.openVisitReportById(visitId);
  return true;
}

// ---------- filters ----------

function setFilterResetState(button, active, filterLabel) {
  if (!button) return;
  button.classList.toggle('has-active-filters', !!active);
  var description = active
    ? 'Clear ' + filterLabel + ' filters'
    : 'No ' + filterLabel + ' filters to clear';
  button.setAttribute('title', description);
  button.setAttribute('aria-label', description);
}

function syncRosterResetState() {
  setFilterResetState(rosterReset, !!(
    (rosterSearch && rosterSearch.value.trim()) ||
    (rosterSort && rosterSort.value !== 'hierarchy')
  ), 'team');
}

function syncActionsResetState() {
  setFilterResetState(actionsReset, !!(
    (actionsSearch && actionsSearch.value.trim()) ||
    (actionsSort && actionsSort.value !== 'due') ||
    actionsStatus !== 'open'
  ), 'action');
}

function syncVisitsResetState() {
  setFilterResetState(visitsReset, !!(
    (visitsSearch && visitsSearch.value.trim()) ||
    (visitsSort && visitsSort.value !== 'newest') ||
    period !== '3'
  ), 'visit');
}

function saveFilters() {
  try {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      period: period,
      actionsStatus: actionsStatus,
      selectedUid: selectedUid,
      rosterSearch: rosterSearch ? rosterSearch.value : '',
      rosterSort: rosterSort ? rosterSort.value : 'hierarchy',
      actionsSearch: actionsSearch ? actionsSearch.value : '',
      actionsSort: actionsSort ? actionsSort.value : 'due',
      visitsSearch: visitsSearch ? visitsSearch.value : '',
      visitsSort: visitsSort ? visitsSort.value : 'newest'
    }));
  } catch {
    // A blocked localStorage is not worth failing the page over.
  }
}

function restoreFilters() {
  var saved = null;
  try {
    saved = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!saved) return;
  if (saved.period && periodSelect) {
    period = String(saved.period);
    periodSelect.value = period;
    // A stored period the select no longer offers falls back to the default.
    if (!periodSelect.value) {
      period = '3';
      periodSelect.value = '3';
    }
  }
  if (saved.actionsStatus) {
    actionsStatus = saved.actionsStatus;
    setToggleActive(actionsFilter, 'status', actionsStatus);
  }
  if (rosterSearch && typeof saved.rosterSearch === 'string') rosterSearch.value = saved.rosterSearch;
  if (rosterSort && saved.rosterSort) rosterSort.value = saved.rosterSort;
  if (actionsSearch && typeof saved.actionsSearch === 'string') actionsSearch.value = saved.actionsSearch;
  if (actionsSort && saved.actionsSort) actionsSort.value = saved.actionsSort;
  if (visitsSearch && typeof saved.visitsSearch === 'string') visitsSearch.value = saved.visitsSearch;
  if (visitsSort && saved.visitsSort) visitsSort.value = saved.visitsSort;
  // A remembered person who is no longer on the team must not silently filter
  // the whole page down to nothing.
  if (saved.selectedUid && roster.some(function (person) { return person.uid === saved.selectedUid; })) {
    selectedUid = saved.selectedUid;
  }
}

function setToggleActive(group, attribute, value) {
  if (!group) return;
  Array.from(group.querySelectorAll('.visit-log-toggle-btn')).forEach(function (btn) {
    btn.classList.toggle('active', btn.getAttribute('data-' + attribute) === value);
  });
}

// ---------- events ----------

if (periodSelect) {
  periodSelect.addEventListener('change', function () {
    period = periodSelect.value;
    visitLimit = VISIT_CHUNK;
    saveFilters();
    renderAll();
  });
}

if (actionsFilter) {
  actionsFilter.addEventListener('click', function (event) {
    var btn = event.target.closest('.visit-log-toggle-btn');
    if (!btn) return;
    actionsStatus = btn.getAttribute('data-status') || 'open';
    setToggleActive(actionsFilter, 'status', actionsStatus);
    saveFilters();
    renderActions();
  });
}

if (rosterEl) {
  rosterEl.addEventListener('click', function (event) {
    var btn = event.target.closest('[data-person]');
    if (!btn) return;
    // Selecting the person already selected clears the filter, so there is
    // always a way back to the whole team without a separate control.
    var uid = btn.getAttribute('data-person');
    selectedUid = selectedUid === uid ? '' : uid;
    visitLimit = VISIT_CHUNK;
    saveFilters();
    renderAll();
  });
}

let rosterSearchDebounce = null;
if (rosterSearch) {
  rosterSearch.addEventListener('input', function () {
    syncRosterResetState();
    clearTimeout(rosterSearchDebounce);
    rosterSearchDebounce = setTimeout(function () {
      saveFilters();
      renderRoster();
    }, 160);
  });
}

if (rosterSort) {
  rosterSort.addEventListener('change', function () {
    saveFilters();
    renderRoster();
  });
}

let teamActionsSearchDebounce = null;
if (actionsSearch) {
  actionsSearch.addEventListener('input', function () {
    syncActionsResetState();
    clearTimeout(teamActionsSearchDebounce);
    teamActionsSearchDebounce = setTimeout(function () {
      saveFilters();
      renderActions();
    }, 160);
  });
}

if (actionsSort) {
  actionsSort.addEventListener('change', function () {
    saveFilters();
    renderActions();
  });
}

let teamVisitsSearchDebounce = null;
if (visitsSearch) {
  visitsSearch.addEventListener('input', function () {
    syncVisitsResetState();
    clearTimeout(teamVisitsSearchDebounce);
    teamVisitsSearchDebounce = setTimeout(function () {
      visitLimit = VISIT_CHUNK;
      saveFilters();
      renderVisits();
    }, 160);
  });
}

if (visitsSort) {
  visitsSort.addEventListener('change', function () {
    visitLimit = VISIT_CHUNK;
    saveFilters();
    renderVisits();
  });
}

if (rosterReset) {
  rosterReset.addEventListener('click', function () {
    if (rosterSearch) rosterSearch.value = '';
    if (rosterSort) rosterSort.value = 'hierarchy';
    if (typeof G.syncCustomSelect === 'function' && rosterSort) G.syncCustomSelect(rosterSort);
    clearTimeout(rosterSearchDebounce);
    saveFilters();
    renderRoster();
  });
}

if (actionsReset) {
  actionsReset.addEventListener('click', function () {
    if (actionsSearch) actionsSearch.value = '';
    if (actionsSort) actionsSort.value = 'due';
    actionsStatus = 'open';
    setToggleActive(actionsFilter, 'status', actionsStatus);
    if (typeof G.syncCustomSelect === 'function' && actionsSort) G.syncCustomSelect(actionsSort);
    clearTimeout(teamActionsSearchDebounce);
    saveFilters();
    renderActions();
  });
}

if (visitsReset) {
  visitsReset.addEventListener('click', function () {
    if (visitsSearch) visitsSearch.value = '';
    if (visitsSort) visitsSort.value = 'newest';
    period = '3';
    if (periodSelect) periodSelect.value = period;
    if (typeof G.syncCustomSelect === 'function') {
      [visitsSort, periodSelect].forEach(function (select) {
        if (select) G.syncCustomSelect(select);
      });
    }
    clearTimeout(teamVisitsSearchDebounce);
    visitLimit = VISIT_CHUNK;
    saveFilters();
    renderAll();
  });
}

if (selectionClear) {
  selectionClear.addEventListener('click', function () {
    selectedUid = '';
    visitLimit = VISIT_CHUNK;
    saveFilters();
    renderAll();
  });
}

if (insightsSection) {
  insightsSection.addEventListener('click', function (event) {
    var target = event.target.closest('[data-chart-person]');
    if (!target) return;
    selectedUid = target.getAttribute('data-chart-person') || '';
    visitLimit = VISIT_CHUNK;
    saveFilters();
    renderAll();
  });
}

if (visitsMoreBtn) {
  visitsMoreBtn.addEventListener('click', function () {
    if (visitsMoreBtn.disabled || visitLimit >= visitResultCount) return;
    visitLimit = Math.min(visitResultCount, visitLimit + VISIT_CHUNK);
    renderVisits();
  });
}

if (jumpNav && 'IntersectionObserver' in window) {
  var sectionObserver = new IntersectionObserver(function (entries) {
    var visible = entries
      .filter(function (entry) { return entry.isIntersecting; })
      .sort(function (a, b) { return b.intersectionRatio - a.intersectionRatio; })[0];
    if (!visible) return;
    Array.from(jumpNav.querySelectorAll('[data-section-link]')).forEach(function (link) {
      link.classList.toggle('is-active', link.getAttribute('data-section-link') === visible.target.id);
    });
  }, { rootMargin: '-15% 0px -65% 0px', threshold: [0, 0.1, 0.5] });

  ['section-team-insights', 'section-roster', 'section-team-actions', 'section-team-visits'].forEach(function (id) {
    var section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });
}

// Use a separate attribute from the dashboard renderer's [data-visit-report]
// delegation. The latter represents a bakery name; this link carries a visit
// id. Modified clicks retain the real href and open the dashboard in a new tab.
document.addEventListener('click', function (event) {
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  var link = event.target.closest('[data-open-visit-report]');
  if (!link) return;

  if (openReportModal(link.getAttribute('data-open-visit-report'))) event.preventDefault();
});

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
}

// ---------- bootstrap ----------

function showGuardError(message) {
  if (guardText) {
    guardText.classList.add('auth-loading__text--stacked');
    guardText.innerHTML = '<span>' + escapeHtml(message) + '</span>' +
      '<a class="btn" href="index.html">Back to the dashboard</a>';
  }
  if (guard) guard.style.display = '';
  if (page) page.hidden = true;
}

async function loadTeam(user) {
  currentUserUid = user.uid;
  var initial = await Promise.all([
    get(ref(db, 'admins/' + user.uid)),
    get(ref(db, 'users/' + user.uid)),
    get(ref(db, 'portalData/siteMeta'))
  ]);

  var isAdmin = initial[0].exists() && initial[0].val() === true;
  var userProfile = initial[1].exists() ? initial[1].val() : null;
  hiddenMyTeamDepartments = sanitizeHiddenDepartments(
    userProfile && userProfile.hiddenMyTeamDepartments
  );
  if (userProfile && userProfile.role === 'admin') isAdmin = true;
  if (!isAdmin && !userProfile) {
    await signOut(auth);
    window.location.replace('index.html');
    return;
  }

  var sitePayload = initial[2].exists() ? initial[2].val() : null;
  var siteEntries = sitePayload && sitePayload.entries ? sitePayload.entries : sitePayload;
  if (typeof G.setBakeryMeta === 'function') G.setBakeryMeta(siteEntries);
  if (typeof G.setRegionAssignments === 'function') {
    G.setRegionAssignments((sitePayload && sitePayload.regionAssignments) || []);
  }
  if (typeof G.setOpsAreaAssignments === 'function') {
    G.setOpsAreaAssignments((sitePayload && sitePayload.opsAreaAssignments) || []);
  }

  var roleId = isAdmin ? 'admin' : (userProfile && userProfile.role) || 'viewer';
  var customRole = null;
  if (!BUILTIN_ROLES[roleId]) {
    var roleSnapshot = await get(ref(db, 'roles/' + roleId));
    customRole = roleSnapshot.exists() ? roleSnapshot.val() : null;
  }
  teamScope = teamScopeOf(resolveRolePermissions(roleId, customRole));

  // The menu entry is hidden without a team scope, but the page has to refuse a
  // typed URL too — this is the check a bookmark cannot walk around. The
  // database rules refuse the roster read as well, so a role without a team
  // view gets nothing even if this check were bypassed.
  if (teamScope === 'none') {
    showGuardError('My Team is not switched on for your role. Ask an administrator if you should have it.');
    return;
  }

  // teamDirectory carries the reporting lines; userDirectory sharpens how names
  // resolve for attribution. Both are best-effort — an undeployed rules file
  // must leave a readable page rather than a broken one.
  var directorySnapshot = await get(ref(db, 'teamDirectory')).catch(function (error) {
    console.warn('Team directory unavailable:', error);
    return null;
  });
  var directory = directorySnapshot && directorySnapshot.exists() ? directorySnapshot.val() : {};

  if (G.Mentions) {
    G.Mentions.addPeople(Object.keys(directory).map(function (uid) {
      return { uid: uid, name: directory[uid] && directory[uid].name, email: directory[uid] && directory[uid].email };
    }));
    G.Mentions.addHarvested({
      regionAssignments: (sitePayload && sitePayload.regionAssignments) || [],
      opsAreaAssignments: (sitePayload && sitePayload.opsAreaAssignments) || []
    });
  }

  // js/team.js normalizes each directory record, so roleName arrives with it.
  accessibleRoster = G.Team ? G.Team.visibleTeam(user.uid, teamScope, directory) : [];
  applyDepartmentVisibility();

  if (greetingEl) {
    var firstName = String((userProfile && userProfile.firstName) || user.displayName || '').split(' ')[0];
    greetingEl.textContent = (firstName ? firstName + ', here' : 'Here') + ' is what ' +
      (teamScope === 'all' ? 'the coffee team' : 'your team') +
      ' has been doing — where they have been, and what they have opened.';
  }
  if (backLink && document.referrer && document.referrer.indexOf('admin.html') !== -1) {
    backLink.setAttribute('href', 'admin.html');
    backLink.textContent = '← Admin Portal';
  }
  mountStandaloneProfileMenu({
    user: user,
    profile: userProfile,
    showActivity: !!(userProfile && userProfile.myActivity === true),
    showTeam: true,
    onSignOut: async function () {
      await signOut(auth);
      window.location.href = 'index.html';
    }
  });

  restoreFilters();
  renderScopeNote();
  if (typeof G.initCustomSelects === 'function') {
    document.querySelectorAll('.my-team-period').forEach(function (block) {
      G.initCustomSelects(block);
    });
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
  loadTeam(user).catch(function (error) {
    console.error('Could not open My Team:', error);
    showGuardError('Your team could not be loaded. Please try again.');
  });
});
