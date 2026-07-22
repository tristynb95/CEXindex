// ========== TARGETS MODULE ==========
window.GAILS = window.GAILS || {};

var _sparkState = null; // cached data for toggle re-render

function _drawSparklines(absolute) {
  if (!_sparkState) return;
  var G = GAILS;
  var sparkSorted = _sparkState.sparkSorted;
  var allAvgByMonth = _sparkState.allAvgByMonth;
  var FM = _sparkState.FM;
  var cf = _sparkState.cf || 'c';

  sparkSorted.forEach(function (t) {
    var canvasId = 'spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_');
    var lineColor = t.direction === 'up' ? '#1D9E5C' : t.direction === 'down' ? '#B22A24' : '#C97F12';
    var yOpts = absolute
      ? { display: true, min: 0, max: 100, ticks: { stepSize: 50, font: { size: 7 }, color: 'rgba(146, 137, 120,0.45)', maxTicksLimit: 3 }, grid: { color: 'rgba(34, 31, 26,0.05)' }, border: { display: false } }
      : { display: false };
    G.makeChart(canvasId, {
      type: 'line',
      data: {
        labels: FM, datasets: [
          { data: t.hist.map(function (r) { return r && !r.noData && !r.incompletePeriod ? r[cf] : null; }), borderColor: lineColor, backgroundColor: lineColor + '18', fill: true, tension: 0.3, pointRadius: 1.5, borderWidth: 2, spanGaps: false },
          { data: allAvgByMonth, borderColor: 'rgba(146, 137, 120,0.4)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3, spanGaps: false }
        ]
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (items) { return items[0].label; }, label: function (ctx) { return ctx.datasetIndex === 0 ? 'Index: ' + ctx.raw : 'Avg: ' + (ctx.raw ? ctx.raw.toFixed(1) : ''); } } } },
        scales: { y: yOpts, x: { display: false } },
        maintainAspectRatio: false
      }
    });
  });
}

window.GAILS.toggleSparkScale = function () {
  var absolute = !!(document.getElementById('sparkAbsoluteToggle') || {}).checked;
  _drawSparklines(absolute);
};

window.GAILS.changeSparkSort = function () {
  var G = GAILS;
  if (G._lastData) {
    G.renderTargets(G._lastData);
  }
};

function _clearTargetTrendCharts() {
  var G = GAILS;
  ['targetAvgTrend', 'targetBandFlow', 'targetMomentumChart', 'targetAreaMomentum'].forEach(function (id) { G.destroyChart(id); });
  if (_sparkState && _sparkState.sparkSorted) {
    _sparkState.sparkSorted.forEach(function (t) {
      G.destroyChart('spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_'));
    });
  }
  _sparkState = null;
}

function _setTargetTrendState(hasData, message) {
  var graphsEmpty = document.getElementById('targetTrendGraphsEmpty');
  var tableEmpty = document.getElementById('targetTrendTableEmpty');
  var graphsContent = document.getElementById('targetTrendGraphsContent');
  var tableContent = document.getElementById('targetTrendTableContent');

  if (graphsEmpty) {
    graphsEmpty.textContent = hasData ? '' : message;
    graphsEmpty.style.display = hasData ? 'none' : '';
  }
  if (tableEmpty) {
    tableEmpty.textContent = hasData ? '' : message;
    tableEmpty.style.display = hasData ? 'none' : '';
  }
  if (graphsContent) graphsContent.style.display = hasData ? '' : 'none';
  if (tableContent) tableContent.style.display = hasData ? '' : 'none';
}

// ══════════ FOCUS BAKERY HUB (Summary tab) ══════════
// Ranked triage view of every focus bakery plus a per-bakery deep-dive modal.
// The queue uses an internal priority score for ordering. The deep-dive shows
// the observed performance facts behind that ordering instead of exposing
// another abstract score that can be mistaken for a performance measure.

var _TREND_THRESHOLD = 3;

// Per-bakery month-by-month trend facts for the selected period. Shared by the
// hub priority queue and the Performance Trends tab so both always agree on
// direction / streak / change arithmetic. MoM always means the immediately
// preceding calendar month, and 3-month change means three calendar months
// earlier; missing months are not silently skipped.
function _computeBakeryTrend(name, cf, FM) {
  var state = GAILS.state;
  var hist = FM.map(function (m) { return state.ALL.find(function (r) { return r.b === name && r.m === m; }) || null; });
  function isUsable(record) {
    return record && !record.noData && !record.incompletePeriod &&
      record[cf] !== null && record[cf] !== undefined && !isNaN(record[cf]);
  }
  // A record can exist for a month while still carrying no usable score. Such
  // rows stay in hist for the month table, but must not become the latest trend
  // point or dilute time-in-focus evidence.
  var valid = hist.filter(isUsable);
  var sortedValid = valid.slice().sort(function (a, b) { return GAILS.monthSortKey(a.m) - GAILS.monthSortKey(b.m); });
  var latest = sortedValid.length > 0 ? sortedValid[sortedValid.length - 1] : null;

  function recordMonthsBefore(offset) {
    if (!latest || !GAILS.focusMonthLabelFromKey) return null;
    var month = GAILS.focusMonthLabelFromKey(GAILS.monthSortKey(latest.m) - offset);
    var record = state.ALL.find(function (r) { return r.b === name && r.m === month; });
    return isUsable(record) ? record : null;
  }

  var prev = recordMonthsBefore(1);
  var threePrev = recordMonthsBefore(3);

  var direction = 'new', ceiChange = 0, npsChange = null;
  if (latest && prev) {
    ceiChange = latest[cf] - prev[cf];
    if (latest.n !== null && latest.n !== undefined && !isNaN(latest.n) && prev.n !== null && prev.n !== undefined && !isNaN(prev.n)) npsChange = latest.n - prev.n;
    direction = ceiChange >= _TREND_THRESHOLD ? 'up' : ceiChange <= -_TREND_THRESHOLD ? 'down' : 'flat';
  }
  var trend3m = 'new', cei3mChange = null;
  if (latest && threePrev) { cei3mChange = latest[cf] - threePrev[cf]; trend3m = cei3mChange >= _TREND_THRESHOLD ? 'up' : cei3mChange <= -_TREND_THRESHOLD ? 'down' : 'flat'; }

  var streak = 0;
  if (latest && FM.length && GAILS.focusMonthLabelFromKey) {
    var latestMonthKey = GAILS.monthSortKey(latest.m);
    var earliestMonthKey = FM.reduce(function (min, month) {
      return Math.min(min, GAILS.monthSortKey(month));
    }, latestMonthKey);
    for (var i = latestMonthKey; i > earliestMonthKey; i--) {
      var currentMonth = GAILS.focusMonthLabelFromKey(i);
      var priorMonth = GAILS.focusMonthLabelFromKey(i - 1);
      var currentRec = state.ALL.find(function (r) { return r.b === name && r.m === currentMonth; });
      var priorRec = state.ALL.find(function (r) { return r.b === name && r.m === priorMonth; });
      if (!isUsable(currentRec) || !isUsable(priorRec)) break;
      if (currentRec[cf] < priorRec[cf] - 1) streak++; else break;
    }
  }

  var best = null, worst = null;
  valid.forEach(function (r) { if (!best || r[cf] > best[cf]) best = r; if (!worst || r[cf] < worst[cf]) worst = r; });

  var first = sortedValid.length > 0 ? sortedValid[0] : null;
  var periodChange = 0;
  if (latest && first && latest !== first) periodChange = latest[cf] - first[cf];

  var compTrends = {};
  if (latest && prev) {
    if (latest.dr !== null && latest.dr !== undefined && prev.dr !== null && prev.dr !== undefined) compTrends.drink = latest.dr - prev.dr;
    if (latest.ef !== null && latest.ef !== undefined && prev.ef !== null && prev.ef !== undefined) compTrends.efficiency = latest.ef - prev.ef;
    if (latest.fr !== null && latest.fr !== undefined && prev.fr !== null && prev.fr !== undefined) compTrends.friendliness = latest.fr - prev.fr;
    if (latest.o5 !== null && latest.o5 !== undefined && prev.o5 !== null && prev.o5 !== undefined) compTrends.timeliness = prev.o5 - latest.o5;
  }
  return { name: name, hist: hist, valid: valid, latest: latest, prev: prev, threePrev: threePrev, direction: direction, ceiChange: ceiChange, npsChange: npsChange, trend3m: trend3m, cei3mChange: cei3mChange, streak: streak, best: best, worst: worst, compTrends: compTrends, monthsTracked: valid.length, periodChange: periodChange };
}

var _hubState = null;
var _hubLockedScrollY = 0;
// Priority triage labels. Deliberately not band-like nouns, so they can
// never be confused with the performance bands ("Low Performance" etc.):
// bands say where a bakery sits, priority levels triage how quickly to
// step in. Internal keys stay critical/high/watch.
var _TIER_LABEL = { critical: 'High', high: 'Medium', watch: 'Monitor' };

var _DRIVER_ACTIONS = {
  dr: 'Run a drink-standards calibration with the coffee lead — check espresso dial-in, milk texturing and presentation against spec.',
  ef: 'Review peak-hour deployment and the barista rota. Customer-rated efficiency carries 25% of the experience index, so gains here have a meaningful impact.',
  fr: 'Coach the team on warm greetings and handover moments — observe service interactions during the next routine visit.',
  n: 'Read this bakery’s recent customer comments in the Comment Cloud tab and agree one specific service fix with the BM.',
  ts: 'Track drink delivery times at peak — the standard is 80% of drinks served within 2 minutes.',
  at: 'Average wait is above the 2:00 standard — review queue flow, batching and order sequencing at peak.'
};

// The bakery's component metrics ranked weakest-first by progress towards the
// company benchmark. Peer percentiles are deliberately excluded from this view.
function _driverList(rec) {
  var B = GAILS.BENCHMARKS;
  var list = [
    { key: 'dr', label: 'Drink Quality', pct: rec.dp, value: rec.dr, fmt: 'pct', bench: B.dr },
    { key: 'ef', label: 'Customer-rated Efficiency', pct: rec.ep, value: rec.ef, fmt: 'pct', bench: B.ef },
    { key: 'fr', label: 'Friendliness', pct: rec.fp, value: rec.fr, fmt: 'pct', bench: B.fr },
    { key: 'n', label: 'Drink + Meal NPS', pct: rec.np, value: rec.n, fmt: 'raw', bench: B.nps },
    { key: 'ts', label: 'Coffee Efficiency', pct: rec.ap, value: rec.ts, fmt: 'pct', bench: B.time }
  ];
  if (rec.at !== null && rec.at !== undefined && !isNaN(rec.at)) {
    list.push({ key: 'at', label: 'Average Wait Time', pct: rec.atp, value: rec.at, fmt: 'secs', bench: B.at, invert: true });
  }
  return list.filter(function (d) { return d.value !== null && d.value !== undefined && !isNaN(d.value); })
    .map(function (d) {
      d.attainment = GAILS.metricBenchmarkAttainment(d.key, d.value, d.bench);
      d.rag = GAILS.metricRagTone(d.key, d.value);
      return d;
    })
    .sort(function (a, b) { return a.attainment - b.attainment; });
}

function _fmtDriverValue(d) {
  if (d.fmt === 'secs') return GAILS.formatSecs(d.value);
  if (d.fmt === 'pct') return d.value + '%';
  return '' + d.value;
}

function _fmtOneDecimal(value) {
  var fixed = Math.abs(value).toFixed(1);
  return fixed.slice(-2) === '.0' ? fixed.slice(0, -2) : fixed;
}

function _driverGapText(d) {
  var diff = d.value - d.bench;
  if (d.fmt === 'secs') {
    if (Math.round(diff) === 0) return 'On the ' + GAILS.formatSecs(d.bench) + ' target';
    return Math.abs(Math.round(diff)) + 's ' + (diff > 0 ? 'slower' : 'faster') + ' than the ' + GAILS.formatSecs(d.bench) + ' target';
  }
  if (Math.round(diff * 10) === 0) return 'On target';
  var target = d.fmt === 'pct' ? d.bench + '%' : d.bench;
  return _fmtOneDecimal(diff) + ' pts ' + (diff < 0 ? 'below' : 'above') + ' the ' + target + ' target';
}

// Peer standing still supports the main Focus queue's explanatory sentence;
// it is not used for the benchmark bars in the review modal.
function _driverStandingText(percentile) {
  var pct = Math.max(1, Math.min(99, Math.round(percentile)));
  return pct <= 50 ? 'Bottom ' + pct + '% of bakeries' : 'Top ' + Math.max(1, 100 - pct) + '% of bakeries';
}

function _driverRagText(tone) {
  if (tone === 'green') return 'On target';
  if (tone === 'amber') return 'Watch';
  return 'Needs attention';
}

function _driverDeltaHtml(d, change) {
  if (change === null || change === undefined || isNaN(change)) return '';
  var rounded = d.key === 'at' ? Math.round(change) : Math.round(change * 10) / 10;
  if (rounded === 0) return '<span class="focus-driver__movement-icon focus-driver__movement-icon--neutral" role="img" aria-label="No change">→</span><span class="focus-driver__movement-copy">No change <span>vs last month</span></span>';
  var improved = d.key === 'at' ? change < 0 : change > 0;
  var movement = d.key === 'at'
    ? Math.abs(rounded) + 's ' + (change < 0 ? 'faster' : 'slower')
    : Math.abs(rounded).toFixed(1) + ' pts';
  return '<span class="focus-driver__movement-icon focus-driver__movement-icon--' + (improved ? 'up' : 'down') + '" role="img" aria-label="' + (improved ? 'Improved' : 'Declined') + '">' + (improved ? '↑' : '↓') + '</span><span class="focus-driver__movement-copy">' + movement + ' <span>vs last month</span></span>';
}

function _countFocusStreak(hist, bf, highBand, lowBand) {
  var streak = 0;
  for (var i = hist.length - 1; i >= 0; i--) {
    var record = hist[i];
    if (!record || (record[bf] !== highBand && record[bf] !== lowBand)) break;
    streak++;
  }
  return streak;
}

function _priorityText(row) {
  if (row.tier === 'critical') return 'High Priority';
  if (row.tier === 'high') return 'Medium Priority';
  return 'Monitor';
}

function _trendText(row) {
  if (!row.trend.prev || row.trend.ceiChange === null || row.trend.ceiChange === undefined || isNaN(row.trend.ceiChange)) {
    return 'No previous score';
  }
  var change = Math.round(row.trend.ceiChange * 10) / 10;
  if (change === 0) return 'No change';
  return (change > 0 ? 'Improved ' : 'Down ') + Math.abs(change).toFixed(1) + ' points';
}

// There is no fixed visit rota — each coffee partner covers 70+ bakeries — so
// recency is judged against a reasonable cadence instead of the selected
// period: a visit is due after 6 months without one and overdue after 12.
var _VISIT_DUE_MONTHS = 6;
var _VISIT_OVERDUE_MONTHS = 12;

function _monthsSinceVisit(row) {
  if (!row.lastVisit) return null;
  var d = new Date(row.lastVisit + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function _visitStatus(row) {
  var months = _monthsSinceVisit(row);
  if (months === null) return { label: 'No visit recorded', cls: 'is-due' };
  if (months >= _VISIT_OVERDUE_MONTHS) return { label: 'Visit overdue', cls: 'is-due' };
  if (months >= _VISIT_DUE_MONTHS) return { label: 'Visit due', cls: 'is-due-soon' };
  return { label: 'Visited recently', cls: 'is-complete' };
}

function _visitText(row) {
  return _visitStatus(row).label;
}

function _formatVisitDate(isoDate) {
  var d = new Date(isoDate + 'T00:00:00');
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _thresholdText(row) {
  if (row.score === null || row.score === undefined || isNaN(row.score)) return 'Next threshold unavailable';
  var gap = Math.max(0, Math.round((_hubState.escapeLine - row.score) * 10) / 10);
  return gap === 0 ? 'At the threshold to leave focus' : gap.toFixed(1) + ' points to leave focus';
}

function _weaknessText(row) {
  if (!row.weakest) return 'No reliable driver data yet';
  return row.weakest.label + ' is ' + _driverStandingText(row.weakest.pct).toLowerCase();
}

// The former standalone "Top Priority" card duplicated the action list's #1
// row wholesale; its only unique content was the stacked "why" narrative and
// the recommended next step. That narrative now lives inline on the highlighted
// lead row of the action list (see _renderHubQueue), so the reading path stays
// bakery -> reason -> next action without a redundant card above the table.
function _focusReasons(r) {
  var reasons = [_weaknessText(r)];
  if (r.trend.direction === 'down') reasons.push(_trendText(r).toLowerCase() + ' since last month');
  if (!r.visitedInPeriod) reasons.push(_visitText(r).toLowerCase());
  if (r.focusStreak >= 3) reasons.push('in focus for ' + r.focusStreak + ' months running');
  return reasons.slice(0, 3);
}

function _focusNextStep(r) {
  // Keep the driver label in its proper case so acronyms (NPS) stay intact.
  return r.weakest ? 'Start with ' + r.weakest.label : 'Review the full bakery detail';
}

function _renderFocusDataStatus(context, targets) {
  var esc = GAILS.escapeHtml;
  var statusEl = document.getElementById('focusDataStatus');
  if (!statusEl || !context) return;

  var review = context.dataReview || [];
  var provisional = (targets || []).filter(function (record) { return record.focusDataStatus === 'provisional'; });
  var parts = [];

  if (provisional.length) {
    parts.push('<span><strong>' + provisional.length + '</strong> provisional focus ' + (provisional.length === 1 ? 'bakery' : 'bakeries') + '</span>');
  }
  if (review.length) {
    parts.push('<details><summary><strong>' + review.length + '</strong> ' + (review.length === 1 ? 'bakery needs' : 'bakeries need') + ' data review</summary>' +
      '<p>These bakeries are not being treated as healthy or ranked from stale evidence.</p><ul>' + review.map(function (item) {
        return '<li>' + esc(item.name) + ' — ' + esc(item.reason) + (item.lastObservedMonth ? ' (last result ' + esc(item.lastObservedMonth) + ')' : '') + '</li>';
      }).join('') + '</ul></details>');
  }

  statusEl.innerHTML = parts.length
    ? '<div class="focus-data-status" aria-label="Focus data eligibility and completeness">' + parts.join('') + '</div>'
    : '';
}

function _renderFocusHub(targets, data, bf, cf, highBand, lowBand, isAbsolute) {
  var G = GAILS;
  var esc = G.escapeHtml;
  var state = G.state;
  var focusContext = G._focusDataContext || {};
  var FM = focusContext.closedMonths || state.selectedMonths || [];
  var recentFM = focusContext.recentMonths || FM.slice(-6);
  var escapeLine = isAbsolute ? 75 : 50;
  var severeLine = isAbsolute ? 60 : 25;
  var queueEl = document.getElementById('targetHubQueue');

  var rows = targets.map(function (rec) {
    var trend = _computeBakeryTrend(rec.b, cf, FM);
    var recentTrend = _computeBakeryTrend(rec.b, cf, recentFM);
    var focusMonths = recentTrend.valid.filter(function (r) { return r[bf] === highBand || r[bf] === lowBand; }).length;
    // Persistence scoring uses the six-month decision window, but the visible
    // run should describe the bakery's full uninterrupted focus history.
    var focusStreak = _countFocusStreak(trend.hist, bf, highBand, lowBand);
    var lastVisit = G.getLastVisitDate ? G.getLastVisitDate(rec.b) : null;
    var monthsSinceVisit = _monthsSinceVisit({ lastVisit: lastVisit });
    var visitedInPeriod = monthsSinceVisit !== null && monthsSinceVisit < _VISIT_DUE_MONTHS;
    var drivers = _driverList(rec);
    var p = G.computeSupportPriority({
      score: rec[cf], trend: trend, focusMonths: focusMonths, focusStreak: focusStreak,
      monthsWithData: recentTrend.monthsTracked, visitedInPeriod: visitedInPeriod,
      monthsSinceVisit: monthsSinceVisit,
      hasVisitEver: !!lastVisit, escapeLine: escapeLine, severeLine: severeLine
    });
    // Carry the priority tier onto the snapshot so the focus map (which is fed
    // these same records) can colour its pins by support priority.
    rec.supportTier = p.tier;
    rec.supportPriority = p.priority;
    return {
      name: rec.b, rec: rec, trend: trend, ops: G.getBakeryOps(rec.b),
      score: rec[cf], focusMonths: focusMonths, focusStreak: focusStreak, monthsWithData: recentTrend.monthsTracked,
      visitedInPeriod: visitedInPeriod, lastVisit: lastVisit, monthsSinceVisit: monthsSinceVisit,
      dataStatus: rec.focusDataStatus || 'complete',
      weakest: drivers.length ? drivers[0] : null,
      severity: p.severity, momentum: p.momentum, persistence: p.persistence, coverage: p.coverage,
      priority: p.priority, tier: p.tier,
      quickWin: rec[bf] === lowBand && rec[cf] >= escapeLine - 5,
      lowVol: rec.co === 'Low'
    };
  });
  rows.sort(function (a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.score || 0) - (b.score || 0);
  });
  rows.forEach(function (r, i) { r.rank = i + 1; });

  var byName = {};
  rows.forEach(function (r) { byName[r.name] = r; });

  // Ops-area aggregates for the area triage board. "Attention load" is the sum
  // of member priorities, so an area with many moderately troubled bakeries can
  // outrank one with a single very poor site.
  var areaMap = {};
  rows.forEach(function (r) {
    if (!areaMap[r.ops]) areaMap[r.ops] = { area: r.ops, rows: [], totalInArea: 0 };
    areaMap[r.ops].rows.push(r);
  });
  data.forEach(function (rec) {
    var ops = G.getBakeryOps(rec.b);
    if (areaMap[ops]) areaMap[ops].totalInArea++;
  });
  var areas = Object.keys(areaMap).map(function (k) {
    var a = areaMap[k];
    var load = 0, critical = 0, high = 0, watch = 0, declining = 0, notVisited = 0;
    var worst = null, scoreSum = 0, scoreN = 0;
    a.rows.forEach(function (r) {
      load += r.priority;
      if (r.tier === 'critical') critical++; else if (r.tier === 'high') high++; else watch++;
      if (r.trend.direction === 'down') declining++;
      if (!r.visitedInPeriod) notVisited++;
      if (typeof r.score === 'number' && !isNaN(r.score)) { scoreSum += r.score; scoreN++; }
      if (!worst || (r.score || 0) < (worst.score || 0)) worst = r;
    });
    a.load = load; a.critical = critical; a.high = high; a.watch = watch;
    a.declining = declining; a.notVisited = notVisited;
    a.avgScore = scoreN ? Math.round((scoreSum / scoreN) * 10) / 10 : null;
    a.worst = worst;
    return a;
  }).sort(function (x, y) { return y.load - x.load; });

  var prevSort = _hubState ? _hubState.sort : 'priority';
  var prevTier = _hubState ? _hubState.tier : 'all';
  var prevArea = _hubState ? _hubState.area : 'all';
  var prevStatus = _hubState ? _hubState.status || 'all' : 'all';
  var prevBand = _hubState ? _hubState.band || 'all' : 'all';
  // Migrate state created by older renders, where the band and activity
  // filters shared one field and could not be understood independently.
  if (prevStatus === 'band-high' || prevStatus === 'band-low') {
    prevBand = prevStatus;
    prevStatus = 'all';
  }
  var prevSearch = _hubState ? _hubState.search || '' : '';
  var prevExpanded = _hubState ? !!_hubState.expanded : false;
  if (prevArea !== 'all' && !areaMap[prevArea]) prevArea = 'all';
  _hubState = {
    rows: rows, byName: byName, areas: areas, sort: prevSort, tier: prevTier, area: prevArea,
    status: prevStatus, band: prevBand, search: prevSearch,
    expanded: prevExpanded,
    bf: bf, cf: cf, isAbsolute: isAbsolute, FM: FM,
    highBand: highBand, lowBand: lowBand, escapeLine: escapeLine,
    severeLine: severeLine
  };

  _renderHubAreas();

  if (!queueEl) return;

  if (!rows.length) {
    queueEl.innerHTML = '<div class="focus-queue__empty">No eligible bakeries are in the ' + esc(highBand) + ' or ' + esc(lowBand) + ' bands through the latest completed month — nothing needs focus right now.</div>';
    return;
  }

  queueEl.innerHTML =
    '<div class="focus-queue__heading"><div><p class="focus-section-title">Bakery action list</p><p>Ranked by support priority. Every row explains why the bakery needs attention.</p></div><span id="focusQueueSummary" class="focus-queue__summary" role="status" aria-live="polite"></span></div>' +
    '<div class="focus-queue__bar">' +
    '<div class="focus-queue__chips" id="focusQueueChips"></div>' +
    '<div class="focus-queue__tools">' +
    '<label class="focus-tool-label"><span>Search</span><input type="search" id="focusQueueSearch" class="focus-qsearch" placeholder="Bakery or operations area" aria-label="Search the action list by bakery or operations area" oninput="GAILS.setFocusSearch(this.value)"></label>' +
    '<label class="focus-tool-label"><span>Sort by</span><select id="focusQueueSort" class="spark-sort-select" onchange="GAILS.setFocusSort(this.value)">' +
    '<option value="priority">Highest support priority</option>' +
    '<option value="score-asc">Lowest performance</option>' +
    '<option value="decline">Largest fall since last month</option>' +
    '<option value="alpha">Alphabetical (A–Z)</option>' +
    '</select></label>' +
    '</div>' +
    '</div>' +
    '<div class="focus-qwrap"><div class="focus-qlist" id="focusQueueGrid"></div></div>' +
    '<div class="focus-qmore" id="focusQueueMore"></div>';
  var sortEl = document.getElementById('focusQueueSort');
  if (sortEl) {
    sortEl.value = _hubState.sort;
    // The queue bar is injected fresh on every render, so the select must be
    // re-wrapped into the site-wide custom dropdown (js/custom-selects.js).
    if (G.syncCustomSelect) G.syncCustomSelect(sortEl);
  }
  var searchEl = document.getElementById('focusQueueSearch');
  if (searchEl) searchEl.value = _hubState.search;
  _renderHubQueue();
}

// Ops areas as one comparative chart: a row per area whose bar length is the
// number of focus bakeries (shared scale across rows) segmented by priority
// tier, so the heaviest and most severe areas jump out without reading text.
function _renderHubAreas() {
  if (!_hubState) return;
  var esc = GAILS.escapeHtml;
  var board = document.getElementById('focusAreaBoard');
  var details = document.getElementById('focusAreaDetails');
  if (!board) return;
  var areas = _hubState.areas || [];
  if (details) details.style.display = areas.length ? '' : 'none';
  if (!areas.length) { board.innerHTML = ''; return; }

  var maxFocus = 1;
  areas.forEach(function (a) { if (a.rows.length > maxFocus) maxFocus = a.rows.length; });

  board.innerHTML =
    '<div class="focus-area-head">' +
    '<h4 class="focus-section-title">Operations areas ranked by focus need</h4>' +
    '<div class="focus-area-legend">' +
    '<span><i style="background:var(--red)"></i>High priority</span>' +
    '<span><i style="background:var(--amber)"></i>Medium priority</span>' +
    '<span><i style="background:#B3AA99"></i>Monitor</span>' +
    '<span class="focus-area-legend__note">Bar length = focus bakeries. Select a row to filter the action list.</span>' +
    '</div>' +
    '</div>' +
    '<div class="focus-area-list">' +
    areas.map(function (a) {
      var active = _hubState.area === a.area;
      var total = a.rows.length;
      var segs = [
        { n: a.critical, c: 'var(--red)', l: 'High priority' },
        { n: a.high, c: 'var(--amber)', l: 'Medium priority' },
        { n: a.watch, c: '#B3AA99', l: 'Monitor' }
      ].filter(function (s) { return s.n > 0; }).map(function (s) {
        return '<i style="flex:' + s.n + ';background:' + s.c + '" title="' + s.n + ' ' + s.l + '"></i>';
      }).join('');
      var visited = total - a.notVisited;
      return '<div class="focus-area-row' + (active ? ' active' : '') + '" data-focus-area="' + esc(a.area) + '" role="button" tabindex="0" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="Filter the queue to ' + esc(a.area) + '">' +
        '<span class="focus-area-row__name">' + esc(a.area) + '</span>' +
        '<span class="focus-area-row__barwrap">' +
        '<span class="focus-area-row__bar" style="width:' + Math.round((total / maxFocus) * 100) + '%">' + segs + '</span>' +
        '<span class="focus-area-row__count">' + total + '<em>of ' + a.totalInArea + '</em></span>' +
        '</span>' +
        '<span class="focus-area-row__metric"><strong>' + (a.avgScore !== null ? a.avgScore : '—') + ' / 100</strong><em>performance</em></span>' +
        '<span class="focus-area-row__metric"><strong' + (visited === 0 ? ' style="color:var(--amber)"' : '') + '>' + visited + '/' + total + '</strong><em>visited</em></span>' +
        '<span class="focus-area-row__chev" aria-hidden="true">' + (active ? '✕' : '›') + '</span>' +
        '</div>';
    }).join('') +
    '</div>';
}

// The queue rows currently visible: area, tier, status and search filters
// applied in order, then the active sort. Shared by the queue render and the
// deep-dive modal's prev/next navigation so both always agree on ordering.
function _visibleQueueRows() {
  if (!_hubState) return [];
  var s = _hubState;
  var search = (s.search || '').trim().toLowerCase();
  var rows = s.rows.filter(function (r) {
    if (s.area !== 'all' && r.ops !== s.area) return false;
    if (s.tier !== 'all' && r.tier !== s.tier) return false;
    if (s.status === 'dipping' && r.trend.direction !== 'down') return false;
    if (s.status === 'novisit' && _visitStatus(r).cls === 'is-complete') return false;
    if (s.band === 'band-high' && r.rec[s.bf] !== s.highBand) return false;
    if (s.band === 'band-low' && r.rec[s.bf] !== s.lowBand) return false;
    if (search && r.name.toLowerCase().indexOf(search) === -1 && r.ops.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });
  var sortVal = s.sort;
  return rows.sort(function (a, b) {
    if (sortVal === 'score-asc') return (a.score || 0) - (b.score || 0);
    if (sortVal === 'decline') return a.trend.ceiChange - b.trend.ceiChange;
    if (sortVal === 'alpha') return a.name.localeCompare(b.name);
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.score || 0) - (b.score || 0);
  });
}

function _renderHubQueue() {
  if (!_hubState) return;
  var G = GAILS;
  var esc = G.escapeHtml;
  var grid = document.getElementById('focusQueueGrid');
  var chipsEl = document.getElementById('focusQueueChips');
  if (!grid) return;
  var s = _hubState;

  var search = (s.search || '').trim().toLowerCase();
  function matchesArea(r) { return s.area === 'all' || r.ops === s.area; }
  function matchesBand(r) {
    if (s.band === 'band-high') return r.rec[s.bf] === s.highBand;
    if (s.band === 'band-low') return r.rec[s.bf] === s.lowBand;
    return true;
  }
  function matchesActivity(r) {
    if (s.status === 'dipping') return r.trend.direction === 'down';
    if (s.status === 'novisit') return _visitStatus(r).cls !== 'is-complete';
    return true;
  }
  function matchesSearch(r) {
    return !search || r.name.toLowerCase().indexOf(search) !== -1 || r.ops.toLowerCase().indexOf(search) !== -1;
  }

  // Priority counts respect every other active filter. This prevents an "All
  // 34" control from appearing while a performance filter shows only 3 rows.
  var tierScope = s.rows.filter(function (r) {
    return matchesArea(r) && matchesBand(r) && matchesActivity(r) && matchesSearch(r);
  });
  var counts = { all: tierScope.length, critical: 0, high: 0, watch: 0 };
  tierScope.forEach(function (r) { counts[r.tier]++; });

  // Quick-filter counts respect area, band, priority and search, while ignoring
  // the current quick filter so each button describes the result it would show.
  var activityScope = s.rows.filter(function (r) {
    return matchesArea(r) && matchesBand(r) && (s.tier === 'all' || r.tier === s.tier) && matchesSearch(r);
  });
  var statusCounts = {
    dipping: activityScope.filter(function (r) { return r.trend.direction === 'down'; }).length,
    novisit: activityScope.filter(function (r) { return !r.visitedInPeriod; }).length
  };

  var rows = _visibleQueueRows();
  var LIMIT = 12;
  var searching = !!(s.search || '').trim();
  var shownCount = (_hubState.expanded || searching) ? rows.length : Math.min(LIMIT, rows.length);
  var summaryEl = document.getElementById('focusQueueSummary');
  var activeLabels = [];
  if (s.area !== 'all') activeLabels.push('Area: ' + s.area);
  if (s.band === 'band-high') activeLabels.push('Performance: ' + s.highBand);
  if (s.band === 'band-low') activeLabels.push('Performance: ' + s.lowBand);
  if (s.tier !== 'all') activeLabels.push('Priority: ' + _TIER_LABEL[s.tier]);
  if (s.status === 'dipping') activeLabels.push('Down since last month');
  if (s.status === 'novisit') activeLabels.push('Visit due');
  if (search) activeLabels.push('Search: ' + (s.search || '').trim());
  if (summaryEl) {
    summaryEl.innerHTML = 'Showing <strong>' + shownCount + '</strong> of ' + rows.length + ' matching bakeries' +
      (rows.length !== s.rows.length ? '<span>' + s.rows.length + ' total focus bakeries · ' + esc(activeLabels.join(' · ')) + '</span>' :
        activeLabels.length ? '<span>' + esc(activeLabels.join(' · ')) + '</span>' : '<span>No additional filters</span>');
  }

  if (chipsEl) {
    var appliedChips = '';
    if (s.area !== 'all') {
      appliedChips += '<button type="button" class="focus-applied-filter" onclick="GAILS.setFocusArea(\'all\')" aria-label="Clear operations area filter">Area: ' + esc(s.area) + ' <span aria-hidden="true">&times;</span></button>';
    }
    if (s.band === 'band-high' || s.band === 'band-low') {
      var bandName = s.band === 'band-high' ? s.highBand : s.lowBand;
      appliedChips += '<button type="button" class="focus-applied-filter" onclick="GAILS.setFocusBand(\'all\')" aria-label="Clear performance filter">Performance: ' + esc(bandName) + ' <span aria-hidden="true">&times;</span></button>';
    }
    var tierChips = ['all', 'critical', 'high', 'watch'].map(function (t) {
      var label = t === 'all' ? 'All priority levels' : _TIER_LABEL[t];
      return '<button type="button" class="focus-chip' + (s.tier === t ? ' active' : '') + '" aria-pressed="' + (s.tier === t ? 'true' : 'false') + '" onclick="GAILS.setFocusTier(\'' + t + '\')">' + label + '<span class="focus-chip__count">' + counts[t] + '</span></button>';
    }).join('');
    var statusChips = [
      { key: 'dipping', label: 'Down since last month' },
      { key: 'novisit', label: 'Visit due' }
    ].map(function (c) {
      return '<button type="button" class="focus-chip' + (s.status === c.key ? ' active' : '') + '" aria-pressed="' + (s.status === c.key ? 'true' : 'false') + '" onclick="GAILS.setFocusStatus(\'' + c.key + '\')">' + c.label + '<span class="focus-chip__count">' + statusCounts[c.key] + '</span></button>';
    }).join('');
    chipsEl.innerHTML = (appliedChips ? '<div class="focus-applied-filters"><span>Applied</span>' + appliedChips + '</div>' : '') +
      '<div class="focus-filter-group"><span class="focus-filter-label">Support priority</span><div>' + tierChips + '</div></div>' +
      '<div class="focus-filter-group"><span class="focus-filter-label">Quick filters</span><div>' + statusChips + '</div></div>';
  }

  var moreEl = document.getElementById('focusQueueMore');

  if (!rows.length) {
    var searchTerm = (s.search || '').trim();
    grid.innerHTML = '<div class="focus-queue__empty">' + (searchTerm
      ? 'No focus bakeries match “' + esc(searchTerm) + '” with the current filters.'
      : 'No bakeries match the current filters for this selection.') + '</div>';
    if (moreEl) moreEl.innerHTML = '';
    return;
  }

  var bf = _hubState.bf;
  // While searching, show every match — capping a search result set reads
  // as "bakery not found".
  var visible = (_hubState.expanded || searching) ? rows : rows.slice(0, LIMIT);

  // The highest-priority row doubles as the "start here" anchor that the old
  // Top Priority card used to be: it carries the stacked reasons and the next
  // step inline. Only meaningful when the list is in its default priority order
  // and not narrowed by a search, where "first row" genuinely means "worst".
  var showLead = s.sort === 'priority' && !searching;

  grid.className = 'focus-qlist';
  grid.setAttribute('role', 'table');
  grid.setAttribute('aria-label', 'Bakery action list');
  grid.innerHTML =
    '<div class="focus-qhead" role="row">' +
    '<span role="columnheader">Support priority</span>' +
    '<span role="columnheader">Bakery</span>' +
    '<span role="columnheader">Performance</span>' +
    '<span role="columnheader">Change since last month</span>' +
    '<span role="columnheader">Main focus</span>' +
    '<span role="columnheader">Last visited</span>' +
    '<span role="columnheader">Action</span>' +
    '</div>' +
    visible.map(function (r, i) {
      var band = r.rec[bf];
      var score = (r.score !== null && r.score !== undefined) ? r.score : null;
      var isLead = showLead && i === 0;

      var badges = '';
      if (r.dataStatus === 'provisional') badges += '<span class="focus-qbadge focus-qbadge--data">Incomplete data · provisional</span>';
      if (r.trend.streak >= 3) badges += '<span class="focus-qbadge focus-qbadge--chronic">Down ' + r.trend.streak + ' months</span>';
      if (r.quickWin) badges += '<span class="focus-qbadge focus-qbadge--win">Nearly ready to leave focus</span>';
      if (r.lowVol) badges += '<span class="focus-qbadge">Low response volume</span>';

      // The strong label already says visited / due / never; the sub-line only
      // earns its place when it can add the actual date.
      var visitDetail = r.lastVisit ? 'Last visit: ' + _formatVisitDate(r.lastVisit) : '';
      var trendClass = r.trend.direction === 'down' ? ' is-negative' : r.trend.direction === 'up' ? ' is-positive' : '';
      var visitStatus = _visitStatus(r);

      return '<article class="focus-qrow' + (isLead ? ' focus-qrow--lead' : '') + '" role="row">' +
        '<span class="focus-qrow__urgency focus-tier--' + r.tier + '" role="cell" aria-label="Priority rank ' + r.rank + ', support score ' + r.priority + ' of 100, ' + esc(_TIER_LABEL[r.tier]) + '"><strong>#' + r.rank + '</strong><span class="focus-qrow__tier">' + esc(_TIER_LABEL[r.tier]) + '</span><small>' + r.priority + '<em> / 100</em></small></span>' +
        '<span class="focus-qrow__who" role="cell"><span class="focus-qrow__nameline"><button type="button" class="focus-qrow__name" data-focus-detail="' + esc(r.name) + '">' + esc(r.name) + '</button>' + badges + '</span><small>Operations area: ' + esc(r.ops) + ' &middot; ' + esc(G.getBakeryRegion(r.name)) + '</small></span>' +
        '<span class="focus-qrow__performance" role="cell"><strong>' + (score !== null ? score.toFixed(1) + '<em>/ 100</em>' : 'Not available') + '</strong><small>' + esc(band) + ' &middot; ' + esc(_thresholdText(r)) + '</small></span>' +
        '<span class="focus-qrow__delta' + trendClass + '" role="cell"><strong>' + esc(_trendText(r)) + '</strong></span>' +
        '<span class="focus-qrow__fix" role="cell"><strong>' + esc(_weaknessText(r)) + '</strong><small>' + (r.weakest ? 'Review ' + esc(r.weakest.label) + ' first' : 'Open the bakery for more evidence') + '</small></span>' +
        '<span class="focus-qrow__visit ' + visitStatus.cls + '" role="cell"><strong>' + esc(visitStatus.label) + '</strong>' + (visitDetail ? '<small>' + esc(visitDetail) + '</small>' : '') + '</span>' +
        '<span class="focus-qrow__action" role="cell"><button type="button" data-focus-detail="' + esc(r.name) + '" aria-label="Review ' + esc(r.name) + '">Review bakery</button></span>' +
        (isLead ? '<span class="focus-qrow__lead-why" role="cell">' +
          '<span class="focus-qrow__lead-tag">Top priority</span>' +
          '<span class="focus-qrow__lead-reason"><strong>Why this bakery:</strong> ' + esc(_focusReasons(r).join('; ')) + '.</span>' +
          '<strong class="focus-qrow__lead-next">Recommended next step: ' + esc(_focusNextStep(r)) + '.</strong>' +
          '</span>' : '') +
        '</article>';
    }).join('');

  if (moreEl) {
    moreEl.innerHTML = (!searching && rows.length > LIMIT)
      ? '<button type="button" class="focus-qmore__btn" onclick="GAILS.toggleFocusQueueExpand()">' +
      (_hubState.expanded ? 'Show top ' + LIMIT + ' only ▴' : 'Show all ' + rows.length + ' bakeries ▾') + '</button>'
      : '';
  }
}

window.GAILS.toggleFocusQueueExpand = function () {
  if (!_hubState) return;
  _hubState.expanded = !_hubState.expanded;
  _renderHubQueue();
};

window.GAILS.setFocusTier = function (tier) {
  if (!_hubState) return;
  _hubState.tier = tier;
  _renderHubQueue();
};

window.GAILS.setFocusBand = function (band) {
  if (!_hubState) return;
  _hubState.band = _hubState.band === band ? 'all' : band;
  _renderHubQueue();
};

window.GAILS.setFocusArea = function (area) {
  if (!_hubState) return;
  _hubState.area = (area === 'all' || _hubState.area === area) ? 'all' : area;
  _renderHubAreas();
  _renderHubQueue();
  if (_hubState.area !== 'all') {
    var queueEl = document.getElementById('targetHubQueue');
    if (queueEl && queueEl.scrollIntoView) queueEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

window.GAILS.setFocusSort = function (val) {
  if (!_hubState) return;
  _hubState.sort = val;
  _renderHubQueue();
};

window.GAILS.setFocusStatus = function (status) {
  if (!_hubState) return;
  _hubState.status = _hubState.status === status ? 'all' : status;
  _renderHubQueue();
};

window.GAILS.setFocusSearch = function (val) {
  if (!_hubState) return;
  _hubState.search = val || '';
  _renderHubQueue();
};

// Entry point for the action-card shortcuts: swap the list onto the matching
// filter, clear unrelated filters, and bring the result into view.
window.GAILS.filterQueueFromStat = function (stat) {
  if (!_hubState) return;
  _hubState.tier = 'all';
  _hubState.status = 'all';
  _hubState.band = 'all';
  if (stat === 'critical') _hubState.tier = 'critical';
  else if (stat === 'band-high' || stat === 'band-low') _hubState.band = stat;
  else _hubState.status = stat;
  _hubState.area = 'all';
  _hubState.search = '';
  var searchEl = document.getElementById('focusQueueSearch');
  if (searchEl) searchEl.value = '';
  _renderHubAreas();
  _renderHubQueue();
  var queueEl = document.getElementById('targetHubQueue');
  if (queueEl && queueEl.scrollIntoView) queueEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function _hubLockScroll() {
  _hubLockedScrollY = window.scrollY || window.pageYOffset || 0;
  document.documentElement.classList.add('drill-modal-open');
  document.body.classList.add('drill-modal-open');
  document.body.style.position = 'fixed';
  document.body.style.top = '-' + _hubLockedScrollY + 'px';
  document.body.style.left = '0';
  document.body.style.right = '0';
}

function _hubUnlockScroll() {
  document.documentElement.classList.remove('drill-modal-open');
  document.body.classList.remove('drill-modal-open');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  window.scrollTo(0, _hubLockedScrollY);
}

window.GAILS.openFocusDetail = function (name) {
  if (!_hubState) return;
  var row = _hubState.byName[name];
  if (!row) return;
  var G = GAILS;
  var esc = G.escapeHtml;
  var modal = document.getElementById('focusDetailModal');
  var titleEl = document.getElementById('focusDetailTitle');
  var subtitleEl = document.getElementById('focusDetailSubtitle');
  var badgesEl = document.getElementById('focusDetailBadges');
  var body = document.getElementById('focusDetailBody');
  if (!modal || !titleEl || !subtitleEl || !body) return;
  // Stepping prev/next re-enters here with the modal already open; re-locking
  // would capture scrollY of the fixed body (0) and lose the user's position.
  var alreadyOpen = modal.style.display === 'flex';

  var rec = row.rec, trend = row.trend;
  var cf = _hubState.cf, bf = _hubState.bf, FM = _hubState.FM, isAbsolute = _hubState.isAbsolute;
  var band = rec[bf];
  var palette = isAbsolute ? G.ABSCOL : G.COL;
  var bandColor = palette[band] || '#B22A24';

  titleEl.textContent = name;
  subtitleEl.textContent = G.getBakeryOps(name) + ' · ' + G.getBakeryRegion(name);
  if (badgesEl) {
    badgesEl.innerHTML = '<span class="band ' + G.bc(band) + '">' + esc(band) + '</span>' +
      (row.dataStatus === 'provisional' ? '<span class="focus-qbadge focus-qbadge--data">Incomplete data · provisional</span>' : '');
  }
  var inner = modal.querySelector('.drillInner');
  if (inner) inner.style.setProperty('--drill-accent', bandColor);

  var h = '';

  var score = rec[cf] !== null && rec[cf] !== undefined && !isNaN(rec[cf]) ? rec[cf] : null;
  var scoreGap = score !== null ? Math.max(0, _hubState.escapeLine - score) : null;
  var drivers = _driverList(rec);
  var supportHeading = _priorityText(row);
  var movementText = 'No comparison';
  var movementClass = '';
  if (trend.prev && trend.ceiChange !== null && trend.ceiChange !== undefined && !isNaN(trend.ceiChange)) {
    if (Math.round(trend.ceiChange * 10) === 0) movementText = 'No change';
    else {
      movementText = (trend.ceiChange < 0 ? '&darr; ' : '&uarr; ') + Math.abs(trend.ceiChange).toFixed(1) + ' pts';
      movementClass = trend.ceiChange < 0 ? ' focus-review-summary__fact--down' : ' focus-review-summary__fact--up';
    }
  }

  // Keep this summary deliberately terse. The detailed opportunity and target
  // values already appear in the driver section below.
  var summaryHtml = '<section class="focus-review-summary focus-at-a-glance" aria-label="Bakery support summary">' +
    '<div class="focus-review-summary__lead"><span class="focus-review-summary__eyebrow">At a glance</span>' +
    '<h3>' + esc(supportHeading) + '</h3></div>' +
    '<div class="focus-review-summary__facts">' +
    '<span class="focus-review-summary__fact"><small>Score</small><strong>' + (score !== null ? score + ' / 100' : 'Not available') + '</strong></span>' +
    '<span class="focus-review-summary__fact"><small>To next band</small><strong>' + (scoreGap !== null && scoreGap > 0 ? scoreGap.toFixed(1) + ' pts' : 'In band') + '</strong></span>' +
    '<span class="focus-review-summary__fact' + movementClass + '"><small>Latest change</small><strong>' + movementText + '</strong></span>' +
    '<span class="focus-review-summary__fact"><small>Focus run</small><strong>' + row.focusStreak + ' ' + (row.focusStreak === 1 ? 'month' : 'months') + '</strong></span>' +
    '<span class="focus-review-summary__fact"><small>Routine visit</small><strong>' + esc(_visitText(row)) + '</strong></span>' +
    '</div></section>';
  // Build the recommendations now, then place them immediately after the
  // diagnostic section so the evidence leads naturally into the actions.
  var actions = [];
  drivers.slice(0, 2).forEach(function (d) { if (_DRIVER_ACTIONS[d.key]) actions.push(_DRIVER_ACTIONS[d.key]); });
  if (trend.streak >= 3) actions.push('Score has dipped ' + trend.streak + ' months running — partner with the ops manager on a reset plan with a clear review date.');
  if (!row.lastVisit) actions.push('No routine visit has ever been logged here — schedule one to verify what the data is showing on the ground.');
  else if (!row.visitedInPeriod) actions.push('A routine visit is due — schedule one to verify what the data is showing on the ground.');
  if (row.quickWin) actions.push('This bakery is within touching distance of graduating out of focus — small gains here pay off fastest.');
  // Trend chart
  if (FM.length >= 2) {
    h += '<section class="focus-detail-section focus-detail-section--trend">' +
      summaryHtml +
      '<h4 class="focus-section-title">Score trend vs selection and company average</h4>' +
      '<div class="focus-chart-wrap"><canvas id="focusDetailChart"></canvas></div></section>';
  } else {
    h += summaryHtml;
  }

  // Driver diagnosis
  if (drivers.length) {
    h += '<section class="focus-detail-section focus-detail-section--drivers">' +
      '<div class="focus-section-heading"><h4 class="focus-section-title">Where to focus first</h4><p>Bar colour shows target status · length shows progress to target</p></div><div class="focus-drivers">' +
      drivers.map(function (d) {
        var valStr = _fmtDriverValue(d);
        var benchStr = d.fmt === 'secs' ? G.formatSecs(d.bench) : d.fmt === 'pct' ? d.bench + '%' : '' + d.bench;
        var deltaHtml = '';
        if (trend.latest && trend.prev && trend.latest[d.key] !== null && trend.latest[d.key] !== undefined && trend.prev[d.key] !== null && trend.prev[d.key] !== undefined) {
          var dv = trend.latest[d.key] - trend.prev[d.key];
          deltaHtml = _driverDeltaHtml(d, dv);
        }
        var barColor = G.metricRagColor(d.key, d.value);
        return '<div class="focus-driver">' +
          '<div class="focus-driver__head">' +
          '<span class="focus-driver__name">' + esc(d.label) + '</span>' +
          '<span class="focus-driver__val"><strong>' + esc(valStr) + '</strong> <em>Target ' + esc(benchStr) + '</em></span>' +
          '<span class="focus-driver__delta">' + deltaHtml + '</span>' +
          '</div>' +
          '<div class="focus-driver__bar" aria-label="' + Math.round(d.attainment) + '% of benchmark · ' + esc(_driverRagText(d.rag)) + '"><div class="focus-driver__fill" style="width:' + Math.max(2, Math.round(d.attainment)) + '%;background:' + barColor + '"></div></div>' +
          '<div class="focus-driver__sub"><span>' + esc(_driverGapText(d)) + '</span></div>' +
          '</div>';
      }).join('') + '</div></section>';
  }

  if (actions.length) {
    h += '<section class="focus-detail-section focus-detail-section--actions">' +
      '<h4 class="focus-section-title">Suggested next steps</h4><ul class="focus-actions">' +
      actions.map(function (a) { return '<li>' + a + '</li>'; }).join('') + '</ul></section>';
  }

  // Dense historical evidence stays available without dominating the default
  // action view. Opening the disclosure retains the aligned full-screen tool.
  h += '<section class="focus-detail-section focus-detail-section--history">' +
    '<details class="focus-history-disclosure">' +
    '<summary><span><strong>Historical results</strong><small>' + FM.length + ' months of scores and service metrics</small></span>' +
    '<span class="focus-history-disclosure__chevron" aria-hidden="true">›</span></summary>' +
    '<div class="focus-history-disclosure__body">' +
    '<div class="focus-month-table-heading" data-table-fullscreen-anchor="true">' +
    '<h4 class="focus-section-title">Month by month</h4></div>' +
    '<div class="table-wrap"><table class="focus-month-table"><thead><tr>' +
    '<th>Month</th><th>' + (isAbsolute ? 'Benchmark' : 'Peer') + ' score (0–100)</th><th>Band</th><th>Drink + Meal NPS</th><th>Drink quality</th><th>Customer-rated efficiency</th><th>Friendliness</th><th>Within 2 minutes</th><th>Average drink wait</th><th>Responses</th>' +
    '</tr></thead><tbody>' +
    FM.map(function (m, i) {
      var r = trend.hist[i];
      if (!r || r.noData || r.incompletePeriod || r[cf] === null || r[cf] === undefined) {
        return '<tr><td>' + esc(m) + '</td><td colspan="9" style="color:var(--muted)">No data</td></tr>';
      }
      return '<tr><td>' + esc(m) + '</td>' +
        '<td style="font-weight:700">' + r[cf] + '</td>' +
        '<td><span class="band ' + G.bc(r[bf]) + '">' + esc(r[bf]) + '</span></td>' +
        '<td' + G.metricRagStyle('n', r.n) + '>' + (r.n !== null && r.n !== undefined ? r.n : '—') + '</td>' +
        '<td' + G.metricRagStyle('dr', r.dr) + '>' + (r.dr !== null && r.dr !== undefined ? r.dr + '%' : '—') + '</td>' +
        '<td' + G.metricRagStyle('ef', r.ef) + '>' + (r.ef !== null && r.ef !== undefined ? r.ef + '%' : '—') + '</td>' +
        '<td' + G.metricRagStyle('fr', r.fr) + '>' + (r.fr !== null && r.fr !== undefined ? r.fr + '%' : '—') + '</td>' +
        '<td' + G.metricRagStyle('ts', r.ts) + '>' + (r.ts !== null && r.ts !== undefined ? r.ts + '%' : '—') + '</td>' +
        '<td' + G.metricRagStyle('at', r.at) + '>' + G.formatSecs(r.at) + '</td>' +
        '<td>' + (r.v !== null && r.v !== undefined ? r.v : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div></div></details></section>';

  // Visit link
  if (row.lastVisit) {
    var vd = new Date(row.lastVisit + 'T00:00:00');
    var vdStr = isNaN(vd.getTime()) ? row.lastVisit : vd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    h += '<button type="button" class="focus-detail__visitbtn" data-visit-report="' + esc(name) + '">Open latest visit report — ' + esc(vdStr) + ' →</button>';
  }

  body.innerHTML = h;
  modal.style.display = 'flex';
  if (!alreadyOpen) _hubLockScroll();
  modal.scrollTop = 0;
  body.scrollTop = 0;
  _updateDetailNav(name);

  if (FM.length >= 2) {
    // Two benchmarks in one pass: the whole estate, and the bakery's current
    // selection — whatever the region/ops/bakery filters resolve to. The
    // selection average spans every bakery in scope, focus and non-focus alike,
    // so it reads as the local bar rather than a focus-only average.
    var st = G.state || {};
    var regionFilter = st.regionFilter || [], opsFilter = st.opsFilter || [], searchBakery = st.searchBakery || [];
    var isFiltered = regionFilter.length > 0 || opsFilter.length > 0 || searchBakery.length > 0;
    var selPeers = {};
    var allAvgByMonth = [], selAvgByMonth = [];
    function inSelection(b) {
      if (regionFilter.length && regionFilter.indexOf(G.getBakeryRegion(b)) < 0) return false;
      if (opsFilter.length && opsFilter.indexOf(G.getBakeryOps(b)) < 0) return false;
      if (searchBakery.length && !searchBakery.some(function (s) { return b.toLowerCase().indexOf(String(s).toLowerCase()) >= 0; })) return false;
      return true;
    }
    FM.forEach(function (m) {
      var allSum = 0, allN = 0, selSum = 0, selN = 0;
      G.state.ALL.forEach(function (r) {
        if (r.m !== m || r.noData || r.incompletePeriod) return;
        var v = r[cf];
        if (v === null || v === undefined || isNaN(v)) return;
        allSum += v; allN++;
        if (inSelection(r.b)) { selSum += v; selN++; selPeers[r.b] = 1; }
      });
      allAvgByMonth.push(allN ? allSum / allN : null);
      selAvgByMonth.push(selN ? selSum / selN : null);
    });
    var trendDatasets = [
      { label: name, data: trend.hist.map(function (r) { return r && !r.noData && !r.incompletePeriod ? r[cf] : null; }), borderColor: bandColor, backgroundColor: 'rgba(178, 42, 36, 0.10)', fill: true, tension: 0.3, pointRadius: 3, borderWidth: 2, spanGaps: false }
    ];
    // Unfiltered, this duplicates the company average; one bakery duplicates its own line.
    if (isFiltered && Object.keys(selPeers).length >= 2) {
      trendDatasets.push({ label: 'Selection average', data: selAvgByMonth, borderColor: 'rgba(43, 108, 176, 0.85)', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 1.5, borderWidth: 1.75, borderDash: [3, 3] });
    }
    trendDatasets.push({ label: 'Company average', data: allAvgByMonth, borderColor: 'rgba(146, 137, 120, 0.55)', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 1.5, borderWidth: 1.75, borderDash: [6, 4] });
    if (isAbsolute) {
      trendDatasets.push({
        label: 'Exit focus threshold (' + _hubState.escapeLine + ')',
        data: FM.map(function () { return _hubState.escapeLine; }),
        borderColor: 'rgba(29, 158, 92, 0.82)',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
        borderWidth: 1.75,
        borderDash: [7, 5]
      });
    }
    G.makeChart('focusDetailChart', {
      type: 'line', data: {
        labels: FM, datasets: trendDatasets
      }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10, boxHeight: 10 } } }, scales: { y: { min: 0, max: 100, ticks: { font: { size: 9 } } }, x: { ticks: { font: { size: 9 } } } }, maintainAspectRatio: false }
    });
  }
};

// Prev/next stepping through the deep-dive modal. The order mirrors whatever
// the support queue currently shows (filters + sort); a bakery opened from
// outside that view (e.g. the Support List table) falls back to the full
// priority-ranked list so the buttons still work.
var _detailNav = null;

function _updateDetailNav(name) {
  var navEl = document.getElementById('focusDetailNav');
  if (!navEl || !_hubState) { _detailNav = null; return; }
  var names = _visibleQueueRows().map(function (r) { return r.name; });
  if (names.indexOf(name) === -1) names = _hubState.rows.map(function (r) { return r.name; });
  var idx = names.indexOf(name);
  if (idx === -1 || names.length < 2) {
    _detailNav = null;
    navEl.style.display = 'none';
    return;
  }
  _detailNav = { names: names, idx: idx };
  navEl.style.display = '';
  var posEl = document.getElementById('focusDetailPos');
  if (posEl) posEl.textContent = (idx + 1) + ' of ' + names.length;
  var prevBtn = document.getElementById('focusDetailPrev');
  var nextBtn = document.getElementById('focusDetailNext');
  if (prevBtn) {
    prevBtn.disabled = idx === 0;
    prevBtn.title = idx > 0 ? 'Previous: ' + names[idx - 1] : '';
  }
  if (nextBtn) {
    nextBtn.disabled = idx === names.length - 1;
    nextBtn.title = idx < names.length - 1 ? 'Next: ' + names[idx + 1] : '';
  }
}

window.GAILS.stepFocusDetail = function (delta) {
  if (!_detailNav) return;
  var idx = _detailNav.idx + delta;
  if (idx < 0 || idx >= _detailNav.names.length) return;
  GAILS.openFocusDetail(_detailNav.names[idx]);
};

window.GAILS.closeFocusDetail = function () {
  var modal = document.getElementById('focusDetailModal');
  if (!modal || modal.style.display === 'none') return;
  GAILS.destroyChart('focusDetailChart');
  modal.style.display = 'none';
  _detailNav = null;
  _hubUnlockScroll();
};

document.addEventListener('click', function (event) {
  var t = event.target;
  if (!t || !t.closest) return;
  if (t.closest('[data-visit-report]')) return; // visit-report.js owns these
  var statCard = t.closest('[data-focus-stat]');
  if (statCard) { GAILS.filterQueueFromStat(statCard.getAttribute('data-focus-stat')); return; }
  var areaCard = t.closest('[data-focus-area]');
  if (areaCard) { GAILS.setFocusArea(areaCard.getAttribute('data-focus-area')); return; }
  var card = t.closest('[data-focus-detail]');
  if (card) GAILS.openFocusDetail(card.getAttribute('data-focus-detail'));
});

document.addEventListener('keydown', function (event) {
  if (event.key === 'Enter' || event.key === ' ') {
    var el = event.target;
    if (el && el.getAttribute && el.getAttribute('data-focus-stat')) {
      event.preventDefault();
      GAILS.filterQueueFromStat(el.getAttribute('data-focus-stat'));
    } else if (el && el.getAttribute && el.getAttribute('data-focus-area')) {
      event.preventDefault();
      GAILS.setFocusArea(el.getAttribute('data-focus-area'));
    } else if (el && el.getAttribute && el.getAttribute('data-focus-detail')) {
      event.preventDefault();
      GAILS.openFocusDetail(el.getAttribute('data-focus-detail'));
    }
    return;
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    var focusModal = document.getElementById('focusDetailModal');
    if (!focusModal || focusModal.style.display === 'none') return;
    // Leave arrows to the visit-report modal if it is stacked on top, and to
    // any form control the user is typing in.
    var vrTop = document.getElementById('visitReportModal');
    if (vrTop && vrTop.style.display !== 'none') return;
    var tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    event.preventDefault();
    GAILS.stepFocusDetail(event.key === 'ArrowLeft' ? -1 : 1);
    return;
  }
  if (event.key === 'Escape') {
    // Leave Escape to the visit-report modal if it is stacked on top.
    var vr = document.getElementById('visitReportModal');
    if (vr && vr.style.display !== 'none') return;
    GAILS.closeFocusDetail();
  }
});

// Shared map controller for the dashboard-wide map tab and the target map sub-tab.
(function () {
  var DEFAULT_CENTER = [52.5, -1.8];
  var DEFAULT_ZOOM = 6;
  var lockedScrollY = 0;

  var NETWORK_LEGEND = {
    relative: [
      { label: 'Top Performance', color: '#1E70C4' },
      { label: 'Above Average', color: '#1D9E5C' },
      { label: 'Below Average', color: '#C97F12' },
      { label: 'Low Performance', color: '#B22A24' },
      { label: 'Not Scored', color: '#8d8d8d' }
    ],
    absolute: [
      { label: 'Exceeding', color: '#1E70C4' },
      { label: 'Meeting', color: '#1D9E5C' },
      { label: 'Approaching', color: '#C97F12' },
      { label: 'Below Standard', color: '#B22A24' },
      { label: 'Not Scored', color: '#8d8d8d' }
    ]
  };

  var NETWORK_HINT = {
    relative: '<span style="color:var(--blue);font-weight:600">&#9679; Top Performance</span> &nbsp;&middot;&nbsp; <span style="color:var(--green);font-weight:600">&#9679; Above Average</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Below Average</span> &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">&#9679; Low Performance</span> &nbsp;&middot;&nbsp; <span style="color:#8d8d8d;font-weight:600">&#9679; Not Scored</span>',
    absolute: '<span style="color:var(--blue);font-weight:600">&#9679; Exceeding</span> &nbsp;&middot;&nbsp; <span style="color:var(--green);font-weight:600">&#9679; Meeting</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Approaching</span> &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">&#9679; Below Standard</span> &nbsp;&middot;&nbsp; <span style="color:#8d8d8d;font-weight:600">&#9679; Not Scored</span>'
  };

  // The focus map is classified by support-priority tier, not performance band,
  // so it can never be misread as a second copy of the network performance map.
  // A dedicated status triad (validated for colour-vision separation) keeps the
  // three tiers cleanly distinct instead of collapsing into one warm hue:
  // High = brand red, Medium = a bright gold (not the brown performance amber),
  // Monitor = a calm cool slate for the "resting" tier.
  var PRIORITY_TIER_COLORS = { critical: '#B22A24', high: '#E3A130', watch: '#78909C' };
  var TARGET_PRIORITY_LEGEND = [
    { label: 'High', color: '#B22A24' },
    { label: 'Medium', color: '#E3A130' },
    { label: 'Monitor', color: '#78909C' }
  ];
  var TARGET_PRIORITY_HINT = '<span style="color:#B22A24;font-weight:600">&#9679; High</span> &nbsp;&middot;&nbsp; <span style="color:#E3A130;font-weight:600">&#9679; Medium</span> &nbsp;&middot;&nbsp; <span style="color:#78909C;font-weight:600">&#9679; Monitor</span> &nbsp;&middot;&nbsp; Colour shows support priority, not performance band. Click a pin for details.';

  var _networkMapAreaState = 'off';
  var _targetMapAreaState = 'off';
  var _networkMapVisitState = 'all';
  var _targetMapVisitState = 'all';

  var MAPS = {
    network: {
      key: 'network',
      elId: 'networkMap',
      statusId: 'networkMapStatus',
      activeSelector: '#tab-map',
      modalTitle: 'Filtered Bakeries Not Mapped',
      emptyMessage: 'No bakeries match the current filters.',
      bandField: 'acb',
      legendItems: NETWORK_LEGEND.absolute,
      statusNote: 'Locations update automatically from the filters above.',
      noDataFallback: true,
      items: [],
      missingItems: [],
      instance: null,
      markerLayer: null,
      areaLayer: null,
      legendControl: null
    },
    target: {
      key: 'target',
      elId: 'targetMap',
      statusId: 'targetMapStatus',
      activeSelector: '[data-target-subtab-panel="map"]',
      modalTitle: 'Focus Bakeries Not Mapped',
      emptyMessage: 'No focus bakeries for the current selection.',
      bandField: 'acb',
      colorMode: 'priority',
      legendItems: TARGET_PRIORITY_LEGEND,
      items: [],
      missingItems: [],
      instance: null,
      markerLayer: null,
      areaLayer: null,
      legendControl: null
    }
  };

  var escapeHtml = GAILS.escapeHtml;

  // Colour for an ops-area boundary from its average score. Peer mode ranks each
  // area against the *other ops areas* (percentile of the area averages) so the four
  // bands stay populated relatively — mirroring the bakery-level peer bands in
  // cei.js — rather than measuring every area against the single network average,
  // which pushed most areas into the top band. Absolute mode bands the area average
  // against the fixed company thresholds. Palette: blue = top, green = above average.
  function getAreaBandColor(areaAvg, bandField, areaAvgVals) {
    if (areaAvg == null || isNaN(areaAvg)) return '#8d8d8d';
    if (bandField === 'acb') {
      if (areaAvg >= 90) return '#1976d2';
      if (areaAvg >= 75) return '#00b853';
      if (areaAvg >= 60) return '#f57c00';
      return '#d32f2f';
    }
    var pct = GAILS.percentileRank(areaAvgVals, areaAvg, false);
    if (pct >= 75) return '#1976d2';
    if (pct >= 50) return '#00b853';
    if (pct >= 25) return '#f57c00';
    return '#d32f2f';
  }

  function buildAreaTooltip(mgr, items, bandField, networkAvg, areaTotal, areaVisited, visitLabel) {
    var scoreField = bandField === 'acb' ? 'ac' : 'c';
    var sum = 0, scored = 0;
    items.forEach(function (item) {
      var s = item[scoreField];
      if (s != null && !isNaN(s)) { sum += s; scored++; }
    });
    var coverageLine = '<br><span style="font-size:0.82em;opacity:0.85">' +
      areaTotal + ' baker' + (areaTotal === 1 ? 'y' : 'ies') + ' &nbsp;&middot;&nbsp; ' +
      areaVisited + ' ' + visitLabel + '</span>';
    var header = '<strong>' + escapeHtml(mgr) + '’s Area</strong>';
    if (scored === 0) return header + coverageLine;
    var areaAvg = Math.round(sum / scored * 10) / 10;
    var diff = Math.round((areaAvg - networkAvg) * 10) / 10;
    var diffStr = diff >= 0 ? '+' + diff : '' + diff;
    return header +
      '<br><span style="font-size:0.82em;opacity:0.85">' + areaAvg + ' &nbsp;&middot;&nbsp; ' + diffStr + ' vs avg</span>' +
      coverageLine;
  }

  // ---- Priority-mode area shading (focus map) ----------------------------
  // Territories are shaded by FOCUS DENSITY — the share of the area's bakeries
  // (focus and not) that are currently in focus — so the map shows which ops
  // areas have the greatest concentration of priority bakeries. Blue = a small share
  // in focus (healthy area), through green and amber, to red = a large share in
  // focus. This matches the network map's convention that red = worse.
  var DENSITY_BANDS = [
    { min: 0.50, color: '#B22A24' }, // red   — half or more of the area in focus
    { min: 0.25, color: '#C97F12' }, // amber
    { min: 0.10, color: '#1D9E5C' }, // green
    { min: 0.00, color: '#1E70C4' }  // blue  — very few in focus
  ];

  function getAreaDensityColor(density) {
    for (var i = 0; i < DENSITY_BANDS.length; i++) {
      if (density >= DENSITY_BANDS[i].min) return DENSITY_BANDS[i].color;
    }
    return DENSITY_BANDS[DENSITY_BANDS.length - 1].color;
  }

  function buildAreaDensityTooltip(mgr, items, focusCount, areaTotal, density, areaVisited, visitLabel) {
    var high = 0, medium = 0, monitor = 0;
    (items || []).forEach(function (item) {
      if (!item) return;
      if (item.supportTier === 'critical') high++;
      else if (item.supportTier === 'high') medium++;
      else monitor++;
    });
    var makeup = [];
    if (high) makeup.push(high + ' High');
    if (medium) makeup.push(medium + ' Medium');
    if (monitor) makeup.push(monitor + ' Monitor');
    var pct = Math.round(density * 100);
    var header = '<strong>' + escapeHtml(mgr) + '’s Area</strong>';
    return header +
      '<br><span style="font-size:0.82em;opacity:0.85"><strong>' + pct + '% in focus</strong>' +
        ' &nbsp;&middot;&nbsp; ' + focusCount + ' of ' + areaTotal + ' baker' + (areaTotal === 1 ? 'y' : 'ies') + '</span>' +
      (makeup.length ? '<br><span style="font-size:0.82em;opacity:0.85">' + makeup.join(', ') + '</span>' : '') +
      '<br><span style="font-size:0.82em;opacity:0.85">' + areaVisited + ' ' + visitLabel + '</span>';
  }

  function pointInLatLngRing(latlng, ring) {
    var x = latlng.lng, y = latlng.lat, inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var xi = ring[i].lng, yi = ring[i].lat;
      var xj = ring[j].lng, yj = ring[j].lat;
      var intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function ringsFromLatLngs(arr) {
    if (!arr || !arr.length) return [];
    if (typeof arr[0].lat === 'number' && typeof arr[0].lng === 'number') return [arr];
    var rings = [];
    arr.forEach(function (sub) { rings = rings.concat(ringsFromLatLngs(sub)); });
    return rings;
  }

  // Approximate point-in-polygon test used as a safety net so hover-triggered
  // area tooltips/highlights can be force-closed even if the DOM never
  // dispatches a mouseout for the layer (can happen with overlapping/
  // reordered SVG paths from bringToFront on adjacent voronoi cells).
  function pointInPolygonLayer(latlng, polygon) {
    var rings = ringsFromLatLngs(polygon.getLatLngs());
    if (!rings.length) return false;
    var inside = false;
    rings.forEach(function (ring) {
      if (pointInLatLngRing(latlng, ring)) inside = !inside;
    });
    return inside;
  }

  function isMapActive(selector) {
    var panel = document.querySelector(selector);
    return !!(panel && panel.classList.contains('active'));
  }

  function renderLegend(cfg) {
    if (!cfg.instance) return;
    if (cfg.legendControl) cfg.instance.removeControl(cfg.legendControl);

    cfg.legendControl = L.control({ position: 'bottomright' });
    cfg.legendControl.onAdd = function () {
      var div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = cfg.legendItems.map(function (item) {
        return '<div><span class="map-legend__dot" style="background:' + item.color + '"></span>' + escapeHtml(item.label) + '</div>';
      }).join('');
      return div;
    };
    cfg.legendControl.addTo(cfg.instance);
  }

  function ensureMap(mapKey) {
    var cfg = MAPS[mapKey];
    var el = document.getElementById(cfg.elId);
    if (!el || typeof L === 'undefined') return;

    if (cfg.instance) {
      cfg.instance.invalidateSize();
      renderLegend(cfg);
      placeMarkers(cfg);
      return;
    }

    cfg.instance = L.map(cfg.elId, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    if (cfg.instance.createPane) {
      var areaPane = cfg.instance.createPane('areaPane');
      areaPane.style.zIndex = 350;
      areaPane.style.pointerEvents = 'auto';
      areaPane.style.mixBlendMode = 'multiply';
    }
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(cfg.instance);

    cfg.areaLayer = L.layerGroup().addTo(cfg.instance);
    cfg.markerLayer = L.layerGroup().addTo(cfg.instance);
    cfg._areaTooltipLayers = [];
    cfg.instance.getContainer().addEventListener('mouseleave', function () {
      (cfg._areaTooltipLayers || []).forEach(function (p) { p.closeTooltip(); });
      cfg._hoveredArea = null;
    });
    cfg.instance.on('mousemove', function (e) {
      var active = cfg._hoveredArea;
      if (!active) return;
      var stillInside = active.polygons.some(function (p) { return pointInPolygonLayer(e.latlng, p); });
      if (!stillInside) {
        active.polygons.forEach(function (p) {
          p.closeTooltip();
          p.setStyle({ fillOpacity: 0.22, weight: 3.5, dashArray: active.dashArray });
        });
        cfg._hoveredArea = null;
      }
    });
    renderLegend(cfg);
    placeMarkers(cfg);
  }

  function getBandPriority(item, bandField) {
    var band = item && item[bandField || 'cb'];
    if (!band) return 0;
    return {
      'Top Performance': 0, Outstanding: 0,
      'Above Average': 1, Exceeding: 1,
      'Below Average': 2, Approaching: 2,
      'Low Performance': 3, 'Below Standard': 3
    }[band] || 0;
  }

  // Brand-palette marker colours (same hues as ABSCOL/legends) so the map
  // pins match every badge, chip and chart instead of generic Material tones.
  var VIBRANT_MAP_COLORS = {
    'Top Performance': '#1E70C4',
    'Above Average': '#1D9E5C',
    'Below Average': '#C97F12',
    'Low Performance': '#B22A24',
    'Exceeding': '#1E70C4',
    'Meeting': '#1D9E5C',
    'Approaching': '#C97F12',
    'Below Standard': '#B22A24',
    'Incomplete': '#8d8d8d',
    'No Data': '#8d8d8d',
    'Default': '#B22A24'
  };

  // Higher tiers draw last so their pins sit on top when markers overlap.
  function getPriorityDrawRank(item) {
    return { watch: 0, high: 1, critical: 2 }[item && item.supportTier] || 0;
  }

  function getMarkerColor(item, bandField, colorMode) {
    if (item && item.incompletePeriod) return VIBRANT_MAP_COLORS['Incomplete'];
    if (item && item.noData) return VIBRANT_MAP_COLORS['No Data'];
    if (colorMode === 'priority') {
      return PRIORITY_TIER_COLORS[item && item.supportTier] || VIBRANT_MAP_COLORS['Default'];
    }
    var band = item && item[bandField || 'cb'];
    return VIBRANT_MAP_COLORS[band] || VIBRANT_MAP_COLORS['Default'];
  }

  function formatLastVisitDate(isoDate) {
    if (!isoDate) return 'No routine visit logged yet';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return 'No routine visit logged yet';
    return 'Last visited ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getPopupHtml(item, color, bandField, colorMode) {
    var siteLabel = GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(item.b) : item.b;
    var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
    var region = GAILS.getBakeryRegion ? GAILS.getBakeryRegion(item.b) : 'Unknown';
    var lastVisit = GAILS.getLastVisitDate ? GAILS.getLastVisitDate(item.b) : null;

    if (item.noData) {
      var statusLabel = 'Not Scored';
      var statusCopy = item.incompletePeriod
        ? 'Some data is available, but not enough to calculate a score for this period'
        : 'No performance data is available for this period';
      var noDataVisitLine = lastVisit
        ? '<button type="button" class="map-popup__visit map-popup__visit--link" data-visit-report="' + escapeHtml(item.b) + '">' + escapeHtml(formatLastVisitDate(lastVisit)) + ' &rarr;</button>'
        : '<div class="map-popup__visit">' + escapeHtml(formatLastVisitDate(lastVisit)) + '</div>';
      return '<div class="map-popup">' +
        '<div class="map-popup__name">' + escapeHtml(siteLabel) + '</div>' +
        '<span class="map-popup__band" style="background:' + color + '">' + escapeHtml(statusLabel) + '</span>' +
        '<div class="map-popup__stats">' + escapeHtml(statusCopy) + '</div>' +
        '<div class="map-popup__mgr">' + escapeHtml(ops) + '</div>' +
        '<div class="map-popup__meta">' + escapeHtml(region) + '</div>' +
        noDataVisitLine +
        '</div>';
    }

    var band = item[(bandField || 'cb')];
    var isAbs = bandField === 'acb';
    var _score = isAbs ? item.ac : item.c;
    var cei = _score != null ? _score : '\u2014';
    var nps = item.n != null ? item.n : '\u2014';
    var volume = item.v != null ? item.v : '\u2014';

    // In priority mode the chip communicates the support tier (matching the pin
    // colour); the performance band stays visible as context on the stats line.
    var isPriority = colorMode === 'priority';
    var chipLabel = isPriority
      ? (_TIER_LABEL[item.supportTier] || 'Unknown') + (item.supportTier === 'watch' ? '' : ' priority')
      : (band || 'Unknown');
    // The Medium gold is too light for the chip's default white text, so give
    // that one tier dark ink; High and Monitor keep white.
    var chipStyle = 'background:' + color + (isPriority && item.supportTier === 'high' ? ';color:#3d2f0e' : '');
    var statsPrefix = isPriority && band ? escapeHtml(band) + ' &nbsp;&middot;&nbsp; ' : '';

    var visitLine = lastVisit
      ? '<button type="button" class="map-popup__visit map-popup__visit--link" data-visit-report="' + escapeHtml(item.b) + '">' + escapeHtml(formatLastVisitDate(lastVisit)) + ' &rarr;</button>'
      : '<div class="map-popup__visit">' + escapeHtml(formatLastVisitDate(lastVisit)) + '</div>';

    return '<div class="map-popup">' +
      '<div class="map-popup__name">' + escapeHtml(siteLabel) + '</div>' +
      '<span class="map-popup__band" style="' + chipStyle + '">' + escapeHtml(chipLabel) + '</span>' +
      '<div class="map-popup__stats">' + statsPrefix + 'Index <strong>' + escapeHtml(cei) + '</strong> &nbsp;&middot;&nbsp; NPS ' + escapeHtml(nps) + ' &nbsp;&middot;&nbsp; Vol ' + escapeHtml(volume) + '</div>' +
      '<div class="map-popup__mgr">' + escapeHtml(ops) + '</div>' +
      '<div class="map-popup__meta">' + escapeHtml(region) + '</div>' +
      visitLine +
      '</div>';
  }

  // Hover-intent delay before the at-a-glance marker tooltip appears.
  var GLANCE_TOOLTIP_DELAY_MS = 350;

  // Compact hover tooltip: bakery name plus the headline score, so users can
  // scan sites without clicking. The click popup remains the full detail view.
  function getGlanceHtml(item, color, bandField) {
    var siteLabel = GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(item.b) : item.b;
    var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px"></span>';
    var scoreStr;
    if (item.noData) {
      scoreStr = 'Not scored';
    } else {
      var s = bandField === 'acb' ? item.ac : item.c;
      scoreStr = s != null ? '' + s : '—';
    }
    return dot + '<strong>' + escapeHtml(siteLabel) + '</strong>' +
      '<span style="opacity:0.7;margin-left:7px">' + escapeHtml(scoreStr) + '</span>';
  }

  function computeVoronoiTerritories(managerGroups) {
    var SENTINEL = '__SENTINEL__';
    var realPts = [];
    Object.keys(managerGroups).forEach(function (mgr) {
      if (mgr === 'Unknown' || mgr === 'Other') return;
      var seen = {};
      managerGroups[mgr].coords.forEach(function (ll) {
        var k = ll[0].toFixed(6) + ',' + ll[1].toFixed(6);
        if (!seen[k]) { seen[k] = true; realPts.push({ lat: ll[0], lng: ll[1], mgr: mgr }); }
      });
    });
    if (realPts.length < 2) return {};

    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    realPts.forEach(function (p) {
      if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    });

    var spread = Math.max(maxLat - minLat, maxLng - minLng);
    var sentPad = spread * 3 + 0.8;

    var pts = realPts.slice();
    var mcLat = (minLat + maxLat) / 2, mcLng = (minLng + maxLng) / 2;
    [[minLat - sentPad, minLng - sentPad], [minLat - sentPad, mcLng], [minLat - sentPad, maxLng + sentPad],
    [mcLat, minLng - sentPad], [mcLat, maxLng + sentPad],
    [maxLat + sentPad, minLng - sentPad], [maxLat + sentPad, mcLng], [maxLat + sentPad, maxLng + sentPad]
    ].forEach(function (c) { pts.push({ lat: c[0], lng: c[1], mgr: SENTINEL }); });

    var n = pts.length;
    var lats = pts.map(function (p) { return p.lat; });
    var lngs = pts.map(function (p) { return p.lng; });
    var mgrs = pts.map(function (p) { return p.mgr; });

    function circumcircle(ia, ib, ic) {
      var ax = lats[ia], ay = lngs[ia], bx = lats[ib], by = lngs[ib], cx = lats[ic], cy = lngs[ic];
      var D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(D) < 1e-12) return null;
      var ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
      var uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
      return { x: ux, y: uy, r2: (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy) };
    }

    var sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity;
    for (var i = 0; i < n; i++) {
      if (lats[i] < sMinX) sMinX = lats[i]; if (lats[i] > sMaxX) sMaxX = lats[i];
      if (lngs[i] < sMinY) sMinY = lngs[i]; if (lngs[i] > sMaxY) sMaxY = lngs[i];
    }
    var dM = Math.max(sMaxX - sMinX, sMaxY - sMinY) * 20;
    lats.push(sMinX - dM, sMinX + dM * 3, sMinX - dM);
    lngs.push(sMinY - dM, sMinY - dM, sMaxY + dM * 3);

    var tris = [{ v: [n, n + 1, n + 2], c: circumcircle(n, n + 1, n + 2) }];

    for (var i = 0; i < n; i++) {
      var px = lats[i], py = lngs[i], bad = [], good = [];
      for (var t = 0; t < tris.length; t++) {
        var ci = tris[t].c;
        if (ci && (px - ci.x) * (px - ci.x) + (py - ci.y) * (py - ci.y) < ci.r2 - 1e-10) { bad.push(tris[t]); }
        else { good.push(tris[t]); }
      }
      var eCnt = {};
      for (var b = 0; b < bad.length; b++) {
        var v = bad[b].v;
        for (var j = 0; j < 3; j++) { var a = v[j], bb = v[(j + 1) % 3]; var k = a < bb ? a + '_' + bb : bb + '_' + a; eCnt[k] = (eCnt[k] || 0) + 1; }
      }
      tris = good;
      var eKs = Object.keys(eCnt);
      for (var ek = 0; ek < eKs.length; ek++) {
        if (eCnt[eKs[ek]] !== 1) continue;
        var vs = eKs[ek].split('_');
        tris.push({ v: [+vs[0], +vs[1], i], c: circumcircle(+vs[0], +vs[1], i) });
      }
    }
    tris = tris.filter(function (t) { return t.v[0] < n && t.v[1] < n && t.v[2] < n; });

    var e2t = {};
    for (var ti = 0; ti < tris.length; ti++) {
      var v = tris[ti].v;
      for (var j = 0; j < 3; j++) { var a = v[j], b = v[(j + 1) % 3]; var k = a < b ? a + '_' + b : b + '_' + a; if (!e2t[k]) e2t[k] = []; e2t[k].push(ti); }
    }

    var mgrSegs = {};
    var e2tKs = Object.keys(e2t);
    for (var ek = 0; ek < e2tKs.length; ek++) {
      var tIdxs = e2t[e2tKs[ek]];
      if (tIdxs.length !== 2) continue;
      var vs = e2tKs[ek].split('_');
      var mA = mgrs[+vs[0]], mB = mgrs[+vs[1]];
      if (mA === mB) continue;
      var c1 = tris[tIdxs[0]].c, c2 = tris[tIdxs[1]].c;
      if (!c1 || !c2) continue;
      var seg = [[c1.x, c1.y], [c2.x, c2.y]];
      if (mA !== SENTINEL) { if (!mgrSegs[mA]) mgrSegs[mA] = []; mgrSegs[mA].push(seg); }
      if (mB !== SENTINEL) { if (!mgrSegs[mB]) mgrSegs[mB] = []; mgrSegs[mB].push(seg); }
    }

    function clipPolyToBounds(poly, b0, b1, b2, b3) {
      function ins(pt, e) { if (e === 0) return pt[1] >= b2; if (e === 1) return pt[1] <= b3; if (e === 2) return pt[0] >= b0; return pt[0] <= b1; }
      function inter(a, b, e) { var t; if (e < 2) { var lng = e ? b3 : b2; t = (lng - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), lng]; } else { var lat = e === 2 ? b0 : b1; t = (lat - a[0]) / (b[0] - a[0]); return [lat, a[1] + t * (b[1] - a[1])]; } }
      var res = poly;
      for (var e = 0; e < 4; e++) { if (!res.length) return []; var inp = res; res = []; for (var i = 0; i < inp.length; i++) { var cur = inp[i], prv = inp[(i + inp.length - 1) % inp.length]; if (ins(cur, e)) { if (!ins(prv, e)) res.push(inter(prv, cur, e)); res.push(cur); } else if (ins(prv, e)) res.push(inter(prv, cur, e)); } }
      return res;
    }

    function ptKey(p) { return p[0].toFixed(8) + '|' + p[1].toFixed(8); }

    var result = {};
    var mgrKs = Object.keys(mgrSegs);
    for (var mi = 0; mi < mgrKs.length; mi++) {
      var mgr = mgrKs[mi];
      var segs = mgrSegs[mgr];
      var adj = {};
      for (var si = 0; si < segs.length; si++) {
        var kA = ptKey(segs[si][0]), kB = ptKey(segs[si][1]);
        if (!adj[kA]) adj[kA] = []; if (!adj[kB]) adj[kB] = [];
        adj[kA].push({ k: kB, pt: segs[si][1] }); adj[kB].push({ k: kA, pt: segs[si][0] });
      }
      // Open-chain segments (ops area territory open on one side, e.g. split across geography)
      // have end-vertices with degree 1. Starting traversal mid-chain fragments it into
      // pieces too short to render. Sort so open-end segments come first and are
      // oriented with the open end as the start vertex, ensuring the full chain is walked.
      var openEnds = {};
      Object.keys(adj).forEach(function (k) { if (adj[k].length === 1) openEnds[k] = true; });
      var orderedSegs = [];
      for (var si = 0; si < segs.length; si++) {
        var kA = ptKey(segs[si][0]), kB = ptKey(segs[si][1]);
        if (openEnds[kA]) orderedSegs.push(segs[si]);
        else if (openEnds[kB]) orderedSegs.push([segs[si][1], segs[si][0]]);
      }
      for (var si = 0; si < segs.length; si++) {
        var kA = ptKey(segs[si][0]), kB = ptKey(segs[si][1]);
        if (!openEnds[kA] && !openEnds[kB]) orderedSegs.push(segs[si]);
      }
      var usedEdges = {}, loops = [];
      for (var si = 0; si < orderedSegs.length; si++) {
        var skA = ptKey(orderedSegs[si][0]), skB = ptKey(orderedSegs[si][1]);
        var eKey = skA < skB ? skA + '~' + skB : skB + '~' + skA;
        if (usedEdges[eKey]) continue;
        usedEdges[eKey] = true;
        var loopPts = [orderedSegs[si][0]], prev = skA, cur = skB, curPt = orderedSegs[si][1], safety = 0;
        while (cur !== skA && safety++ < 20000) {
          var ns = adj[cur] || [], nxt = null;
          for (var ni = 0; ni < ns.length; ni++) {
            if (ns[ni].k === prev) continue;
            var nek = cur < ns[ni].k ? cur + '~' + ns[ni].k : ns[ni].k + '~' + cur;
            if (usedEdges[nek]) continue;
            nxt = ns[ni]; usedEdges[nek] = true; break;
          }
          if (!nxt) break;
          loopPts.push(curPt); prev = cur; cur = nxt.k; curPt = nxt.pt;
        }
        if (loopPts.length >= 3) loops.push(loopPts);
      }
      if (loops.length > 0) {
        var mc = managerGroups[mgr] ? managerGroups[mgr].coords : [];
        var mL = Infinity, mH = -Infinity, mLn = Infinity, mLx = -Infinity;
        mc.forEach(function (c) { if (c[0] < mL) mL = c[0]; if (c[0] > mH) mH = c[0]; if (c[1] < mLn) mLn = c[1]; if (c[1] > mLx) mLx = c[1]; });
        var mg = 0.07;
        var clippedLoops = loops.map(function (lp) { return clipPolyToBounds(lp, mL - mg, mH + mg, mLn - mg, mLx + mg); }).filter(function (cl) { return cl.length >= 3; });
        if (clippedLoops.length > 0) result[mgr] = clippedLoops;
      }
    }
    return result;
  }

  // Months that count as "this period" for visit tracking, including the current
  // month when a rolling window is active. Shared by the visit filter and the
  // area coverage counts so both agree on what "visited in period" means.
  function getPeriodMonths(mapKey) {
    if (mapKey === 'target' && GAILS.getFocusRecentMonths) {
      return GAILS.getFocusRecentMonths();
    }
    var months = (GAILS.state && GAILS.state.selectedMonths) || [];
    var rollingEl = document.getElementById('rollingWindow');
    if (rollingEl && rollingEl.value !== '0' && GAILS.getCurrentMonthLabel) {
      var current = GAILS.getCurrentMonthLabel();
      if (months.indexOf(current) === -1) {
        months = months.concat([current]);
      }
    }
    return months;
  }

  function wasRecentlyVisited(name) {
    var age = _monthsSinceVisit({ lastVisit: GAILS.getLastVisitDate ? GAILS.getLastVisitDate(name) : null });
    return age !== null && age < _VISIT_DUE_MONTHS;
  }

  function getVisitFilteredItems(cfg, items) {
    var list = items || cfg.items;
    var filterState = (cfg.key === 'network' ? _networkMapVisitState : _targetMapVisitState) || 'all';
    if (filterState === 'all') return list;
    var months = getPeriodMonths(cfg.key);
    return list.filter(function (item) {
      var visited = cfg.key === 'target'
        ? wasRecentlyVisited(item.b)
        : GAILS.isBakeryVisitedInPeriod ? GAILS.isBakeryVisitedInPeriod(item.b, months) : false;
      return filterState === 'visited' ? visited : !visited;
    });
  }

  // Names of every bakery matching the active region/ops/bakery filters,
  // regardless of whether they have any scored data for the current period.
  function getFilteredBakeryNames() {
    var G = GAILS;
    var state = G.state || {};
    var regionFilter = state.regionFilter || [];
    var opsFilter = state.opsFilter || [];
    var searchBakery = state.searchBakery || [];
    var names = Object.keys(G.BAKERY_META || {});
    return names.filter(function (name) {
      if (regionFilter.length && regionFilter.indexOf(G.getBakeryRegion(name)) < 0) return false;
      if (opsFilter.length && opsFilter.indexOf(G.getBakeryOps(name)) < 0) return false;
      if (searchBakery.length && !searchBakery.some(function (s) { return name.toLowerCase().indexOf(s.toLowerCase()) >= 0; })) return false;
      return true;
    }).sort();
  }

  // Fills any gap between the scored bakeries for the current period and the full
  // set of bakeries matching the active filters, so a site with no data yet (a
  // freshly added bakery, or "This Month" before any responses come in) still gets
  // a grey "no data" pin instead of disappearing from the map entirely.
  function buildMergedItems(cfg) {
    var G = GAILS;
    var byName = {};
    cfg.items.forEach(function (item) {
      var key = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(item.b) : item.b;
      byName[key] = item;
    });
    return getFilteredBakeryNames().map(function (name) {
      return byName[name] || { b: name, noData: true };
    });
  }

  function placeMarkers(cfg) {
    var statusEl = document.getElementById(cfg.statusId);
    if (!cfg.instance || !cfg.markerLayer) return;
    cfg.markerLayer.clearLayers();
    if (cfg.areaLayer) cfg.areaLayer.clearLayers();
    cfg.areaPolygons = {};
    cfg._areaTooltipLayers = [];
    cfg._hoveredArea = null;

    // The dashboard normally fills gaps with grey "Not Scored" pins so bakeries
    // without a record for the selected period remain visible. Once a band is
    // selected, cfg.items has already been narrowed by getData(); merging the
    // full bakery directory back in would incorrectly turn every out-of-band
    // bakery into a "Not Scored" pin.
    var hasBandFilter = !!(GAILS.state && GAILS.state.bandFilter);
    var sourceItems = cfg.noDataFallback && !hasBandFilter ? buildMergedItems(cfg) : cfg.items;

    var visibleItems = getVisitFilteredItems(cfg, sourceItems);

    if (!sourceItems.length || !visibleItems.length) {
      cfg.missingItems = [];
      cfg.instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      if (statusEl) statusEl.textContent = sourceItems.length ? 'No bakeries match the current visit filter.' : cfg.emptyMessage;
      return;
    }

    var showAreas = (cfg.key === 'network' ? _networkMapAreaState : _targetMapAreaState) === 'on';
    if (showAreas && cfg.instance && cfg.areaLayer && visibleItems.length > 0) {
      var managerGroups = {};
      visibleItems.forEach(function (item) {
        var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
        if (!managerGroups[ops]) managerGroups[ops] = { coords: [], items: [] };
        managerGroups[ops].items.push(item);
        var meta = GAILS.getBakeryMeta ? GAILS.getBakeryMeta(item.b) : GAILS.BAKERY_META[item.b];
        var ll = meta && meta.ll;
        if (ll) managerGroups[ops].coords.push(ll);
      });

      var voronoiPolys = computeVoronoiTerritories(managerGroups);
      var AREA_DASH_PATTERNS = [null, '8 5', '4 4', '12 4 4 4', '2 5'];
      var mgrIndex = 0;
      var _areaScoreField = cfg.bandField === 'acb' ? 'ac' : 'c';
      var _netSum = 0, _netCount = 0;
      visibleItems.forEach(function (item) {
        var s = item[_areaScoreField];
        if (s != null && !isNaN(s)) { _netSum += s; _netCount++; }
      });
      var networkAvg = _netCount > 0 ? _netSum / _netCount : 0;

      // Average score per ops area, plus the spread of those averages, so peer mode
      // can band each area against the other areas (see getAreaBandColor).
      function _areaAverage(items) {
        var sum = 0, n = 0;
        items.forEach(function (item) {
          var s = item[_areaScoreField];
          if (s != null && !isNaN(s)) { sum += s; n++; }
        });
        return n > 0 ? sum / n : null;
      }
      var _areaAvgByMgr = {};
      Object.keys(managerGroups).forEach(function (mgr) {
        if (mgr === 'Unknown' || mgr === 'Other') return;
        _areaAvgByMgr[mgr] = _areaAverage(managerGroups[mgr].items);
      });
      var _areaAvgVals = Object.keys(_areaAvgByMgr)
        .map(function (m) { return _areaAvgByMgr[m]; })
        .filter(function (v) { return v != null; });

      // Priority-mode density needs the TOTAL bakeries per area (focus and not),
      // taken from the full directory under the current filters, as the
      // denominator for each area's focus share.
      var _isPriorityAreas = cfg.colorMode === 'priority';
      var _areaDirTotals = {};
      if (_isPriorityAreas) {
        getFilteredBakeryNames().forEach(function (name) {
          var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(name) : 'Unknown';
          _areaDirTotals[ops] = (_areaDirTotals[ops] || 0) + 1;
        });
      }

      // Coverage per area from the full source set (before the visit filter) so the
      // tooltip reports the true area size and how many were visited this period,
      // regardless of which visit filter is active.
      var _periodMonths = getPeriodMonths(cfg.key);
      var areaTotals = {}, areaVisited = {};
      sourceItems.forEach(function (item) {
        var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
        if (areaTotals[ops] == null) { areaTotals[ops] = 0; areaVisited[ops] = 0; }
        areaTotals[ops]++;
        var v = cfg.key === 'target'
          ? wasRecentlyVisited(item.b)
          : GAILS.isBakeryVisitedInPeriod ? GAILS.isBakeryVisitedInPeriod(item.b, _periodMonths) : false;
        if (v) areaVisited[ops]++;
      });

      Object.keys(managerGroups).forEach(function (mgr) {
        if (mgr === 'Unknown' || mgr === 'Other') return;
        var group = managerGroups[mgr];
        var total = areaTotals[mgr] != null ? areaTotals[mgr] : group.items.length;
        var visited = areaVisited[mgr] != null ? areaVisited[mgr] : 0;
        var visitLabel = cfg.key === 'target' ? 'visited recently' : 'visited this period';
        // Priority map: colour the territory by focus density (share of the
        // area's bakeries currently in focus). Network map: keep the
        // performance-band colour. Both use the colour for stroke and fill.
        var strokeColor, fillColor, tooltip;
        if (_isPriorityAreas) {
          var focusCount = total; // sourceItems on the focus map are the focus bakeries
          var areaBakeryTotal = Math.max(_areaDirTotals[mgr] || 0, focusCount);
          var density = areaBakeryTotal > 0 ? Math.min(1, focusCount / areaBakeryTotal) : 0;
          strokeColor = fillColor = getAreaDensityColor(density);
          tooltip = buildAreaDensityTooltip(mgr, group.items, focusCount, areaBakeryTotal, density, visited, visitLabel);
        } else {
          strokeColor = fillColor = getAreaBandColor(_areaAvgByMgr[mgr], cfg.bandField, _areaAvgVals);
          tooltip = buildAreaTooltip(mgr, group.items, cfg.bandField, networkAvg, total, visited, visitLabel);
        }
        var dashArray = AREA_DASH_PATTERNS[mgrIndex % AREA_DASH_PATTERNS.length] || null;
        mgrIndex++;

        var polyList = voronoiPolys[mgr];
        if (!polyList || !polyList.length) return;

        var polygons = polyList.map(function (poly) {
          var polygon = L.polygon(poly, {
            color: strokeColor,
            weight: 3.5,
            opacity: 1.0,
            dashArray: dashArray,
            fillColor: fillColor,
            fillOpacity: 0.22,
            lineJoin: 'round',
            pane: 'areaPane'
          });
          polygon._origDash = dashArray;
          polygon._isPolyline = false;
          polygon.bindTooltip(tooltip, { sticky: true, className: 'map-area-tooltip', interactive: false });
          cfg._areaTooltipLayers.push(polygon);
          return polygon;
        });
        polygons.forEach(function (polygon) {
          polygon.on('mouseover', function () {
            cfg._areaTooltipLayers.forEach(function (p) { if (p !== polygon) p.closeTooltip(); });
            polygons.forEach(function (p) { p.setStyle({ fillOpacity: 0.4, weight: 4.5, dashArray: null }); p.bringToFront(); });
            cfg._hoveredArea = { polygons: polygons, dashArray: dashArray };
          });
          polygon.on('mouseout', function () {
            polygon.closeTooltip();
            polygons.forEach(function (p) { p.setStyle({ fillOpacity: 0.22, weight: 3.5, dashArray: dashArray }); });
            if (cfg._hoveredArea && cfg._hoveredArea.polygons === polygons) cfg._hoveredArea = null;
          });
          cfg.areaLayer.addLayer(polygon);
        });
        cfg.areaPolygons[mgr] = polygons;
      });
    }

    var bounds = [];
    var placed = 0;
    var missing = [];
    var bf = cfg.bandField || 'cb';
    var items = [].concat(visibleItems).sort(function (a, b) {
      var aNoData = !!a.noData, bNoData = !!b.noData;
      if (aNoData && bNoData) return (a.b || '').localeCompare(b.b || '');
      if (aNoData !== bNoData) return aNoData ? 1 : -1;
      if (cfg.colorMode === 'priority') {
        var tierDelta = getPriorityDrawRank(a) - getPriorityDrawRank(b);
        if (tierDelta !== 0) return tierDelta;
        return (a.supportPriority || 0) - (b.supportPriority || 0);
      }
      var bandDelta = getBandPriority(a, bf) - getBandPriority(b, bf);
      if (bandDelta !== 0) return bandDelta;
      return (a.c || 0) - (b.c || 0);
    });

    items.forEach(function (item) {
      var meta = GAILS.getBakeryMeta ? GAILS.getBakeryMeta(item.b) : GAILS.BAKERY_META[item.b];
      var ll = meta && meta.ll;
      if (!ll) {
        missing.push(item.b);
        return;
      }

      var color = getMarkerColor(item, bf, cfg.colorMode);
      var marker = L.circleMarker(ll, {
        radius: 9,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.88
      });
      marker.bindPopup(getPopupHtml(item, color, bf, cfg.colorMode));
      var glanceHtml = getGlanceHtml(item, color, bf);
      (function (ops) {
        marker.on('mouseover', function () {
          (cfg._areaTooltipLayers || []).forEach(function (p) { p.closeTooltip(); });
          cfg._hoveredArea = null;
          // At-a-glance tooltip after a short hover-intent delay; click opens
          // the full popup. Bound lazily with permanent:true so Leaflet's own
          // instant open-on-hover behaviour never kicks in.
          clearTimeout(marker._glanceTimer);
          marker._glanceTimer = setTimeout(function () {
            if (!marker._map || marker.isPopupOpen()) return;
            if (marker.getTooltip()) {
              marker.openTooltip();
            } else {
              marker.bindTooltip(glanceHtml, {
                permanent: true,
                direction: 'top',
                offset: [0, -10],
                className: 'map-name-tooltip',
                interactive: false
              });
            }
          }, GLANCE_TOOLTIP_DELAY_MS);
          var areas = cfg.areaPolygons && cfg.areaPolygons[ops];
          if (!areas) return;
          (Array.isArray(areas) ? areas : [areas]).forEach(function (area) {
            if (area._isPolyline) {
              area.setStyle({ opacity: 0.95, weight: 9, dashArray: null });
            } else {
              area.setStyle({ fillOpacity: 0.28, weight: 3.5, dashArray: null });
            }
            area.bringToFront();
          });
        });
        marker.on('mouseout', function () {
          clearTimeout(marker._glanceTimer);
          marker.closeTooltip();
          var areas = cfg.areaPolygons && cfg.areaPolygons[ops];
          if (!areas) return;
          (Array.isArray(areas) ? areas : [areas]).forEach(function (area) {
            area.setStyle({ fillOpacity: 0.1, weight: 2, dashArray: area._origDash });
          });
        });
        marker.on('click', function () {
          clearTimeout(marker._glanceTimer);
          marker.closeTooltip();
        });
      }(GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown'));
      cfg.markerLayer.addLayer(marker);
      bounds.push(ll);
      placed++;
    });

    if (bounds.length > 1) {
      cfg.instance.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
    } else if (bounds.length === 1) {
      cfg.instance.setView(bounds[0], 14);
    } else {
      cfg.instance.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    }

    cfg.missingItems = missing.slice().sort(function (a, b) {
      return a.localeCompare(b);
    }).map(function (name) {
      return {
        bakery: GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(name) : name,
        region: GAILS.getBakeryRegion ? GAILS.getBakeryRegion(name) : 'Unknown',
        ops: GAILS.getBakeryOps ? GAILS.getBakeryOps(name) : 'Unknown'
      };
    });

    var total = visibleItems.length;
    var msg = placed + ' of ' + total + ' baker' + (total === 1 ? 'y' : 'ies') + ' mapped.';
    var noDataCount = items.filter(function (it) { return it.noData; }).length;
    if (noDataCount === total) {
      msg = 'No sites could be scored for this period — showing ' + msg.charAt(0).toLowerCase() + msg.slice(1);
    } else if (noDataCount > 0) {
      msg += ' ' + noDataCount + ' site' + (noDataCount === 1 ? '' : 's') + ' not scored this period.';
    }
    if (statusEl) {
      var note = cfg.statusNote ? ' <span class="target-map-status__note">&middot; ' + cfg.statusNote + '</span>' : '';
      if (missing.length) {
        statusEl.innerHTML = escapeHtml(msg) + ' <button type="button" class="target-map-status__link" data-unmapped-trigger="' + cfg.key + '">' + missing.length + ' site' + (missing.length === 1 ? '' : 's') + ' not mapped</button>.' + note;
      } else {
        statusEl.innerHTML = escapeHtml(msg) + note;
      }
    }
  }

  // Console diagnostic: for the given bakery names (or the network map's current
  // "no data" list if none given), shows why each is/isn't matching a real data
  // record for the current filters — the resolved canonical key, whether that key
  // exists in BAKERY_META, and the raw item.b values in the current dataset whose
  // resolved key equals it. Run GAILS.debugMapMatch() in the browser console.
  window.GAILS.debugMapMatch = function (names) {
    var G = GAILS;
    var cfg = MAPS.network;
    var targetNames = names && names.length ? names : buildMergedItems(cfg).filter(function (it) { return it.noData; }).map(function (it) { return it.b; });
    if (!targetNames.length) {
      console.log('[debugMapMatch] Nothing currently flagged as no-data on the network map.');
      return;
    }
    var rawByResolvedKey = {};
    (cfg.items || []).forEach(function (item) {
      var key = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(item.b) : item.b;
      if (!rawByResolvedKey[key]) rawByResolvedKey[key] = [];
      rawByResolvedKey[key].push(item.b);
    });
    targetNames.forEach(function (name) {
      var inMeta = !!(G.BAKERY_META && G.BAKERY_META[name]);
      var matches = rawByResolvedKey[name] || [];
      console.log(
        '[debugMapMatch]', JSON.stringify(name),
        '| in BAKERY_META:', inMeta,
        '| raw record names resolving to this key:', matches.length ? matches : '(none found in current dataset for this period)'
      );
    });
  };

  function storeMapItems(mapKey, items) {
    var cfg = MAPS[mapKey];
    cfg.items = [].concat(items);
    if (cfg.instance && isMapActive(cfg.activeSelector)) {
      placeMarkers(cfg);
    }
  }

  window.GAILS.storeDashboardMapData = function (items) {
    storeMapItems('network', items);
  };

  window.GAILS.initDashboardMap = function () {
    ensureMap('network');
  };

  window.GAILS.storeMapTargets = function (targets) {
    storeMapItems('target', targets);
  };

  window.GAILS.initTargetMap = function () {
    ensureMap('target');
  };

  window.GAILS.setTargetMapMetric = function (metric) {
    var cfg = MAPS.target;
    var isAbsolute = metric === 'absolute';
    // Only the underlying score field changes with the metric; the focus map is
    // always classified by support-priority tier, so the legend/hint stay fixed.
    cfg.bandField = isAbsolute ? 'acb' : 'cb';
    cfg.legendItems = TARGET_PRIORITY_LEGEND;

    var hintEl = document.getElementById('targetMapLegendHint');
    if (hintEl) hintEl.innerHTML = TARGET_PRIORITY_HINT;

    if (cfg.instance) {
      renderLegend(cfg);
      placeMarkers(cfg);
    }
  };

  window.GAILS.setNetworkMapMetric = function (metric) {
    var cfg = MAPS.network;
    var isAbsolute = metric === 'absolute';
    cfg.bandField = isAbsolute ? 'acb' : 'cb';
    cfg.legendItems = isAbsolute ? NETWORK_LEGEND.absolute : NETWORK_LEGEND.relative;

    var hintEl = document.getElementById('networkMapLegendHint');
    if (hintEl) hintEl.innerHTML = isAbsolute ? NETWORK_HINT.absolute : NETWORK_HINT.relative;

    if (cfg.instance) {
      renderLegend(cfg);
      placeMarkers(cfg);
    }
  };

  window.GAILS.setNetworkMapArea = function (state) {
    _networkMapAreaState = state;
    var cfg = MAPS.network;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setTargetMapArea = function (state) {
    _targetMapAreaState = state;
    var cfg = MAPS.target;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setNetworkMapVisitFilter = function (state) {
    _networkMapVisitState = state;
    var cfg = MAPS.network;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setTargetMapVisitFilter = function (state) {
    _targetMapVisitState = state;
    var cfg = MAPS.target;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  // Re-renders any active maps whose visit filter is not "all", so a fresh
  // routineVisits sync (js/auth.js) is reflected without needing a manual
  // filter toggle or period change.
  window.GAILS.refreshMapVisitFilters = function () {
    Object.keys(MAPS).forEach(function (key) {
      var cfg = MAPS[key];
      var filterState = key === 'network' ? _networkMapVisitState : _targetMapVisitState;
      if (filterState !== 'all' && cfg.instance) {
        placeMarkers(cfg);
      }
    });
  };

  // Recomputes a map's tile layout after its container is resized (e.g. when it
  // is toggled into or out of full-screen). Fires a couple of delayed passes so
  // Leaflet settles once any CSS transition on the container has finished.
  window.GAILS.invalidateMapSize = function (key) {
    var cfg = MAPS[key];
    if (!cfg || !cfg.instance) return;
    var run = function () { cfg.instance.invalidateSize(); };
    run();
    setTimeout(run, 60);
    setTimeout(run, 260);
  };

  function lockBackgroundScroll() {
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    document.documentElement.classList.add('drill-modal-open');
    document.body.classList.add('drill-modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + lockedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
  }

  function unlockBackgroundScroll() {
    document.documentElement.classList.remove('drill-modal-open');
    document.body.classList.remove('drill-modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    window.scrollTo(0, lockedScrollY);
  }

  window.GAILS.openUnmappedSitesModal = function (mapKey) {
    var cfg = MAPS[mapKey];
    var modal = document.getElementById('unmappedSitesModal');
    var titleEl = document.getElementById('unmappedSitesTitle');
    var subtitleEl = document.getElementById('unmappedSitesSubtitle');
    var summaryEl = document.getElementById('unmappedSitesSummary');
    var tableBody = document.getElementById('unmappedSitesTableBody');
    if (!cfg || !modal || !titleEl || !subtitleEl || !summaryEl || !tableBody) return;

    var items = cfg.missingItems || [];
    titleEl.textContent = cfg.modalTitle;
    subtitleEl.textContent = items.length
      ? 'These bakeries are included in the current map view but do not yet have saved coordinates.'
      : 'All visible bakeries currently have saved map coordinates.';

    summaryEl.innerHTML = [
      { v: items.length, l: 'Unmapped Sites', col: 'var(--red)' },
      { v: cfg.items.length, l: 'Visible Sites', col: 'var(--accent)' }
    ].map(function (k) {
      return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + escapeHtml(k.v) + '</div><div class="target-stat-card__label">' + escapeHtml(k.l) + '</div></div>';
    }).join('');

    tableBody.innerHTML = items.length
      ? items.map(function (item) {
        return '<tr>' +
          '<td>' + escapeHtml(item.bakery) + '</td>' +
          '<td>' + escapeHtml(item.region) + '</td>' +
          '<td>' + escapeHtml(item.ops) + '</td>' +
          '</tr>';
      }).join('')
      : '<tr><td colspan="3" style="text-align:center;color:var(--muted);padding:26px 12px">No unmapped bakeries for this view.</td></tr>';

    modal.style.display = 'flex';
    lockBackgroundScroll();
  };

  window.GAILS.closeUnmappedSitesModal = function () {
    var modal = document.getElementById('unmappedSitesModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  document.addEventListener('click', function (event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-unmapped-trigger]') : null;
    if (!trigger) return;
    window.GAILS.openUnmappedSitesModal(trigger.getAttribute('data-unmapped-trigger'));
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    window.GAILS.closeUnmappedSitesModal();
  });
})();

window.GAILS.renderTargets = function (data) {
  var G = GAILS;
  var state = G.state;
  var isAbsolute = state.targetMetric !== 'relative';
  var bf = isAbsolute ? 'acb' : 'cb';
  var cf = isAbsolute ? 'ac' : 'c';
  var highBand = isAbsolute ? 'Below Standard' : 'Low Performance';
  var lowBand = isAbsolute ? 'Approaching' : 'Below Average';

  var focusContext = G.buildFocusDataset
    ? G.buildFocusDataset({ isAbsolute: isAbsolute })
    : {
      data: [].concat(data || []), onboarding: [], dataReview: [],
      closedMonths: state.selectedMonths || [], recentMonths: (state.selectedMonths || []).slice(-6),
      latestClosedMonth: (state.selectedMonths || []).slice(-1)[0] || null
    };
  data = focusContext.data;
  G._focusDataContext = focusContext;

  var targets = [].concat(data).filter(function (b) {
    return b[bf] === highBand || b[bf] === lowBand;
  }).sort(function (a, b) { return a[cf] - b[cf]; });

  _renderFocusDataStatus(focusContext, targets);
  // The hub computes and attaches each bakery's support-priority tier onto the
  // snapshot, so it must run before the map is fed those records.
  _renderFocusHub(targets, data, bf, cf, highBand, lowBand, isAbsolute);
  G.storeMapTargets(targets);
  _renderInsights(targets, bf, cf, lowBand, isAbsolute);
  _renderTargetTable(targets, bf, cf, highBand, isAbsolute);
  _renderTargetTrends(targets, bf, cf, highBand, lowBand, isAbsolute);
  return focusContext;
};

function _renderInsights(targets, bf, cf, lowBand, isAbsolute) {
  var insightsEl = document.getElementById('targetInsights');
  var insightsTitle = document.getElementById('targetInsightsTitle');
  var insightsDetails = document.getElementById('focusInsightsDetails');
  if (!insightsEl) return;
  if (insightsTitle) insightsTitle.style.display = '';
  if (insightsDetails) insightsDetails.style.display = targets.length === 0 ? 'none' : '';
  if (targets.length === 0) { insightsEl.innerHTML = ''; return; }

  var focusCounts = { 'Drink + Meal NPS': [], 'Overall Efficiency': [], 'Drink Quality': [], Friendliness: [], 'Coffee Efficiency': [] };
  targets.forEach(function (b) {
    var areas = [
      { name: 'Drink + Meal NPS', pct: b.np },
      { name: 'Overall Efficiency', pct: b.ep }, { name: 'Drink Quality', pct: b.dp },
      { name: 'Friendliness', pct: b.fp }, { name: 'Coffee Efficiency', pct: b.ap },
    ].sort(function (a, x) { return a.pct - x.pct; });
    focusCounts[areas[0].name].push(b.b);
  });
  var topWeakness = Object.entries(focusCounts).sort(function (a, b) { return b[1].length - a[1].length; })[0];
  var quickWinLine = (isAbsolute ? 75 : 50) - 5;
  var quickWins = targets.filter(function (b) { return b[bf] === lowBand && b[cf] >= quickWinLine; });
  var quickWinsThreshold = isAbsolute ? 'close to Meeting' : 'close to Good';
  var weakAreas = Object.entries(focusCounts).filter(function (e) { return e[1].length > 0; }).sort(function (a, b) { return b[1].length - a[1].length; });

  var h = '<div class="insight-grid">';

  h += '<div class="insight-card"><h4>\uD83C\uDF31 Biggest Growth Opportunity</h4><p><span class="stat">' + topWeakness[1].length + '</span> of ' + targets.length + ' bakeries \u2014 <strong>' + topWeakness[0] + '</strong></p><div class="action">\u2192 Prioritise ' + topWeakness[0].toLowerCase() + ' coaching</div></div>';

  h += '<div class="insight-card"><h4>\u2B50 Quick Wins</h4>';
  if (quickWins.length > 0) {
    h += '<p><span class="stat">' + quickWins.length + '</span> baker' + (quickWins.length === 1 ? 'y' : 'ies') + ' within 5 points of leaving focus &mdash; ' + quickWinsThreshold + '</p><ul>' + quickWins.map(function (b) { return '<li><strong>' + b.b + '</strong> \u2014 ' + b[cf] + '</li>'; }).join('') + '</ul><div class="action">\u2192 Focus here for fastest gains</div>';
  } else {
    h += '<p style="color:var(--muted)">No bakeries within quick-win range of ' + (isAbsolute ? 'Meeting' : 'Above Average') + ' yet.</p>';
  }
  h += '</div>';

  h += '<div class="insight-card"><h4>\uD83D\uDCCB Coaching Priorities</h4>';
  weakAreas.forEach(function (entry) {
    var pct = Math.round((entry[1].length / targets.length) * 100);
    h += '<div class="coaching-area"><span class="coaching-area__name">' + entry[0] + '</span><span class="coaching-area__count">' + entry[1].length + ' baker' + (entry[1].length === 1 ? 'y' : 'ies') + '</span></div><div class="coaching-area__bar"><div class="coaching-area__fill" style="width:' + pct + '%"></div></div>';
  });
  h += '</div>';

  h += '</div>';
  insightsEl.innerHTML = h;
}

function _renderTargetTable(targets, bf, cf, highBand, isAbsolute) {
  var G = GAILS;
  var supportRows = _hubState && _hubState.rows ? _hubState.rows : [];
  var supportByName = {};
  supportRows.forEach(function (row) { supportByName[row.name] = row; });
  var tableTargets = [].concat(targets).sort(function (a, b) {
    var aSupport = supportByName[a.b];
    var bSupport = supportByName[b.b];
    if (aSupport && bSupport) return aSupport.rank - bSupport.rank;
    if (aSupport || bSupport) return aSupport ? -1 : 1;
    return (a[cf] || 0) - (b[cf] || 0);
  });
  var getFocus = function (b) {
    var list = [
      { name: 'Drink + Meal NPS', pct: b.np },
      { name: 'Overall Efficiency', pct: b.ep }, { name: 'Drink Quality', pct: b.dp },
      { name: 'Friendliness', pct: b.fp }, { name: 'Coffee Efficiency', pct: b.ap }
    ];
    if (b.at !== null && b.at !== undefined && !isNaN(b.at)) {
      list.push({ name: 'Avg Wait Time', pct: b.atp });
    }
    return list.sort(function (a, x) { return a.pct - x.pct; })[0];
  };
  var focusLabel = function (pct) {
    if (pct <= 10) return 'among the lowest in the company — biggest single opportunity';
    if (pct <= 25) return 'well below most bakeries — clear opportunity to improve';
    return 'below the company average — room to grow';
  };
  var ceiHeader = isAbsolute ? 'Benchmark Score' : 'Peer Score';
  var altCeiHeader = isAbsolute ? 'Peer Score' : 'Benchmark Score';
  var altCeiField = isAbsolute ? 'c' : 'ac';
  var bandHeader = isAbsolute ? 'Benchmark Band' : 'Peer Band';

  // Null-safe rendering + RAG thresholds for the KV/NPS-split columns,
  // matching the league table (js/tables.js) so the two views never disagree.
  var hasVal = function (v) { return v !== null && v !== undefined && !isNaN(v); };
  var numOrDash = function (v) { return hasVal(v) ? v : '—'; };
  var pctOrDash = function (v) { return hasVal(v) ? v + '%' : '—'; };
  document.getElementById('targetTable').innerHTML = targets.length === 0
    ? '<p style="text-align:center;color:var(--muted);padding:32px 0">No eligible bakeries in ' + highBand + ' or adjacent bands through the latest completed month.</p>'
    : '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">\ud83c\udf31 Support Priority List</h3><p class="tracker-table-header__copy"><strong>Priority</strong> is ranked by the same support-priority calculation as Priorities: performance gap (50 points), recent falls (25), time in focus (15), and routine-visit recency (10). <strong>Biggest Lever</strong> = each bakery&rsquo;s lowest-scoring area, where improvement lifts the overall score most. Click a bakery name for its full performance breakdown.</p></div></div><div class="table-wrap table-wrap--support-priority"><table data-nps-splits class="support-priority-table ' + (G.npsSplitsExpanded ? '' : 'nps-splits-collapsed') + '"><thead><tr><th><span class="th-label-full">Priority</span><span class="th-label-short">#</span></th><th>Bakery</th><th>Region</th><th>Ops Area</th><th>' + ceiHeader + '</th><th>' + altCeiHeader + '</th><th>' + bandHeader + '</th><th>NPS (DRINK &amp; MEAL) ' + G.npsSplitToggleHtml() + '</th><th class="nps-split-col">NPS Coffee</th><th class="nps-split-col">NPS Meal</th><th class="nps-split-col">NPS (All)</th><th>Vol</th><th>Conf</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>&le;30s</th><th>&le;2m</th><th>&gt;5m</th><th>Avg Wait</th><th>Average Drinks Per Month</th><th>Biggest Lever</th></tr></thead><tbody>' +
    tableTargets.map(function (b, i) {
      var focus = getFocus(b);
      var focusColor = focus.pct <= 10 ? 'var(--red)' : 'var(--amber)';
      // Low volume is already represented by the dedicated Conf column; keep
      // it out of the frozen Bakery cell so names do not inflate the pane.
      var confTag = '';
      if (b.focusDataStatus === 'provisional') confTag += ' <span style="font-size:0.58rem;color:var(--amber);font-weight:700">PROVISIONAL · INCOMPLETE DATA</span>';
      var support = supportByName[b.b];
      var priorityRank = support ? support.rank : i + 1;
      return '<tr>' +
        '<td style="font-weight:700">' + priorityRank + '</td>' +
        '<td><button type="button" class="focus-name-link" data-focus-detail="' + G.escapeHtml(b.b) + '">' + b.b + '</button>' + confTag + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b[cf] + '</td>' +
        '<td style="font-weight:600">' + b[altCeiField] + '</td>' +
        '<td><span class="band ' + G.bc(b[bf]) + '">' + b[bf] + '</span></td>' +
        '<td' + G.metricRagStyle('n', b.n) + '>' + b.n + '</td>' +
        '<td class="nps-split-col"' + G.metricRagStyle('nc', b.nc) + '>' + numOrDash(b.nc) + '</td>' +
        '<td class="nps-split-col"' + G.metricRagStyle('nm', b.nm) + '>' + numOrDash(b.nm) + '</td>' +
        '<td class="nps-split-col"' + G.metricRagStyle('na', b.na) + '>' + numOrDash(b.na) + '</td>' +
        '<td>' + b.v + '</td>' +
        '<td><span class="conf ' + G.bc(b.co) + '">' + b.co + '</span></td>' +
        '<td' + G.metricRagStyle('dr', b.dr) + '>' + b.dr + '%</td>' +
        '<td' + G.metricRagStyle('ef', b.ef) + '>' + b.ef + '%</td>' +
        '<td' + G.metricRagStyle('fr', b.fr) + '>' + b.fr + '%</td>' +
        '<td>' + pctOrDash(b.s30) + '</td>' +
        '<td' + G.metricRagStyle('ts', b.ts) + '>' + b.ts + '%</td>' +
        '<td' + G.metricRagStyle('o5', b.o5) + '>' + b.o5 + '%</td>' +
        '<td' + G.metricRagStyle('at', b.at) + '>' + G.formatSecs(b.at) + '</td>' +
        '<td>' + numOrDash(b.tdMonthlyAvg) + '</td>' +
        '<td style="font-weight:600;color:' + focusColor + '">' + focus.name + ' &mdash; ' + focusLabel(focus.pct) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTable'));
  G.syncNpsSplitTables();
}

function _renderTargetTrends(targets, bf, cf, highBand, lowBand, isAbsolute) {
  var G = GAILS;
  var state = G.state;
  var palette = isAbsolute ? G.ABSCOL : G.COL;
  var allBandNames = isAbsolute
    ? ['Below Standard', 'Approaching', 'Meeting', 'Exceeding']
    : ['Low Performance', 'Below Average', 'Above Average', 'Top Performance'];
  var FM = G._focusDataContext && G._focusDataContext.closedMonths
    ? G._focusDataContext.closedMonths
    : state.selectedMonths || [];
  var targetNames = targets.map(function (b) { return b.b; });
  var THRESHOLD = 3;

  if (FM.length < 2) {
    _clearTargetTrendCharts();
    document.getElementById('trendSummaryCards').innerHTML = '';
    document.getElementById('sparklineGrid').innerHTML = '';
    document.getElementById('targetTrendTable').innerHTML = '';
    _setTargetTrendState(false, 'At least two completed months are needed to view focus bakery trends.');
    return;
  }

  if (targets.length === 0) {
    _clearTargetTrendCharts();
    document.getElementById('trendSummaryCards').innerHTML = '';
    document.getElementById('sparklineGrid').innerHTML = '';
    document.getElementById('targetTrendTable').innerHTML = '';
    _setTargetTrendState(false, 'No eligible bakeries are in the ' + highBand + ' or ' + lowBand + ' bands through the latest completed month.');
    return;
  }

  _setTargetTrendState(true, '');

  var trendData = targetNames.map(function (name) { return _computeBakeryTrend(name, cf, FM); });

  var improving = trendData.filter(function (t) { return t.direction === 'up'; });
  var declining = trendData.filter(function (t) { return t.direction === 'down'; });
  var stable = trendData.filter(function (t) { return t.direction === 'flat'; });
  var chronic = trendData.filter(function (t) { return t.streak >= 3; });

  document.getElementById('trendSummaryCards').innerHTML = [
    { v: improving.length, l: 'Improving', col: 'var(--green)' },
    { v: stable.length, l: 'Steady', col: 'var(--muted-l)' },
    { v: declining.length, l: 'Dipping', col: 'var(--red)' },
    { v: chronic.length, l: 'Extended Dip (3+ Mo)', col: '#6B4FA8' },
  ].map(function (k) { return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + k.v + '</div><div class="target-stat-card__label">' + k.l + '</div></div>'; }).join('');

  var ceiLabel = isAbsolute ? 'Avg Benchmark Score' : 'Avg Score';
  // Monthly averages must ignore unscored records (no-data / incomplete
  // months carry a null score) — summing them poisons the whole month's
  // average into NaN and the point silently vanishes from the chart.
  function _avgScoreForMonth(m, namesFilter) {
    var vals = state.ALL.filter(function (r) { return r.m === m && !r.noData && !r.incompletePeriod && (!namesFilter || namesFilter.includes(r.b)); })
      .map(function (r) { return r[cf]; })
      .filter(function (v) { return v !== null && v !== undefined && !isNaN(v); });
    return vals.length ? vals.reduce(function (a, v) { return a + v; }, 0) / vals.length : null;
  }
  var targetAvgByMonth = FM.map(function (m) { return _avgScoreForMonth(m, targetNames); });
  var allAvgByMonth = FM.map(function (m) { return _avgScoreForMonth(m, null); });

  G.makeChart('targetAvgTrend', {
    type: 'line', data: {
      labels: FM, datasets: [
        { label: 'Focus Bakeries ' + ceiLabel, data: targetAvgByMonth, borderColor: '#B22A24', backgroundColor: 'rgba(178, 42, 36,0.13)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5, spanGaps: false },
        { label: 'All Bakeries ' + ceiLabel, data: allAvgByMonth, borderColor: 'rgba(146, 137, 120,0.5)', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2, borderDash: [6, 4], spanGaps: false },
      ]
    }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: ceiLabel }, min: 0, max: 100 }, x: { ticks: { font: { size: 10 } } } } }
  });

  G.makeChart('targetBandFlow', { type: 'bar', data: { labels: FM, datasets: allBandNames.map(function (bn) { return { label: bn, data: FM.map(function (m) { var recs = state.ALL.filter(function (r) { return r.m === m && targetNames.includes(r.b); }); return recs.length ? recs.filter(function (r) { return r[bf] === bn; }).length : 0; }), backgroundColor: (palette[bn] || '#888') + 'cc', borderColor: palette[bn] || '#888', borderWidth: 1 }; }) }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' } } } } });

  // Ops area momentum: average period-change of each area's focus bakeries,
  // worst-moving area first, so struggling patches jump out.
  var areaAgg = {};
  trendData.forEach(function (t) {
    var ops = G.getBakeryOps(t.name);
    if (!areaAgg[ops]) areaAgg[ops] = [];
    areaAgg[ops].push(t.periodChange || 0);
  });
  var areaMomentum = Object.keys(areaAgg).map(function (ops) {
    var vals = areaAgg[ops];
    return { ops: ops, n: vals.length, change: vals.reduce(function (a, v) { return a + v; }, 0) / vals.length };
  }).sort(function (a, b) { return a.change - b.change; });
  // The chart must be tall enough for one labelled row per area — with a
  // fixed height Chart.js auto-skips axis labels, and a hover then surfaces
  // an area name that isn't visible on the axis (reads as a wrong tooltip).
  var areaWrap = document.getElementById('targetAreaMomentumWrap');
  if (areaWrap) areaWrap.style.height = Math.max(180, areaMomentum.length * 26 + 70) + 'px';
  G.makeChart('targetAreaMomentum', {
    type: 'bar', data: {
      labels: areaMomentum.map(function (d) { return d.ops + ' (' + d.n + ')'; }),
      datasets: [{
        data: areaMomentum.map(function (d) { return Math.round(d.change * 10) / 10; }),
        backgroundColor: areaMomentum.map(function (d) { return d.change < 0 ? 'rgba(178, 42, 36,0.65)' : 'rgba(29, 158, 92,0.65)'; }),
        borderRadius: 3
      }]
    }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return (ctx.raw > 0 ? '+' : '') + ctx.raw + ' pts avg change across focus bakeries'; } } } }, scales: { x: { title: { display: true, text: 'Avg score change across completed history' } }, y: { ticks: { font: { size: 10 }, autoSkip: false } } } }
  });

  // Sparkline cards
  var sparkGrid = document.getElementById('sparklineGrid');
  var sortVal = (document.getElementById('sparkSortBy') || {}).value || 'perf-asc';
  var sparkSorted = [].concat(trendData).sort(function (a, b) {
    if (sortVal === 'perf-asc') {
      var valA = a.latest ? a.latest[cf] : 999;
      var valB = b.latest ? b.latest[cf] : 999;
      if (valA !== valB) return valA - valB;
      return a.name.localeCompare(b.name);
    } else if (sortVal === 'perf-desc') {
      var valA = a.latest ? a.latest[cf] : -999;
      var valB = b.latest ? b.latest[cf] : -999;
      if (valA !== valB) return valB - valA;
      return a.name.localeCompare(b.name);
    } else if (sortVal === 'improve-desc') {
      var valA = a.periodChange || 0;
      var valB = b.periodChange || 0;
      if (valA !== valB) return valB - valA;
      return a.name.localeCompare(b.name);
    } else if (sortVal === 'improve-asc') {
      var valA = a.periodChange || 0;
      var valB = b.periodChange || 0;
      if (valA !== valB) return valA - valB;
      return a.name.localeCompare(b.name);
    } else if (sortVal === 'alpha-asc') {
      return a.name.localeCompare(b.name);
    }
    return (a.latest ? a.latest[cf] : 999) - (b.latest ? b.latest[cf] : 999);
  });
  // Destroy any existing sparkline charts
  sparkSorted.forEach(function (t) { G.destroyChart('spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_')); });
  sparkGrid.innerHTML = '';
  // Build card DOM (canvas elements only — charts drawn by _drawSparklines)
  sparkSorted.forEach(function (t) {
    var card = document.createElement('div');
    var dirClass = t.direction === 'up' ? 'up' : t.direction === 'down' ? 'down' : t.direction === 'flat' ? 'flat' : 'new-entry';
    var dirLabel = t.direction === 'up' ? '\u2191 Improving' : t.direction === 'down' ? '\u2193 Dipping' : t.direction === 'flat' ? '\u2194 Steady' : 'New';
    var ceiNow = t.latest ? t.latest[cf] : '\u2014';
    var bandNow = t.latest ? t.latest[bf] : '\u2014';
    var changeText = t.ceiChange !== 0 ? (t.ceiChange > 0 ? '+' : '') + t.ceiChange.toFixed(1) : '';
    var changeColor = t.ceiChange > 0 ? 'var(--green)' : 'var(--red)';

    var modClass = t.streak >= 3 ? ' spark-card--chronic' : t.direction === 'down' ? ' spark-card--declining' : '';
    card.className = 'spark-card' + modClass;

    card.innerHTML =
      '<div class="spark-card__head">' +
      '<div><div class="spark-card__name">' + t.name + '</div><div class="spark-card__mgr">' + G.getBakeryOps(t.name) + '</div></div>' +
      '<span class="dir ' + dirClass + '" style="font-size:0.62rem">' + dirLabel + '</span>' +
      '</div>' +
      '<div class="spark-card__metrics">' +
      '<div><span class="spark-card__cei">' + ceiNow + '</span><span class="spark-card__cei-label">Score</span></div>' +
      '<span class="band ' + G.bc(bandNow) + '" style="font-size:0.58rem">' + bandNow + '</span>' +
      (changeText ? '<span class="spark-card__change" style="color:' + changeColor + '">' + changeText + '</span>' : '') +
      (t.streak >= 2 ? '<span class="spark-card__streak">\u2193' + t.streak + 'm</span>' : '') +
      '</div>' +
      '<canvas id="spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_') + '" height="44"></canvas>';
    sparkGrid.appendChild(card);
  });
  // Cache data and draw with current toggle state
  _sparkState = { sparkSorted: sparkSorted, allAvgByMonth: allAvgByMonth, FM: FM, cf: cf };
  var toggleEl = document.getElementById('sparkAbsoluteToggle');
  _drawSparklines(toggleEl && toggleEl.checked);

  // Momentum uses strict calendar neighbours. If either monthly result is
  // missing or unusable, that bakery does not contribute to that month's bar.
  var barMonths = FM.slice(1);
  var momentumBuckets = {};
  barMonths.forEach(function (m) { momentumBuckets[m] = { up: 0, down: 0, flat: 0 }; });
  targetNames.forEach(function (name) {
    barMonths.forEach(function (month) {
      var priorMonth = G.focusMonthLabelFromKey(G.monthSortKey(month) - 1);
      var current = state.ALL.find(function (r) { return r.b === name && r.m === month; });
      var prior = state.ALL.find(function (r) { return r.b === name && r.m === priorMonth; });
      if (!current || current.noData || current.incompletePeriod || !prior || prior.noData || prior.incompletePeriod ||
        current[cf] === null || current[cf] === undefined || isNaN(current[cf]) ||
        prior[cf] === null || prior[cf] === undefined || isNaN(prior[cf])) return;
      var diff = current[cf] - prior[cf];
      var bucket = momentumBuckets[month];
      if (diff >= THRESHOLD) bucket.up++; else if (diff <= -THRESHOLD) bucket.down++; else bucket.flat++;
    });
  });
  var momentumData = barMonths.map(function (m) {
    var b = momentumBuckets[m];
    return { m: m, up: b.up, down: b.down, flat: b.flat };
  });
  G.makeChart('targetMomentumChart', {
    type: 'bar', data: {
      labels: momentumData.map(function (d) { return d.m; }), datasets: [
        { label: 'Improving', data: momentumData.map(function (d) { return d.up; }), backgroundColor: 'rgba(29, 158, 92,0.65)', borderRadius: 3 },
        { label: 'Steady', data: momentumData.map(function (d) { return d.flat; }), backgroundColor: 'rgba(146, 137, 120,0.45)', borderRadius: 3 },
        { label: 'Dipping', data: momentumData.map(function (d) { return -d.down; }), backgroundColor: 'rgba(178, 42, 36,0.65)', borderRadius: 3 },
      ]
    }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } }, tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + Math.abs(ctx.raw); } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' }, ticks: { callback: function (v) { return Math.abs(v); } } } } }
  });

  // Helpers
  var dirIcon = function (dir) {
    if (dir === 'up') return '<span class="dir up">&uarr; Improving</span>';
    if (dir === 'down') return '<span class="dir down">&darr; Dipping</span>';
    if (dir === 'flat') return '<span class="dir flat">&harr; Steady</span>';
    return '<span class="dir new-entry">New</span>';
  };
  var changeStr = function (val) {
    if (val === null || val === undefined || isNaN(val)) return '\u2014';
    if (val === 0) return '\u2014';
    var sign = val > 0 ? '+' : '';
    var col = val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--muted)';
    return '<span style="color:' + col + ';font-weight:600">' + sign + val.toFixed(1) + '</span>';
  };

  trendData.sort(function (a, b) { var order = { down: 0, flat: 1, up: 2, new: 3 }; if (order[a.direction] !== order[b.direction]) return order[a.direction] - order[b.direction]; return a.ceiChange - b.ceiChange; });

  var latestMonth = FM.length > 0 ? FM[FM.length - 1] : '—';
  var latestMonthIdx = state.MONTHS ? state.MONTHS.indexOf(latestMonth) : -1;
  var prevMonth = latestMonthIdx >= 1 ? state.MONTHS[latestMonthIdx - 1] : '—';
  var threeAgoMonth = latestMonthIdx >= 3 ? state.MONTHS[latestMonthIdx - 3] : '—';
  var firstMonth = FM.length > 0 ? FM[0] : '—';

  // A bakery with incomplete data can have an older latest observation than
  // the estate cut-off, so relationship labels are safer than a false date.
  latestMonth = 'latest scored month';
  prevMonth = 'prior calendar month';
  threeAgoMonth = '3 calendar months earlier';
  firstMonth = 'first completed month';
  var trendCeiHeader = (isAbsolute ? 'Benchmark ' : 'Peer ') + 'Score (' + latestMonth + ')';
  document.getElementById('targetTrendTable').innerHTML = '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">Performance Trends \u2014 Table</h3><p class="tracker-table-header__copy"><span style="color:var(--green);font-weight:600">\u2191 Improving</span> = +3pts &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">\u2193 Dipping</span> = \u22123pts &nbsp;&middot;&nbsp; <span style="color:var(--muted-l);font-weight:600">\u2194 Steady</span> = \u00b13pts &nbsp;&middot;&nbsp; Direction = month-on-month. 3-Month Trend = last 3 months. Click a bakery name for its full performance breakdown.</p></div></div><div class="table-wrap"><table><thead><tr><th>Bakery</th><th>Ops Area</th><th>' + trendCeiHeader + '</th><th>' + (isAbsolute ? 'Benchmark' : 'Peer') + ' Score Change<span class="th-sublabel">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Direction<span class="th-sublabel">Month-on-Month</span></th><th>NPS Change<span class="th-sublabel">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>3-Month Trend<span class="th-sublabel">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>3m ' + (isAbsolute ? 'Benchmark' : 'Peer') + ' Score Change<span class="th-sublabel">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>Period Change<span class="th-sublabel">' + firstMonth + ' &rarr; ' + latestMonth + '</span></th><th>Dip Streak</th><th>Peak Month</th><th>Lowest Month</th><th>Quality &Delta;<span class="th-sublabel">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Efficiency &Delta;<span class="th-sublabel">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Friendliness &Delta;<span class="th-sublabel">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Coffee Efficiency &Delta;<span class="th-sublabel">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th></tr></thead><tbody>' +
    trendData.map(function (t) {
      var streakWarn = t.streak >= 3 ? 'color:#6B4FA8;font-weight:700' : t.streak >= 2 ? 'color:var(--red);font-weight:600' : '';
      return '<tr><td><button type="button" class="focus-name-link" data-focus-detail="' + G.escapeHtml(t.name) + '">' + t.name + '</button></td><td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(t.name) + '</td><td style="font-weight:700">' + (t.latest ? t.latest[cf] : '\u2014') + '</td><td>' + changeStr(t.ceiChange) + '</td><td>' + dirIcon(t.direction) + '</td><td>' + changeStr(t.npsChange) + '</td><td>' + dirIcon(t.trend3m) + '</td><td>' + changeStr(t.cei3mChange) + '</td><td>' + changeStr(t.periodChange) + '</td><td style="' + streakWarn + '">' + (t.streak > 0 ? t.streak + ' month' + (t.streak > 1 ? 's' : '') : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.best ? t.best.m + ' (' + t.best[cf] + ')' : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.worst ? t.worst.m + ' (' + t.worst[cf] + ')' : '\u2014') + '</td><td>' + (t.compTrends.drink !== undefined ? changeStr(t.compTrends.drink) : '\u2014') + '</td><td>' + (t.compTrends.efficiency !== undefined ? changeStr(t.compTrends.efficiency) : '\u2014') + '</td><td>' + (t.compTrends.friendliness !== undefined ? changeStr(t.compTrends.friendliness) : '\u2014') + '</td><td>' + (t.compTrends.timeliness !== undefined ? changeStr(t.compTrends.timeliness) : '\u2014') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTrendTable'));
}
