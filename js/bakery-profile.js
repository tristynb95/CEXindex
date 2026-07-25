import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  get,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-database.js";
import { BUILTIN_ROLES, resolveRolePermissions } from './permissions.js';

const G = window.GAILS || {};
const guard = document.getElementById('bakeryProfileGuard');
const page = document.getElementById('bakeryProfilePage');
const signOutBtn = document.getElementById('bakeryProfileSignOut');
const backLink = document.getElementById('bakeryProfileBackLink');
const brandLink = document.querySelector('.bakery-profile-header__brand');
const taskAddToggle = document.getElementById('bakeryTaskAddToggle');
const bakerySwitcher = document.querySelector('.bakery-profile-switcher');
const bakerySwitcherToggle = document.getElementById('bakeryProfileSwitcherToggle');
const bakerySwitcherName = document.getElementById('bakeryProfileSwitcherName');
const bakerySwitcherMenu = document.getElementById('bakeryProfileSwitcherMenu');
const bakerySwitcherSearch = document.getElementById('bakeryProfileSwitcherSearch');
const bakerySwitcherOptions = document.getElementById('bakeryProfileSwitcherOptions');
const bakerySwitcherCount = document.getElementById('bakeryProfileSwitcherCount');
const taskForm = document.getElementById('bakeryTaskForm');
const taskCancel = document.getElementById('bakeryTaskCancel');
const taskSubmit = document.getElementById('bakeryTaskSubmit');
const taskMessage = document.getElementById('bakeryTaskMessage');
const taskModal = document.getElementById('bakeryTaskModal');
const taskModalBackdrop = document.getElementById('bakeryTaskModalBackdrop');
const taskModalClose = document.getElementById('bakeryTaskModalClose');
const taskModalBakery = document.getElementById('bakeryTaskModalBakery');
const noteForm = document.getElementById('bakeryNoteForm');
const noteBody = document.getElementById('bakeryNoteBody');
const noteSubmit = document.getElementById('bakeryNoteSubmit');
const noteCancelEdit = document.getElementById('bakeryNoteCancelEdit');
const noteMessage = document.getElementById('bakeryNoteMessage');
const notePostingAs = document.getElementById('bakeryNotePostingAs');
const noteDeleteModal = document.getElementById('bakeryNoteDeleteModal');
const noteDeleteBackdrop = document.getElementById('bakeryNoteDeleteBackdrop');
const noteDeleteClose = document.getElementById('bakeryNoteDeleteClose');
const noteDeleteCancel = document.getElementById('bakeryNoteDeleteCancel');
const noteDeleteConfirm = document.getElementById('bakeryNoteDeleteConfirm');
const noteDeleteAuthor = document.getElementById('bakeryNoteDeleteAuthor');
const noteDeletePreview = document.getElementById('bakeryNoteDeletePreview');
const noteDeleteMessage = document.getElementById('bakeryNoteDeleteMessage');
const competitionList = document.getElementById('bakeryCompetitionList');
const competitionStatusTag = document.getElementById('bakeryCompetitionStatusTag');
const competitionResultCount = document.getElementById('bakeryCompetitionResultCount');

const TARGET_SCORE = 75;
const COMPETITION_RADIUS_METRES = 1000;
const COMPETITION_RESULT_LIMIT = 8;
const COMPETITION_CACHE_TTL = 12 * 60 * 60 * 1000;
const FSA_ESTABLISHMENTS_ENDPOINT = 'https://api.ratings.food.gov.uk/Establishments';
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const COMPETITION_CORRECTIONS = {
  'Banbury Gateway': {
    removeNames: ['starbucks']
  }
};

let bakeryName = '';
let bakeryMeta = null;
let dashboardRecords = [];
let visits = [];
let tasks = [];
let notes = {};
let availableBakeryNames = [];
let currentUser = null;
let currentUserProfile = null;
let canEdit = false;
let notesUnsubscribe = null;
let visitsUnsubscribe = null;
let tasksUnsubscribe = null;
let taskSaving = false;
let taskModalReturnFocus = null;
let isAdmin = false;
let notePostingAsDefault = 'Posting as Coffee Team';
let noteDeleteId = null;
let noteDeleting = false;
let noteDeleteReturnFocus = null;

const RETURN_LABELS = {
  overview: 'Overview',
  target: 'Focus Bakeries',
  map: 'Map',
  trends: 'Trends',
  table: 'League Table',
  feedback: 'Customer Feedback',
  'visit-log': 'Bakery Directory',
  sites: 'Site Data',
  visits: 'Bakery Visits'
};

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeReturnUrl(value) {
  if (!value) return '';
  try {
    var parsed = new URL(value, window.location.href);
    var pageName = parsed.pathname.split('/').pop().toLowerCase();
    if (parsed.origin !== window.location.origin ||
        (pageName !== 'index.html' && pageName !== 'admin.html')) return '';
    return pageName + parsed.search + parsed.hash;
  } catch {
    return '';
  }
}

function labelFromReturnUrl(returnUrl) {
  var hash = String(returnUrl || '').split('#')[1] || '';
  return RETURN_LABELS[hash.replace(/^tab-/, '')] || '';
}

function getProfileReturnContext() {
  var params = new URLSearchParams(window.location.search);
  var returnUrl = safeReturnUrl(params.get('from'));
  var returnLabel = String(params.get('fromLabel') || '').trim().slice(0, 80);

  if (!returnUrl && document.referrer) {
    returnUrl = safeReturnUrl(document.referrer);
  }
  if (!returnUrl) returnUrl = 'index.html#visit-log';
  if (!returnLabel) returnLabel = labelFromReturnUrl(returnUrl) || 'Bakery Directory';

  return { url: returnUrl, label: returnLabel };
}

const profileReturnContext = getProfileReturnContext();

function profileUrlFor(name) {
  var encodeQueryValue = function(value) {
    return encodeURIComponent(value).replace(/'/g, '%27');
  };
  return 'bakery-profile.html?bakery=' + encodeQueryValue(name) +
    '&from=' + encodeQueryValue(profileReturnContext.url) +
    '&fromLabel=' + encodeQueryValue(profileReturnContext.label);
}

function configureBackNavigation() {
  var text = '← Back To ' + profileReturnContext.label;
  if (backLink) {
    backLink.href = profileReturnContext.url;
    backLink.textContent = text;
    backLink.setAttribute('aria-label', 'Back To ' + profileReturnContext.label);
  }
  if (brandLink) {
    brandLink.href = profileReturnContext.url;
    brandLink.setAttribute('aria-label', 'Back To ' + profileReturnContext.label);
  }
}

configureBackNavigation();

function setMessage(element, type, text) {
  if (!element) return;
  element.className = 'bakery-profile-form-message' + (type ? ' is-' + type : '');
  element.textContent = text || '';
  element.hidden = !text;
}

function setBusy(button, busy, busyText, readyText) {
  if (!button) return;
  button.disabled = busy;
  button.textContent = busy ? busyText : readyText;
}

function canonicalName(value) {
  var text = String(value || '').trim();
  return G.resolveBakeryMetaKey ? (G.resolveBakeryMetaKey(text) || text) : text;
}

function profileDisplayBakeryName(value) {
  var name = String(value || '').trim();
  return name.replace(/^GAIL(?:['’])?S\s+/i, '') || name;
}

function sameBakery(value) {
  return canonicalName(value) === bakeryName;
}

function bakeryPathKey(value) {
  return encodeURIComponent(canonicalName(value)).replace(/\./g, '%2E');
}

function profileDisplayName(user, profile) {
  var savedName = [profile && profile.firstName, profile && profile.lastName]
    .map(function(part) { return String(part || '').trim(); })
    .filter(Boolean)
    .join(' ');
  return savedName || String(user && user.displayName || '').trim() ||
    String(user && user.email || '').split('@')[0] || 'Coffee Team';
}

function initials(value) {
  var parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  var result = parts.slice(0, 2).map(function(part) { return part.charAt(0); }).join('').toUpperCase();
  return result || 'C';
}

function monthSortKey(label) {
  var match = String(label || '').trim().match(/^([A-Za-z]{3})\s+(\d{2}|\d{4})$/);
  if (!match) return 0;
  var months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var month = months.indexOf(match[1].toLowerCase());
  var year = Number(match[2]);
  if (year < 100) year += year >= 70 ? 1900 : 2000;
  return month < 0 ? 0 : year * 12 + month;
}

function timestampValue(value) {
  if (typeof value === 'number') return value;
  var parsed = Date.parse(value || '');
  return isNaN(parsed) ? 0 : parsed;
}

function formatDate(value, includeTime) {
  if (!value) return 'Date unavailable';
  var date;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    date = new Date(value + 'T12:00:00');
  } else {
    date = new Date(value);
  }
  if (isNaN(date.getTime())) return String(value);
  var options = includeTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleString('en-GB', options);
}

function formatVisitType(type) {
  var labels = {
    siteVisit: 'Routine visit',
    cqv: 'Coffee Quality Visit',
    cqvFollowUp: 'CQV follow-up',
    nbo: 'New Bakery Opening'
  };
  return labels[type] || 'Bakery visit';
}

function metricValue(value, suffix) {
  if (value === null || value === undefined || isNaN(Number(value))) return '—';
  return Math.round(Number(value)) + (suffix || '');
}

function deriveBenchmarkBand(record) {
  if (!record || record.incompletePeriod) return record && record.incompletePeriod ? 'Incomplete' : 'No data';
  if (record.ac === null || record.ac === undefined || isNaN(Number(record.ac))) return 'No data';
  var score = Number(record.ac);
  return score >= 90 ? 'Exceeding' : score >= 75 ? 'Meeting' : score >= 60 ? 'Approaching' : 'Below Standard';
}

function latestDashboardRecord() {
  return dashboardRecords
    .filter(function(record) { return record && sameBakery(record.b); })
    .sort(function(a, b) { return monthSortKey(b.m) - monthSortKey(a.m); })[0] || null;
}

function companyRankForRecord(record) {
  if (!record || !record.m || record.noData || record.incompletePeriod ||
      record.ac === null || record.ac === undefined || isNaN(Number(record.ac))) return null;
  var ranked = dashboardRecords.filter(function(candidate) {
    return candidate && candidate.m === record.m && !candidate.noData && !candidate.incompletePeriod &&
      candidate.ac !== null && candidate.ac !== undefined && !isNaN(Number(candidate.ac));
  }).sort(function(first, second) {
    var benchmarkDifference = Number(second.ac) - Number(first.ac);
    if (benchmarkDifference) return benchmarkDifference;
    var peerDifference = Number(second.c || 0) - Number(first.c || 0);
    if (peerDifference) return peerDifference;
    return canonicalName(first.b).localeCompare(canonicalName(second.b), 'en-GB');
  });
  var index = ranked.findIndex(function(candidate) { return sameBakery(candidate.b); });
  if (index < 0) return null;
  return {
    rank: index + 1,
    total: ranked.length,
    topPercent: Math.max(1, Math.ceil(((index + 1) / ranked.length) * 100))
  };
}

function sortedBakeryVisits() {
  return visits.filter(function(visit) {
    return visit && sameBakery(visit.bakery);
  }).sort(function(a, b) {
    return String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.time || '').localeCompare(String(a.time || ''));
  });
}

function sortedBakeryTasks() {
  return tasks.filter(function(task) {
    return task && sameBakery(task.bakery);
  }).sort(function(a, b) {
    var aDone = (a.status || 'open') === 'done';
    var bDone = (b.status || 'open') === 'done';
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (!aDone) {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
    }
    return timestampValue(b.createdAt) - timestampValue(a.createdAt);
  });
}

function renderIdentity(sitePayload) {
  var mappedTitle = G.getBakeryMapLabel ? G.getBakeryMapLabel(bakeryName) : bakeryName;
  var title = profileDisplayBakeryName(mappedTitle);
  var region = bakeryMeta && bakeryMeta.r || 'Unknown region';
  var ops = bakeryMeta && bakeryMeta.o || 'Unknown ops area';
  var assignments = sitePayload && sitePayload.regionAssignments;
  if (typeof G.setRegionAssignments === 'function') G.setRegionAssignments(assignments);
  var assignment = G.getRegionAssignment ? G.getRegionAssignment(region) : null;
  var coffeeTeam = [
    assignment && assignment.coffeePartner ? 'Partner: ' + assignment.coffeePartner : '',
    assignment && assignment.coffeeTrainer ? 'Trainer: ' + assignment.coffeeTrainer : ''
  ].filter(Boolean).join(' · ') || 'Coffee team unassigned';

  document.title = title + ' — Bakery Profile';
  bakerySwitcherName.textContent = profileDisplayBakeryName(bakeryName);
  bakerySwitcherToggle.title = 'Current bakery: ' + title;
  document.getElementById('bakeryProfileTitle').textContent = title;
  document.getElementById('bakeryProfileRegion').textContent = region;
  document.getElementById('bakeryProfileOps').textContent = 'Ops: ' + ops;
  document.getElementById('bakeryProfileCoffeeTeam').textContent = coffeeTeam;
}

function bakerySelectorSearchText(name) {
  var meta = G.getBakeryMeta ? G.getBakeryMeta(name) : null;
  var label = G.getBakeryMapLabel ? G.getBakeryMapLabel(name) : name;
  return [name, label, meta && meta.r, meta && meta.o]
    .filter(Boolean).join(' ').toLowerCase();
}

function renderBakerySelectorOptions(filterValue) {
  var query = String(filterValue || '').trim().toLowerCase();
  var matchingNames = availableBakeryNames.filter(function(name) {
    return !query || bakerySelectorSearchText(name).indexOf(query) !== -1;
  });
  bakerySwitcherCount.textContent = query
    ? matchingNames.length + ' match' + (matchingNames.length === 1 ? '' : 'es')
    : availableBakeryNames.length + ' available';
  if (!matchingNames.length) {
    bakerySwitcherOptions.innerHTML = '<p class="bakery-profile-switcher__empty">' +
      escapeHtml(query ? 'No matching bakeries.' : 'No other bakeries are available.') + '</p>';
    return;
  }

  bakerySwitcherOptions.innerHTML = matchingNames.map(function(name) {
    var meta = G.getBakeryMeta ? G.getBakeryMeta(name) : null;
    return '<a role="option" class="bakery-profile-switcher__option" href="' +
      escapeHtml(profileUrlFor(name)) + '" aria-label="Open ' + escapeHtml(name) + ' bakery profile">' +
      '<span class="bakery-profile-switcher__option-copy"><strong>' + escapeHtml(name) + '</strong>' +
      '<small>' + escapeHtml(meta && meta.r || 'Bakery profile') + '</small></span>' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>' +
      '</a>';
  }).join('');
}

function renderBakerySelector(reportScopeActive) {
  var names = Object.keys(G.BAKERY_META || {});
  dashboardRecords.forEach(function(record) {
    var name = canonicalName(record && record.b);
    if (name && names.indexOf(name) === -1) names.push(name);
  });

  availableBakeryNames = names.filter(function(name) {
    if (!name || canonicalName(name) === bakeryName) return false;
    if (!reportScopeActive) return true;
    var meta = G.getBakeryMeta ? G.getBakeryMeta(name) : null;
    return !!(meta && currentUserProfile && meta.o === currentUserProfile.opsArea);
  }).sort(function(first, second) {
    return first.localeCompare(second, 'en-GB');
  });

  bakerySwitcherSearch.value = '';
  bakerySwitcherToggle.disabled = !availableBakeryNames.length;
  bakerySwitcherToggle.setAttribute('aria-label', availableBakeryNames.length
    ? 'Current bakery: ' + bakeryName + '. Select another bakery.'
    : 'Current bakery: ' + bakeryName + '. No other bakeries are available.');
  renderBakerySelectorOptions('');
}

function setBakerySelectorOpen(open) {
  var shouldOpen = !!open && !bakerySwitcherToggle.disabled;
  bakerySwitcherMenu.hidden = !shouldOpen;
  bakerySwitcherToggle.setAttribute('aria-expanded', String(shouldOpen));
  bakerySwitcher.classList.toggle('is-open', shouldOpen);
  if (shouldOpen) {
    bakerySwitcherSearch.value = '';
    renderBakerySelectorOptions('');
    window.requestAnimationFrame(function() { bakerySwitcherSearch.focus(); });
  }
}

function renderStats() {
  var latest = latestDashboardRecord();
  var companyRank = companyRankForRecord(latest);
  var bakeryVisits = sortedBakeryVisits();
  var bakeryTasks = sortedBakeryTasks();
  var openTasks = bakeryTasks.filter(function(task) { return (task.status || 'open') !== 'done'; });
  var lastVisit = bakeryVisits[0] || null;
  var stats = [
    {
      eyebrow: 'Benchmark score',
      value: metricValue(latest && latest.ac),
      meta: latest ? deriveBenchmarkBand(latest) : 'No current performance data',
      tone: latest && Number(latest.ac) >= 75 ? 'green' : latest && Number(latest.ac) >= 60 ? 'amber' : 'red'
    },
    {
      eyebrow: 'Company rank',
      value: companyRank ? companyRank.rank + ' of ' + companyRank.total : 'â€”',
      meta: companyRank ? 'Top ' + companyRank.topPercent + '% for ' + latest.m : 'No comparable company ranking',
      tone: 'purple'
    },
    {
      eyebrow: 'Drink + Meal NPS',
      value: metricValue(latest && latest.n),
      meta: latest ? 'From ' + metricValue(latest.v) + ' responses' : 'No current response data',
      tone: 'blue'
    },
    {
      eyebrow: 'Coffee quality',
      value: metricValue(latest && latest.dr, '%'),
      meta: latest ? 'Latest customer measure' : 'No current quality data',
      tone: 'teal'
    },
    {
      eyebrow: 'Last visit',
      value: lastVisit ? formatDate(lastVisit.date, false).replace(/\s\d{4}$/, '') : '—',
      meta: lastVisit ? formatVisitType(lastVisit.type) : 'No visits logged yet',
      tone: 'purple'
    },
    {
      eyebrow: 'Open follow-ups',
      value: String(openTasks.length),
      meta: openTasks.some(function(task) {
        return task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
      }) ? 'Includes overdue actions' : 'Current action list',
      tone: openTasks.length ? 'amber' : 'green'
    }
  ];

  document.getElementById('bakeryProfileAsOf').textContent = latest && latest.m
    ? latest.m
    : 'No performance period';
  document.getElementById('bakeryProfileStats').innerHTML = stats.map(function(stat) {
    return '<article class="bakery-profile-stat bakery-profile-stat--' + stat.tone + '">' +
      '<span>' + escapeHtml(stat.eyebrow) + '</span>' +
      '<strong>' + escapeHtml(stat.value) + '</strong>' +
      '<small>' + escapeHtml(stat.meta) + '</small>' +
      '</article>';
  }).join('');
}

function renderPerformanceChart() {
  var canvas = document.getElementById('bakeryPerformanceChart');
  var empty = document.getElementById('bakeryPerformanceEmpty');
  if (!canvas || !empty) return;

  var bakeryRecordsByMonth = {};
  dashboardRecords.forEach(function(record) {
    if (!record || !sameBakery(record.b) || !record.m) return;
    bakeryRecordsByMonth[record.m] = record;
  });

  var months = Object.keys(bakeryRecordsByMonth).sort(function(first, second) {
    return monthSortKey(first) - monthSortKey(second);
  });
  var bakeryScores = months.map(function(month) {
    var record = bakeryRecordsByMonth[month];
    if (!record || record.noData || record.incompletePeriod ||
        record.ac === null || record.ac === undefined || isNaN(Number(record.ac))) return null;
    return Number(record.ac);
  });
  var scoredPeriods = bakeryScores.filter(function(score) { return score !== null; }).length;

  if (!months.length || !scoredPeriods) {
    if (typeof G.destroyChart === 'function') G.destroyChart('bakeryPerformanceChart');
    canvas.hidden = true;
    empty.hidden = false;
    empty.textContent = 'No score history is available for this bakery yet.';
    return;
  }

  if (typeof window.Chart === 'undefined' || typeof G.makeChart !== 'function') {
    canvas.hidden = true;
    empty.hidden = false;
    empty.textContent = 'The score history chart could not be loaded.';
    return;
  }

  var companyAverage = months.map(function(month) {
    var total = 0;
    var count = 0;
    dashboardRecords.forEach(function(record) {
      if (!record || record.m !== month || record.noData || record.incompletePeriod ||
          record.ac === null || record.ac === undefined || isNaN(Number(record.ac))) return;
      total += Number(record.ac);
      count++;
    });
    return count ? total / count : null;
  });

  canvas.hidden = false;
  empty.hidden = true;
  G.makeChart('bakeryPerformanceChart', {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: bakeryName,
          data: bakeryScores,
          borderColor: 'rgba(166, 49, 41, 1)',
          backgroundColor: 'rgba(166, 49, 41, 0.10)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          spanGaps: false
        },
        {
          label: 'Company average',
          data: companyAverage,
          borderColor: 'rgba(146, 137, 120, 0.62)',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 1.5,
          pointHoverRadius: 4,
          borderWidth: 1.75,
          borderDash: [6, 4],
          spanGaps: false
        },
        {
          label: 'Target Score (' + TARGET_SCORE + ')',
          data: months.map(function() { return TARGET_SCORE; }),
          borderColor: 'rgba(29, 158, 92, 0.82)',
          backgroundColor: 'transparent',
          fill: false,
          tension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          borderWidth: 1.75,
          borderDash: [7, 5]
        }
      ]
    },
    options: {
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 10 },
            boxWidth: 10,
            boxHeight: 10,
            padding: 16
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              if (context.raw === null || context.raw === undefined) {
                return context.dataset.label + ': No score';
              }
              return context.dataset.label + ': ' + Math.round(Number(context.raw) * 10) / 10;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0,
          max: 100,
          ticks: { font: { size: 9 } },
          title: {
            display: true,
            text: 'Benchmark score',
            font: { size: 10, weight: '600' }
          }
        },
        x: {
          ticks: {
            autoSkip: true,
            maxTicksLimit: 16,
            maxRotation: 0,
            font: { size: 9 }
          }
        }
      },
      maintainAspectRatio: false
    }
  });
}

function competitionCacheKey(ll) {
  return 'gails-nearby-competition-v2:' +
    Number(ll[0]).toFixed(4) + ':' + Number(ll[1]).toFixed(4) + ':' +
    COMPETITION_RADIUS_METRES;
}

function readCompetitionCache(ll) {
  try {
    var cached = JSON.parse(localStorage.getItem(competitionCacheKey(ll)) || 'null');
    if (!cached || !Array.isArray(cached.places) ||
        Date.now() - Number(cached.savedAt || 0) > COMPETITION_CACHE_TTL) return null;
    return cached.places;
  } catch (error) {
    return null;
  }
}

function writeCompetitionCache(ll, places) {
  try {
    localStorage.setItem(competitionCacheKey(ll), JSON.stringify({
      savedAt: Date.now(),
      places: places
    }));
  } catch (error) {
    // The live result is still useful when storage is unavailable.
  }
}

function distanceMetres(origin, target) {
  var earthRadius = 6371000;
  var toRadians = function(value) { return Number(value) * Math.PI / 180; };
  var latDelta = toRadians(target[0] - origin[0]);
  var lonDelta = toRadians(target[1] - origin[1]);
  var originLat = toRadians(origin[0]);
  var targetLat = toRadians(target[0]);
  var a = Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(originLat) * Math.cos(targetLat) *
    Math.sin(lonDelta / 2) * Math.sin(lonDelta / 2);
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalisedPlaceName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function competitionCategory(tags) {
  if (tags.shop === 'bakery' && tags.amenity === 'cafe') return 'Bakery & café';
  if (tags.shop === 'bakery') return 'Bakery';
  if (tags.cuisine === 'coffee_shop' || tags.cuisine === 'coffee') return 'Coffee shop';
  return 'Café';
}

function fsaCompetitionCategory(name) {
  var normalised = normalisedPlaceName(name);
  if (/greggs|bakery|patisserie|pastry/.test(normalised)) return 'Bakery';
  if (/coffee|costa|starbucks|caffenero|timhortons|blacksheep/.test(normalised)) return 'Coffee shop';
  return 'Café';
}

function competitionAddress(tags) {
  var street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return [street, tags['addr:postcode']].filter(Boolean).join(', ');
}

function fsaCompetitionAddress(establishment) {
  return [
    establishment.AddressLine1,
    establishment.AddressLine2,
    establishment.AddressLine3,
    establishment.PostCode
  ].map(function(part) { return String(part || '').trim(); }).filter(Boolean).join(', ');
}

function normaliseCompetitionElements(elements, origin) {
  var seen = {};
  return (Array.isArray(elements) ? elements : []).map(function(element) {
    var tags = element && element.tags || {};
    var lat = Number(element && (element.lat != null ? element.lat : element.center && element.center.lat));
    var lon = Number(element && (element.lon != null ? element.lon : element.center && element.center.lon));
    var name = String(tags.name || tags.brand || tags.operator || '').trim();
    if (!name || !isFinite(lat) || !isFinite(lon)) return null;

    var operatorName = normalisedPlaceName([name, tags.brand, tags.operator].filter(Boolean).join(' '));
    var distance = distanceMetres(origin, [lat, lon]);
    if (operatorName.indexOf('gails') !== -1 || distance < 25) return null;

    var key = normalisedPlaceName(name) + ':' + lat.toFixed(4) + ':' + lon.toFixed(4);
    if (seen[key]) return null;
    seen[key] = true;
    return {
      name: name,
      category: competitionCategory(tags),
      distance: distance,
      lat: lat,
      lon: lon,
      address: competitionAddress(tags),
      openingHours: String(tags.opening_hours || '').trim(),
      source: 'OpenStreetMap'
    };
  }).filter(Boolean).sort(function(a, b) {
    return a.distance - b.distance || a.name.localeCompare(b.name);
  });
}

function normaliseFsaCompetitionElements(establishments, origin) {
  var namePattern = /bakery|cafe|coffee|patisserie|tearoom|greggs|costa|starbucks|caffenero|pretamanger|paul|oleandsteen|timhortons|blacksheep|coffee1/;
  var typePattern = /restaurant|cafe|canteen|takeaway|sandwich|retailer|catering/;
  return (Array.isArray(establishments) ? establishments : []).map(function(establishment) {
    var name = String(establishment && establishment.BusinessName || '').trim();
    var type = String(establishment && establishment.BusinessType || '').toLowerCase();
    var normalised = normalisedPlaceName(name);
    var geocode = establishment && establishment.geocode || {};
    var lat = Number(geocode.latitude);
    var lon = Number(geocode.longitude);
    if (!name || !isFinite(lat) || !isFinite(lon) || !typePattern.test(type) ||
        !namePattern.test(normalised) || normalised.indexOf('gails') !== -1) return null;
    return {
      name: name.replace(/\s+(PLC|Ltd)$/i, ''),
      category: fsaCompetitionCategory(name),
      distance: distanceMetres(origin, [lat, lon]),
      lat: lat,
      lon: lon,
      address: fsaCompetitionAddress(establishment),
      openingHours: '',
      source: 'Food Standards Agency'
    };
  }).filter(Boolean);
}

function sameCompetitionPlace(first, second) {
  var firstName = normalisedPlaceName(first && first.name);
  var secondName = normalisedPlaceName(second && second.name);
  if (!firstName || !secondName) return false;
  var relatedName = firstName === secondName ||
    (firstName.length >= 4 && secondName.indexOf(firstName) !== -1) ||
    (secondName.length >= 4 && firstName.indexOf(secondName) !== -1);
  return relatedName && distanceMetres([first.lat, first.lon], [second.lat, second.lon]) < 150;
}

function applyCompetitionCorrections(places) {
  var correction = COMPETITION_CORRECTIONS[canonicalName(bakeryName)];
  if (!correction) return places;
  var removedNames = (correction.removeNames || []).map(normalisedPlaceName);
  return places.filter(function(place) {
    return removedNames.indexOf(normalisedPlaceName(place.name)) === -1;
  });
}

function mergeCompetitionSources(osmPlaces, fsaPlaces) {
  var combined = fsaPlaces.slice();
  osmPlaces.forEach(function(place) {
    var placeName = normalisedPlaceName(place.name);
    var currentSameBrand = fsaPlaces.some(function(currentPlace) {
      return sameCompetitionPlace(currentPlace, place);
    });
    var currentGreggsAtLocation = placeName === 'starbucks' && !currentSameBrand &&
      fsaPlaces.some(function(currentPlace) {
        return normalisedPlaceName(currentPlace.name).indexOf('greggs') !== -1 &&
          distanceMetres([currentPlace.lat, currentPlace.lon], [place.lat, place.lon]) < 150;
      });
    if (currentGreggsAtLocation) return;
    if (!combined.some(function(existing) { return sameCompetitionPlace(existing, place); })) {
      combined.push(place);
    }
  });
  return applyCompetitionCorrections(combined).sort(function(a, b) {
    return a.distance - b.distance || a.name.localeCompare(b.name);
  });
}

function competitionQuery(ll) {
  return '[out:json][timeout:20];(' +
    'nwr(around:' + COMPETITION_RADIUS_METRES + ',' + Number(ll[0]) + ',' + Number(ll[1]) +
      ')["shop"="bakery"];' +
    'nwr(around:' + COMPETITION_RADIUS_METRES + ',' + Number(ll[0]) + ',' + Number(ll[1]) +
      ')["amenity"="cafe"];' +
    'nwr(around:' + COMPETITION_RADIUS_METRES + ',' + Number(ll[0]) + ',' + Number(ll[1]) +
      ')["name"~"Greggs","i"];' +
    ');out center tags;';
}

async function fetchOverpass(endpoint, query) {
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 10000);
  try {
    var response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
      },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Nearby search returned ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchOpenStreetMapCompetition(ll) {
  var query = competitionQuery(ll);
  var lastError = null;
  for (var index = 0; index < OVERPASS_ENDPOINTS.length; index += 1) {
    try {
      var payload = await fetchOverpass(OVERPASS_ENDPOINTS[index], query);
      return normaliseCompetitionElements(payload && payload.elements, ll);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Nearby search is unavailable');
}

async function fetchFsaCompetition(ll) {
  var miles = (COMPETITION_RADIUS_METRES / 1609.344).toFixed(4);
  var url = FSA_ESTABLISHMENTS_ENDPOINT +
    '?longitude=' + encodeURIComponent(Number(ll[1])) +
    '&latitude=' + encodeURIComponent(Number(ll[0])) +
    '&maxDistanceLimit=' + encodeURIComponent(miles) +
    '&sortOptionKey=distance&pageNumber=1&pageSize=100';
  var controller = new AbortController();
  var timeout = setTimeout(function() { controller.abort(); }, 10000);
  try {
    var response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'x-api-version': '2'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error('Food business search returned ' + response.status);
    var payload = await response.json();
    return normaliseFsaCompetitionElements(payload && payload.establishments, ll);
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNearbyCompetition(ll) {
  var results = await Promise.allSettled([
    fetchOpenStreetMapCompetition(ll),
    fetchFsaCompetition(ll)
  ]);
  var osmPlaces = results[0].status === 'fulfilled' ? results[0].value : [];
  var fsaPlaces = results[1].status === 'fulfilled' ? results[1].value : [];
  if (results.every(function(result) { return result.status === 'rejected'; })) {
    throw results[0].reason || results[1].reason || new Error('Nearby search is unavailable');
  }
  return mergeCompetitionSources(osmPlaces, fsaPlaces);
}

function formatCompetitionDistance(distance) {
  if (distance < 1000) return Math.max(10, Math.round(distance / 10) * 10) + ' m away';
  return (distance / 1000).toFixed(1) + ' km away';
}

function renderCompetitionState(state, message) {
  if (!competitionList) return;
  competitionList.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  if (competitionStatusTag) competitionStatusTag.textContent =
    state === 'loading' ? 'Searching...' : state === 'error' ? 'Unavailable' : 'No results';
  if (competitionResultCount) competitionResultCount.textContent =
    state === 'loading' ? 'Searching...' : state === 'error' ? 'Try again' : '0 found';

  var retry = state === 'error'
    ? '<button type="button" class="bakery-profile-small-btn" data-competition-retry>Try again</button>'
    : '';
  competitionList.innerHTML = '<div class="bakery-competition-empty bakery-competition-empty--' +
    escapeHtml(state) + '">' +
    (state === 'loading'
      ? '<span class="bakery-competition-loader" aria-hidden="true"></span>'
      : '<span class="bakery-competition-empty__icon" aria-hidden="true">⌖</span>') +
    '<h3>' + escapeHtml(state === 'loading' ? 'Finding nearby places...' :
      state === 'error' ? 'Nearby search could not load.' : 'No nearby competitors found.') + '</h3>' +
    '<p>' + escapeHtml(message) + '</p>' + retry + '</div>';

  var retryButton = competitionList.querySelector('[data-competition-retry]');
  if (retryButton) retryButton.addEventListener('click', function() {
    var ll = bakeryMeta && Array.isArray(bakeryMeta.ll) ? bakeryMeta.ll : null;
    if (ll) loadNearbyCompetition(ll, true);
  });
}

function renderCompetitionPlaces(places) {
  if (!competitionList) return;
  if (!places.length) {
    renderCompetitionState('empty', 'No mapped bakeries or cafés were found within 1 km.');
    return;
  }

  var visiblePlaces = places.slice(0, COMPETITION_RESULT_LIMIT);
  competitionList.setAttribute('aria-busy', 'false');
  if (competitionStatusTag) competitionStatusTag.textContent = places.length + ' found';
  if (competitionResultCount) competitionResultCount.textContent = places.length > visiblePlaces.length
    ? visiblePlaces.length + ' nearest of ' + places.length
    : places.length + ' found';
  competitionList.innerHTML = visiblePlaces.map(function(place, index) {
    var coordinate = place.lat + ',' + place.lon;
    var mapQuery = [place.name, place.address, coordinate].filter(Boolean).join(', ');
    var viewUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery);
    var directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(mapQuery) + '&travelmode=walking';
    var details = [place.address, place.openingHours].filter(Boolean);
    return '<article class="bakery-competition-item">' +
      '<span class="bakery-competition-item__rank" aria-hidden="true">' + (index + 1) + '</span>' +
      '<div class="bakery-competition-item__body">' +
      '<div class="bakery-competition-item__title"><strong>' + escapeHtml(place.name) + '</strong>' +
      '<span>' + escapeHtml(formatCompetitionDistance(place.distance)) + '</span></div>' +
      '<p><span>' + escapeHtml(place.category) + '</span>' +
      (details.length ? ' · ' + escapeHtml(details.join(' · ')) : '') + '</p></div>' +
      '<div class="bakery-competition-item__actions">' +
      '<a href="' + viewUrl + '" target="_blank" rel="noopener noreferrer">View</a>' +
      '<a href="' + directionsUrl + '" target="_blank" rel="noopener noreferrer">Directions ↗</a>' +
      '</div></article>';
  }).join('');
}

async function loadNearbyCompetition(ll, forceRefresh) {
  renderCompetitionState('loading', 'Searching within 1 km of this bakery.');
  var cached = forceRefresh ? null : readCompetitionCache(ll);
  if (cached) {
    renderCompetitionPlaces(cached);
    return;
  }

  try {
    var places = await fetchNearbyCompetition(ll);
    writeCompetitionCache(ll, places);
    renderCompetitionPlaces(places);
  } catch (error) {
    renderCompetitionState('error', 'Check your connection, then try the search again.');
  }
}

function renderMap() {
  var mapElement = document.getElementById('bakeryProfileMap');
  var status = document.getElementById('bakeryProfileMapStatus');
  var ll = bakeryMeta && Array.isArray(bakeryMeta.ll) ? bakeryMeta.ll : null;
  var directionsLink = document.getElementById('bakeryDirectionsLink');
  if (!ll || ll.length < 2) {
    mapElement.innerHTML = '<div class="bakery-profile-map__empty">No saved coordinates are available for this bakery.</div>';
    status.textContent = 'Add coordinates in the Site Directory to activate this map.';
    if (directionsLink) directionsLink.hidden = true;
    renderCompetitionState('empty', 'Add bakery coordinates to search the surrounding area.');
    return;
  }

  var destination = Number(ll[0]) + ',' + Number(ll[1]);
  var iframe = document.createElement('iframe');
  iframe.title = (G.getBakeryMapLabel ? G.getBakeryMapLabel(bakeryName) : bakeryName) + ' on Google Maps';
  iframe.loading = 'lazy';
  iframe.referrerPolicy = 'strict-origin-when-cross-origin';
  iframe.allowFullscreen = true;
  iframe.src = 'https://maps.google.com/maps?q=' + encodeURIComponent(destination) + '&z=16&output=embed';
  mapElement.replaceChildren(iframe);

  if (directionsLink) {
    directionsLink.href = 'https://www.google.com/maps/dir/?api=1&destination=' +
      encodeURIComponent(destination) + '&travelmode=driving';
    directionsLink.hidden = false;
  }
  status.textContent = 'Open Directions to route from your current location in Google Maps.';
  loadNearbyCompetition([Number(ll[0]), Number(ll[1])]);
}

function renderVisits() {
  var container = document.getElementById('bakeryVisitLog');
  var count = document.getElementById('bakeryVisitCount');
  var bakeryVisits = sortedBakeryVisits();
  count.textContent = bakeryVisits.length + ' visit' + (bakeryVisits.length === 1 ? '' : 's');
  if (!bakeryVisits.length) {
    container.innerHTML = '<div class="bakery-profile-empty"><strong>No visits logged yet.</strong>' +
      '<span>Routine visits, CQVs, and opening visits will appear here.</span></div>';
    renderStats();
    return;
  }

  container.innerHTML = bakeryVisits.map(function(visit) {
    var score = visit.score !== null && visit.score !== undefined
      ? String(visit.score) + (visit.scoreMax ? '/' + visit.scoreMax : '')
      : '';
    var visitor = visit.coffeePartner || visit.meta && visit.meta.updatedBy || '';
    return '<article class="bakery-activity-row">' +
      '<div class="bakery-activity-row__marker" aria-hidden="true"></div>' +
      '<div class="bakery-activity-row__body">' +
      '<div class="bakery-activity-row__top"><strong>' + escapeHtml(formatVisitType(visit.type)) + '</strong>' +
      (score ? '<span class="bakery-profile-tag">' + escapeHtml(score) + '</span>' : '') + '</div>' +
      '<p>' + escapeHtml(formatDate(visit.date, false)) + (visit.time ? ' · ' + escapeHtml(visit.time) : '') + '</p>' +
      (visitor ? '<small>' + escapeHtml(visitor) + '</small>' : '') +
      '</div></article>';
  }).join('');
  renderStats();
}

function dueLabel(task) {
  if (!task.dueDate) return '';
  var today = new Date().toISOString().slice(0, 10);
  if ((task.status || 'open') !== 'done' && task.dueDate < today) return 'Overdue · ' + formatDate(task.dueDate, false);
  return 'Due ' + formatDate(task.dueDate, false);
}

function renderTasks() {
  var container = document.getElementById('bakeryTaskList');
  var bakeryTasks = sortedBakeryTasks();
  if (!bakeryTasks.length) {
    container.innerHTML = '<div class="bakery-profile-empty"><strong>No follow-up tasks.</strong>' +
      '<span>Add the next action for this bakery when one is agreed.</span>' +
      (canEdit ? '<button type="button" class="bakery-profile-small-btn" data-task-add>+ Add task</button>' : '') +
      '</div>';
    renderStats();
    return;
  }

  container.innerHTML = bakeryTasks.map(function(task) {
    var done = (task.status || 'open') === 'done';
    var priority = ['low', 'medium', 'high'].indexOf(task.priority) !== -1 ? task.priority : '';
    return '<article class="bakery-task-row' + (done ? ' is-done' : '') + '">' +
      (canEdit
        ? '<button type="button" class="bakery-task-row__check" data-task-toggle="' + escapeHtml(task.id) +
          '" aria-label="' + (done ? 'Mark task as open' : 'Mark task as complete') +
          '" aria-pressed="' + done + '">' + (done ? '✓' : '') + '</button>'
        : '<span class="bakery-task-row__check bakery-task-row__check--static">' + (done ? '✓' : '') + '</span>') +
      '<div class="bakery-task-row__body">' +
      '<div><strong>' + escapeHtml(task.title || 'Untitled task') + '</strong>' +
      (priority ? '<span class="bakery-priority bakery-priority--' + priority + '">' + escapeHtml(priority) + '</span>' : '') +
      '</div>' +
      (task.detail ? '<p>' + escapeHtml(task.detail) + '</p>' : '') +
      '<small>' + escapeHtml(dueLabel(task) || (done ? 'Completed' : 'No due date')) + '</small>' +
      '</div></article>';
  }).join('');
  renderStats();
}

function noteAuthor(note) {
  if (note && note.createdBy && typeof note.createdBy === 'object') {
    return note.createdBy.name || note.createdBy.email || 'Coffee Team';
  }
  return note && (note.authorName || note.createdBy) || 'Coffee Team';
}

function isNoteAuthor(note) {
  return !!(currentUser && note && note.createdBy && typeof note.createdBy === 'object' &&
    note.createdBy.uid === currentUser.uid);
}

/* A note belongs to whoever wrote it: only its author can revise it, with
   admins able to step in on any note. Removing one is admin-only. */
function canEditNote(note) {
  if (!currentUser) return false;
  if (isAdmin) return true;
  return canEdit && isNoteAuthor(note);
}

function canDeleteNote() {
  return !!currentUser && isAdmin;
}

function renderNotes() {
  var container = document.getElementById('bakeryNotesList');
  var noteList = Object.keys(notes || {}).map(function(id) {
    return Object.assign({ id: id }, notes[id]);
  }).sort(function(a, b) {
    return timestampValue(b.createdAt) - timestampValue(a.createdAt);
  });

  if (!noteList.length) {
    container.innerHTML = '<div class="bakery-profile-empty bakery-profile-empty--notes">' +
      '<strong>No historical notes yet.</strong><span>The first coffee-team update will start the shared timeline.</span></div>';
    return;
  }

  container.innerHTML = noteList.map(function(note) {
    var author = noteAuthor(note);
    var edited = note.updatedAt && timestampValue(note.updatedAt) !== timestampValue(note.createdAt);
    var editMeta = edited
      ? ' · Edited ' + formatDate(note.updatedAt, true) +
        (note.updatedBy && note.updatedBy.name ? ' by ' + note.updatedBy.name : '')
      : '';
    var actions = '';
    if (canEditNote(note)) {
      actions += '<button type="button" class="bakery-note-entry__edit" data-note-edit="' +
        escapeHtml(note.id) + '">Edit</button>';
    }
    if (canDeleteNote()) {
      actions += '<button type="button" class="bakery-note-entry__delete" data-note-delete="' +
        escapeHtml(note.id) + '">Delete</button>';
    }
    return '<article class="bakery-note-entry">' +
      '<div class="bakery-note-avatar" aria-hidden="true">' + escapeHtml(initials(author)) + '</div>' +
      '<div class="bakery-note-entry__body">' +
      '<div class="bakery-note-entry__head"><div><strong>' + escapeHtml(author) + '</strong>' +
      '<span>' + escapeHtml(formatDate(note.createdAt, true) + editMeta) + '</span></div>' +
      (actions ? '<div class="bakery-note-entry__actions">' + actions + '</div>' : '') +
      '</div>' +
      '<p>' + escapeHtml(note.body || '').replace(/\n/g, '<br>') + '</p>' +
      '</div></article>';
  }).join('');

  // Someone else may have removed the note being edited or confirmed for deletion.
  var editId = noteForm.getAttribute('data-edit-id');
  if (editId && !notes[editId]) resetNoteEditor();
  if (noteDeleteId && !notes[noteDeleteId]) closeNoteDelete();
}

function setModalOpen(modal, open) {
  modal.hidden = !open;
  document.body.classList.toggle('bakery-profile-modal-open',
    !taskModal.hidden || !noteDeleteModal.hidden);
}

function restoreFocus(returnTo, fallback) {
  if (!returnTo || !document.body.contains(returnTo) || returnTo.hidden) returnTo = fallback;
  if (returnTo && typeof returnTo.focus === 'function') returnTo.focus();
}

function trapModalFocus(modal, event) {
  if (event.key !== 'Tab') return;
  var focusable = Array.prototype.filter.call(
    modal.querySelectorAll('button, input, select, textarea, [href]'),
    function(element) { return !element.disabled && element.offsetParent !== null; }
  );
  if (!focusable.length) return;
  var first = focusable[0];
  var last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openTaskForm() {
  if (!canEdit || !taskModal.hidden) return;
  taskForm.reset();
  setMessage(taskMessage, '', '');
  taskModalBakery.textContent = profileDisplayBakeryName(bakeryName) || 'this bakery';
  taskModalReturnFocus = document.activeElement;
  setModalOpen(taskModal, true);
  taskAddToggle.setAttribute('aria-expanded', 'true');
  document.getElementById('bakeryTaskTitle').focus();
}

function closeTaskForm() {
  if (taskModal.hidden) return;
  setModalOpen(taskModal, false);
  taskAddToggle.setAttribute('aria-expanded', 'false');
  taskForm.reset();
  setMessage(taskMessage, '', '');
  var returnTo = taskModalReturnFocus;
  taskModalReturnFocus = null;
  restoreFocus(returnTo, canEdit ? taskAddToggle : null);
}

/* Dismissing is the user's choice; saving in progress keeps the dialog open. */
function dismissTaskForm() {
  if (taskSaving) return;
  closeTaskForm();
}

function openNoteDelete(id) {
  var note = notes[id];
  if (!note || !canDeleteNote() || !noteDeleteModal.hidden) return;
  noteDeleteId = id;
  noteDeleteAuthor.textContent = noteAuthor(note);
  noteDeletePreview.textContent = note.body || '';
  setMessage(noteDeleteMessage, '', '');
  noteDeleteReturnFocus = document.activeElement;
  setModalOpen(noteDeleteModal, true);
  noteDeleteCancel.focus();
}

function closeNoteDelete() {
  if (noteDeleteModal.hidden) return;
  setModalOpen(noteDeleteModal, false);
  noteDeleteId = null;
  setMessage(noteDeleteMessage, '', '');
  var returnTo = noteDeleteReturnFocus;
  noteDeleteReturnFocus = null;
  restoreFocus(returnTo, noteForm.hidden ? null : noteBody);
}

function dismissNoteDelete() {
  if (noteDeleting) return;
  closeNoteDelete();
}

function resetNoteEditor() {
  noteForm.removeAttribute('data-edit-id');
  noteBody.value = '';
  noteSubmit.textContent = 'Add note';
  noteCancelEdit.hidden = true;
  notePostingAs.textContent = notePostingAsDefault;
  setMessage(noteMessage, '', '');
}

function showGuardError(title, message) {
  guard.innerHTML = '<div class="admin-page-guard__inner">' +
    '<p class="login-card__form-eyebrow">Bakery profile unavailable</p>' +
    '<h1 class="admin-page-guard__title">' + escapeHtml(title) + '</h1>' +
    '<p>' + escapeHtml(message) + '</p>' +
    '<a class="btn" href="' + escapeHtml(profileReturnContext.url) + '">Back To ' +
    escapeHtml(profileReturnContext.label) + '</a></div>';
}

function startLiveData() {
  visitsUnsubscribe = onValue(ref(db, 'routineVisits'), function(snapshot) {
    var value = snapshot.exists() ? snapshot.val() : {};
    visits = Object.keys(value).map(function(id) { return Object.assign({ id: id }, value[id]); });
    renderVisits();
  }, function(error) {
    console.error('Could not load visits:', error);
    document.getElementById('bakeryVisitLog').innerHTML =
      '<div class="bakery-profile-empty"><strong>Visit log unavailable.</strong><span>Try refreshing the page.</span></div>';
  });

  tasksUnsubscribe = onValue(ref(db, 'followUpActions'), function(snapshot) {
    var value = snapshot.exists() ? snapshot.val() : {};
    tasks = Object.keys(value).map(function(id) { return Object.assign({ id: id }, value[id]); });
    renderTasks();
  }, function(error) {
    console.error('Could not load follow-up tasks:', error);
    document.getElementById('bakeryTaskList').innerHTML =
      '<div class="bakery-profile-empty"><strong>Follow-up tasks unavailable.</strong><span>Try refreshing the page.</span></div>';
  });

  notesUnsubscribe = onValue(ref(db, 'bakeryNotes/' + bakeryPathKey(bakeryName)), function(snapshot) {
    notes = snapshot.exists() ? snapshot.val() : {};
    renderNotes();
  }, function(error) {
    console.error('Could not load bakery notes:', error);
    document.getElementById('bakeryNotesList').innerHTML =
      '<div class="bakery-profile-empty bakery-profile-empty--notes"><strong>Historical notes unavailable.</strong>' +
      '<span>Try refreshing the page.</span></div>';
  });
}

async function loadBakeryProfile(user) {
  var requestedName = new URLSearchParams(window.location.search).get('bakery');
  if (!requestedName) {
    showGuardError('No bakery was selected.', 'Choose a bakery name from the Bakery Directory to open its profile.');
    return;
  }

  var adminRef = ref(db, 'admins/' + user.uid);
  var userRef = ref(db, 'users/' + user.uid);
  var initial = await Promise.all([
    get(adminRef),
    get(userRef),
    get(ref(db, 'portalData/siteMeta')),
    get(ref(db, 'dashboardData')),
    get(ref(db, 'appSettings/reportVisibility'))
  ]);

  isAdmin = initial[0].exists() && initial[0].val() === true;
  currentUserProfile = initial[1].exists() ? initial[1].val() : null;
  if (currentUserProfile && currentUserProfile.role === 'admin') isAdmin = true;
  if (!isAdmin && !currentUserProfile) {
    await signOut(auth);
    window.location.replace('index.html');
    return;
  }

  var sitePayload = initial[2].exists() ? initial[2].val() : null;
  var siteEntries = sitePayload && sitePayload.entries ? sitePayload.entries : sitePayload;
  if (typeof G.setBakeryMeta === 'function') G.setBakeryMeta(siteEntries);
  bakeryName = canonicalName(requestedName);
  bakeryMeta = G.getBakeryMeta ? G.getBakeryMeta(bakeryName) : siteEntries && siteEntries[bakeryName];

  var dashboardData = initial[3].exists() ? initial[3].val() : {};
  dashboardRecords = Array.isArray(dashboardData.records)
    ? dashboardData.records
    : Object.values(dashboardData.records || {});

  var existsInData = dashboardRecords.some(function(record) { return record && sameBakery(record.b); });
  if (!bakeryMeta && !existsInData) {
    showGuardError('Bakery not found.', 'This bakery is no longer available in the shared directory.');
    return;
  }
  if (!bakeryMeta) bakeryMeta = { r: 'Unknown', o: 'Unknown', ll: null };

  var roleId = isAdmin ? 'admin' : currentUserProfile.role || 'viewer';
  var customRole = null;
  if (!BUILTIN_ROLES[roleId]) {
    var roleSnapshot = await get(ref(db, 'roles/' + roleId));
    customRole = roleSnapshot.exists() ? roleSnapshot.val() : null;
  }
  var permissions = resolveRolePermissions(roleId, customRole);
  if (!permissions.tabs['visit-log']) {
    showGuardError('You do not have access to Bakery Reports.',
      'Ask an administrator if you need access to bakery profiles.');
    return;
  }

  var reportSetting = initial[4].exists() ? initial[4].val() : null;
  var reportScopeActive = !isAdmin && !!(reportSetting && reportSetting.enabled) &&
    !!(currentUserProfile && currentUserProfile.opsArea);
  if (reportScopeActive && bakeryMeta.o !== currentUserProfile.opsArea) {
    showGuardError('This bakery is outside your assigned area.',
      'Choose one of your bakeries from the Bakery Directory.');
    return;
  }

  currentUser = user;
  canEdit = permissions.actions.logVisits === true;
  var displayName = profileDisplayName(user, currentUserProfile);
  notePostingAsDefault = 'Posting as ' + displayName;
  document.getElementById('bakeryNoteAvatar').textContent = initials(displayName);
  notePostingAs.textContent = notePostingAsDefault;
  taskAddToggle.hidden = !canEdit;
  // Admins keep the composer so they can revise any note, even without logVisits.
  noteForm.hidden = !canEdit && !isAdmin;

  renderIdentity(sitePayload);
  renderBakerySelector(reportScopeActive);
  renderStats();
  renderMap();
  startLiveData();
  guard.style.display = 'none';
  page.hidden = false;
  window.requestAnimationFrame(renderPerformanceChart);
}

bakerySwitcherToggle.addEventListener('click', function() {
  setBakerySelectorOpen(bakerySwitcherMenu.hidden);
});

bakerySwitcherSearch.addEventListener('input', function() {
  renderBakerySelectorOptions(bakerySwitcherSearch.value);
});

bakerySwitcherMenu.addEventListener('keydown', function(event) {
  var options = Array.from(bakerySwitcherOptions.querySelectorAll('.bakery-profile-switcher__option'));
  var currentIndex = options.indexOf(document.activeElement);
  if (event.key === 'Escape') {
    event.preventDefault();
    setBakerySelectorOpen(false);
    bakerySwitcherToggle.focus();
    return;
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    (options[currentIndex + 1] || options[0] || bakerySwitcherSearch).focus();
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    (options[currentIndex - 1] || bakerySwitcherSearch).focus();
  }
});

document.addEventListener('click', function(event) {
  if (!bakerySwitcher.contains(event.target)) setBakerySelectorOpen(false);
});

taskAddToggle.addEventListener('click', openTaskForm);

[taskCancel, taskModalClose, taskModalBackdrop].forEach(function(control) {
  control.addEventListener('click', dismissTaskForm);
});

[noteDeleteCancel, noteDeleteClose, noteDeleteBackdrop].forEach(function(control) {
  control.addEventListener('click', dismissNoteDelete);
});

document.addEventListener('keydown', function(event) {
  var openModal = !taskModal.hidden ? taskModal : (!noteDeleteModal.hidden ? noteDeleteModal : null);
  if (!openModal) return;
  if (event.key === 'Escape') {
    if (openModal === taskModal) dismissTaskForm();
    else dismissNoteDelete();
    return;
  }
  trapModalFocus(openModal, event);
});

taskForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  if (!currentUser || !canEdit) return;
  var title = document.getElementById('bakeryTaskTitle').value.trim();
  if (!title) {
    setMessage(taskMessage, 'error', 'Enter a task before saving.');
    return;
  }

  taskSaving = true;
  setBusy(taskSubmit, true, 'Adding…', 'Add task');
  try {
    var who = currentUser.email || currentUser.uid;
    var taskRef = push(ref(db, 'followUpActions'));
    await set(taskRef, {
      bakery: bakeryName,
      title: title,
      detail: document.getElementById('bakeryTaskDetail').value.trim(),
      dueDate: document.getElementById('bakeryTaskDueDate').value || null,
      priority: document.getElementById('bakeryTaskPriority').value || 'none',
      status: 'open',
      sourceVisitId: null,
      completedAt: null,
      completedBy: null,
      createdAt: new Date().toISOString(),
      createdBy: who,
      meta: {
        updatedAt: new Date().toISOString(),
        updatedBy: who
      }
    });
    closeTaskForm();
  } catch (error) {
    console.error('Could not add task:', error);
    setMessage(taskMessage, 'error', error.message || 'The task could not be added.');
  } finally {
    taskSaving = false;
    setBusy(taskSubmit, false, 'Adding…', 'Add task');
  }
});

document.getElementById('bakeryTaskList').addEventListener('click', async function(event) {
  if (event.target.closest('[data-task-add]')) {
    openTaskForm();
    return;
  }
  var button = event.target.closest('[data-task-toggle]');
  if (!button || !currentUser || !canEdit) return;
  var task = tasks.find(function(item) { return item.id === button.getAttribute('data-task-toggle'); });
  if (!task) return;
  var done = (task.status || 'open') !== 'done';
  var now = new Date().toISOString();
  button.disabled = true;
  try {
    await update(ref(db, 'followUpActions/' + task.id), {
      status: done ? 'done' : 'open',
      completedAt: done ? now : null,
      completedBy: done ? (currentUser.email || currentUser.uid) : null,
      'meta/updatedAt': now,
      'meta/updatedBy': currentUser.email || currentUser.uid
    });
  } catch (error) {
    console.error('Could not update task:', error);
    button.disabled = false;
  }
});

noteForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  if (!currentUser) return;
  var editId = noteForm.getAttribute('data-edit-id');
  if (editId ? !canEditNote(notes[editId]) : !(canEdit || isAdmin)) return;
  var body = noteBody.value.trim();
  if (!body) {
    setMessage(noteMessage, 'error', 'Write a note before saving.');
    return;
  }

  var displayName = profileDisplayName(currentUser, currentUserProfile);
  var author = {
    uid: currentUser.uid,
    name: displayName,
    email: currentUser.email || ''
  };
  setBusy(noteSubmit, true, editId ? 'Saving…' : 'Posting…', editId ? 'Save changes' : 'Add note');
  try {
    var basePath = 'bakeryNotes/' + bakeryPathKey(bakeryName);
    if (editId) {
      await update(ref(db, basePath + '/' + editId), {
        body: body,
        updatedAt: serverTimestamp(),
        updatedBy: author
      });
    } else {
      var noteRef = push(ref(db, basePath));
      await set(noteRef, {
        bakery: bakeryName,
        body: body,
        createdAt: serverTimestamp(),
        createdBy: author,
        updatedAt: null,
        updatedBy: null
      });
    }
    resetNoteEditor();
  } catch (error) {
    console.error('Could not save note:', error);
    setMessage(noteMessage, 'error', error.message || 'The note could not be saved.');
  } finally {
    noteSubmit.disabled = false;
    noteSubmit.textContent = noteForm.hasAttribute('data-edit-id') ? 'Save changes' : 'Add note';
  }
});

document.getElementById('bakeryNotesList').addEventListener('click', function(event) {
  var deleteButton = event.target.closest('[data-note-delete]');
  if (deleteButton) {
    openNoteDelete(deleteButton.getAttribute('data-note-delete'));
    return;
  }

  var button = event.target.closest('[data-note-edit]');
  if (!button) return;
  var id = button.getAttribute('data-note-edit');
  var note = notes[id];
  if (!note || !canEditNote(note)) return;
  noteForm.setAttribute('data-edit-id', id);
  noteBody.value = note.body || '';
  noteSubmit.textContent = 'Save changes';
  noteCancelEdit.hidden = false;
  notePostingAs.textContent = isNoteAuthor(note)
    ? 'Editing your note'
    : 'Editing the note by ' + noteAuthor(note);
  setMessage(noteMessage, '', '');
  noteBody.focus();
  noteForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

noteDeleteConfirm.addEventListener('click', async function() {
  if (!noteDeleteId || !canDeleteNote() || noteDeleting) return;
  var id = noteDeleteId;
  noteDeleting = true;
  setBusy(noteDeleteConfirm, true, 'Deleting…', 'Delete note');
  try {
    await remove(ref(db, 'bakeryNotes/' + bakeryPathKey(bakeryName) + '/' + id));
    if (noteForm.getAttribute('data-edit-id') === id) resetNoteEditor();
    closeNoteDelete();
  } catch (error) {
    console.error('Could not delete note:', error);
    setMessage(noteDeleteMessage, 'error', error.message || 'The note could not be deleted.');
  } finally {
    noteDeleting = false;
    setBusy(noteDeleteConfirm, false, 'Deleting…', 'Delete note');
  }
});

noteCancelEdit.addEventListener('click', resetNoteEditor);

signOutBtn.addEventListener('click', async function() {
  await signOut(auth);
  window.location.replace('index.html');
});

window.addEventListener('beforeunload', function() {
  if (notesUnsubscribe) notesUnsubscribe();
  if (visitsUnsubscribe) visitsUnsubscribe();
  if (tasksUnsubscribe) tasksUnsubscribe();
});

onAuthStateChanged(auth, function(user) {
  if (!user) {
    window.location.replace('index.html');
    return;
  }
  loadBakeryProfile(user).catch(function(error) {
    console.error('Could not load bakery profile:', error);
    showGuardError('We could not load this bakery profile.', 'Return to the Bakery Directory and try again.');
  });
});
