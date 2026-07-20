// ========== CHARTS MODULE ==========
window.GAILS = window.GAILS || {};

// ── GAIL's light-theme defaults for Chart.js ──
if (typeof Chart !== 'undefined') {
  function setSafe(obj, path, value) {
    var parts = path.split('.');
    var curr = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!curr[parts[i]]) {
        curr[parts[i]] = {};
      }
      curr = curr[parts[i]];
    }
    curr[parts[parts.length - 1]] = value;
  }

  setSafe(Chart, 'defaults.color', '#757575');
  setSafe(Chart, 'defaults.borderColor', 'rgba(34, 31, 26,0.07)');
  setSafe(Chart, 'defaults.font.family', '"Space Grotesk", Inter, system-ui, sans-serif');
  setSafe(Chart, 'defaults.plugins.legend.labels.color', '#757575');
  setSafe(Chart, 'defaults.plugins.legend.labels.font.family', '"Space Grotesk", Inter, system-ui, sans-serif');
  setSafe(Chart, 'defaults.plugins.legend.labels.usePointStyle', true);
  setSafe(Chart, 'defaults.plugins.tooltip.backgroundColor', '#FFFFFF');
  setSafe(Chart, 'defaults.plugins.tooltip.titleColor', '#221F1A');
  setSafe(Chart, 'defaults.plugins.tooltip.bodyColor', '#757575');
  setSafe(Chart, 'defaults.plugins.tooltip.borderColor', 'rgba(0,0,0,0.1)');
  setSafe(Chart, 'defaults.plugins.tooltip.borderWidth', 1);
  setSafe(Chart, 'defaults.plugins.tooltip.padding', 10);
  setSafe(Chart, 'defaults.plugins.tooltip.cornerRadius', 8);
  setSafe(Chart, 'defaults.plugins.tooltip.displayColors', false);

  if (Chart.defaults.scale) {
    setSafe(Chart, 'defaults.scale.grid.color', 'rgba(0,0,0,0.05)');
    setSafe(Chart, 'defaults.scale.ticks.color', '#8C8272');
    setSafe(Chart, 'defaults.scale.ticks.backdropColor', 'transparent');
    setSafe(Chart, 'defaults.scale.title.color', '#757575');
  }

  if (Chart.defaults.scales) {
    ['linear', 'category'].forEach(function (scaleType) {
      setSafe(Chart, 'defaults.scales.' + scaleType + '.grid.color', 'rgba(0,0,0,0.05)');
      setSafe(Chart, 'defaults.scales.' + scaleType + '.ticks.color', '#8C8272');
      setSafe(Chart, 'defaults.scales.' + scaleType + '.ticks.backdropColor', 'transparent');
      setSafe(Chart, 'defaults.scales.' + scaleType + '.title.color', '#757575');
    });
  }
}

var _charts = {};

window.GAILS.makeChart = function (id, config) {
  if (_charts[id]) _charts[id].destroy();
  var el = document.getElementById(id);
  if (!el) return;
  _charts[id] = new Chart(el, config);
};

window.GAILS.getChart = function (id) { return _charts[id]; };
window.GAILS.destroyChart = function (id) { if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; } };
window.GAILS.resizeChartsIn = function (container) {
  if (!container) return;
  Array.from(container.querySelectorAll('canvas[id]')).forEach(function (canvas) {
    var chart = _charts[canvas.id];
    if (chart) chart.resize();
  });
};

// ========== RENDER OVERVIEW CHARTS ==========
window.GAILS.renderOverviewCharts = function (data) {
  var G = GAILS;
  var avg = G.avg;
  data.forEach(G.ensureBands);
  var chartData = data.filter(function (r) { return r && !r.noData; });
  var n = chartData.length;
  if (!n) {
    ['npsHist', 'overviewBandSplit', 'npsVsCei', 'cxRadar', 'absComponentDrag', 'top10Chart', 'bot10Chart'].forEach(G.destroyChart);
    return;
  }
  var rankingsMetric = G.state.rankingsMetric === 'absolute' ? 'absolute' : 'relative';
  var isAbsolute = rankingsMetric === 'absolute';
  var valueKey = isAbsolute ? 'ac' : 'c';
  var altValueKey = isAbsolute ? 'c' : 'ac';
  var bandKey = isAbsolute ? 'acb' : 'cb';
  var colorMap = isAbsolute ? G.ABSCOL : G.COL;
  var bandNames = isAbsolute ? G.ABS_BAND_NAMES : G.BAND_NAMES;
  var metricLabel = isAbsolute ? 'Benchmark Score' : 'Peer Score';
  var altMetricLabel = isAbsolute ? 'Peer Score' : 'Benchmark Score';

  // NPS Histogram
  var bins = []; for (var i = -10; i <= 100; i += 10) bins.push({ min: i, max: i + 10, count: 0 });
  chartData.forEach(function (b) { var idx = bins.findIndex(function (bn) { return b.n >= bn.min && b.n < bn.max; }); if (idx >= 0) bins[idx].count++; });
  G.makeChart('npsHist', { type: 'bar', data: { labels: bins.map(function (b) { return b.min + '\u2013' + b.max; }), datasets: [{ data: bins.map(function (b) { return b.count; }), backgroundColor: 'rgba(178, 42, 36,0.5)', hoverBackgroundColor: '#B22A24', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Bakeries' } }, x: { title: { display: true, text: 'NPS (D+M)' } } }, onHover: function (evt, elements) { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }, onClick: function (evt, elements) { if (elements.length > 0) { var idx = elements[0].index; var bin = bins[idx]; var bakeries = chartData.filter(function (b) { return b.n >= bin.min && b.n < bin.max; }); if (bakeries.length > 0) { G.showDrillDown('NPS (D+M) ' + bin.min + '\u2013' + bin.max, bakeries.length + ' bakeries in this segment', bakeries, 'nps'); } } } } });

  // CEI band split by selected lens
  var bandSplitTitle = document.getElementById('overviewBandSplitTitle');
  if (bandSplitTitle) bandSplitTitle.textContent = 'Index Band Split (' + metricLabel + ')';
  // "Incomplete" and "No Data" are both unscored states, already sharing the
  // same grey in colorMap — fold them into a single "Not Scored" slice.
  var pieBandNames = bandNames.filter(function (bn) { return bn !== 'Incomplete' && bn !== 'No Data'; });
  var pieLabels = pieBandNames.concat(['Not Scored']);
  var pieColors = pieBandNames.map(function (bn) { return colorMap[bn]; }).concat([colorMap['Incomplete'] || colorMap['No Data'] || '#B3AA99']);
  var pieCounts = pieBandNames.map(function (bn) { return data.filter(function (d) { return d[bandKey] === bn; }).length; })
    .concat([data.filter(function (d) { return d[bandKey] === 'Incomplete' || d[bandKey] === 'No Data'; }).length]);
  G.makeChart('overviewBandSplit', { type: 'doughnut', data: { labels: pieLabels, datasets: [{ data: pieCounts, backgroundColor: pieColors, borderWidth: 2, borderColor: 'rgba(255, 255, 255,0.6)' }] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, onClick: function (evt, elements) { if (elements.length > 0) { var idx = elements[0].index; var band = pieLabels[idx]; var bakeries = band === 'Not Scored' ? data.filter(function (d) { return d[bandKey] === 'Incomplete' || d[bandKey] === 'No Data'; }) : data.filter(function (d) { return d[bandKey] === band; }); G.showDrillDown(band, bakeries.length + ' bakeries in this band', bakeries, rankingsMetric); } } } });

  // NPS vs CEI
  var npsScatterTitle = document.getElementById('npsScatterTitle');
  if (npsScatterTitle) npsScatterTitle.textContent = 'NPS (Drink + Meal) vs ' + metricLabel;
  G.makeChart('npsVsCei', { type: 'scatter', data: { datasets: [{ data: chartData.map(function (b) { return { x: b[valueKey], y: b.n }; }), backgroundColor: chartData.map(function (b) { return colorMap[b[bandKey]] + '99'; }), borderColor: chartData.map(function (b) { return colorMap[b[bandKey]]; }), borderWidth: 1, pointRadius: 4.5, pointHitRadius: 12, pointHoverRadius: 7 }] }, options: { interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: function (items) { return chartData[items[0].dataIndex].b; }, label: function (ctx) { var b = chartData[ctx.dataIndex]; return [metricLabel + ': ' + b[valueKey] + ' (' + b[bandKey] + ')', 'NPS (D+M): ' + b.n, altMetricLabel + ': ' + b[altValueKey], 'Vol: ' + b.v + ' (' + b.co + ' confidence)']; } } } }, scales: { x: { title: { display: true, text: metricLabel }, min: 0, max: 100 }, y: { title: { display: true, text: 'NPS (D+M)' }, min: -15, max: 105 } } } });

  // Radar by selected CEI band
  var radarTitle = document.getElementById('overviewRadarTitle');
  if (radarTitle) radarTitle.textContent = 'Customer Experience by ' + metricLabel + ' Band';
  var cxBandSeries = bandNames.map(function (band) {
    var rows = chartData.filter(function (b) { return b[bandKey] === band; });
    if (!rows.length) return null;
    return {
      label: band,
      data: [avg(rows, 'ov'), avg(rows, 'fr'), avg(rows, 'dr'), avg(rows, 'ef')],
      borderColor: colorMap[band],
      backgroundColor: colorMap[band] + '33',
      borderWidth: 2
    };
  }).filter(Boolean);
  if (cxBandSeries.length) {
    G.makeChart('cxRadar', {
      type: 'radar', data: {
        labels: ['Overall', 'Friendliness', 'Quality', 'Overall Efficiency'], datasets: cxBandSeries
      }, options: { scales: { r: { min: 60, max: 100, ticks: { stepSize: 10 } } }, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  } else {
    G.destroyChart('cxRadar');
  }

  // Component drag by selected CEI lens
  var dragTitle = document.getElementById('overviewDragTitle');
  if (dragTitle) dragTitle.textContent = 'Biggest Drags on ' + metricLabel;
  var atRows = chartData.filter(function (b) { return typeof b.at === 'number' && !isNaN(b.at); });
  var rawAvgAt = atRows.length ? atRows.reduce(function (a, r) { return a + r.at; }, 0) / atRows.length : null;

  var componentAvgs = isAbsolute
    ? [
      { name: 'Drink + Meal NPS', avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.n, G.BENCHMARKS.nps, G.BENCHMARK_FLOORS.nps); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'n') },
      { name: 'Overall Efficiency', avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.ef, G.BENCHMARKS.ef, G.BENCHMARK_FLOORS.ef); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'ef') },
      { name: 'Drink Quality', avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.dr, G.BENCHMARKS.dr, G.BENCHMARK_FLOORS.dr); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'dr') },
      { name: 'Friendliness', avg: chartData.map(function (b) { return G.computeAbsoluteComponent(b.fr, G.BENCHMARKS.fr, G.BENCHMARK_FLOORS.fr); }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'fr') },
      { name: 'Coffee Efficiency', avg: chartData.map(function (b) { return b.ats; }).reduce(function (a, v) { return a + v; }, 0) / n, raw: avg(chartData, 'ts') },
      { name: 'Avg Wait Time', avg: chartData.map(function (b) { return (b.a_at !== undefined && b.a_at !== null) ? b.a_at : 100; }).reduce(function (a, v) { return a + v; }, 0) / n, raw: rawAvgAt }
    ]
    : [
      { name: 'Drink + Meal NPS', avg: avg(chartData, 'np'), raw: avg(chartData, 'n') },
      { name: 'Overall Efficiency', avg: avg(chartData, 'ep'), raw: avg(chartData, 'ef') },
      { name: 'Drink Quality', avg: avg(chartData, 'dp'), raw: avg(chartData, 'dr') },
      { name: 'Friendliness', avg: avg(chartData, 'fp'), raw: avg(chartData, 'fr') },
      { name: 'Coffee Efficiency', avg: avg(chartData, 'ap'), raw: avg(chartData, 'ts') },
      { name: 'Avg Wait Time', avg: avg(chartData, 'atp'), raw: rawAvgAt }
    ];
  componentAvgs.sort(function (a, b) { return a.avg - b.avg; });
  G.makeChart('absComponentDrag', {
    type: 'bar',
    data: { labels: componentAvgs.map(function (c) { return c.name; }), datasets: [{ label: isAbsolute ? 'Avg Benchmark Score' : 'Avg Peer Score', data: componentAvgs.map(function (c) { return Math.round(c.avg * 10) / 10; }), backgroundColor: componentAvgs.map(function (c) { return c.avg >= (isAbsolute ? 90 : 75) ? 'rgba(29, 158, 92,0.55)' : c.avg >= (isAbsolute ? 60 : 50) ? 'rgba(201, 127, 18,0.55)' : 'rgba(178, 42, 36,0.55)'; }), borderColor: componentAvgs.map(function (c) { return c.avg >= (isAbsolute ? 90 : 75) ? '#1D9E5C' : c.avg >= (isAbsolute ? 60 : 50) ? '#C97F12' : '#B22A24'; }), borderWidth: 2, borderRadius: 6, maxBarThickness: 26 }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { var c = componentAvgs[ctx.dataIndex]; var rawStr = c.name === 'Avg Wait Time' ? G.formatSecs(c.raw) : c.name === 'Drink + Meal NPS' ? (c.raw ? c.raw.toFixed(1) : '—') : (c.raw ? c.raw.toFixed(1) + '%' : '—'); return (isAbsolute ? 'Benchmark score: ' : 'Peer score: ') + ctx.raw + ' (raw avg: ' + rawStr + ')'; } } } }, scales: { x: { min: 0, max: 100, title: { display: true, text: isAbsolute ? 'Benchmark Component Score (100 = at target)' : 'Peer Component Score (100 = top of cohort)' }, grid: { color: function (ctx) { return isAbsolute && ctx.tick.value === 100 ? 'rgba(29, 158, 92,0.3)' : 'rgba(34, 31, 26,0.06)'; } } }, y: { ticks: { font: { size: 12, weight: 'bold' } } } } }
  });

  // Top 10 & Bottom 10
  var rankingData = [].concat(chartData).sort(function (a, b) { return b[valueKey] - a[valueKey]; });
  var top10 = rankingData.slice(0, 10);
  var bot10 = rankingData.slice(-10).reverse();
  var topTitle = document.getElementById('top10Title');
  var botTitle = document.getElementById('bot10Title');
  if (topTitle) topTitle.textContent = 'Top 10 Bakeries by ' + metricLabel;
  if (botTitle) botTitle.textContent = 'Bottom 10 Bakeries by ' + metricLabel;
  var tbOpts = function (items) {
    return { type: 'bar', data: { labels: items.map(function (b) { return b.b; }), datasets: [{ data: items.map(function (b) { return b[valueKey]; }), backgroundColor: items.map(function (b) { return colorMap[b[bandKey]]; }), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (ctx) { return metricLabel + ': ' + ctx.raw; } } } }, scales: { x: { min: 0, max: 100, title: { display: true, text: metricLabel } }, y: { ticks: { font: { size: 11, weight: '500' }, autoSkip: false } } } } };
  };
  G.makeChart('top10Chart', tbOpts(top10));
  G.makeChart('bot10Chart', tbOpts(bot10));
};

// ========== RENDER TREND CHARTS ==========
window.GAILS.renderTrendCharts = function (data) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var RM = G.getRollingMonths();

  if (state.ALL && G.ensureBands) {
    state.ALL.forEach(G.ensureBands);
  }

  // Build scoped dataset matching the same filters as the bakery tracker
  var trendSelectedBakeries = Array.isArray(state.searchBakery) ? state.searchBakery.slice() : [];
  var trendScopedAll = state.ALL.filter(function (r) {
    if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(r.b))) return false;
    if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(r.b))) return false;
    if (state.bandFilter) { var _bf = state.bandFilter; if (_bf.indexOf('abs:') === 0) { if (r.acb !== _bf.slice(4)) return false; } else { if (r.cb !== _bf) return false; } }
    if (trendSelectedBakeries.length && trendSelectedBakeries.indexOf(r.b) === -1) return false;
    return true;
  });

  // Build scope label for chart titles
  var trendScopeLabel = '';
  if (trendSelectedBakeries.length) {
    trendScopeLabel = trendSelectedBakeries.length === 1 ? trendSelectedBakeries[0] : trendSelectedBakeries.length + ' Bakeries';
  } else {
    var scopeParts = [];
    if (state.regionFilter.length) scopeParts.push(state.regionFilter.join(', '));
    if (state.opsFilter.length) scopeParts.push(state.opsFilter.join(', '));
    if (state.bandFilter) {
      var bf = state.bandFilter;
      scopeParts.push(bf.indexOf('abs:') === 0 ? bf.slice(4) : bf);
    }
    trendScopeLabel = scopeParts.join(' \u00b7 ');
  }
  function trendTitle(base) {
    return trendScopeLabel ? base + ' \u2014 ' + trendScopeLabel : base;
  }

  // Update h2 titles
  var el;
  el = document.getElementById('trendNPSTitle'); if (el) el.textContent = trendTitle('Average NPS (Drink + Meal) by Month');
  el = document.getElementById('trendCXTitle'); if (el) el.textContent = trendTitle('Average CX Scores by Month');
  el = document.getElementById('trendAbsBandsTitle'); if (el) el.textContent = trendTitle('Benchmark Score Bands by Month');
  el = document.getElementById('trendTimelinessTitle'); if (el) el.textContent = trendTitle('Average Coffee Efficiency by Month');
  el = document.getElementById('trendBandsTitle'); if (el) el.textContent = trendTitle('Peer Score Bands by Month');
  el = document.getElementById('trendSpeedTitle'); if (el) el.textContent = trendTitle('Average Speed Metrics by Month');
  el = document.getElementById('trendNpsSplitTitle'); if (el) el.textContent = trendTitle('NPS Split by Month');
  el = document.getElementById('trendWaitPressureTitle'); if (el) el.textContent = trendTitle('Coffee Timing Mix by Month');

  function rowsForMonth(month) {
    return trendScopedAll.filter(function (r) { return r.m === month; });
  }

  function avgDefined(rows, key) {
    var vals = rows
      .map(function (r) { return r[key]; })
      .filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    return vals.length ? vals.reduce(function (a, v) { return a + v; }, 0) / vals.length : null;
  }

  function round1OrNull(value) {
    return value === null || value === undefined || isNaN(value) ? null : Math.round(value * 10) / 10;
  }

  var trendNPS = RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.reduce(function (a, r) { return a + r.n; }, 0) / mr.length : null; });
  G.makeChart('trendNPS', { type: 'line', data: { labels: RM, datasets: [{ data: trendNPS, borderColor: G.COL['Top Performance'], backgroundColor: G.COL['Top Performance'] + '22', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Avg NPS (D+M)' } } } } });

  var trendKeys = [{ k: 'dr', l: 'Quality', c: '#1E70C4' }, { k: 'ef', l: 'Overall Efficiency', c: '#1D9E5C' }, { k: 'fr', l: 'Friendliness', c: '#C97F12' }, { k: 'ov', l: 'Overall', c: '#6B4FA8' }];
  G.makeChart('trendCX', { type: 'line', data: { labels: RM, datasets: trendKeys.map(function (tk) { return { label: tk.l, data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.reduce(function (a, r) { return a + r[tk.k]; }, 0) / mr.length : null; }), borderColor: tk.c, tension: 0.3, pointRadius: 3, borderWidth: 2 }; }) }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { title: { display: true, text: 'Score %' } } } } });

  // NPS split trend: exposes the newer Coffee / Meal / All-response columns.
  var npsSplitKeys = [
    { k: 'n', l: 'Drink + Meal', c: G.COL['Top Performance'], dash: [] },
    { k: 'nc', l: 'Coffee Only', c: '#1E70C4', dash: [5, 3] },
    { k: 'nm', l: 'Meal Only', c: '#C97F12', dash: [2, 3] },
    { k: 'na', l: 'All Responses', c: '#6B4FA8', dash: [7, 3] }
  ];
  G.makeChart('trendNpsSplit', {
    type: 'line',
    data: {
      labels: RM,
      datasets: npsSplitKeys.map(function (tk) {
        return {
          label: tk.l,
          data: RM.map(function (m) {
            var mr = rowsForMonth(m);
            return mr.length ? round1OrNull(avgDefined(mr, tk.k)) : null;
          }),
          borderColor: tk.c,
          backgroundColor: tk.c + '18',
          borderDash: tk.dash,
          tension: 0.3,
          pointRadius: 3,
          borderWidth: tk.k === 'n' ? 2.5 : 2
        };
      })
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 } } },
        tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + (ctx.raw === null ? 'No data' : ctx.raw); } } }
      },
      scales: { y: { title: { display: true, text: 'Avg NPS' }, min: -15, max: 105 } }
    }
  });

  // Coffee timing mix: turns cumulative speed percentages into actionable buckets.
  function timingBucketAvg(month, bucket) {
    var rows = rowsForMonth(month);
    var vals = rows.map(function (r) {
      var s2 = typeof r.s2 === 'number' && !isNaN(r.s2) ? r.s2 : null;
      var s3 = typeof r.s3 === 'number' && !isNaN(r.s3) ? r.s3 : null;
      var s4 = typeof r.s4 === 'number' && !isNaN(r.s4) ? r.s4 : null;
      var o5 = typeof r.o5 === 'number' && !isNaN(r.o5) ? r.o5 : null;
      if (s2 === null || s3 === null || s4 === null || o5 === null) return null;
      if (bucket === 'under2') return Math.max(0, Math.min(100, s2));
      if (bucket === 'twoToThree') return Math.max(0, s3 - s2);
      if (bucket === 'threeToFour') return Math.max(0, s4 - s3);
      if (bucket === 'fourToFive') return Math.max(0, 100 - s4 - o5);
      if (bucket === 'overFive') return Math.max(0, o5);
      return null;
    }).filter(function (v) { return typeof v === 'number' && !isNaN(v); });
    return vals.length ? round1OrNull(vals.reduce(function (a, v) { return a + v; }, 0) / vals.length) : null;
  }
  var customerEfficiency = RM.map(function (m) { return round1OrNull(avgDefined(rowsForMonth(m), 'ef')); });
  G.makeChart('trendWaitPressure', {
    type: 'bar',
    data: {
      labels: RM,
      datasets: [
        { label: '<2 min', data: RM.map(function (m) { return timingBucketAvg(m, 'under2'); }), backgroundColor: 'rgba(29, 158, 92,0.72)', borderColor: '#1D9E5C', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '2-3 min', data: RM.map(function (m) { return timingBucketAvg(m, 'twoToThree'); }), backgroundColor: 'rgba(30, 112, 196,0.42)', borderColor: '#1E70C4', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '3-4 min', data: RM.map(function (m) { return timingBucketAvg(m, 'threeToFour'); }), backgroundColor: 'rgba(201, 127, 18,0.48)', borderColor: '#C97F12', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '4-5 min', data: RM.map(function (m) { return timingBucketAvg(m, 'fourToFive'); }), backgroundColor: 'rgba(146, 137, 120,0.38)', borderColor: '#928978', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { label: '>5 min', data: RM.map(function (m) { return timingBucketAvg(m, 'overFive'); }), backgroundColor: 'rgba(178, 42, 36,0.65)', borderColor: '#B22A24', borderWidth: 1, borderRadius: 3, stack: 'timing', yAxisID: 'y' },
        { type: 'line', label: 'Customer-Rated Efficiency', data: customerEfficiency, borderColor: '#221F1A', backgroundColor: 'rgba(34, 31, 26,0.12)', tension: 0.3, pointRadius: 4, borderWidth: 2.5, yAxisID: 'y1' }
      ]
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 } } },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              if (ctx.raw === null) return ctx.dataset.label + ': No data';
              return ctx.dataset.label + ': ' + round1OrNull(ctx.raw) + '%';
            }
          }
        }
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          title: { display: true, text: '% of Drinks by Timing Band' },
          min: 0,
          max: 100
        },
        y1: {
          title: { display: true, text: 'Customer-Rated Efficiency %' },
          position: 'right',
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100
        }
      }
    }
  });

  // Absolute CEI band distribution over time
  var absBandDs = G.ABS_BAND_NAMES.map(function (bn) { return { label: bn, data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.filter(function (r) { return r.acb === bn; }).length / mr.length * 100 : 0; }), backgroundColor: G.ABSCOL[bn] + 'cc', borderColor: G.ABSCOL[bn], borderWidth: 1 }; });
  G.makeChart('trendAbsBands', { type: 'bar', data: { labels: RM, datasets: absBandDs }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '% of Bakeries' }, max: 100 } } } });

  // Beverage delivery time trend
  var trendTS = RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.reduce(function (a, r) { return a + r.ts; }, 0) / mr.length : null; });
  G.makeChart('trendTimeliness', { type: 'line', data: { labels: RM, datasets: [{ label: 'Avg Coffee Efficiency', data: trendTS, borderColor: '#6B4FA8', backgroundColor: 'rgba(107, 79, 168,0.13)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Coffee Efficiency (0-100)' }, min: 0, max: 100 } } } });

  // Band trend
  var bandDs = G.BAND_NAMES.map(function (bn) { return { label: bn, data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? mr.filter(function (r) { return r.cb === bn; }).length / mr.length * 100 : 0; }), backgroundColor: G.COL[bn] + 'cc', borderColor: G.COL[bn], borderWidth: 1 }; });
  G.makeChart('trendBands', { type: 'bar', data: { labels: RM, datasets: bandDs }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '% of Bakeries' }, max: 100 } } } });

  // Speed trend
  G.makeChart('trendSpeed', {
    type: 'line', data: {
      labels: RM, datasets: [
        { label: 'Avg Within 2 Min %', data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? avg(mr, 's2') : null; }), borderColor: '#1E70C4', tension: 0.3, pointRadius: 3, borderWidth: 2 },
        { label: 'Avg Over 5 Min %', data: RM.map(function (m) { var mr = rowsForMonth(m); return mr.length ? avg(mr, 'o5') : null; }), borderColor: '#B22A24', tension: 0.3, pointRadius: 3, borderWidth: 2, yAxisID: 'y2' }
      ]
    }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { title: { display: true, text: 'Within 2 Min %' }, position: 'left' }, y2: { title: { display: true, text: 'Over 5 Min %' }, position: 'right', grid: { drawOnChartArea: false } } } }
  });

  // Bakery tracker
  (function renderBakeryTracker() {
    var trackerStatusEl = document.getElementById('bakeryTrackerStatus');
    var trackerCanvas = document.getElementById('bakeryTracker');
    var trackerTableEl = document.getElementById('bakeryTrackerTable');
    var selectedBakeries = Array.isArray(state.searchBakery) ? state.searchBakery.slice() : [];
    var scopedRows = state.ALL.filter(function (r) {
      if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(r.b))) return false;
      if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(r.b))) return false;
      if (state.bandFilter) { var _bf = state.bandFilter; if (_bf.indexOf('abs:') === 0) { if (r.acb !== _bf.slice(4)) return false; } else { if (r.cb !== _bf) return false; } }
      if (selectedBakeries.length && selectedBakeries.indexOf(r.b) === -1) return false;
      return true;
    });
    var benchmarkRows = state.ALL.filter(function (r) {
      if (state.regionFilter.length && !state.regionFilter.includes(G.getBakeryRegion(r.b))) return false;
      if (state.opsFilter.length && !state.opsFilter.includes(G.getBakeryOps(r.b))) return false;
      if (state.bandFilter) { var _bf = state.bandFilter; if (_bf.indexOf('abs:') === 0) { if (r.acb !== _bf.slice(4)) return false; } else { if (r.cb !== _bf) return false; } }
      return true;
    });
    var isSingleBakery = selectedBakeries.length === 1;

    function clearTracker(statusText) {
      G.destroyChart('bakeryTracker');
      if (trackerCanvas) {
        var ctx = trackerCanvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, trackerCanvas.width || 0, trackerCanvas.height || 0);
      }
      if (trackerTableEl) trackerTableEl.innerHTML = '';
      if (trackerStatusEl) {
        trackerStatusEl.textContent = statusText;
        trackerStatusEl.className = 'status';
      }
    }

    function round1(value) {
      return Math.round(value * 10) / 10;
    }

    function formatValue(value, suffix) {
      return value === null || value === undefined ? '\u2014' : value.toFixed(1) + (suffix || '');
    }

    if (!scopedRows.length) {
      clearTracker('No tracker data is available for the current filters.');
      return;
    }

    var scopeLabel = selectedBakeries.length
      ? (selectedBakeries.length === 1 ? selectedBakeries[0] : selectedBakeries.length + ' selected bakeries')
      : 'All bakeries';
    var trackerRows = RM.map(function (m) {
      var scopedMonthRows = scopedRows.filter(function (r) { return r.m === m; });
      var benchmarkMonthRows = benchmarkRows.filter(function (r) { return r.m === m; });
      if (!scopedMonthRows.length) {
        return {
          month: m,
          n: null,
          c: null,
          ac: null,
          v: null,
          benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
        };
      }

      if (isSingleBakery) {
        return {
          month: m,
          n: scopedMonthRows[0].n,
          c: scopedMonthRows[0].c,
          ac: scopedMonthRows[0].ac,
          v: scopedMonthRows[0].v,
          benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
        };
      }

      return {
        month: m,
        n: round1(avg(scopedMonthRows, 'n')),
        c: round1(avg(scopedMonthRows, 'c')),
        ac: round1(avg(scopedMonthRows, 'ac')),
        v: Math.round(scopedMonthRows.reduce(function (total, row) { return total + row.v; }, 0)),
        benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
      };
    });
    var trackerNps = trackerRows.map(function (row) { return row.n; });
    var trackerCei = trackerRows.map(function (row) { return row.c; });
    var trackerAbsCei = trackerRows.map(function (row) { return row.ac; });
    var benchmarkNps = selectedBakeries.length
      ? trackerRows.map(function (row) { return row.benchmarkNps; })
      : null;
    var trackerTableRows = trackerRows.filter(function (row) {
      return row.n !== null || row.c !== null || row.ac !== null || row.v !== null;
    });

    if (trackerStatusEl) {
      trackerStatusEl.textContent = isSingleBakery
        ? 'Showing monthly datapoints for ' + scopeLabel + '.'
        : selectedBakeries.length
          ? 'Showing combined monthly averages for ' + scopeLabel + '.'
          : 'Showing all-bakeries monthly averages.';
      trackerStatusEl.className = 'status success';
    }

    if (trackerTableEl) {
      var tableTitle = isSingleBakery
        ? scopeLabel + ' Monthly Performance'
        : selectedBakeries.length
          ? 'Combined Monthly Performance for ' + scopeLabel
          : 'All Bakeries Monthly Average Performance';
      var tableDescription = isSingleBakery
        ? 'Actual monthly datapoints for ' + scopeLabel + ', with all-bakeries average NPS (Drink + Meal) shown for context.'
        : selectedBakeries.length
          ? 'Monthly average scores across the selected bakeries, with all-bakeries average NPS (Drink + Meal) shown for context.'
          : 'Monthly average scores across every bakery in the current filter scope.';
      trackerTableEl.innerHTML = trackerTableRows.length
        ? '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">'
        + tableTitle
        + '</h3><p class="tracker-table-header__copy">'
        + tableDescription
        + '</p></div></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>NPS (D+M)</th><th>Peer Score</th><th>Benchmark Score</th><th>Responses</th>' + (selectedBakeries.length ? '<th>All Bakeries Avg NPS (D+M)</th>' : '') + '</tr></thead><tbody>' +
        trackerTableRows.slice().reverse().map(function (row) {
          return '<tr>'
            + '<td>' + row.month + '</td>'
            + '<td>' + formatValue(row.n) + '</td>'
            + '<td>' + formatValue(row.c) + '</td>'
            + '<td>' + formatValue(row.ac) + '</td>'
            + '<td>' + (row.v === null || row.v === undefined ? '\u2014' : row.v) + '</td>'
            + (selectedBakeries.length ? '<td>' + formatValue(row.benchmarkNps) + '</td>' : '')
            + '</tr>';
        }).join('') + '</tbody></table></div>'
        : '';
      G.makeSortable(trackerTableEl);
    }

    G.makeChart('bakeryTracker', {
      type: 'line', data: {
        labels: RM, datasets: [
          { label: scopeLabel + (isSingleBakery ? ' NPS (D+M)' : ' Avg NPS (D+M)'), data: trackerNps, borderColor: G.COL['Top Performance'], tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
          { label: scopeLabel + (isSingleBakery ? ' Peer Score' : ' Avg Peer Score'), data: trackerCei, borderColor: '#1E70C4', tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
          { label: scopeLabel + (isSingleBakery ? ' Benchmark Score' : ' Avg Benchmark Score'), data: trackerAbsCei, borderColor: '#6B4FA8', tension: 0.3, pointRadius: 4, borderWidth: 2, borderDash: [6, 3] }
        ].concat(selectedBakeries.length ? [
          { label: 'All Bakeries Avg NPS (D+M)', data: benchmarkNps, borderColor: 'rgba(146, 137, 120,0.5)', borderDash: [5, 5], tension: 0.3, pointRadius: 0, borderWidth: 1.5 }
        ] : [])
      }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: 'Score' }, min: 0, max: 110 } } }
    });
  }());

  return { RM: RM, trendNPS: trendNPS };
};

// ========== RENDER SPEED vs NPS CHARTS ==========
window.GAILS.renderSpeedCharts = function (data) {
  var G = GAILS;
  var avg = G.avg;
  var n = data.length;

  // Shared rich tooltip for the scatter charts: bakery name + connected stats for that site.
  // (Chart.js v4 passes the context as the callback's first argument.)
  var num = function (v) { return (v === undefined || v === null || isNaN(v)) ? '—' : v; };
  var scatterTip = {
    displayColors: false,
    callbacks: {
      title: function (items) {
        var it = items && items[0];
        if (!it || it.datasetIndex === 1) return '';
        var b = data[it.dataIndex];
        return b ? b.b : '';
      },
      label: function (ctx) {
        if (ctx.datasetIndex === 1) return '';
        var b = data[ctx.dataIndex];
        if (!b) return '';
        var lines = [
          'NPS (D+M): ' + num(b.n),
          'Coffee Efficiency (<2 min): ' + num(b.s2) + '%',
          'Customer-Rated Efficiency: ' + num(b.ef) + '%',
          'Friendliness: ' + num(b.fr) + '%',
          'Drink Quality: ' + num(b.dr) + '%',
          'Overall CX: ' + num(b.ov) + '%'
        ];
        if (b.v !== undefined && b.v !== null) lines.push('Reviews: ' + b.v);
        return lines;
      }
    }
  };

  var xSm = avg(data, 's2'), ySm = avg(data, 'n');
  var sNum = 0, sDen = 0; data.forEach(function (b) { sNum += (b.s2 - xSm) * (b.n - ySm); sDen += (b.s2 - xSm) ** 2; });
  var sSlope = sDen ? sNum / sDen : 0, sInt = ySm - sSlope * xSm;
  G.makeChart('speedVsNps', {
    type: 'scatter', data: {
      datasets: [
        { data: data.map(function (b) { return { x: b.s2, y: b.n }; }), backgroundColor: 'rgba(178, 42, 36,0.35)', borderColor: 'rgba(178, 42, 36,0.2)', pointRadius: 3.5, borderWidth: 1 },
        { type: 'line', data: [{ x: 35, y: sSlope * 35 + sInt }, { x: 95, y: sSlope * 95 + sInt }], borderColor: '#B22A24', borderWidth: 2.5, borderDash: [6, 4], pointRadius: 0 }
      ]
    }, options: { plugins: { legend: { display: false }, tooltip: scatterTip }, scales: { x: { title: { display: true, text: 'Coffee Speed (% within 2 min)', font: { weight: 'bold' } }, min: 35, max: 95 }, y: { title: { display: true, text: 'NPS (D+M)', font: { weight: 'bold' } }, min: -15, max: 105 } } }
  });

  var xEm = avg(data, 'ef');
  var eNum = 0, eDen = 0; data.forEach(function (b) { eNum += (b.ef - xEm) * (b.n - ySm); eDen += (b.ef - xEm) ** 2; });
  var eSlope = eDen ? eNum / eDen : 0, eInt = ySm - eSlope * xEm;
  G.makeChart('effVsNps', {
    type: 'scatter', data: {
      datasets: [
        { data: data.map(function (b) { return { x: b.ef, y: b.n }; }), backgroundColor: 'rgba(29, 158, 92,0.3)', borderColor: 'rgba(29, 158, 92,0.15)', pointRadius: 3.5, borderWidth: 1 },
        { type: 'line', data: [{ x: 35, y: eSlope * 35 + eInt }, { x: 102, y: eSlope * 102 + eInt }], borderColor: '#1D9E5C', borderWidth: 2.5, pointRadius: 0 }
      ]
    }, options: { plugins: { legend: { display: false }, tooltip: scatterTip }, scales: { x: { title: { display: true, text: 'Customer-Rated Overall Efficiency %', font: { weight: 'bold' } }, min: 35, max: 102 }, y: { title: { display: true, text: 'NPS (D+M)', font: { weight: 'bold' } }, min: -15, max: 105 } } }
  });

  // Quartile compare
  var bySpd = [].concat(data).sort(function (a, b) { return a.s2 - b.s2; });
  var byEff = [].concat(data).sort(function (a, b) { return a.ef - b.ef; });
  var q = Math.floor(n / 4);
  var sqNPS = [bySpd.slice(0, q), bySpd.slice(q, 2 * q), bySpd.slice(2 * q, 3 * q), bySpd.slice(3 * q)].map(function (g) { return avg(g, 'n'); });
  var eqNPS = [byEff.slice(0, q), byEff.slice(q, 2 * q), byEff.slice(2 * q, 3 * q), byEff.slice(3 * q)].map(function (g) { return avg(g, 'n'); });
  G.makeChart('quartileCompare', {
    type: 'bar', data: {
      labels: ['Lowest 25%', 'Below Avg', 'Above Avg', 'Highest 25%'], datasets: [
        { label: 'By Coffee Speed', data: sqNPS, backgroundColor: 'rgba(178, 42, 36,0.28)', borderColor: '#B22A24', borderWidth: 2, borderRadius: 6 },
        { label: 'By Cust. Efficiency', data: eqNPS, backgroundColor: 'rgba(29, 158, 92,0.28)', borderColor: '#1D9E5C', borderWidth: 2, borderRadius: 6 }
      ]
    }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11, weight: 'bold' } } } }, scales: { y: { title: { display: true, text: 'Avg NPS (D+M)', font: { weight: 'bold' } }, min: 0, max: 90 }, x: { title: { display: true, text: 'Quartile (worst \u2192 best)', font: { weight: 'bold' } } } } }
  });

  document.getElementById('speedGapVal').textContent = Math.round(Math.abs(sqNPS[3] - sqNPS[0])) + ' pts';
  document.getElementById('effGapVal').textContent = Math.round(Math.abs(eqNPS[3] - eqNPS[0])) + ' pts';

  // R² comparison
  var corr = function (k) { var xm = avg(data, k), ym = avg(data, 'n'); var num = 0, xd = 0, yd = 0; data.forEach(function (b) { num += (b[k] - xm) * (b.n - ym); xd += (b[k] - xm) ** 2; yd += (b.n - ym) ** 2; }); return xd && yd ? (num * num) / (xd * yd) * 100 : 0; };
  var metrics = [
    { name: 'Within 2 min', r2: corr('s2'), t: 'speed' }, { name: 'Within 3 min', r2: corr('s3'), t: 'speed' },
    { name: 'Over 5 min', r2: corr('o5'), t: 'speed' },
    { name: 'Friendliness', r2: corr('fr'), t: 'cx' }, { name: 'Drink Quality', r2: corr('dr'), t: 'cx' },
    { name: 'Overall Efficiency', r2: corr('ef'), t: 'cx' }, { name: 'Overall CX', r2: corr('ov'), t: 'cx' }
  ];
  metrics.sort(function (a, b) { return a.r2 - b.r2; });
  G.makeChart('corrCompare', { type: 'bar', data: { labels: metrics.map(function (m) { return m.name; }), datasets: [{ data: metrics.map(function (m) { return Math.round(m.r2 * 10) / 10; }), backgroundColor: metrics.map(function (m) { return m.t === 'speed' ? 'rgba(178, 42, 36,0.42)' : 'rgba(29, 158, 92,0.42)'; }), borderColor: metrics.map(function (m) { return m.t === 'speed' ? '#B22A24' : '#1D9E5C'; }), borderWidth: 2, borderRadius: 5 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return c.raw + '% of NPS (D+M) explained'; } } } }, scales: { x: { title: { display: true, text: '% of NPS (D+M) Variance Explained (R\u00B2)', font: { weight: 'bold' } }, min: 0 }, y: { ticks: { font: { size: 11, weight: 'bold' } } } } } });
};
