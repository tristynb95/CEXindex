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

  sparkSorted.forEach(function(t) {
    var canvasId = 'spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_');
    var lineColor = t.direction === 'up' ? '#1D9E5C' : t.direction === 'down' ? '#B22A24' : '#C97F12';
    var yOpts = absolute
      ? { display: true, min: 0, max: 100, ticks: { stepSize: 50, font: { size: 7 }, color: 'rgba(146, 137, 120,0.45)', maxTicksLimit: 3 }, grid: { color: 'rgba(34, 31, 26,0.05)' }, border: { display: false } }
      : { display: false };
    G.makeChart(canvasId, {
      type: 'line',
      data: { labels: FM, datasets: [
        { data: t.hist.map(function(r) { return r ? r[cf] : null; }), borderColor: lineColor, backgroundColor: lineColor + '18', fill: true, tension: 0.3, pointRadius: 1.5, borderWidth: 2, spanGaps: true },
        { data: allAvgByMonth, borderColor: 'rgba(146, 137, 120,0.4)', borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false, tension: 0.3, spanGaps: true }
      ] },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: function(items) { return items[0].label; }, label: function(ctx) { return ctx.datasetIndex === 0 ? 'Index: ' + ctx.raw : 'Avg: ' + (ctx.raw ? ctx.raw.toFixed(1) : ''); } } } },
        scales: { y: yOpts, x: { display: false } },
        maintainAspectRatio: false
      }
    });
  });
}

window.GAILS.toggleSparkScale = function() {
  var absolute = !!(document.getElementById('sparkAbsoluteToggle') || {}).checked;
  _drawSparklines(absolute);
};

window.GAILS.changeSparkSort = function() {
  var G = GAILS;
  if (G._lastData) {
    G.renderTargets(G._lastData);
  }
};

function _clearTargetTrendCharts() {
  var G = GAILS;
  ['targetAvgTrend', 'targetBandFlow', 'targetMomentumChart', 'targetAreaMomentum'].forEach(function(id) { G.destroyChart(id); });
  if (_sparkState && _sparkState.sparkSorted) {
    _sparkState.sparkSorted.forEach(function(t) {
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
// The queue uses an internal urgency score for ordering. The deep-dive shows
// the observed performance facts behind that ordering instead of exposing
// another abstract score that can be mistaken for a performance measure.

var _TREND_THRESHOLD = 3;

// Used by the estate-level momentum chart, where the first selected month can
// be compared with the calendar month immediately before the selection.
function _monthBeforePeriod(FM) {
  var state = GAILS.state;
  if (!FM.length || !state.MONTHS || !state.MONTHS.length) return null;
  var first = FM.reduce(function(a, b) { return GAILS.monthSortKey(a) <= GAILS.monthSortKey(b) ? a : b; });
  var idx = state.MONTHS.indexOf(first);
  return idx > 0 ? state.MONTHS[idx - 1] : null;
}

// Per-bakery month-by-month trend facts for the selected period. Shared by the
// hub priority queue and the Performance Trends tab so both always agree on
// direction / streak / change arithmetic. MoM always means the immediately
// preceding calendar month, and 3-month change means three calendar months
// earlier; missing months are not silently skipped.
function _computeBakeryTrend(name, cf, FM) {
  var state = GAILS.state;
  var hist = FM.map(function(m) { return state.ALL.find(function(r) { return r.b === name && r.m === m; }) || null; });
  // A record can exist for a month while still carrying no usable score. Such
  // rows stay in hist for the month table, but must not become the latest trend
  // point or dilute time-in-focus evidence.
  var valid = hist.filter(function(r) {
    return r && r[cf] !== null && r[cf] !== undefined && !isNaN(r[cf]);
  });
  var sortedValid = valid.slice().sort(function(a, b) { return GAILS.monthSortKey(a.m) - GAILS.monthSortKey(b.m); });
  var latest = sortedValid.length > 0 ? sortedValid[sortedValid.length - 1] : null;

  function recordMonthsBefore(offset) {
    if (!latest || !state.MONTHS || !state.MONTHS.length) return null;
    var latestIdx = state.MONTHS.indexOf(latest.m);
    if (latestIdx < offset) return null;
    var month = state.MONTHS[latestIdx - offset];
    var record = state.ALL.find(function(r) { return r.b === name && r.m === month; });
    return record && record[cf] !== null && record[cf] !== undefined && !isNaN(record[cf]) ? record : null;
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
  if (latest && state.MONTHS && state.MONTHS.length) {
    var latestMonthIdx = state.MONTHS.indexOf(latest.m);
    for (var i = latestMonthIdx; i >= 1; i--) {
      var currentMonth = state.MONTHS[i];
      var priorMonth = state.MONTHS[i - 1];
      var currentRec = state.ALL.find(function(r) { return r.b === name && r.m === currentMonth; });
      var priorRec = state.ALL.find(function(r) { return r.b === name && r.m === priorMonth; });
      if (!currentRec || !priorRec || currentRec[cf] === null || currentRec[cf] === undefined || isNaN(currentRec[cf]) || priorRec[cf] === null || priorRec[cf] === undefined || isNaN(priorRec[cf])) break;
      if (currentRec[cf] < priorRec[cf] - 1) streak++; else break;
    }
  }

  var best = null, worst = null;
  valid.forEach(function(r) { if (!best || r[cf] > best[cf]) best = r; if (!worst || r[cf] < worst[cf]) worst = r; });

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
// Urgency triage labels. Deliberately not band-like nouns, so they can
// never be confused with the performance bands ("Low Performer" etc.):
// bands say where a bakery sits, priority levels triage how quickly to
// step in. Internal keys stay critical/high/watch.
var _TIER_LABEL = { critical: 'High Priority', high: 'Medium Priority', watch: 'Monitor' };

var _DRIVER_ACTIONS = {
  dr: 'Run a drink-standards calibration with the coffee lead — check espresso dial-in, milk texturing and presentation against spec.',
  ef: 'Review peak-hour deployment and the barista rota. Customer-rated efficiency carries 25% of the experience index, so gains here have a meaningful impact.',
  fr: 'Coach the team on warm greetings and handover moments — observe service interactions during the next routine visit.',
  n: 'Read this bakery’s recent customer comments in the Comment Cloud tab and agree one specific service fix with the BM.',
  ts: 'Track drink delivery times at peak — the standard is 80% of drinks served within 2 minutes.',
  at: 'Average wait is above the 1:55 standard — review queue flow, batching and order sequencing at peak.'
};

function _ordinal(n) {
  n = Math.round(n);
  var rem10 = n % 10, rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return n + 'st';
  if (rem10 === 2 && rem100 !== 12) return n + 'nd';
  if (rem10 === 3 && rem100 !== 13) return n + 'rd';
  return n + 'th';
}

// The bakery's component metrics ranked weakest-first by network percentile.
function _driverList(rec) {
  var B = GAILS.BENCHMARKS;
  var list = [
    { key: 'dr', label: 'Drink Quality', pct: rec.dp, value: rec.dr, fmt: 'pct', bench: B.dr },
    { key: 'ef', label: 'Customer-rated Efficiency', pct: rec.ep, value: rec.ef, fmt: 'pct', bench: B.ef },
    { key: 'fr', label: 'Friendliness', pct: rec.fp, value: rec.fr, fmt: 'pct', bench: B.fr },
    { key: 'n', label: 'Drink + Meal NPS', pct: rec.np, value: rec.n, fmt: 'raw', bench: B.nps },
    { key: 'ts', label: 'Drinks Served Within 2 Minutes', pct: rec.ap, value: rec.ts, fmt: 'pct', bench: B.time }
  ];
  if (rec.at !== null && rec.at !== undefined && !isNaN(rec.at)) {
    list.push({ key: 'at', label: 'Average Drink Wait', pct: rec.atp, value: rec.at, fmt: 'secs', bench: B.at, invert: true });
  }
  return list.filter(function(d) { return d.pct !== null && d.pct !== undefined && !isNaN(d.pct); })
    .sort(function(a, b) { return a.pct - b.pct; });
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

function _plainChangeValue(change) {
  if (change === null || change === undefined || isNaN(change)) return '—';
  if (Math.round(change * 10) === 0) return 'No change';
  return (change > 0 ? '+' : '−') + Math.abs(change).toFixed(1) + ' pts';
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

function _driverStandingText(percentile) {
  var pct = Math.max(1, Math.min(99, Math.round(percentile)));
  return pct <= 50 ? 'Bottom ' + pct + '% of bakeries' : 'Top ' + Math.max(1, 100 - pct) + '% of bakeries';
}

function _driverDeltaHtml(d, change) {
  if (change === null || change === undefined || isNaN(change)) return '';
  var rounded = d.key === 'at' ? Math.round(change) : Math.round(change * 10) / 10;
  if (rounded === 0) return '<span style="color:var(--muted)">No change vs last month</span>';
  var improved = d.key === 'at' ? change < 0 : change > 0;
  var movement = d.key === 'at'
    ? Math.abs(rounded) + 's ' + (change < 0 ? 'faster' : 'slower')
    : (change > 0 ? 'Up ' : 'Down ') + Math.abs(rounded).toFixed(1) + ' pts';
  return '<span style="color:' + (improved ? 'var(--green)' : 'var(--red)') + ';font-weight:700">' + movement + ' vs last month</span>';
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

function _deltaHtml(change, suffix) {
  if (change === null || change === undefined || isNaN(change)) return '<span style="color:var(--muted)">—</span>';
  if (Math.round(change * 10) === 0) return '<span style="color:var(--muted)">±0.0' + (suffix || '') + '</span>';
  var up = change > 0;
  return '<span style="color:' + (up ? 'var(--green)' : 'var(--red)') + ';font-weight:700">' + (up ? '▲ +' : '▼ ') + change.toFixed(1) + (suffix || '') + '</span>';
}

// statKey makes the card clickable: it applies the matching queue filter and
// scrolls to the queue (see GAILS.filterQueueFromStat).
function _statCard(v, l, col, sub, statKey) {
  var open = statKey
    ? '<div class="target-stat-card target-stat-card--link" data-focus-stat="' + statKey + '" role="button" tabindex="0" title="Show these bakeries in the support queue below">'
    : '<div class="target-stat-card">';
  return open + '<div class="target-stat-card__value" style="color:' + (col || 'var(--text)') + '">' + v + '</div><div class="target-stat-card__label">' + l + '</div>' + (sub ? '<div class="target-stat-card__sub">' + sub + '</div>' : '') + '</div>';
}

// "At a glance" spotlight: a handful of auto-written headlines so the state of
// the estate is readable before any scanning. Cards deep-link into the queue
// (area filter) or the bakery diagnosis via the shared delegation handlers.
function _renderHubSpotlight() {
  if (!_hubState) return;
  var esc = GAILS.escapeHtml;
  var el = document.getElementById('focusSpotlight');
  if (!el) return;
  var rows = _hubState.rows, areas = _hubState.areas || [];
  if (!rows.length) { el.innerHTML = ''; return; }

  var spots = [];
  var top = rows[0];
  spots.push({
    icon: '🤝', label: 'Top support priority', attr: ' data-focus-detail="' + esc(top.name) + '"',
    headline: esc(top.name) + ' — ' + (top.score !== null && top.score !== undefined ? top.score : '—'),
    sub: esc(top.ops) + ' · support score ' + top.priority + '/100'
  });
  if (areas.length) {
    var a = areas[0];
    spots.push({
      icon: '🗺️', label: 'Area needing most support', attr: ' data-focus-area="' + esc(a.area) + '"',
      headline: esc(a.area),
      sub: a.rows.length + ' of ' + a.totalInArea + ' bakeries in focus · avg score ' + (a.avgScore !== null ? a.avgScore : '—')
    });
  }
  var decliners = rows.filter(function(r) { return r.trend.prev && r.trend.ceiChange < 0; })
    .sort(function(x, y) { return x.trend.ceiChange - y.trend.ceiChange; });
  var improving = rows.filter(function(r) { return r.trend.direction === 'up'; }).length;
  var declining = rows.filter(function(r) { return r.trend.direction === 'down'; }).length;
  if (decliners.length) {
    spots.push({
      icon: '📉', label: 'Biggest recent dip', attr: ' data-focus-detail="' + esc(decliners[0].name) + '"',
      headline: esc(decliners[0].name) + ' ' + decliners[0].trend.ceiChange.toFixed(1),
      sub: declining + ' dipping vs ' + improving + ' improving month-on-month'
    });
  }
  var wins = rows.filter(function(r) { return r.quickWin; }).sort(function(x, y) { return (y.score || 0) - (x.score || 0); });
  if (wins.length) {
    var need = Math.max(0, Math.round((_hubState.escapeLine - wins[0].score) * 10) / 10);
    spots.push({
      icon: '⭐', label: 'Nearly there', attr: ' data-focus-detail="' + esc(wins[0].name) + '"',
      headline: esc(wins[0].name) + ' — ' + wins[0].score,
      sub: '+' + need + ' pts from graduating out of focus'
    });
  }
  var notVisited = rows.filter(function(r) { return !r.visitedInPeriod; }).length;
  if (spots.length < 4 && notVisited) {
    spots.push({
      icon: '📍', label: 'Visit gap', attr: ' data-focus-stat="novisit"',
      headline: notVisited + ' of ' + rows.length + ' unvisited',
      sub: 'No routine visit logged this period'
    });
  }

  el.innerHTML = '<h4 class="focus-section-title">At a glance</h4><div class="focus-spots">' +
    spots.slice(0, 4).map(function(s) {
      var clickable = s.attr !== '';
      return '<div class="focus-spot' + (clickable ? ' focus-spot--link' : '') + '"' + s.attr + (clickable ? ' role="button" tabindex="0"' : '') + '>' +
        '<span class="focus-spot__icon" aria-hidden="true">' + s.icon + '</span>' +
        '<span class="focus-spot__body">' +
          '<span class="focus-spot__label">' + s.label + '</span>' +
          '<span class="focus-spot__headline">' + s.headline + '</span>' +
          '<span class="focus-spot__sub">' + s.sub + '</span>' +
        '</span>' +
      '</div>';
    }).join('') + '</div>';
}

function _renderFocusHub(targets, data, bf, cf, highBand, lowBand, isAbsolute) {
  var G = GAILS;
  var esc = G.escapeHtml;
  var state = G.state;
  var FM = state.selectedMonths || [];
  var escapeLine = isAbsolute ? 75 : 50;
  var severeLine = isAbsolute ? 60 : 25;
  var summaryEl = document.getElementById('targetSummary');
  var queueEl = document.getElementById('targetHubQueue');
  if (!summaryEl) return;

  var needsAttn = targets.filter(function(b) { return b[bf] === highBand; });
  var developing = targets.filter(function(b) { return b[bf] === lowBand; });
  var networkAvg = data.length ? G.avg(data, cf) : null;
  var focusAvg = targets.length ? G.avg(targets, cf) : null;

  var rows = targets.map(function(rec) {
    var trend = _computeBakeryTrend(rec.b, cf, FM);
    var focusMonths = trend.valid.filter(function(r) { return r[bf] === highBand || r[bf] === lowBand; }).length;
    var focusStreak = _countFocusStreak(trend.hist, bf, highBand, lowBand);
    var visitedInPeriod = G.isBakeryVisitedInPeriod ? G.isBakeryVisitedInPeriod(rec.b, FM) : false;
    var lastVisit = G.getLastVisitDate ? G.getLastVisitDate(rec.b) : null;
    var drivers = _driverList(rec);
    var p = G.computeSupportPriority({
      score: rec[cf], trend: trend, focusMonths: focusMonths, focusStreak: focusStreak,
      monthsWithData: trend.monthsTracked, visitedInPeriod: visitedInPeriod,
      hasVisitEver: !!lastVisit, escapeLine: escapeLine, severeLine: severeLine
    });
    return {
      name: rec.b, rec: rec, trend: trend, ops: G.getBakeryOps(rec.b),
      score: rec[cf], focusMonths: focusMonths, focusStreak: focusStreak, monthsWithData: trend.monthsTracked,
      visitedInPeriod: visitedInPeriod, lastVisit: lastVisit,
      weakest: drivers.length ? drivers[0] : null,
      severity: p.severity, momentum: p.momentum, persistence: p.persistence, coverage: p.coverage,
      priority: p.priority, tier: p.tier,
      quickWin: rec[bf] === lowBand && rec[cf] >= escapeLine - 5,
      lowVol: rec.co === 'Low'
    };
  });
  rows.sort(function(a, b) {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.score || 0) - (b.score || 0);
  });
  rows.forEach(function(r, i) { r.rank = i + 1; });

  var byName = {};
  rows.forEach(function(r) { byName[r.name] = r; });

  // Ops-area aggregates for the area triage board. "Attention load" is the sum
  // of member priorities, so an area with many moderately troubled bakeries can
  // outrank one with a single very poor site.
  var areaMap = {};
  rows.forEach(function(r) {
    if (!areaMap[r.ops]) areaMap[r.ops] = { area: r.ops, rows: [], totalInArea: 0 };
    areaMap[r.ops].rows.push(r);
  });
  data.forEach(function(rec) {
    var ops = G.getBakeryOps(rec.b);
    if (areaMap[ops]) areaMap[ops].totalInArea++;
  });
  var areas = Object.keys(areaMap).map(function(k) {
    var a = areaMap[k];
    var load = 0, critical = 0, high = 0, watch = 0, declining = 0, notVisited = 0;
    var worst = null, scoreSum = 0, scoreN = 0;
    a.rows.forEach(function(r) {
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
  }).sort(function(x, y) { return y.load - x.load; });

  var prevSort = _hubState ? _hubState.sort : 'priority';
  var prevTier = _hubState ? _hubState.tier : 'all';
  var prevArea = _hubState ? _hubState.area : 'all';
  var prevStatus = _hubState ? _hubState.status || 'all' : 'all';
  var prevSearch = _hubState ? _hubState.search || '' : '';
  var prevExpanded = _hubState ? !!_hubState.expanded : false;
  if (prevArea !== 'all' && !areaMap[prevArea]) prevArea = 'all';
  _hubState = {
    rows: rows, byName: byName, areas: areas, sort: prevSort, tier: prevTier, area: prevArea,
    status: prevStatus, search: prevSearch,
    expanded: prevExpanded,
    bf: bf, cf: cf, isAbsolute: isAbsolute, FM: FM,
    highBand: highBand, lowBand: lowBand, networkAvg: networkAvg, escapeLine: escapeLine,
    severeLine: severeLine
  };

  var criticalCount = rows.filter(function(r) { return r.tier === 'critical'; }).length;
  var decliningCount = rows.filter(function(r) { return r.trend.direction === 'down'; }).length;
  var notVisited = rows.filter(function(r) { return !r.visitedInPeriod; }).length;
  var gapStr = (focusAvg !== null && networkAvg !== null)
    ? (focusAvg - networkAvg >= 0 ? '+' : '') + (focusAvg - networkAvg).toFixed(1) + ' vs company'
    : '';

  summaryEl.innerHTML =
    _statCard(needsAttn.length, highBand, 'var(--red)', 'Lowest performance band', 'band-high') +
    _statCard(developing.length, lowBand, 'var(--amber)', 'Band above — within reach of exiting focus', 'band-low') +
    _statCard(criticalCount, 'High Priority', 'var(--red)', 'Most urgent · support score 60+', 'critical') +
    _statCard(focusAvg !== null ? focusAvg.toFixed(1) : '—', (isAbsolute ? 'Avg Benchmark Score' : 'Avg Peer Score'), 'var(--accent)', gapStr) +
    _statCard(decliningCount, 'Dipping MoM', decliningCount > 0 ? 'var(--red)' : 'var(--green)', '−3pts or more', 'dipping') +
    _statCard(notVisited, 'No Visit Yet', notVisited > 0 ? 'var(--amber)' : 'var(--green)', 'this period · of ' + rows.length + ' focus bakeries', 'novisit');

  _renderHubSpotlight();
  _renderHubAreas();

  if (!queueEl) return;

  if (!rows.length) {
    queueEl.innerHTML = '<div class="focus-queue__empty">No bakeries are in the ' + esc(highBand) + ' or ' + esc(lowBand) + ' bands for the current selection — nothing needs focus right now.</div>';
    return;
  }

  queueEl.innerHTML =
    '<h4 class="focus-section-title">Bakery support queue</h4>' +
    '<div class="focus-queue__bar">' +
      '<div class="focus-queue__chips" id="focusQueueChips"></div>' +
      '<div class="focus-queue__tools">' +
        '<input type="search" id="focusQueueSearch" class="focus-qsearch" placeholder="Find a bakery…" aria-label="Search the support queue by bakery or ops area" oninput="GAILS.setFocusSearch(this.value)">' +
        '<label class="spark-sort-label">Sort: <select id="focusQueueSort" class="spark-sort-select" onchange="GAILS.setFocusSort(this.value)">' +
          '<option value="priority">Support score (highest first)</option>' +
          '<option value="score-asc">Lowest score first</option>' +
          '<option value="decline">Biggest recent dip first</option>' +
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
  if (!board) return;
  var areas = _hubState.areas || [];
  if (!areas.length) { board.innerHTML = ''; return; }

  var maxFocus = 1;
  areas.forEach(function(a) { if (a.rows.length > maxFocus) maxFocus = a.rows.length; });

  board.innerHTML =
    '<div class="focus-area-head">' +
      '<h4 class="focus-section-title">Ops areas — most focus bakeries first</h4>' +
      '<div class="focus-area-legend">' +
        '<span><i style="background:var(--red)"></i>High Priority</span>' +
        '<span><i style="background:var(--amber)"></i>Medium Priority</span>' +
        '<span><i style="background:#B3AA99"></i>Monitor</span>' +
        '<span class="focus-area-legend__note">Bar = bakeries in focus · click a row to drill in</span>' +
      '</div>' +
    '</div>' +
    '<div class="focus-area-list">' +
    areas.map(function(a) {
      var active = _hubState.area === a.area;
      var total = a.rows.length;
      var segs = [
        { n: a.critical, c: 'var(--red)', l: 'High Priority' },
        { n: a.high, c: 'var(--amber)', l: 'Medium Priority' },
        { n: a.watch, c: '#B3AA99', l: 'Monitor' }
      ].filter(function(s) { return s.n > 0; }).map(function(s) {
        return '<i style="flex:' + s.n + ';background:' + s.c + '" title="' + s.n + ' ' + s.l + '"></i>';
      }).join('');
      var visited = total - a.notVisited;
      return '<div class="focus-area-row' + (active ? ' active' : '') + '" data-focus-area="' + esc(a.area) + '" role="button" tabindex="0" aria-pressed="' + (active ? 'true' : 'false') + '" aria-label="Filter the queue to ' + esc(a.area) + '">' +
        '<span class="focus-area-row__name">' + esc(a.area) + '</span>' +
        '<span class="focus-area-row__barwrap">' +
          '<span class="focus-area-row__bar" style="width:' + Math.round((total / maxFocus) * 100) + '%">' + segs + '</span>' +
          '<span class="focus-area-row__count">' + total + '<em>of ' + a.totalInArea + '</em></span>' +
        '</span>' +
        '<span class="focus-area-row__metric"><strong>' + (a.avgScore !== null ? a.avgScore : '—') + '</strong><em>avg score</em></span>' +
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
  var rows = s.rows.filter(function(r) {
    if (s.area !== 'all' && r.ops !== s.area) return false;
    if (s.tier !== 'all' && r.tier !== s.tier) return false;
    if (s.status === 'dipping' && r.trend.direction !== 'down') return false;
    if (s.status === 'novisit' && r.visitedInPeriod) return false;
    if (s.status === 'band-high' && r.rec[s.bf] !== s.highBand) return false;
    if (s.status === 'band-low' && r.rec[s.bf] !== s.lowBand) return false;
    if (search && r.name.toLowerCase().indexOf(search) === -1 && r.ops.toLowerCase().indexOf(search) === -1) return false;
    return true;
  });
  var sortVal = s.sort;
  return rows.sort(function(a, b) {
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

  var areaRows = s.rows.filter(function(r) { return s.area === 'all' || r.ops === s.area; });

  var counts = { all: areaRows.length, critical: 0, high: 0, watch: 0 };
  areaRows.forEach(function(r) { counts[r.tier]++; });
  var statusCounts = {
    dipping: areaRows.filter(function(r) { return r.trend.direction === 'down'; }).length,
    novisit: areaRows.filter(function(r) { return !r.visitedInPeriod; }).length
  };

  if (chipsEl) {
    var clearChips = '';
    if (s.area !== 'all') {
      clearChips += '<button type="button" class="focus-chip focus-chip--area" onclick="GAILS.setFocusArea(\'all\')" title="Clear the area filter">✕ ' + esc(s.area) + '</button>';
    }
    if (s.status === 'band-high' || s.status === 'band-low') {
      var bandName = s.status === 'band-high' ? s.highBand : s.lowBand;
      clearChips += '<button type="button" class="focus-chip focus-chip--area" onclick="GAILS.setFocusStatus(\'all\')" title="Clear the band filter">✕ ' + esc(bandName) + '</button>';
    }
    var tierChips = ['all', 'critical', 'high', 'watch'].map(function(t) {
      var label = t === 'all' ? 'All' : _TIER_LABEL[t];
      return '<button type="button" class="focus-chip' + (s.tier === t ? ' active' : '') + '" onclick="GAILS.setFocusTier(\'' + t + '\')">' + label + '<span class="focus-chip__count">' + counts[t] + '</span></button>';
    }).join('');
    var statusChips = [
      { key: 'dipping', label: 'Dipping MoM' },
      { key: 'novisit', label: 'No visit' }
    ].map(function(c) {
      return '<button type="button" class="focus-chip' + (s.status === c.key ? ' active' : '') + '" onclick="GAILS.setFocusStatus(\'' + c.key + '\')">' + c.label + '<span class="focus-chip__count">' + statusCounts[c.key] + '</span></button>';
    }).join('');
    chipsEl.innerHTML = clearChips + tierChips + '<span class="focus-chip-divider" aria-hidden="true"></span>' + statusChips;
  }

  var rows = _visibleQueueRows();

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
  var palette = _hubState.isAbsolute ? G.ABSCOL : G.COL;
  // Movement can come from the month before the period (baseline), so show
  // the MoM column whenever any bakery has a comparison — including
  // single-month selections with a preceding month of data.
  var hasDelta = _hubState.rows.some(function(r) { return !!r.trend.prev; });
  var LIMIT = 12;
  // While searching, show every match — capping a search result set reads
  // as "bakery not found".
  var searching = !!(s.search || '').trim();
  var visible = (_hubState.expanded || searching) ? rows : rows.slice(0, LIMIT);

  grid.className = 'focus-qlist' + (hasDelta ? ' has-delta' : '');
  grid.innerHTML =
    '<div class="focus-qhead" aria-hidden="true">' +
      '<span>Rank</span><span>Bakery</span><span>Band</span><span>Score 0–100 · | = safe at ' + _hubState.escapeLine + '</span>' +
      (hasDelta ? '<span>MoM</span>' : '') +
      '<span>Biggest lever</span><span>Visit</span><span></span>' +
    '</div>' +
    visible.map(function(r) {
      var band = r.rec[bf];
      var bandColor = palette[band] || '#B22A24';
      var score = (r.score !== null && r.score !== undefined) ? r.score : null;

      var badges = '';
      if (r.trend.streak >= 3) badges += '<span class="focus-qbadge focus-qbadge--chronic" title="Score has dipped ' + r.trend.streak + ' months running">↓' + r.trend.streak + 'm</span>';
      if (r.quickWin) badges += '<span class="focus-qbadge focus-qbadge--win" title="Within 5 points of graduating out of focus">nearly there</span>';
      if (r.lowVol) badges += '<span class="focus-qbadge" title="Low response volume — treat the score with caution">low vol</span>';

      var deltaCell = hasDelta
        ? '<span class="focus-qrow__delta">' + (r.trend.prev ? _deltaHtml(r.trend.ceiChange) : '<span style="color:var(--muted)">—</span>') + '</span>'
        : '';

      var visitDot, visitTitle;
      if (r.visitedInPeriod) { visitDot = 'focus-qdot--ok'; visitTitle = 'Visited this period'; }
      else if (r.lastVisit) { visitDot = 'focus-qdot--stale'; visitTitle = 'Last visited ' + r.lastVisit + ' — outside this period'; }
      else { visitDot = 'focus-qdot--never'; visitTitle = 'No routine visit logged'; }

      return '<div class="focus-qrow" data-focus-detail="' + esc(r.name) + '" role="button" tabindex="0" aria-label="Open the full performance breakdown for ' + esc(r.name) + '">' +
        '<span class="focus-qrow__rank">#' + r.rank + '<span class="focus-tier focus-tier--' + r.tier + '" title="' + _TIER_LABEL[r.tier] + ' — support score ' + r.priority + '/100. Gap ' + r.severity + '/50; recent falls ' + r.momentum + '/25; time in focus ' + r.persistence + '/15; visit coverage ' + r.coverage + '/10">' + r.priority + '</span></span>' +
        '<span class="focus-qrow__who"><span class="focus-qrow__nameline"><strong>' + esc(r.name) + '</strong>' + badges + '</span><small>' + esc(r.ops) + ' · ' + esc(G.getBakeryRegion(r.name)) + '</small></span>' +
        '<span><span class="band ' + G.bc(band) + '">' + esc(band) + '</span></span>' +
        '<span class="focus-qrow__scorecell">' +
          '<span class="focus-qrow__scorenum">' + (score !== null ? score : '—') + '</span>' +
          '<span class="focus-qrow__track">' +
            '<span class="focus-qrow__fill" style="width:' + (score !== null ? Math.max(1.5, Math.min(100, score)) : 0) + '%;background:' + bandColor + '"></span>' +
            '<span class="focus-qrow__line" style="left:' + _hubState.escapeLine + '%"></span>' +
          '</span>' +
        '</span>' +
        deltaCell +
        '<span class="focus-qrow__fix">' + (r.weakest ? esc(r.weakest.label) + ' <em>' + _ordinal(r.weakest.pct) + ' pct</em>' : '—') + '</span>' +
        '<span class="focus-qrow__visit" title="' + esc(visitTitle) + '"><i class="focus-qdot ' + visitDot + '"></i></span>' +
        '<span class="focus-qrow__chev" aria-hidden="true">›</span>' +
      '</div>';
    }).join('');

  if (moreEl) {
    moreEl.innerHTML = (!searching && rows.length > LIMIT)
      ? '<button type="button" class="focus-qmore__btn" onclick="GAILS.toggleFocusQueueExpand()">' +
        (_hubState.expanded ? 'Show top ' + LIMIT + ' only ▴' : 'Show all ' + rows.length + ' bakeries ▾') + '</button>'
      : '';
  }
}

window.GAILS.toggleFocusQueueExpand = function() {
  if (!_hubState) return;
  _hubState.expanded = !_hubState.expanded;
  _renderHubQueue();
};

window.GAILS.setFocusTier = function(tier) {
  if (!_hubState) return;
  _hubState.tier = tier;
  _renderHubQueue();
};

window.GAILS.setFocusArea = function(area) {
  if (!_hubState) return;
  _hubState.area = (area === 'all' || _hubState.area === area) ? 'all' : area;
  _renderHubAreas();
  _renderHubQueue();
};

window.GAILS.setFocusSort = function(val) {
  if (!_hubState) return;
  _hubState.sort = val;
  _renderHubQueue();
};

window.GAILS.setFocusStatus = function(status) {
  if (!_hubState) return;
  _hubState.status = _hubState.status === status ? 'all' : status;
  _renderHubQueue();
};

window.GAILS.setFocusSearch = function(val) {
  if (!_hubState) return;
  _hubState.search = val || '';
  _renderHubQueue();
};

// Entry point for the clickable KPI stat cards: swap the queue onto the
// matching filter (clearing narrower ones so the count on the card and the
// rows shown always agree) and bring the queue into view.
window.GAILS.filterQueueFromStat = function(stat) {
  if (!_hubState) return;
  if (stat === 'critical') { _hubState.tier = 'critical'; _hubState.status = 'all'; }
  else { _hubState.tier = 'all'; _hubState.status = stat; }
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

window.GAILS.openFocusDetail = function(name) {
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
    badgesEl.innerHTML = '<span class="band ' + G.bc(band) + '">' + esc(band) + '</span>';
  }
  var inner = modal.querySelector('.drillInner');
  if (inner) inner.style.setProperty('--drill-accent', bandColor);

  var h = '';

  var score = rec[cf] !== null && rec[cf] !== undefined && !isNaN(rec[cf]) ? rec[cf] : null;
  var scoreLabel = isAbsolute ? 'Benchmark score' : 'Peer score';
  var scoreHelp = isAbsolute ? 'Selected period · higher means closer to standard' : 'Selected period · higher means stronger vs peers';
  var scoreGap = score !== null ? Math.max(0, _hubState.escapeLine - score) : null;
  var scoreGapValue = scoreGap !== null ? '+' + scoreGap.toFixed(1) + ' pts' : '—';
  var momValue = trend.prev ? _plainChangeValue(trend.ceiChange) : '—';
  var threeMonthValue = trend.threePrev ? _plainChangeValue(trend.cei3mChange) : '—';
  var focusMonthValue = row.focusMonths + ' ' + (row.focusMonths === 1 ? 'month' : 'months');
  var trackedMonthText = row.monthsWithData + ' selected ' + (row.monthsWithData === 1 ? 'month' : 'months') + ' with data';

  // KPI strip: every number states its scale, direction, or comparison.
  h += '<div class="target-stat-grid">' +
    _statCard(score !== null ? score + ' / 100' : '—', scoreLabel, bandColor, scoreHelp) +
    _statCard(momValue, 'Since last month', trend.ceiChange > 0 ? 'var(--green)' : trend.ceiChange < 0 ? 'var(--red)' : 'var(--muted-l)', trend.prev ? 'Latest month vs previous month' : 'Previous month not available') +
    _statCard(threeMonthValue, 'Over 3 months', trend.cei3mChange > 0 ? 'var(--green)' : trend.cei3mChange < 0 ? 'var(--red)' : 'var(--muted-l)', trend.threePrev ? 'Latest month vs 3 months earlier' : 'Three-month comparison not available') +
    _statCard(scoreGapValue, 'To reach the next band', scoreGap === 0 ? 'var(--green)' : 'var(--amber)', 'Target: ' + _hubState.escapeLine + ' / 100') +
    _statCard(focusMonthValue, 'In focus this period', row.focusMonths >= 3 ? 'var(--red)' : 'var(--amber)', trackedMonthText) +
    _statCard(rec.n !== null && rec.n !== undefined ? rec.n : '—', 'Drink + Meal NPS', rec.n >= 55 ? 'var(--green)' : rec.n >= 45 ? 'var(--amber)' : 'var(--red)', 'Target: 55 · higher is better') +
  '</div>';

  // Explain the focus status with observed facts, not an opaque weighted score.
  var visitReasonValue = row.visitedInPeriod ? 'Visit completed' : row.lastVisit ? 'No visit this period' : 'No visit recorded';
  var visitReasonSub = row.visitedInPeriod ? 'Routine visit logged in the selected period' : row.lastVisit ? 'Last visit: ' + row.lastVisit : 'No routine visit has been logged';
  var reasons = [
    { l: 'Score gap', v: scoreGap !== null ? scoreGap.toFixed(1) + ' pts' : '—', s: (score !== null ? score + ' now · ' + _hubState.escapeLine + ' needed for the next band' : 'Score not available') + ' · ' + row.severity + '/50 support points' },
    { l: 'Recent direction', v: trend.prev ? (Math.round(trend.ceiChange * 10) === 0 ? 'No change' : (trend.ceiChange < 0 ? 'Down ' : 'Up ') + Math.abs(trend.ceiChange).toFixed(1) + ' pts') : 'Not available', s: (trend.prev ? 'Compared with the previous calendar month' : 'Previous calendar month has no score') + ' · ' + row.momentum + '/25 support points' },
    { l: 'Time in focus', v: row.focusMonths + ' of ' + row.monthsWithData + ' months', s: (row.monthsWithData < 2 ? 'Needs at least two scored months' : row.focusStreak + '-month current focus run') + ' · ' + row.persistence + '/15 support points' },
    { l: 'Routine visit', v: visitReasonValue, s: visitReasonSub + ' · ' + row.coverage + '/10 support points' }
  ];
  h += '<h4 class="focus-section-title">Why this bakery is in focus</h4><div class="focus-reasons">' +
    reasons.map(function(reason) {
      return '<div class="focus-reason"><span class="focus-reason__label">' + reason.l + '</span><strong>' + reason.v + '</strong><span class="focus-reason__sub">' + reason.s + '</span></div>';
    }).join('') + '</div>';

  // Trend chart
  if (FM.length >= 2) {
    h += '<h4 class="focus-section-title">Score trend vs company average</h4><div class="focus-chart-wrap"><canvas id="focusDetailChart"></canvas></div>';
  }

  // Driver diagnosis
  var drivers = _driverList(rec);
  if (drivers.length) {
    h += '<div class="focus-section-heading"><h4 class="focus-section-title">Where to improve first</h4><p>Ranked against other bakeries · longer bars are better</p></div><div class="focus-drivers">' +
      drivers.map(function(d) {
        var valStr = _fmtDriverValue(d);
        var benchStr = d.fmt === 'secs' ? G.formatSecs(d.bench) : d.fmt === 'pct' ? d.bench + '%' : '' + d.bench;
        var deltaHtml = '';
        if (trend.latest && trend.prev && trend.latest[d.key] !== null && trend.latest[d.key] !== undefined && trend.prev[d.key] !== null && trend.prev[d.key] !== undefined) {
          var dv = trend.latest[d.key] - trend.prev[d.key];
          deltaHtml = _driverDeltaHtml(d, dv);
        }
        var barColor = d.pct <= 10 ? 'var(--red)' : d.pct <= 30 ? 'var(--amber)' : 'var(--green)';
        return '<div class="focus-driver">' +
          '<div class="focus-driver__head">' +
            '<span class="focus-driver__name">' + esc(d.label) + '</span>' +
            '<span class="focus-driver__val"><strong>' + esc(valStr) + '</strong> <em>Target ' + esc(benchStr) + '</em></span>' +
            '<span class="focus-driver__delta">' + deltaHtml + '</span>' +
          '</div>' +
          '<div class="focus-driver__bar"><div class="focus-driver__fill" style="width:' + Math.max(2, Math.round(d.pct)) + '%;background:' + barColor + '"></div></div>' +
          '<div class="focus-driver__sub"><span>' + esc(_driverGapText(d)) + '</span><span>' + esc(_driverStandingText(d.pct)) + '</span></div>' +
        '</div>';
      }).join('') + '</div>';
  }

  // Recommended actions
  var actions = [];
  drivers.slice(0, 2).forEach(function(d) { if (_DRIVER_ACTIONS[d.key]) actions.push(_DRIVER_ACTIONS[d.key]); });
  if (trend.streak >= 3) actions.push('Score has dipped ' + trend.streak + ' months running — partner with the ops manager on a reset plan with a clear review date.');
  if (!row.lastVisit) actions.push('No routine visit has ever been logged here — schedule one to verify what the data is showing on the ground.');
  else if (!row.visitedInPeriod) actions.push('No routine visit logged this period — schedule one to verify what the data is showing on the ground.');
  if (row.quickWin) actions.push('This bakery is within touching distance of graduating out of focus — small gains here pay off fastest.');
  if (actions.length) {
    h += '<h4 class="focus-section-title">Suggested next steps</h4><ul class="focus-actions">' +
      actions.map(function(a) { return '<li>' + a + '</li>'; }).join('') + '</ul>';
  }

  // Month-by-month table
  h += '<h4 class="focus-section-title">Month by month</h4><div class="table-wrap"><table class="focus-month-table"><thead><tr>' +
    '<th>Month</th><th>' + (isAbsolute ? 'Benchmark' : 'Peer') + ' score (0–100)</th><th>Band</th><th>Drink + Meal NPS</th><th>Drink quality</th><th>Customer-rated efficiency</th><th>Friendliness</th><th>Within 2 minutes</th><th>Average drink wait</th><th>Responses</th>' +
    '</tr></thead><tbody>' +
    FM.map(function(m, i) {
      var r = trend.hist[i];
      if (!r || r[cf] === null || r[cf] === undefined) {
        return '<tr><td>' + esc(m) + '</td><td colspan="9" style="color:var(--muted)">No data</td></tr>';
      }
      return '<tr><td>' + esc(m) + '</td>' +
        '<td style="font-weight:700">' + r[cf] + '</td>' +
        '<td><span class="band ' + G.bc(r[bf]) + '">' + esc(r[bf]) + '</span></td>' +
        '<td>' + (r.n !== null && r.n !== undefined ? r.n : '—') + '</td>' +
        '<td>' + (r.dr !== null && r.dr !== undefined ? r.dr + '%' : '—') + '</td>' +
        '<td>' + (r.ef !== null && r.ef !== undefined ? r.ef + '%' : '—') + '</td>' +
        '<td>' + (r.fr !== null && r.fr !== undefined ? r.fr + '%' : '—') + '</td>' +
        '<td>' + (r.ts !== null && r.ts !== undefined ? r.ts + '%' : '—') + '</td>' +
        '<td>' + G.formatSecs(r.at) + '</td>' +
        '<td>' + (r.v !== null && r.v !== undefined ? r.v : '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>';

  // Visit link
  if (row.lastVisit) {
    var vd = new Date(row.lastVisit + 'T00:00:00');
    var vdStr = isNaN(vd.getTime()) ? row.lastVisit : vd.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    h += '<button type="button" class="focus-detail__visitbtn" data-visit-report="' + esc(name) + '">Open latest visit report — ' + esc(vdStr) + ' →</button>';
  } else {
    h += '<p class="focus-detail__novisit">No routine visit has been logged for this bakery yet.</p>';
  }

  body.innerHTML = h;
  modal.style.display = 'flex';
  if (!alreadyOpen) _hubLockScroll();
  modal.scrollTop = 0;
  body.scrollTop = 0;
  _updateDetailNav(name);

  if (FM.length >= 2) {
    var allAvgByMonth = FM.map(function(m) {
      var recs = G.state.ALL.filter(function(r) { return r.m === m && r[cf] !== null && r[cf] !== undefined && !isNaN(r[cf]); });
      return recs.length ? recs.reduce(function(a, r) { return a + r[cf]; }, 0) / recs.length : null;
    });
    G.makeChart('focusDetailChart', { type: 'line', data: { labels: FM, datasets: [
      { label: name, data: trend.hist.map(function(r) { return r ? r[cf] : null; }), borderColor: bandColor, backgroundColor: 'rgba(178, 42, 36, 0.10)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5, spanGaps: true },
      { label: 'Company average', data: allAvgByMonth, borderColor: 'rgba(146, 137, 120, 0.55)', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2, borderDash: [6, 4] }
    ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { min: 0, max: 100 }, x: { ticks: { font: { size: 10 } } } }, maintainAspectRatio: false } });
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
  var names = _visibleQueueRows().map(function(r) { return r.name; });
  if (names.indexOf(name) === -1) names = _hubState.rows.map(function(r) { return r.name; });
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

window.GAILS.stepFocusDetail = function(delta) {
  if (!_detailNav) return;
  var idx = _detailNav.idx + delta;
  if (idx < 0 || idx >= _detailNav.names.length) return;
  GAILS.openFocusDetail(_detailNav.names[idx]);
};

window.GAILS.closeFocusDetail = function() {
  var modal = document.getElementById('focusDetailModal');
  if (!modal || modal.style.display === 'none') return;
  GAILS.destroyChart('focusDetailChart');
  modal.style.display = 'none';
  _detailNav = null;
  _hubUnlockScroll();
};

document.addEventListener('click', function(event) {
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

document.addEventListener('keydown', function(event) {
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
(function() {
  var DEFAULT_CENTER = [52.5, -1.8];
  var DEFAULT_ZOOM = 6;
  var lockedScrollY = 0;

  var NETWORK_LEGEND = {
    relative: [
      { label: 'Top Performer', color: '#1E70C4' },
      { label: 'Above Average', color: '#1D9E5C' },
      { label: 'Below Average', color: '#C97F12' },
      { label: 'Low Performer', color: '#B22A24' },
      { label: 'Incomplete', color: '#B3AA99' },
      { label: 'No Data', color: '#B3AA99' }
    ],
    absolute: [
      { label: 'Exceeding', color: '#1E70C4' },
      { label: 'Meeting', color: '#1D9E5C' },
      { label: 'Approaching', color: '#C97F12' },
      { label: 'Below Standard', color: '#B22A24' },
      { label: 'Incomplete', color: '#B3AA99' },
      { label: 'No Data', color: '#B3AA99' }
    ]
  };

  var NETWORK_HINT = {
    relative: '<span style="color:var(--green);font-weight:600">&#9679; Top Performer</span> &nbsp;&middot;&nbsp; <span style="color:var(--blue);font-weight:600">&#9679; Above Average</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Below Average</span> &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">&#9679; Low Performer</span>',
    absolute: '<span style="color:var(--green);font-weight:600">&#9679; Exceeding</span> &nbsp;&middot;&nbsp; <span style="color:var(--blue);font-weight:600">&#9679; Meeting</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Approaching</span> &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">&#9679; Below Standard</span>'
  };

  var TARGET_LEGEND = {
    relative: [
      { label: 'Low Performer', color: '#B22A24' },
      { label: 'Below Average', color: '#C97F12' }
    ],
    absolute: [
      { label: 'Below Standard', color: '#B22A24' },
      { label: 'Approaching', color: '#C97F12' }
    ]
  };

  var TARGET_HINT = {
    relative: '<span style="color:var(--red);font-weight:600">&#9679; Low Performer</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Below Average</span> &nbsp;&middot;&nbsp; Click a pin for details. Imported site names are matched back to the correct GAIL\'s bakery before plotting.',
    absolute: '<span style="color:var(--red);font-weight:600">&#9679; Below Standard</span> &nbsp;&middot;&nbsp; <span style="color:var(--amber);font-weight:600">&#9679; Approaching</span> &nbsp;&middot;&nbsp; Click a pin for details. Imported site names are matched back to the correct GAIL\'s bakery before plotting.'
  };

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
      bandField: 'cb',
      legendItems: NETWORK_LEGEND.relative,
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
      legendItems: TARGET_LEGEND.absolute,
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

  function buildAreaTooltip(mgr, items, bandField, networkAvg, areaTotal, areaVisited) {
    var scoreField = bandField === 'acb' ? 'ac' : 'c';
    var sum = 0, scored = 0;
    items.forEach(function(item) {
      var s = item[scoreField];
      if (s != null && !isNaN(s)) { sum += s; scored++; }
    });
    var coverageLine = '<br><span style="font-size:0.82em;opacity:0.85">' +
      areaTotal + ' baker' + (areaTotal === 1 ? 'y' : 'ies') + ' &nbsp;&middot;&nbsp; ' +
      areaVisited + ' visited this period</span>';
    var header = '<strong>' + escapeHtml(mgr) + '’s Area</strong>';
    if (scored === 0) return header + coverageLine;
    var areaAvg = Math.round(sum / scored * 10) / 10;
    var diff = Math.round((areaAvg - networkAvg) * 10) / 10;
    var diffStr = diff >= 0 ? '+' + diff : '' + diff;
    return header +
      '<br><span style="font-size:0.82em;opacity:0.85">' + areaAvg + ' &nbsp;&middot;&nbsp; ' + diffStr + ' vs avg</span>' +
      coverageLine;
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
    arr.forEach(function(sub) { rings = rings.concat(ringsFromLatLngs(sub)); });
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
    rings.forEach(function(ring) {
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
    cfg.legendControl.onAdd = function() {
      var div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = cfg.legendItems.map(function(item) {
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
    cfg.instance.getContainer().addEventListener('mouseleave', function() {
      (cfg._areaTooltipLayers || []).forEach(function(p) { p.closeTooltip(); });
      cfg._hoveredArea = null;
    });
    cfg.instance.on('mousemove', function(e) {
      var active = cfg._hoveredArea;
      if (!active) return;
      var stillInside = active.polygons.some(function(p) { return pointInPolygonLayer(e.latlng, p); });
      if (!stillInside) {
        active.polygons.forEach(function(p) {
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
      'Top Performer': 0, Outstanding: 0,
      'Above Average': 1, Exceeding: 1,
      'Below Average': 2, Approaching: 2,
      'Low Performer': 3, 'Below Standard': 3
    }[band] || 0;
  }

  var VIBRANT_MAP_COLORS = {
    'Top Performer': '#1976d2',
    'Above Average': '#00b853',
    'Below Average': '#f57c00',
    'Low Performer': '#d32f2f',
    'Exceeding': '#1976d2',
    'Meeting': '#00b853',
    'Approaching': '#f57c00',
    'Below Standard': '#d32f2f',
    'Incomplete': '#8d8d8d',
    'No Data': '#8d8d8d',
    'Default': '#d32f2f'
  };

  function getMarkerColor(item, bandField) {
    if (item && item.incompletePeriod) return VIBRANT_MAP_COLORS['Incomplete'];
    if (item && item.noData) return VIBRANT_MAP_COLORS['No Data'];
    var band = item && item[bandField || 'cb'];
    return VIBRANT_MAP_COLORS[band] || VIBRANT_MAP_COLORS['Default'];
  }

  function formatLastVisitDate(isoDate) {
    if (!isoDate) return 'No routine visit logged yet';
    var d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return 'No routine visit logged yet';
    return 'Last visited ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function getPopupHtml(item, color, bandField) {
    var siteLabel = GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(item.b) : item.b;
    var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
    var region = GAILS.getBakeryRegion ? GAILS.getBakeryRegion(item.b) : 'Unknown';
    var lastVisit = GAILS.getLastVisitDate ? GAILS.getLastVisitDate(item.b) : null;

    if (item.noData) {
      var statusLabel = item.incompletePeriod ? 'Incomplete' : 'No Data';
      var statusCopy = item.incompletePeriod
        ? 'Incomplete data for this selected period'
        : 'No performance data for this period';
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

    var visitLine = lastVisit
      ? '<button type="button" class="map-popup__visit map-popup__visit--link" data-visit-report="' + escapeHtml(item.b) + '">' + escapeHtml(formatLastVisitDate(lastVisit)) + ' &rarr;</button>'
      : '<div class="map-popup__visit">' + escapeHtml(formatLastVisitDate(lastVisit)) + '</div>';

    return '<div class="map-popup">' +
      '<div class="map-popup__name">' + escapeHtml(siteLabel) + '</div>' +
      '<span class="map-popup__band" style="background:' + color + '">' + escapeHtml(band || 'Unknown') + '</span>' +
      '<div class="map-popup__stats">Index <strong>' + escapeHtml(cei) + '</strong> &nbsp;&middot;&nbsp; NPS ' + escapeHtml(nps) + ' &nbsp;&middot;&nbsp; Vol ' + escapeHtml(volume) + '</div>' +
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
      scoreStr = 'No data';
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
    Object.keys(managerGroups).forEach(function(mgr) {
      if (mgr === 'Unknown' || mgr === 'Other') return;
      var seen = {};
      managerGroups[mgr].coords.forEach(function(ll) {
        var k = ll[0].toFixed(6) + ',' + ll[1].toFixed(6);
        if (!seen[k]) { seen[k] = true; realPts.push({lat: ll[0], lng: ll[1], mgr: mgr}); }
      });
    });
    if (realPts.length < 2) return {};

    var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    realPts.forEach(function(p) {
      if(p.lat<minLat)minLat=p.lat; if(p.lat>maxLat)maxLat=p.lat;
      if(p.lng<minLng)minLng=p.lng; if(p.lng>maxLng)maxLng=p.lng;
    });

    var spread = Math.max(maxLat - minLat, maxLng - minLng);
    var sentPad = spread * 3 + 0.8;

    var pts = realPts.slice();
    var mcLat = (minLat + maxLat) / 2, mcLng = (minLng + maxLng) / 2;
    [[minLat-sentPad,minLng-sentPad],[minLat-sentPad,mcLng],[minLat-sentPad,maxLng+sentPad],
     [mcLat,minLng-sentPad],[mcLat,maxLng+sentPad],
     [maxLat+sentPad,minLng-sentPad],[maxLat+sentPad,mcLng],[maxLat+sentPad,maxLng+sentPad]
    ].forEach(function(c){ pts.push({lat:c[0],lng:c[1],mgr:SENTINEL}); });

    var n = pts.length;
    var lats = pts.map(function(p){return p.lat;});
    var lngs = pts.map(function(p){return p.lng;});
    var mgrs = pts.map(function(p){return p.mgr;});

    function circumcircle(ia, ib, ic) {
      var ax=lats[ia],ay=lngs[ia],bx=lats[ib],by=lngs[ib],cx=lats[ic],cy=lngs[ic];
      var D = 2*(ax*(by-cy)+bx*(cy-ay)+cx*(ay-by));
      if (Math.abs(D) < 1e-12) return null;
      var ux=((ax*ax+ay*ay)*(by-cy)+(bx*bx+by*by)*(cy-ay)+(cx*cx+cy*cy)*(ay-by))/D;
      var uy=((ax*ax+ay*ay)*(cx-bx)+(bx*bx+by*by)*(ax-cx)+(cx*cx+cy*cy)*(bx-ax))/D;
      return {x:ux,y:uy,r2:(ax-ux)*(ax-ux)+(ay-uy)*(ay-uy)};
    }

    var sMinX=Infinity,sMaxX=-Infinity,sMinY=Infinity,sMaxY=-Infinity;
    for(var i=0;i<n;i++){
      if(lats[i]<sMinX)sMinX=lats[i];if(lats[i]>sMaxX)sMaxX=lats[i];
      if(lngs[i]<sMinY)sMinY=lngs[i];if(lngs[i]>sMaxY)sMaxY=lngs[i];
    }
    var dM = Math.max(sMaxX-sMinX,sMaxY-sMinY)*20;
    lats.push(sMinX-dM, sMinX+dM*3, sMinX-dM);
    lngs.push(sMinY-dM, sMinY-dM, sMaxY+dM*3);

    var tris = [{v:[n,n+1,n+2], c:circumcircle(n,n+1,n+2)}];

    for (var i=0; i<n; i++) {
      var px=lats[i],py=lngs[i],bad=[],good=[];
      for(var t=0;t<tris.length;t++){
        var ci=tris[t].c;
        if(ci&&(px-ci.x)*(px-ci.x)+(py-ci.y)*(py-ci.y)<ci.r2-1e-10){bad.push(tris[t]);}
        else{good.push(tris[t]);}
      }
      var eCnt={};
      for(var b=0;b<bad.length;b++){
        var v=bad[b].v;
        for(var j=0;j<3;j++){var a=v[j],bb=v[(j+1)%3];var k=a<bb?a+'_'+bb:bb+'_'+a;eCnt[k]=(eCnt[k]||0)+1;}
      }
      tris=good;
      var eKs=Object.keys(eCnt);
      for(var ek=0;ek<eKs.length;ek++){
        if(eCnt[eKs[ek]]!==1)continue;
        var vs=eKs[ek].split('_');
        tris.push({v:[+vs[0],+vs[1],i],c:circumcircle(+vs[0],+vs[1],i)});
      }
    }
    tris=tris.filter(function(t){return t.v[0]<n&&t.v[1]<n&&t.v[2]<n;});

    var e2t={};
    for(var ti=0;ti<tris.length;ti++){
      var v=tris[ti].v;
      for(var j=0;j<3;j++){var a=v[j],b=v[(j+1)%3];var k=a<b?a+'_'+b:b+'_'+a;if(!e2t[k])e2t[k]=[];e2t[k].push(ti);}
    }

    var mgrSegs={};
    var e2tKs=Object.keys(e2t);
    for(var ek=0;ek<e2tKs.length;ek++){
      var tIdxs=e2t[e2tKs[ek]];
      if(tIdxs.length!==2)continue;
      var vs=e2tKs[ek].split('_');
      var mA=mgrs[+vs[0]],mB=mgrs[+vs[1]];
      if(mA===mB)continue;
      var c1=tris[tIdxs[0]].c,c2=tris[tIdxs[1]].c;
      if(!c1||!c2)continue;
      var seg=[[c1.x,c1.y],[c2.x,c2.y]];
      if(mA!==SENTINEL){if(!mgrSegs[mA])mgrSegs[mA]=[];mgrSegs[mA].push(seg);}
      if(mB!==SENTINEL){if(!mgrSegs[mB])mgrSegs[mB]=[];mgrSegs[mB].push(seg);}
    }

    function clipPolyToBounds(poly,b0,b1,b2,b3){
      function ins(pt,e){if(e===0)return pt[1]>=b2;if(e===1)return pt[1]<=b3;if(e===2)return pt[0]>=b0;return pt[0]<=b1;}
      function inter(a,b,e){var t;if(e<2){var lng=e?b3:b2;t=(lng-a[1])/(b[1]-a[1]);return[a[0]+t*(b[0]-a[0]),lng];}else{var lat=e===2?b0:b1;t=(lat-a[0])/(b[0]-a[0]);return[lat,a[1]+t*(b[1]-a[1])];}}
      var res=poly;
      for(var e=0;e<4;e++){if(!res.length)return[];var inp=res;res=[];for(var i=0;i<inp.length;i++){var cur=inp[i],prv=inp[(i+inp.length-1)%inp.length];if(ins(cur,e)){if(!ins(prv,e))res.push(inter(prv,cur,e));res.push(cur);}else if(ins(prv,e))res.push(inter(prv,cur,e));}}
      return res;
    }

    function ptKey(p){return p[0].toFixed(8)+'|'+p[1].toFixed(8);}

    var result={};
    var mgrKs=Object.keys(mgrSegs);
    for(var mi=0;mi<mgrKs.length;mi++){
      var mgr=mgrKs[mi];
      var segs=mgrSegs[mgr];
      var adj={};
      for(var si=0;si<segs.length;si++){
        var kA=ptKey(segs[si][0]),kB=ptKey(segs[si][1]);
        if(!adj[kA])adj[kA]=[];if(!adj[kB])adj[kB]=[];
        adj[kA].push({k:kB,pt:segs[si][1]});adj[kB].push({k:kA,pt:segs[si][0]});
      }
      // Open-chain segments (ops area territory open on one side, e.g. split across geography)
      // have end-vertices with degree 1. Starting traversal mid-chain fragments it into
      // pieces too short to render. Sort so open-end segments come first and are
      // oriented with the open end as the start vertex, ensuring the full chain is walked.
      var openEnds={};
      Object.keys(adj).forEach(function(k){if(adj[k].length===1)openEnds[k]=true;});
      var orderedSegs=[];
      for(var si=0;si<segs.length;si++){
        var kA=ptKey(segs[si][0]),kB=ptKey(segs[si][1]);
        if(openEnds[kA])orderedSegs.push(segs[si]);
        else if(openEnds[kB])orderedSegs.push([segs[si][1],segs[si][0]]);
      }
      for(var si=0;si<segs.length;si++){
        var kA=ptKey(segs[si][0]),kB=ptKey(segs[si][1]);
        if(!openEnds[kA]&&!openEnds[kB])orderedSegs.push(segs[si]);
      }
      var usedEdges={},loops=[];
      for(var si=0;si<orderedSegs.length;si++){
        var skA=ptKey(orderedSegs[si][0]),skB=ptKey(orderedSegs[si][1]);
        var eKey=skA<skB?skA+'~'+skB:skB+'~'+skA;
        if(usedEdges[eKey])continue;
        usedEdges[eKey]=true;
        var loopPts=[orderedSegs[si][0]],prev=skA,cur=skB,curPt=orderedSegs[si][1],safety=0;
        while(cur!==skA&&safety++<20000){
          var ns=adj[cur]||[],nxt=null;
          for(var ni=0;ni<ns.length;ni++){
            if(ns[ni].k===prev)continue;
            var nek=cur<ns[ni].k?cur+'~'+ns[ni].k:ns[ni].k+'~'+cur;
            if(usedEdges[nek])continue;
            nxt=ns[ni];usedEdges[nek]=true;break;
          }
          if(!nxt)break;
          loopPts.push(curPt);prev=cur;cur=nxt.k;curPt=nxt.pt;
        }
        if(loopPts.length>=3)loops.push(loopPts);
      }
      if(loops.length>0){
        var mc=managerGroups[mgr]?managerGroups[mgr].coords:[];
        var mL=Infinity,mH=-Infinity,mLn=Infinity,mLx=-Infinity;
        mc.forEach(function(c){if(c[0]<mL)mL=c[0];if(c[0]>mH)mH=c[0];if(c[1]<mLn)mLn=c[1];if(c[1]>mLx)mLx=c[1];});
        var mg=0.07;
        var clippedLoops=loops.map(function(lp){return clipPolyToBounds(lp,mL-mg,mH+mg,mLn-mg,mLx+mg);}).filter(function(cl){return cl.length>=3;});
        if(clippedLoops.length>0)result[mgr]=clippedLoops;
      }
    }
    return result;
  }

  // Months that count as "this period" for visit tracking, including the current
  // month when a rolling window is active. Shared by the visit filter and the
  // area coverage counts so both agree on what "visited in period" means.
  function getPeriodMonths() {
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

  function getVisitFilteredItems(cfg, items) {
    var list = items || cfg.items;
    var filterState = (cfg.key === 'network' ? _networkMapVisitState : _targetMapVisitState) || 'all';
    if (filterState === 'all') return list;
    var months = getPeriodMonths();
    return list.filter(function(item) {
      var visited = GAILS.isBakeryVisitedInPeriod ? GAILS.isBakeryVisitedInPeriod(item.b, months) : false;
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
    return names.filter(function(name) {
      if (regionFilter.length && regionFilter.indexOf(G.getBakeryRegion(name)) < 0) return false;
      if (opsFilter.length && opsFilter.indexOf(G.getBakeryOps(name)) < 0) return false;
      if (searchBakery.length && !searchBakery.some(function(s) { return name.toLowerCase().indexOf(s.toLowerCase()) >= 0; })) return false;
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
    cfg.items.forEach(function(item) {
      var key = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(item.b) : item.b;
      byName[key] = item;
    });
    return getFilteredBakeryNames().map(function(name) {
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

    // The dashboard normally fills gaps with grey "No Data" pins so bakeries
    // without a record for the selected period remain visible. Once a band is
    // selected, cfg.items has already been narrowed by getData(); merging the
    // full bakery directory back in would incorrectly turn every out-of-band
    // bakery into a "No Data" pin.
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
      visibleItems.forEach(function(item) {
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
      visibleItems.forEach(function(item) {
        var s = item[_areaScoreField];
        if (s != null && !isNaN(s)) { _netSum += s; _netCount++; }
      });
      var networkAvg = _netCount > 0 ? _netSum / _netCount : 0;

      // Average score per ops area, plus the spread of those averages, so peer mode
      // can band each area against the other areas (see getAreaBandColor).
      function _areaAverage(items) {
        var sum = 0, n = 0;
        items.forEach(function(item) {
          var s = item[_areaScoreField];
          if (s != null && !isNaN(s)) { sum += s; n++; }
        });
        return n > 0 ? sum / n : null;
      }
      var _areaAvgByMgr = {};
      Object.keys(managerGroups).forEach(function(mgr) {
        if (mgr === 'Unknown' || mgr === 'Other') return;
        _areaAvgByMgr[mgr] = _areaAverage(managerGroups[mgr].items);
      });
      var _areaAvgVals = Object.keys(_areaAvgByMgr)
        .map(function(m) { return _areaAvgByMgr[m]; })
        .filter(function(v) { return v != null; });

      // Coverage per area from the full source set (before the visit filter) so the
      // tooltip reports the true area size and how many were visited this period,
      // regardless of which visit filter is active.
      var _periodMonths = getPeriodMonths();
      var areaTotals = {}, areaVisited = {};
      sourceItems.forEach(function(item) {
        var ops = GAILS.getBakeryOps ? GAILS.getBakeryOps(item.b) : 'Unknown';
        if (areaTotals[ops] == null) { areaTotals[ops] = 0; areaVisited[ops] = 0; }
        areaTotals[ops]++;
        var v = GAILS.isBakeryVisitedInPeriod ? GAILS.isBakeryVisitedInPeriod(item.b, _periodMonths) : false;
        if (v) areaVisited[ops]++;
      });

      Object.keys(managerGroups).forEach(function(mgr) {
        if (mgr === 'Unknown' || mgr === 'Other') return;
        var group = managerGroups[mgr];
        var total = areaTotals[mgr] != null ? areaTotals[mgr] : group.items.length;
        var visited = areaVisited[mgr] != null ? areaVisited[mgr] : 0;
        var color = getAreaBandColor(_areaAvgByMgr[mgr], cfg.bandField, _areaAvgVals);
        var tooltip = buildAreaTooltip(mgr, group.items, cfg.bandField, networkAvg, total, visited);
        var dashArray = AREA_DASH_PATTERNS[mgrIndex % AREA_DASH_PATTERNS.length] || null;
        mgrIndex++;

        var polyList = voronoiPolys[mgr];
        if (!polyList || !polyList.length) return;

        var polygons = polyList.map(function(poly) {
          var polygon = L.polygon(poly, {
            color: color,
            weight: 3.5,
            opacity: 1.0,
            dashArray: dashArray,
            fillColor: color,
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
        polygons.forEach(function(polygon) {
          polygon.on('mouseover', function() {
            cfg._areaTooltipLayers.forEach(function(p) { if (p !== polygon) p.closeTooltip(); });
            polygons.forEach(function(p) { p.setStyle({ fillOpacity: 0.4, weight: 4.5, dashArray: null }); p.bringToFront(); });
            cfg._hoveredArea = { polygons: polygons, dashArray: dashArray };
          });
          polygon.on('mouseout', function() {
            polygon.closeTooltip();
            polygons.forEach(function(p) { p.setStyle({ fillOpacity: 0.22, weight: 3.5, dashArray: dashArray }); });
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
    var items = [].concat(visibleItems).sort(function(a, b) {
      var aNoData = !!a.noData, bNoData = !!b.noData;
      if (aNoData && bNoData) return (a.b || '').localeCompare(b.b || '');
      if (aNoData !== bNoData) return aNoData ? 1 : -1;
      var bandDelta = getBandPriority(a, bf) - getBandPriority(b, bf);
      if (bandDelta !== 0) return bandDelta;
      return (a.c || 0) - (b.c || 0);
    });

    items.forEach(function(item) {
      var meta = GAILS.getBakeryMeta ? GAILS.getBakeryMeta(item.b) : GAILS.BAKERY_META[item.b];
      var ll = meta && meta.ll;
      if (!ll) {
        missing.push(item.b);
        return;
      }

      var color = getMarkerColor(item, bf);
      var marker = L.circleMarker(ll, {
        radius: 9,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.88
      });
      marker.bindPopup(getPopupHtml(item, color, bf));
      var glanceHtml = getGlanceHtml(item, color, bf);
      (function(ops) {
        marker.on('mouseover', function() {
          (cfg._areaTooltipLayers || []).forEach(function(p) { p.closeTooltip(); });
          cfg._hoveredArea = null;
          // At-a-glance tooltip after a short hover-intent delay; click opens
          // the full popup. Bound lazily with permanent:true so Leaflet's own
          // instant open-on-hover behaviour never kicks in.
          clearTimeout(marker._glanceTimer);
          marker._glanceTimer = setTimeout(function() {
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
          (Array.isArray(areas) ? areas : [areas]).forEach(function(area) {
            if (area._isPolyline) {
              area.setStyle({ opacity: 0.95, weight: 9, dashArray: null });
            } else {
              area.setStyle({ fillOpacity: 0.28, weight: 3.5, dashArray: null });
            }
            area.bringToFront();
          });
        });
        marker.on('mouseout', function() {
          clearTimeout(marker._glanceTimer);
          marker.closeTooltip();
          var areas = cfg.areaPolygons && cfg.areaPolygons[ops];
          if (!areas) return;
          (Array.isArray(areas) ? areas : [areas]).forEach(function(area) {
            area.setStyle({ fillOpacity: 0.1, weight: 2, dashArray: area._origDash });
          });
        });
        marker.on('click', function() {
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

    cfg.missingItems = missing.slice().sort(function(a, b) {
      return a.localeCompare(b);
    }).map(function(name) {
      return {
        bakery: GAILS.getBakeryMapLabel ? GAILS.getBakeryMapLabel(name) : name,
        region: GAILS.getBakeryRegion ? GAILS.getBakeryRegion(name) : 'Unknown',
        ops: GAILS.getBakeryOps ? GAILS.getBakeryOps(name) : 'Unknown'
      };
    });

    var total = visibleItems.length;
    var msg = placed + ' of ' + total + ' baker' + (total === 1 ? 'y' : 'ies') + ' mapped.';
    var noDataCount = items.filter(function(it) { return it.noData; }).length;
    if (noDataCount === total) {
      msg = 'No performance data yet for this period — showing ' + msg.charAt(0).toLowerCase() + msg.slice(1);
    } else if (noDataCount > 0) {
      msg += ' ' + noDataCount + ' site' + (noDataCount === 1 ? '' : 's') + ' with no data yet this period.';
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
  window.GAILS.debugMapMatch = function(names) {
    var G = GAILS;
    var cfg = MAPS.network;
    var targetNames = names && names.length ? names : buildMergedItems(cfg).filter(function(it) { return it.noData; }).map(function(it) { return it.b; });
    if (!targetNames.length) {
      console.log('[debugMapMatch] Nothing currently flagged as no-data on the network map.');
      return;
    }
    var rawByResolvedKey = {};
    (cfg.items || []).forEach(function(item) {
      var key = G.resolveBakeryMetaKey ? G.resolveBakeryMetaKey(item.b) : item.b;
      if (!rawByResolvedKey[key]) rawByResolvedKey[key] = [];
      rawByResolvedKey[key].push(item.b);
    });
    targetNames.forEach(function(name) {
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

  window.GAILS.storeDashboardMapData = function(items) {
    storeMapItems('network', items);
  };

  window.GAILS.initDashboardMap = function() {
    ensureMap('network');
  };

  window.GAILS.storeMapTargets = function(targets) {
    storeMapItems('target', targets);
  };

  window.GAILS.initTargetMap = function() {
    ensureMap('target');
  };

  window.GAILS.setTargetMapMetric = function(metric) {
    var cfg = MAPS.target;
    var isAbsolute = metric === 'absolute';
    cfg.bandField = isAbsolute ? 'acb' : 'cb';
    cfg.legendItems = isAbsolute ? TARGET_LEGEND.absolute : TARGET_LEGEND.relative;

    var hintEl = document.getElementById('targetMapLegendHint');
    if (hintEl) hintEl.innerHTML = isAbsolute ? TARGET_HINT.absolute : TARGET_HINT.relative;

    if (cfg.instance) {
      renderLegend(cfg);
      placeMarkers(cfg);
    }
  };

  window.GAILS.setNetworkMapMetric = function(metric) {
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

  window.GAILS.setNetworkMapArea = function(state) {
    _networkMapAreaState = state;
    var cfg = MAPS.network;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setTargetMapArea = function(state) {
    _targetMapAreaState = state;
    var cfg = MAPS.target;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setNetworkMapVisitFilter = function(state) {
    _networkMapVisitState = state;
    var cfg = MAPS.network;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  window.GAILS.setTargetMapVisitFilter = function(state) {
    _targetMapVisitState = state;
    var cfg = MAPS.target;
    if (cfg.instance) {
      placeMarkers(cfg);
    }
  };

  // Re-renders any active maps whose visit filter is not "all", so a fresh
  // routineVisits sync (js/auth.js) is reflected without needing a manual
  // filter toggle or period change.
  window.GAILS.refreshMapVisitFilters = function() {
    Object.keys(MAPS).forEach(function(key) {
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
  window.GAILS.invalidateMapSize = function(key) {
    var cfg = MAPS[key];
    if (!cfg || !cfg.instance) return;
    var run = function() { cfg.instance.invalidateSize(); };
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

  window.GAILS.openUnmappedSitesModal = function(mapKey) {
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
    ].map(function(k) {
      return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + escapeHtml(k.v) + '</div><div class="target-stat-card__label">' + escapeHtml(k.l) + '</div></div>';
    }).join('');

    tableBody.innerHTML = items.length
      ? items.map(function(item) {
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

  window.GAILS.closeUnmappedSitesModal = function() {
    var modal = document.getElementById('unmappedSitesModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    unlockBackgroundScroll();
  };

  document.addEventListener('click', function(event) {
    var trigger = event.target && event.target.closest ? event.target.closest('[data-unmapped-trigger]') : null;
    if (!trigger) return;
    window.GAILS.openUnmappedSitesModal(trigger.getAttribute('data-unmapped-trigger'));
  });

  document.addEventListener('keydown', function(event) {
    if (event.key !== 'Escape') return;
    window.GAILS.closeUnmappedSitesModal();
  });
})();

window.GAILS.renderTargets = function(data) {
  var G = GAILS;
  var state = G.state;
  var isAbsolute = state.targetMetric !== 'relative';
  var bf = isAbsolute ? 'acb' : 'cb';
  var cf = isAbsolute ? 'ac' : 'c';
  var highBand = isAbsolute ? 'Below Standard' : 'Low Performer';
  var lowBand = isAbsolute ? 'Approaching' : 'Below Average';

  var targets = [].concat(data).filter(function(b) {
    return b[bf] === highBand || b[bf] === lowBand;
  }).sort(function(a, b) { return a[cf] - b[cf]; });

  G.storeMapTargets(targets);

  _renderFocusHub(targets, data, bf, cf, highBand, lowBand, isAbsolute);
  _renderInsights(targets, bf, cf, lowBand, isAbsolute);
  _renderTargetTable(targets, bf, cf, highBand, isAbsolute);
  _renderTargetTrends(targets, bf, cf, highBand, lowBand, isAbsolute);
};

function _renderInsights(targets, bf, cf, lowBand, isAbsolute) {
  var insightsEl = document.getElementById('targetInsights');
  var insightsTitle = document.getElementById('targetInsightsTitle');
  if (insightsTitle) insightsTitle.style.display = targets.length === 0 ? 'none' : '';
  if (targets.length === 0) { insightsEl.innerHTML = ''; return; }

  var focusCounts = { 'Drink + Meal NPS': [], 'Overall Efficiency': [], 'Drink Quality': [], Friendliness: [], 'Coffee Efficiency': [] };
  targets.forEach(function(b) {
    var areas = [
      { name: 'Drink + Meal NPS', pct: b.np },
      { name: 'Overall Efficiency', pct: b.ep }, { name: 'Drink Quality', pct: b.dp },
      { name: 'Friendliness', pct: b.fp }, { name: 'Coffee Efficiency', pct: b.ap },
    ].sort(function(a, x) { return a.pct - x.pct; });
    focusCounts[areas[0].name].push(b.b);
  });
  var topWeakness = Object.entries(focusCounts).sort(function(a, b) { return b[1].length - a[1].length; })[0];
  var quickWinLine = (isAbsolute ? 75 : 50) - 5;
  var quickWins = targets.filter(function(b) { return b[bf] === lowBand && b[cf] >= quickWinLine; });
  var quickWinsThreshold = isAbsolute ? 'close to Meeting' : 'close to Good';
  var weakAreas = Object.entries(focusCounts).filter(function(e) { return e[1].length > 0; }).sort(function(a, b) { return b[1].length - a[1].length; });

  var h = '<div class="insight-grid">';

  h += '<div class="insight-card"><h4>\uD83C\uDF31 Biggest Growth Opportunity</h4><p><span class="stat">' + topWeakness[1].length + '</span> of ' + targets.length + ' bakeries \u2014 <strong>' + topWeakness[0] + '</strong></p><div class="action">\u2192 Prioritise ' + topWeakness[0].toLowerCase() + ' coaching</div></div>';

  h += '<div class="insight-card"><h4>\u2B50 Quick Wins</h4>';
  if (quickWins.length > 0) {
    h += '<p><span class="stat">' + quickWins.length + '</span> baker' + (quickWins.length === 1 ? 'y' : 'ies') + ' within 5 points of leaving focus &mdash; ' + quickWinsThreshold + '</p><ul>' + quickWins.map(function(b) { return '<li><strong>' + b.b + '</strong> \u2014 ' + b[cf] + '</li>'; }).join('') + '</ul><div class="action">\u2192 Focus here for fastest gains</div>';
  } else {
    h += '<p style="color:var(--muted)">No bakeries within quick-win range of ' + (isAbsolute ? 'Meeting' : 'Above Average') + ' yet.</p>';
  }
  h += '</div>';

  h += '<div class="insight-card"><h4>\uD83D\uDCCB Coaching Priorities</h4>';
  weakAreas.forEach(function(entry) {
    var pct = Math.round((entry[1].length / targets.length) * 100);
    h += '<div class="coaching-area"><span class="coaching-area__name">' + entry[0] + '</span><span class="coaching-area__count">' + entry[1].length + ' baker' + (entry[1].length === 1 ? 'y' : 'ies') + '</span></div><div class="coaching-area__bar"><div class="coaching-area__fill" style="width:' + pct + '%"></div></div>';
  });
  h += '</div>';

  h += '</div>';
  insightsEl.innerHTML = h;
}

function _renderTargetTable(targets, bf, cf, highBand, isAbsolute) {
  var G = GAILS;
  var getFocus = function(b) {
    var list = [
      { name: 'Drink + Meal NPS', pct: b.np },
      { name: 'Overall Efficiency', pct: b.ep }, { name: 'Drink Quality', pct: b.dp },
      { name: 'Friendliness', pct: b.fp }, { name: 'Coffee Efficiency', pct: b.ap }
    ];
    if (b.at !== null && b.at !== undefined && !isNaN(b.at)) {
      list.push({ name: 'Avg Wait Time', pct: b.atp });
    }
    return list.sort(function(a, x) { return a.pct - x.pct; })[0];
  };
  var focusLabel = function(pct) {
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
  var hasVal = function(v) { return v !== null && v !== undefined && !isNaN(v); };
  var numOrDash = function(v) { return hasVal(v) ? v : '—'; };
  var pctOrDash = function(v) { return hasVal(v) ? v + '%' : '—'; };
  var npsSplitStyle = function(v) {
    if (!hasVal(v)) return '';
    return ' style="color:' + (v >= 55 ? 'var(--green)' : v >= 45 ? 'var(--amber)' : 'var(--red)') + '"';
  };
  var atRagStyle = function(v) {
    if (!hasVal(v)) return '';
    return ' style="color:' + (v <= 115 ? 'var(--green)' : v < 120 ? 'var(--amber)' : 'var(--red)') + '"';
  };

  document.getElementById('targetTable').innerHTML = targets.length === 0
    ? '<p style="text-align:center;color:var(--muted);padding:32px 0">No bakeries in ' + highBand + ' or adjacent bands for this period.</p>'
    : '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">\ud83c\udf31 Support Priority List</h3><p class="tracker-table-header__copy">Ranked lowest Score first. <strong>Biggest Lever</strong> = each bakery&rsquo;s lowest-scoring area, where improvement lifts the overall score most. <span style="color:var(--red)">Red</span> scores = bottom quarter of all bakeries. Click a bakery name for its full performance breakdown.</p></div></div><div class="table-wrap"><table data-nps-splits class="' + (G.npsSplitsExpanded ? '' : 'nps-splits-collapsed') + '"><thead><tr><th>Priority</th><th>Bakery</th><th>Region</th><th>Ops Area</th><th>' + ceiHeader + '</th><th>' + altCeiHeader + '</th><th>' + bandHeader + '</th><th>NPS (DRINK &amp; MEAL) ' + G.npsSplitToggleHtml() + '</th><th class="nps-split-col">NPS Coffee</th><th class="nps-split-col">NPS Meal</th><th class="nps-split-col">NPS (All)</th><th>Vol</th><th>Conf</th><th>Quality</th><th>Efficiency</th><th>Friendliness</th><th>&le;30s</th><th>&le;2m</th><th>&gt;5m</th><th>Avg Wait</th><th>Drinks</th><th>Biggest Lever</th></tr></thead><tbody>' +
    targets.map(function(b, i) {
      var focus = getFocus(b);
      var focusColor = focus.pct <= 10 ? 'var(--red)' : 'var(--amber)';
      var confTag = b.co === 'Low' ? ' <span style="font-size:0.58rem;color:var(--red);font-weight:600">LOW VOL</span>' : '';
      return '<tr>' +
        '<td style="font-weight:700;color:' + (b[bf] === highBand ? 'var(--red)' : 'var(--amber)') + '">' + (i + 1) + '</td>' +
        '<td><button type="button" class="focus-name-link" data-focus-detail="' + G.escapeHtml(b.b) + '">' + b.b + '</button>' + confTag + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryRegion(b.b) + '</td>' +
        '<td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(b.b) + '</td>' +
        '<td style="font-weight:700">' + b[cf] + '</td>' +
        '<td style="font-weight:600">' + b[altCeiField] + '</td>' +
        '<td><span class="band ' + G.bc(b[bf]) + '">' + b[bf] + '</span></td>' +
        '<td style="color:' + (b.n >= 55 ? 'var(--green)' : b.n >= 45 ? 'var(--amber)' : 'var(--red)') + '">' + b.n + '</td>' +
        '<td class="nps-split-col"' + npsSplitStyle(b.nc) + '>' + numOrDash(b.nc) + '</td>' +
        '<td class="nps-split-col"' + npsSplitStyle(b.nm) + '>' + numOrDash(b.nm) + '</td>' +
        '<td class="nps-split-col"' + npsSplitStyle(b.na) + '>' + numOrDash(b.na) + '</td>' +
        '<td>' + b.v + '</td>' +
        '<td><span class="conf ' + G.bc(b.co) + '">' + b.co + '</span></td>' +
        '<td style="color:' + (b.dr >= 90 ? 'var(--green)' : b.dr >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.dr + '%</td>' +
        '<td style="color:' + (b.ef >= 90 ? 'var(--green)' : b.ef >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.ef + '%</td>' +
        '<td style="color:' + (b.fr >= 90 ? 'var(--green)' : b.fr >= 80 ? 'var(--amber)' : 'var(--red)') + '">' + b.fr + '%</td>' +
        '<td>' + pctOrDash(b.s30) + '</td>' +
        '<td style="color:' + (b.ts >= 75 ? 'var(--green)' : b.ts >= 60 ? 'var(--amber)' : 'var(--red)') + '">' + b.ts + '%</td>' +
        '<td style="color:' + (b.o5 >= 2.5 ? 'var(--red)' : b.o5 > 1 ? 'var(--amber)' : 'var(--green)') + '">' + b.o5 + '%</td>' +
        '<td' + atRagStyle(b.at) + '>' + G.formatSecs(b.at) + '</td>' +
        '<td>' + numOrDash(b.td) + '</td>' +
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
    : ['Low Performer', 'Below Average', 'Above Average', 'Top Performer'];
  var FM = state.selectedMonths || [];
  var targetNames = targets.map(function(b) { return b.b; });
  var THRESHOLD = 3;

  if (FM.length < 2) {
    _clearTargetTrendCharts();
    document.getElementById('trendSummaryCards').innerHTML = '';
    document.getElementById('sparklineGrid').innerHTML = '';
    document.getElementById('targetTrendTable').innerHTML = '';
    _setTargetTrendState(false, 'Select at least two months to view focus bakery trend graphs and tables.');
    return;
  }

  if (targets.length === 0) {
    _clearTargetTrendCharts();
    document.getElementById('trendSummaryCards').innerHTML = '';
    document.getElementById('sparklineGrid').innerHTML = '';
    document.getElementById('targetTrendTable').innerHTML = '';
    _setTargetTrendState(false, 'No focus bakeries are in the ' + highBand + ' or ' + lowBand + ' bands for the current selection.');
    return;
  }

  _setTargetTrendState(true, '');

  var trendData = targetNames.map(function(name) { return _computeBakeryTrend(name, cf, FM); });

  var improving = trendData.filter(function(t) { return t.direction === 'up'; });
  var declining = trendData.filter(function(t) { return t.direction === 'down'; });
  var stable = trendData.filter(function(t) { return t.direction === 'flat'; });
  var chronic = trendData.filter(function(t) { return t.streak >= 3; });

  document.getElementById('trendSummaryCards').innerHTML = [
    { v: improving.length, l: 'Improving', col: 'var(--green)' },
    { v: stable.length, l: 'Steady', col: 'var(--muted-l)' },
    { v: declining.length, l: 'Dipping', col: 'var(--red)' },
    { v: chronic.length, l: 'Extended Dip (3+ Mo)', col: '#6B4FA8' },
  ].map(function(k) { return '<div class="target-stat-card"><div class="target-stat-card__value" style="color:' + k.col + '">' + k.v + '</div><div class="target-stat-card__label">' + k.l + '</div></div>'; }).join('');

  var ceiLabel = isAbsolute ? 'Avg Benchmark Score' : 'Avg Score';
  // Monthly averages must ignore unscored records (no-data / incomplete
  // months carry a null score) — summing them poisons the whole month's
  // average into NaN and the point silently vanishes from the chart.
  function _avgScoreForMonth(m, namesFilter) {
    var vals = state.ALL.filter(function(r) { return r.m === m && (!namesFilter || namesFilter.includes(r.b)); })
      .map(function(r) { return r[cf]; })
      .filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });
    return vals.length ? vals.reduce(function(a, v) { return a + v; }, 0) / vals.length : null;
  }
  var targetAvgByMonth = FM.map(function(m) { return _avgScoreForMonth(m, targetNames); });
  var allAvgByMonth = FM.map(function(m) { return _avgScoreForMonth(m, null); });

  G.makeChart('targetAvgTrend', { type: 'line', data: { labels: FM, datasets: [
    { label: 'Focus Bakeries ' + ceiLabel, data: targetAvgByMonth, borderColor: '#B22A24', backgroundColor: 'rgba(178, 42, 36,0.13)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5, spanGaps: true },
    { label: 'All Bakeries ' + ceiLabel, data: allAvgByMonth, borderColor: 'rgba(146, 137, 120,0.5)', backgroundColor: 'transparent', fill: false, tension: 0.3, pointRadius: 3, borderWidth: 2, borderDash: [6, 4], spanGaps: true },
  ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: ceiLabel }, min: 0, max: 100 }, x: { ticks: { font: { size: 10 } } } } } });

  G.makeChart('targetBandFlow', { type: 'bar', data: { labels: FM, datasets: allBandNames.map(function(bn) { return { label: bn, data: FM.map(function(m) { var recs = state.ALL.filter(function(r) { return r.m === m && targetNames.includes(r.b); }); return recs.length ? recs.filter(function(r) { return r[bf] === bn; }).length : 0; }), backgroundColor: (palette[bn] || '#888') + 'cc', borderColor: palette[bn] || '#888', borderWidth: 1 }; }) }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' } } } } });

  // Ops area momentum: average period-change of each area's focus bakeries,
  // worst-moving area first, so struggling patches jump out.
  var areaAgg = {};
  trendData.forEach(function(t) {
    var ops = G.getBakeryOps(t.name);
    if (!areaAgg[ops]) areaAgg[ops] = [];
    areaAgg[ops].push(t.periodChange || 0);
  });
  var areaMomentum = Object.keys(areaAgg).map(function(ops) {
    var vals = areaAgg[ops];
    return { ops: ops, n: vals.length, change: vals.reduce(function(a, v) { return a + v; }, 0) / vals.length };
  }).sort(function(a, b) { return a.change - b.change; });
  // The chart must be tall enough for one labelled row per area — with a
  // fixed height Chart.js auto-skips axis labels, and a hover then surfaces
  // an area name that isn't visible on the axis (reads as a wrong tooltip).
  var areaWrap = document.getElementById('targetAreaMomentumWrap');
  if (areaWrap) areaWrap.style.height = Math.max(180, areaMomentum.length * 26 + 70) + 'px';
  G.makeChart('targetAreaMomentum', { type: 'bar', data: {
    labels: areaMomentum.map(function(d) { return d.ops + ' (' + d.n + ')'; }),
    datasets: [{
      data: areaMomentum.map(function(d) { return Math.round(d.change * 10) / 10; }),
      backgroundColor: areaMomentum.map(function(d) { return d.change < 0 ? 'rgba(178, 42, 36,0.65)' : 'rgba(29, 158, 92,0.65)'; }),
      borderRadius: 3
    }]
  }, options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return (ctx.raw > 0 ? '+' : '') + ctx.raw + ' pts avg change across focus bakeries'; } } } }, scales: { x: { title: { display: true, text: 'Avg score change over the selected period' } }, y: { ticks: { font: { size: 10 }, autoSkip: false } } } } });

  // Sparkline cards
  var sparkGrid = document.getElementById('sparklineGrid');
  var sortVal = (document.getElementById('sparkSortBy') || {}).value || 'perf-asc';
  var sparkSorted = [].concat(trendData).sort(function(a, b) {
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
  sparkSorted.forEach(function(t) { G.destroyChart('spark_' + t.name.replace(/[^a-zA-Z0-9]/g, '_')); });
  sparkGrid.innerHTML = '';
  // Build card DOM (canvas elements only — charts drawn by _drawSparklines)
  sparkSorted.forEach(function(t) {
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

  // Momentum chart. Compares each bakery's consecutive *scored* months rather
  // than strict calendar neighbours, so a bakery with a gap month (or an
  // unscored record) still contributes instead of silently vanishing from the
  // counts. When the dataset has a month immediately before the selected
  // period, it is used as a baseline so the first selected month gets a bar
  // too (e.g. Mar–May selected → Mar's movement is measured against Feb).
  var momentumBaseline = _monthBeforePeriod(FM);
  var pairMonths = momentumBaseline ? [momentumBaseline].concat(FM) : FM;
  var barMonths = momentumBaseline ? FM : FM.slice(1);
  var momentumBuckets = {};
  barMonths.forEach(function(m) { momentumBuckets[m] = { up: 0, down: 0, flat: 0 }; });
  targetNames.forEach(function(name) {
    var recs = pairMonths.map(function(m) { return state.ALL.find(function(r) { return r.b === name && r.m === m; }); })
      .filter(function(r) { return r && r[cf] !== null && r[cf] !== undefined && !isNaN(r[cf]); });
    for (var ri = 1; ri < recs.length; ri++) {
      var bucket = momentumBuckets[recs[ri].m];
      if (!bucket) continue;
      var diff = recs[ri][cf] - recs[ri - 1][cf];
      if (diff >= THRESHOLD) bucket.up++; else if (diff <= -THRESHOLD) bucket.down++; else bucket.flat++;
    }
  });
  var momentumData = barMonths.map(function(m) {
    var b = momentumBuckets[m];
    return { m: m, up: b.up, down: b.down, flat: b.flat };
  });
  G.makeChart('targetMomentumChart', { type: 'bar', data: { labels: momentumData.map(function(d) { return d.m; }), datasets: [
    { label: 'Improving', data: momentumData.map(function(d) { return d.up; }), backgroundColor: 'rgba(29, 158, 92,0.65)', borderRadius: 3 },
    { label: 'Steady', data: momentumData.map(function(d) { return d.flat; }), backgroundColor: 'rgba(146, 137, 120,0.45)', borderRadius: 3 },
    { label: 'Dipping', data: momentumData.map(function(d) { return -d.down; }), backgroundColor: 'rgba(178, 42, 36,0.65)', borderRadius: 3 },
  ] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } }, tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + Math.abs(ctx.raw); } } } }, scales: { x: { stacked: true, ticks: { font: { size: 10 } } }, y: { stacked: true, title: { display: true, text: 'Bakeries' }, ticks: { callback: function(v) { return Math.abs(v); } } } } } });

  // Helpers
  var dirIcon = function(dir) {
    if (dir === 'up') return '<span class="dir up">&uarr; Improving</span>';
    if (dir === 'down') return '<span class="dir down">&darr; Dipping</span>';
    if (dir === 'flat') return '<span class="dir flat">&harr; Steady</span>';
    return '<span class="dir new-entry">New</span>';
  };
  var changeStr = function(val) {
    if (val === null || val === undefined || isNaN(val)) return '\u2014';
    if (val === 0) return '\u2014';
    var sign = val > 0 ? '+' : '';
    var col = val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--muted)';
    return '<span style="color:' + col + ';font-weight:600">' + sign + val.toFixed(1) + '</span>';
  };

  trendData.sort(function(a, b) { var order = { down: 0, flat: 1, up: 2, new: 3 }; if (order[a.direction] !== order[b.direction]) return order[a.direction] - order[b.direction]; return a.ceiChange - b.ceiChange; });

  var latestMonth = FM.length > 0 ? FM[FM.length - 1] : '—';
  var latestMonthIdx = state.MONTHS ? state.MONTHS.indexOf(latestMonth) : -1;
  var prevMonth = latestMonthIdx >= 1 ? state.MONTHS[latestMonthIdx - 1] : '—';
  var threeAgoMonth = latestMonthIdx >= 3 ? state.MONTHS[latestMonthIdx - 3] : '—';
  var firstMonth = FM.length > 0 ? FM[0] : '—';

  var trendCeiHeader = (isAbsolute ? 'Benchmark ' : 'Peer ') + 'Score (' + latestMonth + ')';
  document.getElementById('targetTrendTable').innerHTML = '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">Performance Trends \u2014 Table</h3><p class="tracker-table-header__copy"><span style="color:var(--green);font-weight:600">\u2191 Improving</span> = +3pts &nbsp;&middot;&nbsp; <span style="color:var(--red);font-weight:600">\u2193 Dipping</span> = \u22123pts &nbsp;&middot;&nbsp; <span style="color:var(--muted-l);font-weight:600">\u2194 Steady</span> = \u00b13pts &nbsp;&middot;&nbsp; Direction = month-on-month. 3-Month Trend = last 3 months. Click a bakery name for its full performance breakdown.</p></div></div><div class="table-wrap"><table><thead><tr><th>Bakery</th><th>Ops Area</th><th>' + trendCeiHeader + '</th><th>' + (isAbsolute ? 'Benchmark' : 'Peer') + ' Score Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Direction<br><span style="font-weight:400;font-size:0.6rem">Month-on-Month</span></th><th>NPS Change<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>3-Month Trend<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>3m ' + (isAbsolute ? 'Benchmark' : 'Peer') + ' Score Change<br><span style="font-weight:400;font-size:0.6rem">' + threeAgoMonth + ' &rarr; ' + latestMonth + '</span></th><th>Period Change<br><span style="font-weight:400;font-size:0.6rem">' + firstMonth + ' &rarr; ' + latestMonth + '</span></th><th>Dip Streak</th><th>Peak Month</th><th>Lowest Month</th><th>Quality &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Efficiency &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Friendliness &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th><th>Coffee Efficiency &Delta;<br><span style="font-weight:400;font-size:0.6rem">' + prevMonth + ' &rarr; ' + latestMonth + '</span></th></tr></thead><tbody>' +
  trendData.map(function(t) {
    var streakWarn = t.streak >= 3 ? 'color:#6B4FA8;font-weight:700' : t.streak >= 2 ? 'color:var(--red);font-weight:600' : '';
    return '<tr><td><button type="button" class="focus-name-link" data-focus-detail="' + G.escapeHtml(t.name) + '">' + t.name + '</button></td><td style="font-size:0.68rem;color:var(--muted)">' + G.getBakeryOps(t.name) + '</td><td style="font-weight:700">' + (t.latest ? t.latest[cf] : '\u2014') + '</td><td>' + changeStr(t.ceiChange) + '</td><td>' + dirIcon(t.direction) + '</td><td>' + changeStr(t.npsChange) + '</td><td>' + dirIcon(t.trend3m) + '</td><td>' + changeStr(t.cei3mChange) + '</td><td>' + changeStr(t.periodChange) + '</td><td style="' + streakWarn + '">' + (t.streak > 0 ? t.streak + ' month' + (t.streak > 1 ? 's' : '') : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.best ? t.best.m + ' (' + t.best[cf] + ')' : '\u2014') + '</td><td style="font-size:0.68rem">' + (t.worst ? t.worst.m + ' (' + t.worst[cf] + ')' : '\u2014') + '</td><td>' + (t.compTrends.drink !== undefined ? changeStr(t.compTrends.drink) : '\u2014') + '</td><td>' + (t.compTrends.efficiency !== undefined ? changeStr(t.compTrends.efficiency) : '\u2014') + '</td><td>' + (t.compTrends.friendliness !== undefined ? changeStr(t.compTrends.friendliness) : '\u2014') + '</td><td>' + (t.compTrends.timeliness !== undefined ? changeStr(t.compTrends.timeliness) : '\u2014') + '</td></tr>';
  }).join('') + '</tbody></table></div>';
  G.makeSortable(document.getElementById('targetTrendTable'));
}
