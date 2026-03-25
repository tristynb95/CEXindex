// ========== CHARTS MODULE ==========
window.GAILS = window.GAILS || {};

// ── Dark mode defaults for Chart.js ──
if (typeof Chart !== 'undefined') {
  Chart.defaults.color                                = '#9090B8';
  Chart.defaults.borderColor                         = 'rgba(255,255,255,0.07)';
  Chart.defaults.plugins.legend.labels.color         = '#9090B8';
  Chart.defaults.plugins.tooltip.backgroundColor     = '#1E1E32';
  Chart.defaults.plugins.tooltip.titleColor          = '#EEEEFF';
  Chart.defaults.plugins.tooltip.bodyColor           = '#9090B8';
  Chart.defaults.plugins.tooltip.borderColor         = 'rgba(255,255,255,0.13)';
  Chart.defaults.plugins.tooltip.borderWidth         = 1;
  Chart.defaults.plugins.tooltip.padding             = 10;
  Chart.defaults.plugins.tooltip.cornerRadius        = 8;
  Chart.defaults.scale.grid.color                    = 'rgba(255,255,255,0.06)';
  Chart.defaults.scale.ticks.color                   = '#6868A0';
  Chart.defaults.scale.ticks.backdropColor           = 'transparent';
  Chart.defaults.scale.title.color                   = '#9090B8';
}

var _charts = {};

window.GAILS.makeChart = function(id, config) {
  if (_charts[id]) _charts[id].destroy();
  var el = document.getElementById(id);
  if (!el) return;
  _charts[id] = new Chart(el, config);
};

window.GAILS.getChart = function(id) { return _charts[id]; };
window.GAILS.destroyChart = function(id) { if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; } };
window.GAILS.resizeChartsIn = function(container) {
  if (!container) return;
  Array.from(container.querySelectorAll('canvas[id]')).forEach(function(canvas) {
    var chart = _charts[canvas.id];
    if (chart) chart.resize();
  });
};

// ========== RENDER OVERVIEW CHARTS ==========
window.GAILS.renderOverviewCharts = function(data) {
  var G = GAILS;
  var avg = G.avg;
  var n = data.length;

  // NPS Histogram
  var bins = []; for (var i = -10; i <= 100; i += 10) bins.push({ min: i, max: i + 10, count: 0 });
  data.forEach(function(b) { var idx = bins.findIndex(function(bn) { return b.n >= bn.min && b.n < bn.max; }); if (idx >= 0) bins[idx].count++; });
  G.makeChart('npsHist', { type: 'bar', data: { labels: bins.map(function(b) { return b.min + '\u2013' + b.max; }), datasets: [{ data: bins.map(function(b) { return b.count; }), backgroundColor: 'rgba(255,59,92,0.5)', hoverBackgroundColor: '#FF3B5C', borderRadius: 6 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Bakeries' } }, x: { title: { display: true, text: 'NPS' } } }, onHover: function(evt, elements) { evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'; }, onClick: function(evt, elements) { if (elements.length > 0) { var idx = elements[0].index; var bin = bins[idx]; var bakeries = data.filter(function(b) { return b.n >= bin.min && b.n < bin.max; }); if (bakeries.length > 0) { G.showDrillDown('NPS ' + bin.min + '\u2013' + bin.max, bakeries.length + ' bakeries in this segment', bakeries, 'nps'); } } } } });

  // CEI Bands
  var bandCounts = G.BAND_NAMES.map(function(bn) { return data.filter(function(d) { return d.cb === bn; }).length; });
  G.makeChart('ceiBands', { type: 'doughnut', data: { labels: G.BAND_NAMES, datasets: [{ data: bandCounts, backgroundColor: G.BAND_NAMES.map(function(bn) { return G.COL[bn]; }), borderWidth: 2, borderColor: 'rgba(24,24,40,0.6)' }] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, onClick: function(evt, elements) { if (elements.length > 0) { var idx = elements[0].index; var band = G.BAND_NAMES[idx]; var bakeries = data.filter(function(d) { return d.cb === band; }); G.showDrillDown(band, bakeries.length + ' bakeries in this band', bakeries, 'relative'); } } } });

  // NPS vs CEI
  G.makeChart('npsVsCei', { type: 'scatter', data: { datasets: [{ data: data.map(function(b) { return { x: b.c, y: b.n }; }), backgroundColor: data.map(function(b) { return G.COL[b.cb] + '99'; }), borderColor: data.map(function(b) { return G.COL[b.cb]; }), borderWidth: 1, pointRadius: 4.5, pointHitRadius: 12, pointHoverRadius: 7 }] }, options: { interaction: { mode: 'nearest', intersect: true }, plugins: { legend: { display: false }, tooltip: { callbacks: { title: function(items) { return data[items[0].dataIndex].b; }, label: function(ctx) { var b = data[ctx.dataIndex]; return ['CEI: ' + b.c + ' (' + b.cb + ')', 'NPS: ' + b.n, 'Abs CEI: ' + b.ac, 'Vol: ' + b.v + ' (' + b.co + ' confidence)']; } } } }, scales: { x: { title: { display: true, text: 'CEI' }, min: 0, max: 100 }, y: { title: { display: true, text: 'NPS' }, min: -15, max: 105 } } } });

  // CX Radar
  var exc = data.filter(function(b) { return b.cb === 'Excellent'; });
  var na = data.filter(function(b) { return b.cb === 'Needs Attention'; });
  var gd = data.filter(function(b) { return b.cb === 'Good'; });
  if (exc.length && na.length && gd.length) {
    G.makeChart('cxRadar', {
      type: 'radar', data: {
        labels: ['Overall', 'Friendliness', 'Quality', 'Overall Efficiency'], datasets: [
          { label: 'Excellent', data: [avg(exc, 'ov'), avg(exc, 'fr'), avg(exc, 'dr'), avg(exc, 'ef')], borderColor: G.COL.Excellent, backgroundColor: G.COL.Excellent + '33', borderWidth: 2 },
          { label: 'Good', data: [avg(gd, 'ov'), avg(gd, 'fr'), avg(gd, 'dr'), avg(gd, 'ef')], borderColor: G.COL.Good, backgroundColor: G.COL.Good + '22', borderWidth: 2 },
          { label: 'Needs Attention', data: [avg(na, 'ov'), avg(na, 'fr'), avg(na, 'dr'), avg(na, 'ef')], borderColor: G.COL['Needs Attention'], backgroundColor: G.COL['Needs Attention'] + '33', borderWidth: 2 }
        ]
      }, options: { scales: { r: { min: 40, max: 100, ticks: { stepSize: 10 } } }, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } }
    });
  }

  // Absolute CEI Bands
  var absBandCounts = G.ABS_BAND_NAMES.map(function(bn) { return data.filter(function(d) { return d.acb === bn; }).length; });
  G.makeChart('absCeiBands', { type: 'doughnut', data: { labels: G.ABS_BAND_NAMES, datasets: [{ data: absBandCounts, backgroundColor: G.ABS_BAND_NAMES.map(function(bn) { return G.ABSCOL[bn]; }), borderWidth: 2, borderColor: 'rgba(24,24,40,0.6)' }] }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, onClick: function(evt, elements) { if (elements.length > 0) { var idx = elements[0].index; var band = G.ABS_BAND_NAMES[idx]; var bakeries = data.filter(function(d) { return d.acb === band; }); G.showDrillDown(band, bakeries.length + ' bakeries in this band', bakeries, 'absolute'); } } } });

  // Absolute CEI component drag
  var absCompScores = {
    ef: data.map(function(b) { return G.computeAbsoluteComponent(b.ef, G.BENCHMARKS.ef); }),
    dr: data.map(function(b) { return G.computeAbsoluteComponent(b.dr, G.BENCHMARKS.dr); }),
    fr: data.map(function(b) { return G.computeAbsoluteComponent(b.fr, G.BENCHMARKS.fr); }),
    ts: data.map(function(b) { return G.computeAbsoluteComponent(b.ts, G.BENCHMARKS.time); }),
  };
  var absCompAvgs = [
    { name: 'Overall Efficiency', avg: absCompScores.ef.reduce(function(a, v) { return a + v; }, 0) / n, raw: avg(data, 'ef'), col: '#00C875' },
    { name: 'Drink Quality', avg: absCompScores.dr.reduce(function(a, v) { return a + v; }, 0) / n, raw: avg(data, 'dr'), col: '#4895FF' },
    { name: 'Friendliness', avg: absCompScores.fr.reduce(function(a, v) { return a + v; }, 0) / n, raw: avg(data, 'fr'), col: '#FFB800' },
    { name: 'Barista Speed', avg: absCompScores.ts.reduce(function(a, v) { return a + v; }, 0) / n, raw: avg(data, 'ts'), col: '#9B5DFF' },
  ].sort(function(a, b) { return a.avg - b.avg; });
  G.makeChart('absComponentDrag', {
    type: 'bar',
    data: { labels: absCompAvgs.map(function(c) { return c.name; }), datasets: [{ label: 'Avg Absolute Score', data: absCompAvgs.map(function(c) { return Math.round(c.avg * 10) / 10; }), backgroundColor: absCompAvgs.map(function(c) { return c.avg >= 90 ? 'rgba(0,200,117,0.55)' : c.avg >= 60 ? 'rgba(255,184,0,0.55)' : 'rgba(255,59,92,0.55)'; }), borderColor: absCompAvgs.map(function(c) { return c.avg >= 90 ? '#00C875' : c.avg >= 60 ? '#FFB800' : '#FF3B5C'; }), borderWidth: 2, borderRadius: 6 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { var c = absCompAvgs[ctx.dataIndex]; return 'Abs score: ' + ctx.raw + ' (raw avg: ' + c.raw.toFixed(1) + '% vs 90% target)'; } } } }, scales: { x: { min: 0, max: 100, title: { display: true, text: 'Absolute Component Score (100 = at target)' }, grid: { color: function(ctx) { return ctx.tick.value === 100 ? 'rgba(0,200,117,0.3)' : 'rgba(255,255,255,0.06)'; } } }, y: { ticks: { font: { size: 12, weight: 'bold' } } } } }
  });

  // Top 10 & Bottom 10
  var top10 = data.slice(0, 10);
  var bot10 = data.slice(-10).reverse();
  var tbOpts = function(items) {
    return { type: 'bar', data: { labels: items.map(function(b) { return b.b; }), datasets: [{ data: items.map(function(b) { return b.c; }), backgroundColor: items.map(function(b) { return G.COL[b.cb]; }), borderRadius: 4 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(ctx) { return 'CEI: ' + ctx.raw; } } } }, scales: { x: { min: 0, max: 100, title: { display: true, text: 'CEI' } }, y: { ticks: { font: { size: 11, weight: '500' }, autoSkip: false } } } } };
  };
  G.makeChart('top10Chart', tbOpts(top10));
  G.makeChart('bot10Chart', tbOpts(bot10));
};

// ========== RENDER TREND CHARTS ==========
window.GAILS.renderTrendCharts = function(data) {
  var G = GAILS;
  var avg = G.avg;
  var state = G.state;
  var RM = G.getRollingMonths();

  var trendNPS = RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? mr.reduce(function(a, r) { return a + r.n; }, 0) / mr.length : null; });
  G.makeChart('trendNPS', { type: 'line', data: { labels: RM, datasets: [{ data: trendNPS, borderColor: G.COL.Excellent, backgroundColor: G.COL.Excellent + '22', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Avg NPS' } } } } });

  var trendKeys = [{ k: 'dr', l: 'Quality', c: '#4895FF' }, { k: 'ef', l: 'Overall Efficiency', c: '#00C875' }, { k: 'fr', l: 'Friendliness', c: '#FFB800' }, { k: 'ov', l: 'Overall', c: '#9B5DFF' }];
  G.makeChart('trendCX', { type: 'line', data: { labels: RM, datasets: trendKeys.map(function(tk) { return { label: tk.l, data: RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? mr.reduce(function(a, r) { return a + r[tk.k]; }, 0) / mr.length : null; }), borderColor: tk.c, tension: 0.3, pointRadius: 3, borderWidth: 2 }; }) }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { title: { display: true, text: 'Score %' } } } } });

  // Absolute CEI band distribution over time
  var absBandDs = G.ABS_BAND_NAMES.map(function(bn) { return { label: bn, data: RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? mr.filter(function(r) { return r.acb === bn; }).length / mr.length * 100 : 0; }), backgroundColor: G.ABSCOL[bn] + 'cc', borderColor: G.ABSCOL[bn], borderWidth: 1 }; });
  G.makeChart('trendAbsBands', { type: 'bar', data: { labels: RM, datasets: absBandDs }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '% of Bakeries' }, max: 100 } } } });

  // Beverage delivery time trend
  var trendTS = RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? mr.reduce(function(a, r) { return a + r.ts; }, 0) / mr.length : null; });
  G.makeChart('trendTimeliness', { type: 'line', data: { labels: RM, datasets: [{ label: 'Avg Barista Speed', data: trendTS, borderColor: '#9B5DFF', backgroundColor: 'rgba(155,93,255,0.13)', fill: true, tension: 0.3, pointRadius: 4, borderWidth: 2.5 }] }, options: { plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: 'Barista Speed (0-100)' }, min: 0, max: 100 } } } });

  // Band trend
  var bandDs = G.BAND_NAMES.map(function(bn) { return { label: bn, data: RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? mr.filter(function(r) { return r.cb === bn; }).length / mr.length * 100 : 0; }), backgroundColor: G.COL[bn] + 'cc', borderColor: G.COL[bn], borderWidth: 1 }; });
  G.makeChart('trendBands', { type: 'bar', data: { labels: RM, datasets: bandDs }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '% of Bakeries' }, max: 100 } } } });

  // Speed trend
  G.makeChart('trendSpeed', {
    type: 'line', data: {
      labels: RM, datasets: [
        { label: 'Avg Within 2 Min %', data: RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? avg(mr, 's2') : null; }), borderColor: '#4895FF', tension: 0.3, pointRadius: 3, borderWidth: 2 },
        { label: 'Avg Over 5 Min %', data: RM.map(function(m) { var mr = state.ALL.filter(function(r) { return r.m === m; }); return mr.length ? avg(mr, 'o5') : null; }), borderColor: '#FF3B5C', tension: 0.3, pointRadius: 3, borderWidth: 2, yAxisID: 'y2' }
      ]
    }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, scales: { y: { title: { display: true, text: 'Within 2 Min %' }, position: 'left' }, y2: { title: { display: true, text: 'Over 5 Min %' }, position: 'right', grid: { drawOnChartArea: false } } } }
  });

  // Bakery tracker
  (function renderBakeryTracker() {
    var trackerStatusEl = document.getElementById('bakeryTrackerStatus');
    var trackerCanvas = document.getElementById('bakeryTracker');
    var trackerTableEl = document.getElementById('bakeryTrackerTable');
    var selectedBakeries = Array.isArray(state.searchBakery) ? state.searchBakery.slice() : [];
    var scopedRows = state.ALL.filter(function(r) {
      if (state.regionFilter && G.getBakeryRegion(r.b) !== state.regionFilter) return false;
      if (state.opsFilter && G.getBakeryOps(r.b) !== state.opsFilter) return false;
      if (state.bandFilter && r.cb !== state.bandFilter) return false;
      if (selectedBakeries.length && selectedBakeries.indexOf(r.b) === -1) return false;
      return true;
    });
    var benchmarkRows = state.ALL.filter(function(r) {
      if (state.regionFilter && G.getBakeryRegion(r.b) !== state.regionFilter) return false;
      if (state.opsFilter && G.getBakeryOps(r.b) !== state.opsFilter) return false;
      if (state.bandFilter && r.cb !== state.bandFilter) return false;
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
    var trackerRows = RM.map(function(m) {
      var scopedMonthRows = scopedRows.filter(function(r) { return r.m === m; });
      var benchmarkMonthRows = benchmarkRows.filter(function(r) { return r.m === m; });
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
        v: Math.round(scopedMonthRows.reduce(function(total, row) { return total + row.v; }, 0)),
        benchmarkNps: benchmarkMonthRows.length ? round1(avg(benchmarkMonthRows, 'n')) : null
      };
    });
    var trackerNps = trackerRows.map(function(row) { return row.n; });
    var trackerCei = trackerRows.map(function(row) { return row.c; });
    var trackerAbsCei = trackerRows.map(function(row) { return row.ac; });
    var benchmarkNps = selectedBakeries.length
      ? trackerRows.map(function(row) { return row.benchmarkNps; })
      : null;
    var trackerTableRows = trackerRows.filter(function(row) {
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
        ? 'Actual monthly datapoints for ' + scopeLabel + ', with all-bakeries average NPS shown for context.'
        : selectedBakeries.length
          ? 'Monthly average scores across the selected bakeries, with all-bakeries average NPS shown for context.'
          : 'Monthly average scores across every bakery in the current filter scope.';
      trackerTableEl.innerHTML = trackerTableRows.length
        ? '<div class="tracker-table-header" data-table-fullscreen-anchor="true"><div class="tracker-table-header__content"><h3 class="tracker-table-header__title">'
          + tableTitle
          + '</h3><p class="tracker-table-header__copy">'
          + tableDescription
          + '</p></div></div><div class="table-wrap"><table><thead><tr><th>Month</th><th>NPS</th><th>Relative CEI</th><th>Absolute CEI</th><th>Responses</th>' + (selectedBakeries.length ? '<th>All Bakeries Avg NPS</th>' : '') + '</tr></thead><tbody>' +
          trackerTableRows.map(function(row) {
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
          { label: scopeLabel + (isSingleBakery ? ' NPS' : ' Avg NPS'), data: trackerNps, borderColor: G.COL.Excellent, tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
          { label: scopeLabel + (isSingleBakery ? ' Relative CEI' : ' Avg Relative CEI'), data: trackerCei, borderColor: '#4895FF', tension: 0.3, pointRadius: 4, borderWidth: 2.5 },
          { label: scopeLabel + (isSingleBakery ? ' Absolute CEI' : ' Avg Absolute CEI'), data: trackerAbsCei, borderColor: '#9B5DFF', tension: 0.3, pointRadius: 4, borderWidth: 2, borderDash: [6, 3] }
        ].concat(selectedBakeries.length ? [
          { label: 'All Bakeries Avg NPS', data: benchmarkNps, borderColor: 'rgba(150,150,200,0.5)', borderDash: [5, 5], tension: 0.3, pointRadius: 0, borderWidth: 1.5 }
        ] : [])
      }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }, scales: { y: { title: { display: true, text: 'Score' }, min: 0, max: 110 } } }
    });
  }());

  return { RM: RM, trendNPS: trendNPS };
};

// ========== RENDER SPEED vs NPS CHARTS ==========
window.GAILS.renderSpeedCharts = function(data) {
  var G = GAILS;
  var avg = G.avg;
  var n = data.length;

  var xSm = avg(data, 's2'), ySm = avg(data, 'n');
  var sNum = 0, sDen = 0; data.forEach(function(b) { sNum += (b.s2 - xSm) * (b.n - ySm); sDen += (b.s2 - xSm) ** 2; });
  var sSlope = sDen ? sNum / sDen : 0, sInt = ySm - sSlope * xSm;
  G.makeChart('speedVsNps', {
    type: 'scatter', data: {
      datasets: [
        { data: data.map(function(b) { return { x: b.s2, y: b.n }; }), backgroundColor: 'rgba(255,59,92,0.35)', borderColor: 'rgba(255,59,92,0.2)', pointRadius: 3.5, borderWidth: 1 },
        { type: 'line', data: [{ x: 35, y: sSlope * 35 + sInt }, { x: 95, y: sSlope * 95 + sInt }], borderColor: '#FF3B5C', borderWidth: 2.5, borderDash: [6, 4], pointRadius: 0 }
      ]
    }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(_, ctx) { if (ctx.datasetIndex === 1) return ''; var b = data[ctx.dataIndex]; return b.b + ': ' + b.s2 + '%, NPS ' + b.n; } } } }, scales: { x: { title: { display: true, text: 'Coffee Speed (% within 2 min)', font: { weight: 'bold' } }, min: 35, max: 95 }, y: { title: { display: true, text: 'NPS', font: { weight: 'bold' } }, min: -15, max: 105 } } }
  });

  var xEm = avg(data, 'ef');
  var eNum = 0, eDen = 0; data.forEach(function(b) { eNum += (b.ef - xEm) * (b.n - ySm); eDen += (b.ef - xEm) ** 2; });
  var eSlope = eDen ? eNum / eDen : 0, eInt = ySm - eSlope * xEm;
  G.makeChart('effVsNps', {
    type: 'scatter', data: {
      datasets: [
        { data: data.map(function(b) { return { x: b.ef, y: b.n }; }), backgroundColor: 'rgba(0,200,117,0.3)', borderColor: 'rgba(0,200,117,0.15)', pointRadius: 3.5, borderWidth: 1 },
        { type: 'line', data: [{ x: 35, y: eSlope * 35 + eInt }, { x: 102, y: eSlope * 102 + eInt }], borderColor: '#00C875', borderWidth: 2.5, pointRadius: 0 }
      ]
    }, options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(_, ctx) { if (ctx.datasetIndex === 1) return ''; var b = data[ctx.dataIndex]; return b.b + ': ' + b.ef + '%, NPS ' + b.n; } } } }, scales: { x: { title: { display: true, text: 'Customer-Rated Overall Efficiency %', font: { weight: 'bold' } }, min: 35, max: 102 }, y: { title: { display: true, text: 'NPS', font: { weight: 'bold' } }, min: -15, max: 105 } } }
  });

  // Quartile compare
  var bySpd = [].concat(data).sort(function(a, b) { return a.s2 - b.s2; });
  var byEff = [].concat(data).sort(function(a, b) { return a.ef - b.ef; });
  var q = Math.floor(n / 4);
  var sqNPS = [bySpd.slice(0, q), bySpd.slice(q, 2 * q), bySpd.slice(2 * q, 3 * q), bySpd.slice(3 * q)].map(function(g) { return avg(g, 'n'); });
  var eqNPS = [byEff.slice(0, q), byEff.slice(q, 2 * q), byEff.slice(2 * q, 3 * q), byEff.slice(3 * q)].map(function(g) { return avg(g, 'n'); });
  G.makeChart('quartileCompare', {
    type: 'bar', data: {
      labels: ['Lowest 25%', 'Below Avg', 'Above Avg', 'Highest 25%'], datasets: [
        { label: 'By Coffee Speed', data: sqNPS, backgroundColor: 'rgba(255,59,92,0.28)', borderColor: '#FF3B5C', borderWidth: 2, borderRadius: 6 },
        { label: 'By Cust. Efficiency', data: eqNPS, backgroundColor: 'rgba(0,200,117,0.28)', borderColor: '#00C875', borderWidth: 2, borderRadius: 6 }
      ]
    }, options: { plugins: { legend: { position: 'bottom', labels: { font: { size: 11, weight: 'bold' } } } }, scales: { y: { title: { display: true, text: 'Avg NPS', font: { weight: 'bold' } }, min: 0, max: 90 }, x: { title: { display: true, text: 'Quartile (worst \u2192 best)', font: { weight: 'bold' } } } } }
  });

  document.getElementById('speedGapVal').textContent = Math.round(Math.abs(sqNPS[3] - sqNPS[0])) + ' pts';
  document.getElementById('effGapVal').textContent = Math.round(Math.abs(eqNPS[3] - eqNPS[0])) + ' pts';

  // R² comparison
  var corr = function(k) { var xm = avg(data, k), ym = avg(data, 'n'); var num = 0, xd = 0, yd = 0; data.forEach(function(b) { num += (b[k] - xm) * (b.n - ym); xd += (b[k] - xm) ** 2; yd += (b.n - ym) ** 2; }); return xd && yd ? (num * num) / (xd * yd) * 100 : 0; };
  var metrics = [
    { name: 'Within 2 min', r2: corr('s2'), t: 'speed' }, { name: 'Within 3 min', r2: corr('s3'), t: 'speed' },
    { name: 'Over 5 min', r2: corr('o5'), t: 'speed' }, { name: 'Barista Speed', r2: corr('ts'), t: 'speed' },
    { name: 'Friendliness', r2: corr('fr'), t: 'cx' }, { name: 'Drink Quality', r2: corr('dr'), t: 'cx' },
    { name: 'Overall Efficiency', r2: corr('ef'), t: 'cx' }, { name: 'Overall CX', r2: corr('ov'), t: 'cx' }
  ];
  metrics.sort(function(a, b) { return a.r2 - b.r2; });
  G.makeChart('corrCompare', { type: 'bar', data: { labels: metrics.map(function(m) { return m.name; }), datasets: [{ data: metrics.map(function(m) { return Math.round(m.r2 * 10) / 10; }), backgroundColor: metrics.map(function(m) { return m.t === 'speed' ? 'rgba(255,59,92,0.42)' : 'rgba(0,200,117,0.42)'; }), borderColor: metrics.map(function(m) { return m.t === 'speed' ? '#FF3B5C' : '#00C875'; }), borderWidth: 2, borderRadius: 5 }] }, options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: function(c) { return c.raw + '% of NPS explained'; } } } }, scales: { x: { title: { display: true, text: '% of NPS Variance Explained (R\u00B2)', font: { weight: 'bold' } }, min: 0 }, y: { ticks: { font: { size: 11, weight: 'bold' } } } } } });
};
